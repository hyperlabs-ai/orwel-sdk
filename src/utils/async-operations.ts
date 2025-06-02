/**
 * Utilidades para operaciones asíncronas
 * Proporciona funciones para procesar arrays en chunks y otras operaciones asíncronas
 */

/**
 * Procesa un array en chunks para evitar bloquear el hilo principal
 * @param items Array de elementos a procesar
 * @param processFunction Función para procesar cada elemento
 * @param options Opciones de configuración
 * @returns Promesa con los resultados del procesamiento
 */
export const processInChunks = async <T, R>(
  items: T[],
  processFunction: (item: T, index: number) => Promise<R>,
  options: {
    chunkSize?: number;
    delayBetweenChunks?: number;
    onChunkComplete?: (results: R[], chunkIndex: number) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<R[]> => {
  const {
    chunkSize = 10,
    delayBetweenChunks = 0,
    onChunkComplete,
    abortSignal
  } = options;
  
  const results: R[] = [];
  
  // Procesar en chunks
  for (let i = 0; i < items.length; i += chunkSize) {
    // Verificar si se ha solicitado abortar
    if (abortSignal?.aborted) {
      throw new Error('Processing aborted');
    }
    
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((item, index) => processFunction(item, i + index))
    );
    
    // Añadir resultados
    results.push(...chunkResults);
    
    // Notificar progreso
    if (onChunkComplete) {
      onChunkComplete(chunkResults, Math.floor(i / chunkSize));
    }
    
    // Esperar entre chunks para no bloquear el hilo principal
    if (delayBetweenChunks > 0 && i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
    }
  }
  
  return results;
};

/**
 * Ejecuta una función con un timeout
 * @param fn Función a ejecutar
 * @param timeoutMs Timeout en milisegundos
 * @returns Promesa con el resultado o rechazo por timeout
 */
export const withTimeout = async <T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    fn()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

/**
 * Ejecuta una función con un límite de tiempo de ejecución
 * Útil para operaciones que deben completarse antes de que la página se descargue
 * @param fn Función a ejecutar
 * @param timeLimit Límite de tiempo en milisegundos
 * @returns Promesa que se resuelve con el resultado o null si se agota el tiempo
 */
export const executeWithTimeLimit = async <T>(
  fn: () => Promise<T>,
  timeLimit: number
): Promise<T | null> => {
  return new Promise<T | null>(resolve => {
    // Crear un flag para saber si la operación se completó
    let completed = false;
    
    // Establecer un timeout
    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(null);
      }
    }, timeLimit);
    
    // Ejecutar la función
    fn()
      .then(result => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch(() => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(null);
        }
      });
  });
};

/**
 * Ejecuta una función en un intervalo hasta que se cumpla una condición o se alcance un número máximo de intentos
 * @param fn Función a ejecutar
 * @param options Opciones de configuración
 * @returns Promesa con el resultado final
 */
export const pollUntil = async <T>(
  fn: () => Promise<T>,
  options: {
    condition: (result: T) => boolean;
    interval?: number;
    maxAttempts?: number;
    timeout?: number;
    onAttempt?: (result: T, attempt: number) => void;
  }
): Promise<T> => {
  const {
    condition,
    interval = 1000,
    maxAttempts = 10,
    timeout,
    onAttempt
  } = options;
  
  let attempts = 0;
  const startTime = Date.now();
  
  while (attempts < maxAttempts) {
    // Verificar timeout
    if (timeout && Date.now() - startTime > timeout) {
      throw new Error(`Polling timed out after ${timeout}ms`);
    }
    
    attempts++;
    const result = await fn();
    
    // Notificar intento
    if (onAttempt) {
      onAttempt(result, attempts);
    }
    
    // Verificar condición
    if (condition(result)) {
      return result;
    }
    
    // Esperar antes del próximo intento
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  throw new Error(`Polling failed after ${maxAttempts} attempts`);
};

/**
 * Ejecuta una función en un worker para evitar bloquear el hilo principal
 * @param fn Función a ejecutar (debe ser serializable)
 * @param args Argumentos para la función (deben ser serializables)
 * @returns Promesa con el resultado
 */
export const executeInWorker = <T>(
  fn: (...args: any[]) => T,
  ...args: any[]
): Promise<T> => {
  // Solo disponible en navegadores
  if (typeof window === 'undefined' || !window.Blob || !window.Worker) {
    return Promise.resolve(fn(...args));
  }
  
  return new Promise((resolve, reject) => {
    // Crear un worker inline
    const fnString = fn.toString();
    const workerCode = `
      self.onmessage = function(e) {
        try {
          const fn = ${fnString};
          const result = fn.apply(null, e.data);
          self.postMessage({ success: true, result });
        } catch (error) {
          self.postMessage({ 
            success: false, 
            error: { 
              message: error.message,
              stack: error.stack,
              name: error.name
            } 
          });
        }
      }
    `;
    
    // Crear el worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    
    // Configurar handlers
    worker.onmessage = (e) => {
      URL.revokeObjectURL(url);
      worker.terminate();
      
      if (e.data.success) {
        resolve(e.data.result);
      } else {
        const error = new Error(e.data.error.message);
        error.name = e.data.error.name;
        error.stack = e.data.error.stack;
        reject(error);
      }
    };
    
    worker.onerror = (e) => {
      URL.revokeObjectURL(url);
      worker.terminate();
      reject(new Error(`Worker error: ${e.message}`));
    };
    
    // Enviar los argumentos al worker
    worker.postMessage(args);
  });
};

