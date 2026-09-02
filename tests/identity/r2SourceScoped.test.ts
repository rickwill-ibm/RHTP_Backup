/**
 * R2 Option B — source-scoped identity safety (the PHI-comingling fix).
 *
 * The defect this closes: an MRN (source-LOCAL) was treated as a global
 * deterministic key, and name+dob-exact auto-merged different people. The fix:
 *   - an MRN is a `localId` scoped to its assigning authority; it consolidates
 *     ONLY within the same authority, NEVER across authorities;
 *   - a genuine global id (medicaidId) is the cross-source deterministic key;
 *   - identical name+dob with no other agreeing trait is HELD, never merged;
 *   - the external PIX/PDQ seam fails closed and touches ZERO network in tests.
 *
 * Everything here drives the REAL engine (matchEngine.ts / empiResolver.ts) and
 * the REAL external seam (external/*). No scoring is reimplemented.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { resolveEmpi, createEmpiResolver } from '@/lib/identity/empiResolver';
import { runDeterministicRules, MATCH_THRESHOLDS } from '@/lib/identity/matchEngine';
import { HeldIdentityError } from '@/lib/pipeline/heldIdentity';
import {
  pixPdqIdentityResolver,
  createPixPdqResolver,
  ExternalEmpiNotConfiguredError,
  setProductionPixPdqConfig,
  getProductionPixPdqResolver,
  assigningAuthorityToScope,
  parseEr7,
  decideCrossReference,
  type Hl7v2Transport,
  type PixPdqConfig,
} from '@/lib/identity/external';
import type { IdentitySource } from '@/lib/identity/identitySource';
import type { IdentityTraits, SourceIdentityRecord, SourceSystem } from '@/lib/identity/mpiTypes';

// ─── Two DIFFERENT people whose MRNs happen to COLLIDE across authorities ─────
// personA lives in the 'emr-oak' authority; personB in 'clinic-pine'. Both have
// the SAME MRN value 'MRN-555' — a coincidental collision, two different people.
// personA also carries a genuine global medicaidId (the legitimate cross-source key).
const personA: SourceIdentityRecord = {
  sourceSystem: 'emr',
  sourceRecordId: 'rec-a',
  traits: {
    firstName: 'Ann',
    lastName: 'Alpha',
    dob: '1990-01-01',
    medicaidId: 'GLOBAL-MED-1',
    localId: { assigningAuthority: 'emr-oak', value: 'MRN-555' },
  },
};
const personB: SourceIdentityRecord = {
  sourceSystem: 'state-agency',
  sourceRecordId: 'rec-b',
  traits: {
    firstName: 'Bob',
    lastName: 'Beta',
    dob: '1975-05-05',
    localId: { assigningAuthority: 'clinic-pine', value: 'MRN-555' },
  },
};
const master: IdentitySource = {
  id: 'r2-source-scoped-master',
  mode: 'standalone',
  recordsFor: (s: SourceSystem) => [personA, personB].filter((c) => c.sourceSystem === s),
};
const feed = 'r2ss-feed';

// ─── (1) Reused MRN across DIFFERENT authorities must NOT merge ───────────────
describe('R2ss/1 — a reused MRN across different authorities does not merge two people', () => {
  it('unit: runDeterministicRules returns hit:false when the same value is under different authorities', () => {
    const a: IdentityTraits = {
      firstName: 'Ann',
      lastName: 'Alpha',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-555' },
    };
    const b: IdentityTraits = {
      firstName: 'Bob',
      lastName: 'Beta',
      dob: '1975-05-05',
      localId: { assigningAuthority: 'clinic-pine', value: 'MRN-555' },
    };
    expect(runDeterministicRules(a, b).hit).toBe(false);
  });

  it('integration: the same MRN value under two authorities anchors to two DIFFERENT members', () => {
    // Inbound carrying emr-oak/MRN-555 links to personA; clinic-pine/MRN-555 links
    // to personB. The shared value never collapses them.
    const toA = resolveEmpi(
      'in-a',
      {
        feed,
        demographics: {
          firstName: 'Ann',
          lastName: 'Alpha',
          localId: { assigningAuthority: 'emr-oak', value: 'MRN-555' },
        },
      },
      master
    );
    const toB = resolveEmpi(
      'in-b',
      {
        feed,
        demographics: {
          firstName: 'Bob',
          lastName: 'Beta',
          localId: { assigningAuthority: 'clinic-pine', value: 'MRN-555' },
        },
      },
      master
    );
    expect(toA.outcome).toBe('linked');
    expect(toA.matchTier).toBe('deterministic');
    expect(toB.outcome).toBe('linked');
    expect(toB.matchTier).toBe('deterministic');
    expect(toA.memberId).not.toBe(toB.memberId); // reused MRN did NOT merge
  });

  it('integration: an MRN under an authority UNKNOWN to the master mints (never borrows a colliding member)', () => {
    const res = resolveEmpi(
      'in-c',
      {
        feed,
        demographics: {
          firstName: 'Cal',
          lastName: 'Gamma',
          dob: '2003-03-03',
          localId: { assigningAuthority: 'unknown-auth', value: 'MRN-555' },
        },
      },
      master
    );
    expect(res.outcome).toBe('minted');
    const toA = resolveEmpi(
      'in-a',
      {
        feed,
        demographics: {
          firstName: 'Ann',
          lastName: 'Alpha',
          localId: { assigningAuthority: 'emr-oak', value: 'MRN-555' },
        },
      },
      master
    );
    expect(res.memberId).not.toBe(toA.memberId);
  });
});

// ─── (2) Same name + dob for DIFFERENT people is HELD, not deterministic ──────
describe('R2ss/2 — identical name + dob (different person) is HELD, never auto-merged', () => {
  it('unit: name + dob alone is not a deterministic hit', () => {
    const a: IdentityTraits = { firstName: 'Sam', lastName: 'Stone', dob: '1980-08-08' };
    const b: IdentityTraits = { firstName: 'Sam', lastName: 'Stone', dob: '1980-08-08' };
    expect(runDeterministicRules(a, b).hit).toBe(false);
  });

  it('integration: a twin sharing personB name+dob is HELD (possible-match band), not linked', () => {
    // Same name + dob as personB, but no localId and no global id: score 30+20+25=75.
    const res = resolveEmpi(
      'in-twin',
      { feed, demographics: { firstName: 'Bob', lastName: 'Beta', dob: '1975-05-05' } },
      master
    );
    expect(res.outcome).toBe('held');
    expect(res.matchTier).toBe('possible-match');
    expect(res.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.possibleMatchMin);
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
    expect(res.memberId).toBe('');

    // And the wired resolver diverts it (throws) rather than auto-attaching.
    const resolve = createEmpiResolver(master);
    expect(() =>
      resolve('in-twin', {
        feed,
        demographics: { firstName: 'Bob', lastName: 'Beta', dob: '1975-05-05' },
      })
    ).toThrow(HeldIdentityError);
  });
});

// ─── (3) Same-authority MRN DOES consolidate (deterministic, loc: anchor) ─────
describe('R2ss/3 — same authority + same MRN value consolidates to ONE member', () => {
  it('two inbound records with the same authority+value (and NO global id) anchor to the SAME loc: member', () => {
    const first = resolveEmpi(
      'in-1',
      {
        feed,
        demographics: {
          firstName: 'Bob',
          lastName: 'Beta',
          localId: { assigningAuthority: 'clinic-pine', value: 'MRN-555' },
        },
      },
      master
    );
    const second = resolveEmpi(
      'in-2',
      {
        feed,
        demographics: {
          firstName: 'Robert',
          lastName: 'WildlyDifferent',
          localId: { assigningAuthority: 'clinic-pine', value: 'MRN-555' },
        },
      },
      master
    );
    expect(first.outcome).toBe('linked');
    expect(first.matchTier).toBe('deterministic');
    expect(second.matchTier).toBe('deterministic');
    // personB has NO medicaidId, so the anchor is derived from the localId
    // (`loc:clinic-pine:mrn-555`) — the same for both, hence one member.
    expect(second.memberId).toBe(first.memberId);
  });
});

// ─── (4) Global medicaidId still consolidates cross-source ────────────────────
describe('R2ss/4 — a genuine global medicaidId consolidates across sources', () => {
  it('two feeds carrying personA medicaidId GLOBAL-MED-1 link to the SAME member', () => {
    const fromEmr = resolveEmpi(
      'emr-1',
      {
        feed: 'emr-adt',
        demographics: { firstName: 'Ann', lastName: 'Alpha', medicaidId: 'GLOBAL-MED-1' },
      },
      master
    );
    const fromPayer = resolveEmpi(
      'payer-1',
      {
        feed: 'payer-834',
        demographics: {
          firstName: 'A.',
          lastName: 'Alpha',
          dob: '1900-01-01',
          medicaidId: 'GLOBAL-MED-1',
        },
      },
      master
    );
    expect(fromEmr.matchTier).toBe('deterministic');
    expect(fromPayer.matchTier).toBe('deterministic');
    expect(fromPayer.memberId).toBe(fromEmr.memberId);
  });
});

// ─── (5) PIX/PDQ fails closed unconfigured; wired path uses ZERO network ──────
const ENTERPRISE_OID = '1.2.840.enterprise';
const PEER_OID = '1.2.840.emr';
const hl7Config: PixPdqConfig = {
  endpoint: 'mllp://mpi.example:2575',
  assigningAuthorityOid: ENTERPRISE_OID,
  sendingApplication: 'ACE',
  sendingFacility: 'ACE_FAC',
  receivingApplication: 'ENTERPRISE_MPI',
  receivingFacility: 'HIE',
};

/** A message-shaped fake MPI that genuinely parses the ER7 and emits an ER7 RSP. */
function fakeHl7v2Mpi(): Hl7v2Transport {
  return async (er7Request: string): Promise<string> => {
    const msg = parseEr7(er7Request);
    const msh = msg.segments.find((s) => s[0] === 'MSH');
    const qpd = msg.segments.find((s) => s[0] === 'QPD');
    const ctrlId = msh?.[9] ?? '';
    const mshOut = `MSH|^~\\&|ENTERPRISE_MPI|HIE|ACE|ACE_FAC|||RSP^K23|${ctrlId}|P|2.5.1`;
    const msa = `MSA|AA|${ctrlId}`;
    const cx = (qpd?.[3] ?? '').split('^')[0];
    if (cx === 'MRN-KNOWN') {
      const pid = `PID|||ENT-1001^^^&${ENTERPRISE_OID}&ISO~MRN-KNOWN^^^&${PEER_OID}&ISO`;
      return [mshOut, msa, 'QAK|Q1|OK', pid].join('\r');
    }
    return [mshOut, msa, 'QAK|Q1|NF'].join('\r');
  };
}

