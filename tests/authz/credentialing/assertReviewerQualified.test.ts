/**
 * REVIEWER QUALIFICATION (C-REVQUAL) — every refusal, exercised.
 *
 * WHY EVERY REFUSAL CODE HAS A CASE HERE, and why the seeded directory has a reviewer for each.
 * `getDataMode` defaults every seam to `'mock'`, so a seeded credentialing source containing only
 * qualified reviewers would make ALLOW the single reachable behaviour of this gate: no demo, no CI
 * run and no pilot before cutover would ever observe it refuse. E14 would see a wired path, E13 a
 * tested module, and neither sees a control that has never said no. So each refusal is driven
 * against a real seeded reviewer, not a hand-built object — which is also the only way to drive it,
 * since a `CredentialRecord` cannot be handed in.
 *
 * The clock is pinned to the seed's own epoch. This module never reads wall time (conventions §:
 * engines take injected time), so these verdicts are reproducible in 2030.
 */
import { describe, expect, it, afterEach } from 'vitest';
import {
  assertReviewerQualified,
  CredentialingNotConfiguredError,
  ReviewerNotQualifiedError,
  SEED_EPOCH_MS,
  seededCredentialingSource,
  setProductionCredentialingSource,
  type ReviewRequirement,
} from '@/lib/authz/credentialing';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { AUTHZ_SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions.authz';
import { SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions';

const DAY = 24 * 60 * 60 * 1000;

const initial = (over: Partial<ReviewRequirement> = {}): ReviewRequirement =>
  ({
    kind: 'initial-determination',
    determinationClass: 'clinical',
    needDomain: 'medical',
    licenceJurisdiction: 'NY',
    ...over,
  }) as ReviewRequirement;

/** The refusal code for a call, or null when it was permitted. */
function refusalOf(ref: string, req: ReviewRequirement, asOf = SEED_EPOCH_MS): string | null {
  try {
    assertReviewerQualified(ref, req, asOf);
    return null;
  } catch (e) {
    if (e instanceof ReviewerNotQualifiedError) return e.code;
    throw e;
  }
}

afterEach(() => {
  setProductionCredentialingSource(null);
  clearSessionDataModes();
});

describe('a qualified reviewer is permitted, and the verdict records how it was decided', () => {
  it('permits the seeded medical reviewer and pins the verdict', () => {
    const q = assertReviewerQualified('Practitioner/dev', initial(), SEED_EPOCH_MS);
    expect(q.reviewerRef).toBe('Practitioner/dev');
    expect(q.verdict.licenceVerdict).toBe('valid-at-decision');
    expect(q.verdict.needDomain).toBe('medical');
    expect(q.verdict.attestationRef).toBe('ATT-MED-0001');
    // The verdict names the SOURCE, literally. A ledger row that says
    // `seeded-credentialing-directory` is honest; one that said something more impressive because a
    // constant was reused would be the "intact badge over a hash that omitted fields" failure again.
    expect(q.verdict.sourceId).toBe('seeded-credentialing-directory');
    expect(q.verdict.asOfMs).toBe(SEED_EPOCH_MS);
  });

  it('permits a BEHAVIORAL-HEALTH peer who is not a physician', () => {
    // The regulation names behavioral health explicitly. Reading 438.210(b)(3) as "physician" is the
    // error this programme retracted, and an LCSW BH reviewer is the case that proves it is closed.
    const q = assertReviewerQualified(
      'Practitioner/bh-peer',
      initial({ needDomain: 'behavioral-health' }),
      SEED_EPOCH_MS
    );
    expect(q.verdict.licenceType).toBe('LCSW');
    expect(q.verdict.attestationRef).toBe('ATT-BH-0007');
  });

  it('permits an LTSS reviewer who is an RN care manager', () => {
    // A taxonomy match against the SERVICE (home-health aide) would have FAILED this person, who is
    // exactly the right reviewer for a personal-care-hours reduction. That failure is why expertise
    // is attested rather than computed.
    const q = assertReviewerQualified(
      'Practitioner/ltss-cm',
      initial({ needDomain: 'ltss' }),
      SEED_EPOCH_MS
    );
    expect(q.verdict.licenceType).toBe('RN');
  });

  it('an ADMINISTRATIVE determination needs no licence and no attestation', () => {
    // Eligibility, timeliness and benefit-exhaustion denials do not require a clinical peer. One bar
    // for both classes builds a control operations route around.
    const q = assertReviewerQualified(
      'Practitioner/unlicensed',
      initial({ determinationClass: 'administrative' }),
      SEED_EPOCH_MS
    );
    expect(q.verdict.licenceVerdict).toBe('not-required-administrative');
    expect(q.verdict.standardApplied).toBe('none-required:administrative');
    // But it is STILL an identified, credentialed-file-backed human — not a free string.
    expect(q.verdict.sourceId).toBe('seeded-credentialing-directory');
  });
});

describe('every refusal code is reachable, against a real seeded reviewer', () => {
  it('no-identity-of-record — the placeholder identities', () => {
    // `deriveUserId` returns the literal 'session-user' when a session carries no fhirUser, and the
    // decision gate USED to accept it while approvalAuthority blocked it (G-046).
    for (const ref of ['', '   ', 'session-user', 'unknown'])
      expect(refusalOf(ref, initial())).toBe('no-identity-of-record');
  });

  it('not-in-credentialing-source — a name the source does not know', () => {
    expect(refusalOf('Practitioner/nobody', initial())).toBe('not-in-credentialing-source');
    // And the shape that passed the OLD check: any non-empty string that is not `autonomy:`.
    expect(refusalOf('human:bob', initial())).toBe('not-in-credentialing-source');
  });

  it('licence-absent', () => {
    expect(refusalOf('Practitioner/unlicensed', initial())).toBe('licence-absent');
  });

  it('licence-expired-at-decision — and the seeded fixture refuses at ANY decision time', () => {
    expect(refusalOf('Practitioner/expired', initial())).toBe('licence-expired-at-decision');
    // The seeded records re-base their offsets onto the decision time, so a refusal fixture refuses
    // in 2026 and in 2030 alike. That is the property that removes the date bomb: the previous
    // absolute timestamps meant every QUALIFIED reviewer's licence expired on 2027-06-01 and every
    // record went stale on 2027-06-06, on every route, with no code change to blame.
    expect(refusalOf('Practitioner/expired', initial(), SEED_EPOCH_MS + 4000 * DAY)).toBe(
      'licence-expired-at-decision'
    );
    expect(refusalOf('Practitioner/dev', initial(), SEED_EPOCH_MS + 4000 * DAY)).toBeNull();
    expect(refusalOf('Practitioner/dev', initial(), SEED_EPOCH_MS - 4000 * DAY)).toBeNull();
  });

  it('AS-AT evaluation is real: the same licence is valid before its expiry and not after', () => {
    // Driven against a registered source with FIXED dates, because a re-basing seed cannot express
    // "a day before it lapsed" — and this is the property the ledger's `asOfMs` pin depends on.
    const expiresAtMs = SEED_EPOCH_MS;
    setProductionCredentialingSource({
      id: 'fixed-date-source',
      lookup: () => ({
        reviewerRef: 'Practitioner/fixed',
        display: 'Fixed Date Reviewer',
        licences: [{ type: 'MD', jurisdiction: 'NY', number: 'X', restricted: false, expiresAtMs }],
        boardCertifications: [],
        expertiseAttestations: [
          {
            needDomain: 'medical',
            attestedBy: 'Committee',
            attestationRef: 'A-1',
            standardApplied: 'federal:42CFR438.210(b)(3)',
            attestedAtMs: 0,
          },
        ],
        sourceAsOfMs: expiresAtMs - DAY,
        sourceId: 'fixed-date-source',
      }),
    });
    setSessionDataMode('credentialing', 'production');
    expect(refusalOf('Practitioner/fixed', initial(), expiresAtMs - DAY)).toBeNull();
    expect(refusalOf('Practitioner/fixed', initial(), expiresAtMs + DAY)).toBe(
      'licence-expired-at-decision'
    );
  });

  it('licence-restricted — current and valid is not enough', () => {
    expect(refusalOf('Practitioner/restricted', initial())).toBe('licence-restricted');
  });

  it('licence-jurisdiction-mismatch', () => {
    expect(refusalOf('Practitioner/out-of-state', initial())).toBe('licence-jurisdiction-mismatch');
    expect(
      refusalOf('Practitioner/out-of-state', initial({ licenceJurisdiction: 'CA' }))
    ).toBeNull();
  });

  it('expertise-not-attested — impeccably licensed, wrong need domain', () => {
    // The substitution 438.210(b)(3) exists to prevent: a medical attestation satisfying a
    // behavioral-health denial.
    expect(
      refusalOf('Practitioner/no-bh-attestation', initial({ needDomain: 'behavioral-health' }))
    ).toBe('expertise-not-attested');
    expect(refusalOf('Practitioner/no-bh-attestation', initial())).toBeNull();
  });

  it('credential-record-stale — a file verified 500 days ago is not a verification', () => {
    expect(refusalOf('Practitioner/stale', initial())).toBe('credential-record-stale');
  });
});

describe('the APPEAL requirement — 42 CFR 438.406(b)(2)', () => {
  const appeal = (over: Record<string, unknown> = {}): ReviewRequirement =>
    ({
      kind: 'appeal',
      determinationClass: 'clinical',
      needDomain: 'medical',
      licenceJurisdiction: 'NY',
      priorReviewerRefs: [],
      stateExpertiseDetermination: {
        packId: 'ny-phl-4900',
        packVersion: '2026-01-01',
        determinationRef: 'DET-1',
      },
      ...over,
    }) as ReviewRequirement;

  it('prior-involvement — the reviewer who decided the first level cannot hear the appeal', () => {
    // 438.406(b)(2)(i). Nothing in this platform could express it before W7.5c, so an appeal gate
    // would have passed the reviewer who issued the original denial — the single most-litigated
    // defect in Medicaid appeals.
    expect(refusalOf('Practitioner/dev', appeal({ priorReviewerRefs: ['Practitioner/dev'] }))).toBe(
      'prior-involvement'
    );
  });

  it('subordinate-of-prior-reviewer — a named supervisory link to a prior reviewer', () => {
    expect(
      refusalOf(
        'Practitioner/dev',
        appeal({
          priorReviewerRefs: ['Practitioner/rev-1'],
          subordinateOfRefs: ['Practitioner/rev-1'],
        })
      )
    ).toBe('subordinate-of-prior-reviewer');
  });

  it('an UNKNOWN supervisory chain refuses when a prior reviewer exists — unknown is not clear', () => {
    // The platform cannot say this reviewer is not their subordinate, and "cannot say" is a refusal
    // on a control whose entire purpose is independence.
    expect(
      refusalOf('Practitioner/dev', appeal({ priorReviewerRefs: ['Practitioner/rev-1'] }))
    ).toBe('subordinate-of-prior-reviewer');
    // Supply the chain and it passes.
    expect(
      refusalOf(
        'Practitioner/dev',
        appeal({ priorReviewerRefs: ['Practitioner/rev-1'], subordinateOfRefs: [] })
      )
    ).toBeNull();
  });

  it('state-expertise-determination-absent — there is no federal default to fall back on', () => {
    // 438.406(b)(2)(ii) delegates the expertise standard to the State ("as determined by the
    // State"). A platform that supplied its own would be asserting something federal law does not
    // say, so absence is a refusal.
    expect(refusalOf('Practitioner/dev', appeal({ stateExpertiseDetermination: undefined }))).toBe(
      'state-expertise-determination-absent'
    );
  });

  it('records the PACK as the standard applied, not the federal floor', () => {
    const q = assertReviewerQualified('Practitioner/dev', appeal(), SEED_EPOCH_MS);
    expect(q.verdict.standardApplied).toBe('pack:ny-phl-4900@2026-01-01');
    expect(q.verdict.priorInvolvementChecked).toBe(true);
  });

  it('an initial determination does NOT claim a prior-involvement check it did not make', () => {
    const q = assertReviewerQualified('Practitioner/dev', initial(), SEED_EPOCH_MS);
    expect(q.verdict.priorInvolvementChecked).toBe(false);
    expect(q.verdict.standardApplied).toBe('federal:42CFR438.210(b)(3)');
  });
});

describe('the seam fails closed, and the demo path goes through it', () => {
  it('production with nothing wired THROWS rather than serving the seed', () => {
    setSessionDataMode('credentialing', 'production');
    expect(() => assertReviewerQualified('Practitioner/dev', initial(), SEED_EPOCH_MS)).toThrow(
      CredentialingNotConfiguredError
    );
  });

  it('mock and seeded both resolve the seeded source — no mock-only shortcut', () => {
    for (const mode of ['mock', 'seeded'] as const) {
      setSessionDataMode('credentialing', mode);
      expect(assertReviewerQualified('Practitioner/dev', initial(), SEED_EPOCH_MS)).toBeDefined();
    }
    expect(seededCredentialingSource.id).toBe('seeded-credentialing-directory');
  });
});

describe('the seam disposition manifest names this seam, and names it correctly', () => {
  it('declares credentialing as a fail-closed-stub with its real resolver and error', () => {
    // The disposition manifest is what E15 (mock↔production parity) and the deploy preflight read.
    // A seam registered with the wrong disposition would let `credentialing` ship as `mock-only` —
    // "registered for ops visibility, no production consumer" — which is exactly false of a gate
    // that runs on every determination.
    const entry = AUTHZ_SEAM_DISPOSITIONS.credentialing;
    expect(entry.seamId).toBe('credentialing');
    expect(entry.disposition).toBe('fail-closed-stub');
    expect(entry.notConfiguredError).toBe('CredentialingNotConfiguredError');
    expect(entry.productionResolverRef).toContain('getCredentialingSource');
    // And the manifest spreads THIS object, not a copy that could drift from it.
    expect(SEAM_DISPOSITIONS.credentialing).toBe(entry);
  });

  it('states in its note that NPPES is not a credentialing source', () => {
    // The single most likely future mistake is someone pointing this seam at the provider
    // directory, because both are "a directory of clinicians". NPPES carries no licence, expiry,
    // board certification, sanction or exclusion; the note has to say so where an implementer reads.
    expect(AUTHZ_SEAM_DISPOSITIONS.credentialing.note).toMatch(/not providerIdentity/i);
  });
});
