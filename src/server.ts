import { Orwel, Config, FormOptions } from './types';
import { createLogger } from './utils';

// Create a server implementation (no-op)
export function createServerImplementation(): Orwel {
  let logger = createLogger({ debug: false, verbose: false });

  const noopId = () => {
    logger.debug('Identify called (no-op in server environment)');
    return { success: true, visitorId: '' };
  };
  
  const noopTrack = () => {
    logger.debug('Track called (no-op in server environment)');
    return { success: true, eventId: '' };
  };
  
  const noopSession = () => {
    logger.debug('Session called (no-op in server environment)');
    return { success: true, sessionId: '' };
  };
  
  const noopAsync = () => {
    logger.debug('Flush called (no-op in server environment)');
    return Promise.resolve({ success: true, count: 0 });
  };
  
  const noopForm = (formElement: HTMLFormElement, options?: FormOptions) => {
    logger.debug('Form tracking called (no-op in server environment)');
    return { success: false };
  };
  
  return {
    init: (opts: Config = {} as Config) => {
      // Initialize logger with debug configuration
      logger = createLogger({
        debug: opts.debug || false,
        verbose: opts.verbose || false
      });
      
      logger.info('Initializing Orwel SDK in server environment', {
        debug: opts.debug,
        verbose: opts.verbose
      });
      
      logger.warning('Orwel SDK has limited functionality in server environment');
      logger.success('Orwel SDK initialized in server environment');
    },
    identify: noopId,
    track: noopTrack,
    session: noopSession,
    monitor: () => {
      logger.debug('Monitor called (no-op in server environment)');
      return { success: true };
    },
    flush: noopAsync,
    form: noopForm
  };
} 