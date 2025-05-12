export const setupConsoleMonitoring = (orwel) => {
    const originalConsole = {
        error: console.error,
        warn: console.warn
    };
    console.error = function (...args) {
        orwel.log('console_error', {
            message: args.map(arg => String(arg)).join(' '),
            timestamp: Date.now()
        });
        originalConsole.error.apply(console, args);
    };
    console.warn = function (...args) {
        orwel.log('console_warn', {
            message: args.map(arg => String(arg)).join(' '),
            timestamp: Date.now()
        });
        originalConsole.warn.apply(console, args);
    };
};
