import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Correlation IDs (plan F-6). Every privileged server action mints or propagates
 * an `x-correlation-id` so a transaction can be traced across RHTP → APIM →
 * Ballerina → webhook.
 */

export const CORRELATION_HEADER = 'x-correlation-id';

/** RFC4122-ish id without pulling a dependency. */
export function newCorrelationId(): string {
  // Prefer the platform crypto.randomUUID when available (Node 18+ / edge).
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (non-cryptographic) — sufficient for a trace id.
  return 'cid-' + Math.abs(hash(String(clock.now()) + clock.rng())).toString(16);
}

/** Read an inbound correlation id from request headers, or mint a fresh one. */
export function correlationFrom(headers: Headers | Record<string, string | undefined>): string {
  const get = (k: string): string | undefined =>
    headers instanceof Headers ? (headers.get(k) ?? undefined) : headers[k];
  return get(CORRELATION_HEADER) || newCorrelationId();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
