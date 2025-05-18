export type EmotionType = 
  | 'frustration'
  | 'confusion'
  | 'engagement'
  | 'satisfaction'
  | 'urgency'
  | 'indecision';

export type IndicatorName = 
  | 'rage_click'
  | 'form_rage'
  | 'rapid_scrolling'
  | 'erratic_cursor'
  | 'hover_indecision'
  | 'navigation_loop'
  | 'focused_view'
  | 'field_hesitation';

export interface IndicatorResult {
  name: IndicatorName;
  isTriggered: boolean;
  strength: number; // 0 a 1, indica la fuerza de la señal
  details?: Record<string, any>; // Información adicional específica del indicador
}

export interface EmotionScore {
  score: number;      // Puntuación de la emoción (0-100)
  triggers: string[]; // Lista de disparadores que activaron esta emoción
  confidence: number; // Nivel de confianza en la detección (0-1)
}

export interface EmotionDetectionResult {
  emotion: EmotionType;
  score: number;
  confidence: number;
  triggers: string[];
  timestamp: string;
}

export interface EmotionState {
  scores: Record<EmotionType, EmotionScore>;
  recentIndicators: IndicatorResult[];
  lastDetection?: EmotionDetectionResult;
}

export interface EmotionOptions {
  enabled?: boolean;               // Habilitar/deshabilitar detección de emociones
  detectionThreshold?: number;     // Umbral para considerar una emoción detectada (0-100)
  confidenceThreshold?: number;    // Umbral de confianza mínima (0-1)
  detectionCooldown?: number;      // Tiempo en ms entre detecciones de la misma emoción
  samplingInterval?: number;       // Intervalo de muestreo en ms
  historyLimit?: number;           // Número máximo de indicadores en historial
}

export interface GestureEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface GestureCollector {
  init: () => void;
  destroy: () => void;
}

// Interfaces para los componentes del sistema
export interface EmotionDetector {
  processIndicator: (indicator: IndicatorResult) => void;
  getScores: () => Record<EmotionType, EmotionScore>;
  detectEmotions: () => EmotionDetectionResult | null;
  reset: () => void;
}

export interface IndicatorDetector {
  process: (events: GestureEvent[]) => IndicatorResult[];
}

export interface PatternDetector {
  detect: (indicators: IndicatorResult[]) => boolean;
  getDetails: () => Record<string, any>;
} 