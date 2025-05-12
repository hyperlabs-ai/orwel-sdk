// Create a server implementation (no-op)
export function createServerImplementation() {
    const noopId = () => ({ success: true, visitorId: '' });
    const noopTrack = () => ({ success: true, eventId: '' });
    const noopLog = () => ({ success: true, logId: '' });
    const noopAsync = () => Promise.resolve({ success: true, count: 0 });
    return {
        init: () => { },
        identify: noopId,
        track: noopTrack,
        log: noopLog,
        monitor: () => { },
        flush: noopAsync,
    };
}
