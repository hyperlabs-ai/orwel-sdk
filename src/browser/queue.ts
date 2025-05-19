import { OrwelEvent } from "../types";
import { createLogger } from "../utils";

const QUEUE_CONFIG = {
  MAX_QUEUE_SIZE: 1000,        // Máximo número de eventos en cola
  MAX_EVENT_AGE: 24 * 60 * 60 * 1000, // 24 horas en ms
  CLEANUP_INTERVAL: 30 * 60 * 1000,    // 30 minutos en ms
  MAX_RETRIES: 3,              // Máximo número de reintentos
  SESSION_PRIORITY: true       // Priorizar eventos de sesión
};

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
  let lastCleanup = Date.now();

  // Limpiar eventos antiguos y mantener límites
  const cleanupQueue = () => {
    const now = Date.now();
    
    // Solo limpiar si ha pasado el intervalo
    if (now - lastCleanup < QUEUE_CONFIG.CLEANUP_INTERVAL) {
      return;
    }
    
    const initialLength = queue.length;
    
    // Remover eventos antiguos
    const validEvents = queue.filter(evt => {
      const eventTime = new Date(evt.timestamp).getTime();
      return now - eventTime < QUEUE_CONFIG.MAX_EVENT_AGE;
    });
    
    // Si excede el tamaño máximo, mantener eventos más recientes
    // y priorizar eventos de sesión
    if (validEvents.length > QUEUE_CONFIG.MAX_QUEUE_SIZE) {
      const sessionEvents = validEvents.filter(evt => evt.type === 'session');
      const otherEvents = validEvents.filter(evt => evt.type !== 'session');
      
      const eventsToKeep = [
        ...sessionEvents,
        ...otherEvents.slice(-(QUEUE_CONFIG.MAX_QUEUE_SIZE - sessionEvents.length))
      ];
      
      queue.length = 0;
      queue.push(...eventsToKeep);
    } else {
      queue.length = 0;
      queue.push(...validEvents);
    }
    
    if (queue.length < initialLength) {
      logger.debug("Queue cleaned up", {
        removed: initialLength - queue.length,
        remaining: queue.length
      });
      saveQueue();
    }
    
    lastCleanup = now;
  };

  // Cargar la cola desde el almacenamiento
  const loadQueue = () => {
    try {
      const savedQueue = storage.loadQueue();
      if (savedQueue.length > 0) {
        queue.push(...savedQueue);
        cleanupQueue(); // Limpiar al cargar
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
    // Verificar duplicados para eventos de sesión
    if (event.type === 'session') {
      const existingSessionEvent = queue.findIndex(evt => 
        evt.type === 'session' && 
        evt.__isInitialSession === event.__isInitialSession
      );
      
      if (existingSessionEvent >= 0) {
        queue[existingSessionEvent] = event;
        logger.debug("Updated existing session event in queue");
        saveQueue();
        return;
      }
    }
    
    cleanupQueue();
    
    // Si la cola está llena, hacer espacio
    if (queue.length >= QUEUE_CONFIG.MAX_QUEUE_SIZE) {
      // Mantener eventos de sesión si es posible
      const sessionEvents = queue.filter(evt => evt.type === 'session');
      const otherEvents = queue.filter(evt => evt.type !== 'session');
      
      if (event.type === 'session') {
        // Remover el evento de sesión más antiguo si es necesario
        if (sessionEvents.length > 0) {
          queue.splice(queue.indexOf(sessionEvents[0]), 1);
        } else {
          queue.shift(); // Remover el evento más antiguo
        }
      } else {
        // Remover el evento no-sesión más antiguo
        if (otherEvents.length > 0) {
          queue.splice(queue.indexOf(otherEvents[0]), 1);
        } else {
          return; // No agregar si solo hay eventos de sesión
        }
      }
    }
    
    queue.push(event);
    saveQueue();
    logger.debug(`Added ${event.type} event to queue`, { queueSize: queue.length });
  };

  // Buscar y actualizar un evento existente
  const findAndUpdateEvent = (type: string, data: OrwelEvent): boolean => {
    const index = queue.findIndex(evt => 
      evt.type === type && 
      evt.__isInitialSession === data.__isInitialSession
    );
    
    if (index >= 0) {
      queue[index] = data;
      saveQueue();
      return true;
    }
    return false;
  };

  // Vaciar (flush) y enviar todos los eventos en la cola
  const flush = async () => {
    sessionManager.flushSessionBuffer();
    
    logger.debug("Flushing event queue", { count: queue.length });
    let sentCount = 0;
    
    // Ordenar la cola para priorizar eventos de sesión
    if (QUEUE_CONFIG.SESSION_PRIORITY) {
      queue.sort((a, b) => {
        if (a.type === 'session' && b.type !== 'session') return -1;
        if (a.type !== 'session' && b.type === 'session') return 1;
        return 0;
      });
    }
    
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
          if (!evt.__retryCount) evt.__retryCount = 0;
          
          if (evt.__retryCount < QUEUE_CONFIG.MAX_RETRIES) {
            evt.__retryCount++;
            // Reinsertar al principio si es evento de sesión
            if (evt.type === 'session') {
              queue.unshift(evt);
            } else {
              queue.push(evt);
            }
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