/**
 * Ejemplos de payloads enviados al endpoint /ingest para diferentes tipos de eventos
 * 
 * Este archivo muestra cómo se ven los datos exactamente cuando llegan al endpoint
 * después de ser enviados por el SDK.
 */

// Ejemplo de evento 'track'
const trackEventExample = {
  // Datos base del evento
  type: 'track',
  code: 'button_clicked',
  properties: {
    buttonId: 'signup_button',
    page: '/homepage',
    referrer: 'google'
  },
  eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  
  // Datos de visitante adjuntos automáticamente
  visitor: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'usuario@ejemplo.com',
    plan: 'premium',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
    language: 'es-ES',
    platform: 'MacIntel',
    screenWidth: 1920,
    screenHeight: 1080,
    // Otros datos recopilados por identify()
  },
  
  // Datos de sesión adjuntos automáticamente
  session: {
    id: '550e8400-e29b-41d4-a716-446655440000', 
    startedAt: 1683271234567,
    currentPage: 'homepage',
    experimentGroup: 'B',
    // Performance metrics recopilados automáticamente
    pageLoad: {
      loadTime: 1243,
      domReadyTime: 856,
      ttfb: 124,
      domContentLoaded: 923,
      domInteractive: 765
    }, 
    paintMetrics: {
      firstPaint: 532,
      firstContentfulPaint: 876
    },
    resources: [
      {
        name: 'https://example.com/main.js',
        duration: 345,
        transferSize: 234567
      },
      // Otros recursos cargados
    ]
  },
  
  // Timestamp añadido automáticamente
  timestamp: '2023-05-04T12:34:56.789Z'
};

// Ejemplo de evento 'identify'
const identifyEventExample = {
  // Datos base del evento
  type: 'identify',
  traits: {
    email: 'usuario@ejemplo.com',
    name: 'Juan Pérez',
    plan: 'premium',
    company: 'ACME Inc',
    createdAt: '2023-01-15T10:30:45.000Z'
  },
  
  // Datos de visitante (en este caso, los mismos traits)
  visitor: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'usuario@ejemplo.com',
    name: 'Juan Pérez',
    plan: 'premium',
    company: 'ACME Inc',
    createdAt: '2023-01-15T10:30:45.000Z',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
    language: 'es-ES',
    // Otros datos recopilados automáticamente
  },
  
  // Datos de sesión adjuntos automáticamente
  session: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567,
    // Otros datos de sesión
  },
  
  // Timestamp añadido automáticamente
  timestamp: '2023-05-04T12:30:22.456Z'
};

// Ejemplo de evento 'session' (nueva sesión)
const newSessionEventExample = {
  // Datos base del evento
  type: 'session',
  isNewSession: true,
  sessionData: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567
    // Inicialmente vacío de otros datos
  },
  
  // Datos de visitante adjuntos automáticamente
  visitor: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    // Otros datos del visitante
  },
  
  // Los mismos datos de sesión incluidos en sessionData
  session: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567
  },
  
  // Timestamp añadido automáticamente
  timestamp: '2023-05-04T12:30:15.123Z'
};

// Ejemplo de evento 'session' (actualización de sesión)
const sessionUpdateEventExample = {
  // Datos base del evento
  type: 'session',
  isNewSession: false,
  sessionData: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567,
    currentPage: 'pricing',
    pricingPlanViewed: 'enterprise',
    // Datos personalizados agregados con orwel.session()
    
    // Datos de rendimiento recopilados automáticamente
    pageLoad: {
      loadTime: 956,
      domReadyTime: 723,
      ttfb: 110,
      // Más métricas...
    },
    paintMetrics: {
      firstPaint: 498,
      firstContentfulPaint: 780
    },
    // Posibles errores JS detectados
    jsErrors: {
      message: "Cannot read property 'data' of undefined",
      filename: "app.js",
      lineno: 234,
      colno: 23,
      stack: "TypeError: Cannot read property 'data'..."
    }
  },
  
  // Datos de visitante adjuntos automáticamente
  visitor: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    // Otros datos del visitante
  },
  
  // Los mismos datos de sesión incluidos en sessionData
  session: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567,
    currentPage: 'pricing',
    pricingPlanViewed: 'enterprise',
    // Mismos datos que en sessionData
  },
  
  // Timestamp añadido automáticamente
  timestamp: '2023-05-04T12:35:22.789Z'
};

// Ejemplo de evento 'track' con métricas de red capturadas en la sesión
const trackWithNetworkDataExample = {
  // Datos base del evento
  type: 'track',
  code: 'product_viewed',
  properties: {
    productId: 'prod-123',
    price: 99.99,
    category: 'electronics'
  },
  eventId: 'c3d97e89-7725-48fc-a903-1921a4abde12',
  
  // Datos de visitante
  visitor: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    // Otros datos del visitante
  },
  
  // Datos de sesión con métricas de red
  session: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    startedAt: 1683271234567,
    // Datos de rendimiento
    networkRequests: [
      {
        url: 'https://api.example.com/products/123',
        method: 'GET',
        status: 200,
        duration: 234,
        success: true,
        timestamp: 1683271245678
      },
      {
        url: 'https://api.example.com/recommendations',
        method: 'POST',
        status: 200,
        duration: 345,
        success: true,
        timestamp: 1683271247890
      }
    ],
    // Posibles errores de red
    networkErrors: [
      {
        url: 'https://api.example.com/analytics',
        method: 'POST',
        duration: 3000, // timeout
        timestamp: 1683271250123,
        message: 'NetworkError: Failed to fetch'
      }
    ],
    // Datos de memoria si están habilitados
    memory: {
      totalJSHeapSize: 45678912,
      usedJSHeapSize: 23456789,
      jsHeapSizeLimit: 2147483648,
      timestamp: 1683271249000
    }
  },
  
  // Timestamp del evento
  timestamp: '2023-05-04T12:40:15.456Z'
};

// Exportamos los ejemplos para referencia
export const eventExamples = {
  track: trackEventExample,
  identify: identifyEventExample,
  newSession: newSessionEventExample,
  sessionUpdate: sessionUpdateEventExample,
  trackWithNetworkData: trackWithNetworkDataExample
};

/**
 * Los datos llegan al endpoint /ingest con las siguientes cabeceras:
 * 
 * Headers: {
 *   'Content-Type': 'application/json',
 *   'X-Orwel-Key': 'orwel_xxxxxxxxxxxxx' // Tu API key
 * }
 * 
 * Method: POST
 * URL: https://api.orwel.io/ingest
 */ 