/**
 * Tests para el módulo de reintentos
 */

import {
  isRetryableError,
  calculateBackoff,
  withRetry,
  createRetryableFunction
} from '../../src/utils/retry';

describe('Retry Module', () => {
  describe('isRetryableError', () => {
    test('should identify network and timeout errors as retryable', () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      
      const timeoutError = new Error('Request timed out');
      
      const config = { retryableStatusCodes: [500, 503] };
      
      expect(isRetryableError(networkError, config)).toBe(true);
      expect(isRetryableError(timeoutError, config)).toBe(true);
    });

    test('should identify retryable HTTP status codes', () => {
      const error503 = { status: 503, message: 'Service Unavailable' };
      const error400 = { status: 400, message: 'Bad Request' };
      
      const config = { retryableStatusCodes: [500, 503] };
      
      expect(isRetryableError(error503, config)).toBe(true);
      expect(isRetryableError(error400, config)).toBe(false);
    });

    test('should identify errors matching patterns', () => {
      const connectionError = new Error('Connection reset');
      const validationError = new Error('Validation failed');
      
      const config = { 
        retryableErrors: ['Connection', /reset/],
        retryableStatusCodes: [] 
      };
      
      expect(isRetryableError(connectionError, config)).toBe(true);
      expect(isRetryableError(validationError, config)).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    test('should increase delay exponentially with each attempt', () => {
      const config = {
        initialDelay: 100,
        maxDelay: 10000,
        backoffFactor: 2,
        jitterFactor: 0
      };
      
      const delay1 = calculateBackoff(1, config);
      const delay2 = calculateBackoff(2, config);
      const delay3 = calculateBackoff(3, config);
      
      expect(delay1).toBe(100);
      expect(delay2).toBe(200);
      expect(delay3).toBe(400);
    });

    test('should respect maximum delay', () => {
      const config = {
        initialDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 3,
        jitterFactor: 0
      };
      
      const delay1 = calculateBackoff(1, config);
      const delay2 = calculateBackoff(2, config);
      const delay3 = calculateBackoff(3, config);
      
      expect(delay1).toBe(1000);
      expect(delay2).toBe(3000);
      expect(delay3).toBe(5000); // Capped at maxDelay
    });

    test('should add jitter to delay', () => {
      const config = {
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        jitterFactor: 0.5 // 50% jitter
      };
      
      // Con jitter, el resultado no será exactamente 1000
      const delay = calculateBackoff(1, config);
      
      // Debería estar en el rango [750, 1250] (±250)
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });
  });

  describe('withRetry', () => {
    test('should retry failed operations', async () => {
      // Función que falla las primeras 2 veces y luego tiene éxito
      let attempts = 0;
      const testFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });
      
      const config = {
        maxRetries: 3,
        initialDelay: 10, // Delay pequeño para tests
        backoffFactor: 1
      };
      
      const result = await withRetry(testFn, config);
      
      expect(result).toBe('success');
      expect(testFn).toHaveBeenCalledTimes(3);
    });

    test('should stop retrying after max attempts', async () => {
      // Función que siempre falla
      const testFn = jest.fn().mockImplementation(() => {
        throw new Error('Persistent failure');
      });
      
      const config = {
        maxRetries: 3,
        initialDelay: 10
      };
      
      await expect(withRetry(testFn, config)).rejects.toThrow('Persistent failure');
      expect(testFn).toHaveBeenCalledTimes(3); // Intento inicial + 2 reintentos
    });

    test('should not retry non-retryable errors', async () => {
      // Error no reintentable
      const testFn = jest.fn().mockImplementation(() => {
        const error = new Error('Validation error');
        error.status = 400; // Bad Request
        throw error;
      });
      
      const config = {
        maxRetries: 3,
        initialDelay: 10,
        retryableStatusCodes: [500, 503]
      };
      
      await expect(withRetry(testFn, config)).rejects.toThrow('Validation error');
      expect(testFn).toHaveBeenCalledTimes(1); // Solo el intento inicial
    });

    test('should call onRetry callback for each retry', async () => {
      // Función que falla las primeras 2 veces
      let attempts = 0;
      const testFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });
      
      const onRetry = jest.fn();
      
      const config = {
        maxRetries: 3,
        initialDelay: 10,
        onRetry
      };
      
      await withRetry(testFn, config);
      
      expect(onRetry).toHaveBeenCalledTimes(2); // Llamado en cada reintento
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error));
    });
  });

  describe('createRetryableFunction', () => {
    test('should create a function with retry capabilities', async () => {
      // Función que falla las primeras 2 veces
      let attempts = 0;
      const originalFn = jest.fn().mockImplementation(async (arg) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return `success: ${arg}`;
      });
      
      const config = {
        maxRetries: 3,
        initialDelay: 10
      };
      
      const retryableFn = createRetryableFunction(originalFn, config);
      
      const result = await retryableFn('test');
      
      expect(result).toBe('success: test');
      expect(originalFn).toHaveBeenCalledTimes(3);
      expect(originalFn).toHaveBeenCalledWith('test');
    });
  });
});

