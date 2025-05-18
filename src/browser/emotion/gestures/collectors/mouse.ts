import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";
import { throttle } from "../../../../utils";

/**
 * Crea un recolector de eventos de mouse
 */
export function createMouseTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Estado para tracking
  let isTracking = false;
  let lastPosition = { x: 0, y: 0 };
  let lastMoveTime = 0;
  let lastClickTime = 0;
  let velocityHistory: { x: number; y: number; timestamp: number }[] = [];
  
  // Función para manejar movimientos del mouse
  const handleMouseMove = throttle((e: MouseEvent) => {
    const now = Date.now();
    const x = e.clientX;
    const y = e.clientY;
    
    // Calcular velocidad
    const timeDiff = now - lastMoveTime;
    if (lastMoveTime > 0 && timeDiff > 0) {
      const dx = x - lastPosition.x;
      const dy = y - lastPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const velocity = distance / timeDiff * 1000; // pixels/second
      
      // Mantener historial de velocidad
      velocityHistory.push({ x, y, timestamp: now });
      if (velocityHistory.length > 20) {
        velocityHistory.shift();
      }
      
      // Determinar si hay erratic cursor
      if (velocityHistory.length >= 3) {
        const isErratic = detectErraticMovement(velocityHistory);
        if (isErratic) {
          onEvent({
            type: 'erratic_cursor',
            timestamp: now,
            data: { x, y, velocity }
          });
        }
      }
      
      onEvent({
        type: 'mousemove',
        timestamp: now,
        data: { x, y, velocity, dx, dy }
      });
    }
    
    lastPosition = { x, y };
    lastMoveTime = now;
  }, 50); // Limitar a 20 eventos por segundo
  
  // Función para manejar clicks
  const handleClick = (e: MouseEvent) => {
    const now = Date.now();
    const x = e.clientX;
    const y = e.clientY;
    
    // Determinar el elemento target
    const target = e.target as HTMLElement;
    const targetId = target.id || '';
    const targetTag = target.tagName.toLowerCase();
    const targetClasses = Array.from(target.classList).join(' ');
    
    onEvent({
      type: 'click',
      timestamp: now,
      data: { 
        x, 
        y, 
        button: e.button, 
        target: targetId || targetTag, 
        targetType: targetTag,
        targetClasses
      }
    });
    
    lastClickTime = now;
  };
  
  // Función para manejar hover
  const handleMouseOver = throttle((e: MouseEvent) => {
    const now = Date.now();
    const target = e.target as HTMLElement;
    
    if (!target) return;
    
    // Obtener información del elemento
    const targetId = target.id || '';
    const targetTag = target.tagName.toLowerCase();
    const isInteractive = 
      targetTag === 'button' || 
      targetTag === 'a' || 
      targetTag === 'input' || 
      targetTag === 'select' || 
      targetTag === 'textarea' ||
      target.hasAttribute('role');
    
    if (isInteractive) {
      onEvent({
        type: 'hover',
        timestamp: now,
        data: {
          element: targetId || targetTag,
          elementType: targetTag,
          interactive: isInteractive
        }
      });
    }
  }, 300); // Limitar a un evento cada 300ms
  
  // Detectar movimientos erráticos del cursor
  const detectErraticMovement = (history: { x: number; y: number; timestamp: number }[]): boolean => {
    if (history.length < 3) return false;
    
    // Calcular cambios de dirección
    let directionChanges = 0;
    let previousVector = { x: 0, y: 0 };
    
    for (let i = 1; i < history.length; i++) {
      const current = history[i];
      const previous = history[i - 1];
      
      // Vector de movimiento
      const vector = {
        x: current.x - previous.x,
        y: current.y - previous.y
      };
      
      // Ignorar movimientos muy pequeños
      if (Math.abs(vector.x) < 5 && Math.abs(vector.y) < 5) continue;
      
      // Primer vector, solo guardarlo
      if (i === 1) {
        previousVector = vector;
        continue;
      }
      
      // Calcular el ángulo entre vectores
      const dotProduct = vector.x * previousVector.x + vector.y * previousVector.y;
      const magnitudeA = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
      const magnitudeB = Math.sqrt(previousVector.x * previousVector.x + previousVector.y * previousVector.y);
      
      // Evitar división por cero
      if (magnitudeA === 0 || magnitudeB === 0) continue;
      
      const cosAngle = dotProduct / (magnitudeA * magnitudeB);
      const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle))) * (180 / Math.PI);
      
      // Un cambio significativo de dirección es mayor a 90 grados
      if (angle > 90) {
        directionChanges++;
      }
      
      previousVector = vector;
    }
    
    // Muchos cambios de dirección en poco tiempo indican movimiento errático
    const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
    const changeRate = directionChanges / (timeSpan / 1000);
    
    return changeRate > 1.5; // Más de 1.5 cambios por segundo es errático
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Añadir event listeners
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('click', handleClick);
      window.addEventListener('mouseover', handleMouseOver);
      
      isTracking = true;
      logger.debug("Mouse tracker initialized");
    } catch (error) {
      logger.error("Failed to initialize mouse tracker", { error });
    }
  };
  
  // Detener el tracking
  const destroy = () => {
    if (!isTracking) return;
    
    try {
      // Eliminar event listeners
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('mouseover', handleMouseOver);
      
      isTracking = false;
      logger.debug("Mouse tracker destroyed");
    } catch (error) {
      logger.error("Failed to destroy mouse tracker", { error });
    }
  };
  
  return {
    init,
    destroy
  };
} 