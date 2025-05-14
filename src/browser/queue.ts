import { OrwelEvent } from "../types";
import { createLogger } from "../utils";

/**
 * Creates a queue manager for handling event queueing and sending
 */
export function createQueueManager(
  // Dependencias externas requeridas
  storage: {
    loadQueue: () => OrwelEvent[];
    saveQueue: (queue: OrwelEvent[]) => void;
  },
  api: {
    send: (event: OrwelEvent) => Promise<boolean>;
  },
  sessionManager: {
    setPendingUpdate: (isPending: boolean) => void;
    flushSessionBuffer: () => void;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Cola de eventos
  const queue: OrwelEvent[] = [];

  // Cargar la cola desde el almacenamiento
  const loadQueue = () => {
    try {
      const savedQueue = storage.loadQueue();
      if (savedQueue.length > 0) {
        queue.push(...savedQueue);
      }
      logger.debug("Queue loaded from storage", { count: queue.length });
    } catch (error) {
      logger.error("Failed to load queue from storage", error);
    }
  };

  // Guardar la cola en el almacenamiento
  const saveQueue = () => {
    try {
      storage.saveQueue([...queue]);
      logger.debug("Queue saved to storage", { count: queue.length });
    } catch (error) {
      logger.error("Failed to save queue to storage", error);
    }
  };

  // Agregar un evento a la cola
  const addEvent = (event: OrwelEvent) => {
    queue.push(event);
    saveQueue();
    logger.debug(`Added ${event.type} event to queue`);
  };

  // Buscar y actualizar un evento existente
  const findAndUpdateEvent = (type: string, data: OrwelEvent): boolean => {
    const index = queue.findIndex(evt => evt.type === type);
    if (index >= 0) {
      queue[index] = data;
      saveQueue();
      return true;
    }
    return false;
  };

  // Vaciar (flush) y enviar todos los eventos en la cola
  const flush = async () => {
    // Asegurar que cualquier actualización de sesión pendiente se procese
    sessionManager.flushSessionBuffer();
    
    logger.debug("Flushing event queue", { count: queue.length });
    let sentCount = 0;
    
    while (queue.length > 0) {
      const evt = queue.shift();
      if (evt) {
        const result = await api.send(evt);
        if (result) {
          sentCount++;
          if (evt.type === "session") {
            sessionManager.setPendingUpdate(false);
          }
        } else {
          // Lógica de reintento para eventos fallidos
          if (!evt.__retryCount) evt.__retryCount = 0;
          
          if (evt.__retryCount < 3) {
            evt.__retryCount++;
            queue.push(evt);
            logger.debug("Requeuing event for retry", { 
              type: evt.type, 
              retry: evt.__retryCount 
            });
          } else {
            logger.warning("Dropping event after max retries", { type: evt.type });
          }
        }
      }
    }
    
    saveQueue();
    logger.success("Queue flushed successfully", { sent: sentCount });
    return { success: true, count: sentCount };
  };

  return {
    loadQueue,
    saveQueue,
    addEvent,
    findAndUpdateEvent,
    getQueue: () => [...queue],
    flush
  };
} 