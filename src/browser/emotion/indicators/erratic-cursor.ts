import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface CursorPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface ErraticCursorState {
  recentPositions: CursorPoint[];
  lastDetection: number;
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
  const DETECTION_WINDOW = 3000;     // Ventana de tiempo para analizar movimientos (ms)
  const COOLDOWN_PERIOD = 5000;      // Tiempo entre detecciones (ms)
  const MIN_POSITIONS = 10;          // Mínimo de posiciones para analizar patrones
  const TRIGGER_THRESHOLD = 0.7;     // Umbral para activar el indicador
  
  // Estado del detector
  const state: ErraticCursorState = {
    recentPositions: [],
    lastDetection: 0
  };
  
  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar solo eventos de movimiento del ratón
    const mouseMoveEvents = events.filter(event => 
      event.type === 'mousemove' && 
      typeof event.data.x === 'number' && 
      typeof event.data.y === 'number'
    );
    
    if (mouseMoveEvents.length === 0) return results;
    
    // Agregar posiciones recientes (pero solo un subconjunto para evitar sobrecarga)
    // Tomamos solo algunos eventos si hay muchos
    const sampleRate = Math.max(1, Math.floor(mouseMoveEvents.length / 10));
    
    for (let i = 0; i < mouseMoveEvents.length; i += sampleRate) {
      const event = mouseMoveEvents[i];
      
      state.recentPositions.push({
        x: event.data.x,
        y: event.data.y,
        timestamp: event.timestamp
      });
    }
    
    // Limpiar posiciones antiguas
    state.recentPositions = state.recentPositions.filter(
      pos => now - pos.timestamp < DETECTION_WINDOW
    );
    
    // Si no hay suficientes posiciones, no analizar
    if (state.recentPositions.length < MIN_POSITIONS) return results;
    
    // Verificar si ya se detectó recientemente
    if (now - state.lastDetection < COOLDOWN_PERIOD) return results;
    
    // Analizar patrones de movimiento errático
    const score = calculateErraticScore(state.recentPositions);
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastDetection = now;
      
      // Calcular métricas adicionales
      const {
        totalDistance,
        straightLineDistance,
        avgSpeed,
        directionChanges
      } = calculateMovementMetrics(state.recentPositions);
      
      results.push({
        name: 'erratic_cursor',
        isTriggered: true,
        strength: Math.min(1, score / 0.9), // Normalizar entre 0 y 1, limitado a 1
        details: {
          positionsCount: state.recentPositions.length,
          totalDistance,
          straightLineDistance,
          efficiency: straightLineDistance / Math.max(totalDistance, 1),
          avgSpeed,
          directionChanges,
          score
        }
      });
      
      logger.debug("Erratic cursor movement detected", { 
        score, 
        directionChanges,
        efficiency: straightLineDistance / Math.max(totalDistance, 1)
      });
    }
    
    return results;
  };
  
  // Calcular puntuación de movimiento errático
  const calculateErraticScore = (positions: CursorPoint[]): number => {
    if (positions.length < MIN_POSITIONS) return 0;
    
    // Obtener métricas de movimiento
    const {
      totalDistance,
      straightLineDistance,
      avgSpeed,
      directionChanges,
      accelerationChanges
    } = calculateMovementMetrics(positions);
    
    // Factor de eficiencia (relación entre distancia en línea recta y total)
    // Un valor bajo indica movimiento ineficiente/errático
    const efficiencyFactor = 1 - (straightLineDistance / Math.max(totalDistance, 1));
    
    // Factor de cambios de dirección
    const expectedChanges = positions.length / 5; // Estimación de cambios normales
    const directionChangeFactor = Math.min(1, directionChanges / expectedChanges);
    
    // Factor de velocidad (movimientos muy rápidos pueden indicar frustración)
    const speedFactor = Math.min(1, avgSpeed / 500); // 500px/s como referencia
    
    // Factor de aceleración (cambios bruscos de velocidad)
    const accelerationFactor = Math.min(1, accelerationChanges / (positions.length / 4));
    
    // Combinación ponderada de factores
    return (efficiencyFactor * 0.4) + 
           (directionChangeFactor * 0.3) + 
           (speedFactor * 0.2) + 
           (accelerationFactor * 0.1);
  };
  
  // Calcular métricas de movimiento detalladas
  const calculateMovementMetrics = (positions: CursorPoint[]): any => {
    // Distancia total recorrida
    let totalDistance = 0;
    // Cambios significativos de dirección
    let directionChanges = 0;
    // Cambios significativos de aceleración
    let accelerationChanges = 0;
    // Velocidades por segmento
    const speeds: number[] = [];
    
    // Vector anterior para calcular cambios de dirección
    let prevVector = { x: 0, y: 0 };
    // Velocidad anterior para calcular cambios de aceleración
    let prevSpeed = 0;
    
    // Calcular distancia entre cada par de puntos
    for (let i = 1; i < positions.length; i++) {
      const current = positions[i];
      const prev = positions[i-1];
      
      // Distancia euclidiana entre puntos
      const dx = current.x - prev.x;
      const dy = current.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      totalDistance += distance;
      
      // Tiempo transcurrido (en segundos)
      const dt = (current.timestamp - prev.timestamp) / 1000;
      if (dt > 0) {
        // Velocidad en píxeles por segundo
        const speed = distance / dt;
        speeds.push(speed);
        
        // Detectar cambios de aceleración
        if (i > 1 && Math.abs(speed - prevSpeed) > 200) {
          accelerationChanges++;
        }
        
        prevSpeed = speed;
      }
      
      // Detectar cambios de dirección
      if (i > 1) {
        const vector = { x: dx, y: dy };
        const vectorMagnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
        const prevMagnitude = Math.sqrt(prevVector.x * prevVector.x + prevVector.y * prevVector.y);
        
        // Normalizar vectores
        const normVector = vectorMagnitude > 0 
          ? { x: vector.x / vectorMagnitude, y: vector.y / vectorMagnitude } 
          : { x: 0, y: 0 };
        
        const normPrevVector = prevMagnitude > 0
          ? { x: prevVector.x / prevMagnitude, y: prevVector.y / prevMagnitude }
          : { x: 0, y: 0 };
        
        // Producto escalar (dot product) - indica similitud entre direcciones
        const dotProduct = normVector.x * normPrevVector.x + normVector.y * normPrevVector.y;
        
        // Si el producto escalar es menor que 0.7, consideramos un cambio de dirección significativo
        // (aproximadamente 45 grados o más)
        if (dotProduct < 0.7 && vectorMagnitude > 5 && prevMagnitude > 5) {
          directionChanges++;
        }
        
        prevVector = vector;
      } else {
        prevVector = { x: dx, y: dy };
      }
    }
    
    // Distancia en línea recta entre primer y último punto
    const first = positions[0];
    const last = positions[positions.length - 1];
    const straightLineDistance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + 
      Math.pow(last.y - first.y, 2)
    );
    
    // Velocidad promedio
    const avgSpeed = speeds.length > 0 
      ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length 
      : 0;
    
    return {
      totalDistance,
      straightLineDistance,
      avgSpeed,
      directionChanges,
      accelerationChanges
    };
  };
  
  return {
    process
  };
} 