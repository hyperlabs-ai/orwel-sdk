// Test file to verify IntelliSense is working correctly
import { orwel } from 'orwel';
// Alternative imports that should also work:
// import orwel from 'orwel';
// import { orwel, Orwel, Config } from 'orwel';

// Initialize the SDK
orwel.init({
  apiKey: 'orwel_test_key_123456789',
  autoMonitor: true,
  debug: true
});

// Test visitor identification with IntelliSense
const identifyResult = orwel.identify({
  email: 'test@example.com',
  name: 'John Doe',
  plan: 'premium'
});

// Test conversion tracking with IntelliSense
const conversionResult = orwel.conversion('newsletter_signup', {
  source: 'homepage',
  campaign: 'summer_promo'
});

// Test event tracking with IntelliSense
const trackResult = orwel.track('button_click', {
  buttonId: 'cta-header',
  page: '/pricing'
});

// Test session tracking with IntelliSense
const sessionResult = orwel.session({
  currentPage: '/checkout',
  cartTotal: 99.99
});

// Test monitoring with IntelliSense
const monitorResult = orwel.monitor({
  performance: true,
  errors: true,
  webVitals: true
});

// Test form tracking (browser only)
if (typeof document !== 'undefined') {
  const form = document.querySelector('form') as HTMLFormElement;
  if (form) {
    orwel.form(form, {
      trackSubmit: true,
      trackAbandon: true
    });
  }
}

// Test async flush
orwel.flush().then(result => {
  console.log(`Flushed ${result.count} events successfully: ${result.success}`);
});

console.log('All operations completed:', {
  identify: identifyResult,
  conversion: conversionResult,
  track: trackResult,
  session: sessionResult,
  monitor: monitorResult
}); 