describe('R2ss/5 — PIX/PDQ fails closed unconfigured, and the wired path touches no network', () => {
  afterEach(() => {
    setProductionPixPdqConfig(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('the synchronous pipeline seam throws ExternalEmpiNotConfiguredError', () => {
    expect(() => pixPdqIdentityResolver('src-1', { feed: 'demo' })).toThrow(
      ExternalEmpiNotConfiguredError
    );
  });

  it('an unconfigured resolver rejects BEFORE any transport is invoked', async () => {
    await expect(
      createPixPdqResolver(undefined, undefined).crossReference({
        sourcePatientId: 'x',
        sourceAssigningAuthority: PEER_OID,
      })
    ).rejects.toBeInstanceOf(ExternalEmpiNotConfiguredError);
  });

  it('getProductionPixPdqResolver fails closed in mock mode (not production/external-pixpdq)', async () => {
    setProductionPixPdqConfig(hl7Config, fakeHl7v2Mpi()); // registered, but gate is not open
    await expect(
      getProductionPixPdqResolver().crossReference({
        sourcePatientId: 'MRN-KNOWN',
        sourceAssigningAuthority: PEER_OID,
      })
    ).rejects.toBeInstanceOf(ExternalEmpiNotConfiguredError);
  });

  it('a fake transport proves build+parse end-to-end with ZERO network (no fetch, one injected call)', async () => {
    // Guard: any real HTTP would go through fetch — make it fail loudly if touched.
    const fetchStub = vi.fn(() => {
      throw new Error('network access is forbidden in this test');
    });
    vi.stubGlobal('fetch', fetchStub);
    const transport = vi.fn(fakeHl7v2Mpi());

    const resolver = createPixPdqResolver(hl7Config, transport as unknown as Hl7v2Transport);
    const res = await resolver.crossReference({
      sourcePatientId: 'MRN-KNOWN',
      sourceAssigningAuthority: PEER_OID,
    });

    expect(res.status).toBe('resolved');
    expect(res.enterpriseId).toBe('ENT-1001');
    expect(decideCrossReference(res).memberId).toBe('ENT-1001');
    expect(transport).toHaveBeenCalledTimes(1); // the ONLY I/O was the injected fake
    expect(fetchStub).not.toHaveBeenCalled(); // ZERO network
  });

  it('assigningAuthorityToScope maps the enterprise domain to global and peers to their own authority', () => {
    expect(assigningAuthorityToScope(ENTERPRISE_OID, ENTERPRISE_OID)).toBe('global');
    expect(assigningAuthorityToScope(PEER_OID, ENTERPRISE_OID)).toBe(PEER_OID);
    // With a registered production config it reads the enterprise OID from there.
    setProductionPixPdqConfig(hl7Config, fakeHl7v2Mpi());
    expect(assigningAuthorityToScope(ENTERPRISE_OID)).toBe('global');
    expect(assigningAuthorityToScope(PEER_OID)).toBe(PEER_OID);
  });
});

// ─── (6) A HELD decision is surfaced with a PHI-free audit summary ────────────
describe('R2ss/6 — a held decision carries a PHI-free audit summary', () => {
  it('the audit summary contains no name/dob/ssn substrings', () => {
    const res = resolveEmpi(
      'in-held',
      {
        feed,
        demographics: { firstName: 'Bob', lastName: 'Beta', dob: '1975-05-05', ssnLast4: '4242' },
      },
      master
    );
    expect(res.outcome).toBe('held');
    // Structured + PHI-safe: outcome / tier / confidence / rule names only.
    expect(res.auditSummary).toMatch(/outcome=held/);
    expect(res.auditSummary).not.toMatch(/Bob|Beta|1975|4242/);
  });
});
