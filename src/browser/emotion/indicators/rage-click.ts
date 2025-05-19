import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";
import { 
  ProcessingLock, 
  ObjectPool, 
  cleanupEvents, 
  validateEvent, 
  sanitizeElementData,
  safeProcess,
  GLOBAL_CONFIG
} from "./utils";

// Configuración para detectar rage clicks
const RAGE_CLICK_CONFIG = {
  clickThreshold: 3,          // Número mínimo de clicks para considerar "rage"
  timeWindow: 1500,           // Ventana de tiempo en ms para considerar clicks agrupados
  radiusThreshold: 25,        // Radio en px para considerar clicks en la misma área
  maxTimeBetweenClicks: 500,  // Tiempo máximo entre clicks para agruparlos en ms
  maxClicksPerGroup: 10       // Límite de clicks por grupo para prevenir spam
};

interface ClickEvent {
  timestamp: number;
  x: number;
  y: number;
  target: string;
}

interface ClickGroup {
  clicks: ClickEvent[];
  startTime: number;
  endTime: number;
  centerX: number;
  centerY: number;
}

/**
 * Crea un detector de rage clicks con optimizaciones de rendimiento y seguridad
 */
export function createRageClickIndicator(logger: ReturnType<typeof createLogger>) {
  // Sistema de pooling para grupos de clicks
  const clickGroupPool = new ObjectPool<ClickGroup>(() => ({
    clicks: [],
    startTime: 0,
    endTime: 0,
    centerX: 0,
    centerY: 0
  }));

  // Control de concurrencia
  const processingLock = new ProcessingLock();
  
  // Cache de resultados recientes para evitar cálculos repetidos
  const resultCache = new Map<string, {
    result: IndicatorResult;
    timestamp: number;
  }>();
  
  // Procesar eventos y detectar rage clicks
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    return safeProcess(() => {
      // Limpiar cache antigua
      const now = Date.now();
      for (const [key, value] of resultCache.entries()) {
        if (now - value.timestamp > GLOBAL_CONFIG.CLEANUP_INTERVAL) {
          resultCache.delete(key);
        }
      }
      
      // Filtrar y validar eventos de click
      const clickEvents = events
        .filter(e => e.type === 'click' && validateEvent(e))
        .map(e => ({
          timestamp: e.timestamp,
          x: e.data.x,
          y: e.data.y,
          target: sanitizeElementData(e.data.target)
        }));
      
      if (clickEvents.length < RAGE_CLICK_CONFIG.clickThreshold) {
        return [];
      }
      
      // Generar clave de cache para este conjunto de eventos
      const cacheKey = clickEvents
        .map(e => `${e.timestamp}:${e.x}:${e.y}`)
        .join('|');
      
      // Verificar cache
      const cached = resultCache.get(cacheKey);
      if (cached && now - cached.timestamp < 1000) {
        return [cached.result];
      }
      
      // Agrupar clicks por proximidad espacial y temporal
      const clickGroups = groupClicksByProximity(clickEvents);
      
      // Procesar cada grupo para determinar si constituye un rage click
      const results: IndicatorResult[] = [];
      
      for (const group of clickGroups) {
        if (group.clicks.length >= RAGE_CLICK_CONFIG.clickThreshold) {
          const timeDiff = group.endTime - group.startTime;
          
          // Calcular intensidad con factores normalizados
          const clickCount = Math.min(group.clicks.length, RAGE_CLICK_CONFIG.maxClicksPerGroup);
          const speedFactor = Math.min(1, 2000 / Math.max(timeDiff, 300));
          const intensity = Math.min(1, (clickCount / 6) * 0.6 + speedFactor * 0.4);
          
          const result: IndicatorResult = {
            name: 'rage_click',
            isTriggered: true,
            strength: intensity,
            details: {
              clickCount: group.clicks.length,
              duration: timeDiff,
              target: group.clicks[0].target,
              avgTimeBetweenClicks: timeDiff / (group.clicks.length - 1),
              centerX: group.centerX,
              centerY: group.centerY
            }
          };
          
          // Guardar en cache
          resultCache.set(cacheKey, {
            result,
            timestamp: now
          });
          
          results.push(result);
          
          logger.debug("Rage click detected", { 
            clickCount: group.clicks.length, 
            duration: timeDiff,
            intensity
          });
        }
        
        // Devolver el grupo al pool
        clickGroupPool.release(group);
      }
      
      return results;
    }, processingLock, []);
  };
  
  // Agrupar clicks por proximidad espacial y temporal
  const groupClicksByProximity = (clicks: ClickEvent[]): ClickGroup[] => {
    if (clicks.length < 2) return [];
    
    // Ordenar clicks por timestamp
    const sortedClicks = [...clicks].sort((a, b) => a.timestamp - b.timestamp);
    
    const groups: ClickGroup[] = [];
    let currentGroup = clickGroupPool.get();
    currentGroup.clicks = [sortedClicks[0]];
    currentGroup.startTime = sortedClicks[0].timestamp;
    currentGroup.centerX = sortedClicks[0].x;
    currentGroup.centerY = sortedClicks[0].y;
    
    for (let i = 1; i < sortedClicks.length; i++) {
      const currentClick = sortedClicks[i];
      const previousClick = currentGroup.clicks[currentGroup.clicks.length - 1];
      
      // Calcular distancia espacial
      const distance = Math.sqrt(
        Math.pow(currentClick.x - currentGroup.centerX, 2) +
        Math.pow(currentClick.y - currentGroup.centerY, 2)
      );
      
      // Calcular distancia temporal
      const timeDiff = currentClick.timestamp - previousClick.timestamp;
      
      // Si está dentro del umbral espacial y temporal, agregar al grupo actual
      if (distance <= RAGE_CLICK_CONFIG.radiusThreshold && 
          timeDiff <= RAGE_CLICK_CONFIG.maxTimeBetweenClicks &&
          currentGroup.clicks.length < RAGE_CLICK_CONFIG.maxClicksPerGroup) {
        
        currentGroup.clicks.push(currentClick);
        currentGroup.endTime = currentClick.timestamp;
        
        // Actualizar centro del grupo
        const n = currentGroup.clicks.length;
        currentGroup.centerX = (currentGroup.centerX * (n-1) + currentClick.x) / n;
        currentGroup.centerY = (currentGroup.centerY * (n-1) + currentClick.y) / n;
      } else {
        // Si el grupo actual tiene suficientes clicks, guardarlo
        if (currentGroup.clicks.length >= 2) {
          groups.push(currentGroup);
        } else {
          clickGroupPool.release(currentGroup);
        }
        
        // Iniciar un nuevo grupo
        currentGroup = clickGroupPool.get();
        currentGroup.clicks = [currentClick];
        currentGroup.startTime = currentClick.timestamp;
        currentGroup.endTime = currentClick.timestamp;
        currentGroup.centerX = currentClick.x;
        currentGroup.centerY = currentClick.y;
      }
    }
    
    // Añadir el último grupo si tiene suficientes clicks
    if (currentGroup.clicks.length >= 2) {
      groups.push(currentGroup);
    } else {
      clickGroupPool.release(currentGroup);
    }
    
    return groups;
  };
  
  return {
    process,
    // Exponer método de limpieza para tests y mantenimiento
    cleanup: () => {
      resultCache.clear();
      clickGroupPool.clear();
    }
  };
} 