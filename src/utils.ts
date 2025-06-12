import { v4 as uuidv4 } from 'uuid';

// Generate a UUID v4
export const generateUUID = (): string => {
  return uuidv4();
};

// Check if we're in a browser environment
export const isBrowser = typeof window !== 'undefined';

// Throttle utility - limits function calls to once per specified interval
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => ReturnType<T> | undefined) => {
  let inThrottle: boolean = false;
  let lastResult: ReturnType<T> | undefined;
  
  return function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
    if (!inThrottle) {
      lastResult = func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    return lastResult;
  };
};

// Debounce utility - delays function execution until after wait milliseconds have elapsed
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    
    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func.apply(this, args);
  };
};

// Logger utility with emoji support
export const createLogger = (config: { debug?: boolean; verbose?: boolean }) => {
  const isDebug = config.debug === true;
  const isVerbose = config.verbose === true;
  
  const logLevels = {
    success: {
      emoji: '🟢',
      method: 'log',
    },
    info: {
      emoji: '🔵',
      method: 'info',
    },
    warning: {
      emoji: '🟠',
      method: 'warn',
    },
    error: {
      emoji: '🔴',
      method: 'error',
    },
    debug: {
      emoji: '🟣',
      method: 'debug',
    },
  };

  const prefix = '[Orwel SDK]';
  
  const logger = {
    success: (message: string, data?: any) => {
      if (isDebug) {
        if (data !== undefined) {
          console.log(`${prefix} ${logLevels.success.emoji} ${message}`, data);
        } else {
          console.log(`${prefix} ${logLevels.success.emoji} ${message}`);
        }
      }
    },
    info: (message: string, data?: any) => {
      if (isDebug) {
        if (data !== undefined) {
          console.info(`${prefix} ${logLevels.info.emoji} ${message}`, data);
        } else {
          console.info(`${prefix} ${logLevels.info.emoji} ${message}`);
        }
      }
    },
    warning: (message: string, data?: any) => {
      if (isDebug) {
        if (data !== undefined) {
          console.warn(`${prefix} ${logLevels.warning.emoji} ${message}`, data);
        } else {
          console.warn(`${prefix} ${logLevels.warning.emoji} ${message}`);
        }
      }
    },
    error: (message: string, data?: any) => {
      if (isDebug) {
        if (data !== undefined) {
          console.error(`${prefix} ${logLevels.error.emoji} ${message}`, data);
        } else {
          console.error(`${prefix} ${logLevels.error.emoji} ${message}`);
        }
      }
    },
    debug: (message: string, data?: any) => {
      if (isDebug && isVerbose) {
        if (data !== undefined) {
          console.debug(`${prefix} ${logLevels.debug.emoji} ${message}`, data);
        } else {
          console.debug(`${prefix} ${logLevels.debug.emoji} ${message}`);
        }
      }
    },
  };
  
  return logger;
};

