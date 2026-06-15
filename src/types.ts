/**
 * Main Orwel SDK interface providing event tracking, visitor identification, and analytics capabilities
 */
export interface Orwel {
  /**
   * Initialize the Orwel SDK with your API key and configuration
   * @param opts - Configuration options including API key and monitoring settings
   * @example
   * ```typescript
   * orwel.init({
   *   apiKey: 'orwel_your_api_key_here',
   *   autoMonitor: true,
   *   debug: true
   * });
   * ```
   */
  init: (opts: Config) => void;

  /**
   * Identify a visitor by associating traits with their unique visitor ID
   * @param traits - Optional object containing visitor attributes like email, name, plan, etc.
   * @returns Object with success status and visitor ID
   * @example
   * ```typescript
   * orwel.identify({
   *   email: 'user@example.com',
   *   name: 'John Doe',
   *   plan: 'premium'
   * });
   * ```
   */
  identify: (traits?: Record<string, any>) => { success: boolean; visitorId: string };

  /**
   * Track a conversion event such as signups, purchases, or form submissions.
   *
   * Returns a Promise that resolves with the *real* outcome: the SDK first waits
   * for the visitor id to be resolved (so the conversion can be attached to a
   * visitor), then sends and awaits the server acknowledgement. If the visitor
   * id never resolves, `success` is `false` with `reason: 'visitor_unresolved'`
   * — the conversion is NOT sent, avoiding an unattributable "lead with no
   * destinatario". Callers that ignore the return value keep working unchanged.
   * @param code - Event code identifying the type of conversion (e.g., 'newsletter_signup', 'purchase')
   * @param properties - Optional object containing conversion-specific data
   * @returns Promise resolving to an object with success status (and a reason when it failed)
   * @example
   * ```typescript
   * const { success } = await orwel.conversion('newsletter_signup', {
   *   email: 'user@example.com',
   *   source: 'homepage_banner',
   *   campaign: 'summer_sale'
   * });
   * ```
   */
  conversion: (code: string, properties?: Record<string, any>) => Promise<{ success: boolean; reason?: string }>;

  /**
   * Track a custom event with optional properties
   * @param code - Event code identifying the action (e.g., 'button_click', 'page_view')
   * @param properties - Optional object containing event-specific data
   * @returns Object with success status and unique event ID
   * @example
   * ```typescript
   * orwel.track('button_click', {
   *   buttonId: 'cta-header',
   *   page: '/pricing',
   *   campaign: 'feature_highlight'
   * });
   * ```
   */
  track: (code: string, properties?: Record<string, any>) => { success: boolean; eventId: string };

  /**
   * Update the current session with custom properties
   * @param properties - Optional object containing session data to store
   * @param isFinalUpdate - Whether this is the final update before session ends
   * @returns Object with success status and session ID
   * @example
   * ```typescript
   * orwel.session({
   *   currentPage: '/checkout',
   *   cartTotal: 99.99,
   *   experimentGroup: 'variant_b'
   * });
   * ```
   */
  session: (properties?: Record<string, any>, isFinalUpdate?: boolean) => { success: boolean; sessionId: string };

  /**
   * Enable monitoring of performance metrics, errors, and user interactions
   * @param options - Optional configuration for which monitoring features to enable
   * @returns Object with success status
   * @example
   * ```typescript
   * orwel.monitor({
   *   performance: true,
   *   errors: true,
   *   webVitals: true
   * });
   * ```
   */
  monitor: (options?: MonitorOptions) => { success: boolean };

  /**
   * Manually flush the event queue, sending all pending events to the server
   * @returns Promise resolving to object with success status and count of events sent
   * @example
   * ```typescript
   * const result = await orwel.flush();
   * console.log(`Sent ${result.count} events`);
   * ```
   */
  flush: () => Promise<{ success: boolean; count: number }>;

  /**
   * Track interactions with a specific form element
   * @param formElement - The HTML form element to track
   * @param options - Optional configuration for form tracking behavior
   * @returns Object with success status
   * @example
   * ```typescript
   * const form = document.getElementById('signup-form');
   * orwel.form(form, {
   *   trackSubmit: true,
   *   trackAbandon: true
   * });
   * ```
   */
  form: (formElement: HTMLFormElement, options?: FormOptions) => { success: boolean; error?: string };
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
  utm?: Record<string, string>;
  timezone?: string;
  customProperties?: Record<string, any>;
  sectionEngagements?: SectionEngagement[];
}

export interface SectionEngagement {
  sectionId: string;
  totalVisibilityMs: number;
  maxVisibilityPercentage: number;
  wordCount: number;
  interactions: {
    clicks: number;
    scrollsInside: number;
  };
  domSnapshot?: string; // Opcional para el futuro
}

/**
 * Configuration options for initializing the Orwel SDK
 */
export interface Config {
  /** Your Orwel API key (starts with 'orwel_') */
  apiKey: string;
  /** Automatically enable performance and error monitoring */
  autoMonitor?: boolean;
  /** Enable automatic event detection based on user interactions */
  autoEventDetection?: boolean;
  /** Configuration options for automatic event detection */
  eventDetectionOptions?: AutoEventDetectionOptions;
  /** Enable debug logging to console */
  debug?: boolean;
  /** Enable verbose debug logging with detailed information */
  verbose?: boolean;
  /** Additional configuration properties */
  [key: string]: any;
}

/**
 * Configuration options for monitoring features
 */
export interface MonitorOptions {
  /** Monitor page load times and navigation performance */
  performance?: boolean;
  /** Monitor JavaScript errors and unhandled exceptions */
  errors?: boolean;
  /** Monitor console errors and warnings */
  console?: boolean;
  /** Monitor network requests and responses */
  network?: boolean;
  /** Monitor memory usage and garbage collection */
  memory?: boolean;
  /** Monitor Core Web Vitals (LCP, FID, CLS, TTFB, FCP) */
  webVitals?: boolean;
}

/**
 * Configuration options for form tracking
 */
export interface FormOptions {
  /** Custom identifier for the form (auto-generated if not provided) */
  formId?: string;
  /** Track when form fields receive focus */
  trackFocus?: boolean;
  /** Track input events as user types */
  trackInput?: boolean;
  /** Track change events when field values change */
  trackChange?: boolean;
  /** Track form submission events */
  trackSubmit?: boolean;
  /** Track form abandonment when user leaves without submitting */
  trackAbandon?: boolean;
  /** Callback function called after form submission attempt */
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
  reset?(): void;
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