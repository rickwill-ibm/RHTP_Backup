/**
 * THE ONE CLASS-FLOOR SUPPLIER.
 *
 * `DisclosureGateDeps.classFloorFor` was optional and every caller was free to
 * write its own lookup — so the shipped composition root wrote none, the gate
 * substituted `demographic`, and NY MHL §33.13 / PHL Art 27-F material was decided
 * under the baseline HIPAA treatment/payment/operations basis with no consent
 * lookup. This supplier is the single answer to "which floor?", read from the
 * reviewed taxonomy and nowhere else.
 */
import { describe, expect, it } from 'vitest';
import { defaultTaxonomy, loadTaxonomy, taxonomyClassFloor } from '@/lib/sde';

describe('the supplier reads the shipped taxonomy and nothing else', () => {
  const floor = taxonomyClassFloor();

  it('floors a BH screening at mental-health — the regime that actually governs it', () => {
    expect(floor('bh.screening.indicated')).toEqual(['mental-health']);
  });

  it('floors a social screening and a stalled referral at social-need', () => {
    expect(floor('screening.result')).toEqual(['social-need']);
    expect(floor('referral.stalled')).toEqual(['social-need']);
  });

  it('floors an ordinary care gap at demographic', () => {
    expect(floor('care-gap.opened')).toEqual(['demographic']);
  });

  it('returns undefined for an unknown kind — absence, never a benign substitute', () => {
    // The gate turns this into a refusal. A supplier that answered `demographic`
    // here would be the original defect, relocated.
    expect(floor('not.a.taxonomy.kind')).toBeUndefined();
  });

  it('every shipped taxonomy entry declares a floor — no entry is ungoverned', () => {
    const missing = defaultTaxonomy()
      .entries.filter((e) => !e.dataClassFloor || e.dataClassFloor.length === 0)
      .map((e) => e.signalType);
    expect(missing).toEqual([]);
  });
});

describe('it is a pure projection of the taxonomy it is given', () => {
  it('a tuned taxonomy changes the answer; the shipped one is untouched', () => {
    const tuned = loadTaxonomy({
      version: '9.9',
      entries: [
        {
          signalType: 'care-gap.opened',
          sourceEventTypes: ['care-gap.opened'],
          defaultPriority: 'high',
          actionability: 'member-outreach',
          foldBehavior: 'windowed',
          dedupeKeyTemplate: 'x:{memberId}',
          dataClassFloor: ['hiv'],
        },
      ],
    });
    expect(taxonomyClassFloor(tuned)('care-gap.opened')).toEqual(['hiv']);
    expect(taxonomyClassFloor()('care-gap.opened')).toEqual(['demographic']);
  });

  it('is deterministic — the same kind gives the same answer every call', () => {
    const a = taxonomyClassFloor();
    const b = taxonomyClassFloor();
    expect(a('bh.screening.indicated')).toEqual(b('bh.screening.indicated'));
  });
});
