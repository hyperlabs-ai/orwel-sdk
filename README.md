# 🛰️ Orwel SDK

[![npm version](https://badge.fury.io/js/orwel.svg)](https://www.npmjs.com/package/orwel)
[![GitHub](https://img.shields.io/github/license/hyperlabs-ai/orwel-sdk)](https://github.com/hyperlabs-ai/orwel-sdk)
[![npm downloads](https://img.shields.io/npm/dm/orwel)](https://www.npmjs.com/package/orwel)

**Orwel** is a lightweight, JavaScript SDK for tracking frontend events, visitor traits, and UX signals — all from a simple script or npm install. Designed for marketing teams and product analysts who want real-time visibility into their funnel.

---

## 🚀 Quickstart (via npm)

```bash
npm install orwel
```

## 🔑 Key Concepts

Before diving into the implementation, it's important to understand some key concepts:

### Singleton Pattern
Orwel uses a singleton pattern, meaning there's only one instance of the SDK throughout your application. You don't need to create new instances with `new Orwel()` - instead, you import the pre-configured instance and initialize it:

```ts
import { orwel } from 'orwel'

// Initialize as early as possible in your application
orwel.init({
  apiKey: 'orwel_xxxxxxxxxxxxx',
  autoMonitor: true, // optional: automatically enable all monitoring features
})
```

### Initialization Timing
The `init()` call should be placed:
- **React**: In your root component (e.g., `App.js`) or initialization component
- **Next.js**: In `_app.js` or root layout
- **Vue**: In `main.js` before mounting the app
- **Svelte**: In `src/routes/+layout.svelte` or `src/routes/+page.svelte`
- **Plain HTML**: In `<head>` or early in `<body>`

### State Management
Once initialized:
- Configuration is stored in memory and persists throughout the session
- Visitor data is stored in localStorage/cookies for cross-session persistence
- You can import and use `orwel` from any file without re-initialization

## 💡 Usage Examples

### Basic Event Tracking
```ts
// Track a simple event
orwel.track('button_clicked')

// Track with properties
orwel.track('form_submitted', {
  form_id: 'contact',
  time_to_complete: 45,
  errors_count: 0
})
```

## 🎯 Event Types & Tracking

Events in Orwel are not random strings - they follow a predefined schema to ensure consistency and enable powerful analytics:

### Standard Events
A comprehensive list of standard events is available at [orwel.io/events](https://orwel.io/events). These events are optimized for common tracking scenarios:

```typescript
// User interaction events
orwel.track('button_click', { button_id: 'submit_form' })
orwel.track('page_view', { path: '/checkout' })
orwel.track('form_submit', { form_name: 'signup' })

// E-commerce events
orwel.track('product_view', { product_id: '123', price: 99.99 })
orwel.track('add_to_cart', { product_id: '123', quantity: 1 })
orwel.track('checkout_complete', { order_id: 'ORDER123' })

// Subscription events
orwel.track('subscription_started', { plan: 'pro', method: 'stripe' })
orwel.track('subscription_cancelled', { reason: 'cost' })
```

### Custom Events
For unique tracking needs, you can use:

1. **Custom Event Type**:
```typescript
orwel.track('custom_event', {
  event_category: 'my_feature',
  event_action: 'special_action',
  // ... custom properties
})
```

2. **Event Aliases**:
You can create aliases for frequently used custom events in your Orwel dashboard:
```typescript
// After creating alias 'special_action' for 'custom_event'
orwel.track('special_action', {
  // ... your properties
})
```

### Best Practices
- Use standard events when possible for better analytics integration
- Keep event names in snake_case format
- Document custom events and their expected properties
- Use consistent property names across similar events
- Avoid sending sensitive data in event properties

### Visitor Identification
```ts
orwel.identify({
  // id is auto-generated and persisted if not provided
  email: 'lucas@acme.com',
  plan: 'pro',
  company: 'Acme Inc',
  subscription_status: 'active'
})
```

### Lead Generation
```ts
// Capture conversions with specific event codes
orwel.conversion('newsletter_signup', {
  email: 'user@example.com',
  source: 'landing_page',
  campaign: 'winter_sale'
})

// Demo request conversion
orwel.conversion('demo_request', {
  company: 'Acme Corp',
  phone: '+1234567890',
  interest: 'enterprise'
})

// Contact form conversion
orwel.conversion('contact_form', {
  name: 'John Doe',
  email: 'john@company.com',
  message: 'Interested in your services'
})
```

## 👤 Visitor Management

The SDK automatically manages visitor identification and persistence. Here's how it works:

### Visitor Lifecycle

1. **Initial Visit**: When the SDK initializes, it automatically:
   - Generates a unique visitor ID if none exists
   - Stores it in localStorage under `__orwel_visitor__`
   - Collects basic browser information

2. **Identifying Visitors**: Use `identify()` to attach traits to the visitor:
```typescript
// Returns { success: true, visitorId: 'generated-uuid' }
const result = orwel.identify({
  email: 'user@example.com',
  plan: 'pro'
})
```

### Automatic Data Collection

When calling `identify()`, the SDK automatically collects and merges:
- Browser information
- User agent details
- Language preferences
- Platform information

These are merged with your provided traits, but your explicit values take precedence.

### Storage & Persistence

- Visitor data is stored in localStorage
- Persists across page reloads and browser sessions
- Automatically loaded when SDK initializes
- Synced with server on identify calls

### Implementation Details

The visitor manager:
1. Loads existing visitor data on init
2. Generates UUID for new visitors
3. Merges browser info with provided traits
4. Persists data to localStorage
5. Queues identify event for server sync

## 🎯 Conversion Tracking

Conversion tracking allows you to capture potential customers and prospects with structured data collection. Unlike visitor identification, conversions are independent entities with their own unique identifiers.

### Conversion vs Identify

| Feature | `identify()` | `conversion()` |
|---------|-------------|----------|
| **Purpose** | Update current visitor traits | Capture conversion information |
| **Persistence** | Saves to visitor profile | Independent conversion record |  
| **ID Generation** | Uses visitor ID | Generates unique conversion ID |
| **Event Type** | `identify` | `conversion` |
| **Use Cases** | User login, profile updates | Forms, newsletters, demos |

### Conversion Event Structure

When you call `orwel.conversion()`, it generates an event with this structure:

```typescript
{
  type: 'conversion',
  code: 'newsletter_signup',  // The event code you provided
  properties: {
    id: 'conversion-uuid-generated',  // Unique conversion identifier
    email: 'user@example.com',
    source: 'landing_page',
    // ... other properties + browser info
  },
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

### Common Conversion Types

```typescript
// Newsletter subscription
orwel.conversion('newsletter_signup', {
  email: 'user@example.com',
  source: 'footer_form',
  interests: ['product_updates', 'marketing']
})

// Demo request
orwel.conversion('demo_request', {
  company: 'Tech Corp',
  email: 'contact@techcorp.com',
  phone: '+1-555-0123',
  employees: '50-100',
  use_case: 'customer_analytics'
})

// Contact form
orwel.conversion('contact_form', {
  name: 'Sarah Johnson',
  email: 'sarah@company.com',
  subject: 'Partnership Inquiry',
  message: 'We would like to discuss...'
})

// Whitepaper download
orwel.conversion('whitepaper_download', {
  email: 'reader@example.com',
  title: 'State of Analytics 2024',
  job_title: 'Data Analyst',
  company_size: '100-500'
})
```

### Automatic Data Collection

The `conversion()` method automatically collects and merges:
- Browser information (user agent, language, platform)
- Page context (URL, referrer, timestamp)
- Session data when available

### Best Practices

- **Use descriptive codes**: `newsletter_signup`, `demo_request`, `contact_form`
- **Consistent naming**: Use snake_case for event codes
- **Required fields**: Always include essential contact information (email, phone, etc.)
- **Source tracking**: Include `source`, `campaign`, `medium` for attribution
- **Progressive profiling**: Capture additional data over time, not all at once
- **GDPR compliance**: Respect privacy preferences and consent management

### Session Management
```ts
// Store performance metrics and other data in the session
orwel.session({
  currentPage: 'homepage',
  experimentGroup: 'B',
  userPreferences: {
    theme: 'dark',
    language: 'en'
  }
})
```

### Application Monitoring
```ts
// Enable all monitoring features
orwel.monitor()

// Or customize monitoring options
orwel.monitor({
  performance: true,   // Page load and navigation timing
  errors: true,        // JavaScript errors and unhandled rejections
  console: true,       // Console errors and warnings
  network: false       // XHR and Fetch API calls
})
```

## 🚀 Batch Processing

The SDK automatically batches events for optimal performance:

```typescript
// Multiple events are queued and sent together
orwel.track('page_view', { path: '/dashboard' });
orwel.track('button_click', { buttonId: 'cta-header' });
orwel.conversion('newsletter_signup', { email: 'user@example.com' });

// Events are automatically batched and sent in a single HTTP request
// Or manually flush the queue
const result = await orwel.flush();
console.log(`Sent ${result.count} events in batch`);
```

### Batch Benefits
- **Performance**: 5-10x faster than individual requests
- **Network**: 90% reduction in HTTP requests
- **Server Load**: Reduced connection overhead
- **Reliability**: Automatic fallback to individual sends if batch fails

## 🔗 Quickstart (via CDN)

```html
<script src="https://cdn.orwel.io/orwel.js"></script>
<script>
  orwel.init({ apiKey: 'pk_live_abc123' })
  orwel.track('page_view', { url: window.location.pathname })
</script>
```

## 🧠 Available Methods

| Method | Description | Best Practices |
|--------|-------------|----------------|
| `init(config)` | Set your apiKey for identification | Call as early as possible in your app lifecycle. Required before using other methods. |
| `identify(traits)` | Attach metadata to the current visitor | Call after user authentication or when user data becomes available. Persists across sessions. |
| `lead(code, properties)` | Capture lead information with event code | Use for newsletter signups, demo requests, contact forms. Each lead gets unique ID. |
| `track(code, props)` | Track named events | Use consistent event names. Include relevant properties for analysis. |
| `session(props, final?)` | Store session data | Use for temporary state that shouldn't persist across sessions. Automatically included with events. Set `final=true` for session end. |
| `form(element, options)` | Track form interactions | Connect to important forms to capture user interaction data, submissions, and abandonment. |
| `monitor(options)` | Enable monitoring features | Enable early to catch all relevant metrics. Consider performance impact of enabled features. |
| `flush()` | Force-send pending events | Called automatically on page unload. Manual calls rarely needed. |

## 📝 Form Tracking

The SDK provides comprehensive form tracking capabilities to give you insights into how users interact with your forms.

### Form Tracking Setup

```javascript
// Get a reference to your form
const signupForm = document.getElementById('signup-form');

// Start tracking the form
orwel.form(signupForm, {
  formId: 'user_signup',               // Unique identifier for the form
  trackFocus: true,                    // Track when fields are focused
  trackInput: true,                    // Track when users enter data in fields
  trackChange: true,                   // Track when field values change
  trackSubmit: true,                   // Track form submissions
  trackAbandon: true,                  // Track when users abandon forms
  autoUntrack: true,                   // Automatically stop tracking when form is removed/hidden (default: true)
  submitCallback: (result) => {        // Optional callback after submission
    if (result.success) {
      // Form submission successful
    } else {
      // Form submission failed
      console.error(result.error);
    }
  }
});
```

### Form Events

The form tracker generates the following events:

| Event | Description | Key Properties |
|-------|-------------|----------------|
| `form_focus` | User focused on a form field | `form_id`, `field_id`, `field_name`, `field_type` |
| `form_input` | User entered data in a form field | `form_id`, `field_id`, `field_name`, `field_type`, `has_value` |
| `form_change` | User changed a form field value | `form_id`, `field_id`, `field_name`, `field_type` |
| `form_submit_attempt` | User attempted to submit the form | `form_id`, `form_fields_count`, `fields_filled_count`, `time_on_form_ms` |
| `form_submit_success` | Form submitted successfully | `form_id`, `form_fields_count`, `fields_filled_count`, `time_on_form_ms` |
| `form_submit_error` | Form submission failed | `form_id`, `validation_failed`, `invalid_fields`, `error_message` |
| `form_abandon` | User abandoned form before completing | `form_id`, `fields_started`, `fields_changed`, `time_on_form_ms`, `time_since_last_interaction_ms` |

### Form Tracking Best Practices

- Add form tracking early in your page lifecycle
- Use consistent `formId` values across your application
- Track critical forms (signup, checkout, contact, etc.)
- Analyze form abandonment to identify UX problems
- Optimize forms based on field interaction data
- Monitor submission errors to fix validation issues
- The `autoUntrack` option is enabled by default and will automatically stop tracking forms that are:
  - Removed from the DOM
  - Hidden or not visible for more than 10 seconds
  - When navigating to other pages

### Form Abandonment

The SDK automatically tracks form abandonment when a user:
- Spends at least 10 seconds on the form
- Interacts with the form in the last 30 minutes
- Has filled at least one field
- Has changed at least one field

## 🔍 Monitoring Features

The SDK includes comprehensive application monitoring that can be enabled with one line of code. Each feature is designed to have minimal performance impact and can be enabled/disabled independently.

### Performance Monitoring
Automatically tracks:
- Navigation Timing API metrics
- Resource loading performance
- Paint timing (FP, FCP)
- Custom performance marks/measures

```javascript
// Example: Track custom performance mark
performance.mark('feature_loaded')
```

### Web Vitals Monitoring
**Note: Web Vitals monitoring is implemented but not automatically enabled with `monitor()`. It requires manual setup.**

Core Web Vitals tracked:
- LCP (Largest Contentful Paint)
  - Good: < 2.5s
  - Needs Improvement: 2.5s - 4s
  - Poor: > 4s
- FID (First Input Delay)
  - Good: < 100ms
  - Needs Improvement: 100ms - 300ms
  - Poor: > 300ms
- CLS (Cumulative Layout Shift)
  - Good: < 0.1
  - Needs Improvement: 0.1 - 0.25
  - Poor: > 0.25

### Error Monitoring
Captures:
- Uncaught JavaScript errors
- Unhandled promise rejections
- Stack traces and error context
- Source file and line numbers

Best practices:
```javascript
try {
  // Your code
} catch (error) {
  // Orwel automatically captures these
  console.error('Operation failed:', error)
}
```

### Console Monitoring
Tracks:
- `console.error()` calls
- `console.warn()` calls
- Automatic deduplication
- Rate limiting to prevent flooding

### Network Monitoring
Captures:
- XHR/Fetch requests
- Response times
- Status codes
- Request/response sizes
- Automatic correlation with events

## 📊 Automatic Data Collection

The SDK automatically collects contextual data when you call `identify()`:

### Browser & Platform
```javascript
// Automatically collected - no code required
{
  userAgent: "Mozilla/5.0...",
  language: "en-US",
  platform: "MacIntel",
  doNotTrack: "1",
  browserName: "Chrome",
  browserVersion: "91.0.4472.124"
}
```

### Screen & Window
```javascript
// Automatic collection
{
  screenWidth: 1920,
  screenHeight: 1080,
  colorDepth: 24,
  pixelRatio: 2,
  viewportWidth: 1200,
  viewportHeight: 800
}
```

### Device Capabilities
```javascript
// Automatic collection
{
  touchscreen: true,
  darkMode: false,
  online: true,
  connectionType: "4g",
  memory: "8GB",
  cpuCores: 8
}
```

## 💾 Offline & Resilient

The SDK implements several strategies to ensure data reliability:

### Event Queue
- Events are stored in localStorage when offline
- Automatic retry with exponential backoff
- Queue persistence across page reloads
- Automatic queue cleanup

### Session Handling
- Unique session IDs per browser session
- Automatic session recovery after crashes
- Session data persistence in localStorage
- Merge strategy for concurrent updates

### Visitor Identification
- Anonymous visitor IDs (UUID v4)
- Cross-session visitor tracking
- Privacy-compliant tracking
- Automatic ID management

## 🔧 Configuration Options

```javascript
orwel.init({
  // Required
  apiKey: 'your-orwel-api-key',

  // Optional features
  autoMonitor: true,            // Enable all monitoring
  autoEventDetection: true,     // Enable automatic event detection
  debug: false,                 // Enable debug logging
  verbose: false,               // Enable verbose logging
  
  // Auto event detection options
  eventDetectionOptions: {
    enabledCategories: ['auth', 'ecommerce', 'navigation', 'form'],
    confidenceThreshold: 0.7
  }
});
```

## 🚀 Session Tracking

Sessions are a core concept in Orwel, providing a way to group related events and metrics:

### Session Lifecycle
1. **Creation**: New session on SDK initialization
2. **Updates**: Through `session()` method calls
3. **Expiration**: After inactivity timeout
4. **Termination**: On page unload

### Session Data
```javascript
// Add custom data - merges with existing
orwel.session({
  userPreferences: {
    theme: 'dark',
    fontSize: 'large'
  },
  abTests: {
    newHeader: 'variant_b',
    checkoutFlow: 'two_step'
  }
});

// Update specific values
orwel.session({
  activePage: 'checkout',
  cartValue: 99.99
});
```

### Automatic Collection
When monitoring is enabled, sessions automatically include:
- Page load metrics
- Resource timing
- Error counts
- Network activity
- Memory usage
- Web Vitals

### Session Events
The SDK automatically tracks session lifecycle:
1. **Session Start**: Initial creation
2. **Session Updates**: Property changes
3. **Session End**: Clean termination
4. **Session Timeout**: Inactivity detection

## 🔒 Privacy & Security

The SDK implements several privacy and security measures:

### Data Collection
- Respects Do Not Track
- No PII collection by default
- Configurable data retention
- Data minimization

### Security
- HTTPS-only API endpoints
- API key validation
- Rate limiting
- Request signing

### Compliance
- GDPR-ready
- CCPA-compliant
- Cookie law compatible
- Privacy policy friendly

## ⚠️ Current Limitations

While the SDK is fully functional, some features are implemented but not yet integrated:

### Not Currently Available in `monitor()`:
- **Web Vitals Monitoring**: Implementation exists but requires manual setup
- **Memory Monitoring**: Implementation exists but not integrated in monitoring system

### Available Monitoring Features:
- ✅ Performance monitoring (Navigation, Resource timing)
- ✅ Error monitoring (JS errors, Promise rejections)
- ✅ Console monitoring (errors, warnings)
- ✅ Network monitoring (XHR, Fetch requests)

## 📄 License

MIT — built with ✨ by orwel.io

## 🤝 Support

Need help? Check out:
- [Documentation](https://docs.orwel.io)
- [API Reference](https://api.orwel.io)
- [GitHub Issues](https://github.com/hyperlabs-ai/orwel-sdk/issues)
- [Community Forum](https://community.orwel.io)


