// Main SDK interfaces
export interface Orwel {
  init: (opts: Config) => void;
  identify: (traits?: Record<string, any>) => { success: boolean; visitorId: string };
  track: (code: string, properties?: Record<string, any>) => { success: boolean; eventId: string };
  log: (type: string, data?: Record<string, any>) => { success: boolean; logId: string };
  monitor: (options?: MonitorOptions) => void;
  flush: () => Promise<{ success: boolean; count: number }>;
}

export interface Config {
  apiKey: string;
  workspace?: string;
  autoMonitor?: boolean;
  [key: string]: any;
}

export interface MonitorOptions {
  performance?: boolean;
  errors?: boolean;
  console?: boolean;
  network?: boolean;
  memory?: boolean;
}

// Internal interfaces
export interface Visitor {
  id?: string;
  [key: string]: any;
}

export interface OrwelEvent {
  type: string;
  [key: string]: any;
}

export interface LogEntry {
  type: string;
  data: any;
  timestamp: number;
  logId?: string;
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