import { Orwel, Config, OrwelEvent } from "../types";
import { createLogger, generateUUID, sanitizeData } from "../utils";
import { startMonitoring } from "../monitoring";
import { createStorage } from "./storage";
import { createVisitorManager } from "./visitor";
import { createSessionManager } from "./session";
import { createApiClient } from "./api";
import { createQueueManager } from "./queue";

/**
 * Creates a browser implementation of the Orwel SDK
 */
export function createBrowserImplementation(): Orwel {
  // Configuración y estado
  let config: Config = {} as Config;
  let isMonitoring = false;
  let logger = createLogger({ debug: false, verbose: false });

  // Crear el administrador de almacenamiento
  const storage = createStorage(logger);
  
  // Crear el cliente API con getters para acceder a la configuración actualizada
  const apiClient = createApiClient(
    () => config,
    () => visitorManager.getVisitor(),
    () => sessionManager.getSession(),
    logger
  );
  
  // Crear managers (con dependencias circulares resueltas mediante inicialización posterior)
  const sessionManager = createSessionManager(
    {
      saveSession: storage.saveSession,
      loadSession: storage.loadSession
    },
    {
      push: () => {}, // Temporal, será reemplazado
      save: () => {}, // Temporal, será reemplazado
      findAndUpdateEvent: () => false // Temporal, será reemplazado
    },
    logger
  );

  const visitorManager = createVisitorManager(
    {
      saveVisitor: storage.saveVisitor,
      loadVisitor: storage.loadVisitor
    },
    {
      push: () => {}, // Temporal, será reemplazado
      save: () => {} // Temporal, será reemplazado
    },
    logger
  );

  // Crear el administrador de cola (ahora podemos pasarle el sessionManager real)
  const queueManager = createQueueManager(
    {
      loadQueue: storage.loadQueue,
      saveQueue: storage.saveQueue
    },
    apiClient,
    {
      setPendingUpdate: (isPending: boolean) => (sessionManager as any).setPendingUpdate(isPending),
      flushSessionBuffer: () => (sessionManager as any).flushSessionBuffer()
    },
    logger
  );

  // Resolver dependencias circulares actualizando las referencias
  // Update session queue adapter
  const sessionQueueAdapter = {
    push: (event: any) => queueManager.addEvent(event as OrwelEvent),
    save: () => {},  // No es necesario guardar aquí, addEvent ya lo hace
    findAndUpdateEvent: (type: string, data: any) => 
      queueManager.findAndUpdateEvent(type, data as OrwelEvent)
  };
  (sessionManager as any).queue = sessionQueueAdapter;

  // Update visitor queue adapter
  const visitorQueueAdapter = {
    push: (event: any) => queueManager.addEvent(event as OrwelEvent),
    save: () => {}  // No es necesario guardar aquí, addEvent ya lo hace
  };
  (visitorManager as any).queue = visitorQueueAdapter;

  const orwel: Orwel = {
    init: (opts: Config) => {
      config = opts;
      
      // Reinicializar logger con la configuración de depuración
      logger = createLogger({ 
        debug: opts.debug || false, 
        verbose: opts.verbose || false 
      });
      
      logger.info("Initializing Orwel SDK", {
        debug: opts.debug,
        verbose: opts.verbose
      });
      
      // Inicializar en el orden correcto
      queueManager.loadQueue();
      visitorManager.loadVisitor();
      sessionManager.loadSession();
      
      // Configurar event listeners
      window.addEventListener("beforeunload", orwel.flush);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          logger.debug("Page visibility changed to hidden, flushing queue");
          orwel.flush();
        }
      });
      
      // Auto-monitor si está habilitado en la configuración
      if (opts.autoMonitor) {
        logger.info("Auto monitoring enabled, starting monitors");
        orwel.monitor();
      }
      
      logger.success("Orwel SDK initialized successfully");
    },
    
    identify: (traits: Record<string, any> = {}) => {
      return visitorManager.identify(traits);
    },
    
    track: (code: string, properties: Record<string, any> = {}) => {
      const eventId = generateUUID();
      logger.info("Tracking event", { code, eventId });
      
      // Sanitize incoming properties
      const sanitizedProps = sanitizeData(properties);
      logger.debug("Sanitized event properties", sanitizedProps);
      
      queueManager.addEvent({ 
        type: "track", 
        code, 
        properties: sanitizedProps, 
        event: { id: eventId, code } 
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
    }
  };

  return orwel;
}

// Crear una instancia para uso interno
export const orwel: Orwel = createBrowserImplementation(); 