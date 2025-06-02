/**
 * Módulo de validación para sanitizar y validar datos de entrada
 * Proporciona funciones para validar eventos, propiedades y datos de visitantes
 */

import { sanitizeData } from '../utils';

// Constantes para validación
const MAX_STRING_LENGTH = 1000;
const MAX_PROPERTY_KEYS = 100;
const MAX_PROPERTY_DEPTH = 5;
const MAX_ARRAY_LENGTH = 1000;
const VALID_EVENT_CODE_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
const RESERVED_PROPERTY_NAMES = ['id', 'timestamp', 'type', 'visitor', 'session'];

// Tipos de errores de validación
export enum ValidationErrorType {
  INVALID_EVENT_CODE = 'INVALID_EVENT_CODE',
  INVALID_PROPERTY_NAME = 'INVALID_PROPERTY_NAME',
  INVALID_PROPERTY_VALUE = 'INVALID_PROPERTY_VALUE',
  RESERVED_PROPERTY_NAME = 'RESERVED_PROPERTY_NAME',
  PROPERTY_TOO_LARGE = 'PROPERTY_TOO_LARGE',
  INVALID_VISITOR_ID = 'INVALID_VISITOR_ID',
  INVALID_SESSION_ID = 'INVALID_SESSION_ID',
  INVALID_TYPE = 'INVALID_TYPE',
}

// Clase de error de validación
export class ValidationError extends Error {
  type: ValidationErrorType;
  field?: string;
  
  constructor(type: ValidationErrorType, message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.type = type;
    this.field = field;
  }
}

/**
 * Valida un código de evento
 * @param code Código de evento a validar
 * @throws ValidationError si el código no es válido
 */
export const validateEventCode = (code: string): void => {
  if (!code || typeof code !== 'string') {
    throw new ValidationError(
      ValidationErrorType.INVALID_EVENT_CODE,
      'Event code must be a non-empty string',
      'code'
    );
  }
  
  if (!VALID_EVENT_CODE_REGEX.test(code)) {
    throw new ValidationError(
      ValidationErrorType.INVALID_EVENT_CODE,
      'Event code must contain only alphanumeric characters, underscores, dots, and hyphens (1-64 chars)',
      'code'
    );
  }
};

/**
 * Valida un nombre de propiedad
 * @param name Nombre de propiedad a validar
 * @throws ValidationError si el nombre no es válido
 */
export const validatePropertyName = (name: string): void => {
  if (!name || typeof name !== 'string') {
    throw new ValidationError(
      ValidationErrorType.INVALID_PROPERTY_NAME,
      'Property name must be a non-empty string',
      name
    );
  }
  
  if (RESERVED_PROPERTY_NAMES.includes(name)) {
    throw new ValidationError(
      ValidationErrorType.RESERVED_PROPERTY_NAME,
      `Property name '${name}' is reserved and cannot be used`,
      name
    );
  }
  
  if (name.startsWith('_')) {
    throw new ValidationError(
      ValidationErrorType.RESERVED_PROPERTY_NAME,
      `Property names starting with underscore are reserved for internal use`,
      name
    );
  }
  
  if (name.length > 64) {
    throw new ValidationError(
      ValidationErrorType.INVALID_PROPERTY_NAME,
      'Property name must be 64 characters or less',
      name
    );
  }
};

/**
 * Valida un valor de propiedad
 * @param value Valor a validar
 * @param propertyPath Ruta de la propiedad (para errores anidados)
 * @throws ValidationError si el valor no es válido
 */
export const validatePropertyValue = (value: any, propertyPath: string = ''): void => {
  if (value === undefined || value === null) {
    return; // Permitir valores nulos/undefined
  }
  
  const type = typeof value;
  
  // Validar tipos primitivos
  if (type === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new ValidationError(
        ValidationErrorType.PROPERTY_TOO_LARGE,
        `String property is too long (max ${MAX_STRING_LENGTH} characters)`,
        propertyPath
      );
    }
    return;
  }
  
  if (type === 'number' || type === 'boolean') {
    return; // Números y booleanos son válidos
  }
  
  // Validar fechas
  if (value instanceof Date) {
    return; // Las fechas son válidas
  }
  
  // Validar arrays
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new ValidationError(
        ValidationErrorType.PROPERTY_TOO_LARGE,
        `Array property is too large (max ${MAX_ARRAY_LENGTH} items)`,
        propertyPath
      );
    }
    
    // Validar cada elemento del array
    for (let i = 0; i < value.length; i++) {
      validatePropertyValue(value[i], propertyPath ? `${propertyPath}[${i}]` : `[${i}]`);
    }
    return;
  }
  
  // Validar objetos
  if (type === 'object') {
    const keys = Object.keys(value);
    if (keys.length > MAX_PROPERTY_KEYS) {
      throw new ValidationError(
        ValidationErrorType.PROPERTY_TOO_LARGE,
        `Object has too many properties (max ${MAX_PROPERTY_KEYS})`,
        propertyPath
      );
    }
    
    // Validar cada propiedad del objeto
    for (const key of keys) {
      validatePropertyName(key);
      validatePropertyValue(
        value[key], 
        propertyPath ? `${propertyPath}.${key}` : key
      );
    }
    return;
  }
  
  // Rechazar otros tipos (funciones, símbolos, etc.)
  throw new ValidationError(
    ValidationErrorType.INVALID_TYPE,
    `Invalid property type: ${type}`,
    propertyPath
  );
};

