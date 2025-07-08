import { Visitor } from '../types';
import { generateUUID, collectBrowserInfo, createLogger, createBrowserFingerprint } from '../utils';
import { SDK_VERSION } from '../constants';

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
  },
  apiClient: {
    send: (event: any) => Promise<boolean>;
    resolveVisitor: (fingerprint: Record<string, any>) => Promise<string | null>;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Current visitor state
  let visitor: Visitor = {};

  // Auto-resolve visitor ID (called during init)
  const resolveVisitor = async () => {
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

  // Crear conversion con código y properties
  const conversion = (code: string, properties: Record<string, any> = {}) => {
    logger.info('Creating conversion', { code, properties });
    
    try {
      // Always queue the conversion event with code
      queue.push({ 
        type: 'conversion',
        code,
        properties,
        source: `orwel-sdk-v${SDK_VERSION}`,
        timestamp: new Date().toISOString()
      });
      queue.save();
      
      logger.success('Conversion created', { code });
      return { success: true };
    } catch (error) {
      logger.error('Failed to create conversion', error);
      return { success: false };
    }
  };

  return {
    loadVisitor,
    saveVisitor,
    resolveVisitor,
    identify,
    conversion,
    getVisitor: () => visitor
  };
} 