/**
 * Human-in-the-loop gating: AI calls are RECOMMENDATIONS, not pre-accepted decisions. The maker must
 * personally disposition every item; the submit gate is "everyItemDecided", not a single acknowledgement.
 * An explicit bulk-accept clears only the SAFE remainder (high-confidence, unflagged, no policy conflict);
 * low-confidence and conflicting codes are left open for individual decisions. Confidence + conflict drive
 * triage: the codes least safe to trust float to the top.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEncodingReview,
  submitReadiness,
  bulkAcceptRecommended,
  decide,
  type ReviewElementInput,
  type ReviewSection,
} from '@/lib/policy/review/encodingReview';
import { reviewAttention, compareAttention } from '@/lib/policy/review/reviewTriage';

const inputs: ReviewElementInput[] = [
  // clean explicit, ai-decided → the safe remainder bulk-accept may clear
  {
    id: 'clean',
    kind: 'procedure',
    code: '43775',
    label: 'Sleeve',
    confidence: 'explicit',
  },
  // AI-mapped, ai-decided → low confidence, must be decided individually (never bulk)
  {
    id: 'mapped',
    kind: 'procedure',
    code: '43847',
    label: 'BPD',
    confidence: 'mapped',
  },
  // policy text conflict (routed excluded) → needs-review + attention, never covered on one click
  {
    id: 'conflict',
    kind: 'procedure',
    code: '44238',
    label: 'SADI-S (unlisted)',
    confidence: 'explicit',
    routing: { bucket: 'excluded', label: 'NMN', requiresAssignment: true },
  },
];

const secs = (): ReviewSection[] => buildEncodingReview(inputs);

describe('gating — nothing ships on the AI’s say-so', () => {
  it('items start OPEN (recommendations), so the submit gate is closed until the maker acts', () => {
    const r = submitReadiness(secs());
    expect(r.openTotal).toBe(3);
    expect(r.aiDecidedOpen).toBe(2); // clean + mapped
    expect(r.everyItemDecided).toBe(false);
  });

  it('bulk-accept clears ONLY the safe remainder — mapped and conflicting codes stay open', () => {
    const { sections, count } = bulkAcceptRecommended(secs());
    expect(count).toBe(1); // only the clean explicit code
    const r = submitReadiness(sections);
    expect(r.aiDecidedOpen).toBe(1); // the mapped code is still open
    expect(r.everyItemDecided).toBe(false); // conflict + mapped remain
  });

  it('the gate opens only when every item — including the conflict — is personally decided', () => {
    let s = bulkAcceptRecommended(secs()).sections;
    s = decide(s, 'mapped', { type: 'accept' });
    expect(submitReadiness(s).everyItemDecided).toBe(false); // conflict still open
    s = decide(s, 'conflict', { type: 'reject' });
    expect(submitReadiness(s).everyItemDecided).toBe(true);
  });

  it('reopening a decided item re-closes the gate (reopen is tracked, not a silent no-op)', () => {
    let s = bulkAcceptRecommended(secs()).sections;
    s = decide(s, 'mapped', { type: 'accept' });
    s = decide(s, 'conflict', { type: 'accept' });
    expect(submitReadiness(s).everyItemDecided).toBe(true);
    s = decide(s, 'conflict', { type: 'reset' }); // reopen
    expect(submitReadiness(s).everyItemDecided).toBe(false);
    expect(submitReadiness(s).openTotal).toBe(1);
  });

  it('an EMPTY review set never reads as decided — the gate fails closed, not open', () => {
    const r = submitReadiness(buildEncodingReview([]));
    expect(r.openTotal).toBe(0);
    expect(r.everyItemDecided).toBe(false); // total>0 guard
  });
});

describe('triage — confidence + conflict, not confidence alone', () => {
  it('an explicit code the policy flags as NMN is still ATTENTION (conflict beats confidence)', () => {
    const conflict = secs()
      .flatMap((x) => x.elements)
      .find((e) => e.id === 'conflict')!;
    expect(reviewAttention(conflict).level).toBe('attention');
  });
  it('an AI-mapped code is attention; a clean explicit code is normal', () => {
    const els = secs().flatMap((x) => x.elements);
    expect(reviewAttention(els.find((e) => e.id === 'mapped')!).level).toBe('attention');
    expect(reviewAttention(els.find((e) => e.id === 'clean')!).level).toBe('normal');
  });
  it('sort floats attention-worthy items to the top', () => {
    const els = secs().flatMap((x) => x.elements);
    const ordered = [...els].sort(compareAttention).map((e) => e.id);
    expect(ordered[ordered.length - 1]).toBe('clean'); // the only "normal" sinks to the bottom
  });
});
