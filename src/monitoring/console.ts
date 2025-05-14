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
  
  // Session throttling variables
  let lastSessionUpdateTime = 0;
  const SESSION_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds
  
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
      
      const currentTime = Date.now();
      // Only send session data if it's the first time or if the interval has passed
      if (lastSessionUpdateTime === 0 || (currentTime - lastSessionUpdateTime) >= SESSION_UPDATE_INTERVAL) {
        orwel.session(sessionData);
        lastSessionUpdateTime = currentTime;
      }
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
    // Check if this is an SDK internal message to avoid infinite loops
    const isInternalSdkMessage = args.length > 0 && 
      typeof args[0] === 'string' && 
      args[0].includes('[Orwel SDK]');
    
    if (!isInternalSdkMessage) {
      // Add to batch instead of immediately sending
      consoleErrors.push({
        message: args.map(arg => String(arg)).join(' '),
        timestamp: Date.now()
      });
      
      scheduleConsoleFlush();
    }
    
    // Always call the original console method
    originalConsole.error.apply(console, args);
  };

  console.warn = function(...args) {
    // Check if this is an SDK internal message to avoid infinite loops
    const isInternalSdkMessage = args.length > 0 && 
      typeof args[0] === 'string' && 
      args[0].includes('[Orwel SDK]');
    
    if (!isInternalSdkMessage) {
      // Add to batch instead of immediately sending
      consoleWarns.push({
        message: args.map(arg => String(arg)).join(' '),
        timestamp: Date.now()
      });
      
      scheduleConsoleFlush();
    }
    
    // Always call the original console method
    originalConsole.warn.apply(console, args);
  };
}; 