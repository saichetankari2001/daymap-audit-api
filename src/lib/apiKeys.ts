import crypto from 'crypto';

const KEY_PREFIX = 'dma_';

/** Generates a new raw API key. Shown to the caller once, never stored. */
export function generateRawKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

/** Hashes a raw key for storage/lookup — we never store the raw key itself. */
export function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}
