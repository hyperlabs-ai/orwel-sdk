import { Orwel, Config, OrwelEvent, FormOptions } from "../types";
import { createLogger, generateUUID } from "../utils";
import { startMonitoring } from "../monitoring";
import { createStorage } from "./storage";
import { createVisitorManager } from "./visitor";
import { createSessionManager } from "./session";
import { createApiClient } from "./api";
import { createQueueManager } from "./queue";
import { createFormTracker } from "./form";

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
      push: (event: any) => queueManager.addEvent(event as OrwelEvent),
      save: () => {},  // No es necesario guardar aquí, addEvent ya lo hace
      findAndUpdateEvent: (type: string, data: any) => 
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
      push: (event: any) => queueManager.addEvent(event as OrwelEvent),
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
    (code: string, properties: Record<string, any>) => orwel.track(code, properties),
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
      
      logger.info("Initializing Orwel SDK", {
        debug: opts.debug,
        verbose: opts.verbose
      });
      
      // Inicializar en el orden correcto
      queueManager.loadQueue();
      visitorManager.loadVisitor();
      sessionManager.loadSession();
      
      // Configurar event listeners
      window.addEventListener("beforeunload", (event) => {
        // Forzar actualización síncrona de la sesión antes de cerrar
        sessionManager.updateSession({
          finishedAt: new Date().toISOString(),
          status: 'closed'
        });
        
        // Forzar flush síncrono
        const result = orwel.flush();
        
        // Asegurar que el navegador espere a que se complete
        event.preventDefault();
        event.returnValue = '';
      });
      
      // Ya no marcamos la sesión como finalizada en visibilitychange
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          logger.debug("Page visibility changed to hidden, flushing queue");
          orwel.flush();  // Solo enviamos los eventos pendientes
        }
      });
      
      // Auto-monitor si está habilitado en la configuración
      if (opts.autoMonitor) {
        logger.info("Auto monitoring enabled, starting monitors");
        orwel.monitor();
      }
      
      logger.success("Orwel SDK v1.0.15 initialized successfully");
    },
    
    identify: (traits: Record<string, any> = {}) => {
      return visitorManager.identify(traits);
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

interface Session {
  id: string;
  status: 'active' | 'closed';
  startedAt: string;
  updatedAt?: string;
  finishedAt?: string;
  location?: {
    path: string;
    url: string;
    hash: string;
    search: string;
    hostname: string;
  };
  webVitals?: Record<string, any>;
  performance?: Record<string, any>;
  jsErrors?: Array<Record<string, any>>;
  memory?: Record<string, any>;
  networkRequests?: Array<Record<string, any>>;
  customProperties?: Record<string, any>;
} 