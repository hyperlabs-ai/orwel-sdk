/**
 * Ejemplo de procesamiento en lotes del Orwel SDK
 * 
 * Este ejemplo demuestra cómo el SDK ahora envía eventos en lotes
 * para mejorar la performance y reducir el número de requests HTTP.
 */

// Simulación de uso del SDK con múltiples eventos
function batchProcessingExample() {
  // Inicializar el SDK
  orwel.init({
    apiKey: 'orwel_xxxxxxxxxxxxx',
    debug: true,
    verbose: true
  });
  
  // Generar múltiples eventos rápidamente
  function generateMultipleEvents() {
    console.log('🚀 Generating multiple events...');
    
    // Evento de seguimiento de página
    orwel.track('page_view', {
      path: '/dashboard',
      loadTime: 1200,
      referrer: 'google.com'
    });
    
    // Varios eventos de interacción
    orwel.track('button_click', {
      buttonId: 'cta-header',
      position: 'top',
      campaign: 'summer_sale'
    });
    
    orwel.track('form_interaction', {
      formId: 'newsletter-signup',
      field: 'email',
      action: 'focus'
    });
    
    // Conversión
    orwel.conversion('newsletter_signup', {
      email: 'user@example.com',
      source: 'header_form',
      campaign: 'summer_sale'
    });
    
    // Actualización de sesión
    orwel.session({
      experiment: 'checkout_flow_v2',
      variant: 'simplified',
      engagementScore: 85
    });
    
    console.log('✅ Events queued for batch processing');
  }
  
  // Función para demostrar el flush manual
  async function demonstrateBatchFlush() {
    console.log('📦 Manually flushing event queue...');
    
    const result = await orwel.flush();
    
    if (result.success) {
      console.log(`✅ Batch flush successful! Sent ${result.count} events in a single request`);
    } else {
      console.log(`❌ Batch flush failed. ${result.count} events were processed.`);
    }
  }
  
  // Demostrar el procesamiento en lotes
  generateMultipleEvents();
  
  // Esperar un momento y luego hacer flush manual
  setTimeout(async () => {
    await demonstrateBatchFlush();
  }, 2000);
  
  console.log('📝 Batch Processing Features:');
  console.log('  • Events are sent together in a single HTTP request');
  console.log('  • Reduces network overhead and improves performance');
  console.log('  • Automatic fallback to individual sends if batch fails');
  console.log('  • Circuit breaker prevents spam on server errors');
  console.log('  • Partial failure handling for robust error recovery');
}

// ======== ESTRUCTURA DEL PAYLOAD DE LOTE ========

/**
 * Ejemplo de cómo se ve el payload cuando se envían eventos en lote
 */
const exampleBatchPayload = {
  batchId: 'batch_1640995200000_abc123def',
  count: 5,
  events: [
    {
      type: 'track',
      code: 'page_view',
      properties: {
        path: '/dashboard',
        loadTime: 1200,
        referrer: 'google.com'
      },
      visitor: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        // ... otros datos del visitante
      },
      session: {
        id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        // ... otros datos de sesión
      },
      timestamp: '2024-01-01T12:00:00.000Z'
    },
    {
      type: 'track',
      code: 'button_click',
      properties: {
        buttonId: 'cta-header',
        position: 'top',
        campaign: 'summer_sale'
      },
      visitor: { /* mismos datos */ },
      session: { /* mismos datos */ },
      timestamp: '2024-01-01T12:00:01.000Z'
    },
    {
      type: 'conversion',
      code: 'newsletter_signup',
      properties: {
        email: 'user@example.com',
        source: 'header_form',
        campaign: 'summer_sale'
      },
      visitor: { /* mismos datos */ },
      session: { /* mismos datos */ },
      timestamp: '2024-01-01T12:00:02.000Z'
    }
    // ... más eventos
  ]
};

// ======== RESPUESTAS DEL SERVIDOR ========

/**
 * Ejemplos de respuestas del servidor para diferentes escenarios
 */
const serverResponses = {
  // Éxito completo (200)
  fullSuccess: {
    status: 200,
    body: {
      success: true,
      processed: 5,
      batchId: 'batch_1640995200000_abc123def'
    }
  },
  
  // Éxito parcial (207 Multi-Status)
  partialSuccess: {
    status: 207,
    body: {
      success: false,
      processed: 3,
      failed: 2,
      batchId: 'batch_1640995200000_abc123def',
      failedEvents: [
        { /* evento que falló */ },
        { /* otro evento que falló */ }
      ]
    }
  },
  
  // Error completo (500)
  fullFailure: {
    status: 500,
    body: {
      error: 'Internal server error'
    }
  }
};

// ======== BENEFICIOS DEL PROCESAMIENTO EN LOTES ========

/**
 * Comparación de performance entre envío individual y en lotes
 */
const performanceComparison = {
  individual: {
    events: 10,
    httpRequests: 10,
    totalTime: '~5-10 segundos (dependiendo de latencia)',
    networkOverhead: 'Alto (10 requests HTTP)',
    serverLoad: 'Alto (10 conexiones simultáneas)'
  },
  
  batch: {
    events: 10,
    httpRequests: 1,
    totalTime: '~0.5-1 segundo',
    networkOverhead: 'Bajo (1 request HTTP)',
    serverLoad: 'Bajo (1 conexión)'
  },
  
  improvements: {
    speedup: '5-10x más rápido',
    networkReduction: '90% menos requests',
    serverLoadReduction: '90% menos conexiones'
  }
};

// Ejecutar el ejemplo si se llama directamente
if (typeof window !== 'undefined' && window.orwel) {
  batchProcessingExample();
}

export { batchProcessingExample, exampleBatchPayload, serverResponses, performanceComparison }; 