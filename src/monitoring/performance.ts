import { serializePerformanceEntry } from '../utils';
import { Orwel } from '../types';

export const setupPerformanceMonitoring = (orwel: Orwel): void => {
  if (!window.performance || !window.performance.getEntriesByType) return;

  // Track page load time when it's complete
  if (document.readyState === 'complete') {
    trackPerformanceMetrics(orwel);
  } else {
    window.addEventListener('load', () => trackPerformanceMetrics(orwel));
  }

  // Set up observer for future navigation timing entries
  if (PerformanceObserver) {
    try {
      const perfObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'navigation') {
            orwel.session({
              navigation: serializePerformanceEntry(entry)
            });
          }
        }
      });
      perfObserver.observe({ entryTypes: ['navigation'] });
    } catch (e) {
      // Browser doesn't support this specific observation
    }
  }

  // Monitor resource timing
  if (PerformanceObserver) {
    try {
      // Store resources to batch them
      let resources: any[] = [];
      let resourceTimeout: any = null;
      
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        // Add resources to our collection, limiting the number
        for (const entry of entries) {
          if (entry.entryType === 'resource' && resources.length < 50) {
            resources.push(serializePerformanceEntry(entry));
          }
        }
        
        // Debounce sending resources - wait 1 second between batches
        if (resourceTimeout) {
          clearTimeout(resourceTimeout);
        }
        
        resourceTimeout = setTimeout(() => {
          if (resources.length > 0) {
            orwel.session({
              resources: resources
            });
            resources = []; // Clear after sending
          }
          resourceTimeout = null;
        }, 1000);
      });
      
      resourceObserver.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // Browser doesn't support this specific observation
    }
  }
};

const trackPerformanceMetrics = (orwel: Orwel): void => {
  // Collect all metrics to send in a single update
  const performanceData: Record<string, any> = {};
  
  // Get basic navigation timing
  const navEntry = 
    window.performance.getEntriesByType && 
    window.performance.getEntriesByType('navigation')[0];
  
  if (navEntry) {
    performanceData.pageLoad = serializePerformanceEntry(navEntry);
  } else {
    // Fallback for older browsers
    const timing = window.performance.timing;
    if (timing) {
      performanceData.pageLoad = {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        domReadyTime: timing.domComplete - timing.domLoading,
        ttfb: timing.responseStart - timing.requestStart,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        domInteractive: timing.domInteractive - timing.navigationStart
      };
    }
  }

  // Track paint timing metrics
  const paintMetrics = window.performance.getEntriesByType &&
                        window.performance.getEntriesByType('paint');
  if (paintMetrics && paintMetrics.length) {
    const paintData: Record<string, number> = {};
    for (const paint of paintMetrics) {
      if (paint.name === 'first-paint') {
        paintData.firstPaint = paint.startTime;
      } else if (paint.name === 'first-contentful-paint') {
        paintData.firstContentfulPaint = paint.startTime;
      }
    }

    performanceData.paintMetrics = paintData;
  }
  
  // Send all performance data in one go
  if (Object.keys(performanceData).length > 0) {
    orwel.session(performanceData);
  }
}; 