// Collect browser information automatically
export const collectBrowserInfo = (): Record<string, any> => {
  if (!isBrowser) return {};
  
  const info: Record<string, any> = {};
  
  // Basic browser information
  if (navigator) {
    info.userAgent = navigator.userAgent;
    info.language = navigator.language;
    info.platform = navigator.platform;
    info.doNotTrack = navigator.doNotTrack;
    
    // Browser and OS detection
    const uaData = (navigator as any).userAgentData;
    if (uaData) {
      info.browser = uaData.brands.map((b: any) => `${b.brand} ${b.version}`).join(', ');
      info.mobile = uaData.mobile;
    }
  }
  
  // Screen and window dimensions
  if (window && window.screen) {
    info.screenWidth = window.screen.width;
    info.screenHeight = window.screen.height;
    info.screenColorDepth = window.screen.colorDepth;
    info.viewportWidth = window.innerWidth;
    info.viewportHeight = window.innerHeight;
    info.devicePixelRatio = window.devicePixelRatio;
  }
  
  // Navigation and URL information
  if (window && window.location) {
    info.url = window.location.href;
    info.path = window.location.pathname;
    info.hostname = window.location.hostname;
    info.protocol = window.location.protocol;
    info.referrer = document.referrer;
    info.pageTitle = document.title;
  }
  
  // Device capabilities
  info.touchscreen = 'ontouchstart' in window;
  try {
    info.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (_) {}
  
  // Connectivity information
  info.online = navigator.onLine;
  if (navigator && 'connection' in navigator) {
    const connection = (navigator as any).connection;
    if (connection) {
      info.connectionType = connection.effectiveType;
      info.downlink = connection.downlink;
      info.rtt = connection.rtt;
      info.saveData = connection.saveData;
    }
  }
  
  // Timezone
  try {
    info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (_) {}
  
  // Session information
  info.sessionStart = Date.now();
  
  return info;
};

// Sanitize user input data to prevent circular references, excessive nesting, and handle non-serializable types
export const sanitizeData = <T extends Record<string, any>>(
  data: T,
  options: {
    maxDepth?: number,
    maxKeys?: number,
    maxStringLength?: number
  } = {}
): Record<string, any> => {
  const {
    maxDepth = 10,         // Maximum nesting depth
    maxKeys = 100,         // Maximum keys in the entire object
    maxStringLength = 1000 // Maximum string length
  } = options;
  
  // Track total keys processed
  let totalKeys = 0;
  // Track visited references to avoid circular references
  const visited = new WeakMap();
  
  function sanitize(value: any, currentDepth: number): any {
    // Check depth limit
    if (currentDepth > maxDepth) {
      return '[Max Depth Exceeded]';
    }
    
    // Check total keys limit
    if (totalKeys > maxKeys) {
      return '[Max Keys Exceeded]';
    }
    
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle primitives
    const type = typeof value;
    
    if (type === 'string') {
      // Truncate long strings
      return value.length > maxStringLength 
        ? value.substring(0, maxStringLength) + '...[truncated]'
        : value;
    }
    
    if (type === 'number' || type === 'boolean') {
      return value;
    }
    
    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // Handle functions
    if (type === 'function') {
      return '[Function]';
    }
    
    // Handle non-plain objects
    if (value instanceof Error) {
      return `[Error: ${value.message}]`;
    }
    
    if (value instanceof RegExp) {
      return value.toString();
    }
    
    // Check for DOM nodes
    if (isBrowser && value instanceof Node) {
      return '[DOM Node]';
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      // Check for circular references
      if (visited.has(value)) {
        return '[Circular Reference]';
      }
      
      visited.set(value, true);
      
      // Sanitize each item in the array
      const result = [];
      for (let i = 0; i < value.length; i++) {
        if (totalKeys < maxKeys) {
          totalKeys++;
          result.push(sanitize(value[i], currentDepth + 1));
        } else {
          result.push('[Max Keys Exceeded]');
          break;
        }
      }
      
      return result;
    }
    
    // Handle objects
    if (type === 'object') {
      // Check for circular references
      if (visited.has(value)) {
        return '[Circular Reference]';
      }
      
      visited.set(value, true);
      
      // Sanitize each property of the object
      const result: Record<string, any> = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          if (totalKeys < maxKeys) {
            totalKeys++;
            result[key] = sanitize(value[key], currentDepth + 1);
          } else {
            break;
          }
        }
      }
      
      return result;
    }
    
    // For any other types, convert to string
    return `[${type}]`;
  }
  
  // Start sanitization from depth 1
  return sanitize(data, 1);
};

// Helper to serialize performance entries
export const serializePerformanceEntry = (entry: PerformanceEntry): any => {
  const result: Record<string, any> = {};
  
  // Copy only serializable properties
  for (const prop in entry) {
    if (Object.prototype.hasOwnProperty.call(entry, prop)) {
      const value = (entry as any)[prop];
      if (typeof value !== 'function' && typeof value !== 'object') {
        result[prop] = value;
      }
    }
  }
  
  return result;
};

// Create browser fingerprint for cross-domain visitor resolution
export const createBrowserFingerprint = (): Record<string, any> => {
  if (!isBrowser) return {};
  
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    screenColorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    devicePixelRatio: window.devicePixelRatio
  };
}; 