import { Orwel, Config, OrwelEvent, FormOptions, ExperimentVariants } from "../types";
import { 
  createLogger, 
  generateUUID, 
  validateRequired, 
  validateString, 
  validateObject, 
  validateApiKey, 
  validateEventCode,
  validateEmailIfPresent 
} from "../utils";
import { startMonitoring } from "../monitoring";
import { createStorage } from "./storage";
import { createVisitorManager } from "./visitor";
import { createSessionManager } from "./session";
import { createApiClient } from "./api";
import { createQueueManager } from "./queue";
import { createFormTracker } from "./form";
import { createAutoEventDetection } from "../auto-detection";
import { SDK_VERSION } from "../constants";

/** Deterministic 32-bit FNV-1a hash → float in [0, 1). Used for sticky variant assignment. */
function hashToUnit(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Pick a variant key from the variants spec given a deterministic unit value u in [0, 1). */
function pickExperimentVariant(variants: ExperimentVariants, keys: string[], u: number): string {
  const weighted = Array.isArray(variants)
    ? variants.map((v) => (typeof v === "string" ? { key: v, weight: 1 } : { key: v.key, weight: v.weight ?? 1 }))
    : keys.map((k) => ({ key: k, weight: 1 }));
  const total = weighted.reduce((sum, v) => sum + v.weight, 0) || 1;
  let r = u * total;
  for (const v of weighted) {
    r -= v.weight;
    if (r < 0) return v.key;
  }
  return weighted[weighted.length - 1].key;
}

/**
 * Creates a browser implementation of the Orwel SDK
 */
export function createBrowserImplementation(): Orwel {
  // Configuration and state
  let config: Config = {} as Config;
  let isMonitoring = false;
  let beforeUnloadExecuted = false;
  let logger = createLogger({ debug: false, verbose: false });
  let autoDetection: ReturnType<typeof createAutoEventDetection> | null = null;
  // Experiments already exposed in this page lifecycle (dedupe exposure firing).
  const exposedExperiments = new Set<string>();

  // Create the storage manager
  const storage = createStorage(logger);
  
  // Create the API client with getters to access the updated configuration
  const apiClient = createApiClient(
    () => config,
    () => visitorManager.getVisitor(),
    () => sessionManager.getSession(),
    logger
  );
  
  // Create the queue manager first
  const queueManager = createQueueManager(
    {
      loadQueue: storage.loadQueue,
      saveQueue: storage.saveQueue
    },
    apiClient,
    {
      setPendingUpdate: (isPending: boolean) => {},  // Temporary, will be replaced
      flushSessionBuffer: () => {}  // Temporary, will be replaced
    },
    logger
  );

  // Create managers (with circular dependencies resolved by later initialization)
  const sessionManager = createSessionManager(
    {
      saveSession: storage.saveSession,
      loadSession: storage.loadSession
    },
    {
      push: (event: OrwelEvent) => queueManager.addEvent(event),
      save: () => {},  // Not necessary to save here, addEvent already does it
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
      save: () => {},
      flush: (force?: boolean) => queueManager.flush(force)
    },
    apiClient,
    logger
  );

  // Update references in the queue manager to resolve circular dependencies
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
      try {
        validateRequired(opts, 'config');
        validateObject(opts, 'config');
        validateApiKey(opts.apiKey);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
        logger.error("Failed to initialize Orwel SDK", { error: errorMessage });
        throw new Error(`Orwel SDK initialization failed: ${errorMessage}`);
      }
      
      config = opts;
      
      // Reinitialize logger with the debug configuration
      logger = createLogger({ 
        debug: opts.debug || false, 
        verbose: opts.verbose || false 
      });
      
      logger.info(`Initializing Orwel SDK v${SDK_VERSION}`, {
        debug: opts.debug,
        verbose: opts.verbose,
        autoEventDetection: opts.autoEventDetection
      });
      
      // Initialize in the correct order
      queueManager.loadQueue();
      
      // Load and create the session
      const { session: sessionData, isNewSession } = sessionManager.loadSession();
      
      // Start visitor resolution and handle session after it completes
      visitorManager.resolveVisitor().then(() => {
        // Now that the visitor is resolved, we can send the session if it's new
        if (isNewSession) {
          logger.debug("New session detected, sending session event with resolved visitor");
          
          const sessionEvent = {
            type: "session",
            isNewSession: true,
            sessionData: sessionManager.getSession(),
            timestamp: new Date().toISOString()
          };
          
          // Send session event directly without using the queue
          apiClient.send(sessionEvent)
            .then(success => {
              if (success) {
                logger.success("Initial session event sent successfully with visitor data");
                if (queueManager.getQueue().length > 0) {
                  logger.debug("Processing queued events after session creation");
                  queueManager.flush();
                }
              } else {
                logger.warning("Initial session event failed, dropping without retry");
              }
            });
        }
      }).catch(error => {
        logger.error('Visitor resolution failed', error);
        
        if (isNewSession) {
          logger.debug("Sending session event despite visitor resolution failure");
          
          const sessionEvent = {
            type: "session",
            isNewSession: true,
            sessionData: sessionManager.getSession(),
            timestamp: new Date().toISOString()
          };
          
          queueManager.addEvent(sessionEvent);
        }
      });
      
      // Configurar event listeners
      window.addEventListener("beforeunload", (event) => {
        if (beforeUnloadExecuted) return;
        beforeUnloadExecuted = true;
        
        const sectionEngagements = autoDetection?.getDetectionEngine()?.getSectionEngagementData() || [];

        sessionManager.updateSession({
          finishedAt: new Date().toISOString(),
          status: 'closed',
          sectionEngagements: sectionEngagements
        }, true);
        
        const pendingEvents = queueManager.getQueueAndClear();
        if (pendingEvents.length > 0) {
          const hardcodedApiUrl = "https://api.orwel.io/ingest";
          
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
        if (document.visibilityState === "hidden" && !beforeUnloadExecuted) {
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
      try {
        validateObject(traits, 'traits');
        validateEmailIfPresent(traits);
        return visitorManager.identify(traits);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown identify error';
        logger.error("Invalid parameters for identify", { error: errorMessage });
        throw new Error(`Identify failed: ${errorMessage}`);
      }
    },
    
    conversion: (code: string, properties: Record<string, any> = {}) => {
      try {
        validateEventCode(code);
        validateObject(properties, 'properties');
        validateEmailIfPresent(properties);
        return visitorManager.conversion(code, properties);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
        logger.error("Invalid parameters for conversion", { error: errorMessage, code, properties });
        throw new Error(`Conversion failed: ${errorMessage}`);
      }
    },
    
    track: (code: string, properties = {}) => {
      try {
        validateEventCode(code);
        validateObject(properties, 'properties');
        
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown track error';
        logger.error("Invalid parameters for track", { error: errorMessage, code, properties });
        throw new Error(`Track failed: ${errorMessage}`);
      }
    },
    
    session: (properties: Record<string, any> = {}) => {
      try {
        validateObject(properties, 'properties');
        return sessionManager.updateSession(properties);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown session error';
        logger.error("Invalid parameters for session", { error: errorMessage });
        throw new Error(`Session update failed: ${errorMessage}`);
      }
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
      try {
        validateRequired(formElement, 'formElement');
        if (!(formElement instanceof HTMLFormElement)) {
          throw new Error('formElement must be an HTMLFormElement');
        }
        validateObject(options, 'options');
        
        formTracker.trackForm(formElement, options);
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown form error';
        logger.error("Invalid parameters for form tracking", { error: errorMessage });
        return { success: false, error: errorMessage };
      }
    },

    experiment: (key: string, variants: ExperimentVariants): string => {
      const valueMap = Array.isArray(variants) ? null : variants;
      const keys = Array.isArray(variants)
        ? variants.map((v) => (typeof v === "string" ? v : v.key))
        : Object.keys(variants);
      const valueFor = (k: string): string => (valueMap ? valueMap[k] ?? "" : k);
      try {
        if (keys.length === 0) return valueFor("");
        const visitor = visitorManager.getVisitor();
        const seed = visitor && visitor.id ? String(visitor.id) : "anon";
        const variant = pickExperimentVariant(variants, keys, hashToUnit(`${seed}:${key}`));
        // Fire the exposure once per page lifecycle (distinct-visitor counting handles repeats).
        if (!exposedExperiments.has(key)) {
          exposedExperiments.add(key);
          orwel.track("optimize_experiment_impression", { experiment: key, variant });
        }
        logger.debug("Experiment assigned", { key, variant });
        return valueFor(variant);
      } catch (error) {
        logger.error("experiment() failed, returning first variant", { error });
        return valueFor(keys[0] ?? "");
      }
    }
  };

  return orwel;
}

// Create an instance for internal use
export const orwel: Orwel = createBrowserImplementation(); 