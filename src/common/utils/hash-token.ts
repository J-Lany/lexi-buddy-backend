import { createHash } from 'crypto';

/** SHA-256 hex digest of a raw token. Used to store an indexable, irreversible
 * lookup key for tokens that must never be persisted in plaintext (e.g.
 * password reset tokens). Never log the raw token this is computed from. */
export function sha256Hex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
