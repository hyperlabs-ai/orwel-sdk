import { OrwelEvent, Visitor, Session } from "../types";
import { createLogger } from "../utils";

/**
 * Creates a storage manager for handling browser persistence
 */
export function createStorage(
  logger: ReturnType<typeof createLogger>,
  keys = {
    QUEUE: "__orwel_queue__",
    VISITOR: "__orwel_visitor__",
    SESSION: "__orwel_session__"
  }
) {
  // Check if localStorage is actually available
  const isStorageAvailable = () => {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Memory fallback when localStorage is not available
  const memoryStorage: Record<string, string> = {};

  // Storage wrapper that handles fallback
  const getItem = (key: string): string | null => {
    try {
      if (isStorageAvailable()) {
        return localStorage.getItem(key);
      }
      return memoryStorage[key] || null;
    } catch (e) {
      return memoryStorage[key] || null;
    }
  };

  const setItem = (key: string, value: string): void => {
    try {
      if (isStorageAvailable()) {
        localStorage.setItem(key, value);
      } else {
        memoryStorage[key] = value;
      }
    } catch (e) {
      memoryStorage[key] = value;
    }
  };

  // Cargar la cola desde localStorage
  const loadQueue = (): OrwelEvent[] => {
    try {
      const saved = getItem(keys.QUEUE);
      const events = saved ? JSON.parse(saved) : [];
      logger.debug("Queue loaded from storage", { count: events.length });
      return events;
    } catch (error) {
      logger.error("Failed to load queue from storage", error);
      return [];
    }
  };

  // Guardar la cola en localStorage
  const saveQueue = (queue: OrwelEvent[]): void => {
    try {
      setItem(keys.QUEUE, JSON.stringify(queue));
      logger.debug("Queue saved to storage", { count: queue.length });
    } catch (error) {
      logger.error("Failed to save queue to storage", error);
    }
  };

  // Cargar el visitante desde localStorage
  const loadVisitor = (): Visitor => {
    try {
      const saved = getItem(keys.VISITOR);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      logger.error("Failed to load visitor from storage", error);
      return {};
    }
  };

  // Guardar el visitante en localStorage
  const saveVisitor = (visitor: Visitor): void => {
    try {
      setItem(keys.VISITOR, JSON.stringify(visitor));
      logger.debug("Visitor saved to storage", { id: visitor.id });
    } catch (error) {
      logger.error("Failed to save visitor to storage", error);
    }
  };

  // Cargar la sesión desde localStorage
  const loadSession = (): { data: Session; isNew: boolean } => {
    try {
      const saved = getItem(keys.SESSION);
      if (saved) {
        const parsedSession = JSON.parse(saved) as Session;
        logger.debug("Session loaded from storage");
        return { data: parsedSession, isNew: false };
      }
    } catch (error) {
      logger.warning("Failed to load session from storage", error);
    }
    
    return { data: {} as Session, isNew: true };
  };

  // Guardar la sesión en localStorage
  const saveSession = (session: Session): void => {
    try {
      setItem(keys.SESSION, JSON.stringify(session));
      logger.debug("Session saved to storage", { id: session.id });
    } catch (error) {
      logger.error("Failed to save session to storage", error);
    }
  };

  return {
    loadQueue,
    saveQueue,
    loadVisitor,
    saveVisitor,
    loadSession,
    saveSession
  };
} 