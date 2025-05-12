import { serializePerformanceEntry } from '../utils';
export const setupPerformanceMonitoring = (orwel) => {
    if (!window.performance || !window.performance.getEntriesByType)
        return;
    // Track page load time when it's complete
    if (document.readyState === 'complete') {
        trackPerformanceMetrics(orwel);
    }
    else {
        window.addEventListener('load', () => trackPerformanceMetrics(orwel));
    }
    // Set up observer for future navigation timing entries
    if (PerformanceObserver) {
        try {
            const perfObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                for (const entry of entries) {
                    if (entry.entryType === 'navigation') {
                        orwel.track('page_performance', {
                            type: 'navigation',
                            data: serializePerformanceEntry(entry)
                        });
                    }
                }
            });
            perfObserver.observe({ entryTypes: ['navigation'] });
        }
        catch (e) {
            // Browser doesn't support this specific observation
        }
    }
    // Monitor resource timing
    if (PerformanceObserver) {
        try {
            const resourceObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const resources = [];
                for (const entry of entries) {
                    if (entry.entryType === 'resource' && resources.length < 10) {
                        resources.push(serializePerformanceEntry(entry));
                    }
                }
                if (resources.length > 0) {
                    orwel.track('resource_performance', {
                        type: 'resources',
                        count: resources.length,
                        data: resources
                    });
                }
            });
            resourceObserver.observe({ entryTypes: ['resource'] });
        }
        catch (e) {
            // Browser doesn't support this specific observation
        }
    }
};
const trackPerformanceMetrics = (orwel) => {
    // Get basic navigation timing
    const navEntry = window.performance.getEntriesByType &&
        window.performance.getEntriesByType('navigation')[0];
    if (navEntry) {
        orwel.track('page_performance', {
            type: 'page_load',
            data: serializePerformanceEntry(navEntry)
        });
    }
    else {
        // Fallback for older browsers
        const timing = window.performance.timing;
        if (timing) {
            const pageLoadData = {
                loadTime: timing.loadEventEnd - timing.navigationStart,
                domReadyTime: timing.domComplete - timing.domLoading,
                ttfb: timing.responseStart - timing.requestStart,
                domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                domInteractive: timing.domInteractive - timing.navigationStart
            };
            orwel.track('page_performance', {
                type: 'page_load',
                data: pageLoadData
            });
        }
    }
    // Track paint timing metrics
    const paintMetrics = window.performance.getEntriesByType &&
        window.performance.getEntriesByType('paint');
    if (paintMetrics && paintMetrics.length) {
        const paintData = {};
        for (const paint of paintMetrics) {
            if (paint.name === 'first-paint') {
                paintData.firstPaint = paint.startTime;
            }
            else if (paint.name === 'first-contentful-paint') {
                paintData.firstContentfulPaint = paint.startTime;
            }
        }
        orwel.track('paint_performance', {
            type: 'paint_metrics',
            data: paintData
        });
    }
};
