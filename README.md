# Orwel SDK

[![npm version](https://badge.fury.io/js/orwel.svg)](https://www.npmjs.com/package/orwel)
[![npm downloads](https://img.shields.io/npm/dm/orwel)](https://www.npmjs.com/package/orwel)

The browser SDK for [Orwel](https://orwel.io), visitor and lead intelligence.
It captures visits, sessions, events and conversions, resolves a stable visitor
id, carries first and last touch attribution (UTMs and ad click ids) and sends
everything to your Orwel workspace.

Current version: **1.7.1**. Full docs: [docs.orwel.io](https://docs.orwel.io).
Step by step install per framework: [orwel.io/install](https://orwel.io/install).

## Install

```bash
npm install orwel@latest
```

Or without a build step:

```html
<script src="https://cdn.jsdelivr.net/npm/orwel@1/dist/orwel.umd.js"></script>
<script>
  orwel.init({ apiKey: 'orwel_pk_...' })
</script>
```

The UMD build attaches the SDK to `window.orwel`.

## Initialize once

The SDK is a singleton. Call `init()` once, in the browser, before any other
call, and import the same instance everywhere else.

```ts
import orwel from 'orwel' // or: import { orwel } from 'orwel'

orwel.init({
  apiKey: import.meta.env.VITE_ORWEL_KEY, // read it from env, never hardcode it
  autoMonitor: true,                       // JS errors, console errors, failed requests, timings
  debug: import.meta.env.DEV               // SDK logs in the browser console
})
```

`init()` takes an object. Passing the key as a plain string throws.

### Which key goes here

| Key | Prefix | Use |
| --- | --- | --- |
| Public key | `orwel_pk_` (older workspaces: `orwel_`) | Production site. Can only send data. |
| Development key | `orwel_dev_` | Local and staging. Data is stored as test data (`is_test`), no notification emails and no integrations, and every request shows up live in Dev mode. |

Both keys are safe in a browser bundle because they can only write. Reading data
(REST API, MCP) uses separate secret API keys (`orwel_sk_`) that you create in
Settings and never ship to the browser.

## Methods

| Method | Returns | What it does |
| --- | --- | --- |
| `init(config)` | `void` | Configure the SDK. Throws on an invalid config. |
| `track(code, props?)` | `{ success, eventId }` | Queue a named event. |
| `identify(traits?)` | `{ success, visitorId }` | Attach traits (email, name, plan...) to the visitor. |
| `conversion(code, props?)` | `Promise<{ success, reason? }>` | Record a conversion and wait for the server to acknowledge it. |
| `session(props?, final?)` | `{ success, sessionId }` | Merge custom properties into the current session. |
| `monitor(options?)` | `{ success }` | Start error, console, network and performance monitoring. |
| `form(element, options?)` | `{ success, error? }` | Observe a form (focus, input, change, submit, abandon). |
| `flush()` | `Promise<{ success, count }>` | Send the queue now. Rarely needed. |

### track

```ts
orwel.track('quote_created', { amount: 1200, currency: 'MXN' })
```

Event codes are `lowercase_snake_case`, up to 50 characters (`^[a-z0-9_]+$`).

**The code must exist in your workspace catalog.** The server accepts the
codes of the Orwel catalog plus the custom codes your workspace registered
(custom codes are registered when you save a journey or a feature that uses them
in the dashboard, under Developers). Any other code is rejected with
`Event not found: <code>`. Conversions are not gated by the catalog.

### identify

```ts
orwel.identify({ email: 'ada@acme.com', name: 'Ada', plan: 'pro' })
```

The visitor id is resolved by the server from a browser fingerprint, persisted in
`localStorage` (`__orwel_visitor__`) and reused across sessions. Browser and
device info is merged automatically; your traits win on conflict. Without an
email the visitor stays anonymous.

### conversion

```ts
async function onSubmit(form) {
  orwel.identify({ email: form.email, name: form.name })

  const { success, reason } = await orwel.conversion('demo_request', {
    email: form.email,
    company: form.company
  })

  if (!success) console.warn('Orwel conversion not delivered', reason)
  showThanks() // flip the UI only after the await
}
```

What `conversion()` does, since 1.6:

1. Waits up to 5 seconds for the visitor id. If it never resolves, nothing is
   sent and it resolves `{ success: false, reason: 'visitor_unresolved' }`.
2. Adds a client `conversionId` (UUID). The server deduplicates on it, so a
   retried or double fired conversion creates one lead, not two.
3. Attaches the persisted `attribution` object (see below).
4. Flushes the queue immediately and resolves with the real outcome:
   `{ success: true }`, or `{ success: false, reason: 'delivery_failed' }` /
   `reason: 'error'`.

Always include an email (or at least a phone) in the properties or a previous
`identify()`. Without it the lead cannot be enriched and no notification email
is sent.

Await it before unmounting the form. If the component that holds the form is
destroyed mid flush, the request can be lost.

### session

```ts
orwel.session({ currentScreen: 'checkout', cartTotal: 99.9 })
```

### monitor

```ts
orwel.monitor() // errors, console, network and performance, all on by default
orwel.monitor({ network: false })
```

`autoMonitor: true` in `init()` is the same as calling `monitor()`.

### form

```ts
orwel.form(document.querySelector('#signup'), {
  trackFocus: true,
  trackInput: true,
  trackSubmit: true,
  trackAbandon: true
})
```

Emits `form_focus`, `form_input`, `form_change`, `form_submit_attempt`,
`form_submit_success`, `form_submit_error` and `form_abandon`. Do not combine it
with a manual `conversion()` on the same submit: frameworks that replace the
form with a success state make the SDK see an abandon. For lead forms, skip
`form()` and call `identify()` and `conversion()` in your submit handler.

### Sections

Add `data-orwel-section="pricing"` to any element. Visible time, max visible
percentage, word count, clicks and scrolls are rolled up into the session
(`sectionEngagements`), without extra events.

## Attribution

The SDK captures attribution parameters on landing and keeps them:

- **UTMs:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
  `utm_content` and `utm_id`.
- **Ad click ids (1.7.0):** `gclid`, `gbraid`, `wbraid` (Google), `fbclid`
  (Meta), `ttclid` (TikTok), `msclkid` (Microsoft), `li_fat_id` (LinkedIn).

They are read from the URL query, then from a hash query (`#/?utm_source=...`),
then from the referrer, and kept in `sessionStorage` for the session. A
persisted object in `localStorage` (`__orwel_attribution`) survives across
sessions:

```json
{
  "first_touch": { "utm_source": "google", "utm_campaign": "brand" },
  "last_touch": { "utm_source": "meta", "utm_id": "120210000000" },
  "first_click_ids": { "gclid": "Cj0K..." },
  "last_click_ids": { "fbclid": "IwAR..." }
}
```

`first_*` is written once, `last_*` is overwritten on every new touch. Every
conversion carries this object, and the server uses it for the lead source and
to join leads with Google Ads and Meta Ads spend. Prefer `utm_id` in your ad
URLs (`utm_id={{campaign.id}}` on Meta, `utm_id={campaignid}` on Google): it
survives campaign renames.

## Bots

The SDK flags obvious automation (`navigator.webdriver`, headless or crawler
user agents, empty `navigator.languages`) as `isBot` with `botReasons` on the
session and visitor. Bots are still tracked, never blocked; the server adds its
own checks (user agent, datacenter IP, proxy) and filters them in reports.

## Delivery

- Events are queued in memory and `localStorage` (`__orwel_queue__`, up to
  1000) and sent to `https://api.orwel.io/ingest/batch` in chunks of 100
  (1.7.1).
- The queue flushes when the tab is hidden and on `beforeunload`
  (`navigator.sendBeacon`, with a synchronous request as fallback).
- Every event carries an id and a timestamp, so retries do not duplicate rows.
- Failed events are dropped, not requeued, to avoid retry loops. Since 1.7.1 a
  rejected request (HTTP 400) logs the server response and the rejected codes
  in the console (`Event rejected (400) - DISCARDED` or
  `Batch rejected (400) - events DISCARDED`).
- A batch the server accepts only in part answers HTTP 207 with the refused
  events in `failedEvents`. The SDK counts it as delivered; use the development
  key and Dev mode to see why each event failed.

## Config

```ts
orwel.init({
  apiKey: 'orwel_pk_...',      // required, starts with orwel_, 20+ characters
  autoMonitor: false,           // start monitor() on init
  autoEventDetection: true,     // automatic page_view, click, scroll and more (on unless false)
  eventDetectionOptions: {
    enabledCategories: ['navigation', 'form', 'ecommerce'],
    confidenceThreshold: 0.7
  },
  debug: false,                 // console logs
  verbose: false                // more detailed logs
})
```

## Validation

The SDK validates input at runtime and throws descriptive errors:

- `apiKey` must start with `orwel_` and be at least 20 characters.
- Event codes must match `^[a-z0-9_]+$` and be at most 50 characters.
- Email fields inside traits or properties must be valid addresses.

## Server side rendering

On the server (no `window`), every method is a no-op that returns a success
shape, so imports are safe in SSR code. Only the browser instance sends data.

## Links

- Docs: [docs.orwel.io](https://docs.orwel.io)
- Install guides: [orwel.io/install](https://orwel.io/install)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
