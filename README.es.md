# Orwel SDK

[![npm version](https://badge.fury.io/js/orwel.svg)](https://www.npmjs.com/package/orwel)
[![npm downloads](https://img.shields.io/npm/dm/orwel)](https://www.npmjs.com/package/orwel)

El SDK de navegador de [Orwel](https://orwel.io), inteligencia de visitantes y
leads. Captura visitas, sesiones, eventos y conversiones, resuelve un id de
visitante estable, guarda la atribución de primer y último toque (UTMs y click
ids de anuncios) y lo manda todo a tu workspace de Orwel.

Versión actual: **1.7.1**. Documentación completa: [docs.orwel.io](https://docs.orwel.io).
Instalación paso a paso por framework: [orwel.io/install](https://orwel.io/install).

## Instalación

```bash
npm install orwel@latest
```

O sin build:

```html
<script src="https://cdn.jsdelivr.net/npm/orwel@1/dist/orwel.umd.js"></script>
<script>
  orwel.init({ apiKey: 'orwel_pk_...' })
</script>
```

El build UMD expone el SDK en `window.orwel`.

## Inicializa una sola vez

El SDK es un singleton. Llama `init()` una vez, en el navegador, antes de
cualquier otra llamada, e importa la misma instancia en el resto de la app.

```ts
import orwel from 'orwel' // o: import { orwel } from 'orwel'

orwel.init({
  apiKey: import.meta.env.VITE_ORWEL_KEY, // léela del env, nunca la pegues en el código
  autoMonitor: true,                       // errores JS, errores de consola, requests de red, tiempos
  debug: import.meta.env.DEV               // logs del SDK en la consola
})
```

`init()` recibe un objeto. Si le pasas la key como string, lanza un error.

### Qué key va aquí

| Key | Prefijo | Uso |
| --- | --- | --- |
| Key pública | `orwel_pk_` (workspaces anteriores: `orwel_`) | Sitio en producción. Solo puede enviar datos. |
| Key de desarrollo | `orwel_dev_` | Local y staging. Los datos se guardan como prueba (`is_test`), sin correos de aviso ni integraciones, y cada request aparece en vivo en Modo desarrollo. |

Las dos son seguras en el bundle del navegador porque solo escriben. Para leer
datos (API REST, MCP) se usan keys secretas aparte (`orwel_sk_`) que creas en
Ajustes y que nunca van al navegador.

## Métodos

| Método | Regresa | Qué hace |
| --- | --- | --- |
| `init(config)` | `void` | Configura el SDK. Lanza error si la config es inválida. |
| `track(code, props?)` | `{ success, eventId }` | Encola un evento con nombre. |
| `identify(traits?)` | `{ success, visitorId }` | Asocia traits (email, nombre, plan...) al visitante. |
| `conversion(code, props?)` | `Promise<{ success, reason? }>` | Registra una conversión y espera la confirmación del servidor. |
| `session(props?, final?)` | `{ success, sessionId }` | Agrega propiedades a la sesión actual. |
| `monitor(options?)` | `{ success }` | Activa monitoreo de errores, consola, red y rendimiento. |
| `form(element, options?)` | `{ success, error? }` | Observa un formulario (focus, input, change, submit, abandono). |
| `flush()` | `Promise<{ success, count }>` | Envía la cola en ese momento. Casi nunca hace falta. |

### track

```ts
orwel.track('quote_created', { amount: 1200, currency: 'MXN' })
```

Los códigos van en `snake_case` en minúsculas, máximo 50 caracteres
(`^[a-z0-9_]+$`).

**El código tiene que existir en el catálogo del workspace.** El servidor
acepta los códigos del catálogo de Orwel más los códigos propios que registró tu
workspace (se registran al guardar un journey o una feature que los usa, en la
sección Desarrollo del dashboard). Cualquier otro código se rechaza con
`Event not found: <code>`. Las conversiones no pasan por el catálogo.

### identify

```ts
orwel.identify({ email: 'ada@acme.com', name: 'Ada', plan: 'pro' })
```

El servidor resuelve el id de visitante a partir de una huella del navegador; se
guarda en `localStorage` (`__orwel_visitor__`) y se reutiliza entre sesiones. La
info de navegador y dispositivo se agrega sola; tus traits ganan si hay
conflicto. Sin email el visitante queda anónimo.

### conversion

```ts
async function onSubmit(form) {
  orwel.identify({ email: form.email, name: form.name })

  const { success, reason } = await orwel.conversion('demo_request', {
    email: form.email,
    company: form.company
  })

  if (!success) console.warn('La conversión no se entregó', reason)
  showThanks() // cambia la UI hasta después del await
}
```

Qué hace `conversion()` desde la 1.6:

1. Espera hasta 5 segundos el id del visitante. Si no se resuelve, no envía nada
   y regresa `{ success: false, reason: 'visitor_unresolved' }`.
2. Agrega un `conversionId` (UUID). El servidor deduplica con él, así que una
   conversión reintentada o disparada dos veces crea un solo lead.
3. Adjunta el objeto `attribution` guardado (ver abajo).
4. Vacía la cola en ese momento y regresa el resultado real: `{ success: true }`,
   o `{ success: false, reason: 'delivery_failed' }` / `reason: 'error'`.

Incluye siempre un email (o al menos un teléfono) en las propiedades o en un
`identify()` previo. Sin él el lead no se puede enriquecer y no se manda el
correo de aviso.

Haz `await` antes de desmontar el formulario. Si el componente se destruye a
mitad del envío, el request se puede perder.

### session

```ts
orwel.session({ currentScreen: 'checkout', cartTotal: 99.9 })
```

### monitor

```ts
orwel.monitor() // errores, consola, red y rendimiento, todo activo por defecto
orwel.monitor({ network: false })
```

`autoMonitor: true` en `init()` equivale a llamar `monitor()`.

### form

```ts
orwel.form(document.querySelector('#signup'), {
  trackFocus: true,
  trackInput: true,
  trackSubmit: true,
  trackAbandon: true
})
```

Emite `form_focus`, `form_input`, `form_change`, `form_submit_attempt`,
`form_submit_success`, `form_submit_error` y `form_abandon`. No lo combines con
un `conversion()` manual en el mismo submit: los frameworks que reemplazan el
formulario por un mensaje de éxito hacen que el SDK lo vea como abandono. En
formularios de leads, omite `form()` y llama `identify()` y `conversion()` en tu
handler.

### Secciones

Agrega `data-orwel-section="pricing"` a cualquier elemento. El tiempo visible,
el porcentaje máximo visible, las palabras, los clics y los scrolls se agregan a
la sesión (`sectionEngagements`), sin eventos extra.

## Atribución

El SDK captura los parámetros de atribución al llegar y los conserva:

- **UTMs:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
  `utm_content` y `utm_id`.
- **Click ids de anuncios (1.7.0):** `gclid`, `gbraid`, `wbraid` (Google),
  `fbclid` (Meta), `ttclid` (TikTok), `msclkid` (Microsoft), `li_fat_id`
  (LinkedIn).

Se leen de la query de la URL, luego de una query en el hash
(`#/?utm_source=...`), luego del referrer, y se guardan en `sessionStorage`
durante la sesión. Un objeto en `localStorage` (`__orwel_attribution`) sobrevive
entre sesiones:

```json
{
  "first_touch": { "utm_source": "google", "utm_campaign": "brand" },
  "last_touch": { "utm_source": "meta", "utm_id": "120210000000" },
  "first_click_ids": { "gclid": "Cj0K..." },
  "last_click_ids": { "fbclid": "IwAR..." }
}
```

`first_*` se escribe una vez y `last_*` se sobrescribe en cada toque nuevo. Cada
conversión lleva este objeto, y el servidor lo usa para la fuente del lead y para
cruzar leads con el gasto de Google Ads y Meta Ads. Usa `utm_id` en las URLs de
tus anuncios (`utm_id={{campaign.id}}` en Meta, `utm_id={campaignid}` en
Google): sobrevive a que renombres la campaña.

## Bots

El SDK marca automatización evidente (`navigator.webdriver`, user agents
headless o de crawlers, `navigator.languages` vacío) como `isBot` con
`botReasons` en la sesión y el visitante. Los bots se siguen registrando, nunca
se bloquean; el servidor agrega sus propias señales (user agent, IP de
datacenter, proxy) y los filtra en los reportes.

## Entrega

- Los eventos se encolan en memoria y en `localStorage` (`__orwel_queue__`,
  hasta 1000) y se envían a `https://api.orwel.io/ingest/batch` en bloques de
  100 (1.7.1).
- La cola se vacía cuando la pestaña se oculta y en `beforeunload`
  (`navigator.sendBeacon`, con un request síncrono de respaldo).
- Cada evento lleva id y timestamp, así que los reintentos no duplican filas.
- Los eventos que fallan se descartan, no se reencolan, para evitar ciclos de
  reintento. Desde la 1.7.1 un request rechazado (HTTP 400) deja en consola la
  respuesta del servidor y los códigos rechazados
  (`Event rejected (400) - DISCARDED` o `Batch rejected (400) - events DISCARDED`).
- Un batch que el servidor acepta solo en parte responde HTTP 207 con los
  eventos rechazados en `failedEvents`. El SDK lo cuenta como entregado; usa la
  key de desarrollo y el Modo desarrollo para ver por qué falló cada evento.

## Configuración

```ts
orwel.init({
  apiKey: 'orwel_pk_...',      // obligatoria, empieza con orwel_, 20+ caracteres
  autoMonitor: false,           // arranca monitor() al iniciar
  autoEventDetection: true,     // page_view, click, scroll y más, automáticos (activo salvo false)
  eventDetectionOptions: {
    enabledCategories: ['navigation', 'form', 'ecommerce'],
    confidenceThreshold: 0.7
  },
  debug: false,                 // logs en consola
  verbose: false                // logs más detallados
})
```

## Validación

El SDK valida en tiempo de ejecución y lanza errores descriptivos:

- `apiKey` debe empezar con `orwel_` y tener al menos 20 caracteres.
- Los códigos deben cumplir `^[a-z0-9_]+$` y tener máximo 50 caracteres.
- Los campos de email en traits o propiedades deben ser direcciones válidas.

## Render en servidor

En el servidor (sin `window`) cada método es un no-op que regresa un resultado
exitoso, así que importarlo en código SSR es seguro. Solo la instancia del
navegador envía datos.

## Enlaces

- Docs: [docs.orwel.io](https://docs.orwel.io)
- Guías de instalación: [orwel.io/install](https://orwel.io/install)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## Licencia

MIT
