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
| `init(config)` | Set your apiKey for identification (workspace is optional) |
| `identify(traits)` | Attach metadata to the current visitor (ID auto-generated & persisted) |
| `track(code, props)` | Track named events (e.g. form_submitted, page_view) |
| `log(type, data)` | Save micro-interactions like hovers or scrolls (local only) |
| `flush()` | Force-send any pending events and logs |

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

## 📄 License

MIT — built with ✨ by orwel.io


