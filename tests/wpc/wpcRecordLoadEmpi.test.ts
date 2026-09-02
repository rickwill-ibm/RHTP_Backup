/**
 * EMPI identity-behavior suite (extracted from wpcRecordLoad.test.ts to keep both
 * test modules under the 500-line cap; AI-CODING-CONVENTIONS §2 — split by
 * responsibility rather than grow a frozen file). Exercises the deterministic
 * medicaidId / possible-match paths precisely with small synthetic bundles + a
 * controlled EMPI candidate source. Backend-independent (it is the resolver + xref,
 * above the store), so it runs on the Neo4j fake only.
 */
import { describe, expect, it } from 'vitest';
import { createXrefIndex } from '@/lib/identity';
import type { IdentitySource } from '@/lib/identity/identitySource';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { ingestBundle, type FhirBundle, type IngestStores } from '@/lib/runtime/ingestBundle';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore } from '../graph/helpers';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';

// ── deterministic clock + rng (no globals) ───────────────────────────────────
const fixedNow = () => 1_700_000_000_000;
function seededRng(seed = 0x1234abcd): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function newStores(graph: GraphStore): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: createXrefIndex({ now: fixedNow }),
  };
}

// ── 4b/4c/4d. EMPI consolidation, non-merge, and near-match hold ────────────
// These use small synthetic bundles + a controlled EMPI candidate source so the
// deterministic medicaidId / possible-match paths are exercised precisely. Run on
// the Neo4j fake (the identity behavior is backend-independent — it is the resolver
// + xref, above the store).
describe('4. EMPI identity behavior (M3 wiring)', () => {
  const MEDICAID_SYS = 'http://tcoc.example.org/fhir/sid/medicaid';

  /** A minimal loadable bundle: one Patient + one coded lab Observation. */
  function miniBundle(opts: {
    patientToken: string;
    given: string;
    family: string;
    dob: string;
    mrn: string;
    medicaidId?: string;
  }): FhirBundle {
    const patientRef = opts.patientToken;
    const identifiers: unknown[] = [
      { system: 'http://tcoc.example.org/fhir/sid/mrn', value: opts.mrn },
    ];
    if (opts.medicaidId) identifiers.push({ system: MEDICAID_SYS, value: opts.medicaidId });
    return {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: patientRef,
          resource: {
            resourceType: 'Patient',
            id: opts.patientToken.replace(/[^A-Za-z0-9]/g, ''),
            name: [{ family: opts.family, given: [opts.given] }],
            birthDate: opts.dob,
            gender: 'female',
            identifier: identifiers,
          },
        },
        {
          fullUrl: 'urn:uuid:obs-1',
          resource: {
            resourceType: 'Observation',
            id: `obs-${opts.family}-${opts.mrn}`,
            status: 'final',
            category: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                    code: 'laboratory',
                  },
                ],
              },
            ],
            code: {
              coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
            },
            subject: { reference: patientRef },
            effectiveDateTime: '2026-06-01',
            valueQuantity: { value: 7, unit: '%' },
          },
        },
      ],
    };
  }

  /** An EMPI candidate source with one person keyed by a global medicaidId. */
  function sourceWithMedicaid(
    medicaidId: string,
    given: string,
    family: string,
    dob: string
  ): IdentitySource {
    return {
      id: 'test-empi',
      mode: 'standalone',
      recordsFor(system) {
        return system === 'payer'
          ? [
              {
                sourceSystem: 'payer',
                sourceRecordId: 'p-1',
                traits: { firstName: given, lastName: family, dob, medicaidId },
              },
            ]
          : [];
      },
    };
  }

  it('4b. same person, DIFFERENT sources, matching global medicaidId -> ONE member', async () => {
    const stores = newStores(makeNeo4jFakeStore());
    const src = sourceWithMedicaid('MD-777', 'Nora', 'Vega', '1979-02-02');
    const opts = { medicaidSystem: MEDICAID_SYS, identitySource: src, now: fixedNow };

    const a = await ingestBundle(
      miniBundle({
        patientToken: 'urn:uuid:AAA',
        given: 'Nora',
        family: 'Vega',
        dob: '1979-02-02',
        mrn: 'MRN-A',
        medicaidId: 'MD-777',
      }),
      { ...opts, sourceSystem: 'emr-hospital', rng: seededRng(1) },
      stores
    );
    const b = await ingestBundle(
      miniBundle({
        patientToken: 'urn:uuid:BBB',
        given: 'Nora',
        family: 'Vega',
        dob: '1979-02-02',
        mrn: 'MRN-B',
        medicaidId: 'MD-777',
      }),
      { ...opts, sourceSystem: 'payer-plan', rng: seededRng(2) },
      stores
    );

    expect(a.held).toBe(false);
    expect(b.held).toBe(false);
    // consolidated to the SAME anchored member despite different sources + MRNs.
    expect(a.memberId).toBe(b.memberId);
    const members = await stores.graph.listNodes({ kind: MEMBER_KIND });
    expect(members.filter((m) => m.key === a.memberId)).toHaveLength(1);
  });

  it('4c. two DIFFERENT people with a REUSED raw subject id + MRN across sources do NOT merge', async () => {
    const stores = newStores(makeNeo4jFakeStore());
    // No candidate source match -> both mint; the adversarial twist is that BOTH
    // bundles reuse the SAME positional raw subject id token AND the SAME MRN value.
    const shared = { patientToken: 'urn:uuid:SAME-ID', mrn: 'MRN-DUP', dob: '1960-01-01' };
    const a = await ingestBundle(
      miniBundle({ ...shared, given: 'Ann', family: 'Alpha' }),
      { sourceSystem: 'clinic-north', now: fixedNow, rng: seededRng(3) },
      stores
    );
    const b = await ingestBundle(
      miniBundle({ ...shared, given: 'Bea', family: 'Beta' }),
      { sourceSystem: 'clinic-south', now: fixedNow, rng: seededRng(4) },
      stores
    );
    expect(a.held).toBe(false);
    expect(b.held).toBe(false);
    // the source-scoped xref + same-source-only localId rule keep them APART.
    expect(a.memberId).not.toBe(b.memberId);
    const members = await stores.graph.listNodes({ kind: MEMBER_KIND });
    const ids = new Set(members.map((m) => m.key));
    expect(ids.has(a.memberId)).toBe(true);
    expect(ids.has(b.memberId)).toBe(true);
  });

  it('4d. a near-match (possible-match band) HOLDS the bundle — never a wrong-person merge', async () => {
    const stores = newStores(makeNeo4jFakeStore());
    // candidate has name+dob but NO global id; the incoming matches name+dob only
    // (30 + 20 + 25 = 75) -> possible-match band [60,90) -> HELD.
    const src: IdentitySource = {
      id: 'test-empi-nearmatch',
      mode: 'standalone',
      recordsFor(system) {
        return system === 'emr'
          ? [
              {
                sourceSystem: 'emr',
                sourceRecordId: 'e-1',
                traits: { firstName: 'Sam', lastName: 'Rivera', dob: '1970-03-03' },
              },
            ]
          : [];
      },
    };
    const res = await ingestBundle(
      miniBundle({
        patientToken: 'urn:uuid:NEAR',
        given: 'Sam',
        family: 'Rivera',
        dob: '1970-03-03',
        mrn: 'MRN-NEAR',
      }),
      { sourceSystem: 'some-clinic', identitySource: src, now: fixedNow, rng: seededRng(5) },
      stores
    );
    expect(res.held).toBe(true);
    expect(res.memberId).toBe('');
    expect(res.heldReason).toBe('identity-possible-match');
    // nothing projected for a held bundle (no wrong-person attachment).
    expect(res.projection.applied).toBe(0);
    const members = await stores.graph.listNodes({ kind: MEMBER_KIND });
    expect(members).toHaveLength(0);
  });
});
