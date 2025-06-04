import { OrwelEventDefinition, AutoEventDetectionOptions } from '../types';
import { createLogger } from '../utils';
import { EVENT_CATALOG } from './event-catalog';

/**
 * Manages the event catalog - loading from local data
 */
export class EventCatalogManager {
  private eventCatalog: Map<string, OrwelEventDefinition> = new Map();
  private isInitialized: boolean = false;

  constructor(
    private options: Required<AutoEventDetectionOptions>,
    private logger: ReturnType<typeof createLogger>
  ) {}

  async initialize(): Promise<void> {
    this.logger.debug('Initializing event catalog manager');
    
    // Load catalog from local data
    this.loadLocalCatalog();
    
    this.isInitialized = true;
    this.logger.debug('Event catalog manager initialized', { 
      eventCount: this.eventCatalog.size
    });
  }

  private loadLocalCatalog(): void {
    // Load events from the imported catalog
    EVENT_CATALOG.forEach(event => {
      this.eventCatalog.set(event.code, event);
    });

    this.logger.debug('Local catalog loaded', { eventCount: this.eventCatalog.size });
  }

  getEventDefinition(code: string): OrwelEventDefinition | undefined {
    return this.eventCatalog.get(code);
  }

  getEventsByCategory(category: string): OrwelEventDefinition[] {
    return Array.from(this.eventCatalog.values()).filter(event => event.category === category);
  }

  getAllEvents(): OrwelEventDefinition[] {
    return Array.from(this.eventCatalog.values());
  }

  getEventCount(): number {
    return this.eventCatalog.size;
  }

  isEventEnabled(code: string): boolean {
    const event = this.eventCatalog.get(code);
    return event ? this.options.enabledCategories.includes(event.category) : false;
  }

  cleanup(): void {
    this.logger.debug('Event catalog manager cleaned up');
  }
} 