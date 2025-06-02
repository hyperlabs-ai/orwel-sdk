import { DetectionStrategy, DetectionContext, DetectionResult } from '../../types';
import { createLogger } from '../../utils';

/**
 * Detection strategy for ecommerce-related events
 */
export class EcommerceDetectionStrategy implements DetectionStrategy {
  readonly category = 'ecommerce' as const;
  private cartObserver?: MutationObserver;
  private productPageDetected = false;

  constructor(
    readonly eventCode: string,
    private logger: ReturnType<typeof createLogger>
  ) {
    this.setupCartMonitoring();
    this.detectProductPage();
  }

  detect(context: DetectionContext): DetectionResult | null {
    if (!context.element || !context.event) return null;

    switch (this.eventCode) {
      case 'add_to_cart':
        return this.detectAddToCart(context);
      case 'remove_from_cart':
        return this.detectRemoveFromCart(context);
      case 'view_cart':
        return this.detectViewCart(context);
      case 'begin_checkout':
        return this.detectBeginCheckout(context);
      case 'checkout_progress':
        return this.detectCheckoutProgress(context);
      case 'add_shipping_info':
        return this.detectShippingInfo(context);
      case 'add_payment_info':
        return this.detectPaymentInfo(context);
      case 'purchase':
        return this.detectPurchase(context);
      case 'view_item':
        return this.detectViewItem(context);
      case 'view_item_list':
        return this.detectViewItemList(context);
      case 'select_item':
        return this.detectSelectItem(context);
      default:
        return null;
    }
  }