/**
 * Valida un objeto de propiedades completo
 * @param properties Objeto de propiedades a validar
 * @returns Objeto de propiedades sanitizado
 * @throws ValidationError si alguna propiedad no es válida
 */
export const validateProperties = (properties: Record<string, any>): Record<string, any> => {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new ValidationError(
      ValidationErrorType.INVALID_TYPE,
      'Properties must be an object',
      'properties'
    );
  }
  
  // Validar cada propiedad
  const keys = Object.keys(properties);
  for (const key of keys) {
    validatePropertyName(key);
    validatePropertyValue(properties[key], key);
  }
  
  // Sanitizar los datos para asegurar que son serializables
  return sanitizeData(properties, {
    maxDepth: MAX_PROPERTY_DEPTH,
    maxKeys: MAX_PROPERTY_KEYS,
    maxStringLength: MAX_STRING_LENGTH
  });
};

/**
 * Valida un ID de visitante
 * @param visitorId ID de visitante a validar
 * @throws ValidationError si el ID no es válido
 */
export const validateVisitorId = (visitorId: string): void => {
  if (!visitorId || typeof visitorId !== 'string') {
    throw new ValidationError(
      ValidationErrorType.INVALID_VISITOR_ID,
      'Visitor ID must be a non-empty string',
      'visitorId'
    );
  }
  
  // Validar formato UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(visitorId)) {
    throw new ValidationError(
      ValidationErrorType.INVALID_VISITOR_ID,
      'Visitor ID must be a valid UUID',
      'visitorId'
    );
  }
};

/**
 * Valida un ID de sesión
 * @param sessionId ID de sesión a validar
 * @throws ValidationError si el ID no es válido
 */
export const validateSessionId = (sessionId: string): void => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new ValidationError(
      ValidationErrorType.INVALID_SESSION_ID,
      'Session ID must be a non-empty string',
      'sessionId'
    );
  }
  
  // Validar formato UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    throw new ValidationError(
      ValidationErrorType.INVALID_SESSION_ID,
      'Session ID must be a valid UUID',
      'sessionId'
    );
  }
};

/**
 * Sanitiza un mensaje de error para evitar exponer información sensible
 * @param error Error a sanitizar
 * @returns Mensaje de error sanitizado
 */
export const sanitizeErrorMessage = (error: unknown): string => {
  if (error instanceof ValidationError) {
    // Para errores de validación, podemos mostrar el mensaje completo
    return `Validation error: ${error.message}${error.field ? ` (field: ${error.field})` : ''}`;
  }
  
  if (error instanceof Error) {
    // Para otros errores, sanitizamos el mensaje
    const message = error.message || 'Unknown error';
    // Eliminar posibles datos sensibles (URLs, tokens, etc.)
    return message
      .replace(/https?:\/\/[^\s"']+/g, '[URL REDACTED]')
      .replace(/apiKey[=:]["']?[^"'&\s]+["']?/gi, 'apiKey=[REDACTED]')
      .replace(/token[=:]["']?[^"'&\s]+["']?/gi, 'token=[REDACTED]')
      .replace(/password[=:]["']?[^"'&\s]+["']?/gi, 'password=[REDACTED]')
      .replace(/key[=:]["']?[^"'&\s]+["']?/gi, 'key=[REDACTED]');
  }
  
  // Para otros tipos, devolver un mensaje genérico
  return 'An error occurred';
};

/**
 * Valida un evento completo
 * @param eventType Tipo de evento
 * @param eventCode Código de evento (opcional para algunos tipos)
 * @param properties Propiedades del evento
 * @returns Propiedades sanitizadas
 * @throws ValidationError si el evento no es válido
 */
export const validateEvent = (
  eventType: string,
  eventCode?: string,
  properties?: Record<string, any>
): Record<string, any> => {
  // Validar tipo de evento
  if (!eventType || typeof eventType !== 'string') {
    throw new ValidationError(
      ValidationErrorType.INVALID_TYPE,
      'Event type must be a non-empty string',
      'type'
    );
  }
  
  // Para eventos de tipo 'track', validar el código
  if (eventType === 'track' && eventCode) {
    validateEventCode(eventCode);
  }
  
  // Validar y sanitizar propiedades
  const sanitizedProperties = properties ? validateProperties(properties) : {};
  
  return sanitizedProperties;
};

