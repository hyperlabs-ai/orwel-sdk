/**
 * Validation and IntelliSense Example for Orwel SDK
 * 
 * This example demonstrates the parameter validation and improved
 * TypeScript IntelliSense experience with detailed descriptions.
 */

// Import the Orwel SDK
import { orwel } from '../src/browser';

/**
 * Example demonstrating proper SDK usage with validation
 */
function validationExample() {
  console.log('🛡️ Orwel SDK Validation Examples');
  
  // ========== VALID USAGE EXAMPLES ==========
  
  try {
    // ✅ Valid initialization
    orwel.init({
      apiKey: 'orwel_your_api_key_here_12345',
      debug: true,
      autoMonitor: true
    });
    console.log('✅ SDK initialized successfully');
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
  }
  
  try {
    // ✅ Valid event tracking
    orwel.track('button_click', {
      buttonId: 'cta-header',
      page: '/pricing',
      campaign: 'summer_sale'
    });
    console.log('✅ Event tracked successfully');
  } catch (error) {
    console.error('❌ Event tracking failed:', error.message);
  }
  
  try {
    // ✅ Valid conversion tracking
    orwel.conversion('newsletter_signup', {
      email: 'user@example.com',
      source: 'homepage_banner',
      campaign: 'winter_promo'
    });
    console.log('✅ Conversion tracked successfully');
  } catch (error) {
    console.error('❌ Conversion tracking failed:', error.message);
  }
  
  try {
    // ✅ Valid visitor identification
    orwel.identify({
      email: 'john.doe@company.com',
      name: 'John Doe',
      plan: 'premium',
      company: 'Tech Corp'
    });
    console.log('✅ Visitor identified successfully');
  } catch (error) {
    console.error('❌ Visitor identification failed:', error.message);
  }
  
  // ========== VALIDATION ERROR EXAMPLES ==========
  
  console.log('\n🚨 Testing Parameter Validation:');
  
  // ❌ Invalid API key
  try {
    orwel.init({
      apiKey: 'invalid_key' // Missing 'orwel_' prefix
    });
  } catch (error) {
    console.log('✅ Caught invalid API key:', error.message);
  }
  
  // ❌ Missing required parameters
  try {
    // @ts-expect-error - Testing runtime validation
    orwel.track(); // Missing required 'code' parameter
  } catch (error) {
    console.log('✅ Caught missing code parameter:', error.message);
  }
  
  // ❌ Invalid event code format
  try {
    orwel.track('Invalid-Event-Code!', {}); // Contains invalid characters
  } catch (error) {
    console.log('✅ Caught invalid event code format:', error.message);
  }
  
  // ❌ Invalid email format
  try {
    orwel.conversion('newsletter_signup', {
      email: 'invalid-email-format' // Invalid email
    });
  } catch (error) {
    console.log('✅ Caught invalid email format:', error.message);
  }
  
  // ❌ Invalid data types
  try {
    // @ts-expect-error - Testing runtime validation
    orwel.identify('not an object'); // Should be an object
  } catch (error) {
    console.log('✅ Caught invalid data type:', error.message);
  }
  
  // ❌ Invalid form element
  try {
    // @ts-expect-error - Testing runtime validation
    orwel.form(null); // Null form element
  } catch (error) {
    console.log('✅ Caught null form element:', error.message);
  }
  
  // ❌ Empty event code
  try {
    orwel.track('', {}); // Empty string
  } catch (error) {
    console.log('✅ Caught empty event code:', error.message);
  }
  
  // ❌ Event code too long
  try {
    const longCode = 'a'.repeat(60); // Exceeds 50 character limit
    orwel.track(longCode, {});
  } catch (error) {
    console.log('✅ Caught event code too long:', error.message);
  }
}

/**
 * Example demonstrating IntelliSense features
 * 
 * When you type these methods in your IDE, you should see:
 * - Detailed parameter descriptions
 * - Type information
 * - Usage examples
 * - Return type details
 */
function intelliSenseExample() {
  // Type 'orwel.' to see all available methods with descriptions
  
  // Hover over 'init' to see detailed documentation
  orwel.init({
    apiKey: 'orwel_your_key_here',
    debug: true, // Hover to see what this enables
    autoMonitor: true // Hover to see monitoring features
  });
  
  // Hover over 'track' to see parameter details and examples
  orwel.track('page_view', {
    path: '/dashboard',
    loadTime: 1200
  });
  
  // IntelliSense shows return type and example usage
  const result = orwel.identify({
    email: 'user@example.com' // Email validation happens automatically
  });
  
  // TypeScript knows the return type structure
  console.log(result.success, result.visitorId);
}

/**
 * Common validation patterns and best practices
 */
const validationPatterns = {
  // Event codes should be lowercase with underscores
  validEventCodes: [
    'page_view',
    'button_click', 
    'form_submit',
    'user_signup',
    'purchase_complete'
  ],
  
  // Invalid event codes that will throw errors
  invalidEventCodes: [
    'Page-View',           // Contains hyphens
    'BUTTON_CLICK',        // Uppercase letters
    'form submit',         // Contains spaces
    'user.signup',         // Contains dots
    'purchase_complete!',  // Contains special characters
    '',                    // Empty string
    'a'.repeat(60)         // Too long (>50 chars)
  ],
  
  // API key format requirements
  validApiKeyFormat: 'orwel_followed_by_at_least_15_more_characters',
  
  // Email validation happens automatically in properties
  validEmails: [
    'user@example.com',
    'john.doe+test@company.co.uk',
    'admin@subdomain.example.org'
  ],
  
  invalidEmails: [
    'invalid-email',
    '@example.com',
    'user@',
    'user@.com',
    'user..name@example.com'
  ]
};

/**
 * Type safety examples
 */
function typeSafetyExample() {
  // TypeScript will catch these errors at compile time:
  
  // @ts-expect-error - Wrong parameter type
  // orwel.init('string instead of object');
  
  // @ts-expect-error - Missing required parameter  
  // orwel.track();
  
  // @ts-expect-error - Wrong parameter type
  // orwel.identify(['array', 'instead', 'of', 'object']);
  
  // ✅ Correct usage with full type safety
  const trackResult = orwel.track('user_action', {
    actionType: 'click',
    elementId: 'main-cta',
    timestamp: Date.now()
  });
  
  // TypeScript knows the exact return type
  console.log(trackResult.success); // boolean
  console.log(trackResult.eventId); // string
  
  const identifyResult = orwel.identify({
    userId: '12345',
    email: 'user@example.com',
    preferences: {
      theme: 'dark',
      notifications: true
    }
  });
  
  // TypeScript provides autocomplete and type checking
  if (identifyResult.success) {
    console.log(`Visitor ID: ${identifyResult.visitorId}`);
  }
}

// Execute examples
if (typeof window !== 'undefined') {
  validationExample();
  intelliSenseExample();
  typeSafetyExample();
}

export {
  validationExample,
  intelliSenseExample, 
  typeSafetyExample,
  validationPatterns
}; 