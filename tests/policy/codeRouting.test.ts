import { describe, it, expect } from 'vitest';
import { routeGuidelineCodes, ROUTING_ORDER } from '@/lib/policy/review/codeRouting';
import type { PolicyReview } from '@/lib/policy/policyReview';

/** Minimal PolicyReview stub — only the fields codeRouting reads. */
function review(part: Partial<PolicyReview>): PolicyReview {
  return {
    title: 'Test Policy',
    kind: 'criteria',
    promotable: true,
    stats: { format: 'criteria', criteria: 1, codes: 0 },
    ...part,
  } as PolicyReview;
}

const codes = (list: [string, 'CPT' | 'HCPCS'][]): PolicyReview['guidelineCodes'] =>
  list.map(([code, codeSystem]) => ({
    code,
    codeSystem,
    description: '',
    confidence: 'explicit',
  }));

describe('codeRouting — deterministic, never a coverage decision', () => {
  it('routes a code named in an investigational statement to `excluded` WITH provenance + basis', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([['43644', 'CPT']]),
        notMedicallyNecessary: ['Code 43644 is considered experimental and investigational.'],
      })
    );
    expect(r['43644'].bucket).toBe('excluded');
    expect(r['43644'].basis).toBe('experimental-investigational');
    expect(r['43644'].provenance?.excerpt).toContain('43644');
    // INVARIANT: routing never sets a coverage role and always still requires human assignment.
    expect(r['43644'].requiresAssignment).toBe(true);
    expect((r['43644'] as unknown as Record<string, unknown>).role).toBeUndefined();
  });

  it('fails safe to `assign` for a code with no exclusion signal (never guessed covered)', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([['43775', 'CPT']]),
        notMedicallyNecessary: ['43644 is investigational.'],
      })
    );
    expect(r['43775'].bucket).toBe('assign');
    expect(r['43775'].provenance).toBeUndefined();
    expect(r['43775'].requiresAssignment).toBe(true);
  });

  it('matches only on a word boundary — 43644 does not match inside 436440 or 143644', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([['43644', 'CPT']]),
        notMedicallyNecessary: ['Codes 436440 and 143644 are excluded (investigational).'],
      })
    );
    expect(r['43644'].bucket).toBe('assign'); // no false substring match
  });

  it('does NOT route excluded from prose that is not a negation/exclusion statement', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([['43644', 'CPT']]),
        notMedicallyNecessary: ['43644 is a gastric bypass procedure performed laparoscopically.'],
      })
    );
    expect(r['43644'].bucket).toBe('assign'); // mention ≠ exclusion
  });

  it('classifies a plain benefit exclusion vs investigational', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([['43770', 'CPT']]),
        notMedicallyNecessary: ['43770 is excluded under the plan as a benefit exclusion.'],
      })
    );
    expect(r['43770'].bucket).toBe('excluded');
    expect(r['43770'].basis).toBe('benefit-exclusion');
  });

  it('empty / missing inputs → empty map (no crash, no invented routing)', () => {
    expect(routeGuidelineCodes(review({}))).toEqual({});
    expect(routeGuidelineCodes(review({ guidelineCodes: [], notMedicallyNecessary: [] }))).toEqual(
      {}
    );
  });

  it('every routed code requiresAssignment — routing decides nothing on its own', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: codes([
          ['43644', 'CPT'],
          ['43645', 'CPT'],
        ]),
        notMedicallyNecessary: ['43644 is investigational.'],
      })
    );
    expect(Object.values(r).every((h) => h.requiresAssignment === true)).toBe(true);
  });

  it('routes a code whose OWN descriptor reads not-medically-necessary to `excluded` (prose-only matcher missed this)', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: [
          {
            code: '44238',
            codeSystem: 'CPT',
            description:
              'Unlisted laparoscopy procedure, intestine (except rectum) [when specified as a bariatric procedure identified as not medically necessary such as SADI-S]',
            confidence: 'explicit',
          },
        ],
      })
    );
    expect(r['44238'].bucket).toBe('excluded');
    expect(r['44238'].provenance?.excerpt).toContain('not medically necessary');
    expect(r['44238'].requiresAssignment).toBe(true);
    // INVARIANT holds even on the descriptor path: no role is set.
    expect((r['44238'] as unknown as Record<string, unknown>).role).toBeUndefined();
  });

  it('a benign descriptor with no exclusion cue still fails safe to `assign`', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: [
          {
            code: '43775',
            codeSystem: 'CPT',
            description:
              'Laparoscopy, surgical, gastric restrictive procedure; longitudinal gastrectomy (ie, sleeve gastrectomy)',
            confidence: 'explicit',
          },
        ],
      })
    );
    expect(r['43775'].bucket).toBe('assign');
  });

  it('a separate NMN statement still takes precedence and keeps its statement provenance', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: [
          {
            code: '43644',
            codeSystem: 'CPT',
            description: 'Gastric bypass',
            confidence: 'explicit',
          },
        ],
        notMedicallyNecessary: ['43644 is considered investigational.'],
      })
    );
    expect(r['43644'].bucket).toBe('excluded');
    expect(r['43644'].provenance?.excerpt).toContain('investigational');
  });

  it('does NOT mis-route a descriptor that merely says "except/excluding <anatomy>" (no coverage meaning)', () => {
    const r = routeGuidelineCodes(
      review({
        guidelineCodes: [
          {
            code: '44238',
            codeSystem: 'CPT',
            description: 'Unlisted laparoscopy procedure, intestine (except rectum)',
            confidence: 'explicit',
          },
        ],
      })
    );
    expect(r['44238'].bucket).toBe('assign'); // "except rectum" is anatomical, not an exclusion
  });

  it('exposes a stable bucket display order', () => {
    expect(ROUTING_ORDER).toEqual(['excluded', 'assign']);
  });
});
