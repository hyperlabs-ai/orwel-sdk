import { debounce } from "../utils";
import { generateUUID, createLogger, sanitizeData, extractUTMs, getAttribution } from "../utils";
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

    // Capture client timezone for temporal personality analysis
    try {
      session.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_) {}

    // Extract UTM parameters for new sessions
    if (isNewSessionInstance) {
      const utms = extractUTMs();
      if (utms) {
        session.utm = utms;
        logger.info("UTM parameters captured", utms);
      }
    }

    // Record first/last-touch attribution on every load so first_touch persists
    // across sessions even when the converting session has no UTMs.
    getAttribution();

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
  const flushSessionBuffer = () => {
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
  };

  const debouncedFlush = debounce(flushSessionBuffer, 1000);

  // Actualizar datos de sesión
  const updateSession = (properties: Partial<Session> = {}, isFinalUpdate: boolean = false) => {
    logger.info("Updating session data", {
      properties: Object.keys(properties),
      isFinalUpdate
    });
    
    // Create a copy of properties to avoid mutating the input parameter
    const updatedProperties = { ...properties };
    
    // Automatically set finishedAt when status is set to closed
    if (updatedProperties.status === 'closed' && !updatedProperties.finishedAt) {
      updatedProperties.finishedAt = new Date().toISOString();
      logger.debug("Automatically setting finishedAt timestamp for closed session", { 
        finishedAt: updatedProperties.finishedAt 
      });
    }
    
    // Always update the buffer first to prevent data loss
    sessionBuffer = { ...sessionBuffer, ...updatedProperties };
    
    if (isFinalUpdate) {
      // For final updates, flush the buffer immediately to include all pending changes
      flushSessionBuffer();
      logger.success("Final session update applied immediately", { id: session.id });
    } else {
      // For regular updates, use the debounced flush
      debouncedFlush();
      logger.success("Session data queued for update", { id: session.id });
    }
    
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
