export type EncryptedKey = { version: 1; salt: string; iv: string; ciphertext: string }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!globalThis.crypto?.subtle) throw new Error('HTTPS is required for encrypted storage')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptKey(apiKey: string, password: string): Promise<EncryptedKey> {
  if (password.length < 10) throw new Error('Password must have at least 10 characters')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey))
  return { version: 1, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
}

export async function decryptKey(record: EncryptedKey, password: string) {
  if (record.version !== 1) throw new Error('Unsupported vault version')
  const key = await deriveKey(password, decode(record.salt))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.ciphertext))
  return new TextDecoder().decode(plaintext)
}