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
    sendBatch: (events: OrwelEvent[]) => Promise<{ success: boolean; failedEvents: OrwelEvent[] }>;
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

  // Vaciar (flush) y enviar todos los eventos en la cola usando batch
  const flush = async () => {
    sessionManager.flushSessionBuffer();
    
    if (queue.length === 0) {
      logger.debug("Queue is empty, nothing to flush");
      return { success: true, count: 0 };
    }
    
    logger.debug("Flushing event queue with batch processing", { count: queue.length });
    
    // Check circuit breaker before processing
    if (!checkCircuitBreaker()) {
      logger.warning("Circuit breaker is open - skipping flush", {
        failureCount,
        queueSize: queue.length
      });
      return { success: false, count: 0 };
    }
    
    // Create a copy of the current queue and clear the original
    const eventsToProcess = [...queue];
    queue.length = 0;

    try {
      // Try to send all events in a single batch first
      const batchResult = await api.sendBatch(eventsToProcess);
      
      if (batchResult.success) {
        // All events sent successfully
        const sentCount = eventsToProcess.length;
        failureCount = 0; // Reset failure count on success
        
        // Handle session events
        const sessionEvents = eventsToProcess.filter(evt => evt.type === "session");
        if (sessionEvents.length > 0) {
          sessionManager.setPendingUpdate(false);
        }
        
        saveQueue(); // Save empty queue
        logger.success("Batch flush completed successfully", { 
          sent: sentCount,
          remaining: queue.length,
          circuitBreakerStatus: 'closed'
        });
        
        return { success: true, count: sentCount };
      } else {
        // Some or all events failed
        failureCount++;
        lastFailureTime = Date.now();
        
        // Put failed events back in queue
        const failedEvents = batchResult.failedEvents;
        const successfulCount = eventsToProcess.length - failedEvents.length;
        
        // Add failed events back to the beginning of the queue
        queue.unshift(...failedEvents);
        
        // Handle successful session events
        if (successfulCount > 0) {
          const processedEvents = eventsToProcess.filter(evt => 
            !failedEvents.some(failed => failed === evt)
          );
          const sessionEvents = processedEvents.filter(evt => evt.type === "session");
          if (sessionEvents.length > 0) {
            sessionManager.setPendingUpdate(false);
          }
        }
        
        saveQueue();
        logger.warning("Batch flush partially failed", { 
          sent: successfulCount,
          failed: failedEvents.length,
          remaining: queue.length,
          circuitBreakerStatus: failureCount >= MAX_FAILURES ? 'open' : 'closed'
        });
        
        return { success: successfulCount > 0, count: successfulCount };
      }
    } catch (error) {
      // Batch endpoint might not be available - try fallback to individual sends
      logger.warning("Batch processing failed, falling back to individual sends", { error });
      
      let sentCount = 0;
      const failedEvents: OrwelEvent[] = [];
      
      // Process events individually as fallback
      for (const evt of eventsToProcess) {
        try {
          const result = await api.send(evt);
          if (result) {
            sentCount++;
            if (evt.type === "session") {
              sessionManager.setPendingUpdate(false);
            }
          } else {
            failedEvents.push(evt);
          }
        } catch (individualError) {
          logger.debug("Individual event send failed", { type: evt.type, error: individualError });
          failedEvents.push(evt);
        }
      }
      
      // Handle results from fallback processing
      if (failedEvents.length > 0) {
        failureCount++;
        lastFailureTime = Date.now();
        queue.unshift(...failedEvents);
      } else {
        failureCount = 0; // Reset on complete success
      }
      
      saveQueue();
      
      if (sentCount > 0) {
        logger.success("Fallback flush completed", { 
          sent: sentCount,
          failed: failedEvents.length,
          remaining: queue.length,
          circuitBreakerStatus: failureCount >= MAX_FAILURES ? 'open' : 'closed'
        });
        return { success: true, count: sentCount };
      } else {
        logger.error("Fallback flush failed completely", { 
          eventsRestored: failedEvents.length,
          remaining: queue.length,
          circuitBreakerStatus: failureCount >= MAX_FAILURES ? 'open' : 'closed'
        });
        return { success: false, count: 0 };
      }
    }
  };

  const getQueueAndClear = (): OrwelEvent[] => {
    const events = [...queue];
    queue.length = 0;
    saveQueue(); // Save the empty queue
    logger.debug("Queue cleared for beacon send", { count: events.length });
    return events;
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
    getQueue: () => [...queue],
    getQueueAndClear,
    save: saveQueue,
  };
} 