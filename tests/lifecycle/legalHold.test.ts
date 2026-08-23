/**
 * Legal-hold registry — place / release / isHeld, deterministic audit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clock from '@/lib/clock';
import { createLegalHoldRegistry } from '@/lib/lifecycle';

describe('legal-hold registry', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-23T00:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('place makes a subject held; release clears it', () => {
    const r = createLegalHoldRegistry();
    expect(r.isHeld('mem-1')).toBe(false);
    const { hold, audit } = r.place({ subjectRef: 'mem-1', reason: 'litigation', placedBy: 'legal:1' });
    expect(r.isHeld('mem-1')).toBe(true);
    expect(hold.releasedAt).toBeNull();
    expect(audit.action).toBe('lifecycle.legal-hold.place');
    expect(audit.subjectRef).toBe('mem-1');

    const rel = r.release('mem-1', 'legal:1');
    expect(rel?.hold.releasedAt).toBe('2026-08-23T00:00:00.000Z');
    expect(rel?.audit.action).toBe('lifecycle.legal-hold.release');
    expect(r.isHeld('mem-1')).toBe(false);
  });

  it('placing twice on one subject is idempotent (returns the existing hold)', () => {
    const r = createLegalHoldRegistry();
    const first = r.place({ subjectRef: 'mem-2', reason: 'a', placedBy: 'legal' });
    const second = r.place({ subjectRef: 'mem-2', reason: 'b', placedBy: 'legal' });
    expect(second.hold.id).toBe(first.hold.id);
    expect(r.listActive()).toHaveLength(1);
  });

  it('release on an unheld subject returns null', () => {
    const r = createLegalHoldRegistry();
    expect(r.release('nobody', 'legal')).toBeNull();
  });

  it('history retains released holds (append-only audit of holds)', () => {
    const r = createLegalHoldRegistry();
    r.place({ subjectRef: 'mem-3', reason: 'x', placedBy: 'legal' });
    r.release('mem-3', 'legal');
    const hist = r.history();
    expect(hist).toHaveLength(1);
    expect(hist[0].releasedBy).toBe('legal');
    expect(r.listActive()).toHaveLength(0);
  });
});
