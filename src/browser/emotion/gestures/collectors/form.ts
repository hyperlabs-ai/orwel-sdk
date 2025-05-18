import { createLogger } from "../../../../utils";
import { GestureEvent, GestureCollector } from "../../types";
import { throttle } from "../../../../utils";

/**
 * Crea un recolector de interacciones con formularios
 */
export function createFormInteractionTracker(
  onEvent: (event: GestureEvent) => void,
  logger: ReturnType<typeof createLogger>
): GestureCollector {
  // Estado para tracking
  let isTracking = false;
  
  // Mapeo de campos a su estado
  const fieldStates = new Map<HTMLElement, {
    focusTime: number;
    lastChangeTime: number;
    changeTimes: number[];
    originalValue: string;
    currentValue: string;
    hasInteracted: boolean;
  }>();
  
  // Función para manejar el enfoque en un campo
  const handleFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (!isFormField(target)) return;
    
    const now = Date.now();
    const fieldId = getFieldIdentifier(target);
    
    // Guardar estado inicial del campo
    const value = getElementValue(target);
    
    fieldStates.set(target, {
      focusTime: now,
      lastChangeTime: now,
      changeTimes: [],
      originalValue: value,
      currentValue: value,
      hasInteracted: false
    });
    
    // Enviar evento de foco
    onEvent({
      type: 'field_focus',
      timestamp: now,
      data: {
        fieldId,
        fieldType: target.tagName.toLowerCase(),
        formId: getFormId(target)
      }
    });
  };
  
  // Función para manejar la pérdida de enfoque en un campo
  const handleBlur = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (!isFormField(target)) return;
    
    const now = Date.now();
    const fieldId = getFieldIdentifier(target);
    const state = fieldStates.get(target);
    
    if (state) {
      const currentValue = getElementValue(target);
      const focusDuration = now - state.focusTime;
      const valueChanged = currentValue !== state.originalValue;
      
      // Análisis de comportamiento en el campo
      let hesitationDetected = false;
      
      // Detección de indecisión/duda del usuario
      if (state.changeTimes.length > 0) {
        const changeDurations = [];
        
        for (let i = 1; i < state.changeTimes.length; i++) {
          changeDurations.push(state.changeTimes[i] - state.changeTimes[i-1]);
        }
        
        // Detectar patrones de indecisión - muchos cambios con pausas largas entre ellos
        if (changeDurations.length >= 3) {
          const avgChangeDuration = changeDurations.reduce((sum, dur) => sum + dur, 0) / changeDurations.length;
          
          // Pausas promedio de más de 1.5 segundos entre cambios puede indicar indecisión
          if (avgChangeDuration > 1500 && state.changeTimes.length >= 5) {
            hesitationDetected = true;
            
            onEvent({
              type: 'field_hesitation',
              timestamp: now,
              data: {
                fieldId,
                fieldType: target.tagName.toLowerCase(),
                formId: getFormId(target),
                duration: focusDuration,
                changeCount: state.changeTimes.length,
                avgTimeBetweenChanges: avgChangeDuration
              }
            });
          }
        }
      }
      
      // Evento de salida del campo
      onEvent({
        type: 'field_blur',
        timestamp: now,
        data: {
          fieldId,
          fieldType: target.tagName.toLowerCase(),
          formId: getFormId(target),
          duration: focusDuration,
          valueChanged,
          changeCount: state.changeTimes.length,
          hesitationDetected
        }
      });
      
      // Eliminar estado del campo
      fieldStates.delete(target);
    }
  };
  
  // Función para manejar cambios en un campo
  const handleInput = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!isFormField(target)) return;
    
    const now = Date.now();
    const state = fieldStates.get(target);
    
    if (state) {
      const currentValue = getElementValue(target);
      
      // Solo registrar si el valor realmente cambió
      if (currentValue !== state.currentValue) {
        state.currentValue = currentValue;
        state.lastChangeTime = now;
        state.changeTimes.push(now);
        state.hasInteracted = true;
        
        // Enviar evento de cambio
        onEvent({
          type: 'field_change',
          timestamp: now,
          data: {
            fieldId: getFieldIdentifier(target),
            fieldType: target.tagName.toLowerCase(),
            formId: getFormId(target),
            timeSinceFocus: now - state.focusTime,
            changeCount: state.changeTimes.length
          }
        });
      }
    }
  };
  
  // Función para manejar envío de formulario
  const handleSubmit = (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement;
    const now = Date.now();
    
    onEvent({
      type: 'form_submit',
      timestamp: now,
      data: {
        formId: getFormId(form),
        fields: Array.from(form.elements).length
      }
    });
  };
  
  // Utilidades
  const isFormField = (element: HTMLElement): boolean => {
    if (!element) return false;
    
    const tag = element.tagName.toLowerCase();
    return (
      tag === 'input' || 
      tag === 'textarea' || 
      tag === 'select' || 
      (tag === 'div' && element.hasAttribute('contenteditable'))
    );
  };
  
  const getElementValue = (element: HTMLElement): string => {
    const tag = element.tagName.toLowerCase();
    
    if (tag === 'input' || tag === 'textarea') {
      return (element as HTMLInputElement).value;
    } else if (tag === 'select') {
      return (element as HTMLSelectElement).value;
    } else if (element.hasAttribute('contenteditable')) {
      return element.textContent || '';
    }
    
    return '';
  };
  
  const getFieldIdentifier = (element: HTMLElement): string => {
    // Priorizar ID, luego nombre, luego otros atributos para identificar el campo
    if (element.id) {
      return element.id;
    }
    
    if ((element as HTMLInputElement).name) {
      return (element as HTMLInputElement).name;
    }
    
    // Fallback: usar tipo, placeholder u otras propiedades
    if ((element as HTMLInputElement).placeholder) {
      return `field-${(element as HTMLInputElement).placeholder}`;
    }
    
    // Último recurso: usar la posición del elemento en el DOM
    const form = element.closest('form');
    if (form) {
      const fields = Array.from(form.elements);
      const index = fields.indexOf(element as HTMLFormElement);
      return `field-${index >= 0 ? index : Math.random().toString(36).substring(2, 9)}`;
    }
    
    return `field-${Math.random().toString(36).substring(2, 9)}`;
  };
  
  const getFormId = (element: HTMLElement): string => {
    const form = element.closest('form');
    
    if (!form) return '';
    
    if (form.id) {
      return form.id;
    }
    
    if (form.getAttribute('name')) {
      return form.getAttribute('name') || '';
    }
    
    // Si no tiene id ni nombre, crear un id único basado en su posición en el DOM
    const forms = Array.from(document.forms);
    const index = forms.indexOf(form);
    
    return `form-${index >= 0 ? index : Math.random().toString(36).substring(2, 9)}`;
  };
  
  // Inicializar el tracking
  const init = () => {
    if (isTracking) return;
    
    try {
      // Usar event delegation para capturar todos los eventos de formulario
      document.addEventListener('focus', handleFocus, true);
      document.addEventListener('blur', handleBlur, true);
      document.addEventListener('input', handleInput, true);
      document.addEventListener('submit', handleSubmit, true);
      
      isTracking = true;
      logger.debug("Form interaction tracker initialized");
    } catch (error) {
      logger.error("Failed to initialize form interaction tracker", { error });
    }
  };
  
  // Detener el tracking
  const destroy = () => {
    if (!isTracking) return;
    
    try {
      document.removeEventListener('focus', handleFocus, true);
      document.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('submit', handleSubmit, true);
      
      fieldStates.clear();
      isTracking = false;
      logger.debug("Form interaction tracker destroyed");
    } catch (error) {
      logger.error("Failed to destroy form interaction tracker", { error });
    }
  };
  
  return {
    init,
    destroy
  };
} 