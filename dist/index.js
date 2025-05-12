// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';
// Create a browser implementation
function createBrowserImplementation() {
    const QUEUE_KEY = '__orwel_queue__';
    const LOG_KEY = '__orwel_log__';
    const VISITOR_KEY = '__orwel_visitor__';
    // Generate a UUID v4
    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    };
    let config = {};
    let visitor = {};
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
        },
        identify: (traits) => {
            // Generate UUID if visitor doesn't have an ID
            if (!visitor.id && !traits.id) {
                traits.id = generateUUID();
            }
            else if (visitor.id && !traits.id) {
                traits.id = visitor.id;
            }
            visitor = { ...visitor, ...traits };
            saveVisitor();
            queue.push({ type: 'identify', traits });
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
        flush: async () => {
            const queueLength = queue.length + logBuffer.length;
            await flush();
            return { success: true, count: queueLength };
        },
    };
}
// Create a server implementation (no-op)
function createServerImplementation() {
    const noopId = () => ({ success: true, visitorId: '' });
    const noopTrack = () => ({ success: true, eventId: '' });
    const noopLog = () => ({ success: true, logId: '' });
    const noopAsync = () => Promise.resolve({ success: true, count: 0 });
    return {
        init: () => { },
        identify: noopId,
        track: noopTrack,
        log: noopLog,
        flush: noopAsync,
    };
}
// Create and export the orwel instance based on environment
const orwel = isBrowser ? createBrowserImplementation() : createServerImplementation();
// Attach to window in browser environment
if (isBrowser) {
    window.orwel = orwel;
}
export { orwel };
