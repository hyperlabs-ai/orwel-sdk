import { GestureEvent } from "../types";

// Configuración global
export const GLOBAL_CONFIG = {
  MAX_EVENTS: 1000,           // Límite global de eventos en memoria
  CLEANUP_INTERVAL: 30000,    // Intervalo de limpieza (30 segundos)
  MAX_POOL_SIZE: 1000,       // Tamaño máximo del pool de objetos
  MAX_PROCESSING_TIME: 5000  // Tiempo máximo de procesamiento
};

// Sistema de pooling para objetos frecuentemente creados
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  
  constructor(factory: () => T) {
    this.factory = factory;
  }
  
  get(): T {
    return this.pool.pop() || this.factory();
  }
  
  release(obj: T): void {
    if (this.pool.length < GLOBAL_CONFIG.MAX_POOL_SIZE) {
      this.pool.push(obj);
    }
  }
  
  clear(): void {
    this.pool = [];
  }
}

// Gestor de concurrencia
export class ProcessingLock {
  private isProcessing: boolean = false;
  private lastProcessTime: number = Date.now();
  
  acquire(): boolean {
    if (this.isProcessing) {
      return false;
    }
    
    const now = Date.now();
    if (now - this.lastProcessTime < GLOBAL_CONFIG.MAX_PROCESSING_TIME) {
      this.isProcessing = true;
      return true;
    }
    
    // Force release if stuck
    this.release();
    this.isProcessing = true;
    return true;
  }
  
  release(): void {
    this.isProcessing = false;
    this.lastProcessTime = Date.now();
  }
}

// Funciones de limpieza y validación
export const cleanupEvents = <T extends { timestamp: number } & Record<string, any>>(
  events: T[],
  maxAge: number
): T[] => {
  const now = Date.now();
  return events
    .filter(e => now - e.timestamp < maxAge)
    .slice(-GLOBAL_CONFIG.MAX_EVENTS);
};

export const validateEvent = (event: GestureEvent): boolean => {
  try {
    if (!event || typeof event !== 'object') return false;
    if (!event.timestamp || typeof event.timestamp !== 'number') return false;
    if (!event.type || typeof event.type !== 'string') return false;
    if (!event.data || typeof event.data !== 'object') return false;
    
    // Validar rangos y valores específicos
    if (event.timestamp > Date.now() + 1000) return false; // No eventos futuros (con margen)
    if (event.timestamp < Date.now() - 24 * 60 * 60 * 1000) return false; // No eventos muy antiguos
    
    // Validar coordenadas si existen
    if ('x' in event.data && (typeof event.data.x !== 'number' || isNaN(event.data.x))) return false;
    if ('y' in event.data && (typeof event.data.y !== 'number' || isNaN(event.data.y))) return false;
    
    return true;
  } catch (error) {
    return false;
  }
};

// Utilidad para sanitizar elementos DOM
export const sanitizeElementData = (element: any): string => {
  try {
    if (!element) return 'unknown';
    
    // Si es string, sanitizar directamente
    if (typeof element === 'string') {
      return element.slice(0, 50).replace(/[^\w\s-]/g, '');
    }
    
    // Si es elemento DOM
    if (element instanceof Element) {
      const id = element.id || '';
      const classes = Array.from(element.classList).join(' ');
      const tag = element.tagName.toLowerCase();
      return (id || classes || tag).slice(0, 50).replace(/[^\w\s-]/g, '');
    }
    
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

// Utilidad para manejar procesamiento seguro
export const safeProcess = <T>(
  fn: () => T,
  lock: ProcessingLock,
  defaultValue: T
): T => {
  if (!lock.acquire()) return defaultValue;
  
  try {
    return fn();
  } catch (error) {
    return defaultValue;
  } finally {
    lock.release();
  }
}; 