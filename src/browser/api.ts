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

  return {
    send,
    resolveVisitor
  };
} 