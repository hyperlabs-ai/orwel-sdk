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

interface HoverData {
  element: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

interface HoverMetrics {
  avgDuration: number;
  uniqueElements: Set<string>;
  quickSwitches: number;
  frequency: number;
  timeSpan: number;
  longHovers: number;
}

interface HoverIndecisionState {
  currentHover?: HoverData;
  recentHovers: HoverData[];
  lastDetection: number;
}

/**
 * Detector de indicadores de "hover indecision" - indecisión del usuario al pasar
 * el ratón por elementos interactivos sin hacer clic, caracterizada por:
 * - Movimientos repetitivos sobre los mismos elementos
 * - Periodos largos de hover sobre elementos interactivos
 * - Patrones de hover entre elementos cercanos
 */
export function createHoverIndecisionIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const CONFIG = {
    HOVER_THRESHOLD: 800,       // Tiempo mínimo de hover para considerarlo significativo (ms)
    DETECTION_WINDOW: 6000,     // Ventana para analizar patrones de hover (ms)
    COOLDOWN_PERIOD: 5000,      // Tiempo entre detecciones (ms)
    MIN_HOVERS: 3,              // Mínimo de hovers para analizar patrones
    TRIGGER_THRESHOLD: 0.65,    // Umbral para activar el indicador
    QUICK_SWITCH_TIME: 500,     // Tiempo máximo entre hovers para considerarlo cambio rápido (ms)
    MAX_HOVER_TIME: 10000      // Tiempo máximo de hover para prevenir valores extremos (ms)
  };
  
  // Control de concurrencia y recursos
  const processingLock = new ProcessingLock();
  const metricsPool = new ObjectPool<HoverMetrics>(() => ({
    avgDuration: 0,
    uniqueElements: new Set(),
    quickSwitches: 0,
    frequency: 0,
    timeSpan: 0,
    longHovers: 0
  }));
  
  // Cache de resultados
  const resultCache = new Map<string, {
    result: IndicatorResult;
    timestamp: number;
  }>();
  
