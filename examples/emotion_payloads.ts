/**
 * Orwel SDK - Emotion Detection System Examples
 * 
 * Este archivo ilustra el flujo y los payloads de eventos generados por el sistema
 * de detección de emociones de Orwel SDK.
 */

// Flujo de detección de emociones:
// 1. Recolección de gestos del usuario mediante event listeners
// 2. Procesamiento de gestos para identificar indicadores de comportamiento
// 3. Análisis de indicadores para detectar patrones emocionales
// 4. Emisión de eventos de emoción cuando se supera el umbral de confianza

/**
 * Ejemplo 1: Evento de emoción de frustración generado por rage clicks
 * 
 * Este evento se envía cuando el usuario hace múltiples clicks rápidos
 * en la misma área, indicando frustración.
 */
const frustrationEvent = {
  // Tipo de evento
  type: "emotion",
  
  // La emoción detectada
  emotion: "frustration",
  
  // Puntuación de la emoción (0-100)
  score: 72,
  
  // Nivel de confianza en la detección (0-1)
  confidence: 0.83,
  
  // Indicadores que contribuyeron a esta detección
  triggers: ["rage_click", "erratic_cursor", "rapid_scrolling"],
  
  // Cuándo ocurrió la detección
  timestamp: "2023-09-15T14:32:45.123Z"
};

/**
 * Ejemplo 2: Evento de emoción de confusión generado por patrones de navegación
 * 
 * Este evento se envía cuando el usuario navega repetidamente entre las mismas páginas
 * o muestra un patrón errático de movimiento del cursor.
 */
const confusionEvent = {
  type: "emotion",
  emotion: "confusion",
  score: 68,
  confidence: 0.76,
  triggers: ["navigation_loop", "erratic_cursor", "hover_indecision"],
  timestamp: "2023-09-15T14:35:12.843Z"
};

/**
 * Ejemplo 3: Evento de emoción de indecisión generado por comportamiento en formularios
 * 
 * Este evento se envía cuando el usuario muestra patrones de indecisión al completar
 * campos de formulario, como escritura y borrado repetidos.
 */
const indecisionEvent = {
  type: "emotion",
  emotion: "indecision",
  score: 75,
  confidence: 0.85,
  triggers: ["field_hesitation", "hover_indecision", "form_rage"],
  timestamp: "2023-09-15T14:38:21.384Z"
};

/**
 * Ejemplo 4: Evento de emoción de engagement positivo
 * 
 * Este evento se envía cuando el usuario muestra patrones de engagement
 * como lectura profunda o interacción concentrada.
 */
const engagementEvent = {
  type: "emotion",
  emotion: "engagement",
  score: 82,
  confidence: 0.91,
  triggers: ["focused_view", "deep_dive"],
  timestamp: "2023-09-15T14:42:18.927Z"
};

/**
 * Flujo completo de detección de emociones
 * 
 * 1. Recolectores de Gestos
 * ----------------------------
 * Monitorizan eventos del usuario como:
 * - Clicks y movimientos del ratón
 * - Eventos de scroll
 * - Pulsaciones de teclado
 * - Interacciones con formularios
 * - Patrones de navegación
 * 
 * Ejemplo de evento de gesto:
 */
const gestureEventExample = {
  type: "click",
  timestamp: 1631712345678,
  data: {
    x: 420,
    y: 180,
    button: 0,
    target: "submit-button",
    targetType: "button"
  }
};

/**
 * 2. Detectores de Indicadores
 * ----------------------------
 * Procesan los eventos de gestos para identificar patrones de comportamiento
 * como rage clicks, scrolling rápido, indecisión en campos, etc.
 * 
 * Ejemplo de indicador:
 */
const indicatorExample = {
  name: "rage_click",
  isTriggered: true,
  strength: 0.85,
  details: {
    clickCount: 5,
    duration: 1200,
    target: "submit-button",
    avgTimeBetweenClicks: 240
  }
};

