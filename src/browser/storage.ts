import { OrwelEvent, Visitor, Session } from "../types";
import { createLogger } from "../utils";
import { encrypt, decrypt, encryptObject, decryptObject, isEncrypted } from "../utils/encryption";

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

  // Cargar la cola desde localStorage con soporte para encriptación
  const loadQueue = async (): Promise<OrwelEvent[]> => {
    try {
      const saved = getItem(keys.QUEUE);
      if (!saved) {
        logger.debug("No queue found in storage");
        return [];
      }
      
      // Verificar si los datos están encriptados
      if (isEncrypted(saved)) {
        const decrypted = await decrypt(saved);
        if (!decrypted) {
          logger.error("Failed to decrypt queue from storage");
          return [];
        }
        const events = JSON.parse(decrypted);
        logger.debug("Queue loaded and decrypted from storage", { count: events.length });
        return events;
      } else {
        // Datos no encriptados (compatibilidad con versiones anteriores)
        const events = JSON.parse(saved);
        logger.debug("Queue loaded from storage (unencrypted)", { count: events.length });
        return events;
      }
    } catch (error) {
      logger.error("Failed to load queue from storage", error);
      return [];
    }
  };

  // Guardar la cola en localStorage con encriptación
  const saveQueue = async (queue: OrwelEvent[]): Promise<void> => {
    try {
      const jsonString = JSON.stringify(queue);
      const encrypted = await encrypt(jsonString);
      
      if (encrypted) {
        setItem(keys.QUEUE, encrypted);
        logger.debug("Queue encrypted and saved to storage", { count: queue.length });
      } else {
        // Fallback sin encriptación si falla
        setItem(keys.QUEUE, jsonString);
        logger.warning("Queue saved to storage without encryption", { count: queue.length });
      }
    } catch (error) {
      logger.error("Failed to save queue to storage", error);
    }
  };

  // Cargar el visitante desde localStorage con soporte para encriptación
  const loadVisitor = async (): Promise<Visitor> => {
    try {
      const saved = getItem(keys.VISITOR);
      if (!saved) {
        return {};
      }
      
      // Verificar si los datos están encriptados
      if (isEncrypted(saved)) {
        const decrypted = await decrypt(saved);
        if (!decrypted) {
          logger.error("Failed to decrypt visitor from storage");
          return {};
        }
        const visitor = JSON.parse(decrypted);
        logger.debug("Visitor loaded and decrypted from storage", { id: visitor.id });
        return visitor;
      } else {
        // Datos no encriptados (compatibilidad con versiones anteriores)
        const visitor = JSON.parse(saved);
        logger.debug("Visitor loaded from storage (unencrypted)", { id: visitor.id });
        return visitor;
      }
    } catch (error) {
      logger.error("Failed to load visitor from storage", error);
      return {};
    }
  };

  // Guardar el visitante en localStorage con encriptación
  const saveVisitor = async (visitor: Visitor): Promise<void> => {
    try {
      const jsonString = JSON.stringify(visitor);
      const encrypted = await encrypt(jsonString);
      
      if (encrypted) {
        setItem(keys.VISITOR, encrypted);
        logger.debug("Visitor encrypted and saved to storage", { id: visitor.id });
      } else {
        // Fallback sin encriptación si falla
        setItem(keys.VISITOR, jsonString);
        logger.warning("Visitor saved to storage without encryption", { id: visitor.id });
      }
    } catch (error) {
      logger.error("Failed to save visitor to storage", error);
    }
  };

  // Cargar la sesión desde localStorage con soporte para encriptación
  const loadSession = async (): Promise<{ data: Session; isNew: boolean }> => {
    try {
      const saved = getItem(keys.SESSION);
      if (!saved) {
        return { data: {} as Session, isNew: true };
      }
      
      // Verificar si los datos están encriptados
      if (isEncrypted(saved)) {
        const decrypted = await decrypt(saved);
        if (!decrypted) {
          logger.error("Failed to decrypt session from storage");
          return { data: {} as Session, isNew: true };
        }
        const parsedSession = JSON.parse(decrypted) as Session;
        logger.debug("Session loaded and decrypted from storage", { id: parsedSession.id });
        return { data: parsedSession, isNew: false };
      } else {
        // Datos no encriptados (compatibilidad con versiones anteriores)
        const parsedSession = JSON.parse(saved) as Session;
        logger.debug("Session loaded from storage (unencrypted)", { id: parsedSession.id });
        return { data: parsedSession, isNew: false };
      }
    } catch (error) {
      logger.warning("Failed to load session from storage", error);
      return { data: {} as Session, isNew: true };
    }
  };

  // Guardar la sesión en localStorage con encriptación
  const saveSession = async (session: Session): Promise<void> => {
    try {
      const jsonString = JSON.stringify(session);
      const encrypted = await encrypt(jsonString);
      
      if (encrypted) {
        setItem(keys.SESSION, encrypted);
        logger.debug("Session encrypted and saved to storage", { id: session.id });
      } else {
        // Fallback sin encriptación si falla
        setItem(keys.SESSION, jsonString);
        logger.warning("Session saved to storage without encryption", { id: session.id });
      }
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
