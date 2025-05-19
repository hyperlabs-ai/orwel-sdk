import { createLogger } from "../../../utils";
import {
  EmotionType,
  EmotionScore,
  IndicatorResult,
  EmotionDetectionResult,
  PerformanceMetrics
} from "../types";

// Mapeo de indicadores a emociones (solo indicadores implementados)
const INDICATOR_EMOTION_MAP: Record<string, EmotionType[]> = {
  rage_click: ["frustration", "urgency"],
  form_rage: ["frustration"],
  rapid_scrolling: ["frustration", "urgency"],
  erratic_cursor: ["confusion", "frustration"],
  hover_indecision: ["indecision", "confusion"],
  navigation_loop: ["confusion"],
  focused_view: ["engagement"],
  field_hesitation: ["indecision", "confusion"],
};

// Pesos de influencia de cada indicador en las emociones (solo indicadores implementados)
const INDICATOR_WEIGHTS: Record<string, Record<EmotionType, number>> = {
  rage_click: {
    frustration: 25,
    urgency: 15,
    confusion: 10,
    indecision: 0,
    engagement: -5,
    satisfaction: -15,
  },
  form_rage: {
    frustration: 30,
    confusion: 10,
    urgency: 10,
    indecision: 5,
    engagement: -5,
    satisfaction: -20,
  },
  rapid_scrolling: {
    frustration: 15,
    urgency: 20,
    confusion: 5,
    indecision: 0,
    engagement: 0,
    satisfaction: -5,
  },
  erratic_cursor: {
    confusion: 20,
    frustration: 15,
    indecision: 10,
    urgency: 5,
    engagement: -5,
    satisfaction: -10,
  },
  hover_indecision: {
    indecision: 25,
    confusion: 15,
    frustration: 5,
    urgency: 0,
    engagement: -5,
    satisfaction: -10,
  },
  navigation_loop: {
    confusion: 25,
    frustration: 10,
    indecision: 15,
    urgency: 5,
    engagement: -5,
    satisfaction: -10,
  },
  focused_view: {
    engagement: 25,
    satisfaction: 10,
    urgency: 0,
    frustration: -15,
    confusion: -15,
    indecision: -10,
  },
  field_hesitation: {
    indecision: 20,
    confusion: 15,
    frustration: 5,
    urgency: 0,
    engagement: -5,
    satisfaction: -5,
  },
};

// Optimización: Usar TypedArrays para cálculos numéricos
const EMOTION_COUNT = 6; // Número de emociones
const SCORE_BUFFER = new Float64Array(EMOTION_COUNT);
const CONFIDENCE_BUFFER = new Float64Array(EMOTION_COUNT);

// Mapeo de índices para el buffer
const EMOTION_INDICES: Record<EmotionType, number> = {
  frustration: 0,
  confusion: 1,
  engagement: 2,
  satisfaction: 3,
  urgency: 4,
  indecision: 5
};

// Constantes optimizadas
const SCORE_DECAY_RATE = 2;
const MAX_SCORE = 100;
const MIN_CONFIDENCE_THRESHOLD = 0.2;
const CONFIDENCE_DECAY_RATE = 0.1;
const MAX_TRIGGERS_PER_EMOTION = 10;

