import { OrwelEvent } from "../types";
import { createLogger } from "../utils";

const MAX_FAILURES = 3;
const RESET_TIMEOUT = 60000; // 1 minute
const MAX_QUEUE_SIZE = 1000; // Maximum number of events in queue

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
  
  // Circuit breaker state
  let failureCount = 0;
  let lastFailureTime = 0;

  // Reset circuit breaker if enough time has passed
  const checkCircuitBreaker = () => {
    const now = Date.now();
    if (now - lastFailureTime >= RESET_TIMEOUT) {
      failureCount = 0;
    }
    return failureCount < MAX_FAILURES;
  };

  // Cargar la cola desde el almacenamiento
  const loadQueue = () => {
    try {
      const savedQueue = storage.loadQueue();
      if (savedQueue.length > 0) {
        // Respect MAX_QUEUE_SIZE when loading
        const eventsToAdd = savedQueue.slice(-MAX_QUEUE_SIZE);
        queue.push(...eventsToAdd);
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
    try {
      // Session events should always be first
      if (event.type === "session") {
        // Remove any existing session events to avoid duplicates
        const nonSessionEvents = queue.filter(evt => evt.type !== "session");
        queue.length = 0;
        queue.push(event, ...nonSessionEvents.slice(-MAX_QUEUE_SIZE + 1)); // Ensure we don't exceed MAX_QUEUE_SIZE
      } else {
        // If queue is full, remove oldest non-session event
        if (queue.length >= MAX_QUEUE_SIZE) {
          const sessionEvents = queue.filter(evt => evt.type === "session");
          const nonSessionEvents = queue.filter(evt => evt.type !== "session");
          nonSessionEvents.shift(); // Remove oldest non-session event
          queue.length = 0;
          queue.push(...sessionEvents, ...nonSessionEvents);
        }
        queue.push(event);
      }
      saveQueue();
      logger.debug(`Added ${event.type} event to queue`, { queueSize: queue.length });
    } catch (error) {
      logger.error("Failed to add event to queue", { type: event.type, error });
    }
  };

  // Buscar y actualizar un evento existente
  const findAndUpdateEvent = (type: string, data: OrwelEvent): boolean => {
    try {
      const index = queue.findIndex(evt => evt.type === type);
      if (index >= 0) {
        queue[index] = data;
        saveQueue();
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Failed to update event in queue", { type, error });
      return false;
    }
  };

  // Vaciar (flush) y enviar todos los eventos en la cola
  const flush = async () => {
    sessionManager.flushSessionBuffer();
    
    logger.debug("Flushing event queue", { count: queue.length });
    let sentCount = 0;
    
    // Create a copy of the current queue and clear the original
    const eventsToProcess = [...queue];
    queue.length = 0;

    // Process each event only once without retries
    for (const evt of eventsToProcess) {
      if (!checkCircuitBreaker()) {
        // If circuit breaker trips, add remaining events back to queue
        queue.push(...eventsToProcess.slice(eventsToProcess.indexOf(evt)));
        logger.warning("Circuit breaker tripped - pausing event processing", {
          failureCount,
          remainingEvents: queue.length
        });
        break;
      }

      const result = await api.send(evt);
      if (result) {
        sentCount++;
        if (evt.type === "session") {
          sessionManager.setPendingUpdate(false);
        }
        failureCount = 0; // Reset failure count on success
      } else { // Event send failed
        failureCount++;
        lastFailureTime = Date.now();
        
        // Failed events are put back in the queue for next flush
        queue.push(evt);
        logger.debug("Event sending failed, will retry in next flush", { 
          type: evt.type, 
          eventId: (evt as any).event?.id 
        });
      }
    }
    
    saveQueue();
    logger.success("Queue flushed", { 
      sent: sentCount,
      remaining: queue.length,
      circuitBreakerStatus: failureCount >= MAX_FAILURES ? 'open' : 'closed'
    });
    return { success: true, count: sentCount };
  };

  // Start circuit breaker reset interval
  setInterval(() => {
    if (failureCount > 0 && checkCircuitBreaker()) {
      logger.debug("Circuit breaker reset", { previousFailures: failureCount });
    }
  }, RESET_TIMEOUT);

  return {
    loadQueue,
    saveQueue,
    addEvent,
    findAndUpdateEvent,
    flush,
    getQueue: () => [...queue]
  };
} 