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
| `log(type, data)` | Save micro-interactions like hovers or scrolls (local only) |
| `monitor(options)` | Enable performance, error, console, network and memory monitoring |
| `flush()` | Force-send any pending events and logs |

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
- Micro-events via log() are stored locally and batched on next flush()
- Automatic flush() on beforeunload and visibilitychange
- Visitor IDs are automatically generated and persisted across sessions

## 📡 Endpoint

All events are sent to:

```
POST https://api.orwel.io/ingest
```

with your API key in the X-Orwel-Key header.

## 🔧 Configuration Options

```javascript
orwel.init({
  apiKey: 'your-orwel-api-key',       // Required: Your Orwel API key
  workspace: 'workspace-id',   // Optional: Identifier for your app
  autoMonitor: true,            // Optional: Auto-enable monitoring
  // Any additional custom configuration parameters
});
```

## 📄 License

MIT — built with ✨ by orwel.io


