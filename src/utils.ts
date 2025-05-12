// Generate a UUID v4
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Check if we're in a browser environment
export const isBrowser = typeof window !== 'undefined';

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

// Helper to serialize performance entries
export const serializePerformanceEntry = (entry: PerformanceEntry): any => {
  const result: Record<string, any> = {};
  
  // Copy only serializable properties
  for (const prop in entry) {
    const value = (entry as any)[prop];
    if (typeof value !== 'function' && typeof value !== 'object') {
      result[prop] = value;
    }
  }
  
  return result;
}; 