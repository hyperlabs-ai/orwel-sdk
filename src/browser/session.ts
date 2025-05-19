import { debounce } from "../utils";
import { generateUUID, createLogger, sanitizeData } from "../utils";
import { Session } from "../types";

/**
 * Creates a session manager that handles session data and persistence
 */
export function createSessionManager(
  // Dependencias externas requeridas
  storage: {
    saveSession: (session: Session) => void;
    loadSession: () => { data: Session; isNew: boolean };
  },
  queue: {
    push: (event: any) => void;
    save: () => void;
    findAndUpdateEvent: (type: string, data: Record<string, any>) => boolean;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Estado actual de la sesión
  let session: Session = {
    id: generateUUID(),
    status: 'active',
    startedAt: new Date().toISOString()
  };

  // Flag para rastrear si hay un evento de sesión pendiente en la cola
  let pendingSessionUpdate = false;

  // Buffer para acumular datos de sesión antes de enviarlos
  let sessionBuffer: Partial<Session> = {};

  // Cargar sesión desde almacenamiento
  const loadSession = () => {
    const { data, isNew: isNewFromStorage } = storage.loadSession();
    let isNewSessionInstance = false;

    if (Object.keys(data).length > 0) {
      session = data;
      if (session.status === 'closed') {
        session = {
          id: generateUUID(),
          status: 'active',
          startedAt: new Date().toISOString()
        };
        logger.info("Previous session was closed, creating new session", { id: session.id });
        isNewSessionInstance = true;
      } else {
        logger.debug("Session loaded from storage", { id: session.id });
        queue.push({
          type: "session",
          isNewSession: false,
          sessionData: { ...session },
        });
        pendingSessionUpdate = true;
        queue.save();
      }
    } else {
      session = {
        id: generateUUID(),
        status: 'active',
        startedAt: new Date().toISOString()
      };
      logger.info("New session created", { id: session.id });
      isNewSessionInstance = true;
    }

    if (isNewSessionInstance || !session.location) {
      session.location = {
        path: window.location.pathname,
        url: window.location.href,
        hash: window.location.hash,
        search: window.location.search,
        hostname: window.location.hostname
      };
    }

    saveSession();
    
    return { session, isNewSession: isNewSessionInstance || isNewFromStorage };
  };

  // Guardar sesión en almacenamiento
  const saveSession = () => {
    try {
      storage.saveSession(session);
      logger.debug("Session saved to storage", { id: session.id });
    } catch (error) {
      logger.error("Failed to save session to storage", error);
    }
  };

  // Función para enviar datos de sesión acumulados
  const flushSessionBuffer = debounce(() => {
    if (Object.keys(sessionBuffer).length > 0) {
      logger.debug("Flushing session buffer", {
        properties: Object.keys(sessionBuffer),
      });

      // Actualizar sesión con datos acumulados y timestamp
      session = {
        ...session,
        ...sessionBuffer,
        updatedAt: new Date().toISOString()
      };
      saveSession();

      // Buscar y actualizar evento de sesión existente o añadir uno nuevo
      const updated = queue.findAndUpdateEvent("session", {
        type: "session",
        isNewSession: false,
        sessionData: { ...session },
      });

      if (updated) {
        logger.debug("Updated existing session event in queue");
      } else {
        queue.push({
          type: "session",
          isNewSession: false,
          sessionData: { ...session },
        });
        logger.debug("Added new session event to queue");
      }

      pendingSessionUpdate = true;
      queue.save();

      // Limpiar el buffer
      sessionBuffer = {};
    }
  }, 1000);

  // Actualizar datos de sesión
  const updateSession = (properties: Partial<Session> = {}, isFinalUpdate: boolean = false) => {
    logger.info("Updating session data", {
      properties: Object.keys(properties),
      isFinalUpdate
    });

    // Si estamos cerrando la sesión, asegurarnos de que tenga todos los campos necesarios
    if (properties.status === 'closed') {
      properties.finishedAt = properties.finishedAt || new Date().toISOString();
    }

    // For final updates, update session directly without using buffer
    if (isFinalUpdate) {
      session = {
        ...session,
        ...properties,
        updatedAt: new Date().toISOString()
      };
      saveSession();
      return { success: true, sessionId: session.id };
    }

    // Añadir propiedades al buffer
    sessionBuffer = { ...sessionBuffer, ...properties };

    // Si es un cierre de sesión, forzar flush inmediato
    if (properties.status === 'closed') {
      flushSessionBuffer();
    } else {
      flushSessionBuffer();
    }

    logger.success("Session data queued for update", { id: session.id });
    return { success: true, sessionId: session.id };
  };

  return {
    loadSession,
    saveSession,
    updateSession,
    flushSessionBuffer,
    getSession: () => session,
    setPendingUpdate: (isPending: boolean) => {
      pendingSessionUpdate = isPending;
    },
    hasPendingUpdate: () => pendingSessionUpdate,
  };
}
