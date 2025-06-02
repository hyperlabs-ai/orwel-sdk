/**
 * Tests para el módulo de operaciones asíncronas
 */

import {
  processInChunks,
  withTimeout,
  executeWithTimeLimit,
  pollUntil
} from '../../src/utils/async-operations';

describe('Async Operations Module', () => {
  describe('processInChunks', () => {
    test('should process arrays in chunks', async () => {
      // Array de prueba
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      // Función de procesamiento que multiplica por 2
      const processFn = jest.fn().mockImplementation(async (item) => item * 2);
      
      // Callback para chunks completados
      const onChunkComplete = jest.fn();
      
      const results = await processInChunks(items, processFn, {
        chunkSize: 3,
        onChunkComplete
      });
      
      // Verificar resultados
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      
      // Verificar que la función de procesamiento se llamó para cada elemento
      expect(processFn).toHaveBeenCalledTimes(10);
      
      // Verificar que onChunkComplete se llamó para cada chunk
      expect(onChunkComplete).toHaveBeenCalledTimes(4); // 10 items / 3 = 4 chunks (3, 3, 3, 1)
    });

    test('should handle empty arrays', async () => {
      const processFn = jest.fn();
      const results = await processInChunks([], processFn);
      
      expect(results).toEqual([]);
      expect(processFn).not.toHaveBeenCalled();
    });

    test('should respect abort signal', async () => {
      const items = [1, 2, 3, 4, 5];
      
      // Crear un AbortController
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Función que se ejecuta lentamente
      const processFn = jest.fn().mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      });
      
      // Abortar después de un tiempo
      setTimeout(() => controller.abort(), 15);
      
      // Debería rechazar la promesa
      await expect(processInChunks(items, processFn, {
        chunkSize: 2,
        abortSignal: signal
      })).rejects.toThrow('Processing aborted');
    });
  });

  describe('withTimeout', () => {
    test('should resolve if function completes within timeout', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };
      
      const result = await withTimeout(fn, 100);
      expect(result).toBe('success');
    });

    test('should reject if function exceeds timeout', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };
      
      await expect(withTimeout(fn, 50)).rejects.toThrow('Operation timed out');
    });

    test('should propagate errors from the function', async () => {
      const fn = async () => {
        throw new Error('Function error');
      };
      
      await expect(withTimeout(fn, 100)).rejects.toThrow('Function error');
    });
  });

  describe('executeWithTimeLimit', () => {
    test('should return result if function completes within time limit', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };
      
      const result = await executeWithTimeLimit(fn, 100);
      expect(result).toBe('success');
    });

    test('should return null if function exceeds time limit', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };
      
      const result = await executeWithTimeLimit(fn, 50);
      expect(result).toBeNull();
    });

    test('should return null if function throws an error', async () => {
      const fn = async () => {
        throw new Error('Function error');
      };
      
      const result = await executeWithTimeLimit(fn, 100);
      expect(result).toBeNull();
    });
  });

  describe('pollUntil', () => {
    test('should poll until condition is met', async () => {
      let counter = 0;
      
      // Función que incrementa un contador
      const fn = jest.fn().mockImplementation(async () => {
        counter++;
        return { counter };
      });
      
      // Condición: contador >= 3
      const condition = (result) => result.counter >= 3;
      
      // Callback para cada intento
      const onAttempt = jest.fn();
      
      const result = await pollUntil(fn, {
        condition,
        interval: 10,
        maxAttempts: 5,
        onAttempt
      });
      
      expect(result).toEqual({ counter: 3 });
      expect(fn).toHaveBeenCalledTimes(3);
      expect(onAttempt).toHaveBeenCalledTimes(3);
    });

    test('should throw error if max attempts reached', async () => {
      // Función que siempre devuelve false
      const fn = jest.fn().mockImplementation(async () => ({ success: false }));
      
      // Condición nunca se cumple
      const condition = (result) => result.success === true;
      
      await expect(pollUntil(fn, {
        condition,
        interval: 10,
        maxAttempts: 3
      })).rejects.toThrow('Polling failed after 3 attempts');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should throw error if timeout reached', async () => {
      // Función lenta que siempre devuelve false
      const fn = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { success: false };
      });
      
      // Condición nunca se cumple
      const condition = (result) => result.success === true;
      
      await expect(pollUntil(fn, {
        condition,
        interval: 10,
        maxAttempts: 10,
        timeout: 50
      })).rejects.toThrow('Polling timed out');
      
      // Debería haber hecho menos de 10 intentos debido al timeout
      expect(fn.mock.calls.length).toBeLessThan(10);
    });
  });
});

