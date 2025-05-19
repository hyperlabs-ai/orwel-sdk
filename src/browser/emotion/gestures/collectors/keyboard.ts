import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";

/**
 * Crea un recolector de eventos de teclado
 */
export function createKeyboardTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Configuración
  const MAX_HISTORY_SIZE = 50;
  const PATTERN_CHECK_INTERVAL = 2000;
  const MIN_BACKSPACE_SEQUENCE = 5;
  
  // Estado para tracking con límite de tamaño
  let keyPressHistory: Array<{
    key: string;
    timestamp: number;
    target?: string;
  }> = [];
  let isTracking = false;
  let patternInterval: number | null = null;

  // Sanitizar datos de evento antes de almacenar
  const sanitizeEventData = (key: string, target?: Element): { key: string; target?: string } => {
    // Limitar longitud de strings y eliminar caracteres especiales
    const sanitizedKey = key.slice(0, 50).replace(/[^\w\s-]/g, '');
    
    // Solo guardar id o tipo del elemento, no la referencia completa
    let sanitizedTarget: string | undefined;
    if (target instanceof Element) {
      sanitizedTarget = target.id || target.tagName || undefined;
      if (sanitizedTarget) {
        sanitizedTarget = sanitizedTarget.slice(0, 50).replace(/[^\w\s-]/g, '');
      }
    }

    return { key: sanitizedKey, target: sanitizedTarget };
  };

  // Manejar eventos de teclado
  const handleKeyDown = (event: KeyboardEvent) => {
    try {
      const { key, target } = sanitizeEventData(event.key, event.target as Element);
      
      // Añadir al historial con límite de tamaño
      keyPressHistory.push({ 
        key, 
        timestamp: Date.now(),
        target 
      });
      
      // Mantener tamaño máximo del historial
      if (keyPressHistory.length > MAX_HISTORY_SIZE) {
        keyPressHistory.shift();
      }

      // Enviar evento de tecla
      onEvent({
        type: 'keydown',
        timestamp: Date.now(),
        data: {
          key,
          target,
          isModifier: event.ctrlKey || event.altKey || event.metaKey,
          isRepeat: event.repeat
        }
      });
    } catch (error) {
      logger.error("Error handling keydown event", { error });
    }
  };

  // Detectar patrones de escritura (borrado repetido, etc)
  const detectKeyboardPatterns = () => {
    try {
      // Verificar si hay suficientes eventos para análisis
      if (keyPressHistory.length < MIN_BACKSPACE_SEQUENCE) return;
      
      // Limpiar eventos antiguos (más de 30 segundos)
      const now = Date.now();
      keyPressHistory = keyPressHistory.filter(
        event => now - event.timestamp < 30000
      );
      
      // Contar retrocesos consecutivos
      let backspaceCount = 0;
      let maxConsecutiveBackspace = 0;
      let lastTarget: string | undefined;
      
      for (const event of keyPressHistory) {
        if (event.key === 'Backspace' && event.target === lastTarget) {
          backspaceCount++;
          maxConsecutiveBackspace = Math.max(maxConsecutiveBackspace, backspaceCount);
        } else {
          backspaceCount = 0;
        }
        lastTarget = event.target;
      }
      
      // Si hay muchos retrocesos consecutivos, enviar evento de frustración
      if (maxConsecutiveBackspace >= MIN_BACKSPACE_SEQUENCE) {
        onEvent({
          type: 'form_rage',
          timestamp: now,
          data: {
            backspaceCount: maxConsecutiveBackspace,
            pattern: 'repeated_backspace',
            target: lastTarget
          }
        });
        
        // Limpiar historial para no detectar el mismo patrón repetidamente
        keyPressHistory = [];
      }
    } catch (error) {
      logger.error("Error detecting keyboard patterns", { error });
    }
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Añadir event listeners
      window.addEventListener('keydown', handleKeyDown);
      
      // Intervalo para detección periódica de patrones
      patternInterval = window.setInterval(detectKeyboardPatterns, PATTERN_CHECK_INTERVAL);
      
      isTracking = true;
      logger.debug("Keyboard tracker initialized");
    } catch (error) {
      logger.error("Failed to initialize keyboard tracker", { error });
      destroy(); // Limpiar en caso de error
    }
  };

  // Limpiar recursos
  const destroy = () => {
    try {
      window.removeEventListener('keydown', handleKeyDown);
      
      if (patternInterval !== null) {
        window.clearInterval(patternInterval);
        patternInterval = null;
      }
      
      keyPressHistory = [];
      isTracking = false;
      
      logger.debug("Keyboard tracker destroyed");
    } catch (error) {
      logger.error("Error destroying keyboard tracker", { error });
    }
  };

  return {
    init,
    destroy
  };
} 