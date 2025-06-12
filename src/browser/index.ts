import { Orwel, Config, OrwelEvent, FormOptions } from "../types";
import { createLogger, generateUUID } from "../utils";
import { startMonitoring } from "../monitoring";
import { createStorage } from "./storage";
import { createVisitorManager } from "./visitor";
import { createSessionManager } from "./session";
import { createApiClient } from "./api";
import { createQueueManager } from "./queue";
import { createFormTracker } from "./form";
import { createAutoEventDetection } from "../auto-detection";

/**
 * Creates a browser implementation of the Orwel SDK
 */
export function createBrowserImplementation(): Orwel {
  // Configuración y estado
  let config: Config = {} as Config;
  let isMonitoring = false;
  let logger = createLogger({ debug: false, verbose: false });
  let autoDetection: ReturnType<typeof createAutoEventDetection> | null = null;

  // Crear el administrador de almacenamiento
  const storage = createStorage(logger);
  
  // Crear el cliente API con getters para acceder a la configuración actualizada
  const apiClient = createApiClient(
    () => config,
    () => visitorManager.getVisitor(),
    () => sessionManager.getSession(),
    logger
  );
  
  // Crear el administrador de cola primero
  const queueManager = createQueueManager(
    {
      loadQueue: storage.loadQueue,
      saveQueue: storage.saveQueue
    },
    apiClient,
    {
      setPendingUpdate: (isPending: boolean) => {},  // Temporal, será reemplazado
      flushSessionBuffer: () => {}  // Temporal, será reemplazado
    },
    logger
  );

  // Crear managers (con dependencias circulares resueltas mediante inicialización posterior)
  const sessionManager = createSessionManager(
    {
      saveSession: storage.saveSession,
      loadSession: storage.loadSession
    },
    {
      push: (event: OrwelEvent) => queueManager.addEvent(event),
      save: () => {},  // No es necesario guardar aquí, addEvent ya lo hace
      findAndUpdateEvent: (type: string, data: Record<string, any>) => 
        queueManager.findAndUpdateEvent(type, data as OrwelEvent)
    },
    logger
  );

  const visitorManager = createVisitorManager(
    {
      saveVisitor: storage.saveVisitor,
      loadVisitor: storage.loadVisitor
    },
    {
      push: (event: OrwelEvent) => queueManager.addEvent(event),
      save: () => {}  // No es necesario guardar aquí, addEvent ya lo hace
    },
    logger
  );

  // Actualizar las referencias en el queue manager para resolver las dependencias circulares
  (queueManager as any).sessionManager = {
    setPendingUpdate: (isPending: boolean) => (sessionManager as any).setPendingUpdate(isPending),
    flushSessionBuffer: () => (sessionManager as any).flushSessionBuffer()
  };
  
  // Crear el módulo de seguimiento de formularios
  const formTracker = createFormTracker(
    (code: string, properties: Record<string, unknown>) => orwel.track(code, properties),
    logger
  );

  const orwel: Orwel = {
    init: (opts: Config) => {
      config = opts;
      
      // Reinicializar logger con la configuración de depuración
      logger = createLogger({ 
        debug: opts.debug || false, 
        verbose: opts.verbose || false 
      });
      
      logger.info("Initializing Orwel SDK v1.1.1", {
        debug: opts.debug,
        verbose: opts.verbose,
        autoEventDetection: opts.autoEventDetection
      });
      
      // Inicializar en el orden correcto
      queueManager.loadQueue();
      visitorManager.loadVisitor();
      
      // Cargamos y creamos la sesión
      const { session: sessionData, isNewSession } = sessionManager.loadSession();
      
      // Nos aseguramos de enviar primero el evento de sesión y esperar a que se complete
      // antes de permitir otros eventos
      if (isNewSession) {
        logger.debug("New session detected, sending session event immediately");
        
        // Enviamos un evento de sesión directamente para asegurar que esté
        // creado en el backend antes de enviar otros eventos
        const sessionEvent = {
          type: "session",
          isNewSession: true,
          sessionData: sessionManager.getSession(),
          timestamp: new Date().toISOString()
        };
        
        // Enviamos el evento directamente sin usar la cola
        apiClient.send(sessionEvent)
          .then(success => {
            if (success) {
              logger.success("Initial session event sent successfully");
              // Ahora podemos comenzar a procesar la cola normalmente
              // Especialmente útil si hay eventos guardados de sesiones anteriores
              if (queueManager.getQueue().length > 0) {
                logger.debug("Processing queued events after session creation");
                queueManager.flush();
              }
            } else {
              logger.warning("Initial session event failed, will retry with queue");
              // Agregamos el evento a la cola para reintentar
              queueManager.addEvent(sessionEvent);
            }
          });
      }
      
      // Configurar event listeners
      window.addEventListener("beforeunload", (event) => {
        sessionManager.updateSession({
          finishedAt: new Date().toISOString(),
          status: 'closed'
        }, true); 
        
        const pendingEvents = queueManager.getQueue();
        if (pendingEvents.length > 0) {
          const hardcodedApiUrl = "https://api.orwel.io/ingest"; // Use the hardcoded URL from api.ts
          
          if (navigator.sendBeacon) {
            try {
              navigator.sendBeacon(hardcodedApiUrl, JSON.stringify(pendingEvents));
              logger.debug("Events sent via sendBeacon on beforeunload");
            } catch (e) {
              logger.error("Error using sendBeacon", { error: e });
            }
          } else {
            logger.debug("sendBeacon not available, using sync XHR for beforeunload flush");
            try {
              const xhr = new XMLHttpRequest();
              xhr.open("POST", hardcodedApiUrl, false); 
              xhr.setRequestHeader("Content-Type", "application/json");
              // Config is still needed for apiKey
              if (config && config.apiKey) {
                xhr.setRequestHeader("X-Orwel-Key", config.apiKey);
              } else {
                logger.warning("Cannot send X-Orwel-Key header for sync XHR: apiKey or config missing");
              }
              xhr.send(JSON.stringify(pendingEvents));
              logger.debug("Events sent via sync XHR on beforeunload");
            } catch (e) {
              logger.error("Error using sync XHR for beforeunload flush", { error: e });
            }
          }
        }
      });
      
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          logger.debug("Page visibility changed to hidden, flushing queue");
          orwel.flush();
        }
      });
      
      if (opts.autoMonitor) {
        logger.info("Auto monitoring enabled, starting monitors");
        orwel.monitor();
      }
      
      // Initialize auto event detection with safety checks
      if (opts.autoEventDetection !== false) {
        try {
          logger.info('Auto event detection enabled, initializing detection engine');
          autoDetection = createAutoEventDetection(
            orwel,
            opts.eventDetectionOptions || {},
            logger
          );
          
          // Initialize asynchronously to avoid blocking
          autoDetection.initialize().catch(error => {
            logger.error('Failed to initialize auto event detection', { error });
            // Cleanup if initialization fails
            if (autoDetection) {
              try {
                autoDetection.cleanup();
              } catch (cleanupError) {
                logger.error('Error during auto-detection cleanup', { cleanupError });
              }
              autoDetection = null;
            }
          });
        } catch (error) {
          logger.error('Error creating auto event detection', { error });
          autoDetection = null;
        }
      } else {
        logger.info('Auto event detection disabled');
      }
      
      logger.success("Orwel SDK initialized successfully");
    },
    
    identify: (traits: Record<string, any> = {}) => {
      return visitorManager.identify(traits);
    },
    
    lead: (code: string, properties: Record<string, any> = {}) => {
      return visitorManager.lead(code, properties);
    },
    
    track: (code: string, properties = {}) => {
      const eventId = generateUUID();
      logger.info("Tracking event", { code, eventId });

      // Capturar información completa de la URL
      const locationData = {
        path: window.location.pathname,
        url: window.location.href,
        hash: window.location.hash,
        search: window.location.search,
        hostname: window.location.hostname
      };
      
      queueManager.addEvent({
        type: "track", 
        code,
        location: locationData,
        properties,
        event: { id: eventId, code, source: "orwel-sdk" } ,
        timestamp: new Date().toISOString()
      });
      
      logger.success("Event tracked", { code, eventId });
      return { success: true, eventId };
    },
    
    session: (properties: Record<string, any> = {}) => {
      return sessionManager.updateSession(properties);
    },
    
    monitor: (options = {}) => {
      if (!isMonitoring) {
        startMonitoring(orwel, options);
        isMonitoring = true;
        logger.success("Monitoring started", options);
      } else {
        logger.warning("Monitoring already active, ignoring duplicate call");
      }
      return { success: true };
    },
    
    flush: async () => {
      return queueManager.flush();
    },
    
    form: (formElement: HTMLFormElement, options?: FormOptions) => {
      if (!formElement) {
        logger.error("Cannot track form: no form element provided");
        return { success: false };
      }
      
      try {
        formTracker.trackForm(formElement, options);
        return { success: true };
      } catch (error) {
        logger.error("Error tracking form", { error });
        return { success: false };
      }
    }
  };

  return orwel;
}

// Crear una instancia para uso interno
export const orwel: Orwel = createBrowserImplementation(); 