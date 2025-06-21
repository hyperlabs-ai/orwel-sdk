import { Orwel, Config, MonitorOptions } from './types';
import { isBrowser } from './utils';
import { createBrowserImplementation } from './browser';
import { createServerImplementation } from './server';

// Create and export the orwel instance based on environment
const orwel: Orwel = isBrowser ? createBrowserImplementation() : createServerImplementation();

// Attach to window in browser environment
if (isBrowser) {
  (window as any).orwel = orwel;
}

// Export public types for consumers
export type { Orwel, Config, MonitorOptions };

// Export the orwel singleton
export { orwel };

// Export as default
export default orwel;