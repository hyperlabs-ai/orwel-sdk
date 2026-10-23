import { Visitor } from '../types';
import { generateUUID, collectBrowserInfo, createLogger, createBrowserFingerprint, getAttribution } from '../utils';
import { SDK_VERSION } from '../constants';

// Max time conversion() will wait for visitor-id resolution before giving up.
const VISITOR_RESOLUTION_TIMEOUT = 5000;

/**
 * Creates a visitor manager that handles visitor identification and persistence
 */
export function createVisitorManager(
  storage: {
    saveVisitor: (visitor: Visitor) => void;
    loadVisitor: () => Visitor;
  },
  queue: {
    push: (event: any) => void;
    save: () => void;
    flush: (force?: boolean) => Promise<{ success: boolean; count: number }>;
  },
  apiClient: {
    send: (event: any) => Promise<boolean>;
    sendBatch: (events: any[]) => Promise<{ success: boolean; failedEvents: any[] }>;
    resolveVisitor: (fingerprint: Record<string, any>) => Promise<string | null>;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Current visitor state
  let visitor: Visitor = {};

  // In-flight visitor-id resolution. Memoized so init() and conversion() share
  // the same resolution instead of racing two of them.
  let resolutionPromise: Promise<void> | null = null;

  // Auto-resolve visitor ID (called during init). Memoized: repeated calls return
  // the same in-flight promise.
  const resolveVisitor = (): Promise<void> => {
    if (!resolutionPromise) {
      resolutionPromise = doResolveVisitor();
    }
    return resolutionPromise;
  };

  const doResolveVisitor = async () => {
    try {
      visitor = storage.loadVisitor();

      if (!visitor.id) {
        logger.debug('No visitor ID found, resolving from server...');
        
        // Generate fingerprint and request from server using apiClient
        const fingerprint = createBrowserFingerprint();
        const serverVisitorId = await apiClient.resolveVisitor(fingerprint);
        
        if (serverVisitorId) {
          visitor.id = serverVisitorId;
          logger.success('Visitor ID resolved from server', { id: visitor.id });
        } else {
          // Fallback to local UUID if server fails
          visitor.id = generateUUID();
          logger.warning('Server resolution failed, using local UUID', { id: visitor.id });
        }
        
        // Auto-identify with browser info
        const browserInfo = collectBrowserInfo();
        visitor = { ...visitor, ...browserInfo, id: visitor.id };
        
        saveVisitor();
        
        // Queue automatic identify event
        queue.push({ type: 'identify', traits: visitor });
        queue.save();
        
      } else {
        logger.debug('Visitor loaded from storage', { id: visitor.id });
      }
    } catch (error) {
      logger.error('Failed to resolve visitor', error);
      if (!visitor.id) {
        visitor.id = generateUUID();
        const browserInfo = collectBrowserInfo();
        visitor = { ...visitor, ...browserInfo };
        saveVisitor();
        logger.warning('Using fallback local visitor ID', { id: visitor.id });
      }
    }
  };

  // Cargar visitor desde almacenamiento (legacy method)
  const loadVisitor = () => {
    try {
      visitor = storage.loadVisitor();

      if (!visitor.id) {
        visitor.id = generateUUID();
        saveVisitor();
        logger.debug('New visitor ID created', { id: visitor.id });
      } else {
        logger.debug('Visitor loaded from storage', { id: visitor.id });
      }
    } catch (error) {
      logger.error('Failed to load visitor from storage', error);
    }
  };

  // Guardar visitor en almacenamiento
  const saveVisitor = () => {
    try {
      storage.saveVisitor(visitor);
      logger.debug('Visitor saved to storage', { id: visitor.id });
    } catch (error) {
      logger.error('Failed to save visitor to storage', error);
    }
  };

  // Identificar visitor con traits
  const identify = (traits: Record<string, any> = {}) => {
    logger.info('Identifying visitor', traits);
    
    try {
      // Collect browser info and merge with provided traits
      const browserInfo = collectBrowserInfo();
      const mergedTraits = { ...browserInfo, ...traits };
      
      // Generate UUID if visitor doesn't have an ID
      if (!visitor.id && !mergedTraits.id) {
        mergedTraits.id = generateUUID();
        logger.debug('Generated new visitor ID', { id: mergedTraits.id });
      } else if (visitor.id && !mergedTraits.id) {
        mergedTraits.id = visitor.id;
      }
      
      visitor = { ...visitor, ...mergedTraits };
      
      // Try to save, but continue even if it fails
      try {
        saveVisitor();
      } catch (error) {
        logger.warning('Failed to persist visitor data', error);
      }
      
      // Always queue the identify event
      queue.push({ type: 'identify', traits: mergedTraits });
      queue.save();
      
      logger.success('Visitor identified', { id: mergedTraits.id || visitor.id });
      return { success: true, visitorId: mergedTraits.id || visitor.id || '' };
    } catch (error) {
      logger.error('Failed to identify visitor', error);
      return { success: false, visitorId: visitor.id || '' };
    }
  };

  // Wait until the visitor id is resolved (server or local fallback). Returns
  // true once `visitor.id` exists, false if resolution doesn't finish in time.
  const ensureVisitorResolved = async (timeoutMs: number = VISITOR_RESOLUTION_TIMEOUT): Promise<boolean> => {
    if (visitor.id) return true;

    // Kick off resolution if init hasn't already (memoized, so this is safe).
    const resolved = resolveVisitor();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });

    try {
      await Promise.race([resolved, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    return !!visitor.id;
  };

  const conversion = async (
    code: string,
    properties: Record<string, any> = {}
  ): Promise<{ success: boolean; reason?: string }> => {
    logger.info('Creating conversion', { code, properties });

    try {
      // Gate on visitor-id resolution. A conversion sent before the visitor id
      // resolves arrives at the server with no resolvable destinatario and never
      // attaches to a visitor — the lead silently disappears. Wait for it first.
      const resolved = await ensureVisitorResolved();
      if (!resolved || !visitor.id) {
        logger.error('Conversion aborted: visitor id not resolved', { code });
        return { success: false, reason: 'visitor_unresolved' };
      }

      const attribution = getAttribution();

      const conversionEvent = {
        type: 'conversion',
        code,
        properties,
        source: `orwel-sdk-v${SDK_VERSION}`,
        timestamp: new Date().toISOString(),
        // Stable id so server-side retries of the same conversion are idempotent.
        conversionId: generateUUID(),
        ...(attribution ? { attribution } : {})
      };

      // Send the conversion in its own batch. Going through the queue bundled it
      // with all pending telemetry (each event carries a copy of the session,
      // ~40 KB per flush); ingest then took longer than the batch timeout and the
      // conversion resolved delivery_failed even though the server stored it.
      logger.info('Sending conversion in its own batch', { code });
      const result = await apiClient.sendBatch([conversionEvent]);
      const success = result.success && result.failedEvents.length === 0;

      if (success) {
        logger.success('Conversion sent and acknowledged', { code, result });
        return { success: true };
      }

      logger.error('Conversion flush did not acknowledge delivery', { code, result });
      return { success: false, reason: 'delivery_failed' };
    } catch (error) {
      logger.error('Failed to create conversion', error);
      return { success: false, reason: 'error' };
    }
  };

  return {
    loadVisitor,
    saveVisitor,
    resolveVisitor,
    isResolved: () => !!visitor.id,
    identify,
    conversion,
    getVisitor: () => visitor
  };
} 