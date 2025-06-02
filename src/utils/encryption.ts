/**
 * Módulo de encriptación para datos almacenados localmente
 * Utiliza Web Crypto API cuando está disponible con fallback para navegadores que no la soportan
 */

// Clave de encriptación derivada del dominio y otros factores para aumentar la seguridad
const ENCRYPTION_KEY_SALT = 'orwel-sdk-encryption';
const ENCRYPTION_IV_LENGTH = 12; // 12 bytes para GCM
const ENCRYPTION_TAG_LENGTH = 16; // 16 bytes para GCM

/**
 * Verifica si la Web Crypto API está disponible en el navegador
 */
export const isWebCryptoAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && 
           window.crypto !== undefined && 
           window.crypto.subtle !== undefined;
  } catch (e) {
    return false;
  }
};

/**
 * Genera una clave de encriptación basada en el dominio y otros factores
 * para aumentar la seguridad y consistencia entre sesiones
 */
export const generateEncryptionKey = async (): Promise<CryptoKey | null> => {
  if (!isWebCryptoAvailable()) {
    return null;
  }

  try {
    // Crear un material de clave basado en el dominio y otros factores
    const domain = window.location.hostname || 'localhost';
    const keyMaterial = `${domain}-${ENCRYPTION_KEY_SALT}-${navigator.userAgent.slice(0, 10)}`;
    
    // Convertir el material de clave a un ArrayBuffer
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyMaterial);
    
    // Derivar una clave usando PBKDF2
    const salt = encoder.encode(ENCRYPTION_KEY_SALT);
    
    // Importar el material de clave
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    // Derivar la clave de encriptación
    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (e) {
    console.error('[Orwel SDK] Error generating encryption key:', e);
    return null;
  }
};

/**
 * Encripta datos usando AES-GCM con la Web Crypto API
 * @param data Datos a encriptar
 * @returns Datos encriptados en formato Base64 o null si falla
 */
export const encrypt = async (data: string): Promise<string | null> => {
  if (!isWebCryptoAvailable()) {
    return fallbackEncrypt(data);
  }

  try {
    const key = await generateEncryptionKey();
    if (!key) {
      return fallbackEncrypt(data);
    }

    // Generar un vector de inicialización aleatorio
    const iv = window.crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_LENGTH));
    
    // Encriptar los datos
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: ENCRYPTION_TAG_LENGTH * 8
      },
      key,
      dataBuffer
    );
    
    // Combinar IV y datos encriptados
    const result = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convertir a Base64
    return btoa(String.fromCharCode(...result));
  } catch (e) {
    console.error('[Orwel SDK] Encryption error:', e);
    return fallbackEncrypt(data);
  }
};

/**
 * Desencripta datos usando AES-GCM con la Web Crypto API
 * @param encryptedData Datos encriptados en formato Base64
 * @returns Datos desencriptados o null si falla
 */
export const decrypt = async (encryptedData: string): Promise<string | null> => {
  // Verificar si los datos están encriptados
  if (!encryptedData.startsWith('ENC:')) {
    return encryptedData; // No está encriptado, devolver como está
  }
  
  const actualData = encryptedData.substring(4); // Quitar el prefijo 'ENC:'
  
  if (!isWebCryptoAvailable()) {
    return fallbackDecrypt(actualData);
  }

  try {
    const key = await generateEncryptionKey();
    if (!key) {
      return fallbackDecrypt(actualData);
    }
    
    // Convertir de Base64 a ArrayBuffer
    const encryptedBytes = Uint8Array.from(atob(actualData), c => c.charCodeAt(0));
    
    // Extraer IV y datos encriptados
    const iv = encryptedBytes.slice(0, ENCRYPTION_IV_LENGTH);
    const encryptedBuffer = encryptedBytes.slice(ENCRYPTION_IV_LENGTH);
    
    // Desencriptar los datos
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: ENCRYPTION_TAG_LENGTH * 8
      },
      key,
      encryptedBuffer
    );
    
    // Convertir a string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (e) {
    console.error('[Orwel SDK] Decryption error:', e);
    return fallbackDecrypt(actualData);
  }
};

/**
 * Método de encriptación de fallback para navegadores sin soporte para Web Crypto API
 * Usa una encriptación simple basada en XOR
 * @param data Datos a encriptar
 * @returns Datos encriptados en formato Base64 con prefijo 'ENC:'
 */
const fallbackEncrypt = (data: string): string => {
  try {
    // Generar una clave simple basada en el dominio
    const domain = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'fallback';
    const key = generateFallbackKey(domain);
    
    // Encriptar usando XOR
    let result = '';
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i) ^ key[i % key.length];
      result += String.fromCharCode(charCode);
    }
    
    // Convertir a Base64 y añadir prefijo
    return 'ENC:' + btoa(result);
  } catch (e) {
    console.error('[Orwel SDK] Fallback encryption error:', e);
    return data; // Devolver datos sin encriptar en caso de error
  }
};

/**
 * Método de desencriptación de fallback para navegadores sin soporte para Web Crypto API
 * @param encryptedData Datos encriptados en formato Base64
 * @returns Datos desencriptados
 */
const fallbackDecrypt = (encryptedData: string): string => {
  try {
    // Generar la misma clave usada para encriptar
    const domain = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'fallback';
    const key = generateFallbackKey(domain);
    
    // Convertir de Base64
    const data = atob(encryptedData);
    
    // Desencriptar usando XOR
    let result = '';
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i) ^ key[i % key.length];
      result += String.fromCharCode(charCode);
    }
    
    return result;
  } catch (e) {
    console.error('[Orwel SDK] Fallback decryption error:', e);
    return ''; // Devolver string vacío en caso de error
  }
};

/**
 * Genera una clave simple para el método de fallback
 * @param seed Semilla para generar la clave
 * @returns Array de números para usar como clave
 */
const generateFallbackKey = (seed: string): number[] => {
  const key = [];
  let sum = 0;
  
  // Generar una clave basada en la semilla
  for (let i = 0; i < seed.length; i++) {
    sum += seed.charCodeAt(i);
    key.push(sum % 256);
  }
  
  // Asegurar que la clave tenga al menos 16 bytes
  while (key.length < 16) {
    const lastValue = key[key.length - 1] || 1;
    key.push((lastValue * 13 + 7) % 256);
  }
  
  return key;
};

/**
 * Verifica si una cadena está encriptada
 * @param data Datos a verificar
 * @returns true si los datos están encriptados
 */
export const isEncrypted = (data: string): boolean => {
  return typeof data === 'string' && data.startsWith('ENC:');
};

/**
 * Encripta un objeto JSON
 * @param data Objeto a encriptar
 * @returns Cadena encriptada o null si falla
 */
export const encryptObject = async <T>(data: T): Promise<string | null> => {
  try {
    const jsonString = JSON.stringify(data);
    return await encrypt(jsonString);
  } catch (e) {
    console.error('[Orwel SDK] Error encrypting object:', e);
    return null;
  }
};

/**
 * Desencripta un objeto JSON
 * @param encryptedData Datos encriptados
 * @returns Objeto desencriptado o null si falla
 */
export const decryptObject = async <T>(encryptedData: string): Promise<T | null> => {
  try {
    const jsonString = await decrypt(encryptedData);
    if (!jsonString) return null;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error('[Orwel SDK] Error decrypting object:', e);
    return null;
  }
};

