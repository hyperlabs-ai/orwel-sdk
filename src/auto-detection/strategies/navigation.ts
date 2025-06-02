import { DetectionStrategy, DetectionContext, DetectionResult } from '../../types';
import { createLogger, throttle } from '../../utils';

/**
 * Detection strategy for navigation-related events
 */
export class NavigationDetectionStrategy implements DetectionStrategy {
  readonly category = 'navigation' as const;
  private hoverTimeouts: WeakMap<Element, number> = new WeakMap();
  private searchSelectors = [
    'input[type="search"]',
    'input[name*="search"]',
    'input[placeholder*="search"]',
    'input[id*="search"]',
    '.search-input',
    '.search-field'
  ];

  constructor(
    readonly eventCode: string,
    private logger: ReturnType<typeof createLogger>
  ) {}

  detect(context: DetectionContext): DetectionResult | null {
    if (!context.element || !context.event) return null;

    switch (this.eventCode) {
      case 'click':
        return this.detectClick(context);
      case 'hover':
        return this.detectHover(context);
      case 'search':
        return this.detectSearch(context);
      case 'select_content':
        return this.detectContentSelection(context);
      default:
        return null;
    }
  }

  private detectClick(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (!element || event?.type !== 'click') return null;

    const elementData = this.analyzeElement(element);
    if (!elementData.isClickable) return null;

    return {
      eventCode: 'click',
      confidence: 0.9,
      data: {
        element_type: elementData.type,
        element_text: elementData.text,
        element_url: elementData.url,
        element_id: elementData.id,
        element_classes: elementData.classes,
        click_coordinates: this.getClickCoordinates(event as MouseEvent),
        is_external_link: elementData.isExternalLink,
        link_category: elementData.linkCategory
      },
      trigger: 'dom_event',
      timestamp: Date.now()
    };
  }

  private detectHover(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (!element || event?.type !== 'mouseenter') return null;

    const elementData = this.analyzeElement(element);
    if (!elementData.isInteractive) return null;

    // Set up hover duration tracking
    const startTime = Date.now();
    const timeoutId = window.setTimeout(() => {
      // Only track meaningful hovers (>500ms)
      const duration = Date.now() - startTime;
      if (duration >= 500) {
        // Process hover event
        this.logger.debug('Meaningful hover detected', {
          element: elementData.type,
          duration
        });
      }
    }, 500);

    this.hoverTimeouts.set(element, timeoutId);

    // Set up mouseleave listener to clear timeout
    const mouseLeaveHandler = () => {
      const existingTimeout = this.hoverTimeouts.get(element);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.hoverTimeouts.delete(element);
      }
      element.removeEventListener('mouseleave', mouseLeaveHandler);
    };

    element.addEventListener('mouseleave', mouseLeaveHandler, { once: true });

