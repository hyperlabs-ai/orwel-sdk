import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface HoverData {
  element: string;
  startTime: number;
  endTime?: number;
  duration?: number;
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
  const HOVER_THRESHOLD = 800;       // Tiempo mínimo de hover para considerarlo significativo (ms)
  const DETECTION_WINDOW = 6000;     // Ventana para analizar patrones de hover (ms)
  const COOLDOWN_PERIOD = 5000;      // Tiempo entre detecciones (ms)
  const MIN_HOVERS = 3;              // Mínimo de hovers para analizar patrones
  const TRIGGER_THRESHOLD = 0.65;    // Umbral para activar el indicador

  // Estado del detector
  const state: HoverIndecisionState = {
    recentHovers: [],
    lastDetection: 0
  };

  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar solo eventos de mouse relacionados con hover
    const mouseEvents = events.filter(event => 
      (event.type === 'mouseover' || 
       event.type === 'mouseout' || 
       event.type === 'mousemove') && 
      event.data.element
    );
    
    if (mouseEvents.length === 0) return results;
    
    // Procesar cada evento
    mouseEvents.forEach(event => {
      processMouseEvent(event);
    });
    
    // Limpiar hovers antiguos
    state.recentHovers = state.recentHovers.filter(
      hover => now - (hover.endTime || hover.startTime) < DETECTION_WINDOW
    );
    
    // Si no tenemos suficientes hovers, no analizar
    if (state.recentHovers.length < MIN_HOVERS) return results;
    
    // Verificar si ya se detectó recientemente
    if (now - state.lastDetection < COOLDOWN_PERIOD) return results;
    
    // Analizar patrones de indecisión
    const score = calculateIndecisionScore(state.recentHovers);
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastDetection = now;
      
      // Calcular métricas adicionales
      const avgDuration = state.recentHovers
        .filter(h => h.duration)
        .reduce((sum, h) => sum + (h.duration || 0), 0) / state.recentHovers.length;
      
      const uniqueElements = new Set(state.recentHovers.map(h => h.element)).size;
      
      results.push({
        name: 'hover_indecision',
        isTriggered: true,
        strength: Math.min(1, score / 0.85), // Normalizar entre 0 y 1, limitado a 1
        details: {
          hoversCount: state.recentHovers.length,
          uniqueElementsCount: uniqueElements,
          averageDuration: avgDuration,
          recentElements: state.recentHovers.slice(-3).map(h => h.element),
          score
        }
      });
      
      logger.debug("Hover indecision detected", { 
        score, 
        hoversCount: state.recentHovers.length,
        avgDuration
      });
    }
    
    return results;
  };
  
  // Procesar un evento de ratón
  const processMouseEvent = (event: GestureEvent) => {
    const { type, timestamp, data } = event;
    const elementId = data.element;
    
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
        state.currentHover.duration = timestamp - state.currentHover.startTime;
        
        // Solo guardar hovers significativos
        if (state.currentHover.duration > HOVER_THRESHOLD) {
          state.recentHovers.push({...state.currentHover});
        }
        
        state.currentHover = undefined;
      }
    }
  };
  
  // Calcular puntuación de indecisión
  const calculateIndecisionScore = (hovers: HoverData[]): number => {
    if (hovers.length < MIN_HOVERS) return 0;
    
    // Obtener elementos únicos
    const elements = hovers.map(h => h.element);
    const uniqueElements = new Set(elements);
    
    // Factor de repetición (volver al mismo elemento varias veces)
    const repeatFactor = 1 - (uniqueElements.size / elements.length);
    
    // Factor de duración (hovers largos indican indecisión)
    const longHovers = hovers.filter(h => h.duration && h.duration > HOVER_THRESHOLD * 1.5).length;
    const durationFactor = Math.min(1, longHovers / (hovers.length / 2));
    
    // Factor de frecuencia
    const timeSpan = hovers[hovers.length - 1].startTime - hovers[0].startTime;
    const frequency = hovers.length / (timeSpan / 1000); // hovers por segundo
    const frequencyFactor = Math.min(1, frequency / 1.2);
    
    // Factor de cambio rápido entre elementos
    const quickSwitches = countQuickSwitches(hovers);
    const switchingFactor = Math.min(1, quickSwitches / (hovers.length / 2));
    
    // Combinación ponderada de factores
    return (repeatFactor * 0.3) + 
           (durationFactor * 0.3) + 
           (frequencyFactor * 0.2) + 
           (switchingFactor * 0.2);
  };
  
  // Contar cambios rápidos entre elementos
  const countQuickSwitches = (hovers: HoverData[]): number => {
    let quickSwitches = 0;
    
    for (let i = 1; i < hovers.length; i++) {
      const prevHover = hovers[i-1];
      const currHover = hovers[i];
      
      // Si el tiempo entre el fin del hover anterior y el inicio del actual es pequeño
      if (prevHover.endTime && 
          currHover.startTime - prevHover.endTime < 500 && 
          prevHover.element !== currHover.element) {
        quickSwitches++;
      }
    }
    
    return quickSwitches;
  };
  
  return {
    process
  };
} 