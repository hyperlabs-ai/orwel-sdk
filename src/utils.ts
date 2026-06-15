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

  // Bot / automation flag — tracked, not blocked; the server decides to filter.
  const bot = getBotSignals();
  info.isBot = bot.isBot;
  if (bot.isBot) info.botReasons = bot.reasons;

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
// Validation utilities
export const validateRequired = (value: any, name: string): void => {
  if (value === undefined || value === null) {
    throw new Error(`${name} is required`);
  }
};

export const validateString = (value: any, name: string): void => {
  validateRequired(value, name);
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${name} cannot be empty`);
  }
};

export const validateObject = (value: any, name: string): void => {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`${name} must be an object`);
  }
};

export const validateApiKey = (apiKey: any): void => {
  validateString(apiKey, 'apiKey');
  if (!apiKey.startsWith('orwel_')) {
    throw new Error('apiKey must start with "orwel_"');
  }
  if (apiKey.length < 20) {
    throw new Error('apiKey appears to be invalid (too short)');
  }
};

export const validateEventCode = (code: any): void => {
  validateString(code, 'code');
  if (!/^[a-z0-9_]+$/.test(code)) {
    throw new Error('Event code must contain only lowercase letters, numbers, and underscores');
  }
  if (code.length > 50) {
    throw new Error('Event code must be 50 characters or less');
  }
};

export const validateEmailIfPresent = (properties: Record<string, any>): void => {
  if (properties.email && typeof properties.email === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(properties.email)) {
      throw new Error('Invalid email format in properties');
    }
  }
};

const UTM_STORAGE_KEY = '__orwel_utm';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/**
 * Extract UTM parameters from the current URL.
 * Checks window.location.search, hash-based query strings, and document.referrer.
 * Persists UTMs in sessionStorage so they survive SPA navigations, redirects,
 * and frameworks that strip query params before SDK init.
 * Returns null if no UTMs are found anywhere.
 */
export const extractUTMs = (): Record<string, string> | null => {
  if (!isBrowser) return null;

  try {
    // 1. Try current URL search params
    let utms = parseUTMsFromSearch(window.location.search);

    // 2. Try hash-based routing (e.g., /#/page?utm_source=...)
    if (!utms && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      if (hashQuery) utms = parseUTMsFromSearch('?' + hashQuery);
    }

    // 3. Try referrer (covers redirects that stripped params)
    if (!utms && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        utms = parseUTMsFromSearch(refUrl.search);
      } catch (_) {}
    }

    // 4. If found now, persist to sessionStorage
    if (utms) {
      try { sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utms)); } catch (_) {}
      return utms;
    }

    // 5. Fall back to previously persisted UTMs (SPA navigation lost them)
    try {
      const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (_) {}

    return null;
  } catch (_) {
    return null;
  }
};

const ATTRIBUTION_STORAGE_KEY = '__orwel_attribution';

export interface Attribution {
  first_touch?: Record<string, string>;
  last_touch?: Record<string, string>;
}

/**
 * First/last-touch UTM attribution, persisted in localStorage so it survives
 * across sessions (sessionStorage UTMs clear between sessions).
 *
 * - `first_touch` is written once (the campaign that first acquired the visitor).
 * - `last_touch` is overwritten every time new UTMs are seen.
 *
 * Calling this also records the current UTMs (from `extractUTMs()`), so invoking
 * it at session start keeps `first_touch` even if the visitor converts later in a
 * UTM-less session. Returns null when no attribution is known.
 */
export const getAttribution = (): Attribution | null => {
  if (!isBrowser) return null;

  try {
    let stored: Attribution = {};
    try {
      const raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') stored = parsed;
      }
    } catch (_) {}

    const utms = extractUTMs();
    if (utms) {
      if (!stored.first_touch) stored.first_touch = utms; // write-once
      stored.last_touch = utms; // overwrite on every new touch
      try {
        localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
      } catch (_) {}
    }

    if (!stored.first_touch && !stored.last_touch) return null;
    return stored;
  } catch (_) {
    return null;
  }
};

function parseUTMsFromSearch(search: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(search);
    const utms: Record<string, string> = {};
    UTM_KEYS.forEach(key => {
      const val = params.get(key);
      if (val) utms[key] = val;
    });
    return Object.keys(utms).length > 0 ? utms : null;
  } catch (_) {
    return null;
  }
}

// Conservative bot/automation signatures. Kept tight to avoid false positives —
// we only FLAG (is_bot) and let the server decide; we never block tracking.
const BOT_UA_RE =
  /bot\b|crawl|spider|slurp|mediapartners|headless|puppeteer|playwright|lighthouse|phantomjs|selenium|googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|ia_archiver|chrome-lighthouse|gtmetrix|pingdom|uptimerobot/i;

/**
 * Best-effort client-side bot detection. Returns whether the current client
 * looks automated and the signals that triggered it. Client-side detection is
 * easily spoofed, so this is a hint for the server (which should also filter by
 * UA/IP), not a hard gate.
 */
export const getBotSignals = (): { isBot: boolean; reasons: string[] } => {
  if (!isBrowser) return { isBot: false, reasons: [] };

  const reasons: string[] = [];
  try {
    if ((navigator as any).webdriver === true) reasons.push('webdriver');

    const ua = navigator.userAgent || '';
    if (!ua) reasons.push('empty_ua');
    else if (BOT_UA_RE.test(ua)) reasons.push('ua');

    // Headless Chrome historically exposes no plugins and no languages.
    if (Array.isArray(navigator.languages) && navigator.languages.length === 0) {
      reasons.push('no_languages');
    }
  } catch (_) {}

  return { isBot: reasons.length > 0, reasons };
};

export const isLikelyBot = (): boolean => getBotSignals().isBot;

export const createBrowserFingerprint = (): Record<string, any> => {
  if (!isBrowser) return {};

  // Only stable fields — screenWidth/Height/devicePixelRatio change with zoom/resize
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenColorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}; 