  private detectAddToCart(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (event?.type !== 'click' || !element) return null;

    // Detect "Add to Cart" buttons
    if (this.isAddToCartButton(element)) {
      const productData = this.extractProductData(element);
      
      return {
        eventCode: 'add_to_cart',
        confidence: 0.95,
        data: {
          ...productData,
          button_text: element.textContent?.trim().slice(0, 50),
          click_coordinates: this.getClickCoordinates(event as MouseEvent)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectRemoveFromCart(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (event?.type !== 'click' || !element) return null;

    if (this.isRemoveFromCartButton(element)) {
      const cartItem = this.findCartItem(element);
      const productData = cartItem ? this.extractProductDataFromCartItem(cartItem) : {};

      return {
        eventCode: 'remove_from_cart',
        confidence: 0.9,
        data: {
          ...productData,
          button_text: element.textContent?.trim().slice(0, 50),
          cart_context: this.getCartContext(element)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectViewCart(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    // Detect when user navigates to cart page
    if (event?.type === 'click' && element && this.isCartLink(element)) {
      return {
        eventCode: 'view_cart',
        confidence: 0.9,
        data: {
          navigation_source: 'link_click',
          link_text: element.textContent?.trim().slice(0, 50)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Detect cart page by URL
    if (this.isCartPage() && !this.hasTrackedCartView()) {
      this.markCartViewTracked();
      return {
        eventCode: 'view_cart',
        confidence: 0.8,
        data: {
          navigation_source: 'url_navigation',
          cart_items_count: this.getCartItemsCount()
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectBeginCheckout(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (event?.type !== 'click' || !element) return null;

    if (this.isCheckoutButton(element)) {
      return {
        eventCode: 'begin_checkout',
        confidence: 0.95,
        data: {
          cart_items_count: this.getCartItemsCount(),
          cart_total: this.getCartTotal(),
          checkout_button_text: element.textContent?.trim().slice(0, 50)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Detect checkout page by URL
    if (this.isCheckoutPage() && !this.hasTrackedCheckoutBegin()) {
      this.markCheckoutBeginTracked();
      return {
        eventCode: 'begin_checkout',
        confidence: 0.8,
        data: {
          navigation_source: 'url_navigation',
          cart_items_count: this.getCartItemsCount()
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectCheckoutProgress(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    // Detect form submission in checkout flow
    if (event?.type === 'submit' && element && this.isCheckoutForm(element as HTMLFormElement)) {
      const step = this.determineCheckoutStep(element as HTMLFormElement);
      
      return {
        eventCode: 'checkout_progress',
        confidence: 0.9,
        data: {
          checkout_step: step,
          form_id: (element as HTMLFormElement).id || undefined,
          fields_completed: this.getCompletedFieldsCount(element as HTMLFormElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectShippingInfo(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'submit' && element && this.isShippingForm(element as HTMLFormElement)) {
      return {
        eventCode: 'add_shipping_info',
        confidence: 0.95,
        data: {
          form_type: 'shipping',
          shipping_method: this.getSelectedShippingMethod(element as HTMLFormElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectPaymentInfo(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'submit' && element && this.isPaymentForm(element as HTMLFormElement)) {
      return {
        eventCode: 'add_payment_info',
        confidence: 0.95,
        data: {
          form_type: 'payment',
          payment_method: this.getSelectedPaymentMethod(element as HTMLFormElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectPurchase(context: DetectionContext): DetectionResult | null {
    // Detect purchase confirmation page
    if (this.isPurchaseConfirmationPage() && !this.hasTrackedPurchase()) {
      this.markPurchaseTracked();
      
      const orderData = this.extractOrderData();
      
      return {
        eventCode: 'purchase',
        confidence: 0.9,
        data: {
          ...orderData,
          confirmation_source: 'page_detection'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectViewItem(context: DetectionContext): DetectionResult | null {
    // Detect product page view
    if (this.isProductPage() && !this.productPageDetected) {
      this.productPageDetected = true;
      
      const productData = this.extractProductDataFromPage();
      
      return {
        eventCode: 'view_item',
        confidence: 0.85,
        data: {
          ...productData,
          view_source: 'page_navigation'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectViewItemList(context: DetectionContext): DetectionResult | null {
    // Detect category/collection pages
    if (this.isProductListPage() && !this.hasTrackedItemList()) {
      this.markItemListTracked();
      
      return {
        eventCode: 'view_item_list',
        confidence: 0.8,
        data: {
          list_type: this.getListType(),
          items_count: this.getVisibleProductsCount(),
          category: this.extractCategoryFromUrl()
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectSelectItem(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    if (event?.type !== 'click' || !element) return null;

    const productElement = this.findProductElement(element);
    if (productElement) {
      const productData = this.extractProductDataFromElement(productElement);
      
      return {
        eventCode: 'select_item',
        confidence: 0.85,
        data: {
          ...productData,
          selection_context: this.getSelectionContext(element),
          list_position: this.getProductPosition(productElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  // Helper methods for detection
  private isAddToCartButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    
    const addToCartPatterns = [
      'add to cart', 'add to bag', 'add item', 'añadir al carrito',
      'agregar al carrito', 'add-to-cart', 'addtocart'
    ];
    
    return addToCartPatterns.some(pattern => 
      text.includes(pattern) || className.includes(pattern.replace(/\s/g, '-')) || id.includes(pattern.replace(/\s/g, '-'))
    );
  }

  private isRemoveFromCartButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    
    const hasRemoveText = text.includes('remove') || text.includes('delete') || text.includes('eliminar');
    const hasRemoveClass = className.includes('remove') || className.includes('delete');
    const hasRemoveLabel = element.getAttribute('aria-label')?.toLowerCase().includes('remove');
    const isSvgRemove = element.tagName === 'SVG' && !!element.closest('[aria-label*="remove"]');
    
    return hasRemoveText || hasRemoveClass || !!hasRemoveLabel || isSvgRemove;
  }

  private isCartLink(element: Element): boolean {
    const href = element.getAttribute('href')?.toLowerCase() || '';
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    
    return href.includes('cart') || href.includes('bag') ||
           text.includes('cart') || text.includes('bag') ||
           className.includes('cart') || className.includes('bag');
  }

  private isCheckoutButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    
    const checkoutPatterns = ['checkout', 'proceed', 'continue', 'finalizar compra'];
    
    return checkoutPatterns.some(pattern => 
      text.includes(pattern) || className.includes(pattern)
    );
  }

  private extractProductData(element: Element): Record<string, any> {
    const productContainer = this.findProductContainer(element);
    if (!productContainer) return {};

    return {
      product_id: this.extractProductId(productContainer),
      product_name: this.extractProductName(productContainer),
      product_price: this.extractProductPrice(productContainer),
      product_category: this.extractProductCategory(productContainer),
      product_brand: this.extractProductBrand(productContainer)
    };
  }

  private findProductContainer(element: Element): Element | null {
    const productSelectors = [
      '.product', '.item', '.product-card', '.product-item',
      '[data-product]', '[data-product-id]', 'article'
    ];

    for (const selector of productSelectors) {
      const container = element.closest(selector);
      if (container) return container;
    }

    return null;
  }

  private extractProductId(container: Element): string | undefined {
    return container.getAttribute('data-product-id') ||
           container.getAttribute('data-id') ||
           container.id ||
           undefined;
  }

  private extractProductName(container: Element): string | undefined {
    const nameSelectors = [
      '.product-name', '.item-name', '.title', 'h1', 'h2', 'h3',
      '[data-product-name]', '.product-title'
    ];

    for (const selector of nameSelectors) {
      const nameElement = container.querySelector(selector);
      if (nameElement) {
        return nameElement.textContent?.trim().slice(0, 100);
      }
    }

    return undefined;
  }

  private extractProductPrice(container: Element): string | number | undefined {
    const priceSelectors = [
      '.price', '.cost', '.amount', '[data-price]', '.product-price'
    ];

    for (const selector of priceSelectors) {
      const priceElement = container.querySelector(selector);
      if (priceElement) {
        const priceText = priceElement.textContent?.trim() || '';
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        return priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : priceText;
      }
    }

    return undefined;
  }

  // URL detection methods
  private isProductPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/product') || path.includes('/item') || 
           path.includes('/p/') || !!path.match(/\/products\/[^\/]+$/);
  }

  private isCartPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/cart') || path.includes('/bag') || 
           path.includes('/shopping-cart');
  }

  private isCheckoutPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/checkout') || path.includes('/order') ||
           path.includes('/payment') || path.includes('/billing');
  }

  private isPurchaseConfirmationPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    const content = document.body.textContent?.toLowerCase() || '';
    
    return path.includes('/confirmation') || path.includes('/success') ||
           path.includes('/thank-you') || path.includes('/order-complete') ||
           content.includes('order confirmed') || content.includes('purchase complete');
  }

  private isProductListPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/category') || path.includes('/collection') ||
           path.includes('/products') || path.includes('/shop');
  }

  // Tracking state management
  private hasTrackedCartView(): boolean {
    return (window as any).__orwelCartViewTracked || false;
  }

  private markCartViewTracked(): void {
    (window as any).__orwelCartViewTracked = true;
  }

  private getClickCoordinates(event: MouseEvent): { x: number; y: number } {
    return { x: event.clientX, y: event.clientY };
  }

  private setupCartMonitoring(): void {
    // Monitor DOM changes for cart updates
    if (typeof MutationObserver !== 'undefined') {
      this.cartObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          // Could implement cart quantity change detection here
        });
      });
    }
  }

  private detectProductPage(): void {
    // Called on construction to detect if we're already on a product page
    if (this.isProductPage()) {
      setTimeout(() => {
        // Small delay to ensure page is fully loaded
        this.productPageDetected = false; // Reset so detection can fire
      }, 100);
    }
  }

  // Placeholder implementations for additional methods
  private findCartItem(element: Element): Element | null { return null; }
  private extractProductDataFromCartItem(item: Element): Record<string, any> { return {}; }
  private getCartContext(element: Element): string { return 'cart'; }
  private getCartItemsCount(): number { return 0; }
  private getCartTotal(): number | undefined { return undefined; }
  private hasTrackedCheckoutBegin(): boolean { return false; }
  private markCheckoutBeginTracked(): void {}
  private isCheckoutForm(form: HTMLFormElement): boolean { return false; }
  private determineCheckoutStep(form: HTMLFormElement): string { return 'unknown'; }
  private getCompletedFieldsCount(form: HTMLFormElement): number { return 0; }
  private isShippingForm(form: HTMLFormElement): boolean { return false; }
  private getSelectedShippingMethod(form: HTMLFormElement): string | undefined { return undefined; }
  private isPaymentForm(form: HTMLFormElement): boolean { return false; }
  private getSelectedPaymentMethod(form: HTMLFormElement): string | undefined { return undefined; }
  private hasTrackedPurchase(): boolean { return false; }
  private markPurchaseTracked(): void {}
  private extractOrderData(): Record<string, any> { return {}; }
  private extractProductDataFromPage(): Record<string, any> { return {}; }
  private hasTrackedItemList(): boolean { return false; }
  private markItemListTracked(): void {}
  private getListType(): string { return 'product_list'; }
  private getVisibleProductsCount(): number { return 0; }
  private extractCategoryFromUrl(): string | undefined { return undefined; }
  private findProductElement(element: Element): Element | null { return null; }
  private extractProductDataFromElement(element: Element): Record<string, any> { return {}; }
  private getSelectionContext(element: Element): string { return 'product_list'; }
  private getProductPosition(element: Element): number | undefined { return undefined; }
  private extractProductCategory(container: Element): string | undefined { return undefined; }
  private extractProductBrand(container: Element): string | undefined { return undefined; }

  cleanup(): void {
    if (this.cartObserver) {
      this.cartObserver.disconnect();
    }
  }
} 