// Cache LRU para resultados de cálculos frecuentes
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Refrescar posición en LRU
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      // Eliminar el elemento más antiguo
      const entries = this.cache.entries();
      const firstEntry = entries.next().value;
      if (firstEntry) {
        this.cache.delete(firstEntry[0]);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Crea un detector de emociones que analiza indicadores y determina las emociones del usuario
 */
export function createEmotionDetector(logger: ReturnType<typeof createLogger>) {
  // Métricas de rendimiento
  const metrics: PerformanceMetrics = {
    processedEvents: 0,
    lastProcessingTime: 0,
    averageProcessingTime: 0,
    peakMemoryUsage: 0,
    eventRate: 0,
    dropRate: 0
  };

  // Cache para cálculos de confianza
  const confidenceCache = new LRUCache<string, number>(1000);
  
  // Estado protegido con Object.freeze
  const emotionScores: Record<EmotionType, EmotionScore> = Object.freeze({
    frustration: { score: 0, triggers: [], confidence: 0 },
    confusion: { score: 0, triggers: [], confidence: 0 },
    engagement: { score: 0, triggers: [], confidence: 0 },
    satisfaction: { score: 0, triggers: [], confidence: 0 },
    urgency: { score: 0, triggers: [], confidence: 0 },
    indecision: { score: 0, triggers: [], confidence: 0 }
  });

  // Control de concurrencia
  let isProcessing = false;
  let lastProcessTime = Date.now();
  let lastDecayTime = Date.now();
  let processingCount = 0;

  // Procesar indicador con optimizaciones
  const processIndicator = (indicator: IndicatorResult): void => {
    const startTime = performance.now();
    
    try {
      if (isProcessing) {
        metrics.dropRate++;
        logger.warning('Concurrent processIndicator call detected, skipping');
        return;
      }

      isProcessing = true;
      processingCount++;

      // Validación de seguridad
      if (!validateIndicator(indicator)) {
        metrics.dropRate++;
        return;
      }

      // Aplicar decaimiento con throttling
      if (shouldApplyDecay()) {
        applyScoreDecay();
      }

      // Procesar solo si está activado
      if (!indicator.isTriggered) return;

      // Actualizar buffers numéricos
      updateScoreBuffers(indicator);

      // Actualizar estado
      syncStateFromBuffers();

      // Actualizar métricas
      updateMetrics(startTime);

    } catch (error) {
      logger.error("Error processing indicator", { error });
      metrics.dropRate++;
    } finally {
      isProcessing = false;
    }
  };

  // Validación de seguridad mejorada
  const validateIndicator = (indicator: IndicatorResult): boolean => {
    try {
      if (!indicator || typeof indicator !== 'object') return false;
      
      // Validar nombre del indicador
      if (!INDICATOR_EMOTION_MAP[indicator.name]) {
        logger.warning(`Invalid indicator name: ${indicator.name}`);
        return false;
      }

      // Validar fuerza del indicador
      if (typeof indicator.strength !== 'number' || 
          indicator.strength < 0 || 
          indicator.strength > 1) {
        logger.warning(`Invalid indicator strength: ${indicator.strength}`);
        return false;
      }

      // Validar detalles
      if (indicator.details && 
          (typeof indicator.details !== 'object' || 
           JSON.stringify(indicator.details).length > 1000)) {
        logger.warning(`Invalid indicator details`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Error validating indicator", { error });
      return false;
    }
  };

  // Optimización de decaimiento
  const shouldApplyDecay = (): boolean => {
    const now = Date.now();
    if (now - lastDecayTime < 100) return false; // Throttling
    if (now < lastDecayTime) {
      // Detectar cambios de tiempo del sistema
      lastDecayTime = now;
      return false;
    }
    return true;
  };

  // Actualización optimizada de buffers
  const updateScoreBuffers = (indicator: IndicatorResult): void => {
    const weights = INDICATOR_WEIGHTS[indicator.name];
    if (!weights) return;

    // Usar operaciones vectoriales cuando sea posible
    Object.entries(weights).forEach(([emotion, weight]) => {
      const index = EMOTION_INDICES[emotion as EmotionType];
      const impact = weight * indicator.strength;
      
      // Actualizar score
      SCORE_BUFFER[index] = Math.max(0, 
        Math.min(MAX_SCORE, 
          SCORE_BUFFER[index] + impact
        )
      );

      // Actualizar confianza
      const confidenceCacheKey = `${indicator.name}:${emotion}:${indicator.strength}`;
      let confidence = confidenceCache.get(confidenceCacheKey);
      
      if (confidence === undefined) {
        confidence = calculateConfidence(emotion as EmotionType, [indicator.name]);
        confidenceCache.set(confidenceCacheKey, confidence);
      }

      CONFIDENCE_BUFFER[index] = Math.max(
        MIN_CONFIDENCE_THRESHOLD,
        (CONFIDENCE_BUFFER[index] * 0.8) + (confidence * 0.2)
      );
    });
  };

  // Sincronización de estado optimizada
  const syncStateFromBuffers = (): void => {
    Object.entries(EMOTION_INDICES).forEach(([emotion, index]) => {
      const emotionType = emotion as EmotionType;
      const score = SCORE_BUFFER[index];
      const confidence = CONFIDENCE_BUFFER[index];

      // Crear copia inmutable del estado
      Object.defineProperty(emotionScores, emotionType, {
        value: Object.freeze({
          score,
          confidence,
          triggers: [...emotionScores[emotionType].triggers].slice(-MAX_TRIGGERS_PER_EMOTION)
        }),
        writable: false,
        configurable: false
      });
    });
  };

  // Actualización de métricas
  const updateMetrics = (startTime: number): void => {
    const processingTime = performance.now() - startTime;
    metrics.processedEvents++;
    metrics.lastProcessingTime = processingTime;
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * 0.9) + (processingTime * 0.1);
    
    // Calcular tasa de eventos
    const now = Date.now();
    const timeWindow = now - lastProcessTime;
    if (timeWindow > 0) {
      metrics.eventRate = (processingCount * 1000) / timeWindow;
    }
    
    // Actualizar timestamps
    if (timeWindow > 1000) {
      lastProcessTime = now;
      processingCount = 0;
    }

    // Monitorear uso de memoria
    if (global.gc && now - (metrics.lastGC || 0) > 30000) {
      global.gc();
      metrics.lastGC = now;
    }
    
    metrics.peakMemoryUsage = Math.max(
      metrics.peakMemoryUsage,
      process.memoryUsage().heapUsed
    );
  };

  // Detectar la emoción dominante actual
  const detectEmotions = (): EmotionDetectionResult | null => {
    // Aplicar decaimiento antes de detectar
    applyScoreDecay();

    // Encontrar la emoción con mayor puntuación
    let dominantEmotion: EmotionType | null = null;
    let highestScore = 0;

    Object.keys(emotionScores).forEach((emotion) => {
      const emotionType = emotion as EmotionType;
      const score = emotionScores[emotionType].score;

      if (score > highestScore) {
        highestScore = score;
        dominantEmotion = emotionType;
      }
    });

    // Si no hay una emoción dominante o la puntuación es demasiado baja
    if (!dominantEmotion || highestScore <= 0) {
      return null;
    }

    // Crear y devolver el resultado de la detección
    return {
      emotion: dominantEmotion,
      score: highestScore,
      confidence: emotionScores[dominantEmotion as EmotionType].confidence,
      triggers: [...emotionScores[dominantEmotion as EmotionType].triggers],
      timestamp: new Date().toISOString()
    };
  };

  // Restablecer todas las puntuaciones a cero
  const reset = () => {
    Object.keys(emotionScores).forEach((emotion) => {
      const emotionType = emotion as EmotionType;
      emotionScores[emotionType] = { score: 0, triggers: [], confidence: 0 };
    });
    lastProcessTime = Date.now();
  };

  // Obtener las puntuaciones actuales de emoción
  const getScores = (): Record<EmotionType, EmotionScore> => {
    applyScoreDecay();
    return { ...emotionScores };
  };

  // Aplicar decaimiento a todas las puntuaciones en función del tiempo transcurrido
  const applyScoreDecay = () => {
    const now = Date.now();
    
    // Prevenir decaimientos muy frecuentes o con timestamps inválidos
    if (now < lastDecayTime || now - lastDecayTime < 100) {
      return;
    }

    const elapsedSeconds = Math.max(0, (now - lastDecayTime) / 1000);
    lastDecayTime = now;

    // No aplicar decaimiento para intervalos muy grandes (posible cambio de tiempo del sistema)
    if (elapsedSeconds > 60) {
      logger.warning("Large time gap detected, skipping decay", { elapsedSeconds });
      return;
    }

    // Aplicar decaimiento a cada emoción
    Object.keys(emotionScores).forEach((emotion) => {
      try {
        const emotionType = emotion as EmotionType;
        const score = emotionScores[emotionType].score;
        const decay = SCORE_DECAY_RATE * elapsedSeconds;

        // Reducir la puntuación por el decaimiento
        let newScore = Math.max(0, score - decay);

        // Si la puntuación decae a un valor muy bajo, eliminar también los triggers
        let triggers = [...emotionScores[emotionType].triggers];
        if (newScore < 10 && triggers.length > 0) {
          triggers = [];
        }

        // Actualizar confianza
        const confidence = calculateConfidence(emotionType, triggers);

        emotionScores[emotionType] = {
          score: newScore,
          triggers,
          confidence,
        };
      } catch (error) {
        logger.error("Error applying decay to emotion", { error, emotion });
      }
    });
  };

  // Calcular la confianza basada en la cantidad y diversidad de evidencia
  const calculateConfidence = (
    emotion: EmotionType,
    triggers: string[]
  ): number => {
    if (triggers.length === 0) return 0;

    // Calcular cuántos indicadores diferentes respaldan esta emoción
    const totalPossibleIndicators = Object.keys(INDICATOR_EMOTION_MAP).filter(
      (indicator) => INDICATOR_EMOTION_MAP[indicator].includes(emotion)
    ).length;

    // Calcular la proporción de indicadores presentes
    const uniqueTriggersCount = new Set(triggers).size;
    const coverage = Math.min(
      1,
      uniqueTriggersCount / Math.max(1, totalPossibleIndicators)
    );

    // Combinar con la fuerza de la puntuación para la confianza final
    const scoreStrength = emotionScores[emotion].score / MAX_SCORE;

    return 0.4 * coverage + 0.6 * scoreStrength;
  };

  return {
    processIndicator,
    getScores,
    detectEmotions,
    reset,
    getMetrics: () => ({ ...metrics })
  };
}
