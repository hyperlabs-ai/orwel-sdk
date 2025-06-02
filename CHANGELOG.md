# Changelog

## 1.2.0 (2025-06-02)

### Mejoras de Seguridad

- **Encriptación de datos**: Implementado módulo de encriptación para datos almacenados localmente
  - Utiliza Web Crypto API cuando está disponible
  - Implementa fallback para navegadores sin soporte
  - Encripta datos de visitantes, sesiones y cola de eventos

- **Validación estricta de entrada**: Añadido módulo de validación para sanitizar y validar datos
  - Validación de códigos de eventos, propiedades y datos de visitantes
  - Sanitización de mensajes de error para evitar exponer información sensible
  - Implementación de límites estrictos para tamaños de datos

### Mejoras de Rendimiento

- **Procesamiento en chunks**: Implementado procesamiento en chunks para arrays grandes
  - Evita bloquear el hilo principal durante operaciones largas
  - Mejora la experiencia del usuario durante envíos masivos de eventos

- **Optimización de beforeunload**: Mejorado el manejo de eventos durante la descarga de la página
  - Utiliza sendBeacon cuando está disponible
  - Implementa fallback a XHR síncrono cuando es necesario

- **Límites y políticas de limpieza**: Implementados límites estrictos para la cola de eventos
  - Límite de edad para eventos (7 días)
  - Limpieza automática de eventos antiguos
  - Mejora en la gestión de cola llena

### Mejoras de Fiabilidad

- **Reintentos con backoff exponencial**: Implementada estrategia de reintentos para operaciones fallidas
  - Backoff exponencial con jitter para evitar tormentas de reintentos
  - Circuit breaker para evitar sobrecarga del servidor
  - Configuración flexible de políticas de reintentos

- **Manejo mejorado de errores**: Estandarizado el manejo de errores en todo el SDK
  - Mensajes de error más descriptivos y útiles
  - Sanitización de información sensible en mensajes de error
  - Mejor registro de errores para depuración

### Otras Mejoras

- **Pruebas unitarias**: Añadidas pruebas para los nuevos módulos
  - Pruebas para encriptación, validación, reintentos y operaciones asíncronas
  - Configuración de Jest para pruebas automatizadas

- **Documentación**: Mejorada la documentación interna del código
  - Comentarios JSDoc para todas las funciones públicas
  - Ejemplos de uso en comentarios
  - Explicaciones detalladas de algoritmos complejos

## 1.1.0 (Versión anterior)

- Implementación inicial del SDK
- Soporte para seguimiento de eventos
- Identificación de visitantes
- Gestión de sesiones
- Monitoreo automático
- Detección automática de eventos

