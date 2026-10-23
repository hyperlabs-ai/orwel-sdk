import { OrwelEvent } from "../types";
import { createLogger } from "../utils";
import { MAX_BATCH_SIZE } from "../constants";

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
    sendBatch: (events: OrwelEvent[], options?: { keepalive?: boolean }) => Promise<{ success: boolean; failedEvents: OrwelEvent[] }>;
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
  
  // Flush guard to prevent concurrent flush operations
  let isFlushInProgress = false;

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

  /**
   * Send one batch-sized chunk, falling back to individual sends if the batch
   * endpoint itself is unreachable. Reports what happened rather than mutating
   * session state, so flush() can settle the session flag once at the end.
   */
  const sendChunk = async (
    chunk: OrwelEvent[],
    keepalive: boolean
  ): Promise<{ sent: number; failed: number; sessionSent: boolean }> => {
    try {
      const batchResult = await api.sendBatch(chunk, { keepalive });

      if (batchResult.success) {
        return {
          sent: chunk.length,
          failed: 0,
          sessionSent: chunk.some(evt => evt.type === "session")
        };
      }

      // Some or all events failed — drop failures, do not requeue
      const failedEvents = batchResult.failedEvents;
      const delivered = chunk.filter(evt => !failedEvents.some(failed => failed === evt));
      return {
        sent: delivered.length,
        failed: failedEvents.length,
        sessionSent: delivered.some(evt => evt.type === "session")
      };
    } catch (error) {
      // Batch endpoint might not be available - try fallback to individual sends
      logger.warning("Batch processing failed, falling back to individual sends", { error });

      let sent = 0;
      let failed = 0;
      let sessionSent = false;

      for (const evt of chunk) {
        try {
          const result = await api.send(evt);
          if (result) {
            sent++;
            if (evt.type === "session") sessionSent = true;
          } else {
            failed++;
          }
        } catch (individualError) {
          logger.debug("Individual event send failed", { type: evt.type, error: individualError });
          failed++;
        }
      }

      return { sent, failed, sessionSent };
    }
  };

  // Flush queue
  const flush = async (force: boolean = false, keepalive: boolean = false) => {
    logger.info("FLUSH CALLED - Starting flush operation");
    
    // Prevent concurrent flush operations (unless forced)
    if (isFlushInProgress && !force) {
      logger.info("FLUSH BLOCKED - Flush already in progress, skipping duplicate flush");
      return { success: true, count: 0 };
    }
    
    // If forced, wait briefly for current flush to finish
    if (isFlushInProgress && force) {
      let attempts = 0;
      while (isFlushInProgress && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 10));
        attempts++;
      }
    }
    
    logger.info("FLUSH PROCEEDING - Setting flush in progress");
    isFlushInProgress = true;
    
    try {
      sessionManager.flushSessionBuffer();
      
      if (queue.length === 0) {
        logger.debug("FLUSH EARLY EXIT - Queue is empty, nothing to flush");
        return { success: true, count: 0 };
      }
      
      logger.debug("Flushing event queue with batch processing", { count: queue.length });
      
      // No circuit breaker; always attempt to flush. Failed events will be dropped.
      
      // Create a copy of the current queue and clear the original
      const eventsToProcess = [...queue];
      queue.length = 0;

      // Split into batches the server will actually accept. The queue holds up to
      // MAX_QUEUE_SIZE (1000) events but /ingest/batch caps a payload at
      // MAX_BATCH_SIZE and answers 400 above it — and sendBatch() reports a 400 as
      // "success, don't retry", so posting the whole queue at once discarded every
      // event in it without a trace. Any flush past MAX_BATCH_SIZE used to be total
      // silent data loss.
      const chunks: OrwelEvent[][] = [];
      for (let i = 0; i < eventsToProcess.length; i += MAX_BATCH_SIZE) {
        chunks.push(eventsToProcess.slice(i, i + MAX_BATCH_SIZE));
      }

      let totalSent = 0;
      let totalFailed = 0;
      let sessionAcknowledged = false;

      for (const chunk of chunks) {
        const result = await sendChunk(chunk, keepalive);
        totalSent += result.sent;
        totalFailed += result.failed;
        sessionAcknowledged = sessionAcknowledged || result.sessionSent;
      }

      // Only clear the pending-session flag once, after every chunk is done:
      // the session event lives at index 0, so it is in the first chunk, but
      // clearing mid-loop would mark it settled while later chunks can still fail.
      if (sessionAcknowledged) {
        sessionManager.setPendingUpdate(false);
      }
      if (totalFailed === 0) {
        failureCount = 0; // Reset failure count on a fully clean flush
      }

      saveQueue(); // Save empty queue

      if (totalFailed > 0) {
        logger.warning("Flush completed with drops", {
          sent: totalSent,
          failed: totalFailed,
          batches: chunks.length,
          remaining: queue.length
        });
      } else {
        logger.success("Flush completed successfully", {
          sent: totalSent,
          batches: chunks.length,
          remaining: queue.length
        });
      }

      return { success: totalSent > 0, count: totalSent };
    } finally {
      logger.debug("FLUSH FINALLY - Resetting flush in progress flag");
      isFlushInProgress = false;
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