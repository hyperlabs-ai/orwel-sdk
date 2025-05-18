import { createLogger } from "../../utils";
import { OrwelEvent } from "../../types";
import { 
  EmotionType, 
  EmotionOptions, 
  IndicatorResult, 
  EmotionState,
} from "./types";
import { initGestureCollectors } from "./gestures";
import { createIndicatorDetectors } from "./indicators";
import { createEmotionDetector } from "./detectors";

const DEFAULT_OPTIONS: EmotionOptions = {
  enabled: true,
  detectionThreshold: 65,     // Puntuación mínima para considerar una emoción detectada
  confidenceThreshold: 0.6,   // Confianza mínima requerida
  detectionCooldown: 5000,    // 5 segundos entre detecciones de la misma emoción
  samplingInterval: 1000,     // Procesar indicadores cada 1 segundo
  historyLimit: 50            // Mantener los últimos 50 indicadores
};

/**
 * Crea el módulo de detección de emociones
 */
export function createEmotionTracker(
  queue: {
    addEvent: (event: OrwelEvent) => void;
  },
  logger: ReturnType<typeof createLogger>,
  options: EmotionOptions = {}
) {
  // Combinar opciones predeterminadas con las proporcionadas
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  // Estado del sistema de emociones
  const state: EmotionState = {
    scores: {
      'frustration': { score: 0, triggers: [], confidence: 0 },
      'confusion': { score: 0, triggers: [], confidence: 0 },
      'engagement': { score: 0, triggers: [], confidence: 0 },
      'satisfaction': { score: 0, triggers: [], confidence: 0 },
      'urgency': { score: 0, triggers: [], confidence: 0 },
      'indecision': { score: 0, triggers: [], confidence: 0 }
    },
    recentIndicators: []
  };

  // Intervalos y timestamps
  let processingInterval: ReturnType<typeof setInterval> | null = null;
  let lastDetectionMap: Record<EmotionType, number> = {
    'frustration': 0,
    'confusion': 0,
    'engagement': 0,
    'satisfaction': 0,
    'urgency': 0,
    'indecision': 0
  };

  // Inicializar componentes
  let gestureCollectors: ReturnType<typeof initGestureCollectors> | null = null;
  let indicatorDetectors: ReturnType<typeof createIndicatorDetectors> | null = null;
  let emotionDetector = createEmotionDetector(logger);
  
  // Cola de eventos de gestos
  const gestureEvents: any[] = [];

  // Procesar los indicadores y detectar emociones
  const processIndicators = () => {
    if (!config.enabled || !indicatorDetectors) return;
    
    // Procesar eventos y obtener indicadores
    const newIndicators = indicatorDetectors.processEvents([...gestureEvents]);
    gestureEvents.length = 0; // Limpiar la cola de eventos
    
    if (newIndicators.length > 0) {
      logger.debug("Detected indicators", { count: newIndicators.length });
      
      // Procesar cada indicador
      newIndicators.forEach((indicator: IndicatorResult) => {
        // Añadir a la lista reciente de indicadores
        state.recentIndicators.push(indicator);
        
        // Mantener el límite de historial
        if (state.recentIndicators.length > (config.historyLimit || 50)) {
          state.recentIndicators.shift();
        }
        
        // Enviar al detector de emociones
        emotionDetector.processIndicator(indicator);
      });
      
      // Detectar emociones basadas en indicadores procesados
      detectEmotions();
    }
  };
  
  // Detectar emociones y emitir eventos cuando sea apropiado
  const detectEmotions = () => {
    // Obtener la detección de emoción actual
    const detection = emotionDetector.detectEmotions();
    
    if (detection && detection.score >= (config.detectionThreshold || 65) && 
        detection.confidence >= (config.confidenceThreshold || 0.6)) {
      
      const now = Date.now();
      const lastDetection = lastDetectionMap[detection.emotion] || 0;
      
      // Verificar periodo de enfriamiento para evitar enviar la misma emoción repetidamente
      if (now - lastDetection >= (config.detectionCooldown || 5000)) {
        // Actualizar timestamp de última detección
        lastDetectionMap[detection.emotion] = now;
        
        // Guardar la última detección
        state.lastDetection = detection;
        
        // Enviar evento de emoción detectada
        queue.addEvent({
          type: "emotion",
          emotion: detection.emotion,
          score: detection.score,
          confidence: detection.confidence,
          triggers: detection.triggers,
          timestamp: detection.timestamp
        });
        
        logger.info("Emotion detected", { 
          emotion: detection.emotion, 
          score: detection.score,
          confidence: detection.confidence
        });
      }
    }
  };

  // Inicializar el sistema de detección de emociones
  const init = (options: EmotionOptions = {}) => {
    // Actualizar configuración con nuevas opciones
    Object.assign(config, options);
    
    if (!config.enabled) {
      logger.info("Emotion detection is disabled");
      return;
    }
    
    logger.info("Initializing emotion detection system");
    
    // Inicializar recolectores de gestos
    gestureCollectors = initGestureCollectors(
      (event) => gestureEvents.push(event),
      logger
    );
    
    // Inicializar detectores de indicadores
    indicatorDetectors = createIndicatorDetectors(logger);
    
    // Iniciar intervalo de procesamiento
    processingInterval = setInterval(processIndicators, config.samplingInterval || 1000);
    
    logger.success("Emotion detection system initialized");
  };
  
  // Detener y limpiar 
  const destroy = () => {
    if (processingInterval) {
      clearInterval(processingInterval);
      processingInterval = null;
    }
    
    if (gestureCollectors) {
      gestureCollectors.destroy();
      gestureCollectors = null;
    }
    
    logger.info("Emotion detection system destroyed");
  };
  
  // Añadir evento de gesto manualmente
  const addGestureEvent = (event: any) => {
    if (config.enabled) {
      gestureEvents.push(event);
    }
  };
  
  // Obtener estado actual
  const getState = (): EmotionState => {
    return { 
      scores: emotionDetector.getScores(),
      recentIndicators: [...state.recentIndicators],
      lastDetection: state.lastDetection
    };
  };
  
  return {
    init,
    destroy,
    addGestureEvent,
    getState
  };
} 