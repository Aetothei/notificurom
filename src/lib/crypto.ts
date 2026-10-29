import crypto from 'crypto';

const FALLBACK_DEV_SECRET = 'notificurom-default-dev-session-secret-change-in-prod-32b';

function getRawSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 16) {
    return secret.trim();
  }
  return FALLBACK_DEV_SECRET;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(getRawSecret()).digest();
}

/**
 * Generates an irreversible HMAC-SHA256 hex digest using SESSION_SECRET.
 * Used for userHash and itemHash so no plaintext IDs or repo names are stored in SQLite.
 */
export function hmacHash(input: string): string {
  return crypto.createHmac('sha256', getRawSecret()).update(input).digest('hex');
}

export function computeUserHash(githubId: string | number): string {
  return hmacHash(`user:${String(githubId)}`);
}

export function computeItemHash(userHash: string, sourceId: string): string {
  return hmacHash(`${userHash}:${sourceId}`);
}

/**
 * Encrypts a JSON-serializable payload using AES-256-GCM.
 * Format: base64url(iv).base64url(authTag).base64url(ciphertext)
 */
export function encryptData<T>(payload: T): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Decrypts a string produced by encryptData. Returns null if tampered or invalid.
 */
export function decryptData<T>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(dataB64, 'base64url');

    if (iv.length !== 12 || authTag.length !== 16) return null;

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}
