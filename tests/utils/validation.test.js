/**
 * Tests para el módulo de validación
 */

import {
  validateEventCode,
  validatePropertyName,
  validatePropertyValue,
  validateProperties,
  validateVisitorId,
  validateSessionId,
  validateEvent,
  sanitizeErrorMessage,
  ValidationError,
  ValidationErrorType
} from '../../src/utils/validation';

describe('Validation Module', () => {
  describe('validateEventCode', () => {
    test('should accept valid event codes', () => {
      // No debería lanzar error
      expect(() => validateEventCode('page_view')).not.toThrow();
      expect(() => validateEventCode('add-to-cart')).not.toThrow();
      expect(() => validateEventCode('checkout.complete')).not.toThrow();
      expect(() => validateEventCode('user_123')).not.toThrow();
    });

    test('should reject invalid event codes', () => {
      // Debería lanzar error
      expect(() => validateEventCode('')).toThrow(ValidationError);
      expect(() => validateEventCode('   ')).toThrow(ValidationError);
      expect(() => validateEventCode('invalid@code')).toThrow(ValidationError);
      expect(() => validateEventCode('a'.repeat(65))).toThrow(ValidationError);
      expect(() => validateEventCode(123)).toThrow(ValidationError);
    });
  });

  describe('validatePropertyName', () => {
    test('should accept valid property names', () => {
      expect(() => validatePropertyName('name')).not.toThrow();
      expect(() => validatePropertyName('user_id')).not.toThrow();
      expect(() => validatePropertyName('product-price')).not.toThrow();
    });

    test('should reject invalid property names', () => {
      expect(() => validatePropertyName('')).toThrow(ValidationError);
      expect(() => validatePropertyName('id')).toThrow(ValidationError); // Reservado
      expect(() => validatePropertyName('_private')).toThrow(ValidationError); // Comienza con _
      expect(() => validatePropertyName('a'.repeat(65))).toThrow(ValidationError); // Demasiado largo
    });
  });

  describe('validatePropertyValue', () => {
    test('should accept valid property values', () => {
      expect(() => validatePropertyValue('string value')).not.toThrow();
      expect(() => validatePropertyValue(123)).not.toThrow();
      expect(() => validatePropertyValue(true)).not.toThrow();
      expect(() => validatePropertyValue(null)).not.toThrow();
      expect(() => validatePropertyValue(undefined)).not.toThrow();
      expect(() => validatePropertyValue(new Date())).not.toThrow();
      expect(() => validatePropertyValue([1, 2, 3])).not.toThrow();
      expect(() => validatePropertyValue({ key: 'value' })).not.toThrow();
    });

    test('should reject invalid property values', () => {
      // String demasiado largo
      expect(() => validatePropertyValue('a'.repeat(1001))).toThrow(ValidationError);
      
      // Array demasiado grande
      const largeArray = Array(1001).fill('item');
      expect(() => validatePropertyValue(largeArray)).toThrow(ValidationError);
      
      // Objeto con demasiadas propiedades
      const largeObject = {};
      for (let i = 0; i < 101; i++) {
        largeObject[`key${i}`] = i;
      }
      expect(() => validatePropertyValue(largeObject)).toThrow(ValidationError);
      
      // Función (no serializable)
      expect(() => validatePropertyValue(() => {})).toThrow(ValidationError);
    });
  });

  describe('validateProperties', () => {
    test('should validate and sanitize properties object', () => {
      const properties = {
        name: 'Test',
        age: 30,
        active: true,
        tags: ['tag1', 'tag2'],
        metadata: {
          source: 'web',
          version: '1.0'
        }
      };
      
      const result = validateProperties(properties);
      expect(result).toEqual(properties);
    });

    test('should reject invalid properties object', () => {
      expect(() => validateProperties(null)).toThrow(ValidationError);
      expect(() => validateProperties('not an object')).toThrow(ValidationError);
      expect(() => validateProperties([1, 2, 3])).toThrow(ValidationError);
    });
  });

  describe('validateVisitorId and validateSessionId', () => {
    test('should accept valid UUIDs', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => validateVisitorId(validUUID)).not.toThrow();
      expect(() => validateSessionId(validUUID)).not.toThrow();
    });

    test('should reject invalid UUIDs', () => {
      expect(() => validateVisitorId('')).toThrow(ValidationError);
      expect(() => validateVisitorId('not-a-uuid')).toThrow(ValidationError);
      expect(() => validateSessionId('')).toThrow(ValidationError);
      expect(() => validateSessionId('invalid-format')).toThrow(ValidationError);
    });
  });

  describe('validateEvent', () => {
    test('should validate complete events', () => {
      const properties = { price: 99.99, currency: 'USD' };
      const result = validateEvent('track', 'purchase', properties);
      expect(result).toEqual(properties);
    });

    test('should reject events with invalid type', () => {
      expect(() => validateEvent('', 'code', {})).toThrow(ValidationError);
      expect(() => validateEvent(null, 'code', {})).toThrow(ValidationError);
    });

    test('should reject track events with invalid code', () => {
      expect(() => validateEvent('track', '', {})).toThrow(ValidationError);
      expect(() => validateEvent('track', 'invalid@code', {})).toThrow(ValidationError);
    });
  });

  describe('sanitizeErrorMessage', () => {
    test('should sanitize sensitive information from error messages', () => {
      // Error con URL
      const errorWithUrl = new Error('Failed to connect to https://api.example.com/secret?apiKey=12345');
      const sanitizedUrl = sanitizeErrorMessage(errorWithUrl);
      expect(sanitizedUrl).not.toContain('https://api.example.com/secret');
      expect(sanitizedUrl).toContain('[URL REDACTED]');
      
      // Error con API key
      const errorWithApiKey = new Error('Invalid apiKey="secret123"');
      const sanitizedApiKey = sanitizeErrorMessage(errorWithApiKey);
      expect(sanitizedApiKey).not.toContain('secret123');
      expect(sanitizedApiKey).toContain('apiKey=[REDACTED]');
      
      // Error de validación (no se sanitiza)
      const validationError = new ValidationError(
        ValidationErrorType.INVALID_EVENT_CODE,
        'Invalid event code format',
        'code'
      );
      const sanitizedValidation = sanitizeErrorMessage(validationError);
      expect(sanitizedValidation).toContain('Invalid event code format');
      expect(sanitizedValidation).toContain('field: code');
    });
  });
});

