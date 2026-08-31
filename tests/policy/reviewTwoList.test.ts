/**
 * Two-list review model: what a human must decide vs what the AI resolved. Human-gated docs and
 * genuine exceptions (defect/ambiguous, or a code named in an NMN/investigational statement) go to
 * `needs-review`; everything else is `ai-decided`, pre-accepted for sample-check. Submit is gated on
 * no open defects AND every exception decided.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEncodingReview,
  reviewBucket,
  acceptAiDecided,
  submitReadiness,
  decide,
  type ReviewElementInput,
  type ReviewSection,
} from '@/lib/policy/review/encodingReview';

const inputs: ReviewElementInput[] = [
  { id: 'p1', kind: 'procedure', code: '43775', label: 'Sleeve', confidence: 'explicit' }, // ai-decided
  { id: 'p2', kind: 'procedure', code: '43847', label: 'BPD', confidence: 'mapped' }, // ai-decided (mapped)
  {
    id: 'x1',
    kind: 'procedure',
    code: '43770',
    label: 'Band',
    confidence: 'explicit',
    routing: { bucket: 'excluded', label: 'Named in NMN', requiresAssignment: true },
  },
  {
    id: 'd1',
    kind: 'diagnosis',
    code: 'I10',
    label: 'HTN',
    confidence: 'mapped',
    flag: { severity: 'defect', message: 'not codeable' }, // needs-review
  },
  { id: 'g1', kind: 'gated', label: 'Supervised program', confidence: 'explicit', gated: true }, // needs-review
];
const secs = (): ReviewSection[] => buildEncodingReview(inputs);
const bucketOf = (s: ReviewSection[], id: string): string => {
  for (const sec of s)
    for (const el of sec.elements) if (el.id === id) return reviewBucket(el, sec.gated);
  throw new Error(id);
};

describe('review two-list buckets', () => {
  it('routes exceptions/gated/excluded to needs-review; explicit+mapped to ai-decided', () => {
    const s = secs();
    expect(bucketOf(s, 'p1')).toBe('ai-decided');
    expect(bucketOf(s, 'p2')).toBe('ai-decided'); // mapped → AI-decided (per product decision)
    expect(bucketOf(s, 'x1')).toBe('needs-review'); // named in NMN statement
    expect(bucketOf(s, 'd1')).toBe('needs-review'); // defect
    expect(bucketOf(s, 'g1')).toBe('needs-review'); // human-gated documentation
  });

  it('acceptAiDecided pre-accepts only the AI-decided items, leaving exceptions open', () => {
    const s = acceptAiDecided(secs());
    const state = (id: string): string =>
      s.flatMap((x) => x.elements).find((e) => e.id === id)!.state;
    expect(state('p1')).toBe('accepted');
    expect(state('p2')).toBe('accepted');
    expect(state('x1')).toBe('open'); // exception stays open
    expect(state('d1')).toBe('open');
    expect(state('g1')).toBe('open');
  });

  it('submit is blocked until every exception is decided and no defect is open', () => {
    let s = acceptAiDecided(secs());
    let r = submitReadiness(s);
    expect(r.aiDecidedTotal).toBe(2);
    expect(r.needsReviewTotal).toBe(3);
    expect(r.needsReviewOpen).toBe(3);
    expect(r.openDefects).toBe(1);
    expect(r.exceptionsCleared).toBe(false);
    // decide all three exceptions (correct the defect, accept the others)
    s = decide(s, 'd1', {
      type: 'correct',
      correction: { reason: 'gate to docs', improves: ['coding-map'] },
    });
    s = decide(s, 'x1', { type: 'reject' });
    s = decide(s, 'g1', { type: 'confirm' });
    r = submitReadiness(s);
    expect(r.needsReviewOpen).toBe(0);
    expect(r.openDefects).toBe(0);
    expect(r.exceptionsCleared).toBe(true);
  });
});
