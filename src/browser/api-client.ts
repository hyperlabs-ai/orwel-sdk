/**
 * Cliente API mejorado con soporte para reintentos, timeouts y manejo de errores
 */

import { OrwelEvent } from "../types";
import { createLogger } from "../utils";
import { withRetry, RetryConfig } from "../utils/retry";
import { withTimeout } from "../utils/async-operations";
import { sanitizeErrorMessage } from "../utils/validation";

// Configuración por defecto
const DEFAULT_TIMEOUT = 10000; // 10 segundos
const DEFAULT_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 300,
  maxDelay: 10000,
  backoffFactor: 2,
  jitterFactor: 0.2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

// Tipos de respuesta
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  status: number;
}

/**
 * Crea un cliente API mejorado para comunicarse con el servidor
 */
export function createApiClient(
  getConfig: () => { apiKey: string; apiUrl?: string },
  getVisitor: () => Record<string, any>,
  getSession: () => Record<string, any>,
  logger: ReturnType<typeof createLogger>
) {
  // Endpoint por defecto
  const DEFAULT_API_URL = "https://api.orwel.io/ingest";
  
  /**
   * Envía una solicitud al servidor con reintentos automáticos
   */
  const sendRequest = async <T = any>(
    url: string,
    method: string,
    body: any,
    headers: Record<string, string>,
    options: {
      timeout?: number;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ): Promise<ApiResponse<T>> => {
    const { timeout = DEFAULT_TIMEOUT, retryConfig = {} } = options;
    
    // Combinar configuración de reintentos
    const finalRetryConfig: Partial<RetryConfig> = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
      onRetry: (attempt, delay, error) => {
        logger.warning(`API request retry ${attempt} after ${delay}ms`, {
          url,
          error: error.message
        });
      }
    };
    
    try {
      // Ejecutar con reintentos y timeout
      const response = await withRetry(
        () => withTimeout(
          async () => {
            const fetchResponse = await fetch(url, {
              method,
              headers,
              body: body ? JSON.stringify(body) : undefined,
              keepalive: true,
            });
            
            // Intentar parsear la respuesta como JSON
            let responseData: any;
            try {
              responseData = await fetchResponse.json();
            } catch (e) {
              responseData = null;
            }
            
            return {
              success: fetchResponse.ok,
              data: responseData,
              status: fetchResponse.status,
              error: !fetchResponse.ok ? {
                code: `HTTP_${fetchResponse.status}`,
                message: fetchResponse.statusText,
                details: responseData
              } : undefined
            };
          },
          timeout
        ),
        finalRetryConfig,
        logger
      );
      
      return response;
    } catch (error: any) {
      // Sanitizar el mensaje de error
      const sanitizedMessage = sanitizeErrorMessage(error);
      
      logger.error(`API request failed: ${sanitizedMessage}`, {
        url,
        method
      });
      
      return {
        success: false,
        status: 0,
        error: {
          code: 'REQUEST_FAILED',
          message: sanitizedMessage
        }
      };
    }
  };
  
  /**
   * Envía un evento al servidor
   */
  const send = async (event: OrwelEvent): Promise<boolean> => {
    try {
      const config = getConfig();
      const apiUrl = config.apiUrl || DEFAULT_API_URL;
      
      // Preparar el payload
      const payload = {
        ...event,
        visitor: getVisitor(),
        session: getSession(),
        timestamp: event.timestamp || new Date().toISOString(),
      };
      
      logger.debug("Sending event to server", { type: event.type });
      
      // Enviar la solicitud
      const response = await sendRequest(
        apiUrl,
        "POST",
        payload,
        {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        {
          // Configuración específica para eventos
          timeout: event.type === 'session' ? DEFAULT_TIMEOUT * 2 : DEFAULT_TIMEOUT,
          retryConfig: {
            // Más reintentos para eventos de sesión
            maxRetries: event.type === 'session' ? 5 : 3
          }
        }
      );
      
      if (response.success) {
        logger.success("Event sent successfully", { type: event.type });
        return true;
      }
      
      // Si es error 400, es un problema con el formato y no debemos reintentar
      if (response.status === 400) {
        logger.error("Bad request error (format issue) - not retrying", { 
          type: event.type, 
          status: response.status,
          error: response.error?.message
        });
        return true; // Evita reinsertar en la cola
      }
      
      logger.error(`Failed to send event: ${response.error?.message}`, { 
        type: event.type, 
        status: response.status
      });
      return false;
    } catch (err: any) {
      logger.error(`Unexpected error sending event: ${err.message}`, { 
        type: event.type
      });
      return false;
    }
  };
  
  /**
   * Envía un lote de eventos al servidor
   */
  const sendBatch = async (events: OrwelEvent[]): Promise<{
    success: boolean;
    successCount: number;
    failedEvents: OrwelEvent[];
  }> => {
    if (!events.length) {
      return { success: true, successCount: 0, failedEvents: [] };
    }
    
    try {
      const config = getConfig();
      const apiUrl = config.apiUrl || DEFAULT_API_URL;
      const batchUrl = apiUrl.replace(/\/ingest$/, '/batch') || `${apiUrl}/batch`;
      
      // Preparar el payload
      const payload = events.map(event => ({
        ...event,
        visitor: getVisitor(),
        session: getSession(),
        timestamp: event.timestamp || new Date().toISOString(),
      }));
      
      logger.debug("Sending batch of events", { count: events.length });
      
      // Enviar la solicitud
      const response = await sendRequest(
        batchUrl,
        "POST",
        payload,
        {
          "Content-Type": "application/json",
          "X-Orwel-Key": config.apiKey,
        },
        {
          timeout: DEFAULT_TIMEOUT * 2, // Mayor timeout para lotes
        }
      );
      
      if (response.success) {
        logger.success("Batch sent successfully", { count: events.length });
        return { success: true, successCount: events.length, failedEvents: [] };
      }
      
      // Si es error 400, intentar enviar los eventos individualmente
      if (response.status === 400) {
        logger.warning("Batch request failed with 400, trying individual events", {
          count: events.length
        });
        
        const results = await Promise.all(events.map(event => send(event)));
        const successCount = results.filter(Boolean).length;
        const failedEvents = events.filter((_, index) => !results[index]);
        
        return {
          success: successCount > 0,
          successCount,
          failedEvents
        };
      }
      
      logger.error(`Batch request failed: ${response.error?.message}`, { 
        status: response.status
      });
      return { success: false, successCount: 0, failedEvents: events };
    } catch (err: any) {
      logger.error(`Unexpected error sending batch: ${err.message}`);
      return { success: false, successCount: 0, failedEvents: events };
    }
  };
  
  /**
   * Envía un evento durante beforeunload
   * Utiliza sendBeacon cuando está disponible, con fallback a XHR síncrono
   */
  const sendBeforeUnload = (events: OrwelEvent[]): boolean => {
    if (!events.length) return true;
    
    try {
      const config = getConfig();
      const apiUrl = config.apiUrl || DEFAULT_API_URL;
      
      // Preparar el payload
      const payload = events.map(event => ({
        ...event,
        visitor: getVisitor(),
        session: getSession(),
        timestamp: event.timestamp || new Date().toISOString(),
      }));
      
      // Intentar usar sendBeacon
      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          const success = navigator.sendBeacon(apiUrl, blob);
          
          if (success) {
            logger.debug("Events sent via sendBeacon on beforeunload");
            return true;
          }
          
          logger.warning("sendBeacon failed, falling back to sync XHR");
        } catch (e) {
          logger.error("Error using sendBeacon", { error: e });
        }
      }
      
      // Fallback a XHR síncrono
      logger.debug("Using sync XHR for beforeunload flush");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl, false); // Síncrono
      xhr.setRequestHeader("Content-Type", "application/json");
      
      if (config.apiKey) {
        xhr.setRequestHeader("X-Orwel-Key", config.apiKey);
      } else {
        logger.warning("Cannot send X-Orwel-Key header: apiKey missing");
      }
      
      xhr.send(JSON.stringify(payload));
      logger.debug("Events sent via sync XHR on beforeunload");
      
      return xhr.status >= 200 && xhr.status < 300;
    } catch (e) {
      logger.error("Error sending events on beforeunload", { error: e });
      return false;
    }
  };
  
  return {
    send,
    sendBatch,
    sendBeforeUnload
  };
}

