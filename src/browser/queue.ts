import { OrwelEvent } from "../types";
import { createLogger } from "../utils";
import { processInChunks } from "../utils/async-operations";

const MAX_FAILURES = 3;
const RESET_TIMEOUT = 60000; // 1 minute
const MAX_QUEUE_SIZE = 1000; // Maximum number of events in queue
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const CHUNK_SIZE = 10; // Number of events to process at once

/**
 * Creates a queue manager for handling event queueing and sending
 */
export function createQueueManager(
  // Dependencias externas requeridas
  storage: {
    loadQueue: () => Promise<OrwelEvent[]>;
    saveQueue: (queue: OrwelEvent[]) => Promise<void>;
  },
  api: {
    send: (event: OrwelEvent) => Promise<boolean>;
    sendBatch?: (events: OrwelEvent[]) => Promise<{
      success: boolean;
      successCount: number;
      failedEvents: OrwelEvent[];
    }>;
    sendBeforeUnload?: (events: OrwelEvent[]) => boolean;
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
  let isProcessing = false;

  // Reset circuit breaker if enough time has passed
  const checkCircuitBreaker = () => {
    const now = Date.now();
    if (now - lastFailureTime >= RESET_TIMEOUT) {
      failureCount = 0;
    }
    return failureCount < MAX_FAILURES;
  };

  // Limpia eventos antiguos de la cola
  const cleanupOldEvents = (): number => {
    const now = Date.now();
    const originalLength = queue.length;
    
    // Filtrar eventos más antiguos que MAX_EVENT_AGE_MS
    const filteredQueue = queue.filter(event => {
      if (!event.timestamp) return true; // Mantener eventos sin timestamp
      
      const eventTime = new Date(event.timestamp).getTime();
      return !isNaN(eventTime) && (now - eventTime < MAX_EVENT_AGE_MS);
    });
    
    // Actualizar la cola si se eliminaron eventos
    const removedCount = originalLength - filteredQueue.length;
    if (removedCount > 0) {
      queue.length = 0;
      queue.push(...filteredQueue);
      logger.debug(`Removed ${removedCount} old events from queue`);
    }
    
    return removedCount;
  };

  // Cargar la cola desde el almacenamiento
  const loadQueue = async () => {
    try {
      const savedQueue = await storage.loadQueue();
      if (savedQueue.length > 0) {
        // Limpiar eventos antiguos antes de cargar
        const filteredQueue = savedQueue.filter(event => {
          if (!event.timestamp) return true;
          
          const eventTime = new Date(event.timestamp).getTime();
          const now = Date.now();
          return !isNaN(eventTime) && (now - eventTime < MAX_EVENT_AGE_MS);
        });
        
        // Respetar MAX_QUEUE_SIZE al cargar
        const eventsToAdd = filteredQueue.slice(-MAX_QUEUE_SIZE);
        queue.push(...eventsToAdd);
        
        // Registrar eventos eliminados por antigüedad
        const removedByAge = savedQueue.length - filteredQueue.length;
        if (removedByAge > 0) {
          logger.debug(`Removed ${removedByAge} old events during load`);
        }
        
        // Registrar eventos eliminados por tamaño máximo
        const removedBySize = filteredQueue.length - eventsToAdd.length;
        if (removedBySize > 0) {
          logger.debug(`Removed ${removedBySize} excess events during load`);
        }
      }
      logger.debug("Queue loaded from storage", { count: queue.length });
    } catch (error) {
      logger.error("Failed to load queue from storage", error);
    }
  };

  // Guardar la cola en el almacenamiento
  const saveQueue = async () => {
    try {
      await storage.saveQueue([...queue]);
      logger.debug("Queue saved to storage", { count: queue.length });
    } catch (error) {
      logger.error("Failed to save queue to storage", error);
    }
  };

  // Agregar un evento a la cola
  const addEvent = async (event: OrwelEvent) => {
    try {
      // Asegurar que el evento tenga timestamp
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }
      
      // Session events should always be first
      if (event.type === "session") {
        // Remove any existing session events to avoid duplicates
        const nonSessionEvents = queue.filter(evt => evt.type !== "session");
        queue.length = 0;
        queue.push(event, ...nonSessionEvents.slice(-MAX_QUEUE_SIZE + 1)); // Ensure we don't exceed MAX_QUEUE_SIZE
      } else {
        // Si la cola está llena, eliminar eventos antiguos no-sesión
        if (queue.length >= MAX_QUEUE_SIZE) {
          // Limpiar eventos antiguos primero
          cleanupOldEvents();
          
          // Si aún está llena, eliminar el evento no-sesión más antiguo
          if (queue.length >= MAX_QUEUE_SIZE) {
            const sessionEvents = queue.filter(evt => evt.type === "session");
            const nonSessionEvents = queue.filter(evt => evt.type !== "session");
            nonSessionEvents.shift(); // Remove oldest non-session event
            queue.length = 0;
            queue.push(...sessionEvents, ...nonSessionEvents);
          }
        }
        queue.push(event);
      }
      await saveQueue();
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
    // Evitar múltiples procesos de flush simultáneos
    if (isProcessing) {
      logger.debug("Queue flush already in progress, skipping");
      return { success: true, count: 0 };
    }
    
    isProcessing = true;
    
    try {
      sessionManager.flushSessionBuffer();
      
      // Limpiar eventos antiguos antes de procesar
      cleanupOldEvents();
      
      logger.debug("Flushing event queue", { count: queue.length });
      
      if (queue.length === 0) {
        return { success: true, count: 0 };
      }
      
      // Verificar circuit breaker
      if (!checkCircuitBreaker()) {
        logger.warning("Circuit breaker open - skipping event processing", {
          failureCount,
          queueSize: queue.length
        });
        return { success: false, count: 0 };
      }
      
      let sentCount = 0;
      
      // Intentar enviar eventos en lotes primero si está disponible la función sendBatch
      if (queue.length > 1 && api.sendBatch) {
        try {
          // Separar eventos de sesión (deben enviarse primero)
          const sessionEvents = queue.filter(evt => evt.type === "session");
          const nonSessionEvents = queue.filter(evt => evt.type !== "session");
          
          // Enviar eventos de sesión primero (individualmente para garantizar entrega)
          if (sessionEvents.length > 0) {
            logger.debug(`Processing ${sessionEvents.length} session events individually`);
            
            for (const sessionEvent of sessionEvents) {
              const result = await api.send(sessionEvent);
              if (result) {
                sentCount++;
                sessionManager.setPendingUpdate(false);
                
                // Eliminar el evento de la cola
                const index = queue.findIndex(e => 
                  e.type === "session" && e.timestamp === sessionEvent.timestamp);
                if (index >= 0) {
                  queue.splice(index, 1);
                }
              } else {
                failureCount++;
                lastFailureTime = Date.now();
                logger.debug("Session event sending failed", { 
                  sessionId: (sessionEvent as any).session?.id 
                });
                
                // Si falla el envío de sesión, detener el proceso
                await saveQueue();
                isProcessing = false;
                return { success: false, count: sentCount };
              }
            }
          }
          
          // Procesar eventos no-sesión en chunks
          if (nonSessionEvents.length > 0) {
            logger.debug(`Processing ${nonSessionEvents.length} non-session events in chunks`);
            
            // Intentar enviar en lotes primero
            if (nonSessionEvents.length > 1) {
              const batchResult = await api.sendBatch(nonSessionEvents);
              
              if (batchResult.success) {
                sentCount += batchResult.successCount;
                
                // Si todos los eventos se enviaron correctamente
                if (batchResult.failedEvents.length === 0) {
                  // Eliminar todos los eventos no-sesión de la cola
                  queue.length = 0;
                  // Restaurar eventos de sesión que ya se procesaron
                  queue.push(...sessionEvents.filter(e => {
                    const index = queue.findIndex(qe => 
                      qe.type === "session" && qe.timestamp === e.timestamp);
                    return index < 0;
                  }));
                } else {
                  // Mantener solo los eventos fallidos en la cola
                  queue.length = 0;
                  queue.push(...sessionEvents.filter(e => {
                    const index = queue.findIndex(qe => 
                      qe.type === "session" && qe.timestamp === e.timestamp);
                    return index < 0;
                  }), ...batchResult.failedEvents);
                }
              } else {
                // Si falla el envío en lote, procesar individualmente
                logger.debug("Batch send failed, falling back to individual processing");
                await processEventsInChunks(nonSessionEvents);
              }
            } else {
              // Si solo hay un evento, enviarlo directamente
              const result = await api.send(nonSessionEvents[0]);
              if (result) {
                sentCount++;
                
                // Eliminar el evento de la cola
                const index = queue.findIndex(e => 
                  e.type === nonSessionEvents[0].type && e.timestamp === nonSessionEvents[0].timestamp);
                if (index >= 0) {
                  queue.splice(index, 1);
                }
              } else {
                failureCount++;
                lastFailureTime = Date.now();
              }
            }
          }
        } catch (error) {
          logger.error("Error during batch processing", { error });
          failureCount++;
          lastFailureTime = Date.now();
        }
      } else {
        // Procesar eventos individualmente en chunks
        await processEventsInChunks(queue);
      }
      
      // Función auxiliar para procesar eventos en chunks
      async function processEventsInChunks(events: OrwelEvent[]) {
        await processInChunks(
          events,
          async (event) => {
            if (!checkCircuitBreaker()) {
              return false;
            }
            
            const result = await api.send(event);
            if (result) {
              sentCount++;
              
              // Eliminar el evento de la cola
              const index = queue.findIndex(e => 
                e.type === event.type && e.timestamp === event.timestamp);
              if (index >= 0) {
                queue.splice(index, 1);
              }
              
              if (event.type === "session") {
                sessionManager.setPendingUpdate(false);
              }
              
              return true;
            } else {
              failureCount++;
              lastFailureTime = Date.now();
              return false;
            }
          },
          {
            chunkSize: CHUNK_SIZE,
            delayBetweenChunks: 10, // Pequeña pausa entre chunks
            onChunkComplete: (results, chunkIndex) => {
              logger.debug(`Processed chunk ${chunkIndex + 1}`, {
                success: results.filter(Boolean).length,
                failed: results.filter(r => !r).length
              });
            }
          }
        );
      }
      
      // Resetear el contador de fallos si todo fue bien
      if (sentCount > 0 && queue.length === 0) {
        failureCount = 0;
      }
      
      await saveQueue();
      logger.success("Queue flushed", { 
        sent: sentCount,
        remaining: queue.length,
        circuitBreakerStatus: failureCount >= MAX_FAILURES ? 'open' : 'closed'
      });
      
      return { success: true, count: sentCount };
    } catch (error) {
      logger.error("Error during queue flush", { error });
      return { success: false, count: 0 };
    } finally {
      isProcessing = false;
    }
  };

  // Enviar eventos durante beforeunload
  const flushBeforeUnload = () => {
    if (queue.length === 0) return true;
    
    try {
      // Limpiar eventos antiguos antes de enviar
      cleanupOldEvents();
      
      if (queue.length === 0) return true;
      
      logger.debug("Flushing queue on beforeunload", { count: queue.length });
      
      // Usar la función especializada si está disponible
      if (api.sendBeforeUnload) {
        return api.sendBeforeUnload(queue);
      }
      
      // Fallback al método antiguo
      const hardcodedApiUrl = "https://api.orwel.io/ingest";
      
      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });
          const success = navigator.sendBeacon(hardcodedApiUrl, blob);
          logger.debug("Events sent via sendBeacon on beforeunload");
          return success;
        } catch (e) {
          logger.error("Error using sendBeacon", { error: e });
        }
      }
      
      // Fallback a XHR síncrono
      logger.debug("sendBeacon not available, using sync XHR for beforeunload flush");
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", hardcodedApiUrl, false); 
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(queue));
        logger.debug("Events sent via sync XHR on beforeunload");
        return xhr.status >= 200 && xhr.status < 300;
      } catch (e) {
        logger.error("Error using sync XHR for beforeunload flush", { error: e });
        return false;
      }
    } catch (error) {
      logger.error("Error during beforeunload flush", { error });
      return false;
    }
  };

  // Start circuit breaker reset interval
  setInterval(() => {
    if (failureCount > 0 && checkCircuitBreaker()) {
      logger.debug("Circuit breaker reset", { previousFailures: failureCount });
    }
    
    // Limpiar eventos antiguos periódicamente
    if (queue.length > 0) {
      const removedCount = cleanupOldEvents();
      if (removedCount > 0) {
        saveQueue().catch(error => {
          logger.error("Failed to save queue after cleanup", { error });
        });
      }
    }
  }, RESET_TIMEOUT);

  return {
    loadQueue,
    saveQueue,
    addEvent,
    findAndUpdateEvent,
    flush,
    flushBeforeUnload,
    getQueue: () => [...queue]
  };
}
