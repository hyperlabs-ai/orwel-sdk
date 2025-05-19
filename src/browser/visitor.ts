import { Visitor } from '../types';
import { generateUUID, collectBrowserInfo, createLogger } from '../utils';

const VISITOR_CONFIG = {
  MAX_TRAITS_SIZE: 1024 * 10,  // 10KB límite para traits
  REQUIRED_FIELDS: ['id'],     // Campos requeridos
  SENSITIVE_FIELDS: ['password', 'token', 'secret', 'key'], // Campos sensibles a filtrar
  COMPRESSION_THRESHOLD: 1024,  // Tamaño en bytes para activar compresión
  SAVE_DEBOUNCE: 1000,        // Tiempo de debounce para guardar
  MAX_RETRY_ATTEMPTS: 3       // Máximo de intentos de guardado
};

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
  let lastSave = Date.now();
  let pendingSave: Visitor | null = null;
  let saveTimeout: NodeJS.Timeout | null = null;
  let saveAttempts = 0;

  // Validar y sanitizar traits
  const validateTraits = (traits: Record<string, any>): Record<string, any> => {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(traits)) {
      // Saltar campos sensibles
      if (VISITOR_CONFIG.SENSITIVE_FIELDS.includes(key.toLowerCase())) {
        logger.warning(`Skipping sensitive field: ${key}`);
        continue;
      }
      
      // Validar tipos de datos
      if (typeof value === 'function' || value instanceof Promise) {
        logger.warning(`Invalid value type for trait: ${key}`);
        continue;
      }
      
      // Limitar tamaño de strings
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.slice(0, 1000);
        logger.warning(`Truncated long string trait: ${key}`);
        continue;
      }
      
      // Validar objetos anidados
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          sanitized[key] = value.slice(0, 100); // Limitar arrays a 100 elementos
        } else {
          sanitized[key] = validateTraits(value); // Recursivamente validar objetos
        }
        continue;
      }
      
      sanitized[key] = value;
    }
    
    return sanitized;
  };

  // Comprimir datos si es necesario
  const maybeCompressData = (data: Record<string, any>): Record<string, any> => {
    const size = new TextEncoder().encode(JSON.stringify(data)).length;
    
    if (size > VISITOR_CONFIG.COMPRESSION_THRESHOLD) {
      // Estrategia de compresión:
      // 1. Mantener campos requeridos
      // 2. Truncar strings largos
      // 3. Limitar profundidad de objetos
      // 4. Eliminar datos redundantes
      const compressed = {
        id: data.id, // Siempre mantener ID
        ...Object.entries(data)
          .filter(([k, v]) => {
            if (k === 'id') return false; // Ya incluido
            if (v === null || v === undefined) return false;
            if (typeof v === 'string' && v.length > 100) return false;
            return true;
          })
          .reduce((acc, [k, v]) => {
            // Comprimir valores según su tipo
            if (typeof v === 'string') {
              acc[k] = v.length > 100 ? v.slice(0, 100) + '...' : v;
            } else if (Array.isArray(v)) {
              acc[k] = v.slice(0, 10); // Limitar arrays
            } else if (typeof v === 'object') {
              // Limitar profundidad de objetos
              const flatObj = Object.entries(v).reduce((o, [key, val]) => {
                if (typeof val !== 'object') o[key] = val;
                return o;
              }, {} as Record<string, any>);
              if (Object.keys(flatObj).length > 0) acc[k] = flatObj;
            } else {
              acc[k] = v;
            }
            return acc;
          }, {} as Record<string, any>)
      };
      
      const compressedSize = new TextEncoder().encode(JSON.stringify(compressed)).length;
      logger.debug('Compressed visitor data', {
        originalSize: size,
        compressedSize,
        compressionRatio: ((size - compressedSize) / size * 100).toFixed(1) + '%'
      });
      
      return compressed;
    }
    
    return data;
  };

  // Cargar visitor desde almacenamiento
  const loadVisitor = () => {
    try {
      visitor = storage.loadVisitor();

      if (!visitor.id) {
        visitor.id = generateUUID();
        saveVisitor();
        logger.debug('New visitor ID created', { id: visitor.id });
      } else {
        // Validar datos cargados
        visitor = validateTraits(visitor);
        logger.debug('Visitor loaded from storage', { id: visitor.id });
      }
    } catch (error) {
      logger.error('Failed to load visitor from storage', error);
      // Crear nuevo visitor en caso de error
      visitor = { id: generateUUID() };
      saveVisitor();
    }
  };

  // Guardar visitor con debounce y retry
  const saveVisitor = () => {
    const now = Date.now();
    
    // Actualizar datos pendientes
    pendingSave = { ...visitor };
    
    // Si hay un guardado programado, no hacer nada
    if (saveTimeout) return;
    
    // Programar próximo guardado
    saveTimeout = setTimeout(() => {
      if (!pendingSave) return;
      
      try {
        const dataToSave = maybeCompressData(pendingSave);
        storage.saveVisitor(dataToSave);
        lastSave = Date.now();
        saveAttempts = 0;
        pendingSave = null;
        saveTimeout = null;
        logger.debug('Visitor saved to storage', { id: visitor.id });
      } catch (error) {
        logger.error('Failed to save visitor to storage', error);
        
        // Reintentar si no excedimos el límite
        if (saveAttempts < VISITOR_CONFIG.MAX_RETRY_ATTEMPTS) {
          saveAttempts++;
          saveTimeout = setTimeout(saveVisitor, 1000 * saveAttempts);
          logger.debug('Retrying visitor save', { attempt: saveAttempts });
        } else {
          logger.error('Max retry attempts reached, visitor data may be lost');
          pendingSave = null;
          saveTimeout = null;
          saveAttempts = 0;
        }
      }
    }, VISITOR_CONFIG.SAVE_DEBOUNCE);
  };

  // Identificar visitor con traits
  const identify = (traits: Record<string, any> = {}) => {
    logger.info('Identifying visitor', traits);
    
    try {
      // Validar tamaño total de traits
      const traitsSize = new TextEncoder().encode(JSON.stringify(traits)).length;
      if (traitsSize > VISITOR_CONFIG.MAX_TRAITS_SIZE) {
        logger.warning('Traits size exceeds limit, truncating data');
        return { success: false, visitorId: visitor.id || '', error: 'TRAITS_TOO_LARGE' };
      }
      
      // Collect browser info and merge with provided traits
      const browserInfo = collectBrowserInfo();
      // Validar y sanitizar traits
      const sanitizedTraits = validateTraits({ ...browserInfo, ...traits });
      
      // Generate UUID if visitor doesn't have an ID
      if (!visitor.id && !sanitizedTraits.id) {
        sanitizedTraits.id = generateUUID();
        logger.debug('Generated new visitor ID', { id: sanitizedTraits.id });
      } else if (visitor.id && !sanitizedTraits.id) {
        sanitizedTraits.id = visitor.id;
      }
      
      visitor = { ...visitor, ...sanitizedTraits };
      
      // Comprimir y guardar
      saveVisitor();
      
      // Queue identify event con datos comprimidos
      const eventData = maybeCompressData({ type: 'identify', traits: sanitizedTraits });
      queue.push(eventData);
      queue.save();
      
      logger.success('Visitor identified', { id: sanitizedTraits.id || visitor.id });
      return { success: true, visitorId: sanitizedTraits.id || visitor.id || '' };
    } catch (error) {
      logger.error('Failed to identify visitor', error);
      return { success: false, visitorId: visitor.id || '', error: 'IDENTIFY_FAILED' };
    }
  };

  return {
    loadVisitor,
    saveVisitor,
    identify,
    getVisitor: () => ({ ...visitor }), // Retornar copia para prevenir mutaciones
    // Método para forzar guardado inmediato (útil para tests y cleanup)
    forceSave: () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      if (pendingSave) {
        const dataToSave = maybeCompressData(pendingSave);
        storage.saveVisitor(dataToSave);
        pendingSave = null;
      }
    }
  };
} 