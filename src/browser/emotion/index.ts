import { createLogger } from "../../utils";
import { OrwelEvent } from "../../types";
import { 
  EmotionType, 
  EmotionOptions, 
  IndicatorResult, 
  EmotionState,
  GestureEvent,
  EmotionDetectionResult,
  PerformanceMetrics,
  IndicatorName
} from "./types";
import { initGestureCollectors } from "./gestures";
import { createIndicatorDetectors } from "./indicators";
import { createEmotionDetector } from "./detectors";

// Lista de indicadores válidos
const VALID_INDICATORS: IndicatorName[] = [
  'rage_click',
  'form_rage',
  'rapid_scrolling',
  'erratic_cursor',
  'hover_indecision',
  'navigation_loop',
  'focused_view',
  'field_hesitation'
];

// Implementación de buffer circular de alto rendimiento
class CircularEventBuffer {
  private buffer: GestureEvent[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;
  private readonly lock: Int32Array;

  constructor(capacity: number) {
    this.buffer = new Array(capacity);
    this.capacity = capacity;
    // Usar SharedArrayBuffer para sincronización entre workers si es necesario
    this.lock = new Int32Array(new SharedArrayBuffer(4));
  }

  push(event: GestureEvent): boolean {
    // Implementar spinlock para thread safety
    while (Atomics.compareExchange(this.lock, 0, 0, 1) !== 0) {
      Atomics.wait(this.lock, 0, 1, 100); // Esperar con timeout
    }

    try {
      if (this.size === this.capacity) {
        // Buffer lleno, sobrescribir el evento más antiguo
        this.head = (this.head + 1) % this.capacity;
        this.size--;
      }

      this.buffer[this.tail] = event;
      this.tail = (this.tail + 1) % this.capacity;
      this.size++;

      return true;
    } finally {
      Atomics.store(this.lock, 0, 0); // Liberar el lock
    }
  }

  drain(): GestureEvent[] {
    while (Atomics.compareExchange(this.lock, 0, 0, 1) !== 0) {
      Atomics.wait(this.lock, 0, 1, 100);
    }

    try {
      if (this.size === 0) return [];

      const events: GestureEvent[] = [];
      while (this.size > 0) {
        events.push(this.buffer[this.head]);
        this.head = (this.head + 1) % this.capacity;
        this.size--;
      }

      return events;
    } finally {
      Atomics.store(this.lock, 0, 0);
    }
  }

  get length(): number {
    return this.size;
  }
}

const DEFAULT_OPTIONS: EmotionOptions = {
  enabled: true,
  detectionThreshold: 65,     // Puntuación mínima para considerar una emoción detectada
  confidenceThreshold: 0.6,   // Confianza mínima requerida
  detectionCooldown: 5000,    // 5 segundos entre detecciones de la misma emoción
  samplingInterval: 1000,     // Procesar indicadores cada 1 segundo
  historyLimit: 50,           // Mantener los últimos 50 indicadores
  maxGestureEvents: 1000,     // Máximo número de eventos de gestos en memoria
  performanceMode: 'high'    // nuevo modo de rendimiento
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
  // Combinar opciones con valores por defecto
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  // Usar buffer circular de alto rendimiento
  const gestureBuffer = new CircularEventBuffer(config.maxGestureEvents || 1000);
  
  // Cache de resultados para optimizar procesamiento
  const resultCache = new Map<string, {
    result: EmotionDetectionResult;
    timestamp: number;
  }>();

  // Mecanismo de rate limiting para protección contra DoS
  const rateLimiter = {
    lastReset: Date.now(),
    eventCount: 0,
    maxEventsPerSecond: 1000,
    reset() {
      const now = Date.now();
      if (now - this.lastReset >= 1000) {
        this.eventCount = 0;
        this.lastReset = now;
      }
    },
    canProcess(): boolean {
      this.reset();
      return this.eventCount < this.maxEventsPerSecond;
    },
    increment() {
      this.eventCount++;
    }
  };

  // Estado del sistema con protección de memoria
  const state: EmotionState = {
    scores: {
      'frustration': { score: 0, triggers: [], confidence: 0 },
      'confusion': { score: 0, triggers: [], confidence: 0 },
      'engagement': { score: 0, triggers: [], confidence: 0 },
      'satisfaction': { score: 0, triggers: [], confidence: 0 },
      'urgency': { score: 0, triggers: [], confidence: 0 },
      'indecision': { score: 0, triggers: [], confidence: 0 }
    },
    recentIndicators: [],
    metrics: {
      processedEvents: 0,
      lastProcessingTime: 0,
      averageProcessingTime: 0,
      peakMemoryUsage: 0,
      eventRate: 0,
      dropRate: 0,
      lastGC: undefined
    }
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
  
  // Procesar los indicadores con optimizaciones de rendimiento
  const processIndicators = () => {
    if (!config.enabled || !indicatorDetectors) return;
    
    const startTime = performance.now();
    
    try {
      // Obtener eventos acumulados
      const events = gestureBuffer.drain();
      if (events.length === 0) return;

      // Procesar en batches para mejor rendimiento
      const batchSize = 100;
      const batches = Math.ceil(events.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const batchEvents = events.slice(i * batchSize, (i + 1) * batchSize);
        
        // Verificar cache antes de procesar
        const cacheKey = generateCacheKey(batchEvents);
        const cached = resultCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 1000) {
          continue; // Usar resultado cacheado si es reciente
        }

        // Procesar batch de eventos
        const newIndicators = indicatorDetectors.processEvents(batchEvents);
        
        if (newIndicators.length > 0) {
          processNewIndicators(newIndicators);
        }
      }

      // Limpiar cache antigua
      cleanupCache();
      
      // Actualizar métricas de rendimiento
      updatePerformanceMetrics(startTime);
      
    } catch (error) {
      logger.error("Error processing indicators", { error });
    }
  };

  // Funciones auxiliares optimizadas
  const generateCacheKey = (events: GestureEvent[]): string => {
    return events.map(e => `${e.type}:${e.timestamp}`).join('|');
  };

  const processNewIndicators = (indicators: IndicatorResult[]) => {
    indicators.forEach(indicator => {
      if (!rateLimiter.canProcess()) {
        logger.warning("Rate limit exceeded, skipping indicator");
        return;
      }
      
      rateLimiter.increment();
      
      // Validar y sanitizar indicador
      const sanitizedIndicator = sanitizeIndicator(indicator);
      if (!sanitizedIndicator) return;

      // Añadir a la lista reciente con límite de memoria
      state.recentIndicators.push(sanitizedIndicator);
      if (state.recentIndicators.length > (config.historyLimit || 50)) {
        state.recentIndicators.shift();
      }

      // Procesar con el detector de emociones
      emotionDetector.processIndicator(sanitizedIndicator);
    });
  };

  const sanitizeIndicator = (indicator: IndicatorResult): IndicatorResult | null => {
    try {
      // Validación profunda y sanitización
      if (!indicator || typeof indicator !== 'object') return null;
      
      // Validar que el nombre del indicador sea uno de los permitidos
      const name = String(indicator.name);
      if (!VALID_INDICATORS.includes(name as IndicatorName)) {
        logger.warning(`Invalid indicator name: ${name}`);
        return null;
      }
      
      return {
        name: name as IndicatorName,
        isTriggered: Boolean(indicator.isTriggered),
        strength: Math.max(0, Math.min(1, Number(indicator.strength))),
        details: indicator.details ? 
          JSON.parse(JSON.stringify(indicator.details)) : undefined
      };
    } catch (error) {
      logger.error("Error sanitizing indicator", { error });
      return null;
    }
  };

  const cleanupCache = () => {
    const now = Date.now();
    for (const [key, value] of resultCache.entries()) {
      if (now - value.timestamp > 5000) { // 5 segundos de TTL
        resultCache.delete(key);
      }
    }
  };

  const updatePerformanceMetrics = (startTime: number) => {
    const processingTime = performance.now() - startTime;
    state.metrics.processedEvents += gestureBuffer.length;
    state.metrics.lastProcessingTime = processingTime;
    state.metrics.averageProcessingTime = 
      (state.metrics.averageProcessingTime * 0.9) + (processingTime * 0.1);
    state.metrics.peakMemoryUsage = 
      Math.max(state.metrics.peakMemoryUsage, process.memoryUsage().heapUsed);
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
      (event) => gestureBuffer.push(event),
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
  
  // Modificar addGestureEvent para usar el nuevo buffer
  const addGestureEvent = (event: GestureEvent) => {
    if (!config.enabled) return;
    
    try {
      // Validar y sanitizar evento
      const sanitizedEvent = sanitizeEvent(event);
      if (!sanitizedEvent) return;

      // Añadir al buffer circular
      gestureBuffer.push(sanitizedEvent);
    } catch (error) {
      logger.error("Error adding gesture event", { error });
    }
  };

  const sanitizeEvent = (event: any): GestureEvent | null => {
    try {
      if (!event || typeof event !== 'object') return null;

      // Validación profunda del evento
      return {
        type: String(event.type).slice(0, 50),
        timestamp: Number(event.timestamp) || Date.now(),
        data: event.data ? JSON.parse(JSON.stringify(event.data)) : {}
      };
    } catch (error) {
      logger.error("Error sanitizing event", { error });
      return null;
    }
  };

  return {
    init,
    destroy,
    addGestureEvent,
    getState: () => ({
      ...state,
      scores: emotionDetector.getScores(),
      recentIndicators: [...state.recentIndicators],
      lastDetection: state.lastDetection
    })
  };
} 