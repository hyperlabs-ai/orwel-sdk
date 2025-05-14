import { Orwel } from './types';

// Create a server implementation (no-op)
export function createServerImplementation(): Orwel {
  const noopId = () => ({ success: true, visitorId: '' });
  const noopTrack = () => ({ success: true, eventId: '' });
  const noopSession = () => ({ success: true, sessionId: '' });
  const noopAsync = () => Promise.resolve({ success: true, count: 0 });
  
  return {
    init: () => {},
    identify: noopId,
    track: noopTrack,
    session: noopSession,
    monitor: () => {},
    flush: noopAsync,
  };
} 