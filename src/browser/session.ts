import { debounce } from "../utils";
import { generateUUID, createLogger } from "../utils";

/**
 * Creates a session manager that handles session data and persistence
 */
export function createSessionManager(
  // Dependencias externas requeridas
  storage: {
    saveSession: (session: Record<string, any>) => void;
    loadSession: () => { data: Record<string, any>; isNew: boolean };
  },
  queue: {
    push: (event: any) => void;
    save: () => void;
    findAndUpdateEvent: (type: string, data: Record<string, any>) => boolean;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Estado actual de la sesión
  let session: Record<string, any> = { id: generateUUID() };

  // Flag para rastrear si hay un evento de sesión pendiente en la cola
  let pendingSessionUpdate = false;

  // Buffer para acumular datos de sesión antes de enviarlos
  let sessionBuffer: Record<string, any> = {};

  // Cargar sesión desde almacenamiento
  const loadSession = () => {
    const { data, isNew } = storage.loadSession();

    if (Object.keys(data).length > 0) {
      session = data;
      logger.debug("Session loaded from storage", { id: session.id });
    } else {
      session = {
        id: generateUUID(),
        startedAt: Date.now(),
      };
      saveSession();
      logger.info("New session created", { id: session.id });
    }

    // Enviar evento de sesión al servidor
    queue.push({
      type: "session",
      isNewSession: isNew,
      sessionData: session,
    });
    pendingSessionUpdate = true;
    queue.save();
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

      // Actualizar sesión con datos acumulados
      session = { ...session, ...sessionBuffer };
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
        // Solo añadir si no existe un evento de sesión
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
  }, 1000); // Debounce por 1 segundo para agrupar actualizaciones

  // Actualizar datos de sesión
  const updateSession = (properties: Record<string, any> = {}) => {
    logger.info("Updating session data", {
      properties: Object.keys(properties),
    });

    // Añadir propiedades al buffer en lugar de directamente a la sesión
    sessionBuffer = { ...sessionBuffer, ...properties };

    // Programar vaciado del buffer
    flushSessionBuffer();

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
