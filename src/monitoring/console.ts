import { Orwel } from '../types';

export const setupConsoleMonitoring = (orwel: Orwel): void => {
  const originalConsole = {
    error: console.error,
    warn: console.warn
  };

  console.error = function(...args) {
    orwel.session({
      consoleErrors: {
        message: args.map(arg => String(arg)).join(' '),
        timestamp: Date.now()
      }
    });
    originalConsole.error.apply(console, args);
  };

  console.warn = function(...args) {
    orwel.session({
      consoleWarns: {
        message: args.map(arg => String(arg)).join(' '),
        timestamp: Date.now()
      }
    });
    originalConsole.warn.apply(console, args);
  };
}; 