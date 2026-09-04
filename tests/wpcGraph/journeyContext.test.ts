// tests/wpcGraph/journeyContext.test.ts
// Unit tests for buildJourneyContext.
// Covers: Maria authored-return, per-patient derivation, unknown-id safety.

import { describe, it, expect } from 'vitest';
import { buildJourneyContext } from '@/lib/wpcGraph/journeyContext';

const MARIA_ID = 'MARIA_SD_001';
const KNOWN_IDS = ['PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'];

// ── Maria authored-return ─────────────────────────────────────────────────────

describe('buildJourneyContext — Maria branch', () => {
  it('returns authored member name for MARIA_SD_001', () => {
    const ctx = buildJourneyContext(MARIA_ID);
    expect(ctx.memberName).toBe('Maria Redhawk');
    expect(ctx.memberId).toBe('MARIA_SD_001');
  });

  it('returns authored active window for MARIA_SD_001', () => {
    const ctx = buildJourneyContext(MARIA_ID);
    expect(ctx.activeWindowStart).toBe(15);
    expect(ctx.activeWindowEnd).toBe(19);
    expect(ctx.activeWindowLabel).toBe('3:00 PM – 7:00 PM');
  });

  it('returns authored suppression window for MARIA_SD_001', () => {
    const ctx = buildJourneyContext(MARIA_ID);
    expect(ctx.suppressionStart).toBe(6);
    expect(ctx.suppressionEnd).toBe(14);
  });

  it('returns authored interactions (15 entries) for MARIA_SD_001', () => {
    const ctx = buildJourneyContext(MARIA_ID);
    expect(ctx.interactions).toHaveLength(15);
  });

  it('preferred channel is SMS for MARIA_SD_001 (no broadband)', () => {
    const ctx = buildJourneyContext(MARIA_ID);
    expect(ctx.preferredChannel).toBe('SMS');
  });
});

// ── Per-patient derivation ────────────────────────────────────────────────────

describe('buildJourneyContext — registry-derived branch', () => {
  it.each(KNOWN_IDS)('returns the patient name (not Maria) for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.memberName).not.toBe('Maria Redhawk');
    expect(ctx.memberId).toBe(id);
  });

  it.each(KNOWN_IDS)('activeWindowStart is a valid hour (0-23) for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.activeWindowStart).toBeGreaterThanOrEqual(0);
    expect(ctx.activeWindowStart).toBeLessThanOrEqual(23);
  });

  it.each(KNOWN_IDS)('activeWindowEnd > activeWindowStart for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.activeWindowEnd).toBeGreaterThan(ctx.activeWindowStart);
  });

  it.each(KNOWN_IDS)('channels array is non-empty for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.channels.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_IDS)('suppressionRules array is non-empty for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.suppressionRules.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_IDS)('interactions array is non-empty for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.interactions.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_IDS)('conversionData array is non-empty for %s', (id) => {
    const ctx = buildJourneyContext(id);
    expect(ctx.conversionData.length).toBeGreaterThan(0);
  });
});

// ── Unknown id safety ────────────────────────────────────────────────────────

describe('buildJourneyContext — unknown id', () => {
  it('returns a safe default context for an unrecognised id', () => {
    expect(() => buildJourneyContext('UNKNOWN-9999')).not.toThrow();
  });

  it('labels unknown member clearly', () => {
    const ctx = buildJourneyContext('UNKNOWN-9999');
    expect(ctx.memberName).toBe('Unknown Patient');
    expect(ctx.memberId).toBe('UNKNOWN-9999');
  });

  it('returns empty interactions for unknown id', () => {
    const ctx = buildJourneyContext('UNKNOWN-9999');
    expect(ctx.interactions).toHaveLength(0);
  });
});
