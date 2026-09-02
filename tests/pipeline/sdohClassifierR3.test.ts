// R3 red-team FINDING 1 regression suite — the SDOH free-text screening classifier.
//
// The bug this guards against: the old positive regex trailed a `\b` on the stems
// `insecur` / `instab` / `homeless`, so every INFLECTED form ("food insecurity",
// "housing instability", "homelessness") failed to match and silently classified
// NEGATIVE — hiding a real unmet social need (fail-UNsafe: the dangerous direction).
//
// The classifier is a FALLBACK: a coded interpretation (POS/A/AA vs NEG/N) always
// wins upstream. These cases exercise the text path directly, adversarially: the
// positive INFLECTIONS must be identified, and the negated / clear-screen negatives
// must stay negative (a screen that NAMES a domain only to rule it out must not flip
// to a fabricated need). The 12 real seed-bundle strings are pinned so a future edit
// cannot regress dorothy's positive transportation screen or her negative food screen.
import { describe, it, expect } from 'vitest';
import { classifyScreenResult, sdohObservationAdapter, defaultPipelineDeps } from '@/lib/pipeline';

// classifyScreenResult receives already-lowercased text (resultText lowercases); the
// regexes are case-insensitive regardless, so lowercase here to mirror the call site.
const cls = (t: string) => classifyScreenResult(t.toLowerCase());

describe('R3 FINDING 1 — SDOH free-text classifier: inflected barriers are identified', () => {
  it.each([
    'food insecurity identified',
    'housing instability',
    'homelessness',
    'unstable housing',
    'unable to afford food',
    'no stable housing', // a LACK of a good is a barrier
    'lacks reliable transport',
    'positive for food insecurity',
    'unstable housing, otherwise stable mood', // barrier stem beats a stray later clear-word
    'Barrier — kept from care',
    'Limited — 35 miles to clinic',
    'Rural, low income',
    'Medication cost barrier',
  ])('POSITIVE: %s', (t) => {
    expect(cls(t)).toBe(true);
  });
});

describe('R3 FINDING 1 — negated / clear screens stay NEGATIVE (no fabricated need)', () => {
  it.each([
    'Screened — no food insecurity', // negated PROBLEM
    'no housing instability',
    'denies food insecurity',
    'negative for food insecurity',
    'food secure',
    'stable housing',
    'Stable',
    'Stable — owns home',
    'Stable — rents apartment',
    'Not flagged',
    'No flag',
    'Adequate — urban',
    'SNAP active', // has a benefit, no barrier signal
  ])('NEGATIVE: %s', (t) => {
    expect(cls(t)).toBe(false);
  });
});

describe('R3 FINDING 3 — a coded interpretation is authoritative; lab H/HH is NOT SDOH-positive', () => {
  const deps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });
  const obs = (interp: string | undefined, text: string) => ({
    resourceType: 'Observation',
    id: 'o-1',
    category: [{ coding: [{ code: 'social-history' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '88122-7' }] },
    subject: { reference: 'urn:uuid:pat-1' },
    effectiveDateTime: '2026-06-01',
    ...(interp ? { interpretation: [{ coding: [{ code: interp }] }] } : {}),
    valueCodeableConcept: { text },
  });
  const bundle = (r: object) =>
    JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: r }] });
  const positive = (r: object) => {
    const raw = sdohObservationAdapter.parse(bundle(r))[0];
    const rec = sdohObservationAdapter.normalize(raw, deps);
    return (rec.payload as { positive: boolean }).positive;
  };

  it('coded POS wins even when the text reads like a clear screen', () => {
    expect(positive(obs('POS', 'appears fine'))).toBe(true);
  });
  it('coded NEG wins even when the text names a barrier', () => {
    expect(positive(obs('NEG', 'food insecurity'))).toBe(false);
  });
  it('a lab high flag (H) is NOT a SDOH positive — it falls through to the text classifier', () => {
    // H is a lab range flag, not a SDOH interpretation: with clear text the finding is negative.
    expect(positive(obs('H', 'stable'))).toBe(false);
  });
});
