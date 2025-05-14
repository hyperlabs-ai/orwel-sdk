import { Orwel, Config, Visitor, OrwelEvent } from './types';
import { generateUUID, collectBrowserInfo, createLogger, throttle, debounce } from './utils';
import { startMonitoring } from './monitoring';

// Create a browser implementation
export function createBrowserImplementation(): Orwel {
  const QUEUE_KEY = '__orwel_queue__';
  const VISITOR_KEY = '__orwel_visitor__';
  const SESSION_KEY = '__orwel_session__';

  let config: Config = {} as Config;
  let visitor: Visitor = {};
  let isMonitoring = false;
  let session: { id: string; [key: string]: any } = { id: generateUUID() };
  let logger = createLogger({ debug: false, verbose: false });
  // Flag to track if we have a pending session event in the queue
  let pendingSessionUpdate = false;
  // Buffer to accumulate session data before sending
  let sessionBuffer: Record<string, any> = {};

  const queue: OrwelEvent[] = [];

  const loadQueue = () => {
    try {
      const saved = localStorage.getItem(QUEUE_KEY);
      if (saved) queue.push(...JSON.parse(saved));
      logger.debug('Queue loaded from storage', { count: queue.length });
    } catch (error) {
      logger.error('Failed to load queue from storage', error);
    }
  };

  const saveQueue = () => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      logger.debug('Queue saved to storage', { count: queue.length });
    } catch (error) {
      logger.error('Failed to save queue to storage', error);
    }
  };

  const loadVisitor = () => {
    try {
      const saved = localStorage.getItem(VISITOR_KEY);
      if (saved) visitor = JSON.parse(saved);

      if (!visitor.id) {
        visitor.id = generateUUID();
        saveVisitor();
        logger.debug('New visitor id created', { id: visitor.id });
      } else {
        logger.debug('Visitor loaded from storage', { id: visitor.id });
      }
    } catch (error) {
      logger.error('Failed to load visitor from storage', error);
    }
  };

  const saveVisitor = () => {
    try {
      localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor));
      logger.debug('Visitor saved to storage', { id: visitor.id });
    } catch (error) {
      logger.error('Failed to save visitor to storage', error);
    }
  };

  const loadSession = () => {
    let isNewSession = false;
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        session = JSON.parse(saved);
        logger.debug('Session loaded from storage', { id: session.id });
      } else {
        session = { 
          id: generateUUID(), 
          startedAt: Date.now() 
        };
        isNewSession = true;
        saveSession();
        logger.info('New session created', { id: session.id });
      }
    } catch (error) {
      session = { 
        id: generateUUID(), 
        startedAt: Date.now() 
      };
      isNewSession = true;
      saveSession();
      logger.warning('Failed to load session from storage, created new session', error);
    }
    
    // Send session event to the server
    queue.push({ 
      type: 'session', 
      isNewSession,
      sessionData: session
    });
    pendingSessionUpdate = true;
    saveQueue();
  };

  const saveSession = () => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      logger.debug('Session saved to storage', { id: session.id });
    } catch (error) {
      logger.error('Failed to save session to storage', error);
    }
  };

  // Function to send accumulated session data
  const flushSessionBuffer = debounce(() => {
    if (Object.keys(sessionBuffer).length > 0) {
      logger.debug('Flushing session buffer', { properties: Object.keys(sessionBuffer) });
      
      // Update session with accumulated data
      session = { ...session, ...sessionBuffer };
      saveSession();
      
      // CHANGE: Instead of adding a new event, find and update existing session event or add new one
      const existingSessionEventIndex = queue.findIndex(evt => evt.type === 'session');
      
      if (existingSessionEventIndex >= 0) {
        // Update existing session event instead of adding a new one
        queue[existingSessionEventIndex] = { 
          type: 'session', 
          isNewSession: false, 
          sessionData: { ...session }
        };
        logger.debug('Updated existing session event in queue');
      } else {
        // Only add if no session event exists
        queue.push({ 
          type: 'session', 
          isNewSession: false, 
          sessionData: { ...session }
        });
        logger.debug('Added new session event to queue');
      }
      
      pendingSessionUpdate = true;
      saveQueue();
      
      // Clear the buffer
      sessionBuffer = {};
    }
  }, 1000); // Debounce for 1 second to batch updates

  const flush = async () => {
    // Make sure any pending session updates are processed
    flushSessionBuffer.apply(null);
    
    logger.debug('Flushing event queue', { count: queue.length });
    let sentCount = 0;
    
    while (queue.length > 0) {
      const evt = queue.shift();
      if (evt) {
        const result = await send(evt);
        if (result) {
          sentCount++;
          if (evt.type === 'session') {
            pendingSessionUpdate = false;
          }
        }
      }
    }
    
    saveQueue();
    logger.success('Queue flushed successfully', { sent: sentCount });
    return Promise.resolve({ success: true, count: sentCount });
  };

  const send = async (event: OrwelEvent) => {
    try {
      const payload = {
        ...event,
        visitor,
        session,
        timestamp: new Date().toISOString(),
      };

      logger.debug('Sending event to server', { type: event.type });
      
      const response = await fetch('https://api.orwel.io/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orwel-Key': config.apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      
      if (!response.ok) {
        // Si es error 400, es un problema con el formato y no debemos reintentar
        if (response.status === 400) {
          logger.error('Bad request error (format issue) - not retrying', { 
            type: event.type, 
            status: response.status,
            statusText: response.statusText
          });
          return true; // Evita reinsertar en la cola
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      logger.success('Event sent successfully', { type: event.type });
      
      // Si era un evento de sesión, resetear el flag
      if (event.type === 'session') {
        pendingSessionUpdate = false;
      }
      
      return true;
    } catch (err) {
      logger.error('Failed to send event', { type: event.type, error: err });
      
      // Solo reinsertar si no hemos reintentado demasiadas veces
      if (!event.__retryCount) event.__retryCount = 0;
      
      if (event.__retryCount < 3) {
        event.__retryCount++;
        queue.push(event);
        saveQueue();
        logger.debug('Requeuing event for retry', { type: event.type, retry: event.__retryCount });
      } else {
        logger.warning('Dropping event after max retries', { type: event.type });
      }
      
      return false;
    }
  };

  const orwel: Orwel = {
    init: (opts: Config) => {
      config = opts;
      
      // Initialize logger with debug configuration
      logger = createLogger({ 
        debug: opts.debug || false, 
        verbose: opts.verbose || false 
      });
      
      logger.info('Initializing Orwel SDK', {
        debug: opts.debug,
        verbose: opts.verbose
      });
      
      loadQueue();
      loadVisitor();
      loadSession();
      
      window.addEventListener('beforeunload', flush);
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          logger.debug('Page visibility changed to hidden, flushing queue');
          flush();
        }
      });
      
      // Auto-monitor if enabled in config
      if (opts.autoMonitor) {
        logger.info('Auto monitoring enabled, starting monitors');
        orwel.monitor();
      }
      
      logger.success('Orwel SDK initialized successfully');
    },
    identify: (traits: Record<string, any> = {}) => {
      logger.info('Identifying visitor', traits);
      
      // Collect browser info and merge with provided traits
      const browserInfo = collectBrowserInfo();
      // Only include browser info that isn't explicitly provided by the user
      const mergedTraits = { ...browserInfo, ...traits };
      
      // Generate UUID if visitor doesn't have an ID
      if (!visitor.id && !mergedTraits.id) {
        mergedTraits.id = generateUUID();
        logger.debug('Generated new visitor ID', { id: mergedTraits.id });
      } else if (visitor.id && !mergedTraits.id) {
        mergedTraits.id = visitor.id;
      }
      
      visitor = { ...visitor, ...mergedTraits };
      saveVisitor();
      queue.push({ type: 'identify', traits: mergedTraits });
      saveQueue();
      
      logger.success('Visitor identified', { id: mergedTraits.id || visitor.id });
      return { success: true, visitorId: mergedTraits.id || visitor.id || '' };
    },
    track: (code: string, properties: Record<string, any> = {}) => {
      const eventId = generateUUID();
      logger.info('Tracking event', { code, eventId });
      
      //! PAYLOAD
      queue.push({ type: 'track', code, properties, event: { id: eventId, code } });
      saveQueue();
      
      logger.success('Event tracked', { code, eventId });
      return { success: true, eventId };
    },
    session: (properties: Record<string, any> = {}) => {
      logger.info('Updating session data', { properties: Object.keys(properties) });
      
      // Add properties to buffer instead of directly to session
      sessionBuffer = { ...sessionBuffer, ...properties };
      
      // Schedule buffer flush
      flushSessionBuffer();
      
      logger.success('Session data queued for update', { id: session.id });
      return { success: true, sessionId: session.id };
    },
    monitor: (options = {}) => {
      if (!isMonitoring) {
        startMonitoring(orwel, options);
        isMonitoring = true;
        logger.success('Monitoring started', options);
      } else {
        logger.warning('Monitoring already active, ignoring duplicate call');
      }
      return { success: true };
    },
    flush
  };

  return orwel;
}

// Create an instance for internal use
export const orwel: Orwel = createBrowserImplementation();