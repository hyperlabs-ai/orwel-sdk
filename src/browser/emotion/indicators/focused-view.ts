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
  const INACTIVITY_THRESHOLD = 30000;  // 30 segundos sin actividad
  const MAX_INTERACTIONS = 1000;        // Límite de interacciones por elemento
  const MAX_ELEMENTS = 100;             // Límite de elementos únicos rastreados
  const MIN_VIEW_TIME = 10000;          // Tiempo mínimo para considerar vista enfocada
  const MAX_VIEW_TIME = 3600000;        // Tiempo máximo de vista (1 hora)
  
  // Estado del indicador con límites de memoria
  const state = {
    currentView: {
      scrollCount: 0,
      elementInteractions: new Map<string, number>(),
      viewDuration: 0,
      inactivityPeriods: 0,
      startTime: Date.now(),
      lastActivity: Date.now()
    }
  };

  // Sanitizar y validar datos de elemento
  const sanitizeElementData = (element: any): string => {
    try {
      if (!element) return 'unknown';
      
      // Si es string, sanitizar directamente
      if (typeof element === 'string') {
        return element.slice(0, 50).replace(/[^\w\s-]/g, '');
      }
      
      // Si es elemento DOM, extraer identificador
      if (element instanceof Element) {
        const id = element.id || '';
        const classes = Array.from(element.classList).join(' ');
        const tag = element.tagName.toLowerCase();
        return (id || classes || tag).slice(0, 50).replace(/[^\w\s-]/g, '');
      }
      
      return 'unknown';
    } catch (error) {
      logger.error("Error sanitizing element data", { error });
      return 'unknown';
    }
  };

  // Actualizar interacciones con límite de memoria
  const updateElementInteractions = (elementId: string) => {
    try {
      const interactions = state.currentView.elementInteractions;
      
      // Limitar número de elementos rastreados
      if (!interactions.has(elementId) && interactions.size >= MAX_ELEMENTS) {
        // Eliminar elemento con menos interacciones
        let minInteractions = Infinity;
        let elementToRemove = '';
        
        interactions.forEach((count, element) => {
          if (count < minInteractions) {
            minInteractions = count;
            elementToRemove = element;
          }
        });
        
        if (elementToRemove) {
          interactions.delete(elementToRemove);
        }
      }
      
      // Actualizar contador con límite
      const currentCount = interactions.get(elementId) || 0;
      interactions.set(elementId, Math.min(currentCount + 1, MAX_INTERACTIONS));
    } catch (error) {
      logger.error("Error updating element interactions", { error });
    }
  };

  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    try {
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
          // Contar scrolls con límite
          if (event.type === 'scroll') {
            state.currentView.scrollCount = Math.min(
              state.currentView.scrollCount + 1, 
              MAX_INTERACTIONS
            );
          }
          
          // Registrar interacciones con elementos
          if (event.data.element && (event.type === 'click' || event.type === 'input')) {
            const elementId = sanitizeElementData(event.data.element);
            updateElementInteractions(elementId);
          }
        });
      }
      
      // Actualizar y validar duración de la vista
      const rawDuration = now - state.currentView.startTime;
      state.currentView.viewDuration = Math.min(
        Math.max(0, rawDuration), 
        MAX_VIEW_TIME
      );
      
      // Calcular puntuación de enfoque
      if (state.currentView.viewDuration >= MIN_VIEW_TIME) {
        const score = calculateFocusScore(state.currentView);
        
        if (score > 0) {
          results.push({
            name: 'focused_view',
            isTriggered: true,
            strength: score,
            details: {
              viewDuration: state.currentView.viewDuration,
              scrollCount: state.currentView.scrollCount,
              uniqueElements: state.currentView.elementInteractions.size,
              inactivityPeriods: state.currentView.inactivityPeriods
            }
          });
        }
      }
      
      return results;
    } catch (error) {
      logger.error("Error processing focused view events", { error });
      return [];
    }
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