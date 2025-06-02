/**
 * Tests para el módulo de encriptación
 */

import { 
  encrypt, 
  decrypt, 
  encryptObject, 
  decryptObject, 
  isEncrypted 
} from '../../src/utils/encryption';

describe('Encryption Module', () => {
  // Datos de prueba
  const testString = 'Test string for encryption';
  const testObject = { 
    id: 'test-id', 
    name: 'Test Name', 
    data: { 
      value: 123, 
      nested: { 
        array: [1, 2, 3] 
      } 
    } 
  };

  test('should encrypt and decrypt a string', async () => {
    const encrypted = await encrypt(testString);
    
    // Verificar que el resultado no es null
    expect(encrypted).not.toBeNull();
    
    // Verificar que el resultado está encriptado (diferente del original)
    expect(encrypted).not.toEqual(testString);
    
    // Verificar que el resultado está marcado como encriptado
    expect(isEncrypted(encrypted)).toBe(true);
    
    // Desencriptar y verificar que coincide con el original
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toEqual(testString);
  });

  test('should encrypt and decrypt an object', async () => {
    const encrypted = await encryptObject(testObject);
    
    // Verificar que el resultado no es null
    expect(encrypted).not.toBeNull();
    
    // Verificar que el resultado está encriptado
    expect(isEncrypted(encrypted)).toBe(true);
    
    // Desencriptar y verificar que coincide con el original
    const decrypted = await decryptObject(encrypted);
    expect(decrypted).toEqual(testObject);
  });

  test('should handle non-encrypted data correctly', async () => {
    // Verificar que datos no encriptados se devuelven sin cambios
    const result = await decrypt('Not encrypted data');
    expect(result).toEqual('Not encrypted data');
    
    // Verificar que isEncrypted detecta correctamente datos no encriptados
    expect(isEncrypted('Not encrypted data')).toBe(false);
  });

  test('should handle empty or null inputs', async () => {
    // Encriptar string vacío
    const encryptedEmpty = await encrypt('');
    expect(encryptedEmpty).not.toBeNull();
    const decryptedEmpty = await decrypt(encryptedEmpty);
    expect(decryptedEmpty).toEqual('');
    
    // Encriptar objeto vacío
    const encryptedEmptyObj = await encryptObject({});
    expect(encryptedEmptyObj).not.toBeNull();
    const decryptedEmptyObj = await decryptObject(encryptedEmptyObj);
    expect(decryptedEmptyObj).toEqual({});
  });

  test('should handle large objects', async () => {
    // Crear un objeto grande
    const largeObject = {
      array: Array(1000).fill(0).map((_, i) => ({ id: i, value: `Value ${i}` })),
      text: 'A'.repeat(10000)
    };
    
    // Encriptar y desencriptar
    const encrypted = await encryptObject(largeObject);
    expect(encrypted).not.toBeNull();
    
    const decrypted = await decryptObject(encrypted);
    expect(decrypted).toEqual(largeObject);
  });
});

