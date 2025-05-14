import { Visitor } from '../types';
import { generateUUID, collectBrowserInfo, createLogger } from '../utils';

/**
 * Creates a visitor manager that handles visitor identification and persistence
 */
export function createVisitorManager(
  // Dependencias externas requeridas
  storage: {
    saveVisitor: (visitor: Visitor) => void;
    loadVisitor: () => Visitor;
  },
  queue: {
    push: (event: any) => void;
    save: () => void;
  },
  logger: ReturnType<typeof createLogger>
) {
  // Current visitor state
  let visitor: Visitor = {};

  // Cargar visitor desde almacenamiento
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
    
    // Collect browser info and merge with provided traits
    const browserInfo = collectBrowserInfo();
    // Only include browser info that isn't explicitly provided by the user
    const mergedTraits = { ...browserInfo, ...traits };
    
    // Generate UUID if visitor doesn't have an ID
    if (!visitor.id && !mergedTraits.id) {
      mergedTraits.id = generateUUID();
      logger.debug('Generated new visitor ID', { id: mergedTraits.id });
    } else if (visitor.id && !mergedTraits.id) {
      mergedTraits.id = visitor.id;
    }
    
    visitor = { ...visitor, ...mergedTraits };
    saveVisitor();
    queue.push({ type: 'identify', traits: mergedTraits });
    queue.save();
    
    logger.success('Visitor identified', { id: mergedTraits.id || visitor.id });
    return { success: true, visitorId: mergedTraits.id || visitor.id || '' };
  };

  return {
    loadVisitor,
    saveVisitor,
    identify,
    getVisitor: () => visitor
  };
} 