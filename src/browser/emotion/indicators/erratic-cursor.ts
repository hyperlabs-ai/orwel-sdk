import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";
import { 
  ProcessingLock, 
  ObjectPool, 
  cleanupEvents, 
  validateEvent,
  safeProcess,
  GLOBAL_CONFIG
} from "./utils";

interface CursorPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface MovementMetrics {
  totalDistance: number;
  straightLineDistance: number;
  avgSpeed: number;
  directionChanges: number;
  accelerationChanges: number;
  speeds: number[];
  vectors: { x: number; y: number }[];
}

interface ErraticCursorState {
  recentPositions: CursorPoint[];
  lastDetection: number;
  metrics: MovementMetrics;
}

/**
 * Detector de indicadores de "erratic cursor" - movimientos erráticos del cursor
 * que pueden indicar confusión o frustración, caracterizados por:
 * - Cambios bruscos de dirección
 * - Movimientos rápidos e imprecisos
 * - Trayectorias no lineales o caóticas
 */
export function createErraticCursorIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const CONFIG = {
    DETECTION_WINDOW: 3000,     // Ventana de tiempo para analizar movimientos (ms)
    COOLDOWN_PERIOD: 5000,      // Tiempo entre detecciones (ms)
    MIN_POSITIONS: 10,          // Mínimo de posiciones para analizar patrones
    TRIGGER_THRESHOLD: 0.7,     // Umbral para activar el indicador
    MAX_SPEED: 2000,           // Velocidad máxima considerada válida (px/s)
    MIN_MOVEMENT: 5,           // Movimiento mínimo para considerar un cambio de dirección
    DIRECTION_CHANGE_THRESHOLD: 0.7  // Umbral para considerar cambio de dirección (cos)
  };
  
  // Control de concurrencia y recursos
  const processingLock = new ProcessingLock();
  const metricsPool = new ObjectPool<MovementMetrics>(() => ({
    totalDistance: 0,
    straightLineDistance: 0,
    avgSpeed: 0,
    directionChanges: 0,
    accelerationChanges: 0,
    speeds: [],
    vectors: []
  }));
  
  // Cache de resultados
  const resultCache = new Map<string, {
    result: IndicatorResult;
    timestamp: number;
  }>();
  
  // Estado del detector con límites de memoria
  const state: ErraticCursorState = {
    recentPositions: [],
    lastDetection: 0,
    metrics: metricsPool.get()
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
      
      // Filtrar y validar eventos de movimiento del ratón
      const mouseMoveEvents = events
        .filter(event => event.type === 'mousemove' && validateEvent(event))
        .map(event => ({
          x: event.data.x,
          y: event.data.y,
          timestamp: event.timestamp
        }));
      
      if (mouseMoveEvents.length === 0) return results;
      
      // Muestrear eventos para evitar sobrecarga
      const sampleRate = Math.max(1, Math.floor(mouseMoveEvents.length / 10));
      const sampledEvents = mouseMoveEvents.filter((_, i) => i % sampleRate === 0);
      
      // Generar clave de cache
      const cacheKey = sampledEvents
        .map(e => `${e.timestamp}:${e.x}:${e.y}`)
        .slice(-5)  // Usar solo los últimos 5 eventos para la clave
        .join('|');
      
      // Verificar cache
      const cached = resultCache.get(cacheKey);
      if (cached && now - cached.timestamp < 1000) {
        return [cached.result];
      }
      
      // Actualizar posiciones recientes con límite de memoria
      state.recentPositions = cleanupEvents(
        [...state.recentPositions, ...sampledEvents],
        CONFIG.DETECTION_WINDOW
      );
      
      // Si no hay suficientes posiciones o está en cooldown, no analizar
      if (state.recentPositions.length < CONFIG.MIN_POSITIONS ||
          now - state.lastDetection < CONFIG.COOLDOWN_PERIOD) {
        return results;
      }
      
      // Analizar patrones de movimiento errático
      const metrics = calculateMovementMetrics(state.recentPositions);
      const score = calculateErraticScore(metrics);
      
      // Si el score sobrepasa el umbral, detectar el indicador
      if (score > CONFIG.TRIGGER_THRESHOLD) {
        state.lastDetection = now;
        
        const result: IndicatorResult = {
          name: 'erratic_cursor',
          isTriggered: true,
          strength: Math.min(1, score / 0.9),
          details: {
            positionsCount: state.recentPositions.length,
            totalDistance: metrics.totalDistance,
            straightLineDistance: metrics.straightLineDistance,
            efficiency: metrics.straightLineDistance / Math.max(metrics.totalDistance, 1),
            avgSpeed: metrics.avgSpeed,
            directionChanges: metrics.directionChanges,
            accelerationChanges: metrics.accelerationChanges,
            score
          }
        };
        
        // Guardar en cache
        resultCache.set(cacheKey, {
          result,
          timestamp: now
        });
        
        results.push(result);
        
        logger.debug("Erratic cursor movement detected", { 
          score,
          directionChanges: metrics.directionChanges,
          efficiency: metrics.straightLineDistance / Math.max(metrics.totalDistance, 1)
        });
      }
      
      // Devolver métricas al pool
      metricsPool.release(metrics);
      
      return results;
    }, processingLock, []);
  };
  
  // Calcular métricas de movimiento detalladas
  const calculateMovementMetrics = (positions: CursorPoint[]): MovementMetrics => {
    const metrics = metricsPool.get();
    metrics.totalDistance = 0;
    metrics.directionChanges = 0;
    metrics.accelerationChanges = 0;
    metrics.speeds = [];
    metrics.vectors = [];
    
    let prevVector = { x: 0, y: 0 };
    let prevSpeed = 0;
    
    // Calcular distancia entre cada par de puntos
    for (let i = 1; i < positions.length; i++) {
      const current = positions[i];
      const prev = positions[i-1];
      
      // Vector de movimiento actual
      const dx = current.x - prev.x;
      const dy = current.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      metrics.totalDistance += distance;
      
      // Calcular velocidad (px/s)
      const dt = (current.timestamp - prev.timestamp) / 1000;
      if (dt > 0) {
        const speed = Math.min(distance / dt, CONFIG.MAX_SPEED);
        metrics.speeds.push(speed);
        
        // Detectar cambios de aceleración
        if (i > 1 && Math.abs(speed - prevSpeed) > 200) {
          metrics.accelerationChanges++;
        }
        prevSpeed = speed;
      }
      
      // Detectar cambios de dirección
      if (i > 1 && distance >= CONFIG.MIN_MOVEMENT) {
        const vector = { x: dx, y: dy };
        metrics.vectors.push(vector);
        
        const vectorMagnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
        const prevMagnitude = Math.sqrt(prevVector.x * prevVector.x + prevVector.y * prevVector.y);
        
        if (vectorMagnitude > 0 && prevMagnitude > 0) {
          // Producto escalar normalizado
          const dotProduct = (vector.x * prevVector.x + vector.y * prevVector.y) / 
                           (vectorMagnitude * prevMagnitude);
          
          if (dotProduct < CONFIG.DIRECTION_CHANGE_THRESHOLD) {
            metrics.directionChanges++;
          }
        }
        
        prevVector = vector;
      }
    }
    
    // Calcular distancia en línea recta y velocidad promedio
    const first = positions[0];
    const last = positions[positions.length - 1];
    metrics.straightLineDistance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + 
      Math.pow(last.y - first.y, 2)
    );
    
    metrics.avgSpeed = metrics.speeds.length > 0
      ? metrics.speeds.reduce((sum, speed) => sum + speed, 0) / metrics.speeds.length
      : 0;
    
    return metrics;
  };
  
  // Calcular puntuación de movimiento errático
  const calculateErraticScore = (metrics: MovementMetrics): number => {
    // Factor de eficiencia (relación entre distancia en línea recta y total)
    const efficiencyFactor = 1 - (metrics.straightLineDistance / Math.max(metrics.totalDistance, 1));
    
    // Factor de cambios de dirección
    const directionChangeFactor = Math.min(1, metrics.directionChanges / (metrics.vectors.length / 4));
    
    // Factor de velocidad
    const speedFactor = Math.min(1, metrics.avgSpeed / CONFIG.MAX_SPEED);
    
    // Factor de aceleración
    const accelerationFactor = Math.min(1, metrics.accelerationChanges / (metrics.speeds.length / 4));
    
    // Combinación ponderada de factores
    return (efficiencyFactor * 0.4) + 
           (directionChangeFactor * 0.3) + 
           (speedFactor * 0.2) + 
           (accelerationFactor * 0.1);
  };
  
  return {
    process,
    // Exponer método de limpieza para tests y mantenimiento
    cleanup: () => {
      state.recentPositions = [];
      resultCache.clear();
      metricsPool.clear();
    }
  };
} 