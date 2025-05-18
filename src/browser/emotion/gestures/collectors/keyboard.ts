import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";

/**
 * Crea un recolector de eventos de teclado
 */
export function createKeyboardTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Estado para tracking
  let isTracking = false;
  let keyPressHistory: { key: string; timestamp: number; }[] = [];
  const keysDown = new Set<string>();
  let lastTypingTime = 0;
  
  // Función para manejar teclas presionadas
  const handleKeyDown = (e: KeyboardEvent) => {
    const now = Date.now();
    const target = e.target as HTMLElement;
    
    // Ignorar teclas modificadoras solas
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return;
    }
    
    // Registrar la tecla como presionada
    keysDown.add(e.key);
    
    // Obtener información del elemento
    const targetId = target?.id || '';
    const targetTag = target?.tagName?.toLowerCase() || '';
    const isInputField = 
      targetTag === 'input' || 
      targetTag === 'textarea' || 
      target?.hasAttribute('contenteditable');
    
    // Crear y enviar el evento
    onEvent({
      type: 'keydown',
      timestamp: now,
      data: {
        key: e.key,
        isTyping: isInputField,
        target: targetId || targetTag,
        targetType: targetTag,
        modifiers: {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey
        }
      }
    });
    
    // Si está escribiendo en un campo, rastrear para análisis de patrón de escritura
    if (isInputField) {
      keyPressHistory.push({ key: e.key, timestamp: now });
      
      // Mantener solo los últimos 50 eventos
      if (keyPressHistory.length > 50) {
        keyPressHistory.shift();
      }
      
      // Analizar pausas en la escritura
      if (lastTypingTime > 0) {
        const timeSinceLastType = now - lastTypingTime;
        
        // Detectar pausa significativa (más de 2 segundos)
        if (timeSinceLastType > 2000) {
          onEvent({
            type: 'typing_pause',
            timestamp: now,
            data: {
              pauseDuration: timeSinceLastType,
              target: targetId || targetTag,
              targetType: targetTag
            }
          });
        }
      }
      
      lastTypingTime = now;
    }
  };
  
  // Función para manejar teclas liberadas
  const handleKeyUp = (e: KeyboardEvent) => {
    // Eliminar la tecla de las presionadas
    keysDown.delete(e.key);
  };
  
  // Detectar patrones de escritura (borrado repetido, etc)
  const detectKeyboardPatterns = () => {
    // Verificar si hay suficientes eventos para análisis
    if (keyPressHistory.length < 5) return;
    
    // Contar retrocesos consecutivos
    let backspaceCount = 0;
    let maxConsecutiveBackspace = 0;
    
    for (let i = 0; i < keyPressHistory.length; i++) {
      if (keyPressHistory[i].key === 'Backspace') {
        backspaceCount++;
        maxConsecutiveBackspace = Math.max(maxConsecutiveBackspace, backspaceCount);
      } else {
        backspaceCount = 0;
      }
    }
    
    // Si hay muchos retrocesos consecutivos, enviar evento de frustración
    if (maxConsecutiveBackspace >= 5) {
      onEvent({
        type: 'form_rage',
        timestamp: Date.now(),
        data: {
          backspaceCount: maxConsecutiveBackspace,
          pattern: 'repeated_backspace'
        }
      });
      
      // Limpiar historial para no detectar el mismo patrón repetidamente
      keyPressHistory = [];
    }
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Añadir event listeners
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      // Intervalo para detección periódica de patrones
      const patternInterval = setInterval(detectKeyboardPatterns, 2000);
      
      isTracking = true;
      logger.debug("Keyboard tracker initialized");
      
      // Asegurarse de limpiar el intervalo al destruir
      (window as any).__orwelKeyboardPatternInterval = patternInterval;
    } catch (error) {
      logger.error("Failed to initialize keyboard tracker", { error });
    }
  };
  
  // Detener el tracking
  const destroy = () => {
    if (!isTracking) return;
    
    try {
      // Eliminar event listeners
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      // Limpiar intervalo
      const patternInterval = (window as any).__orwelKeyboardPatternInterval;
      if (patternInterval) {
        clearInterval(patternInterval);
        delete (window as any).__orwelKeyboardPatternInterval;
      }
      
      isTracking = false;
      logger.debug("Keyboard tracker destroyed");
    } catch (error) {
      logger.error("Failed to destroy keyboard tracker", { error });
    }
  };
  
  return {
    init,
    destroy
  };
} 