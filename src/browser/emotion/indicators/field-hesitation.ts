import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface FieldInteraction {
  element: string;
  startTime: number;
  endTime?: number;
  keystrokes: number;
  deletions: number;
  pauses: number;
  focusChanges: number;
}

interface FieldHesitationState {
  currentField?: FieldInteraction;
  recentFields: FieldInteraction[];
  lastDetection: number;
}

/**
 * Detector de indicadores de "field hesitation" - comportamiento de indecisión
 * del usuario al interactuar con campos de formulario, caracterizado por:
 * - Escribir y borrar varias veces el mismo campo
 * - Pausas largas durante la entrada de datos
 * - Cambios de foco repetidos en el mismo campo
 */
export function createFieldHesitationIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const DETECTION_WINDOW = 60000;     // 1 minuto para analizar patrones
  const COOLDOWN_PERIOD = 10000;      // 10 segundos entre detecciones
  const PAUSE_THRESHOLD = 2000;       // 2 segundos para considerar una pausa
  const TRIGGER_THRESHOLD = 0.65;     // Umbral para activar el indicador
  
  // Estado del detector
  const state: FieldHesitationState = {
    recentFields: [],
    lastDetection: 0
  };
  
  // Última actividad de teclado para detectar pausas
  let lastKeyTime = 0;
  
  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar eventos relevantes de formulario
    const formEvents = events.filter(event => 
      (event.type === 'input' || 
       event.type === 'keydown' || 
       event.type === 'keyup' || 
       event.type === 'form:focus' || 
       event.type === 'form:blur' || 
       event.type === 'form:change' || 
       event.type === 'focus' || 
       event.type === 'blur') && 
      event.data.element
    );
    
    if (formEvents.length === 0) return results;
    
    // Procesar cada evento
    formEvents.forEach(event => {
      processFormEvent(event);
    });
    
    // Limpiar campos antiguos
    state.recentFields = state.recentFields.filter(
      field => now - (field.endTime || field.startTime) < DETECTION_WINDOW
    );
    
    // Si no hay suficientes campos, no analizar
    if (state.recentFields.length === 0) return results;
    
    // Verificar si ya se detectó recientemente
    if (now - state.lastDetection < COOLDOWN_PERIOD) return results;
    
    // Analizar patrones de indecisión en campos
    const score = calculateHesitationScore();
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastDetection = now;
      
      // Calcular métricas adicionales
      const totalDeletions = state.recentFields.reduce((sum, field) => 
        sum + field.deletions, 0);
      
      const totalPauses = state.recentFields.reduce((sum, field) => 
        sum + field.pauses, 0);
      
      const totalFocusChanges = state.recentFields.reduce((sum, field) => 
        sum + field.focusChanges, 0);
      
      results.push({
        name: 'field_hesitation',
        isTriggered: true,
        strength: Math.min(1, score / 0.9), // Normalizar entre 0 y 1, limitado a 1
        details: {
          fieldsCount: state.recentFields.length,
          totalDeletions,
          totalPauses,
          totalFocusChanges,
          fields: state.recentFields.map(f => ({
            element: f.element,
            deletions: f.deletions,
            pauses: f.pauses,
            focusChanges: f.focusChanges
          })),
          score
        }
      });
      
      logger.debug("Field hesitation detected", { 
        score, 
        fields: state.recentFields.length,
        deletions: totalDeletions,
        pauses: totalPauses
      });
    }
    
    return results;
  };
  
  // Procesar un evento de formulario
  const processFormEvent = (event: GestureEvent) => {
    const { type, timestamp, data } = event;
    const elementId = data.element as string;
    
    // Acciones según el tipo de evento
    if (type === 'focus' || type === 'form:focus') {
      if (state.currentField && state.currentField.element === elementId) {
        // Incrementar contador de cambios de foco si es el mismo campo
        state.currentField.focusChanges++;
      } else {
        // Si hay un campo actual, finalizarlo
        if (state.currentField) {
          state.currentField.endTime = timestamp;
          state.recentFields.push({...state.currentField});
        }
        
        // Iniciar nuevo campo
        state.currentField = {
          element: elementId,
          startTime: timestamp,
          keystrokes: 0,
          deletions: 0,
          pauses: 0,
          focusChanges: 0
        };
      }
    } 
    else if (type === 'blur' || type === 'form:blur') {
      // Finalizar campo actual
      if (state.currentField && state.currentField.element === elementId) {
        state.currentField.endTime = timestamp;
        state.recentFields.push({...state.currentField});
        state.currentField = undefined;
      }
    } 
    else if (state.currentField && state.currentField.element === elementId) {
      // Eventos de teclado
      if (type === 'keydown' || type === 'keyup' || type === 'input') {
        const key = data.key || '';
        
        // Incrementar contadores
        state.currentField.keystrokes++;
        
        // Detección de borrado
        if (key === 'Backspace' || key === 'Delete' || (data.inputType && data.inputType.includes('delete'))) {
          state.currentField.deletions++;
        }
        
        // Detección de pausas
        const now = timestamp;
        if (lastKeyTime > 0 && now - lastKeyTime > PAUSE_THRESHOLD) {
          state.currentField.pauses++;
        }
        
        lastKeyTime = now;
      }
    }
  };
  
  // Calcular puntuación de indecisión en campos
  const calculateHesitationScore = (): number => {
    if (state.recentFields.length === 0) return 0;
    
    // Analizar cada campo para calcular un puntaje individual
    const fieldScores = state.recentFields.map(field => {
      // Si no hay keystrokes, no hay indecisión
      if (field.keystrokes === 0) return 0;
      
      // Calcular ratio de borrados (borrados / pulsaciones)
      const deletionRatio = field.deletions / Math.max(1, field.keystrokes);
      
      // Normalizar a un valor entre 0-1, donde >0.3 es alta indecisión
      const deletionScore = Math.min(1, deletionRatio / 0.3);
      
      // Puntaje por pausas (0-1)
      const pauseScore = Math.min(1, field.pauses / 3);
      
      // Puntaje por cambios de foco (0-1)
      const focusScore = Math.min(1, field.focusChanges / 2);
      
      // Combinar factores
      return (deletionScore * 0.5) + (pauseScore * 0.3) + (focusScore * 0.2);
    });
    
    // Promediar puntuaciones, dando más peso a las más altas
    fieldScores.sort((a, b) => b - a); // Ordenar de mayor a menor
    
    // Tomar el promedio de los 3 campos con mayor puntuación o menos si no hay suficientes
    const topFields = fieldScores.slice(0, Math.min(3, fieldScores.length));
    
    // Calcular promedio ponderado
    if (topFields.length === 0) return 0;
    
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < topFields.length; i++) {
      const weight = topFields.length - i; // Mayor peso para las puntuaciones más altas
      weightedSum += topFields[i] * weight;
      weightSum += weight;
    }
    
    // Normalizar a 0-1
    return weightedSum / weightSum;
  };
  
  return {
    process
  };
} 