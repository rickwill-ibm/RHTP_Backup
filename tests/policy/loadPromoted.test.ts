/**
 * Choke-point tests (S0) with red-team regressions: an unknown/undefined policy level fails
 * closed to the most-restrictive level (the denial-cap-fails-open bypass), and a non-string
 * citation returns a structured refusal instead of throwing.
 */
import { describe, it, expect } from 'vitest';
import { makeSpan, type SourceAnchorV2, type CanonicalRef } from '@/lib/policy/anchor/verify';
import {
  loadPromoted,
  type CandidateCriteriaSet,
  type AutonomyPolicy,
} from '@/lib/policy/promote/loadPromoted';

const doc: CanonicalRef = { docId: 'ncd-100-1', text: 'Bariatric surgery covered when BMI >= 40.' };

function authAnchor(): SourceAnchorV2 {
  const start = doc.text.indexOf('BMI >= 40');
  return {
    anchorId: 'a1',
    provenanceClass: 'authoritative',
    spans: [makeSpan(doc, start, start + 'BMI >= 40'.length)],
  };
}

function validCandidate(over: Partial<CandidateCriteriaSet> = {}): CandidateCriteriaSet {
  return {
    criteriaSetId: 'cs1',
    smeReviewed: true,
    authoritativeSource: {
      kind: 'CMS-NCD',
      citation: 'NCD 100.1',
      url: 'https://cms.gov/ncd/100.1',
    },
    reviewedBy: 'Dr. A. Reviewer, NPI 1234567890',
    provenance: [authAnchor()],
    ...over,
  };
}

const scope = { domain: 'prior-auth', decisionClass: 'approval' as const };

describe('loadPromoted — the single choke point', () => {
  it('promotes a fully-valid set and pins autonomy to HITL', () => {
    const r = loadPromoted(validCandidate(), { scope });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.effectiveAutonomy).toBe('HITL');
  });

  it('refuses unreviewed / no-source / no-reviewer / no-provenance / non-authoritative', () => {
    expect(loadPromoted(validCandidate({ smeReviewed: false }), { scope })).toMatchObject({
      ok: false,
      refusedReason: 'not-sme-reviewed',
    });
    expect(
      loadPromoted(validCandidate({ authoritativeSource: undefined }), { scope })
    ).toMatchObject({ ok: false, refusedReason: 'missing-authoritative-source' });
    expect(loadPromoted(validCandidate({ reviewedBy: '   ' }), { scope })).toMatchObject({
      ok: false,
      refusedReason: 'missing-reviewer',
    });
    expect(loadPromoted(validCandidate({ provenance: [] }), { scope })).toMatchObject({
      ok: false,
      refusedReason: 'no-provenance',
    });
    const synth: SourceAnchorV2 = { ...authAnchor(), provenanceClass: 'synthetic' };
    expect(loadPromoted(validCandidate({ provenance: [synth] }), { scope })).toMatchObject({
      ok: false,
      refusedReason: 'non-authoritative-provenance',
    });
  });

  it('re-verifies anchors when docs are supplied: passes on match, fails closed on drift', () => {
    expect(loadPromoted(validCandidate(), { scope, docs: [doc] }).ok).toBe(true);
    const drifted: CanonicalRef = { docId: doc.docId, text: doc.text.replace('40', '35') };
    expect(loadPromoted(validCandidate(), { scope, docs: [drifted] })).toMatchObject({
      ok: false,
      refusedReason: 'anchor-verification-failed',
    });
  });

  it('never lets a DENIAL exceed HITL, even when policy allows autonomous', () => {
    const wideOpen: AutonomyPolicy = { maxLevel: () => 'autonomous' };
    const rd = loadPromoted(validCandidate(), {
      scope: { domain: 'prior-auth', decisionClass: 'denial' },
      policy: wideOpen,
    });
    expect(rd.ok && rd.effectiveAutonomy).toBe('HITL');
    const ra = loadPromoted(validCandidate(), { scope, policy: wideOpen });
    expect(ra.ok && ra.effectiveAutonomy).toBe('autonomous');
  });

  it('REGRESSION: an unknown policy level fails closed to most-restrictive (denial cap cannot be bypassed)', () => {
    const bogus = { maxLevel: () => 'autonomous+' } as unknown as AutonomyPolicy;
    const rd = loadPromoted(validCandidate(), {
      scope: { domain: 'prior-auth', decisionClass: 'denial' },
      policy: bogus,
    });
    expect(rd.ok && rd.effectiveAutonomy).toBe('heavy-human'); // not 'autonomous+', and <= HITL
    const ra = loadPromoted(validCandidate(), { scope, policy: bogus });
    expect(ra.ok && ra.effectiveAutonomy).toBe('heavy-human'); // approval also fails closed
  });

  it('REGRESSION: an undefined policy level does not throw and fails closed', () => {
    const undef = { maxLevel: () => undefined } as unknown as AutonomyPolicy;
    const r = loadPromoted(validCandidate(), { scope, policy: undef });
    expect(r.ok && r.effectiveAutonomy).toBe('heavy-human');
  });

  it('REGRESSION: a non-string citation returns a structured refusal (no TypeError)', () => {
    const bad = validCandidate({
      authoritativeSource: { kind: 'CMS-NCD', citation: undefined as unknown as string },
    });
    expect(loadPromoted(bad, { scope })).toMatchObject({
      ok: false,
      refusedReason: 'missing-authoritative-source',
    });
  });
});