    return {
      eventCode: 'hover',
      confidence: 0.7,
      data: {
        element_type: elementData.type,
        element_text: elementData.text,
        element_id: elementData.id,
        element_classes: elementData.classes
      },
      trigger: 'dom_event',
      timestamp: Date.now()
    };
  }

  private detectSearch(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (!element || !event) return null;

    // Detect search input events
    if (event.type === 'input' || event.type === 'change') {
      const input = element as HTMLInputElement;
      
      if (this.isSearchInput(input)) {
        const searchValue = input.value.trim();
        
        if (searchValue.length >= 2) { // Meaningful search query
          return {
            eventCode: 'search',
            confidence: 0.95,
            data: {
              search_query: searchValue,
              search_field_id: input.id || undefined,
              search_field_name: input.name || undefined,
              query_length: searchValue.length,
              search_context: this.getSearchContext(input)
            },
            trigger: 'dom_event',
            timestamp: Date.now()
          };
        }
      }
    }

    // Detect search form submission
    if (event.type === 'submit') {
      const form = element as HTMLFormElement;
      const searchInput = this.findSearchInputInForm(form);
      
      if (searchInput && searchInput.value.trim()) {
        return {
          eventCode: 'search',
          confidence: 1.0,
          data: {
            search_query: searchInput.value.trim(),
            search_method: 'form_submit',
            search_field_id: searchInput.id || undefined,
            search_field_name: searchInput.name || undefined
          },
          trigger: 'dom_event',
          timestamp: Date.now()
        };
      }
    }

    return null;
  }

  private detectContentSelection(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (!element || event?.type !== 'click') return null;

    // Detect clicks on content items
    const contentElement = this.findContentElement(element);
    if (!contentElement) return null;

    const contentData = this.analyzeContentElement(contentElement);

    return {
      eventCode: 'select_content',
      confidence: 0.8,
      data: {
        content_type: contentData.type,
        content_title: contentData.title,
        content_id: contentData.id,
        content_category: contentData.category,
        selection_context: contentData.context
      },
      trigger: 'dom_event',
      timestamp: Date.now()
    };
  }

  private analyzeElement(element: Element): ElementAnalysis {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim().slice(0, 100) || '';
    const href = element.getAttribute('href');
    const id = element.id || undefined;
    const classes = element.className || undefined;

    return {
      type: tagName,
      text,
      url: href,
      id,
      classes,
      isClickable: this.isClickableElement(element),
      isInteractive: this.isInteractiveElement(element),
      isExternalLink: href ? this.isExternalLink(href) : false,
      linkCategory: href ? this.categorizeLinkType(href) : undefined
    };
  }

  private isClickableElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const clickableTags = ['a', 'button', 'input', 'select', 'textarea'];
    
    if (clickableTags.includes(tagName)) return true;
    
    // Check for click handlers or cursor pointer
    const styles = window.getComputedStyle(element);
    if (styles.cursor === 'pointer') return true;
    
    // Check for role button
    if (element.getAttribute('role') === 'button') return true;
    
    return false;
  }

  private isInteractiveElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
    
    return interactiveTags.includes(tagName) || element.hasAttribute('tabindex');
  }

  private isExternalLink(href: string): boolean {
    try {
      const url = new URL(href, window.location.origin);
      return url.hostname !== window.location.hostname;
    } catch {
      return false;
    }
  }

  private categorizeLinkType(href: string): string {
    if (href.startsWith('mailto:')) return 'email';
    if (href.startsWith('tel:')) return 'phone';
    if (href.startsWith('#')) return 'anchor';
    if (this.isExternalLink(href)) return 'external';
    
    // Check for common patterns
    if (href.includes('/product/') || href.includes('/item/')) return 'product';
    if (href.includes('/category/') || href.includes('/collection/')) return 'category';
    if (href.includes('/blog/') || href.includes('/article/')) return 'content';
    if (href.includes('/contact')) return 'contact';
    if (href.includes('/about')) return 'about';
    
    return 'internal';
  }

  private getClickCoordinates(event: MouseEvent): { x: number; y: number } {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }

  private isSearchInput(input: HTMLInputElement): boolean {
    // Check input type
    if (input.type === 'search') return true;
    
    // Check selectors
    return this.searchSelectors.some(selector => input.matches(selector));
  }

  private findSearchInputInForm(form: HTMLFormElement): HTMLInputElement | null {
    for (const selector of this.searchSelectors) {
      const input = form.querySelector(selector) as HTMLInputElement;
      if (input) return input;
    }
    return null;
  }

  private getSearchContext(input: HTMLInputElement): string {
    const form = input.closest('form');
    const section = input.closest('section, nav, header, main, aside');
    
    if (form?.id) return form.id;
    if (section?.className) return section.className.split(' ')[0];
    
    return 'global';
  }

  private findContentElement(element: Element): Element | null {
    const contentSelectors = [
      'article',
      '.post',
      '.blog-post',
      '.news-item',
      '.product',
      '.product-card',
      '.card',
      '.item',
      '.content-item',
      '[data-content-type]'
    ];

    // Check if element itself is content
    for (const selector of contentSelectors) {
      if (element.matches(selector)) return element;
    }

    // Check ancestors
    for (const selector of contentSelectors) {
      const contentElement = element.closest(selector);
      if (contentElement) return contentElement;
    }

    return null;
  }

  private analyzeContentElement(element: Element): ContentAnalysis {
    const title = this.extractTitle(element);
    const id = element.id || element.getAttribute('data-id') || undefined;
    const type = this.determineContentType(element);
    const category = element.getAttribute('data-category') || undefined;
    
    return {
      type,
      title,
      id,
      category,
      context: this.getElementContext(element)
    };
  }

  private extractTitle(element: Element): string | undefined {
    // Try various title selectors
    const titleSelectors = ['h1', 'h2', 'h3', '.title', '.headline', '[data-title]'];
    
    for (const selector of titleSelectors) {
      const titleElement = element.querySelector(selector);
      if (titleElement) {
        return titleElement.textContent?.trim().slice(0, 100);
      }
    }
    
    // Fallback to element's own text
    return element.textContent?.trim().slice(0, 100);
  }

  private determineContentType(element: Element): string {
    const className = element.className.toLowerCase();
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'article' || className.includes('post') || className.includes('article')) {
      return 'article';
    }
    if (className.includes('product')) return 'product';
    if (className.includes('news')) return 'news';
    if (className.includes('blog')) return 'blog';
    if (className.includes('video')) return 'video';
    if (className.includes('image') || className.includes('photo')) return 'image';
    
    return 'content';
  }

  private getElementContext(element: Element): string {
    const section = element.closest('section, nav, header, main, aside, footer');
    if (section?.id) return section.id;
    if (section?.className) return section.className.split(' ')[0];
    
    return 'unknown';
  }

  cleanup(): void {
    // Clear any pending hover timeouts
    this.hoverTimeouts = new WeakMap();
  }
}

interface ElementAnalysis {
  type: string;
  text: string;
  url: string | null;
  id?: string;
  classes?: string;
  isClickable: boolean;
  isInteractive: boolean;
  isExternalLink: boolean;
  linkCategory?: string;
}

interface ContentAnalysis {
  type: string;
  title?: string;
  id?: string;
  category?: string;
  context: string;
} 