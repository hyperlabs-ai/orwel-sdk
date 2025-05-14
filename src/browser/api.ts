import { OrwelEvent } from "../types";
import { createLogger } from "../utils";

/**
 * Creates an API client for sending events to the server
 */
export function createApiClient(
  getConfig: () => { apiKey: string },
  getVisitor: () => Record<string, any>,
  getSession: () => Record<string, any>,
  logger: ReturnType<typeof createLogger>
) {
  // Enviar un evento al servidor
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
      const response = await fetch("https://api.orwel.io/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      
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
      logger.error("Failed to send event", { type: event.type, error: err });
      return false;
    }
  };

  return {
    send
  };
} 