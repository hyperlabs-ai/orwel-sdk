import { Orwel, Config, Visitor, OrwelEvent } from './types';
import { generateUUID, collectBrowserInfo } from './utils';
import { startMonitoring } from './monitoring';

// Create a browser implementation
export function createBrowserImplementation(): Orwel {
  const QUEUE_KEY = '__orwel_queue__';
  const VISITOR_KEY = '__orwel_visitor__';
  const SESSION_KEY = '__orwel_session__';

  let config: Config = {} as Config;
  let visitor: Visitor = {};
  let isMonitoring = false;
  let session: Record<string, any> = {};

  const queue: OrwelEvent[] = [];

  const loadQueue = () => {
    try {
      const saved = localStorage.getItem(QUEUE_KEY);
      if (saved) queue.push(...JSON.parse(saved));
    } catch (_) {}
  };

  const saveQueue = () => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (_) {}
  };

  const loadVisitor = () => {
    try {
      const saved = localStorage.getItem(VISITOR_KEY);
      if (saved) visitor = JSON.parse(saved);

      if (!visitor.id) {
        visitor.id = generateUUID();
        saveVisitor();
      }
    } catch (_) {}
  };

  const saveVisitor = () => {
    try {
      localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor));
    } catch (_) {}
  };

  const flush = async () => {
    while (queue.length > 0) {
      const evt = queue.shift();
      if (evt) await send(evt);
    }
    saveQueue();
    return Promise.resolve();
  };

  const send = async (event: OrwelEvent) => {
    try {
      const payload = {
        ...event,
        visitor,
        timestamp: new Date().toISOString(),
      };

      await fetch('https://api.orwel.io/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orwel-Key': config.apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (err) {
      console.warn('[Orwel SDK] Failed to send event', err);
      queue.push(event);
      saveQueue();
    }
  };

  const loadSession = () => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) session = JSON.parse(saved);
    } catch (_) {}
  };

  return {
    init: (opts: Config) => {
      config = opts;
      loadQueue();
      loadVisitor();
      loadSession();
      window.addEventListener('beforeunload', flush);
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
      
      // Auto-monitor if enabled in config
      if (opts.autoMonitor) {
        orwel.monitor();
      }
    },
    identify: (traits: Record<string, any> = {}) => {
      // Collect browser info and merge with provided traits
      const browserInfo = collectBrowserInfo();
      // Only include browser info that isn't explicitly provided by the user
      const mergedTraits = { ...browserInfo, ...traits };
      
      // Generate UUID if visitor doesn't have an ID
      if (!visitor.id && !mergedTraits.id) {
        mergedTraits.id = generateUUID();
      } else if (visitor.id && !mergedTraits.id) {
        mergedTraits.id = visitor.id;
      }
      visitor = { ...visitor, ...mergedTraits };
      saveVisitor();
      queue.push({ type: 'identify', traits: mergedTraits });
      saveQueue();
      return { success: true, visitorId: mergedTraits.id || visitor.id || '' };
    },
    track: (code: string, properties: Record<string, any> = {}) => {
      const eventId = generateUUID();
      queue.push({ type: 'track', code, properties, eventId });
      saveQueue();
      return { success: true, eventId };
    },
    monitor: (options = {}) => {
      if (isMonitoring) return; // Prevent multiple initializations
      startMonitoring(orwel, options);
      isMonitoring = true;
    },
    flush: async () => {
      const queueLength = queue.length;
      await flush();
      return { success: true, count: queueLength };
    },
  };
}

// Create an instance for internal use
const orwel: Orwel = createBrowserImplementation(); 