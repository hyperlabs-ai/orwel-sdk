import { createLogger } from "../../../utils";
import { GestureEvent, IndicatorResult } from "../types";

interface Visit {
  path: string;
  timestamp: number;
}

interface NavigationLoopState {
  recentVisits: Visit[];
  lastDetection: number;
}

/**
 * Detector de indicadores de "navigation loop" - bucles de navegación donde el usuario
 * visita repetidamente las mismas páginas, lo que puede indicar confusión o que está perdido.
 * Características:
 * - Visitas repetidas a las mismas páginas en secuencia
 * - Patrones circulares de navegación
 * - Navegación rápida entre las mismas páginas
 */
export function createNavLoopIndicator(logger: ReturnType<typeof createLogger>) {
  // Configuración
  const DETECTION_WINDOW = 120000;    // 2 minutos para analizar patrones de navegación
  const COOLDOWN_PERIOD = 60000;      // 1 minuto entre detecciones
  const MIN_VISITS = 4;               // Mínimo de visitas para analizar patrones
  const TRIGGER_THRESHOLD = 0.7;      // Umbral para activar el indicador
  const PATH_CLEAN_REGEX = /\?.+$|#.+$/; // Regex para limpiar parámetros de consulta y fragmentos
  
  // Estado del detector
  const state: NavigationLoopState = {
    recentVisits: [],
    lastDetection: 0
  };
  
  // Procesar eventos y detectar indicadores
  const process = (events: GestureEvent[]): IndicatorResult[] => {
    const now = Date.now();
    const results: IndicatorResult[] = [];
    
    // Filtrar solo eventos de navegación
    const navigationEvents = events.filter(event => 
      (event.type === 'navigation' || 
       event.type === 'page:view' || 
       event.type === 'route:change') && 
      event.data.path
    );
    
    if (navigationEvents.length === 0) return results;
    
    // Agregar visitas recientes
    navigationEvents.forEach(event => {
      // Normalizar la ruta eliminando parámetros de query y fragmentos
      const cleanPath = (event.data.path as string).replace(PATH_CLEAN_REGEX, '');
      
      state.recentVisits.push({
        path: cleanPath,
        timestamp: event.timestamp
      });
    });
    
    // Limpiar visitas antiguas
    state.recentVisits = state.recentVisits.filter(
      visit => now - visit.timestamp < DETECTION_WINDOW
    );
    
    // Si no hay suficientes visitas, no analizar
    if (state.recentVisits.length < MIN_VISITS) return results;
    
    // Verificar si ya se detectó recientemente
    if (now - state.lastDetection < COOLDOWN_PERIOD) return results;
    
    // Analizar patrones de bucles de navegación
    const loopData = detectNavigationLoops(state.recentVisits);
    const score = calculateLoopScore(loopData);
    
    // Si el score sobrepasa el umbral, detectar el indicador
    if (score > TRIGGER_THRESHOLD) {
      state.lastDetection = now;
      
      results.push({
        name: 'navigation_loop',
        isTriggered: true,
        strength: Math.min(1, score / 0.9), // Normalizar entre 0 y 1, limitado a 1
        details: {
          visitsCount: state.recentVisits.length,
          uniquePagesCount: loopData.uniquePaths.length,
          mostFrequentPage: loopData.mostFrequentPath,
          mostFrequentCount: loopData.highestFrequency,
          recentSequence: state.recentVisits.slice(-5).map(v => v.path),
          longestLoop: loopData.longestLoop,
          score
        }
      });
      
      logger.debug("Navigation loop detected", { 
        score, 
        uniquePages: loopData.uniquePaths.length,
        totalVisits: state.recentVisits.length,
        loop: loopData.longestLoop
      });
    }
    
    return results;
  };
  
  // Detectar bucles de navegación y analizar patrones
  const detectNavigationLoops = (visits: Visit[]): any => {
    // Conteo de frecuencia de cada ruta
    const pathCounts: Record<string, number> = {};
    let highestFrequency = 0;
    let mostFrequentPath = '';
    
    // Contar frecuencia de cada ruta
    visits.forEach(visit => {
      if (!pathCounts[visit.path]) {
        pathCounts[visit.path] = 0;
      }
      pathCounts[visit.path]++;
      
      // Actualizar ruta más frecuente
      if (pathCounts[visit.path] > highestFrequency) {
        highestFrequency = pathCounts[visit.path];
        mostFrequentPath = visit.path;
      }
    });
    
    // Obtener rutas únicas
    const uniquePaths = Object.keys(pathCounts);
    
    // Si hay pocas rutas únicas en comparación con el total de visitas, es un indicador de bucle
    const uniqueRatio = uniquePaths.length / visits.length;
    
    // Buscar secuencias repetidas (bucles)
    const loops = findRepeatedSequences(visits.map(v => v.path));
    const longestLoop = loops.reduce((longest, current) => 
      current.length > longest.length ? current : longest, [] as string[]);
    
    return {
      uniquePaths,
      uniqueRatio,
      pathCounts,
      mostFrequentPath,
      highestFrequency,
      loops,
      longestLoop
    };
  };
  
  // Encontrar secuencias de navegación repetidas (bucles)
  const findRepeatedSequences = (paths: string[]): string[][] => {
    const loops: string[][] = [];
    
    // Buscar secuencias de longitud 2 o más
    for (let seqLength = 2; seqLength <= Math.min(5, Math.floor(paths.length / 2)); seqLength++) {
      // Generar todas las subcadenas posibles de la longitud dada
      for (let i = 0; i <= paths.length - seqLength * 2; i++) {
        const sequence = paths.slice(i, i + seqLength);
        const sequenceStr = sequence.join('|');
        
        // Buscar la misma secuencia más adelante
        for (let j = i + seqLength; j <= paths.length - seqLength; j++) {
          const compareSeq = paths.slice(j, j + seqLength);
          const compareStr = compareSeq.join('|');
          
          // Si encontramos la misma secuencia y aún no está en nuestra lista de bucles
          if (sequenceStr === compareStr) {
            // Verificar si es un subconjunto de un bucle ya encontrado
            const isSubset = loops.some(loop => 
              loop.join('|').includes(sequenceStr)
            );
            
            if (!isSubset) {
              loops.push(sequence);
            }
            
            break; // Continuar con la siguiente secuencia
          }
        }
      }
    }
    
    return loops;
  };
  
  // Calcular puntuación de bucle de navegación
  const calculateLoopScore = (loopData: any): number => {
    if (loopData.uniquePaths.length === 0) return 0;
    
    // Factor de relación entre rutas únicas y total de visitas
    // Un valor bajo indica muchas visitas a las mismas páginas
    const uniqueRatioFactor = 1 - loopData.uniqueRatio;
    
    // Factor de frecuencia (visitas repetidas a la misma página)
    const frequencyFactor = Math.min(1, (loopData.highestFrequency - 1) / 4);
    
    // Factor de bucle (secuencias repetidas encontradas)
    const loopFactor = Math.min(1, loopData.longestLoop.length / 3);
    
    // Combinación ponderada de factores
    return (uniqueRatioFactor * 0.4) + 
           (frequencyFactor * 0.3) + 
           (loopFactor * 0.3);
  };
  
  return {
    process
  };
} 