  // Estado del detector con límites de memoria
  const state: HoverIndecisionState = {
    recentHovers: [],
    lastDetection: 0
  };
  
  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    return safeProcess(() => {
      const now = Date.now();
      const results: IndicatorResult[] = [];
      
      // Limpiar cache antigua
      for (const [key, value] of resultCache.entries()) {
        if (now - value.timestamp > GLOBAL_CONFIG.CLEANUP_INTERVAL) {
          resultCache.delete(key);
        }
      }
      
      // Filtrar y validar eventos de mouse relacionados con hover
      const mouseEvents = events
        .filter(event => 
          (event.type === 'mouseover' || 
           event.type === 'mouseout' || 
           event.type === 'mousemove') && 
          validateEvent(event) &&
          event.data.element
        );
      
      if (mouseEvents.length === 0) return results;
      
      // Procesar cada evento
      mouseEvents.forEach(event => {
        processMouseEvent(event);
      });
      
      // Limpiar hovers antiguos y aplicar límites de memoria
      state.recentHovers = cleanupEvents(
        state.recentHovers.map(h => ({ ...h, timestamp: h.startTime })),
        CONFIG.DETECTION_WINDOW
      ).map(({ timestamp, ...rest }) => ({ ...rest, startTime: timestamp }));
      
      // Si no tenemos suficientes hovers o está en cooldown, no analizar
      if (state.recentHovers.length < CONFIG.MIN_HOVERS ||
          now - state.lastDetection < CONFIG.COOLDOWN_PERIOD) {
        return results;
      }
      
      // Generar clave de cache
      const cacheKey = state.recentHovers
        .slice(-5)  // Usar solo los últimos 5 hovers para la clave
        .map(h => `${h.element}:${h.startTime}:${h.endTime || 0}`)
        .join('|');
      
      // Verificar cache
      const cached = resultCache.get(cacheKey);
      if (cached && now - cached.timestamp < 1000) {
        return [cached.result];
      }
      
      // Analizar patrones de indecisión
      const metrics = calculateHoverMetrics(state.recentHovers);
      const score = calculateIndecisionScore(metrics);
      
      // Si el score sobrepasa el umbral, detectar el indicador
      if (score > CONFIG.TRIGGER_THRESHOLD) {
        state.lastDetection = now;
        
        const result: IndicatorResult = {
          name: 'hover_indecision',
          isTriggered: true,
          strength: Math.min(1, score / 0.85),
          details: {
            hoversCount: state.recentHovers.length,
            uniqueElementsCount: metrics.uniqueElements.size,
            averageDuration: metrics.avgDuration,
            quickSwitches: metrics.quickSwitches,
            frequency: metrics.frequency,
            recentElements: Array.from(metrics.uniqueElements).slice(-3),
            score
          }
        };
        
        // Guardar en cache
        resultCache.set(cacheKey, {
          result,
          timestamp: now
        });
        
        results.push(result);
        
        logger.debug("Hover indecision detected", { 
          score,
          hoversCount: state.recentHovers.length,
          avgDuration: metrics.avgDuration
        });
      }
      
      // Devolver métricas al pool
      metricsPool.release(metrics);
      
      return results;
    }, processingLock, []);
  };
  
  // Procesar un evento de ratón
  const processMouseEvent = (event: GestureEvent) => {
    try {
      const { type, timestamp, data } = event;
      const elementId = sanitizeElementData(data.element);
      
      if (type === 'mouseover') {
        // Inicio de hover
        state.currentHover = {
          element: elementId,
          startTime: timestamp
        };
      } 
      else if (type === 'mouseout' && state.currentHover) {
        // Fin de hover - calcular duración y guardar
        if (state.currentHover.element === elementId) {
          state.currentHover.endTime = timestamp;
          state.currentHover.duration = Math.min(
            timestamp - state.currentHover.startTime,
            CONFIG.MAX_HOVER_TIME
          );
          
          // Solo guardar hovers significativos
          if (state.currentHover.duration > CONFIG.HOVER_THRESHOLD) {
            state.recentHovers.push({...state.currentHover});
            
            // Mantener límite de memoria
            if (state.recentHovers.length > GLOBAL_CONFIG.MAX_EVENTS) {
              state.recentHovers.shift();
            }
          }
          
          state.currentHover = undefined;
        }
      }
    } catch (error) {
      logger.error("Error processing mouse event", { error });
    }
  };
  
  // Calcular métricas de hover
  const calculateHoverMetrics = (hovers: HoverData[]): HoverMetrics => {
    const metrics = metricsPool.get();
    metrics.uniqueElements.clear();
    metrics.quickSwitches = 0;
    
    let totalDuration = 0;
    
    // Calcular métricas básicas
    hovers.forEach(hover => {
      metrics.uniqueElements.add(hover.element);
      if (hover.duration) {
        totalDuration += hover.duration;
      }
    });
    
    // Calcular duración promedio
    metrics.avgDuration = totalDuration / hovers.length;
    
    // Contar hovers largos
    metrics.longHovers = hovers.filter(
      h => h.duration && h.duration > CONFIG.HOVER_THRESHOLD * 1.5
    ).length;
    
    // Calcular tiempo total y frecuencia
    metrics.timeSpan = hovers[hovers.length - 1].startTime - hovers[0].startTime;
    metrics.frequency = (hovers.length * 1000) / metrics.timeSpan; // hovers por segundo
    
    // Contar cambios rápidos entre elementos
    for (let i = 1; i < hovers.length; i++) {
      const prevHover = hovers[i-1];
      const currHover = hovers[i];
      
      if (prevHover.endTime && 
          currHover.startTime - prevHover.endTime < CONFIG.QUICK_SWITCH_TIME && 
          prevHover.element !== currHover.element) {
        metrics.quickSwitches++;
      }
    }
    
    return metrics;
  };
  
  // Calcular puntuación de indecisión
  const calculateIndecisionScore = (metrics: HoverMetrics): number => {
    // Factor de repetición (volver al mismo elemento varias veces)
    const repeatFactor = 1 - (metrics.uniqueElements.size / state.recentHovers.length);
    
    // Factor de duración (hovers largos indican indecisión)
    const durationFactor = Math.min(1, metrics.longHovers / (state.recentHovers.length / 2));
    
    // Factor de frecuencia
    const frequencyFactor = Math.min(1, metrics.frequency / 1.2);
    
    // Factor de cambio rápido entre elementos
    const switchingFactor = Math.min(1, metrics.quickSwitches / (state.recentHovers.length / 2));
    
    // Combinación ponderada de factores
    return (repeatFactor * 0.3) + 
           (durationFactor * 0.3) + 
           (frequencyFactor * 0.2) + 
           (switchingFactor * 0.2);
  };
  
  return {
    process,
    // Exponer método de limpieza para tests y mantenimiento
    cleanup: () => {
      state.recentHovers = [];
      state.currentHover = undefined;
      resultCache.clear();
      metricsPool.clear();
    }
  };
} 