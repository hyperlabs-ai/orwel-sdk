import { Orwel, Config, Visitor, OrwelEvent } from './types';
import { generateUUID, collectBrowserInfo, createLogger } from './utils';
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

  const flush = async () => {
    logger.debug('Flushing event queue', { count: queue.length });
    let sentCount = 0;
    
    while (queue.length > 0) {
      const evt = queue.shift();
      if (evt) {
        const result = await send(evt);
        if (result) sentCount++;
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
      
      await fetch('https://api.orwel.io/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orwel-Key': config.apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      
      logger.success('Event sent successfully', { type: event.type });
      return true;
    } catch (err) {
      logger.error('Failed to send event', { type: event.type, error: err });
      queue.push(event);
      saveQueue();
      return false;
    }
  };

  return {
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
      
      queue.push({ type: 'track', code, properties, eventId });
      saveQueue();
      
      logger.success('Event tracked', { code, eventId });
      return { success: true, eventId };
    },
    session: (properties: Record<string, any> = {}) => {
      logger.info('Updating session', properties);
      
      // Merge properties with current session
      session = { ...session, ...properties };
      saveSession();
      
      // Send session update event
      queue.push({ 
        type: 'session', 
        isNewSession: false, 
        sessionData: session
      });
      saveQueue();
      
      logger.success('Session updated', { id: session.id });
      return { success: true, sessionId: session.id };
    },
    monitor: (options = {}) => {
      if (isMonitoring) {
        logger.info('Monitoring already active, skipping initialization');
        return;
      }
      
      logger.info('Starting monitoring', options);
      startMonitoring(orwel, options);
      isMonitoring = true;
      logger.success('Monitoring started successfully');
    },
    flush: async () => {
      logger.info('Manual flush requested');
      const queueLength = queue.length;
      await flush();
      return { success: true, count: queueLength };
    },
  };
}

// Create an instance for internal use
const orwel: Orwel = createBrowserImplementation();