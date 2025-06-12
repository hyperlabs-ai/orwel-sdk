# 🛰️ Orwel SDK

[![npm version](https://badge.fury.io/js/orwel.svg)](https://www.npmjs.com/package/orwel)
[![GitHub](https://img.shields.io/github/license/hyperlabs-ai/orwel-sdk)](https://github.com/hyperlabs-ai/orwel-sdk)
[![npm downloads](https://img.shields.io/npm/dm/orwel)](https://www.npmjs.com/package/orwel)

**Orwel** es un SDK liviano de JavaScript para rastrear eventos frontend, características de visitantes y señales de UX — todo desde un script simple o instalación npm. Diseñado para equipos de marketing y analistas de producto que desean visibilidad en tiempo real de sus visitantes analizando comportamientos a profundidad, sentimientos, intenciones y métricas de conversión.

---

## 🚀 Inicio Rápido (vía npm)

```bash
npm install orwel
```

## 🔑 Conceptos Clave

Antes de sumergirse en la implementación, es importante entender algunos conceptos clave:

### Patrón Singleton
Orwel utiliza un patrón singleton, lo que significa que solo hay una instancia del SDK en toda tu aplicación. No necesitas crear nuevas instancias con `new Orwel()` - en su lugar, importas la instancia preconfigurada y la inicializas:

```ts
import { orwel } from 'orwel'

// Inicializa lo más temprano posible en tu aplicación
orwel.init({
  apiKey: 'orwel_xxxxxxxxxxxxx'
})
```

### Momento de Inicialización
La llamada `init()` debe colocarse:
- **React**: En tu componente raíz (ej., `App.js`) o componente de inicialización
- **Next.js**: En `_app.js` o layout raíz
- **Vue**: En `main.js` antes de montar la app
- **Svelte**: En `src/routes/+layout.svelte` o `src/routes/+page.svelte`
- **HTML plano**: En `<head>` o temprano en `<body>`

### Gestión de Estado
Una vez inicializado:
- La configuración se almacena en memoria y persiste durante toda la sesión
- Los datos del visitante se almacenan en localStorage/cookies para persistencia entre sesiones
- Puedes importar y usar `orwel` desde cualquier archivo sin re-inicialización

## 💡 Ejemplos de Uso

### Rastreo Básico de Eventos
```ts
// Rastrea un evento simple
orwel.track('button_clicked')

// Rastrea con propiedades
orwel.track('form_submitted', {
  form_id: 'contact',
  time_to_complete: 45,
  errors_count: 0
})
```

## 🎯 Tipos de Eventos y Rastreo

Los eventos en Orwel no son cadenas aleatorias - siguen un esquema predefinido para asegurar consistencia y habilitar análisis poderosos:

### Eventos Estándar
Una lista completa de eventos estándar está disponible en [orwel.io/events](https://orwel.io/events). Estos eventos están optimizados para escenarios comunes de rastreo:

```typescript
// Eventos de interacción del usuario
orwel.track('button_click', { button_id: 'submit_form' })
orwel.track('page_view', { path: '/checkout' })
orwel.track('form_submit', { form_name: 'signup' })

// Eventos de e-commerce
orwel.track('product_view', { product_id: '123', price: 99.99 })
orwel.track('add_to_cart', { product_id: '123', quantity: 1 })
orwel.track('checkout_complete', { order_id: 'ORDER123' })

// Eventos de suscripción
orwel.track('subscription_started', { plan: 'pro', method: 'stripe' })
orwel.track('subscription_cancelled', { reason: 'cost' })
```

### Eventos Personalizados
Para necesidades únicas de rastreo, puedes usar:

1. **Tipo de Evento Personalizado**:
```typescript
orwel.track('custom_event', {
  event_category: 'my_feature',
  event_action: 'special_action',
  // ... propiedades personalizadas
})
```

2. **Alias de Eventos**:
Puedes crear alias para eventos personalizados frecuentemente usados en tu dashboard de Orwel:
```typescript
// Después de crear el alias 'special_action' para 'custom_event'
orwel.track('special_action', {
  // ... tus propiedades
})
```

### Mejores Prácticas
- Usa eventos estándar cuando sea posible para mejor integración de análisis
- Mantén nombres de eventos en formato snake_case
- Documenta eventos personalizados y sus propiedades esperadas
- Usa nombres de propiedades consistentes entre eventos similares
- Evita enviar datos sensibles en propiedades de eventos

### Identificación de Visitantes
```ts
orwel.identify({
  // id se auto-genera y persiste si no se proporciona
  email: 'lucas@acme.com',
  plan: 'pro',
  company: 'Acme Inc',
  subscription_status: 'active'
})
```

### Generación de Leads
```ts
// Captura leads con códigos de evento específicos
orwel.lead('newsletter_signup', {
  email: 'user@example.com',
  source: 'landing_page',
  campaign: 'winter_sale'
})

// Lead de solicitud de demo
orwel.lead('demo_request', {
  company: 'Acme Corp',
  phone: '+1234567890',
  interest: 'enterprise'
})

// Lead de formulario de contacto
orwel.lead('contact_form', {
  name: 'John Doe',
  email: 'john@company.com',
  message: 'Interesado en sus servicios'
})
```

## 👤 Gestión de Visitantes

El SDK gestiona automáticamente la identificación y persistencia de visitantes. Así es como funciona:

### Ciclo de Vida del Visitante

1. **Visita Inicial**: Cuando el SDK se inicializa, automáticamente:
   - Genera un ID único de visitante si no existe ninguno
   - Lo almacena en localStorage bajo `__orwel_visitor__`
   - Recopila información básica del navegador

2. **Identificando Visitantes**: Usa `identify()` para adjuntar características al visitante:
```typescript
// Retorna { success: true, visitorId: 'generated-uuid' }
const result = orwel.identify({
  email: 'user@example.com',
  plan: 'pro'
})
```

### Recopilación Automática de Datos

Al llamar `identify()`, el SDK automáticamente recopila y fusiona:
- Información del navegador
- Detalles del user agent
- Preferencias de idioma
- Información de plataforma

Estos se fusionan con las características que proporcionas, pero tus valores explícitos tienen precedencia.

### Almacenamiento y Persistencia

- Los datos del visitante se almacenan en localStorage
- Persisten a través de recargas de página y sesiones del navegador
- Se cargan automáticamente cuando el SDK se inicializa
- Se sincronizan con el servidor en llamadas de identify

### Detalles de Implementación

El administrador de visitantes:
1. Carga datos existentes del visitante en init
2. Genera UUID para nuevos visitantes
3. Fusiona información del navegador con características proporcionadas
4. Persiste datos en localStorage
5. Pone en cola evento identify para sincronización con servidor

## 🎯 Rastreo de Leads

El rastreo de leads te permite capturar clientes potenciales y prospectos con recopilación de datos estructurada. A diferencia de la identificación de visitantes, los leads son entidades independientes con sus propios identificadores únicos.

### Lead vs Identify

| Característica | `identify()` | `lead()` |
|----------------|-------------|----------|
| **Propósito** | Actualiza características del visitante actual | Captura nueva información de lead |
| **Persistencia** | Guarda en perfil de visitante | Registro de lead independiente |
| **Generación de ID** | Usa ID del visitante | Genera ID único de lead |
| **Tipo de Evento** | `identify` | `lead` |
| **Casos de Uso** | Login de usuario, actualizaciones de perfil | Formularios, newsletters, demos |

### Estructura de Evento de Lead

Cuando llamas `orwel.lead()`, genera un evento con esta estructura:

```typescript
{
  type: 'lead',
  code: 'newsletter_signup',  // El código de evento que proporcionaste
  properties: {
    id: 'lead-uuid-generated',  // Identificador único de lead
    email: 'user@example.com',
    source: 'landing_page',
    // ... otras propiedades + info del navegador
  },
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

### Tipos Comunes de Leads

```typescript
// Suscripción a newsletter
orwel.lead('newsletter_signup', {
  email: 'user@example.com',
  source: 'footer_form',
  interests: ['product_updates', 'marketing']
})

// Solicitud de demo
orwel.lead('demo_request', {
  company: 'Tech Corp',
  email: 'contact@techcorp.com',
  phone: '+1-555-0123',
  employees: '50-100',
  use_case: 'customer_analytics'
})

// Formulario de contacto
orwel.lead('contact_form', {
  name: 'Sarah Johnson',
  email: 'sarah@company.com',
  subject: 'Consulta de Asociación',
  message: 'Nos gustaría discutir...'
})

// Descarga de whitepaper
orwel.lead('whitepaper_download', {
  email: 'reader@example.com',
  title: 'Estado de Analytics 2024',
  job_title: 'Analista de Datos',
  company_size: '100-500'
})
```

### Recopilación Automática de Datos

El método `lead()` automáticamente recopila y fusiona:
- Información del navegador (user agent, idioma, plataforma)
- Contexto de página (URL, referrer, timestamp)
- Datos de sesión cuando estén disponibles

### Mejores Prácticas

- **Usa códigos descriptivos**: `newsletter_signup`, `demo_request`, `contact_form`
- **Nomenclatura consistente**: Usa snake_case para códigos de evento
- **Campos requeridos**: Siempre incluye información de contacto esencial (email, teléfono, etc.)
- **Rastreo de fuente**: Incluye `source`, `campaign`, `medium` para atribución
- **Perfilado progresivo**: Captura datos adicionales a lo largo del tiempo, no todo de una vez
- **Cumplimiento GDPR**: Respeta preferencias de privacidad y gestión de consentimiento

### Gestión de Sesiones
```ts
// Almacena métricas de rendimiento y otros datos en la sesión
orwel.session({
  currentPage: 'homepage',
  experimentGroup: 'B',
  userPreferences: {
    theme: 'dark',
    language: 'en'
  }
})
```

### Monitoreo de Aplicaciones
```ts
// Habilita todas las características de monitoreo
orwel.monitor()

// O personaliza opciones de monitoreo
orwel.monitor({
  performance: true,   // Tiempo de carga de página y navegación
  errors: true,        // Errores de JavaScript y rechazos no manejados
  console: true,       // Errores y advertencias de consola
  network: false       // Llamadas XHR y Fetch API
})
```

## 🔗 Inicio Rápido (vía CDN)

```html
<script src="https://cdn.orwel.io/orwel.js"></script>
<script>
  orwel.init({ apiKey: 'pk_live_abc123' })
  orwel.track('page_view', { url: window.location.pathname })
</script>
```

## 🧠 Métodos Disponibles

| Método | Descripción | Mejores Prácticas |
|--------|-------------|-------------------|
| `init(config)` | Establece tu apiKey para identificación | Llama lo más temprano posible en el ciclo de vida de tu app. Requerido antes de usar otros métodos. |
| `identify(traits)` | Adjunta metadatos al visitante actual | Llama después de autenticación de usuario o cuando los datos del usuario estén disponibles. Persiste entre sesiones. |
| `lead(code, properties)` | Captura información de lead con código de evento | Usa para suscripciones a newsletter, solicitudes de demo, formularios de contacto. Cada lead obtiene ID único. |
| `track(code, props)` | Rastrea eventos nombrados | Usa nombres de eventos consistentes. Incluye propiedades relevantes para análisis. |
| `session(props, final?)` | Almacena datos de sesión | Usa para estado temporal que no debe persistir entre sesiones. Se incluye automáticamente con eventos. Establece `final=true` para fin de sesión. |
| `form(element, options)` | Rastrea interacciones de formulario | Conecta a formularios importantes para capturar datos de interacción del usuario, envíos y abandono. |
| `monitor(options)` | Habilita características de monitoreo | Habilita temprano para capturar todas las métricas relevantes. Considera el impacto en rendimiento de las características habilitadas. |
| `flush()` | Fuerza el envío de eventos pendientes | Se llama automáticamente al descargar la página. Las llamadas manuales rara vez son necesarias. |

## 📝 Rastreo de Formularios

El SDK proporciona capacidades completas de rastreo de formularios para darte insights sobre cómo los usuarios interactúan con tus formularios.

### Configuración de Rastreo de Formularios

```javascript
// Obtén una referencia a tu formulario
const signupForm = document.getElementById('signup-form');

// Comienza a rastrear el formulario
orwel.form(signupForm, {
  formId: 'user_signup',               // Identificador único para el formulario
  trackFocus: true,                    // Rastrea cuando los campos reciben foco
  trackInput: true,                    // Rastrea cuando los usuarios ingresan datos en campos
  trackChange: true,                   // Rastrea cuando los valores de campo cambian
  trackSubmit: true,                   // Rastrea envíos de formulario
  trackAbandon: true,                  // Rastrea cuando los usuarios abandonan formularios
  autoUntrack: true,                   // Automáticamente deja de rastrear cuando el formulario se remueve/oculta (default: true)
  submitCallback: (result) => {        // Callback opcional después del envío
    if (result.success) {
      // Envío de formulario exitoso
    } else {
      // Falló el envío de formulario
      console.error(result.error);
    }
  }
});
```

### Eventos de Formulario

El rastreador de formularios genera los siguientes eventos:

| Evento | Descripción | Propiedades Clave |
|--------|-------------|-------------------|
| `form_focus` | Usuario enfocó en un campo de formulario | `form_id`, `field_id`, `field_name`, `field_type` |
| `form_input` | Usuario ingresó datos en un campo de formulario | `form_id`, `field_id`, `field_name`, `field_type`, `has_value` |
| `form_change` | Usuario cambió un valor de campo de formulario | `form_id`, `field_id`, `field_name`, `field_type` |
| `form_submit_attempt` | Usuario intentó enviar el formulario | `form_id`, `form_fields_count`, `fields_filled_count`, `time_on_form_ms` |
| `form_submit_success` | Formulario enviado exitosamente | `form_id`, `form_fields_count`, `fields_filled_count`, `time_on_form_ms` |
| `form_submit_error` | Falló el envío de formulario | `form_id`, `validation_failed`, `invalid_fields`, `error_message` |
| `form_abandon` | Usuario abandonó formulario antes de completarlo | `form_id`, `fields_started`, `fields_changed`, `time_on_form_ms`, `time_since_last_interaction_ms` |

### Mejores Prácticas de Rastreo de Formularios

- Agrega rastreo de formularios temprano en el ciclo de vida de tu página
- Usa valores de `formId` consistentes a través de tu aplicación
- Rastrea formularios críticos (registro, checkout, contacto, etc.)
- Analiza el abandono de formularios para identificar problemas de UX
- Optimiza formularios basado en datos de interacción de campos
- Monitorea errores de envío para arreglar problemas de validación
- La opción `autoUntrack` está habilitada por defecto y automáticamente dejará de rastrear formularios que:
  - Se remueven del DOM
  - Se ocultan o no son visibles por más de 10 segundos
  - Al navegar a otras páginas

### Abandono de Formulario

El SDK automáticamente rastrea el abandono de formulario cuando un usuario:
- Pasa al menos 10 segundos en el formulario
- Interactúa con el formulario en los últimos 30 minutos
- Ha llenado al menos un campo
- Ha cambiado al menos un campo

## 🔍 Características de Monitoreo

El SDK incluye monitoreo completo de aplicaciones que puede habilitarse con una línea de código. Cada característica está diseñada para tener impacto mínimo en rendimiento y puede habilitarse/deshabilitarse independientemente.

### Monitoreo de Rendimiento
Rastrea automáticamente:
- Métricas de Navigation Timing API
- Rendimiento de carga de recursos
- Timing de pintado (FP, FCP)
- Marcas/medidas de rendimiento personalizadas

```javascript
// Ejemplo: Rastrea marca de rendimiento personalizada
performance.mark('feature_loaded')
```

### Monitoreo de Web Vitals
**Nota: El monitoreo de Web Vitals está implementado pero no se habilita automáticamente con `monitor()`. Requiere configuración manual.**

Core Web Vitals rastreados:
- LCP (Largest Contentful Paint)
  - Bueno: < 2.5s
  - Necesita Mejora: 2.5s - 4s
  - Pobre: > 4s
- FID (First Input Delay)
  - Bueno: < 100ms
  - Necesita Mejora: 100ms - 300ms
  - Pobre: > 300ms
- CLS (Cumulative Layout Shift)
  - Bueno: < 0.1
  - Necesita Mejora: 0.1 - 0.25
  - Pobre: > 0.25

### Monitoreo de Errores
Captura:
- Errores de JavaScript no capturados
- Rechazos de promesas no manejados
- Stack traces y contexto de error
- Archivos fuente y números de línea

Mejores prácticas:
```javascript
try {
  // Tu código
} catch (error) {
  // Orwel automáticamente captura estos
  console.error('Operación falló:', error)
}
```

### Monitoreo de Consola
Rastrea:
- Llamadas `console.error()`
- Llamadas `console.warn()`
- Deduplicación automática
- Limitación de tasa para prevenir inundación

### Monitoreo de Red
Captura:
- Solicitudes XHR/Fetch
- Tiempos de respuesta
- Códigos de estado
- Tamaños de solicitud/respuesta
- Correlación automática con eventos

## 📊 Recopilación Automática de Datos

El SDK automáticamente recopila datos contextuales cuando llamas `identify()`:

### Navegador y Plataforma
```javascript
// Recopilado automáticamente - no se requiere código
{
  userAgent: "Mozilla/5.0...",
  language: "es-ES",
  platform: "MacIntel",
  doNotTrack: "1",
  browserName: "Chrome",
  browserVersion: "91.0.4472.124"
}
```

### Pantalla y Ventana
```javascript
// Recopilación automática
{
  screenWidth: 1920,
  screenHeight: 1080,
  colorDepth: 24,
  pixelRatio: 2,
  viewportWidth: 1200,
  viewportHeight: 800
}
```

### Capacidades del Dispositivo
```javascript
// Recopilación automática
{
  touchscreen: true,
  darkMode: false,
  online: true,
  connectionType: "4g",
  memory: "8GB",
  cpuCores: 8
}
```

## 💾 Offline y Resistente

El SDK implementa varias estrategias para asegurar la confiabilidad de datos:

### Cola de Eventos
- Los eventos se almacenan en localStorage cuando están offline
- Reintento automático con backoff exponencial
- Persistencia de cola a través de recargas de página
- Limpieza automática de cola

### Manejo de Sesiones
- IDs de sesión únicos por sesión de navegador
- Recuperación automática de sesión después de crashes
- Persistencia de datos de sesión en localStorage
- Estrategia de fusión para actualizaciones concurrentes

### Identificación de Visitantes
- IDs de visitantes anónimos (UUID v4)
- Rastreo de visitantes entre sesiones
- Rastreo compatible con privacidad
- Gestión automática de ID

## 🔧 Opciones de Configuración

```javascript
orwel.init({
  // Requerido
  apiKey: 'your-orwel-api-key',

  // Características opcionales
  autoMonitor: true,            // Habilita todo el monitoreo
  autoEventDetection: true,     // Habilita detección automática de eventos
  debug: false,                 // Habilita logging de debug
  verbose: false,               // Habilita logging verbose
  
  // Opciones de detección automática de eventos
  eventDetectionOptions: {
    enabledCategories: ['auth', 'ecommerce', 'navigation', 'form'],
    confidenceThreshold: 0.7
  }
});
```

## 🚀 Rastreo de Sesiones

Las sesiones son un concepto central en Orwel, proporcionando una forma de agrupar eventos y métricas relacionados:

### Ciclo de Vida de Sesión
1. **Creación**: Nueva sesión en inicialización del SDK
2. **Actualizaciones**: A través de llamadas al método `session()`
3. **Expiración**: Después de timeout de inactividad
4. **Terminación**: Al descargar la página

### Datos de Sesión
```javascript
// Agrega datos personalizados - se fusiona con existentes
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

// Actualiza valores específicos
orwel.session({
  activePage: 'checkout',
  cartValue: 99.99
});
```

### Recopilación Automática
Cuando el monitoreo está habilitado, las sesiones automáticamente incluyen:
- Métricas de carga de página
- Timing de recursos
- Conteos de errores
- Actividad de red
- Uso de memoria
- Web Vitals

### Eventos de Sesión
El SDK automáticamente rastrea el ciclo de vida de sesión:
1. **Inicio de Sesión**: Creación inicial
2. **Actualizaciones de Sesión**: Cambios de propiedades
3. **Fin de Sesión**: Terminación limpia
4. **Timeout de Sesión**: Detección de inactividad

## 🔒 Privacidad y Seguridad

El SDK implementa varias medidas de privacidad y seguridad:

### Recopilación de Datos
- Respeta Do Not Track
- No recopila PII por defecto
- Retención de datos configurable
- Minimización de datos

### Seguridad
- Endpoints API solo HTTPS
- Validación de API key
- Limitación de tasa
- Firma de solicitudes

### Cumplimiento
- Listo para GDPR
- Compatible con CCPA
- Compatible con ley de cookies
- Amigable con política de privacidad

## ⚠️ Limitaciones Actuales

Aunque el SDK es completamente funcional, algunas características están implementadas pero aún no integradas:

### Actualmente No Disponible en `monitor()`:
- **Monitoreo de Web Vitals**: La implementación existe pero requiere configuración manual
- **Monitoreo de Memoria**: La implementación existe pero no está integrada en el sistema de monitoreo

### Características de Monitoreo Disponibles:
- ✅ Monitoreo de rendimiento (Navegación, timing de recursos)
- ✅ Monitoreo de errores (errores JS, rechazos de Promise)
- ✅ Monitoreo de consola (errores, advertencias)
- ✅ Monitoreo de red (solicitudes XHR, Fetch)

## 📄 Licencia

MIT — construido con ✨ por orwel.io

## 🤝 Soporte

¿Necesitas ayuda? Consulta:
- [Documentación](https://docs.orwel.io)
- [Referencia API](https://api.orwel.io)
- [GitHub Issues](https://github.com/hyperlabs-ai/orwel-sdk/issues)
- [Foro de la Comunidad](https://community.orwel.io) 
