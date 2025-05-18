import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";
import { throttle } from "../../../../utils";

/**
 * Crea un recolector de eventos de scroll
 */
export function createScrollTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Estado para tracking
  let isTracking = false;
  let lastScrollTop = 0;
  let lastScrollTime = 0;
  let scrollHistory: { position: number; timestamp: number; delta: number }[] = [];
  
  // Función para manejar eventos de scroll
  const handleScroll = throttle(() => {
    const now = Date.now();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const delta = scrollTop - lastScrollTop;
    
    // Calcular velocidad
    const timeDiff = now - lastScrollTime;
    let velocity = 0;
    
    if (lastScrollTime > 0 && timeDiff > 0 && Math.abs(delta) > 0) {
      velocity = Math.abs(delta) / timeDiff * 1000; // pixels/second
      
      // Mantener historial para análisis
      scrollHistory.push({ position: scrollTop, timestamp: now, delta });
      
      // Limitar tamaño del historial
      if (scrollHistory.length > 20) {
        scrollHistory.shift();
      }
      
      // Determinar si estamos en un scroll rápido
      const isRapidScrolling = detectRapidScrolling(scrollHistory);
      
      // Enviar evento
      onEvent({
        type: 'scroll',
        timestamp: now,
        data: {
          position: scrollTop,
          deltaY: delta,
          velocity,
          direction: delta > 0 ? 'down' : delta < 0 ? 'up' : 'none',
          isRapidScrolling
        }
      });
    }
    
    lastScrollTop = scrollTop;
    lastScrollTime = now;
  }, 100); // Limitar a 10 eventos por segundo
  
  // Detectar patrones de scrolling rápido
  const detectRapidScrolling = (history: { position: number; timestamp: number; delta: number }[]): boolean => {
    if (history.length < 3) return false;
    
    // Obtener últimos 5 eventos o menos
    const recentEvents = history.slice(-5);
    
    // Calcular velocidad promedio
    let totalVelocity = 0;
    let eventCount = 0;
    
    for (let i = 1; i < recentEvents.length; i++) {
      const current = recentEvents[i];
      const previous = recentEvents[i - 1];
      const timeDiff = current.timestamp - previous.timestamp;
      
      if (timeDiff > 0) {
        const velocity = Math.abs(current.delta) / timeDiff * 1000;
        totalVelocity += velocity;
        eventCount++;
      }
    }
    
    // No hay suficientes eventos para calcular velocidad
    if (eventCount === 0) return false;
    
    const avgVelocity = totalVelocity / eventCount;
    
    // Consideramos scrolling rápido cuando la velocidad promedio es alta
    return avgVelocity > 800; // pixels/second
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Añadir event listener
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      isTracking = true;
      logger.debug("Scroll tracker initialized");
    } catch (error) {
      logger.error("Failed to initialize scroll tracker", { error });
    }
  };
  
  // Detener el tracking
  const destroy = () => {
    if (!isTracking) return;
    
    try {
      // Eliminar event listener
      window.removeEventListener('scroll', handleScroll);
      
      isTracking = false;
      logger.debug("Scroll tracker destroyed");
    } catch (error) {
      logger.error("Failed to destroy scroll tracker", { error });
    }
  };
  
  return {
    init,
    destroy
  };
} 