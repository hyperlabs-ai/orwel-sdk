import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

// Configuración para detectar rage clicks
const RAGE_CLICK_CONFIG = {
  clickThreshold: 3,          // Número mínimo de clicks para considerar "rage"
  timeWindow: 1500,           // Ventana de tiempo en ms para considerar clicks agrupados
  radiusThreshold: 25,        // Radio en px para considerar clicks en la misma área
  maxTimeBetweenClicks: 500   // Tiempo máximo entre clicks para agruparlos en ms
};

interface ClickEvent {
  timestamp: number;
  x: number;
  y: number;
  target: string;
}

/**
 * Crea un detector de rage clicks
 */
export function createRageClickIndicator(logger: ReturnType<typeof createLogger>) {
  
  // Procesar eventos y detectar rage clicks
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    // Filtrar solo eventos de click
    const clickEvents = events
      .filter(e => e.type === 'click')
      .map(e => ({
        timestamp: e.timestamp,
        x: e.data.x,
        y: e.data.y,
        target: e.data.target || 'unknown'
      }));
    
    if (clickEvents.length < RAGE_CLICK_CONFIG.clickThreshold) {
      return [];
    }
    
    // Agrupar clicks por proximidad espacial y temporal
    const clickGroups = groupClicksByProximity(clickEvents);
    
    // Procesar cada grupo para determinar si constituye un rage click
    const results: IndicatorResult[] = [];
    
    for (const group of clickGroups) {
      if (group.length >= RAGE_CLICK_CONFIG.clickThreshold) {
        const timeDiff = group[group.length - 1].timestamp - group[0].timestamp;
        
        // Calculamos la intensidad del rage click basado en:
        // 1. Número de clicks (más clicks = más intenso)
        // 2. Velocidad (clicks más rápidos = más intenso)
        const clickCount = Math.min(group.length, 10); // Cap at 10 for intensity calculation
        const speedFactor = Math.min(1, 2000 / Math.max(timeDiff, 300)); // Normalize speed
        
        // Combinar factores para obtener intensidad (0-1)
        const intensity = Math.min(1, (clickCount / 6) * 0.6 + speedFactor * 0.4);
        
        results.push({
          name: 'rage_click',
          isTriggered: true,
          strength: intensity,
          details: {
            clickCount: group.length,
            duration: timeDiff,
            target: group[0].target, // Usamos el target del primer click
            avgTimeBetweenClicks: timeDiff / (group.length - 1)
          }
        });
        
        logger.debug("Rage click detected", { 
          clickCount: group.length, 
          duration: timeDiff,
          intensity
        });
      }
    }
    
    return results;
  };
  
  // Agrupar clicks por proximidad espacial y temporal
  const groupClicksByProximity = (clicks: ClickEvent[]): ClickEvent[][] => {
    if (clicks.length < 2) return clicks.length ? [clicks] : [];
    
    // Ordenar clicks por timestamp
    const sortedClicks = [...clicks].sort((a, b) => a.timestamp - b.timestamp);
    
    const groups: ClickEvent[][] = [];
    let currentGroup: ClickEvent[] = [sortedClicks[0]];
    
    for (let i = 1; i < sortedClicks.length; i++) {
      const previousClick = currentGroup[currentGroup.length - 1];
      const currentClick = sortedClicks[i];
      
      // Calcular distancia espacial
      const distance = Math.sqrt(
        Math.pow(currentClick.x - previousClick.x, 2) +
        Math.pow(currentClick.y - previousClick.y, 2)
      );
      
      // Calcular distancia temporal
      const timeDiff = currentClick.timestamp - previousClick.timestamp;
      
      // Si está dentro del umbral espacial y temporal, agregar al grupo actual
      if (distance <= RAGE_CLICK_CONFIG.radiusThreshold && 
          timeDiff <= RAGE_CLICK_CONFIG.maxTimeBetweenClicks) {
        currentGroup.push(currentClick);
      } else {
        // Si el grupo actual tiene suficientes clicks, guardarlo
        if (currentGroup.length >= 2) {
          groups.push(currentGroup);
        }
        
        // Iniciar un nuevo grupo
        currentGroup = [currentClick];
      }
    }
    
    // Añadir el último grupo si tiene suficientes clicks
    if (currentGroup.length >= 2) {
      groups.push(currentGroup);
    }
    
    return groups;
  };
  
  return {
    process
  };
} 