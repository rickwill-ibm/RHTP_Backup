/**
 * R2 — "Duplicate records from different sources" EMPI demonstration + adversarial
 * probe (whole-person bundle, 5 patients).
 *
 * Proves, against the REAL resolver (empiResolver.ts -> findBestMatch ->
 * runDeterministicRules + scoreProbabilisticMatch, thresholds autoLink 90 /
 * possibleMatch 60 — NO reimplemented scoring), that the SAME person arriving from
 * DIFFERENT sources consolidates to ONE enterprise member, while two DIFFERENT
 * people never false-merge and a borderline record is HELD, not auto-linked.
 *
 * R2 Option B correction: the cross-source deterministic key is a GENUINE GLOBAL
 * medicaidId — never an MRN. An MRN is source-LOCAL (moved to `localId`): it is
 * meaningful only within its assigning authority and never a cross-source key
 * (that source-scoping is proven in r2SourceScoped.test.ts). Here the enterprise
 * master carries both: a genuine medicaidId (the global anchor) and the MRN as a
 * source-local localId.
 *
 *   A. Deterministic consolidation  — Dorothy from an FQHC feed and again from a
 *      CBO feed under a name variation ("Dot"), same medicaidId -> SAME member.
 *   B. Probabilistic consolidation  — James from two feeds, no shared id, name
 *      near-miss, score >=90 -> SAME member.
 *   C. No false-merge               — two different Robert Chens (diff dob + id)
 *      -> DIFFERENT members.
 *   D. Held, not auto-linked        — Lisa vs "Elizabeth Thompson" (lastName+dob
 *      match, firstName differs), score in [60,90) -> HELD.
 *   E. Id-only fragmentation vs fix — one urn:uuid under two feeds with NO
 *      demographics mints TWO members; a seeded xref collapses them to ONE.
 *   F. Demographics-thin Alex Kirby — honest limitation: thin traits cannot
 *      consolidate on demographics alone (mints); only an id/xref link can.
 *
 * The seeded IdentitySource under 'payer' is the enterprise master. Clock/rng are
 * injected for the xref so the emitted events are reproducible (resolveEmpi itself
 * is pure/hash-based).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveEmpi,
  createEmpiResolver,
  createXrefEmpiResolver,
} from '@/lib/identity/empiResolver';
import { HeldIdentityError } from '@/lib/pipeline/heldIdentity';
import { MATCH_THRESHOLDS } from '@/lib/identity/matchEngine';
import { createXrefIndex } from '@/lib/identity/crossReference';
import type { IdentitySource } from '@/lib/identity/identitySource';
import type { SourceIdentityRecord, SourceSystem } from '@/lib/identity/mpiTypes';

// ─── Deterministic injection (xref events only; resolveEmpi is pure) ──────────
function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const deps = () => ({ now: () => 1_700_000_000_000, rng: seededRng() });

// ─── The enterprise master: the 5 whole-person-bundle patients ───────────────
// Seeded under 'payer'. medicaidId is the GENUINE GLOBAL deterministic key; the
// MRN is carried as a source-LOCAL localId (scoped to its assigning authority),
// NEVER as the cross-source key. Alex Kirby comes from the state export
// demographics-thin (name only, no dob/id).
const MASTER: SourceIdentityRecord[] = [
  {
    sourceSystem: 'payer',
    sourceRecordId: 'payer-dorothy',
    traits: {
      firstName: 'Dorothy',
      lastName: 'Simmons',
      dob: '1951-03-14',
      sex: 'female',
      medicaidId: 'SD-MED-0042',
      localId: { assigningAuthority: 'fqhc-emr', value: 'MRN-0042' },
      zip: '65721',
      phone: '(417) 555-0198',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'payer-james',
    traits: {
      firstName: 'James',
      lastName: 'Wilson',
      dob: '1968-07-14',
      sex: 'male',
      medicaidId: 'SD-MED-0087',
      localId: { assigningAuthority: 'payer-mpi', value: 'MRN-0087' },
      zip: '57580',
      phone: '605-555-0111',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'payer-robert',
    traits: {
      firstName: 'Robert',
      lastName: 'Chen',
      dob: '1964-11-03',
      sex: 'male',
      medicaidId: 'SD-MED-0103',
      localId: { assigningAuthority: 'payer-mpi', value: 'MRN-0103' },
      zip: '57701',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'payer-lisa',
    traits: {
      firstName: 'Lisa',
      lastName: 'Thompson',
      dob: '1985-05-19',
      sex: 'female',
      medicaidId: 'SD-MED-0156',
      localId: { assigningAuthority: 'payer-mpi', value: 'MRN-0156' },
      zip: '57104',
    },
  },
  {
    // Demographics-thin: arrived from the state export with a name only.
    sourceSystem: 'state-agency',
    sourceRecordId: 'state-alex',
    traits: {
      firstName: 'Alex',
      lastName: 'Kirby',
      dob: '',
    },
  },
];

const master: IdentitySource = {
  id: 'r2-enterprise-master',
  mode: 'standalone',
  recordsFor: (s: SourceSystem) => MASTER.filter((c) => c.sourceSystem === s),
};

// ─── A. Deterministic consolidation (shared GLOBAL medicaidId, name variation) ─
describe('R2/A — deterministic consolidation: Dorothy from FQHC and CBO feeds -> ONE member', () => {
  it('an FQHC feed record with the genuine medicaidId SD-MED-0042 links (tier deterministic, confidence 100)', () => {
    const res = resolveEmpi(
      'fqhc-src-1001',
      {
        feed: 'fqhc-clinical',
        demographics: {
          firstName: 'Dorothy',
          lastName: 'Simmons',
          dob: '1951-03-14',
          medicaidId: 'SD-MED-0042',
        },
      },
      master
    );
    expect(res.outcome).toBe('linked');
    expect(res.matchTier).toBe('deterministic');
    expect(res.confidence).toBe(100);
    expect(res.reasonCode).toBe('empi-linked');
    expect(res.provenance).toBe('empi-linked-deterministic');
    expect(res.memberId).toMatch(/^mem-/);
  });

  it('a CBO feed record with a NAME VARIATION ("Dot Simmons") but the same medicaidId links to the SAME member', () => {
    const fromFqhc = resolveEmpi(
      'fqhc-src-1001',
      {
        feed: 'fqhc-clinical',
        demographics: {
          firstName: 'Dorothy',
          lastName: 'Simmons',
          dob: '1951-03-14',
          medicaidId: 'SD-MED-0042',
        },
      },
      master
    );
    const fromCbo = resolveEmpi(
      'cbo-src-77', // a DIFFERENT source id, from a DIFFERENT feed
      {
        feed: 'cbo-sdoh',
        demographics: { firstName: 'Dot', lastName: 'Simmons', medicaidId: 'SD-MED-0042' },
      },
      master
    );
    expect(fromCbo.outcome).toBe('linked');
    expect(fromCbo.matchTier).toBe('deterministic');
    // The consolidation mechanism: same matched candidate -> same anchored member id.
    expect(fromCbo.memberId).toBe(fromFqhc.memberId);
  });

  it('ADVERSARIAL: the name variation "Dot" WITHOUT the shared medicaidId would NOT auto-link (score 89 < 90 -> HELD)', () => {
    // The deterministic medicaidId is what rescues consolidation; drop it and the
    // same name variation lands one point below auto-link — a real threshold
    // sensitivity. (An MRN could NOT rescue it: MRN is source-local, not a global key.)
    const res = resolveEmpi(
      'cbo-src-77',
      {
        feed: 'cbo-sdoh',
        demographics: {
          firstName: 'Dot',
          lastName: 'Simmons',
          dob: '1951-03-14',
          sex: 'female',
          zip: '65721',
          phone: '(417) 555-0198',
        },
      },
      master
    );
    expect(res.outcome).toBe('held');
    expect(res.confidence).toBe(89);
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
  });
});

// ─── B. Probabilistic consolidation (no shared id, name near-miss >=90) ──────
describe('R2/B — probabilistic consolidation: James from two feeds, no shared id -> ONE member', () => {
  it('two feeds each carrying a first-name near-miss (no medicaidId) both auto-link to the SAME member', () => {
    // Feed A: "Jamie Wilson" (EMR). Feed B: "Jaime Wilson" (state-agency). Neither
    // carries a medicaidId, so the deterministic band cannot fire; both must clear
    // the probabilistic auto-link threshold (>=90) against the James Wilson master.
    const feedA = resolveEmpi(
      'emr-src-2001',
      {
        feed: 'emr-adt',
        demographics: {
          firstName: 'Jamie',
          lastName: 'Wilson',
          dob: '1968-07-14',
          sex: 'male',
          zip: '57580',
          phone: '605-555-0111',
        },
      },
      master
    );
    const feedB = resolveEmpi(
      'state-src-3001',
      {
        feed: 'state-enrollment',
        demographics: {
          firstName: 'Jaime',
          lastName: 'Wilson',
          dob: '1968-07-14',
          sex: 'male',
          zip: '57580',
          phone: '605-555-0111',
        },
      },
      master
    );
    for (const r of [feedA, feedB]) {
      expect(r.outcome).toBe('linked');
      expect(r.matchTier).toBe('probabilistic-auto');
      expect(r.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.autoLinkMin);
      expect(r.provenance).toBe('empi-linked-probabilistic');
    }
    expect(feedA.confidence).toBe(92);
    expect(feedB.confidence).toBe(92);
    expect(feedB.memberId).toBe(feedA.memberId); // consolidated with NO shared id
  });

  it('the probabilistically-consolidated member equals the deterministic James (medicaidId SD-MED-0087) member', () => {
    // Same enterprise identity whether reached by the global medicaidId or by demographics.
    const byMedicaid = resolveEmpi(
      'payer-src-4001',
      {
        feed: 'payer-834',
        demographics: {
          firstName: 'James',
          lastName: 'Wilson',
          dob: '1968-07-14',
          medicaidId: 'SD-MED-0087',
        },
      },
      master
    );
    const byDemographics = resolveEmpi(
      'emr-src-2001',
      {
        feed: 'emr-adt',
        demographics: {
          firstName: 'Jamie',
          lastName: 'Wilson',
          dob: '1968-07-14',
          sex: 'male',
          zip: '57580',
          phone: '605-555-0111',
        },
      },
      master
    );
    expect(byMedicaid.matchTier).toBe('deterministic');
    expect(byDemographics.matchTier).toBe('probabilistic-auto');
    expect(byDemographics.memberId).toBe(byMedicaid.memberId);
  });
});

// ─── C. No false-merge (two different people, similar names) ─────────────────
describe('R2/C — no false-merge: two DIFFERENT Robert Chens -> DIFFERENT members', () => {
  it('an imposter Robert Chen (different dob, no shared medicaidId) mints a distinct member (score 55 < 60)', () => {
    const realRobert = resolveEmpi(
      'payer-src-5001',
      {
        feed: 'payer-834',
        demographics: {
          firstName: 'Robert',
          lastName: 'Chen',
          dob: '1964-11-03',
          medicaidId: 'SD-MED-0103',
        },
      },
      master
    );
    const imposter = resolveEmpi(
      'emr-src-6001',
      {
        feed: 'emr-adt',
        demographics: {
          firstName: 'Robert',
          lastName: 'Chen',
          dob: '1978-02-20',
          sex: 'male',
          zip: '57106',
        },
      },
      master
    );
    expect(realRobert.outcome).toBe('linked');
    expect(realRobert.matchTier).toBe('deterministic');
    expect(imposter.outcome).toBe('minted');
    expect(imposter.confidence).toBe(55);
    expect(imposter.confidence).toBeLessThan(MATCH_THRESHOLDS.possibleMatchMin);
    // The whole point: identical first+last name does NOT merge different people.
    expect(imposter.memberId).not.toBe(realRobert.memberId);
  });
});

// ─── D. Held, not auto-linked (borderline) ──────────────────────────────────
describe('R2/D — held, not auto-linked: Lisa vs "Elizabeth Thompson" (score in [60,90))', () => {
  it('resolveEmpi HOLDS: lastName+dob+zip match but firstName differs (score 77) -> outcome held, no member id', () => {
    // "Lisa" is a diminutive of "Elizabeth": plausibly the same person, but the
    // engine must NOT guess — it holds for human review rather than auto-linking.
    const res = resolveEmpi(
      'emr-src-7001',
      {
        feed: 'emr-adt',
        demographics: {
          firstName: 'Elizabeth',
          lastName: 'Thompson',
          dob: '1985-05-19',
          sex: 'female',
          zip: '57104',
        },
      },
      master
    );
    expect(res.outcome).toBe('held');
    expect(res.matchTier).toBe('possible-match');
    expect(res.confidence).toBe(77);
    expect(res.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.possibleMatchMin);
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
    expect(res.memberId).toBe(''); // never auto-attached
    expect(res.reasonCode).toBe('identity-possible-match');
    // PHI-safe audit summary: rule names + score only, no name/dob.
    expect(res.auditSummary).not.toMatch(/Elizabeth|Thompson|1985/);
  });

  it('the wired resolver THROWS HeldIdentityError (so the record is diverted, not linked)', () => {
    const resolve = createEmpiResolver(master);
    let thrown: unknown;
    try {
      resolve('emr-src-7001', {
        feed: 'emr-adt',
        demographics: {
          firstName: 'Elizabeth',
          lastName: 'Thompson',
          dob: '1985-05-19',
          sex: 'female',
          zip: '57104',
        },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HeldIdentityError);
    if (thrown instanceof HeldIdentityError) {
      expect(thrown.signal.reasonCode).toBe('identity-possible-match');
      expect(thrown.signal.matchTier).toBe('possible-match');
      expect(thrown.signal.confidence).toBe(77);
    }
  });
});

// ─── E. Id-only fragmentation vs xref fix (the crux) ─────────────────────────
describe('R2/E — id-only fragmentation vs xref fix', () => {
  it('FRAGMENTATION: one urn:uuid under two feeds with NO demographics mints TWO different members', () => {
    // No demographics -> mintedIdFor(sourceId, feed). feed is in the mint hash, so
    // the SAME urn:uuid under two feeds fragments into two enterprise members.
    const resolve = createEmpiResolver(master); // no xref wired
    const uuid = 'urn:uuid:9f1c-dorothy-fhir';
    const underFqhc = resolve(uuid, { feed: 'fqhc-clinical' });
    const underCbo = resolve(uuid, { feed: 'cbo-sdoh' });
    expect(underFqhc).toMatch(/^mem-/);
    expect(underCbo).toMatch(/^mem-/);
    expect(underCbo).not.toBe(underFqhc); // the fragmentation, proven
  });

  it('FIX: with a seeded xref, the same urn:uuid under two feeds resolves to ONE member', () => {
    const xref = createXrefIndex(deps());
    const resolve = createXrefEmpiResolver(xref, master);
    const uuid = 'urn:uuid:9f1c-dorothy-fhir';
    // Feed A (id-only) mints AND records the source-id -> member link.
    const underFqhc = resolve(uuid, { feed: 'fqhc-clinical' });
    // Feed B (id-only) consults the xref FIRST -> resolves to feed A's member.
    const underCbo = resolve(uuid, { feed: 'cbo-sdoh' });
    expect(underCbo).toBe(underFqhc); // ONE member — fragmentation closed
  });

  it('PRE-RESOLVE: resolving WITH demographics once seeds the xref, so later id-only feeds consolidate onto the anchored member', () => {
    // This is why the ingest driver must pre-resolve demographics: the first
    // demographic hit links the raw source id to the anchored (deterministic)
    // member, and every subsequent id-only feed for that id follows the link.
    const xref = createXrefIndex(deps());
    const resolve = createXrefEmpiResolver(xref, master);
    const uuid = 'urn:uuid:dorothy-enterprise';

    const anchored = resolve(uuid, {
      feed: 'fqhc-clinical',
      demographics: {
        firstName: 'Dorothy',
        lastName: 'Simmons',
        dob: '1951-03-14',
        medicaidId: 'SD-MED-0042',
      },
    });
    // Later, the same id arrives id-only from another feed:
    const idOnlyLater = resolve(uuid, { feed: 'cbo-sdoh' });
    expect(idOnlyLater).toBe(anchored);

    // And it equals the deterministic Dorothy member reached directly by medicaidId.
    const dorothyByMedicaid = resolveEmpi(
      'direct',
      {
        feed: 'payer-834',
        demographics: {
          medicaidId: 'SD-MED-0042',
          firstName: 'Dorothy',
          lastName: 'Simmons',
          dob: '1951-03-14',
        },
      },
      master
    );
    expect(anchored).toBe(dorothyByMedicaid.memberId);
  });

  it('E9: an xref where two distinct unmerged members claim one source id -> HELD (never a guess)', () => {
    const xref = createXrefIndex(deps());
    xref.link('urn:uuid:collision', 'mem-AAAA');
    xref.link('urn:uuid:collision', 'mem-BBBB'); // distinct, no merge relating them
    const res = resolveEmpi('urn:uuid:collision', { feed: 'any' }, master, xref);
    expect(res.outcome).toBe('held');
    expect(res.reasonCode).toBe('identity-xref-ambiguous');
    expect(res.memberId).toBe('');
  });
});

// ─── F. Demographics-thin Alex Kirby (honest limitation) ─────────────────────
describe('R2/F — demographics-thin Alex Kirby: cannot consolidate on demographics alone', () => {
  it('a thin inbound Alex (name only, no dob/medicaidId) MINTS rather than links (score 50 < 60)', () => {
    // Honest finding: with no dob and no id, name-only similarity (lastName 30 +
    // firstName 20 = 50) never clears possible-match. A demographics-thin person
    // can only be consolidated by an exact id (medicaidId) or an xref source-id
    // link — NOT by demographics. This is a data-quality limit, not a bug.
    const res = resolveEmpi(
      'state-src-8001',
      { feed: 'state-enrollment', demographics: { firstName: 'Alex', lastName: 'Kirby' } },
      master
    );
    expect(res.outcome).toBe('minted');
    expect(res.confidence).toBe(50);
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.possibleMatchMin);
  });

  it('but a shared source id via the xref DOES consolidate thin Alex across feeds', () => {
    const xref = createXrefIndex(deps());
    const resolve = createXrefEmpiResolver(xref, master);
    const uuid = 'urn:uuid:alex-kirby';
    const a = resolve(uuid, { feed: 'state-enrollment' });
    const b = resolve(uuid, { feed: 'cbo-sdoh' });
    expect(b).toBe(a); // the id/xref path is what saves the thin record
  });
});
