import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

// Configuración para detectar rapid scrolling
const RAPID_SCROLL_CONFIG = {
  velocityThreshold: 800,        // Velocidad mínima en pixels/segundo para considerar "rápido"
  timeWindow: 3000,              // Ventana de tiempo para analizar en ms
  minScrollEvents: 5,            // Mínimo número de eventos de scroll para analizar
  directionChangeWeight: 0.2,    // Peso para cambios de dirección (indica frustración)
  sustainedScrollWeight: 0.8     // Peso para scroll sostenido (indica urgencia)
};

interface ScrollEvent {
  timestamp: number;
  deltaY: number;  // Positivo = scroll hacia abajo, negativo = scroll hacia arriba
  velocity: number; // Velocidad estimada en px/s
}

/**
 * Crea un detector de scrolling rápido
 */
export function createRapidScrollingIndicator(logger: ReturnType<typeof createLogger>) {
  
  // Procesar eventos y detectar rapid scrolling
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    // Filtrar solo eventos de scroll
    const scrollEvents = events
      .filter(e => e.type === 'scroll')
      .map(e => ({
        timestamp: e.timestamp,
        deltaY: e.data.deltaY || 0,
        velocity: e.data.velocity || 0
      }));
    
    if (scrollEvents.length < RAPID_SCROLL_CONFIG.minScrollEvents) {
      return [];
    }
    
    // Ordenar por timestamp para asegurar el análisis correcto
    const sortedEvents = [...scrollEvents].sort((a, b) => a.timestamp - b.timestamp);
    
    // Analizar patrones de scroll
    const result = analyzeScrollPattern(sortedEvents);
    
    if (result) {
      logger.debug("Rapid scrolling detected", {
        averageVelocity: result.averageVelocity,
        directionChanges: result.directionChanges,
        duration: result.duration,
        strength: result.strength
      });
      
      return [{
        name: 'rapid_scrolling',
        isTriggered: true,
        strength: result.strength,
        details: {
          averageVelocity: result.averageVelocity,
          directionChanges: result.directionChanges,
          duration: result.duration,
          eventCount: sortedEvents.length
        }
      }];
    }
    
    return [];
  };
  
  // Analizar el patrón de scroll para determinar rapidez y cambios de dirección
  const analyzeScrollPattern = (scrollEvents: ScrollEvent[]): { 
    averageVelocity: number; 
    directionChanges: number;
    duration: number;
    strength: number;
  } | null => {
    if (scrollEvents.length < 2) return null;
    
    const recentEvents = filterRecentEvents(scrollEvents);
    if (recentEvents.length < RAPID_SCROLL_CONFIG.minScrollEvents) return null;
    
    // Calcular velocidad promedio
    let totalVelocity = 0;
    let directionChanges = 0;
    let previousDirection = Math.sign(recentEvents[0].deltaY);
    
    for (let i = 0; i < recentEvents.length; i++) {
      const event = recentEvents[i];
      
      // Sumar velocidad
      totalVelocity += Math.abs(event.velocity || calculateVelocity(event, 
                                  i > 0 ? recentEvents[i-1] : null));
      
      // Detectar cambios de dirección
      if (i > 0) {
        const currentDirection = Math.sign(event.deltaY);
        if (currentDirection !== 0 && currentDirection !== previousDirection) {
          directionChanges++;
          previousDirection = currentDirection;
        }
      }
    }
    
    const duration = recentEvents[recentEvents.length - 1].timestamp - recentEvents[0].timestamp;
    const averageVelocity = totalVelocity / recentEvents.length;
    
    // No es scrolling rápido si la velocidad promedio es menor que el umbral
    if (averageVelocity < RAPID_SCROLL_CONFIG.velocityThreshold) {
      return null;
    }
    
    // Calcular componentes para la intensidad
    // 1. Velocidad: normalizada a un rango 0-1
    const velocityFactor = Math.min(1, (averageVelocity - RAPID_SCROLL_CONFIG.velocityThreshold) / 
                                      (RAPID_SCROLL_CONFIG.velocityThreshold * 2));
    
    // 2. Cambios de dirección: normalizado considerando la cantidad de eventos
    const directionChangeFactor = Math.min(1, directionChanges / (recentEvents.length * 0.25));
    
    // Calcular intensidad combinando velocidad sostenida y cambios de dirección
    const strength = RAPID_SCROLL_CONFIG.sustainedScrollWeight * velocityFactor + 
                     RAPID_SCROLL_CONFIG.directionChangeWeight * directionChangeFactor;
    
    return {
      averageVelocity,
      directionChanges,
      duration,
      strength: Math.min(1, strength)  // Limitar a 0-1
    };
  };
  
  // Filtrar eventos recientes dentro de la ventana de tiempo
  const filterRecentEvents = (events: ScrollEvent[]): ScrollEvent[] => {
    if (events.length === 0) return [];
    
    const lastTimestamp = events[events.length - 1].timestamp;
    const windowStart = lastTimestamp - RAPID_SCROLL_CONFIG.timeWindow;
    
    return events.filter(e => e.timestamp >= windowStart);
  };
  
  // Calcular velocidad de scroll si no está disponible
  const calculateVelocity = (current: ScrollEvent, previous: ScrollEvent | null): number => {
    if (!previous) return 0;
    
    const timeDiff = current.timestamp - previous.timestamp;
    if (timeDiff <= 0) return 0;
    
    // Convertir a pixels por segundo
    return Math.abs(current.deltaY) * (1000 / timeDiff);
  };
  
  return {
    process
  };
} 