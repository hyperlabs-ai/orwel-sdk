export const setupMemoryMonitoring = (orwel) => {
    // Only works in some browsers
    if (performance && performance.memory) {
        const trackMemory = () => {
            const memory = performance.memory;
            orwel.log('memory_usage', {
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
