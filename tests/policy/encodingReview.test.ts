/**
 * Encoding-review model — the pure state machine behind the review screen: grouping, the
 * accept/correct/reject decisions (purity), attention-routing filters, sign-off gating, bulk
 * accept, and correction capture for the feedback loop.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEncodingReview,
  decide,
  reviewProgress,
  needsReview,
  isVisible,
  bulkAcceptCleanExplicit,
  collectCorrections,
  type ReviewElement,
  type ReviewElementInput,
  type ReviewSection,
} from '@/lib/policy/review/encodingReview';

const inputs: ReviewElementInput[] = [
  { id: 'p1', kind: 'procedure', code: '43775', label: 'Sleeve', confidence: 'explicit' },
  {
    id: 'p2',
    kind: 'procedure',
    code: '43847',
    label: 'BPD',
    confidence: 'explicit',
    flag: { severity: 'ambiguous', message: 'covered vs investigational' },
  },
  {
    id: 'd1',
    kind: 'diagnosis',
    code: 'I10',
    label: 'HTN',
    confidence: 'mapped',
    flag: { severity: 'defect', message: 'refractory-HTN not codeable' },
  },
  { id: 'd2', kind: 'diagnosis', code: 'Z68.41', label: 'BMI 40', confidence: 'mapped' },
  { id: 'g1', kind: 'gated', label: 'Supervised program', confidence: 'explicit', gated: true },
];

const model = (): ReviewSection[] => buildEncodingReview(inputs);
const find = (secs: ReviewSection[], id: string): ReviewElement => {
  const e = secs.flatMap((s) => s.elements).find((x) => x.id === id);
  if (!e) throw new Error(`no element ${id}`);
  return e;
};

describe('buildEncodingReview', () => {
  it('groups by kind in section order, all elements open, gated flagged', () => {
    const secs = model();
    expect(secs.map((s) => s.key)).toEqual(['procedure', 'diagnosis', 'gated']);
    expect(secs.flatMap((s) => s.elements).every((e) => e.state === 'open')).toBe(true);
    expect(secs.find((s) => s.key === 'gated')?.gated).toBe(true);
  });
  it('returns no sections for empty input', () => {
    expect(buildEncodingReview([])).toEqual([]);
  });
});

describe('decide (pure)', () => {
  it('accept/reject/correct/confirm set the right state without mutating input', () => {
    const secs = model();
    const accepted = decide(secs, 'p1', { type: 'accept' });
    expect(find(accepted, 'p1')?.state).toBe('accepted');
    expect(find(secs, 'p1')?.state).toBe('open'); // original untouched

    expect(find(decide(secs, 'p1', { type: 'reject' }), 'p1')?.state).toBe('rejected');
    expect(find(decide(secs, 'g1', { type: 'confirm' }), 'g1')?.state).toBe('confirmed');

    const corrected = decide(secs, 'd1', {
      type: 'correct',
      correction: { reason: 'gate to docs', improves: ['coding-map'] },
    });
    expect(find(corrected, 'd1')?.state).toBe('edited');
    expect(find(corrected, 'd1')?.correction?.improves).toEqual(['coding-map']);
  });
  it('unknown id is a no-op returning the same reference', () => {
    const secs = model();
    expect(decide(secs, 'nope', { type: 'accept' })).toBe(secs);
  });
  it('accept clears a prior correction', () => {
    const secs = decide(model(), 'd1', {
      type: 'correct',
      correction: { reason: 'x', improves: ['extractor'] },
    });
    expect(find(decide(secs, 'd1', { type: 'accept' }), 'd1')?.correction).toBeUndefined();
  });
  it('reset reopens a finalized element back to open and clears its correction', () => {
    const corrected = decide(model(), 'd1', {
      type: 'correct',
      correction: { reason: 'x', improves: ['extractor'] },
    });
    expect(find(corrected, 'd1')?.state).toBe('edited');
    const reopened = decide(corrected, 'd1', { type: 'reset' });
    expect(find(reopened, 'd1')?.state).toBe('open');
    expect(find(reopened, 'd1')?.correction).toBeUndefined();
    // a rejected item can also be reopened
    const rejected = decide(model(), 'p1', { type: 'reject' });
    expect(find(decide(rejected, 'p1', { type: 'reset' }), 'p1')?.state).toBe('open');
  });
});

describe('reviewProgress + sign-off gating', () => {
  it('counts decided and blocks submit while a defect is open', () => {
    const secs = model();
    const p0 = reviewProgress(secs);
    expect(p0.total).toBe(5);
    expect(p0.openDefects).toBe(1);
    expect(p0.openAmbiguities).toBe(1);
    expect(p0.canSubmit).toBe(false); // defect open
  });
  it('allows submit only after the defect is resolved and enough decided', () => {
    let secs = model();
    // resolve the defect
    secs = decide(secs, 'd1', {
      type: 'correct',
      correction: { reason: 'gate', improves: ['coding-map'] },
    });
    // decide the rest to clear the fraction gate
    for (const id of ['p1', 'p2', 'd2']) secs = decide(secs, id, { type: 'accept' });
    const p = reviewProgress(secs);
    expect(p.openDefects).toBe(0);
    expect(p.decided).toBeGreaterThanOrEqual(Math.ceil(5 * 0.6));
    expect(p.canSubmit).toBe(true);
  });
  it('respects a custom minimum decided fraction', () => {
    const secs = decide(model(), 'd1', {
      type: 'correct',
      correction: { reason: 'x', improves: ['coding-map'] },
    });
    // only 1 of 5 decided → below 0.6 but meets 0.2
    expect(reviewProgress(secs, 0.2).canSubmit).toBe(true);
    expect(reviewProgress(secs, 0.6).canSubmit).toBe(false);
  });
});

describe('needsReview + isVisible (attention routing)', () => {
  it('routes flagged and undecided mapped items to review; clean explicit are hidden', () => {
    const secs = model();
    expect(needsReview(find(secs, 'p2'))).toBe(true); // ambiguous
    expect(needsReview(find(secs, 'd1'))).toBe(true); // defect
    expect(needsReview(find(secs, 'd2'))).toBe(true); // mapped, open
    expect(needsReview(find(secs, 'p1'))).toBe(false); // clean explicit
  });
  it('a decided element no longer needs review', () => {
    const secs = decide(model(), 'd1', { type: 'reject' });
    expect(needsReview(find(secs, 'd1'))).toBe(false);
  });
  it('filters select the right elements', () => {
    const secs = model();
    const gatedOf = (id: string): boolean =>
      secs.find((sec) => sec.elements.some((e) => e.id === id))?.gated ?? false;
    const vis = (id: string, f: Parameters<typeof isVisible>[2]) =>
      isVisible(find(secs, id), gatedOf(id), f);
    expect(vis('p1', 'review')).toBe(false);
    expect(vis('p2', 'review')).toBe(true);
    expect(vis('p1', 'explicit')).toBe(true);
    expect(vis('d2', 'mapped')).toBe(true);
    expect(vis('g1', 'gated')).toBe(true);
    expect(vis('p1', 'all')).toBe(true);
  });
});

describe('bulkAcceptCleanExplicit', () => {
  it('accepts only clean, open, explicit, non-gated elements', () => {
    const { sections, count } = bulkAcceptCleanExplicit(model());
    expect(count).toBe(1); // only p1 (p2 flagged, d1/d2 mapped, g1 gated)
    expect(find(sections, 'p1')?.state).toBe('accepted');
    expect(find(sections, 'p2')?.state).toBe('open');
    expect(find(sections, 'g1')?.state).toBe('open');
  });
  it('is a no-op (same ref) when nothing qualifies', () => {
    const secs = decide(model(), 'p1', { type: 'accept' });
    const r = bulkAcceptCleanExplicit(secs);
    expect(r.count).toBe(0);
    expect(r.sections).toBe(secs);
  });
});

describe('collectCorrections (feedback payload)', () => {
  it('returns only edited elements with their correction, split by engine', () => {
    let secs = model();
    secs = decide(secs, 'd1', {
      type: 'correct',
      correction: { reason: 'gate to docs', improves: ['coding-map'] },
    });
    secs = decide(secs, 'p2', {
      type: 'correct',
      correction: { reason: 'op-note review', improves: ['coding-map', 'extractor'] },
    });
    secs = decide(secs, 'p1', { type: 'accept' }); // not a correction
    const corr = collectCorrections(secs);
    expect(corr.map((c) => c.element.id).sort()).toEqual(['d1', 'p2']);
    expect(corr.find((c) => c.element.id === 'p2')?.correction.improves).toEqual([
      'coding-map',
      'extractor',
    ]);
  });
});
