import { generateUUID, collectBrowserInfo } from './utils';
import { startMonitoring } from './monitoring';
// Create a browser implementation
export function createBrowserImplementation() {
    const QUEUE_KEY = '__orwel_queue__';
    const LOG_KEY = '__orwel_log__';
    const VISITOR_KEY = '__orwel_visitor__';
    let config = {};
    let visitor = {};
    let isMonitoring = false;
    const queue = [];
    const logBuffer = [];
    const loadQueue = () => {
        try {
            const saved = localStorage.getItem(QUEUE_KEY);
            if (saved)
                queue.push(...JSON.parse(saved));
        }
        catch (_) { }
    };
    const saveQueue = () => {
        try {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        }
        catch (_) { }
    };
    const loadVisitor = () => {
        try {
            const saved = localStorage.getItem(VISITOR_KEY);
            if (saved)
                visitor = JSON.parse(saved);
            if (!visitor.id) {
                visitor.id = generateUUID();
                saveVisitor();
            }
        }
        catch (_) { }
    };
    const saveVisitor = () => {
        try {
            localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor));
        }
        catch (_) { }
    };
    const loadLog = () => {
        try {
            const saved = localStorage.getItem(LOG_KEY);
            if (saved)
                logBuffer.push(...JSON.parse(saved));
        }
        catch (_) { }
    };
    const saveLog = () => {
        try {
            localStorage.setItem(LOG_KEY, JSON.stringify(logBuffer));
        }
        catch (_) { }
    };
    const flush = async () => {
        while (queue.length > 0) {
            const evt = queue.shift();
            if (evt)
                await send(evt);
        }
        saveQueue();
        await flushLogs();
        return Promise.resolve();
    };
    const send = async (event) => {
        try {
            const payload = {
                ...event,
                workspace: config.workspace || '',
                visitor,
                timestamp: Date.now(),
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
        }
        catch (err) {
            queue.push(event);
            saveQueue();
        }
    };
    const flushLogs = async () => {
        if (logBuffer.length === 0)
            return;
        const logBatch = {
            type: 'log_batch',
            logs: [...logBuffer],
        };
        try {
            const payload = {
                ...logBatch,
                workspace: config.workspace || '',
                visitor,
                timestamp: Date.now(),
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
            logBuffer.length = 0;
            saveLog();
        }
        catch (err) {
            console.warn('[Orwel SDK] Failed to flush logs');
        }
    };
    return {
        init: (opts) => {
            config = opts;
            loadQueue();
            loadLog();
            loadVisitor();
            window.addEventListener('beforeunload', flush);
            window.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden')
                    flush();
            });
            // Auto-monitor if enabled in config
            if (opts.autoMonitor) {
                orwel.monitor();
            }
        },
        identify: (traits = {}) => {
            // Collect browser info and merge with provided traits
            const browserInfo = collectBrowserInfo();
            // Only include browser info that isn't explicitly provided by the user
            const mergedTraits = { ...browserInfo, ...traits };
            // Generate UUID if visitor doesn't have an ID
            if (!visitor.id && !mergedTraits.id) {
                mergedTraits.id = generateUUID();
            }
            else if (visitor.id && !mergedTraits.id) {
                mergedTraits.id = visitor.id;
            }
            visitor = { ...visitor, ...mergedTraits };
            saveVisitor();
            queue.push({ type: 'identify', traits: mergedTraits });
            saveQueue();
            return { success: true, visitorId: visitor.id || '' };
        },
        track: (code, properties = {}) => {
            const eventId = generateUUID();
            queue.push({ type: 'track', code, properties, eventId });
            saveQueue();
            return { success: true, eventId };
        },
        log: (type, data = {}) => {
            const logId = generateUUID();
            logBuffer.push({
                type,
                data,
                timestamp: Date.now(),
                logId
            });
            saveLog();
            return { success: true, logId };
        },
        monitor: (options = {}) => {
            if (isMonitoring)
                return; // Prevent multiple initializations
            startMonitoring(orwel, options);
            isMonitoring = true;
        },
        flush: async () => {
            const queueLength = queue.length + logBuffer.length;
            await flush();
            return { success: true, count: queueLength };
        },
    };
}
// Create an instance for internal use
const orwel = createBrowserImplementation();
