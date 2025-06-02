import { OrwelEventDefinition, AutoEventDetectionOptions } from '../types';
import { createLogger } from '../utils';

/**
 * Manages the event catalog - loading, syncing, and updating event definitions
 */
export class EventCatalogManager {
  private eventCatalog: Map<string, OrwelEventDefinition> = new Map();
  private catalogVersion: string = '';
  private syncInterval?: ReturnType<typeof setInterval>;
  private isInitialized: boolean = false;

  constructor(
    private options: Required<AutoEventDetectionOptions>,
    private logger: ReturnType<typeof createLogger>
  ) {}

  async initialize(): Promise<void> {
    this.logger.debug('Initializing event catalog manager');
    
    // Load local fallback catalog first
    this.loadFallbackCatalog();
    
    // Try to load from server if sync is enabled
    if (this.options.enableCatalogSync) {
      await this.loadFromServer();
      this.startSyncInterval();
    }
    
    this.isInitialized = true;
    this.logger.debug('Event catalog manager initialized', { 
      eventCount: this.eventCatalog.size,
      syncEnabled: this.options.enableCatalogSync
    });
  }

  private loadFallbackCatalog(): void {
    // Load from the CSV data as fallback
    const fallbackEvents: OrwelEventDefinition[] = [
      { id: '46962b82-682b-4b67-86e0-851b83558132', code: 'logout', category: 'auth', description: 'User logged out of their account', severity: 1 },
      { id: '4e62a7b1-d481-4c99-9e53-22c3ab48069c', code: 'complete_profile', category: 'auth', description: 'User completed their profile information', severity: 1 },
      { id: '05fc278b-b5e7-4765-8835-8484ab087892', code: 'verify_email', category: 'auth', description: 'User verified their email address', severity: 1 },
      { id: 'aee601fd-b2fa-4457-a1b9-99fd639dac49', code: 'join_group', category: 'auth', description: 'User joined a group or community', severity: 1 },
      { id: 'ec9c074c-7094-41b6-a916-bea4a31d3038', code: 'login', category: 'auth', description: 'User logged into their account', severity: 1 },
      { id: 'c64aa6ac-0442-471a-8fe8-4f024429dacf', code: 'signup', category: 'auth', description: 'User created a new account', severity: 2 },
      { id: '28c7c149-f274-4665-bd87-6d2c32497044', code: 'chat_opened', category: 'communication', description: 'User opened a chat window', severity: 1 },
      { id: '602f8dc1-136e-40ce-b42f-4a72382064af', code: 'chat_message_sent', category: 'communication', description: 'User sent a message in chat', severity: 1 },
      { id: '5be64ef7-55dc-4b71-88ea-9f2b39e6b37d', code: 'milestone_reached', category: 'conversion', description: 'User reached a specific milestone', severity: 1 },
      { id: '776fc864-e375-4006-9af4-f46ac8233ddf', code: 'optimize_personalization_impression', category: 'conversion', description: 'User received a personalized experience', severity: 1 },
      { id: '7d290342-3215-40b0-b39f-d874cef1fedf', code: 'conversion_custom', category: 'conversion', description: 'Custom conversion event occurred', severity: 1 },
      { id: '3aa27f3a-235f-4fce-af54-8c45df63d5f3', code: 'optimize_experiment_impression', category: 'conversion', description: 'User was exposed to an A/B test', severity: 1 },
      { id: '77b7c641-73df-4f2f-a2c1-22f6f50567c6', code: 'select_promotion', category: 'conversion', description: 'User selected a promotion', severity: 1 },
      { id: 'c67780c5-2799-4eec-9f48-c6caaa641f0c', code: 'view_promotion', category: 'conversion', description: 'User viewed a promotion', severity: 1 },
      { id: '65ac0f7a-4d8f-41b5-b847-f1977ff52b83', code: 'share', category: 'conversion', description: 'User shared content externally', severity: 1 },
      { id: '9d5d3523-2d0d-4825-a9a8-60b1eaf64d75', code: 'waitlist', category: 'conversion', description: 'New user register to waitlist', severity: 3 },
      { id: '721ad0ab-3b7b-4c67-88b3-05ce1c4e05fc', code: 'generate_lead', category: 'conversion', description: 'A new lead was generated', severity: 3 },
      // Ecommerce events
      { id: 'a7b22e9a-835c-4f23-a41e-978b5adf2bc2', code: 'set_checkout_option', category: 'ecommerce', description: 'User selected a checkout option (e.g., shipping method)', severity: 1 },
      { id: '282134bd-7a48-44f4-a5b5-952d8a8768c8', code: 'checkout_progress', category: 'ecommerce', description: 'User proceeded to the next checkout step', severity: 1 },
      { id: '038dc815-3def-4707-aa9b-f399612a43d7', code: 'begin_checkout', category: 'ecommerce', description: 'User started the checkout process', severity: 1 },
      { id: 'a54943b0-17dc-4526-97b4-dda1db74606c', code: 'remove_from_cart', category: 'ecommerce', description: 'User removed a product from the cart', severity: 1 },
      { id: 'ef4ca1b1-3fb7-4640-870f-a6132a00de55', code: 'add_to_cart', category: 'ecommerce', description: 'User added a product to the shopping cart', severity: 1 },
      { id: '307de143-dfc8-4c4f-9401-dd58579058b8', code: 'select_item', category: 'ecommerce', description: 'User selected a specific item from a list', severity: 1 },
      { id: 'fd46271b-3cf4-4288-9ef2-c96a3b8268bf', code: 'refund', category: 'ecommerce', description: 'A refund was issued for a purchase', severity: 1 },
      { id: '7503e24f-ac23-4b17-8a98-7a1315bc33ca', code: 'add_payment_info', category: 'ecommerce', description: 'User provided payment details', severity: 1 },
      { id: '3e666e68-7928-4742-ae12-739cad432b06', code: 'view_cart', category: 'ecommerce', description: 'User viewed their shopping cart', severity: 1 },
      { id: '1e82594b-5b75-42cf-b06a-f1145f9f5796', code: 'view_item', category: 'ecommerce', description: 'User viewed a specific product', severity: 1 },
      { id: 'ec42800d-add2-48ed-9176-2ab8730f4c11', code: 'view_item_list', category: 'ecommerce', description: 'User viewed a list of products', severity: 1 },
      { id: '7d52b0c3-12b0-4879-9f52-3568e2bf40bb', code: 'add_shipping_info', category: 'ecommerce', description: 'User entered shipping information', severity: 2 },
      { id: '540e417e-8939-480f-a45d-075d593db1fc', code: 'purchase', category: 'ecommerce', description: 'User completed a purchase', severity: 3 },
      // Form events - these will be handled by existing form tracking
      { id: '5d7045dc-43c9-431b-98da-d3d6e565ad42', code: 'form_input', category: 'form', description: 'User entered data in a form field', severity: 1 },
      { id: '23df59dc-626a-44da-9c4d-65255a2fffe8', code: 'form_change', category: 'form', description: 'User changed a form field (input, select, etc.)', severity: 1 },
      { id: '19e65564-4ea0-42c1-8b0e-ff8837c87b19', code: 'form_submit_attempt', category: 'form', description: 'User attempted to submit the form', severity: 1 },
      { id: '6090c0de-ff04-4b37-ab8e-2c64ce628e16', code: 'form_submit_error', category: 'form', description: 'Form failed to submit due to validation or API error', severity: 1 },
      { id: '44a25a28-c90c-4911-89ae-32cd665579f4', code: 'form_submit_success', category: 'form', description: 'Form submitted successfully (e.g., signup)', severity: 1 },
      { id: 'f5504b6e-3dce-415c-965b-49b74f68e833', code: 'form_focus', category: 'form', description: 'User focused on a form input field', severity: 1 },
      { id: '52ee860b-68c2-4f06-a612-86e48bc59b96', code: 'form_abandon', category: 'form', description: 'User started the form but left before submitting', severity: 2 },
      // Navigation events
      { id: 'f3935683-6f2e-4398-ab19-46d1937f0916', code: 'scroll', category: 'navigation', description: 'User scrolled through the page', needs: '{"depth": "int ex. 80"}', severity: 1 },
      { id: '8ec94bfe-18fa-499c-b9e5-bb7c341f8986', code: 'time_on_screen', category: 'navigation', description: 'Time an element stayed visible on screen', severity: 1 },
      { id: '4cdc5c39-856a-43f0-ad1a-3ea72722edea', code: 'hover', category: 'navigation', description: 'User hovered over an element', severity: 1 },
      { id: '91f86b79-ca00-4b18-bf76-6d09bece96f7', code: 'select_content', category: 'navigation', description: 'User selected a piece of content', severity: 1 },
      { id: '862c128f-fd1c-4eac-a4d3-e21ab1cb1d8c', code: 'view_search_results', category: 'navigation', description: 'User saw the search results page', severity: 1 },
      { id: '61249499-3dc1-4ab0-90af-eed60633ee88', code: 'search', category: 'navigation', description: 'User performed a search query', severity: 1 },
      { id: 'eaa171ab-334a-4441-a4fa-f09ef29a3034', code: 'click', category: 'navigation', description: 'User clicked on an element', severity: 1 },
      { id: 'ef7d772d-9034-4f46-a120-73a8a5da7830', code: 'page_view', category: 'navigation', description: 'User loaded a page', severity: 1 },
      { id: '8cadedb6-e96e-45da-ada7-2b7f06a43c14', code: 'element_visible', category: 'navigation', description: 'An element became visible to the user', severity: 1 }
    ];

    fallbackEvents.forEach(event => {
      this.eventCatalog.set(event.code, event);
    });

    this.logger.debug('Fallback catalog loaded', { eventCount: this.eventCatalog.size });
  }

