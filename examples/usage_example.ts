/**
 * Ejemplo de uso del Orwel SDK y procesamiento de eventos
 * 
 * Este archivo muestra cómo se utilizaría el SDK en el frontend
 * y cómo se procesarían los eventos en el backend.
 */

// ======== FRONTEND (EJEMPLO DE USO DEL SDK) ========

/**
 * Ejemplo de inicialización y uso básico del SDK en una aplicación web
 */
function frontendExample() {
  // Inicialización del SDK
  orwel.init({
    apiKey: 'orwel_xxxxxxxxxxxxx',
    autoMonitor: true
  });
  
  // Al inicializar, el SDK automáticamente:
  // 1. Genera un ID de sesión si no existe
  // 2. Envía un evento 'session' con isNewSession=true
  // 3. Comienza a monitorear métricas de rendimiento, errores, etc.
  
  // Identificar al usuario cuando inicia sesión
  function onUserLogin(user) {
    orwel.identify({
      id: user.id,          // ID opcional, si no se proporciona se genera uno
      email: user.email,
      name: user.name,
      plan: user.plan,
      signupDate: user.createdAt
    });
    // Esto envía un evento 'identify' con los traits del usuario
  }
  
  // Rastrear eventos específicos
  function onPurchaseComplete(order) {
    orwel.track('purchase_completed', {
      orderId: order.id,
      amount: order.total,
      currency: order.currency,
      items: order.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }))
    });
    // Esto envía un evento 'track' con los detalles de la compra
    // También incluye automáticamente todos los datos de sesión
  }
  
  // Almacenar datos personalizados en la sesión
  function updateUserContext(context) {
    orwel.session({
      currentPage: context.page,
      lastInteraction: Date.now(),
      viewedProducts: context.recentProducts,
      searchQuery: context.lastSearch
    });
    // Esto envía un evento 'session' con isNewSession=false
    // y los datos personalizados agregados
  }
  
  // Los datos de rendimiento se recopilan automáticamente
  // y se agregan a la sesión, como:
  // - Tiempo de carga de página
  // - First Paint y First Contentful Paint
  // - Recursos cargados
  // - Errores JavaScript
  // - Errores de red
  // - etc.
}

// ======== BACKEND (PROCESAMIENTO DE EVENTOS) ========

/**
 * Ejemplo de cómo los eventos son recibidos y procesados en el backend
 */
async function backendExample() {
  // Supongamos que este es el controlador que recibe los eventos
  async function ingestEventHandler(req, res) {
    try {
      const apiKey = req.headers['x-orwel-key'];
      if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }
      
      // Obtener el workspace asociado con la API key
      const workspace = await getWorkspaceByApiKey(apiKey);
      if (!workspace) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      
      const payload = req.body;
      const visitorId = payload.visitor?.id;
      
      if (!visitorId) {
        return res.status(400).json({ error: 'Visitor ID is required' });
      }
      
      // Procesar el evento según su tipo
      const result = await processEvent(workspace.id, visitorId, payload);
      
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error processing event:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Función para procesar los diferentes tipos de eventos
  async function processEvent(workspaceId, visitorId, payload) {
    const { type, timestamp } = payload;
    
    switch (type) {
      case 'track': {
        // Verificar que el evento tiene los campos requeridos
        if (!payload.code) {
          return { error: 'Event code is required' };
        }
        
        // Almacenar el evento en la base de datos
        await storeTrackEvent(workspaceId, visitorId, {
          code: payload.code,
          properties: payload.properties || {},
          eventId: payload.eventId,
          timestamp: timestamp,
          sessionId: payload.session?.id
        });
        
        return { success: true };
      }
      
      case 'identify': {
        // Verificar que hay traits para actualizar
        if (!payload.traits || typeof payload.traits !== 'object') {
          return { error: 'Invalid traits payload' };
        }
        
        // Actualizar los datos del visitante
        await updateVisitor(workspaceId, visitorId, payload.traits, timestamp);
        
        return { success: true };
      }
      
      case 'session': {
        // Verificar que hay datos de sesión
        if (!payload.sessionData || !payload.sessionData.id) {
          return { error: 'Invalid session data' };
        }
        
        const isNewSession = payload.isNewSession || false;
        const sessionData = payload.sessionData;
        
        if (isNewSession) {
          // Crear nueva sesión
          await createSession(workspaceId, visitorId, sessionData, timestamp);
        } else {
          // Actualizar sesión existente
          await updateSession(workspaceId, visitorId, sessionData, timestamp);
        }
        
        return { success: true };
      }
      
      default:
        return { error: 'Unsupported event type' };
    }
  }
}

// ======== EJEMPLOS DE ESTRUCTURAS EN LA BASE DE DATOS ========

// Ejemplo de cómo se almacenan los eventos en la base de datos
const databaseExamples = {
  // Tabla/Colección de eventos
  events: [
    {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      workspaceId: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
      visitorId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'track',
      code: 'button_clicked',
      properties: {
        buttonId: 'signup_button',
        page: '/homepage',
        referrer: 'google'
      },
      timestamp: '2023-05-04T12:34:56.789Z',
      createdAt: '2023-05-04T12:34:57.123Z'
    },
    // Más eventos...
  ],
  
  // Tabla/Colección de visitantes
  visitors: [
    {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      workspaceId: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
      traits: {
        email: 'usuario@ejemplo.com',
        name: 'Juan Pérez',
        plan: 'premium',
        company: 'ACME Inc',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
        language: 'es-ES',
        platform: 'MacIntel',
        // Otros traits...
      },
      firstSeen: '2023-05-04T12:30:15.123Z',
      lastSeen: '2023-05-04T12:40:15.456Z',
      createdAt: '2023-05-04T12:30:15.456Z',
      updatedAt: '2023-05-04T12:35:22.789Z'
    },
    // Más visitantes...
  ],
  
  // Tabla/Colección de sesiones
  sessions: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
      visitorId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      startedAt: '2023-05-04T12:30:15.123Z',
      lastUpdated: '2023-05-04T12:40:15.456Z',
      data: {
        // Todos los datos acumulados en la sesión
        pageLoad: {
          loadTime: 1243,
          domReadyTime: 856,
          ttfb: 124,
          // Más métricas...
        },
        paintMetrics: {
          firstPaint: 532,
          firstContentfulPaint: 876
        },
        resources: [
          // Lista de recursos cargados
        ],
        jsErrors: [
          // Errores JavaScript detectados
        ],
        networkRequests: [
          // Solicitudes de red
        ],
        // Datos personalizados
        currentPage: 'pricing',
        pricingPlanViewed: 'enterprise',
        experimentGroup: 'B'
      },
      createdAt: '2023-05-04T12:30:15.456Z',
      updatedAt: '2023-05-04T12:40:15.789Z'
    },
    // Más sesiones...
  ]
};

// Estos son solo ejemplos, las funciones reales dependerían 
// de tu implementación del backend y base de datos
function getWorkspaceByApiKey(apiKey) { /* Implementación */ }
function storeTrackEvent(workspaceId, visitorId, eventData) { /* Implementación */ }
function updateVisitor(workspaceId, visitorId, traits, timestamp) { /* Implementación */ }
function createSession(workspaceId, visitorId, sessionData, timestamp) { /* Implementación */ }
function updateSession(workspaceId, visitorId, sessionData, timestamp) { /* Implementación */ } 