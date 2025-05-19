import { Orwel, MonitorOptions } from '../types';
import { createLogger } from '../utils';
import { setupErrorMonitoring } from './errors';
import { setupConsoleMonitoring } from './console';
import { setupNetworkMonitoring } from './network';
import { setupPerformanceMonitoring } from './performance';

const safeMonitoringSetup = (
  name: string,
  setupFn: () => void,
  logger: ReturnType<typeof createLogger>
) => {
  try {
    setupFn();
    logger.debug(`Successfully set up ${name} monitoring`);
  } catch (error) {
    logger.error(`Failed to setup ${name} monitoring`, { error });
    // Log but don't rethrow - we want other monitors to continue
  }
};

export const startMonitoring = (
  orwel: Orwel,
  options: MonitorOptions = {}
): void => {
  const logger = createLogger({ debug: false });
  
  // Setup each monitoring type with safe wrapper
  if (options.errors !== false) {
    safeMonitoringSetup('error', () => setupErrorMonitoring(orwel), logger);
  }

  if (options.console !== false) {
    safeMonitoringSetup('console', () => setupConsoleMonitoring(orwel), logger);
  }

  if (options.network !== false) {
    safeMonitoringSetup('network', () => setupNetworkMonitoring(orwel), logger);
  }

  if (options.performance !== false) {
    safeMonitoringSetup('performance', () => setupPerformanceMonitoring(orwel), logger);
  }

  logger.success('Monitoring setup complete', { 
    enabledMonitors: {
      errors: options.errors !== false,
      console: options.console !== false,
      network: options.network !== false,
      performance: options.performance !== false
    }
  });
}; 