  private async loadFromServer(): Promise<void> {
    try {
      this.logger.debug('Loading event catalog from server');
      
      // First check version
      const versionResponse = await fetch('/api/orwel/events-catalog/version');
      if (versionResponse.ok) {
        const { version } = await versionResponse.json();
        
        if (version !== this.catalogVersion) {
          // Load full catalog
          const catalogResponse = await fetch('/api/orwel/events-catalog');
          if (catalogResponse.ok) {
            const events: OrwelEventDefinition[] = await catalogResponse.json();
            this.updateCatalog(events);
            this.catalogVersion = version;
            this.logger.success('Event catalog loaded from server', { 
              version, 
              eventCount: events.length 
            });
          } else {
            this.logger.warning('Failed to load catalog from server, using fallback');
          }
        }
      } else {
        this.logger.warning('Server catalog not available, using fallback');
      }
    } catch (error) {
      this.logger.warning('Error loading catalog from server, using fallback', { error });
    }
  }

  private startSyncInterval(): void {
    this.syncInterval = setInterval(async () => {
      if (document.visibilityState !== 'hidden') {
        await this.loadFromServer();
      }
    }, this.options.catalogUpdateInterval);

    // Also sync on visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.loadFromServer();
      }
    });
  }

  private updateCatalog(events: OrwelEventDefinition[]): void {
    this.eventCatalog.clear();
    events.forEach(event => {
      this.eventCatalog.set(event.code, event);
    });
    
    this.logger.debug('Event catalog updated', { eventCount: this.eventCatalog.size });
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
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.logger.debug('Event catalog manager cleaned up');
  }
} 