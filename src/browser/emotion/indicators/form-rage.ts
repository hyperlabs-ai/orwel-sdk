import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface FormRageState {
  recentFormEvents: { element: string; timestamp: number; type: string }[];
  lastRageDetection: number;
}

/**
 * Detector de indicadores de "form rage" - frustración del usuario con formularios
 * detecta patrones como:
 * - Múltiples eventos de validación fallida en poco tiempo
 * - Borrado rápido de contenido de campos
 * - Cambio entre campos sin completarlos
 */
export function createFormRageIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const DETECTION_WINDOW = 5000; // 5 segundos para considerar eventos relacionados
  const COOLDOWN_PERIOD = 8000;  // 8 segundos entre detecciones
  const MIN_EVENTS = 5;          // Mínimo de eventos de formulario para considerar frustración
  const TRIGGER_THRESHOLD = 0.6;  // Umbral para activar el indicador

  // Estado del detector
  const state: FormRageState = {
    recentFormEvents: [],
    lastRageDetection: 0
  };

  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar solo eventos de formulario
    const formEvents = events.filter(event => 
      event.type.startsWith('form:') || 
      event.type === 'input' || 
      event.type === 'change' || 
      event.type === 'validation'
    );
    
    if (formEvents.length === 0) return results;
    
    // Añadir eventos recientes al estado
    formEvents.forEach(event => {
      const elementId = event.data.element || 'unknown';
      
      state.recentFormEvents.push({
        element: elementId,
        timestamp: event.timestamp,
        type: event.type
      });
    });
    
    // Limpiar eventos antiguos
    state.recentFormEvents = state.recentFormEvents.filter(
      event => now - event.timestamp < DETECTION_WINDOW
    );
    
    // Si no hay suficientes eventos, no analizar
    if (state.recentFormEvents.length < MIN_EVENTS) return results;
    
    // Verificar si ya se detectó recientemente (período de enfriamiento)
    if (now - state.lastRageDetection < COOLDOWN_PERIOD) return results;
    
    // Analizar patrones de frustración
    const score = calculateFormRageScore(state.recentFormEvents);
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastRageDetection = now;
      
      const uniqueElements = new Set(state.recentFormEvents.map(e => e.element)).size;
      const eventTypes = countEventTypes(state.recentFormEvents);
      
      results.push({
        name: 'form_rage',
        isTriggered: true,
        strength: Math.min(1, score / 0.8), // Normalizar entre 0 y 1, limitado a 1
        details: {
          eventsCount: state.recentFormEvents.length,
          uniqueElementsCount: uniqueElements,
          eventTypes,
          score
        }
      });
      
      logger.debug("Form rage detected", { 
        score, 
        eventsCount: state.recentFormEvents.length 
      });
    }
    
    return results;
  };
  
  // Calcular puntuación de frustración con formularios
  const calculateFormRageScore = (events: { element: string; timestamp: number; type: string }[]): number => {
    const eventCount = events.length;
    const timeSpan = Math.max(1, events[events.length - 1].timestamp - events[0].timestamp);
    
    // Factores para calcular el score
    const frequencyFactor = Math.min(1, eventCount / 10); // Más eventos = mayor score
    const intensityFactor = Math.min(1, 5000 / timeSpan); // Eventos más rápidos = mayor score
    
    // Verificar eventos de error o validación
    const errorEvents = events.filter(e => 
      e.type === 'validation' || 
      e.type === 'form:error' || 
      e.type.includes('error')
    ).length;
    
    const errorFactor = Math.min(1, errorEvents / 3);
    
    // Detectar cambios rápidos entre campos (posible señal de frustración)
    const uniqueFields = new Set(events.map(e => e.element)).size;
    const fieldSwitchingFactor = Math.min(1, uniqueFields / 3);
    
    // Combinación ponderada de factores
    return (frequencyFactor * 0.3) + 
           (intensityFactor * 0.3) + 
           (errorFactor * 0.3) + 
           (fieldSwitchingFactor * 0.1);
  };
  
  // Contar frecuencia de tipos de eventos
  const countEventTypes = (events: { type: string }[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    
    events.forEach(event => {
      if (!counts[event.type]) {
        counts[event.type] = 0;
      }
      counts[event.type]++;
    });
    
    return counts;
  };
  
  return {
    process
  };
} 