// Main SDK interfaces
export interface Orwel {
  init: (opts: Config) => void;
  identify: (traits?: Record<string, any>) => { success: boolean; visitorId: string };
  track: (code: string, properties?: Record<string, any>) => { success: boolean; eventId: string };
  session: (properties: Record<string, any>) => { success: boolean; sessionId: string };
  monitor: (options?: MonitorOptions) => void;
  flush: () => Promise<{ success: boolean; count: number }>;
}

export interface Session {
  id: string;
  status: 'active' | 'closed';
  startedAt: string;
  updatedAt?: string;
  finishedAt?: string;
  location?: {
    path: string;
    url: string;
    hash: string;
    search: string;
    hostname: string;
  };
  webVitals?: Record<string, any>;
  performance?: Record<string, any>;
  jsErrors?: Array<Record<string, any>>;
  memory?: Record<string, any>;
  networkRequests?: Array<Record<string, any>>;
  customProperties?: Record<string, any>;
}

export interface Config {
  apiKey: string;
  autoMonitor?: boolean;
  debug?: boolean;
  verbose?: boolean;
  [key: string]: any;
}

export interface MonitorOptions {
  performance?: boolean;
  errors?: boolean;
  console?: boolean;
  network?: boolean;
  memory?: boolean;
  webVitals?: boolean;
}

// Internal interfaces
export interface Visitor {
  id?: string;
  [key: string]: any;
}

export interface OrwelEvent {
  type: string;
  __retryCount?: number;
  [key: string]: any;
}

// Extend global interfaces
declare global {
  interface Window {
    orwel: Orwel;
  }
  
  interface XMLHttpRequest {
    _orwelMethod?: string;
    _orwelUrl?: string | URL;
    _orwelStartTime?: number;
  }
} 