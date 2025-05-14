import { Orwel } from '../types';

export const setupErrorMonitoring = (orwel: Orwel): void => {
  window.addEventListener('error', (event) => {
    orwel.track('js_error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.substring(0, 2000) || 'Not available'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    orwel.track('promise_error', {
      message: reason?.message || String(reason),
      stack: reason?.stack?.substring(0, 2000) || 'Not available'
    });
  });
}; 