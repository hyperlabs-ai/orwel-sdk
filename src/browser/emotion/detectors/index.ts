import { createLogger } from "../../../utils";
import {
  EmotionType,
  EmotionScore,
  IndicatorResult,
  EmotionDetectionResult,
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

// Factor de decaimiento para puntuaciones de emoción (por segundo)
const SCORE_DECAY_RATE = 2;
// Límite máximo de puntuación para cada emoción
const MAX_SCORE = 100;

/**
 * Crea un detector de emociones que analiza indicadores y determina las emociones del usuario
 */
export function createEmotionDetector(logger: ReturnType<typeof createLogger>) {
  // Estado de las puntuaciones de emoción
  const emotionScores: Record<EmotionType, EmotionScore> = {
    frustration: { score: 0, triggers: [], confidence: 0 },
    confusion: { score: 0, triggers: [], confidence: 0 },
    engagement: { score: 0, triggers: [], confidence: 0 },
    satisfaction: { score: 0, triggers: [], confidence: 0 },
    urgency: { score: 0, triggers: [], confidence: 0 },
    indecision: { score: 0, triggers: [], confidence: 0 },
  };

  // Último tiempo de procesamiento para calcular decaimiento
  let lastProcessTime = Date.now();

  // Procesar un nuevo indicador
  const processIndicator = (indicator: IndicatorResult) => {
    // Aplicar decaimiento a todas las puntuaciones
    applyScoreDecay();

    // Solo procesar indicadores activados
    if (!indicator.isTriggered) return;

    // Verificar que el indicador está en nuestro mapeo
    if (!INDICATOR_EMOTION_MAP[indicator.name]) {
      logger.warning(`Indicator not recognized: ${indicator.name}`);
      return;
    }

    // Obtener los pesos para este indicador
    const weights = INDICATOR_WEIGHTS[indicator.name];
    if (!weights) {
      logger.warning(`No weights defined for indicator: ${indicator.name}`);
      return;
    }

    // Para cada emoción, aplicar el peso multiplicado por la fuerza del indicador
    Object.keys(weights).forEach((emotion) => {
      const emotionType = emotion as EmotionType;
      const weight = weights[emotionType];
      const impact = weight * indicator.strength;

      // Actualizar puntuación
      let newScore = emotionScores[emotionType].score + impact;
      newScore = Math.max(0, Math.min(MAX_SCORE, newScore)); // Limitar entre 0 y MAX_SCORE

      // Actualizar triggers si el impacto es positivo
      const triggers = [...emotionScores[emotionType].triggers];
      if (impact > 0 && !triggers.includes(indicator.name)) {
        triggers.push(indicator.name);
      }

      // Calcular confianza basada en la cantidad de evidencia
      const confidence = calculateConfidence(emotionType, triggers);

      emotionScores[emotionType] = {
        score: newScore,
        triggers,
        confidence,
      };
    });

    logger.debug("Updated emotion scores", {
      indicator: indicator.name,
      strength: indicator.strength,
    });
  };

  // Aplicar decaimiento a todas las puntuaciones en función del tiempo transcurrido
  const applyScoreDecay = () => {
    const now = Date.now();
    const elapsedSeconds = (now - lastProcessTime) / 1000;
    lastProcessTime = now;

    // No aplicar decaimiento para intervalos muy pequeños
    if (elapsedSeconds < 0.1) return;

    // Aplicar decaimiento a cada emoción
    Object.keys(emotionScores).forEach((emotion) => {
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

  return {
    processIndicator,
    getScores,
    detectEmotions,
    reset,
  };
}
