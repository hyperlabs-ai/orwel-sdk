import { Orwel } from '../types';

export const setupNetworkMonitoring = (orwel: Orwel): void => {
  if (!window.XMLHttpRequest) return;

  // Store network request data to batch them
  let networkRequests: any[] = [];
  let networkErrors: any[] = [];
  let networkTimeout: any = null;
  
  // Function to flush the batched network events
  const flushNetworkEvents = () => {
    const hasRequests = networkRequests.length > 0;
    const hasErrors = networkErrors.length > 0;
    
    if (hasRequests || hasErrors) {
      const sessionData: Record<string, any> = {};
      
      if (hasRequests) {
        sessionData.networkRequests = networkRequests;
        networkRequests = [];
      }
      
      if (hasErrors) {
        sessionData.networkErrors = networkErrors;
        networkErrors = [];
      }
      
      orwel.session(sessionData);
    }
    
    networkTimeout = null;
  };
  
  // Schedule a flush of network events
  const scheduleNetworkFlush = () => {
    if (networkTimeout) {
      clearTimeout(networkTimeout);
    }
    
    networkTimeout = setTimeout(flushNetworkEvents, 1000);
  };

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
      
      // Add to batch instead of immediately sending
      networkRequests.push({
        url: String(this._orwelUrl || ''),
        method: this._orwelMethod || 'unknown',
        status: this.status,
        duration,
        success: this.status >= 200 && this.status < 300,
        timestamp: Date.now()
      });
      
      scheduleNetworkFlush();
    });

    this.addEventListener('error', function(this: XMLHttpRequest) {
      const duration = Date.now() - (this._orwelStartTime || 0);
      
      // Add to batch instead of immediately sending
      networkErrors.push({
        url: String(this._orwelUrl || ''),
        method: this._orwelMethod || 'unknown',
        duration,
        timestamp: Date.now()
      });
      
      scheduleNetworkFlush();
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
          
          // Add to batch instead of immediately sending
          networkRequests.push({
            url,
            method,
            status: response.status,
            duration,
            success: response.ok,
            timestamp: Date.now()
          });
          
          scheduleNetworkFlush();
          return response;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          
          // Add to batch instead of immediately sending
          networkErrors.push({
            url,
            method,
            duration,
            message: error.message,
            timestamp: Date.now()
          });
          
          scheduleNetworkFlush();
          throw error;
        });
    };
  }
}; 