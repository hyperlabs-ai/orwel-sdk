import { OrwelEvent } from "../types";
import { createLogger } from "../utils";

const DEFAULT_TIMEOUT = 5000; // 5 seconds timeout

/**
 * Creates an API client for sending events to the server
 */
export function createApiClient(
  getConfig: () => { apiKey: string },
  getVisitor: () => Record<string, any>,
  getSession: () => Record<string, any>,
  logger: ReturnType<typeof createLogger>
) {
  // Enviar un evento al servidor con timeout
  const send = async (event: OrwelEvent): Promise<boolean> => {
    try {
      const payload = {
        ...event,
        visitor: getVisitor(),
        session: getSession(),
        timestamp: new Date().toISOString(),
        eventId: crypto.randomUUID(),
      };

      logger.debug("Sending event to server", { type: event.type });
      
      const config = getConfig();

      // Create fetch promise
      const fetchPromise = fetch("https://api.orwel.io/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, DEFAULT_TIMEOUT);
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        // Si es error 400, es un problema con el formato y no debemos reintentar
        if (response.status === 400) {
          logger.error("Bad request error (format issue) - not retrying", { 
            type: event.type, 
            status: response.status,
            statusText: response.statusText
          });
          return true; // Evita reinsertar en la cola
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      logger.success("Event sent successfully", { type: event.type });
      return true;
    } catch (err) {
      // Distinguish between timeout and other errors
      const isTimeout = err instanceof Error && err.message === 'Request timeout';
      logger.error(`Failed to send event: ${isTimeout ? 'timeout' : 'network error'}`, { 
        type: event.type, 
        error: err 
      });
      return false;
    }
  };

  // Resolve visitor ID from server for cross-domain consistency
  const resolveVisitor = async (fingerprint: Record<string, any>): Promise<string | null> => {
    try {
      logger.debug("Resolving visitor ID from server", { fingerprint });
      
      const config = getConfig();

      // Create fetch promise
      const fetchPromise = fetch("https://api.orwel.io/visitor-resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        body: JSON.stringify({ fingerprint }),
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, DEFAULT_TIMEOUT);
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const { visitorId } = await response.json();
      
      // Validate UUID format for Supabase compatibility
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(visitorId)) {
        throw new Error('Server returned invalid UUID format');
      }
      
      logger.success("Visitor ID resolved from server", { visitorId });
      return visitorId;
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'Request timeout';
      logger.error(`Failed to resolve visitor ID: ${isTimeout ? 'timeout' : 'server error'}`, { 
        error: err 
      });
      return null;
    }
  };

  // Enviar múltiples eventos en lotes al servidor
  const sendBatch = async (events: OrwelEvent[]): Promise<{ success: boolean; failedEvents: OrwelEvent[] }> => {
    if (events.length === 0) {
      return { success: true, failedEvents: [] };
    }

    try {
      // Prepare batch payload with common data
      const visitor = getVisitor();
      const session = getSession();
      const timestamp = new Date().toISOString();
      
      const batchPayload = {
        events: events.map(event => ({
          ...event,
          visitor,
          session,
          timestamp,
          eventId: crypto.randomUUID()
        })),
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        count: events.length
      };

      logger.debug("Sending batch of events to server", { 
        count: events.length,
        batchId: batchPayload.batchId,
        types: events.map(e => e.type)
      });
      
      const config = getConfig();

      // Create fetch promise
      const fetchPromise = fetch("https://api.orwel.io/ingest/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        body: JSON.stringify(batchPayload),
        keepalive: true,
      });

      // Create timeout promise with longer timeout for batches
      const batchTimeout = Math.min(DEFAULT_TIMEOUT * 2, 10000); // Max 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Batch request timeout'));
        }, batchTimeout);
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        // Check if it's a partial failure (some events processed, some failed)
        if (response.status === 207) { // Multi-status response
          try {
            const result = await response.json();
            const failedEvents = result.failedEvents || [];
            
            logger.warning("Batch partially processed", {
              total: events.length,
              failed: failedEvents.length,
              success: events.length - failedEvents.length
            });
            
            return { success: false, failedEvents };
          } catch (parseError) {
            logger.error("Failed to parse partial batch response", { parseError });
            return { success: false, failedEvents: events };
          }
        }
        
        // For 400 errors, don't retry any events
        if (response.status === 400) {
          logger.error("Batch bad request error (format issue) - not retrying", { 
            count: events.length,
            status: response.status,
            statusText: response.statusText
          });
          return { success: true, failedEvents: [] }; // Treat as success to avoid retry
        }
        
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      logger.success("Batch sent successfully", { 
        count: events.length,
        batchId: batchPayload.batchId
      });
      
      return { success: true, failedEvents: [] };
      
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'Batch request timeout';
      logger.error(`Failed to send batch: ${isTimeout ? 'timeout' : 'network error'}`, { 
        count: events.length,
        error: err 
      });
      
      return { success: false, failedEvents: events };
    }
  };

  return {
    send,
    sendBatch,
    resolveVisitor
  };
} 