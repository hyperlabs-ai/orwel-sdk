import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface ViewportActivity {
  scrollCount: number;
  elementInteractions: Map<string, number>;
  viewDuration: number;
  inactivityPeriods: number;
  startTime: number;
  lastActivity: number;
}

interface FocusedViewState {
  currentView: ViewportActivity;
  lastDetection: number;
}

/**
 * Detector de indicadores de "focused view" - concentración del usuario en una vista
 * particular con interacciones consistentes, lo que indica engagement (compromiso).
 * Características:
 * - Tiempo prolongado en la misma vista/página
 * - Interacción consistente con elementos (clicks, scrolls organizados)
 * - Pocas distracciones o cambios bruscos de actividad
 */
export function createFocusedViewIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const INACTIVITY_THRESHOLD = 3000;  // 3 segundos sin actividad para considerar inactividad
  const MIN_FOCUS_DURATION = 10000;   // 10 segundos mínimos para considerar foco
  const COOLDOWN_PERIOD = 30000;      // 30 segundos entre detecciones
  const TRIGGER_THRESHOLD = 0.65;     // Umbral para activar el indicador
  
  // Estado del detector
  const state: FocusedViewState = {
    currentView: {
      scrollCount: 0,
      elementInteractions: new Map(),
      viewDuration: 0,
      inactivityPeriods: 0,
      startTime: Date.now(),
      lastActivity: Date.now()
    },
    lastDetection: 0
  };
  
  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar eventos relevantes
    const userEvents = events.filter(event => 
      event.type === 'click' || 
      event.type === 'scroll' || 
      event.type === 'mousemove' || 
      event.type === 'input' || 
      event.type === 'keydown'
    );
    
    // Si hay eventos de cambio de página, reiniciar el seguimiento
    const pageChangeEvents = events.filter(event => 
      event.type === 'navigation' || 
      event.type === 'page:view' || 
      event.type === 'route:change'
    );
    
    if (pageChangeEvents.length > 0) {
      // Reiniciar seguimiento de vista actual
      state.currentView = {
        scrollCount: 0,
        elementInteractions: new Map(),
        viewDuration: 0,
        inactivityPeriods: 0,
        startTime: now,
        lastActivity: now
      };
      return results;
    }
    
    if (userEvents.length === 0) {
      // Verificar inactividad
      if (now - state.currentView.lastActivity > INACTIVITY_THRESHOLD) {
        state.currentView.inactivityPeriods++;
      }
    } else {
      // Actualizar timestamp de última actividad
      state.currentView.lastActivity = now;
      
      // Procesar eventos relevantes
      userEvents.forEach(event => {
        // Contar scrolls
        if (event.type === 'scroll') {
          state.currentView.scrollCount++;
        }
        
        // Registrar interacciones con elementos
        if (event.data.element && (event.type === 'click' || event.type === 'input')) {
          const element = event.data.element as string;
          const count = state.currentView.elementInteractions.get(element) || 0;
          state.currentView.elementInteractions.set(element, count + 1);
        }
      });
    }
    
    // Actualizar duración de la vista actual
    state.currentView.viewDuration = now - state.currentView.startTime;
    
    // Si la duración no alcanza el mínimo, no continuar
    if (state.currentView.viewDuration < MIN_FOCUS_DURATION) return results;
    
    // Verificar período de enfriamiento
    if (now - state.lastDetection < COOLDOWN_PERIOD) return results;
    
    // Calcular score de enfoque
    const score = calculateFocusScore(state.currentView);
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastDetection = now;
      
      // Calcular métricas adicionales para incluir en el resultado
      const uniqueElementsCount = state.currentView.elementInteractions.size;
      const totalInteractions = Array.from(state.currentView.elementInteractions.values())
        .reduce((sum, count) => sum + count, 0);
      
      results.push({
        name: 'focused_view',
        isTriggered: true,
        strength: Math.min(1, score / 0.9), // Normalizar entre 0 y 1, limitado a 1
        details: {
          viewDuration: state.currentView.viewDuration,
          durationSeconds: Math.round(state.currentView.viewDuration / 1000),
          scrollCount: state.currentView.scrollCount,
          uniqueElementsCount,
          totalInteractions,
          inactivityPeriods: state.currentView.inactivityPeriods,
          score
        }
      });
      
      logger.debug("Focused view detected", { 
        score, 
        duration: Math.round(state.currentView.viewDuration / 1000) + 's',
        interactions: totalInteractions
      });
    }
    
    return results;
  };
  
  // Calcular puntuación de enfoque/concentración
  const calculateFocusScore = (activity: ViewportActivity): number => {
    // Factor de duración (más tiempo en la misma vista es mejor)
    // Máximo factor para 3 minutos (180 segundos)
    const durationSeconds = activity.viewDuration / 1000;
    const durationFactor = Math.min(1, durationSeconds / 180);
    
    // Factor de interacción (más interacciones distribuidas es mejor)
    const uniqueElements = activity.elementInteractions.size;
    const totalInteractions = Array.from(activity.elementInteractions.values())
      .reduce((sum, count) => sum + count, 0);
    
    // Calcular la distribución de interacciones (balance entre variedad y repetición)
    let interactionBalance = 0;
    if (uniqueElements > 0 && totalInteractions > 0) {
      const avgPerElement = totalInteractions / uniqueElements;
      // Una buena distribución está entre 2-5 interacciones promedio por elemento
      interactionBalance = avgPerElement >= 2 && avgPerElement <= 5 ? 1 : 
        avgPerElement < 2 ? avgPerElement / 2 : 
        Math.max(0, 1 - ((avgPerElement - 5) / 10));
    }
    
    const interactionFactor = Math.min(1, (
      (uniqueElements / 5) * 0.5 + 
      (totalInteractions / 15) * 0.3 + 
      interactionBalance * 0.2
    ));
    
    // Factor de continuidad (menos períodos de inactividad es mejor)
    // Períodos de inactividad penalizan, pero no demasiado si la sesión es larga
    const expectedInactivityPeriods = Math.max(1, durationSeconds / 60); // ~1 por minuto
    const inactivityPenalty = Math.min(1, activity.inactivityPeriods / expectedInactivityPeriods);
    const continuityFactor = 1 - (inactivityPenalty * 0.7);
    
    // Factor de scroll (un scroll moderado indica lectura/exploración activa)
    // Un buen ratio: ~1 scroll cada 5 segundos durante la actividad
    const scrollRatio = activity.scrollCount / (durationSeconds / 5);
    const scrollFactor = scrollRatio > 0.2 && scrollRatio < 3 ? 
      Math.min(1, (scrollRatio < 1 ? scrollRatio : 1 / scrollRatio)) : 0.1;
    
    // Combinación ponderada de factores
    return (durationFactor * 0.4) + 
           (interactionFactor * 0.3) + 
           (continuityFactor * 0.2) + 
           (scrollFactor * 0.1);
  };
  
  return {
    process
  };
} 