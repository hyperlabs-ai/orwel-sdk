import { Orwel } from '../types';

export const setupMemoryMonitoring = (orwel: Orwel): void => {
  // Only works in some browsers
  if (performance && (performance as any).memory) {
    const trackMemory = () => {
      const memory = (performance as any).memory;
      orwel.track('memory_usage', {
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      });
    };

    // Check every 30 seconds
    setInterval(trackMemory, 30000);
    trackMemory(); // Initial reading
  }
}; 