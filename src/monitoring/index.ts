import { Orwel, MonitorOptions } from '../types';
import { setupPerformanceMonitoring } from './performance';
import { setupErrorMonitoring } from './errors';
import { setupConsoleMonitoring } from './console';
import { setupNetworkMonitoring } from './network';
import { setupMemoryMonitoring } from './memory';

export const startMonitoring = (orwel: Orwel, options: MonitorOptions = {}): void => {
  const defaultOptions = {
    performance: true,
    errors: true,
    console: true,
    network: true,
    memory: true
  };
  
  const settings = { ...defaultOptions, ...options };
  
  if (settings.performance) setupPerformanceMonitoring(orwel);
  if (settings.errors) setupErrorMonitoring(orwel);
  if (settings.console) setupConsoleMonitoring(orwel);
  if (settings.network) setupNetworkMonitoring(orwel);
  if (settings.memory) setupMemoryMonitoring(orwel);
}; 