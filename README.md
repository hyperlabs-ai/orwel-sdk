# 🛰️ Orwel SDK

**Orwel** is a lightweight, zero-dependency JavaScript SDK for tracking frontend events, visitor traits, and UX signals — all from a simple script or npm install. Designed for marketing teams and product analysts who want real-time visibility into their funnel.

---

## 🚀 Quickstart (via npm)

```bash
npm install orwel
```
```ts
import { orwel } from 'orwel'

orwel.init({
  apiKey: 'orwel_xxxxxxxxxxxxx',
  // workspace is optional - it can be detected from your API key
  autoMonitor: true, // optional: automatically enable all monitoring features
})

orwel.identify({
  // id is auto-generated and persisted if not provided
  email: 'lucas@acme.com',
  plan: 'pro' // or whatever
})

orwel.track('form_submitted', {
  campaign: 'Spring Launch',
  utm_source: 'google'
})

// Store performance metrics and other data in the session
orwel.session({
  currentPage: 'homepage',
  experimentGroup: 'B'
})

// Enable application monitoring
orwel.monitor()
```

## 🔗 Quickstart (via CDN)

```html
<script src="https://cdn.orwel.io/orwel.js"></script>
<script>
  orwel.init({ apiKey: 'pk_live_abc123' }) // workspace is optional
  orwel.track('page_view', { url: window.location.pathname })
</script>
```

## 🧠 Available methods

| Method | Description |
|--------|-------------|
| `init(config)` | Set your apiKey for identification (workspace is optional, autoMonitor to enable monitoring) |
| `identify(traits)` | Attach metadata to the current visitor (ID auto-generated & persisted) |
| `track(code, props)` | Track named events (e.g. form_submitted, page_view) |
| `session(props)` | Store session data like performance metrics and user preferences |
| `monitor(options)` | Enable performance, error, console, network and memory monitoring |
| `flush()` | Force-send any pending events |

## 🔍 Monitoring Features

The SDK includes comprehensive application monitoring that can be enabled with one line of code:

```javascript
// Enable all monitoring features
orwel.monitor();

// Or selectively enable specific monitoring features
orwel.monitor({
  performance: true,
  errors: true,
  console: true,
  network: true,
  memory: true
});
```

### Performance Monitoring
- Page load timing (navigation, DOM ready, time to first byte)
- First Paint and First Contentful Paint metrics
- Resource loading performance (images, scripts, etc.)
- Navigation types (first load, reload, back/forward)

### Error Monitoring
- JavaScript errors with filename, line number, and stack trace
- Unhandled promise rejections

### Console Monitoring
- Tracks console.error and console.warn calls

### Network Monitoring
- XMLHttpRequest (Ajax) requests
- Fetch API calls
- Request URL, method, status code, and duration
- Success/failure status

### Memory Monitoring
- JavaScript heap usage metrics (Chrome only)

## 📊 Automatic Data Collection

When you call `identify()`, the SDK automatically collects:

### Browser & Platform
- User agent, language, platform/OS
- Do Not Track preference
- Browser and version
- Mobile device detection

### Screen & Window
- Screen dimensions and color depth
- Viewport dimensions
- Device pixel ratio

### Page & Navigation
- Current URL, path, hostname, protocol
- Referrer
- Page title

### Device Capabilities
- Touchscreen support
- Dark mode preference
- Online/offline status
- Connection type and speed

### Hardware
- CPU cores count
- Device memory
- Battery status (collected asynchronously)

### Timezone & Session
- Timezone
- Session start timestamp

## 💾 Offline & Resilient

- Events are queued in localStorage if offline or unloads occur
- Session data is persisted in localStorage
- Automatic flush() on beforeunload and visibilitychange
- Visitor IDs are automatically generated and persisted across sessions
- Session IDs uniquely identify each browser session

## 🔧 Configuration Options

```javascript
orwel.init({
  apiKey: 'your-orwel-api-key',       // Required: Your Orwel API key
  autoMonitor: true,            // Optional: Auto-enable monitoring
  // Any additional custom configuration parameters
});
```

## 🚀 Session Tracking

Orwel automatically stores performance and monitoring metrics in the session:

```javascript
// Add custom data to the session
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

// Data is merged with existing session data
orwel.session({
  activePage: 'checkout',
  cartValue: 99.99
});
```

When monitoring is enabled, the session automatically collects:
- Page load metrics
- Resource timing
- JavaScript errors
- Network requests
- And more

### Automatic Session Events

The SDK automatically sends session events to your backend:

1. **Session Start**: When the SDK initializes and creates a new session
2. **Session Updates**: Every time the `session()` method is called
3. **Session Data with Events**: All session data is included with every tracked event

These session events can be processed on your backend with the type `'session'`, allowing you to:
- Track user session duration
- Monitor session-specific metrics
- Associate metrics with specific sessions
- Analyze performance data across sessions

## 📄 License

MIT — built with ✨ by orwel.io


