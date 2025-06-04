import { Orwel, AutoEventDetectionOptions, EventCategory } from '../types';
import { createLogger } from '../utils';
import { EventDetectionEngine } from './engine';
import { EventCatalogManager } from './catalog-manager';

/**
 * Creates and initializes the auto event detection system
 */
export function createAutoEventDetection(
  orwel: Orwel,
  options: AutoEventDetectionOptions = {},
  logger: ReturnType<typeof createLogger>
) {
  const defaultOptions: Required<AutoEventDetectionOptions> = {
    enabledCategories: [
      'auth', 'ecommerce', 'navigation', 'form', 'media', 
      'conversion', 'communication', 'technical', 'notification', 
      'feedback', 'gamification'
    ],
    confidenceThreshold: 0.7,
  };

  const mergedOptions = { ...defaultOptions, ...options };

  logger.info('Initializing auto event detection', {
    enabledCategories: mergedOptions.enabledCategories,
    threshold: mergedOptions.confidenceThreshold
  });

  // Create catalog manager
  const catalogManager = new EventCatalogManager(mergedOptions, logger);

  // Create detection engine
  const detectionEngine = new EventDetectionEngine(
    orwel,
    catalogManager,
    mergedOptions,
    logger
  );

  // Initialize the system
  const initialize = async () => {
    try {
      await catalogManager.initialize();
      await detectionEngine.initialize();
      
      logger.success('Auto event detection initialized successfully', {
        eventsCount: catalogManager.getEventCount(),
        categoriesEnabled: mergedOptions.enabledCategories.length
      });
    } catch (error) {
      logger.error('Failed to initialize auto event detection', { error });
    }
  };

  // Cleanup function
  const cleanup = () => {
    logger.debug('Cleaning up auto event detection');
    detectionEngine.cleanup();
    catalogManager.cleanup();
  };

  return {
    initialize,
    cleanup,
    getDetectionEngine: () => detectionEngine,
    getCatalogManager: () => catalogManager
  };
} 