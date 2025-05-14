import { Orwel } from '../types';

export const setupMemoryMonitoring = (orwel: Orwel): void => {
  // Only works in some browsers
  if (performance && (performance as any).memory) {
    const trackMemory = () => {
      const memory = (performance as any).memory;
      orwel.session({
        memory: {
          totalJSHeapSize: memory.totalJSHeapSize,
          usedJSHeapSize: memory.usedJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        }
      });
    };

    // Check every 60 seconds
    setInterval(trackMemory, 60000);
    trackMemory(); // Initial reading
  }
}; 