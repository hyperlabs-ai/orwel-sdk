import { 
  Orwel, 
  AutoEventDetectionOptions, 
  DetectionResult, 
  DetectionContext, 
  PageContext,
  DetectionStrategy 
} from '../types';
import { createLogger } from '../utils';
import { EventCatalogManager } from './catalog-manager';
import { NavigationDetectionStrategy } from './strategies/navigation';
import { EcommerceDetectionStrategy } from './strategies/ecommerce';
import { AuthDetectionStrategy } from './strategies/auth';

/**
 * Main detection engine that coordinates all detection strategies
 */
export class EventDetectionEngine {
  private strategies: Map<string, DetectionStrategy> = new Map();
  private pageContext: PageContext;
  private isInitialized: boolean = false;
  private globalListeners: Array<{ element: EventTarget; type: string; listener: EventListener }> = [];

  constructor(
    private orwel: Orwel,
    private catalogManager: EventCatalogManager,
    private options: Required<AutoEventDetectionOptions>,
    private logger: ReturnType<typeof createLogger>
  ) {
    this.pageContext = this.createPageContext();
  }

  async initialize(): Promise<void> {
    this.logger.debug('Initializing event detection engine');
    
    // Initialize detection strategies based on enabled categories
    this.initializeStrategies();
    
    // Set up global DOM listeners
    this.setupGlobalListeners();
    
    // Set up page change detection
    this.setupPageChangeDetection();
    
    // Auto-detect page view
    this.detectPageView();
    
    this.isInitialized = true;
    this.logger.debug('Event detection engine initialized', {
      strategiesCount: this.strategies.size,
      enabledCategories: this.options.enabledCategories
    });
  }

