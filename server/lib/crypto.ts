/**
 * AES-256-GCM encryption for broker account passwords.
 * Uses COPY_ENCRYPTION_KEY (same key as copy trading credentials).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY_ENV = process.env.COPY_ENCRYPTION_KEY ?? '';

function getKey(): Buffer {
  if (!KEY_ENV) throw new Error('COPY_ENCRYPTION_KEY is not set');
  // Key must be 32 bytes. Hex string → buffer, or raw string padded/truncated.
  if (/^[0-9a-fA-F]{64}$/.test(KEY_ENV)) return Buffer.from(KEY_ENV, 'hex');
  const buf = Buffer.alloc(32);
  Buffer.from(KEY_ENV).copy(buf);
  return buf;
}

/** Encrypt plaintext → base64-encoded "iv:tag:ciphertext" */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decrypt "iv:tag:ciphertext" → plaintext */
export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, tagHex, encHex] = encoded.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted value format');
  const iv      = Buffer.from(ivHex, 'hex');
  const tag     = Buffer.from(tagHex, 'hex');
  const encData = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encData).toString('utf8') + decipher.final('utf8');
}

/** Safe decrypt — returns null instead of throwing on malformed input. */
export function safeDecrypt(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  try { return decrypt(encoded); } catch { return null; }
}