/**
 * 3. Detector de Emociones
 * -------------------------
 * Analiza los indicadores para calcular puntuaciones para cada emoción.
 * Cada indicador puede afectar a múltiples emociones con diferentes pesos.
 * Las puntuaciones se degradan con el tiempo si no hay nuevos indicadores.
 * 
 * Mapeo de algunos indicadores a emociones:
 */
const indicatorToEmotionMapping = {
  'rage_click': ['frustration', 'urgency'],
  'form_rage': ['frustration'],
  'rapid_scrolling': ['frustration', 'urgency'],
  'erratic_cursor': ['confusion', 'frustration'],
  'hover_indecision': ['indecision', 'confusion'],
  'navigation_loop': ['confusion'],
  'focused_view': ['engagement'],
  'deep_dive': ['engagement'],
  'satisfied_progress': ['satisfaction']
};

/**
 * Estado interno del tracker de emociones
 */
const emotionStateExample = {
  scores: {
    'frustration': { score: 72, triggers: ['rage_click', 'erratic_cursor'], confidence: 0.83 },
    'confusion': { score: 45, triggers: ['erratic_cursor'], confidence: 0.62 },
    'engagement': { score: 28, triggers: [], confidence: 0.30 },
    'satisfaction': { score: 0, triggers: [], confidence: 0 },
    'urgency': { score: 55, triggers: ['rapid_scrolling'], confidence: 0.68 },
    'indecision': { score: 0, triggers: [], confidence: 0 }
  },
  recentIndicators: [
    { name: 'rage_click', isTriggered: true, strength: 0.85 },
    { name: 'erratic_cursor', isTriggered: true, strength: 0.72 },
    { name: 'rapid_scrolling', isTriggered: true, strength: 0.68 }
  ],
  lastDetection: {
    emotion: 'frustration',
    score: 72,
    confidence: 0.83,
    triggers: ['rage_click', 'erratic_cursor'],
    timestamp: '2023-09-15T14:32:45.123Z'
  }
};

/**
 * Configuración del sistema de emociones
 */
const emotionConfigExample = {
  enabled: true,
  detectionThreshold: 65,     // Puntuación mínima para considerar una emoción detectada
  confidenceThreshold: 0.6,   // Confianza mínima requerida
  detectionCooldown: 5000,    // 5 segundos entre detecciones de la misma emoción
  samplingInterval: 1000,     // Procesar indicadores cada 1 segundo
  historyLimit: 50            // Mantener los últimos 50 indicadores
};

/**
 * Uso del módulo de emociones en Orwel SDK
 */

// Inicialización básica (habilitado por defecto)
const basicInitExample = `
orwel.init({
  apiKey: "your-api-key",
  // emotions está habilitado por defecto
});
`;

// Inicialización con configuración personalizada
const customInitExample = `
orwel.init({
  apiKey: "your-api-key",
  emotions: {
    enabled: true,
    detectionThreshold: 70,
    confidenceThreshold: 0.7,
    detectionCooldown: 10000
  }
});
`;

// Desactivar la detección de emociones
const disabledExample = `
orwel.init({
  apiKey: "your-api-key",
  emotions: false
});
`;

/**
 * Vencimientos de puntuaciones y periodo de enfriamiento
 * 
 * - Las puntuaciones de emoción decaen con el tiempo si no hay nuevos indicadores (SCORE_DECAY_RATE = 2 puntos/segundo)
 * - Existe un periodo de enfriamiento (cooldown) entre detecciones de la misma emoción (5 segundos por defecto)
 * - Esto evita enviar múltiples eventos de la misma emoción en un periodo corto
 */

export {
  frustrationEvent,
  confusionEvent,
  indecisionEvent,
  engagementEvent,
  gestureEventExample,
  indicatorExample,
  indicatorToEmotionMapping,
  emotionStateExample,
  emotionConfigExample
}; 