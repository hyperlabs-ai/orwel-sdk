import { Orwel } from '../types';

export const setupConsoleMonitoring = (orwel: Orwel): void => {
  const originalConsole = {
    error: console.error,
    warn: console.warn
  };

  // Store console events to batch them
  let consoleErrors: any[] = [];
  let consoleWarns: any[] = [];
  let consoleTimeout: any = null;
  
  // Function to flush the batched console events
  const flushConsoleEvents = () => {
    const hasErrors = consoleErrors.length > 0;
    const hasWarns = consoleWarns.length > 0;
    
    if (hasErrors || hasWarns) {
      const sessionData: Record<string, any> = {};
      
      if (hasErrors) {
        sessionData.consoleErrors = consoleErrors;
        consoleErrors = [];
      }
      
      if (hasWarns) {
        sessionData.consoleWarns = consoleWarns;
        consoleWarns = [];
      }
      
      orwel.session(sessionData);
    }
    
    consoleTimeout = null;
  };
  
  // Schedule a flush of console events
  const scheduleConsoleFlush = () => {
    if (consoleTimeout) {
      clearTimeout(consoleTimeout);
    }
    
    consoleTimeout = setTimeout(flushConsoleEvents, 1000);
  };

  console.error = function(...args) {
    // Add to batch instead of immediately sending
    consoleErrors.push({
      message: args.map(arg => String(arg)).join(' '),
      timestamp: Date.now()
    });
    
    scheduleConsoleFlush();
    originalConsole.error.apply(console, args);
  };

  console.warn = function(...args) {
    // Add to batch instead of immediately sending
    consoleWarns.push({
      message: args.map(arg => String(arg)).join(' '),
      timestamp: Date.now()
    });
    
    scheduleConsoleFlush();
    originalConsole.warn.apply(console, args);
  };
}; 