  private createPageContext(): PageContext {
    return {
      url: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  private initializeStrategies(): void {
    const enabledCategories = this.options.enabledCategories;
    
    // Navigation strategies (always enabled for basic tracking)
    if (enabledCategories.includes('navigation')) {
      const navigationEvents = this.catalogManager.getEventsByCategory('navigation');
      navigationEvents.forEach(eventDef => {
        const strategy = new NavigationDetectionStrategy(eventDef.code, this.logger);
        this.strategies.set(eventDef.code, strategy);
      });
    }
    
    // Ecommerce strategies
    if (enabledCategories.includes('ecommerce')) {
      const ecommerceEvents = this.catalogManager.getEventsByCategory('ecommerce');
      ecommerceEvents.forEach(eventDef => {
        const strategy = new EcommerceDetectionStrategy(eventDef.code, this.logger);
        this.strategies.set(eventDef.code, strategy);
      });
    }
    
    // Auth strategies
    if (enabledCategories.includes('auth')) {
      const authEvents = this.catalogManager.getEventsByCategory('auth');
      authEvents.forEach(eventDef => {
        const strategy = new AuthDetectionStrategy(eventDef.code, this.logger);
        this.strategies.set(eventDef.code, strategy);
      });
    }
    
    this.logger.debug('Detection strategies initialized', {
      strategiesCount: this.strategies.size,
      categories: enabledCategories
    });
  }

  private setupGlobalListeners(): void {
    // Click detection
    const clickListener = (event: Event) => {
      this.handleDOMEvent('click', event);
    };
    document.addEventListener('click', clickListener, true);
    this.globalListeners.push({ element: document, type: 'click', listener: clickListener });

    // Form submission detection
    const submitListener = (event: Event) => {
      this.handleDOMEvent('submit', event);
    };
    document.addEventListener('submit', submitListener, true);
    this.globalListeners.push({ element: document, type: 'submit', listener: submitListener });

    // Page visibility for element tracking
    const visibilityListener = () => {
      if (!document.hidden) {
        this.detectVisibleElements();
      }
    };
    document.addEventListener('visibilitychange', visibilityListener);
    this.globalListeners.push({ element: document, type: 'visibilitychange', listener: visibilityListener });

    // Scroll detection
    const scrollListener = () => {
      this.handleScrollEvent();
    };
    window.addEventListener('scroll', scrollListener, { passive: true });
    this.globalListeners.push({ element: window, type: 'scroll', listener: scrollListener });

    this.logger.debug('Global event listeners setup complete');
  }

  private setupPageChangeDetection(): void {
    // History API detection
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handlePageChange();
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handlePageChange();
    };
    
    // Popstate for back/forward navigation
    const popstateListener = () => {
      this.handlePageChange();
    };
    window.addEventListener('popstate', popstateListener);
    this.globalListeners.push({ element: window, type: 'popstate', listener: popstateListener });
  }

  private handleDOMEvent(eventType: string, event: Event): void {
    const context: DetectionContext = {
      element: event.target as Element,
      event,
      pageContext: this.pageContext
    };

    // Run relevant strategies
    this.strategies.forEach((strategy, eventCode) => {
      if (this.catalogManager.isEventEnabled(eventCode)) {
        try {
          const result = strategy.detect(context);
          if (result && result.confidence >= this.options.confidenceThreshold) {
            this.processDetectionResult(result);
          }
        } catch (error) {
          this.logger.error(`Error in detection strategy for ${eventCode}`, { error });
        }
      }
    });
  }

  private handlePageChange(): void {
    // Update page context
    this.pageContext = this.createPageContext();
    
    // Detect page view
    this.detectPageView();
    
    this.logger.debug('Page change detected', { 
      url: this.pageContext.url,
      pathname: this.pageContext.pathname 
    });
  }

  private detectPageView(): void {
    if (this.catalogManager.isEventEnabled('page_view')) {
      const result: DetectionResult = {
        eventCode: 'page_view',
        confidence: 1.0,
        data: {
          page_url: this.pageContext.url,
          page_title: this.pageContext.title,
          page_path: this.pageContext.pathname,
          page_referrer: this.pageContext.referrer,
          viewport_width: this.pageContext.viewport.width,
          viewport_height: this.pageContext.viewport.height
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
      
      this.processDetectionResult(result);
    }
  }

  private handleScrollEvent(): void {
    if (this.catalogManager.isEventEnabled('scroll')) {
      const scrollPercent = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      
      // Only track meaningful scroll milestones
      const milestones = [25, 50, 75, 90, 100];
      const milestone = milestones.find(m => 
        scrollPercent >= m && !this.hasTrackedScrollMilestone(m)
      );
      
      if (milestone) {
        const result: DetectionResult = {
          eventCode: 'scroll',
          confidence: 1.0,
          data: {
            depth: milestone,
            scroll_y: window.scrollY,
            page_height: document.body.scrollHeight,
            viewport_height: window.innerHeight
          },
          trigger: 'dom_event',
          timestamp: Date.now()
        };
        
        this.processDetectionResult(result);
        this.markScrollMilestone(milestone);
      }
    }
  }

  private hasTrackedScrollMilestone(milestone: number): boolean {
    // Simple implementation - could be enhanced with session storage
    return (window as any).__orwelScrollMilestones?.has(milestone) || false;
  }

  private markScrollMilestone(milestone: number): void {
    if (!(window as any).__orwelScrollMilestones) {
      (window as any).__orwelScrollMilestones = new Set();
    }
    (window as any).__orwelScrollMilestones.add(milestone);
  }

  private detectVisibleElements(): void {
    // Use intersection observer for element visibility
    if ('IntersectionObserver' in window && this.catalogManager.isEventEnabled('element_visible')) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const result: DetectionResult = {
              eventCode: 'element_visible',
              confidence: 0.8,
              data: {
                element_tag: entry.target.tagName.toLowerCase(),
                element_id: entry.target.id || undefined,
                element_classes: entry.target.className || undefined,
                intersection_ratio: entry.intersectionRatio,
                viewport_width: this.pageContext.viewport.width,
                viewport_height: this.pageContext.viewport.height
              },
              trigger: 'visual_pattern',
              timestamp: Date.now()
            };
            
            this.processDetectionResult(result);
            observer.unobserve(entry.target); // Only track once per element
          }
        });
      }, { threshold: 0.5 });

      // Observe important elements
      document.querySelectorAll('[data-track-visibility], .cta, .call-to-action, .product, .banner')
        .forEach(el => observer.observe(el));
    }
  }

  private processDetectionResult(result: DetectionResult): void {
    this.logger.debug('Event detected', {
      eventCode: result.eventCode,
      confidence: result.confidence,
      trigger: result.trigger
    });

    // Track the event using the main orwel instance
    this.orwel.track(result.eventCode, {
      ...result.data,
      auto_detected: true,
      detection_confidence: result.confidence,
      detection_trigger: result.trigger,
      detection_timestamp: result.timestamp
    });
  }

  cleanup(): void {
    this.logger.debug('Cleaning up event detection engine');
    
    // Remove all global listeners
    this.globalListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.globalListeners = [];
    
    // Cleanup strategies
    this.strategies.forEach(strategy => {
      if (strategy.cleanup) {
        strategy.cleanup();
      }
    });
    this.strategies.clear();
    
    this.logger.debug('Event detection engine cleaned up');
  }
} 