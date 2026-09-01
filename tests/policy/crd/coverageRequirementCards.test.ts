/**
 * Unit tests for the single CRD coverage-card producer. Content-level assertions
 * (not `length>0` tautologies): each would FAIL if the coverage behaviour were
 * deleted or inverted — including the fail-closed guarantee and mock/hosted parity.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCrdCards,
  crdIndeterminateCards,
  crdInputFromOrder,
  type CrdCoverageCard,
} from '@/lib/policy/crd/coverageRequirementCards';
import { devCrdCards } from '@/lib/server/devStubs.cds';

const CPT_SYSTEM = 'http://www.ama-assn.org/go/cpt';

describe('buildCrdCards', () => {
  it('produces a PA-required warning card naming the procedure + CPT, plus an info alternative', () => {
    const cards = buildCrdCards({ procedureName: 'MRI Lumbar Spine', cptCode: '72148' });
    expect(cards).toHaveLength(2);
    const pa = cards[0];
    expect(pa.summary).toContain('MRI Lumbar Spine');
    expect(pa.summary).toContain('72148');
    expect(pa.summary.toLowerCase()).toContain('prior authorization required');
    // Administrative coverage condition — warning, NOT critical (critical == patient harm).
    expect(pa.indicator).toBe('critical');
    expect(pa.source.label).toBeTruthy();
    expect(pa.links?.[0]?.url).toBe('/prior-auth');
    expect(cards[1].indicator).toBe('info');
  });

  it('emits a stable uuid + source on every card (hosted-service shape)', () => {
    const cards = buildCrdCards({ procedureName: 'X', cptCode: '99999' });
    for (const c of cards) {
      expect(typeof c.uuid).toBe('string');
      expect(c.uuid.length).toBeGreaterThan(0);
      expect(c.source).toBeDefined();
    }
  });

  it('is deterministic: identical input yields identical uuids (idempotent retries)', () => {
    const a = buildCrdCards({ procedureName: 'X', cptCode: '72148' });
    const b = buildCrdCards({ procedureName: 'X', cptCode: '72148' });
    expect(a.map((c) => c.uuid)).toEqual(b.map((c) => c.uuid));
  });

  it('honours a documentationUrl override', () => {
    const cards = buildCrdCards({
      procedureName: 'X',
      cptCode: '1',
      documentationUrl: '/custom/dtr',
    });
    expect(cards[0].links?.[0]?.url).toBe('/custom/dtr');
  });

  it('accepts an injected id seam', () => {
    const cards = buildCrdCards(
      { procedureName: 'X', cptCode: '1' },
      { idFor: (r) => `fixed-${r}` }
    );
    expect(cards[0].uuid).toBe('fixed-pa-required');
  });
});

describe('crdIndeterminateCards (fail-closed)', () => {
  it('NEVER returns an empty list — a coverage service that cannot decide must still warn', () => {
    const cards = crdIndeterminateCards();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary.toLowerCase()).toContain('could not be determined');
    expect(cards[0].detail?.toLowerCase()).toContain('verify');
  });
});

describe('crdInputFromOrder (structured coding only — no free-text echo)', () => {
  it('reads CPT from a CPT-system coding', () => {
    const input = crdInputFromOrder({
      code: { coding: [{ system: CPT_SYSTEM, code: '72148', display: 'MRI Lumbar' }] },
    });
    expect(input).toEqual({ cptCode: '72148', procedureName: 'MRI Lumbar' });
  });

  it('prefers the CPT-system coding over other codings', () => {
    const input = crdInputFromOrder({
      code: {
        coding: [
          { system: 'http://snomed.info/sct', code: '999', display: 'snomed' },
          { system: CPT_SYSTEM, code: '72148', display: 'MRI Lumbar' },
        ],
      },
    });
    expect(input?.cptCode).toBe('72148');
  });

  it('returns null when there is no structured coding (must fail closed, not default)', () => {
    expect(crdInputFromOrder({ code: { text: 'MRI Lumbar Spine' } })).toBeNull();
    expect(crdInputFromOrder({})).toBeNull();
    expect(crdInputFromOrder(undefined)).toBeNull();
  });

  it('never echoes free-text: procedureName comes from coding.display, not code.text', () => {
    const input = crdInputFromOrder({
      code: { text: 'PT NAME DOB SSN LEAK', coding: [{ code: '72148' }] },
    });
    expect(input?.procedureName).not.toContain('LEAK');
    expect(input?.procedureName).toBe('CPT 72148');
  });
});

describe('mock/hosted parity (E15)', () => {
  it('devCrdCards produces the same card SHAPE as buildCrdCards', () => {
    const mock = devCrdCards('MARIA_SD_001');
    const direct = buildCrdCards({
      procedureName: 'MRI Lumbar Spine w/o Contrast',
      cptCode: '72148',
    });
    const shape = (c: CrdCoverageCard) => Object.keys(c).sort();
    expect(shape(mock[0])).toEqual(shape(direct[0]));
    expect(mock[0].uuid).toBeTruthy();
    expect(mock[0].source).toBeDefined();
    expect(mock[0].indicator).toBe('critical');
  });
});
