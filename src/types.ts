// Main SDK interfaces
export interface Orwel {
  init: (opts: Config) => void;
  identify: (traits?: Record<string, any>) => { success: boolean; visitorId: string };
  track: (code: string, properties?: Record<string, any>) => { success: boolean; eventId: string };
  session: (properties?: Record<string, any>, isFinalUpdate?: boolean) => { success: boolean; sessionId: string };
  monitor: (options?: MonitorOptions) => { success: boolean };
  flush: () => Promise<{ success: boolean; count: number }>;
  form: (formElement: HTMLFormElement, options?: FormOptions) => { success: boolean };
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
  autoEventDetection?: boolean;
  eventDetectionOptions?: AutoEventDetectionOptions;
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

export interface FormOptions {
  formId?: string;
  trackFocus?: boolean;
  trackInput?: boolean;
  trackChange?: boolean;
  trackSubmit?: boolean;
  trackAbandon?: boolean;
  submitCallback?: (result: { success: boolean; error?: Error }) => void;
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

// Auto Event Detection Types
export interface AutoEventDetectionOptions {
  enabledCategories?: EventCategory[];
  confidenceThreshold?: number;
}

export interface OrwelEventDefinition {
  id: string;
  code: string;
  category: EventCategory;
  description: string;
  needs?: string;
  severity: number;
}

export type EventCategory = 
  | 'auth' 
  | 'ecommerce' 
  | 'navigation' 
  | 'form' 
  | 'media' 
  | 'conversion' 
  | 'communication' 
  | 'technical' 
  | 'notification' 
  | 'feedback' 
  | 'gamification';

export interface DetectionResult {
  eventCode: string;
  confidence: number;
  data: Record<string, any>;
  trigger: DetectionTrigger;
  timestamp: number;
}

export type DetectionTrigger = 
  | 'dom_event' 
  | 'url_change' 
  | 'dom_mutation' 
  | 'api_response' 
  | 'behavioral_pattern'
  | 'visual_pattern';

export interface DetectionStrategy {
  readonly category: EventCategory;
  readonly eventCode: string;
  detect(context: DetectionContext): DetectionResult | null;
  cleanup?(): void;
}

export interface DetectionContext {
  element?: Element;
  event?: Event;
  url?: string;
  mutationRecord?: MutationRecord;
  pageContext?: PageContext;
}

export interface PageContext {
  url: string;
  pathname: string;
  title: string;
  referrer: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
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