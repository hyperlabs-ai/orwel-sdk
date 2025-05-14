import { Orwel } from '../types';

export const setupNetworkMonitoring = (orwel: Orwel): void => {
  if (!window.XMLHttpRequest) return;

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(
    method: string, 
    url: string | URL, 
    async?: boolean, 
    username?: string | null, 
    password?: string | null
  ) {
    this._orwelMethod = method;
    this._orwelUrl = url;
    this._orwelStartTime = Date.now();
    return originalOpen.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function(this: XMLHttpRequest) {
      const duration = Date.now() - (this._orwelStartTime || 0);
      orwel.track('network_request', {
        url: String(this._orwelUrl || ''),
        method: this._orwelMethod || 'unknown',
        status: this.status,
        duration,
        success: this.status >= 200 && this.status < 300
      });
    });

    this.addEventListener('error', function(this: XMLHttpRequest) {
      const duration = Date.now() - (this._orwelStartTime || 0);
      orwel.track('network_error', {
        url: String(this._orwelUrl || ''),
        method: this._orwelMethod || 'unknown',
        duration
      });
    });

    return originalSend.apply(this, args);
  };

  // Monitor fetch API if available
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const startTime = Date.now();
      const method = init?.method || 'GET';
      const url = typeof input === 'string' ? input : 
                  (input instanceof URL ? input.toString() : 
                  ('url' in input ? String(input.url) : ''));
      
      return originalFetch.apply(window, [input, init])
        .then(response => {
          const duration = Date.now() - startTime;
          orwel.track('network_request', {
            url,
            method,
            status: response.status,
            duration,
            success: response.ok
          });
          return response;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          orwel.track('network_error', {
            url,
            method,
            duration,
            message: error.message
          });
          throw error;
        });
    };
  }
}; 