/**
 * HW0 fingerprint primitives — direct unit tests (added in the E13 test-link fix).
 */
import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  canonicalJson,
  hashValue,
  fingerprintPanel,
  normalizeVolatile,
} from '../../src/lib/demoPreservation/fingerprint';

describe('fnv1a', () => {
  it('is deterministic, 8 hex chars, and distinct on change', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively so order does not matter', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]'); // array order preserved
  });
});

describe('hashValue', () => {
  it('hashes by canonical JSON (order-independent)', () => {
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe('normalizeVolatile', () => {
  it('redacts volatile keys and ISO datetimes so a fingerprint stays deterministic', () => {
    const norm = normalizeVolatile({ id: 'x', timestamp: '2026-01-01T00:00:00Z', at: '2026-02-02T03:04:05Z' }) as Record<string, unknown>;
    expect(norm.id).toBe('x');
    expect(norm.timestamp).toBe('<volatile>');
    // a bare ISO datetime value is redacted regardless of key
    expect(hashValue(normalizeVolatile({ x: '2026-01-01T00:00:00Z' }))).toBe(hashValue(normalizeVolatile({ x: '2030-09-09T09:09:09Z' })));
  });
});

describe('fingerprintPanel', () => {
  it('captures count, sorted ids, and a stable hash', () => {
    const fp = fingerprintPanel('p', [{ id: 'b' }, { id: 'a' }]);
    expect(fp.count).toBe(2);
    expect(fp.ids).toEqual(['a', 'b']);
    expect(fp.hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
