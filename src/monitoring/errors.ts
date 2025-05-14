import { Orwel } from '../types';

export const setupErrorMonitoring = (orwel: Orwel): void => {
  // Store error data to batch them
  let jsErrors: any[] = [];
  let promiseErrors: any[] = [];
  let errorTimeout: any = null;
  
  // Function to flush the batched error events
  const flushErrorEvents = () => {
    const hasJsErrors = jsErrors.length > 0;
    const hasPromiseErrors = promiseErrors.length > 0;
    
    if (hasJsErrors || hasPromiseErrors) {
      const sessionData: Record<string, any> = {};
      
      if (hasJsErrors) {
        sessionData.jsErrors = jsErrors;
        jsErrors = [];
      }
      
      if (hasPromiseErrors) {
        sessionData.promiseErrors = promiseErrors;
        promiseErrors = [];
      }
      
      orwel.session(sessionData);
    }
    
    errorTimeout = null;
  };
  
  // Schedule a flush of error events
  const scheduleErrorFlush = () => {
    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }
    
    errorTimeout = setTimeout(flushErrorEvents, 1000);
  };

  window.addEventListener('error', (event) => {
    // Add to batch instead of immediately sending
    jsErrors.push({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.substring(0, 2000) || 'Not available'
    });
    
    scheduleErrorFlush();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    
    // Add to batch instead of immediately sending
    promiseErrors.push({
      message: reason?.message || String(reason),
      stack: reason?.stack?.substring(0, 2000) || 'Not available'
    });
    
    scheduleErrorFlush();
  });
}; 