/**
 * Módulo de reintentos con backoff exponencial y jitter
 * Proporciona funciones para reintentar operaciones fallidas con una estrategia de backoff
 */

import { createLogger } from '../utils';

// Configuración por defecto para reintentos
export interface RetryConfig {
  maxRetries: number;        // Número máximo de reintentos
  initialDelay: number;      // Retraso inicial en ms
  maxDelay: number;          // Retraso máximo en ms
  backoffFactor: number;     // Factor de multiplicación para el backoff exponencial
  jitterFactor: number;      // Factor de aleatoriedad (0-1) para añadir jitter
  retryableErrors?: Array<string | RegExp>; // Errores específicos que se pueden reintentar
  retryableStatusCodes?: number[]; // Códigos de estado HTTP que se pueden reintentar
  onRetry?: (attempt: number, delay: number, error: Error) => void; // Callback en cada reintento
}

// Configuración por defecto
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 300,
  maxDelay: 10000,
  backoffFactor: 2,
  jitterFactor: 0.2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

/**
 * Determina si un error es reintentable según la configuración
 * @param error Error a evaluar
 * @param config Configuración de reintentos
 * @returns true si el error es reintentable
 */
export const isRetryableError = (error: any, config: RetryConfig): boolean => {
  // Si es un error de red o timeout, siempre reintentar
  if (
    error.name === 'NetworkError' || 
    error.name === 'TimeoutError' || 
    error.message.includes('timeout') || 
    error.message.includes('network')
  ) {
    return true;
  }
  
  // Comprobar códigos de estado HTTP
  if (error.status && config.retryableStatusCodes?.includes(error.status)) {
    return true;
  }
  
  // Comprobar errores específicos
  if (config.retryableErrors && config.retryableErrors.length > 0) {
    const errorMessage = error.message || '';
    return config.retryableErrors.some(pattern => {
      if (typeof pattern === 'string') {
        return errorMessage.includes(pattern);
      }
      return pattern.test(errorMessage);
    });
  }
  
  return false;
};

/**
 * Calcula el retraso para el próximo reintento usando backoff exponencial con jitter
 * @param attempt Número de intento actual (comenzando desde 1)
 * @param config Configuración de reintentos
 * @returns Tiempo de espera en ms
 */
export const calculateBackoff = (attempt: number, config: RetryConfig): number => {
  // Calcular el retraso base usando backoff exponencial
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffFactor, attempt - 1);
  
  // Aplicar límite máximo
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  // Aplicar jitter para evitar sincronización de reintentos
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = Math.random() * jitterRange - (jitterRange / 2);
  
  return Math.max(0, Math.floor(cappedDelay + jitter));
};

/**
 * Ejecuta una función con reintentos automáticos
 * @param fn Función a ejecutar que devuelve una promesa
 * @param config Configuración de reintentos
 * @param logger Logger opcional para registrar los reintentos
 * @returns Promesa con el resultado de la función
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: ReturnType<typeof createLogger>
): Promise<T> => {
  // Combinar configuración por defecto con la proporcionada
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let attempt = 1;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      // Comprobar si hemos alcanzado el número máximo de reintentos
      if (attempt >= retryConfig.maxRetries || !isRetryableError(error, retryConfig)) {
        throw error;
      }
      
      // Calcular el tiempo de espera para el próximo reintento
      const delay = calculateBackoff(attempt, retryConfig);
      
      // Registrar el reintento
      if (logger) {
        logger.warning(`Retry attempt ${attempt}/${retryConfig.maxRetries} after ${delay}ms`, {
          error: error.message,
          attempt,
          delay
        });
      }
      
      // Ejecutar callback de reintento si existe
      if (retryConfig.onRetry) {
        retryConfig.onRetry(attempt, delay, error);
      }
      
      // Esperar antes del próximo reintento
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Incrementar el contador de intentos
      attempt++;
    }
  }
};

/**
 * Crea un wrapper de función que aplica reintentos automáticos
 * @param fn Función a envolver
 * @param config Configuración de reintentos
 * @param logger Logger opcional para registrar los reintentos
 * @returns Función envuelta con reintentos
 */
export const createRetryableFunction = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {},
  logger?: ReturnType<typeof createLogger>
): T => {
  return ((...args: Parameters<T>): ReturnType<T> => {
    return withRetry(() => fn(...args), config, logger) as ReturnType<T>;
  }) as T;
};

