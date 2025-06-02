import { DetectionStrategy, DetectionContext, DetectionResult } from '../../types';
import { createLogger } from '../../utils';

/**
 * Detection strategy for authentication-related events
 */
export class AuthDetectionStrategy implements DetectionStrategy {
  readonly category = 'auth' as const;
  private observedForms = new WeakSet<HTMLFormElement>();

  constructor(
    readonly eventCode: string,
    private logger: ReturnType<typeof createLogger>
  ) {}

  detect(context: DetectionContext): DetectionResult | null {
    if (!context.element || !context.event) return null;

    switch (this.eventCode) {
      case 'login':
        return this.detectLogin(context);
      case 'logout':
        return this.detectLogout(context);
      case 'signup':
        return this.detectSignup(context);
      case 'password_recovery':
        return this.detectPasswordRecovery(context);
      case 'two_factor_auth':
        return this.detectTwoFactorAuth(context);
      case 'social_login':
        return this.detectSocialLogin(context);
      default:
        return null;
    }
  }

  private detectLogin(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    // Form submission detection
    if (event?.type === 'submit' && element && this.isLoginForm(element as HTMLFormElement)) {
      const formData = this.extractLoginFormData(element as HTMLFormElement);
      
      return {
        eventCode: 'login',
        confidence: 0.95,
        data: {
          ...formData,
          submission_method: 'form',
          form_id: (element as HTMLFormElement).id || undefined
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Button click detection
    if (event?.type === 'click' && element && this.isLoginButton(element)) {
      return {
        eventCode: 'login',
        confidence: 0.8,
        data: {
          submission_method: 'button',
          button_text: element.textContent?.trim().slice(0, 50),
          has_form: this.hasNearbyLoginForm(element)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Page-based detection
    if (this.isLoginSuccessPage() && !this.hasTrackedLogin()) {
      this.markLoginTracked();
      return {
        eventCode: 'login',
        confidence: 0.7,
        data: {
          submission_method: 'page_navigation',
          source: 'url_detection'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectLogout(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'click' && element && this.isLogoutButton(element)) {
      return {
        eventCode: 'logout',
        confidence: 0.95,
        data: {
          logout_method: 'button_click',
          button_text: element.textContent?.trim().slice(0, 50),
          button_location: this.getElementLocation(element)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // URL-based logout detection
    if (this.isLogoutUrl() && !this.hasTrackedLogout()) {
      this.markLogoutTracked();
      return {
        eventCode: 'logout',
        confidence: 0.8,
        data: {
          logout_method: 'url_navigation',
          source: 'url_detection'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectSignup(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'submit' && element && this.isSignupForm(element as HTMLFormElement)) {
      const formData = this.extractSignupFormData(element as HTMLFormElement);
      
      return {
        eventCode: 'signup',
        confidence: 0.95,
        data: {
          ...formData,
          submission_method: 'form',
          form_id: (element as HTMLFormElement).id || undefined
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    if (event?.type === 'click' && element && this.isSignupButton(element)) {
      return {
        eventCode: 'signup',
        confidence: 0.8,
        data: {
          submission_method: 'button',
          button_text: element.textContent?.trim().slice(0, 50)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Success page detection
    if (this.isSignupSuccessPage() && !this.hasTrackedSignup()) {
      this.markSignupTracked();
      return {
        eventCode: 'signup',
        confidence: 0.7,
        data: {
          submission_method: 'page_navigation',
          source: 'url_detection'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectPasswordRecovery(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'submit' && element && this.isPasswordRecoveryForm(element as HTMLFormElement)) {
      return {
        eventCode: 'password_recovery',
        confidence: 0.95,
        data: {
          recovery_method: 'form_submission',
          form_type: this.getPasswordRecoveryType(element as HTMLFormElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    if (event?.type === 'click' && element && this.isForgotPasswordLink(element)) {
      return {
        eventCode: 'password_recovery',
        confidence: 0.8,
        data: {
          recovery_method: 'link_click',
          link_text: element.textContent?.trim().slice(0, 50)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectTwoFactorAuth(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'submit' && element && this.isTwoFactorForm(element as HTMLFormElement)) {
      return {
        eventCode: 'two_factor_auth',
        confidence: 0.95,
        data: {
          auth_method: 'form_submission',
          verification_type: this.getTwoFactorType(element as HTMLFormElement)
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    // Page-based detection for 2FA pages
    if (this.isTwoFactorPage() && !this.hasTrackedTwoFactor()) {
      this.markTwoFactorTracked();
      return {
        eventCode: 'two_factor_auth',
        confidence: 0.7,
        data: {
          auth_method: 'page_navigation',
          source: 'url_detection'
        },
        trigger: 'url_change',
        timestamp: Date.now()
      };
    }

    return null;
  }

  private detectSocialLogin(context: DetectionContext): DetectionResult | null {
    const { element, event } = context;
    
    if (event?.type === 'click' && element && this.isSocialLoginButton(element)) {
      const provider = this.extractSocialProvider(element);
      
      return {
        eventCode: 'social_login',
        confidence: 0.9,
        data: {
          provider,
          button_text: element.textContent?.trim().slice(0, 50),
          login_method: 'social_provider'
        },
        trigger: 'dom_event',
        timestamp: Date.now()
      };
    }

    return null;
  }

  // Form detection methods
  private isLoginForm(form: HTMLFormElement): boolean {
    if (this.observedForms.has(form)) return false;
    this.observedForms.add(form);

    const formAction = form.action.toLowerCase();
    const formClass = form.className.toLowerCase();
    const formId = form.id.toLowerCase();
    
    // Check for login-specific patterns
    const loginPatterns = ['login', 'signin', 'sign-in', 'auth', 'authenticate'];
    const hasLoginPattern = loginPatterns.some(pattern => 
      formAction.includes(pattern) || formClass.includes(pattern) || formId.includes(pattern)
    );

    // Check for email/username and password fields
    const hasEmailOrUsername = !!form.querySelector('input[type="email"], input[name*="email"], input[name*="username"], input[name*="user"]');
    const hasPassword = !!form.querySelector('input[type="password"]');
    
    // Check for login-specific button text
    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    const buttonText = submitButton?.textContent?.toLowerCase() || '';
    const hasLoginButton = loginPatterns.some(pattern => buttonText.includes(pattern));

    return hasLoginPattern || (hasEmailOrUsername && hasPassword && hasLoginButton);
  }

  private isSignupForm(form: HTMLFormElement): boolean {
    if (this.observedForms.has(form)) return false;
    this.observedForms.add(form);

    const formAction = form.action.toLowerCase();
    const formClass = form.className.toLowerCase();
    const formId = form.id.toLowerCase();
    
    const signupPatterns = ['signup', 'sign-up', 'register', 'registration', 'create-account'];
    const hasSignupPattern = signupPatterns.some(pattern => 
      formAction.includes(pattern) || formClass.includes(pattern) || formId.includes(pattern)
    );

    // Signup forms typically have more fields than login forms
    const inputFields = form.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]');
    const hasMultipleFields = inputFields.length >= 3;

    // Check for confirmation password field
    const hasPasswordConfirm = !!form.querySelector('input[name*="confirm"], input[name*="repeat"]');

    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    const buttonText = submitButton?.textContent?.toLowerCase() || '';
    const hasSignupButton = signupPatterns.some(pattern => buttonText.includes(pattern));

    return hasSignupPattern || (hasMultipleFields && hasPasswordConfirm) || hasSignupButton;
  }

  private isPasswordRecoveryForm(form: HTMLFormElement): boolean {
    const formAction = form.action.toLowerCase();
    const formClass = form.className.toLowerCase();
    const formId = form.id.toLowerCase();
    
    const recoveryPatterns = ['forgot', 'reset', 'recover', 'recovery'];
    
    return recoveryPatterns.some(pattern => 
      formAction.includes(pattern) || formClass.includes(pattern) || formId.includes(pattern)
    );
  }

  private isTwoFactorForm(form: HTMLFormElement): boolean {
    const formClass = form.className.toLowerCase();
    const formId = form.id.toLowerCase();
    
    const twoFactorPatterns = ['2fa', 'two-factor', 'verification', 'verify', 'otp', 'code'];
    
    // Check for numeric input field (common for verification codes)
    const hasNumericInput = form.querySelector('input[type="number"], input[pattern*="[0-9]"], input[inputmode="numeric"]');
    
    return twoFactorPatterns.some(pattern => 
      formClass.includes(pattern) || formId.includes(pattern)
    ) || !!hasNumericInput;
  }

  // Button detection methods
  private isLoginButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    
    const loginPatterns = ['login', 'sign in', 'signin', 'log in', 'iniciar sesión'];
    
    return loginPatterns.some(pattern => 
      text.includes(pattern) || className.includes(pattern.replace(/\s/g, '-')) || id.includes(pattern.replace(/\s/g, '-'))
    );
  }

  private isLogoutButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    const href = element.getAttribute('href')?.toLowerCase() || '';
    
    const logoutPatterns = ['logout', 'log out', 'sign out', 'signout', 'cerrar sesión'];
    
    return logoutPatterns.some(pattern => 
      text.includes(pattern) || className.includes(pattern.replace(/\s/g, '-')) || href.includes(pattern.replace(/\s/g, '-'))
    );
  }

  private isSignupButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    
    const signupPatterns = ['sign up', 'signup', 'register', 'create account', 'join', 'registrarse'];
    
    return signupPatterns.some(pattern => 
      text.includes(pattern) || className.includes(pattern.replace(/\s/g, '-'))
    );
  }

  private isForgotPasswordLink(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const href = element.getAttribute('href')?.toLowerCase() || '';
    
    const forgotPatterns = ['forgot password', 'reset password', 'forgotten password', 'recover password'];
    
    return forgotPatterns.some(pattern => 
      text.includes(pattern) || href.includes(pattern.replace(/\s/g, '-'))
    );
  }

  private isSocialLoginButton(element: Element): boolean {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    
    const socialProviders = ['google', 'facebook', 'twitter', 'github', 'linkedin', 'apple', 'microsoft'];
    const socialKeywords = ['social', 'oauth', 'sso'];
    
    return socialProviders.some(provider => 
      text.includes(provider) || className.includes(provider) || id.includes(provider)
    ) || socialKeywords.some(keyword => 
      text.includes(keyword) || className.includes(keyword) || id.includes(keyword)
    );
  }

  // URL detection methods
  private isLoginSuccessPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    
    return path.includes('/dashboard') || path.includes('/profile') || 
           path.includes('/account') || hash.includes('login-success');
  }

  private isLogoutUrl(): boolean {
    const path = window.location.pathname.toLowerCase();
    
    return path.includes('/logout') || path.includes('/sign-out') || 
           path.includes('/signout');
  }

  private isSignupSuccessPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    const content = document.body.textContent?.toLowerCase() || '';
    
    return path.includes('/welcome') || path.includes('/signup-success') ||
           content.includes('welcome') || content.includes('registration successful');
  }

  private isTwoFactorPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    
    return path.includes('/2fa') || path.includes('/two-factor') || 
           path.includes('/verify') || path.includes('/verification');
  }

  // Data extraction methods
  private extractLoginFormData(form: HTMLFormElement): Record<string, any> {
    const emailField = form.querySelector('input[type="email"], input[name*="email"]') as HTMLInputElement;
    const usernameField = form.querySelector('input[name*="username"], input[name*="user"]') as HTMLInputElement;
    const rememberMeField = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
    
    return {
      has_email_field: !!emailField,
      has_username_field: !!usernameField,
      has_remember_me: !!rememberMeField,
      field_count: form.querySelectorAll('input').length
    };
  }

  private extractSignupFormData(form: HTMLFormElement): Record<string, any> {
    const fields = form.querySelectorAll('input, select, textarea');
    const passwordFields = form.querySelectorAll('input[type="password"]');
    
    return {
      field_count: fields.length,
      password_fields_count: passwordFields.length,
      has_terms_checkbox: !!form.querySelector('input[type="checkbox"][name*="terms"], input[type="checkbox"][name*="agree"]'),
      has_newsletter_checkbox: !!form.querySelector('input[type="checkbox"][name*="newsletter"], input[type="checkbox"][name*="marketing"]')
    };
  }

  private getPasswordRecoveryType(form: HTMLFormElement): string {
    const emailField = form.querySelector('input[type="email"]');
    const phoneField = form.querySelector('input[type="tel"]');
    
    if (emailField && phoneField) return 'email_and_phone';
    if (emailField) return 'email';
    if (phoneField) return 'phone';
    return 'unknown';
  }

  private getTwoFactorType(form: HTMLFormElement): string {
    const numericInput = form.querySelector('input[type="number"], input[inputmode="numeric"]');
    const textInput = form.querySelector('input[type="text"]');
    
    if (numericInput) return 'numeric_code';
    if (textInput) return 'text_code';
    return 'unknown';
  }

  private extractSocialProvider(element: Element): string {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    
    const providers = ['google', 'facebook', 'twitter', 'github', 'linkedin', 'apple', 'microsoft'];
    
    for (const provider of providers) {
      if (text.includes(provider) || className.includes(provider) || id.includes(provider)) {
        return provider;
      }
    }
    
    return 'unknown';
  }

  // Helper methods
  private hasNearbyLoginForm(element: Element): boolean {
    const form = element.closest('form');
    return form ? this.isLoginForm(form) : false;
  }

  private getElementLocation(element: Element): string {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    if (rect.top < viewportHeight * 0.33) return 'top';
    if (rect.top < viewportHeight * 0.66) return 'middle';
    return 'bottom';
  }

  // Tracking state management
  private hasTrackedLogin(): boolean {
    return (window as any).__orwelLoginTracked || false;
  }

  private markLoginTracked(): void {
    (window as any).__orwelLoginTracked = true;
  }

  private hasTrackedLogout(): boolean {
    return (window as any).__orwelLogoutTracked || false;
  }

  private markLogoutTracked(): void {
    (window as any).__orwelLogoutTracked = true;
  }

  private hasTrackedSignup(): boolean {
    return (window as any).__orwelSignupTracked || false;
  }

  private markSignupTracked(): void {
    (window as any).__orwelSignupTracked = true;
  }

  private hasTrackedTwoFactor(): boolean {
    return (window as any).__orwelTwoFactorTracked || false;
  }

  private markTwoFactorTracked(): void {
    (window as any).__orwelTwoFactorTracked = true;
  }

  cleanup(): void {
    this.observedForms = new WeakSet();
  }
} 