// cdp-intake/seededIdentitySource.ts — NET-NEW, DELETABLE demo EMPI candidate pool.
//
// Seeds the 5 canonical demo patients as MPI candidates so a FHIR bundle carrying the
// matching medicaidId resolves DETERMINISTICALLY (medicaidId-exact, matchEngine.ts) to a
// STABLE anchored member id — mem-djb2("mid:"+lower(medicaidId)). This is what turns the
// load from "1 orphan member" into the real 5-patient population, with every source that
// carries the same medicaidId consolidating onto one member.
//
// NO ENGINE EDIT: this is passed BY VALUE into ingestBundleJson's options.identitySource
// (ingestBundle.ts resolves `options.identitySource ?? getIdentitySource()`), so MOCK_RECORDS
// and the DATA_MODE selector are untouched. The only import is the forward type dependency
// cdp-intake → identity; nothing in identity imports back, so the one-way-dependency guard
// stays green and deleting this tree reverts the seed with zero residue.
//
// Identity spaces caveat (honest): in mock/seeded mode these anchored mem-<hash> ids are a
// SEPARATE identity space from the authored WPC/KG screens (which key off platformId). The
// SEEDED_MEDICAID_IDS map below is the forward bridge a future production wiring
// (registerProjectedGraphAggregator + wpcRecord=production) would use to read the very graph
// these loads build. It is not a present-tense claim of unification.

import type { IdentitySource } from '@/lib/identity/identitySource';
import type { SourceIdentityRecord, SourceSystem } from '@/lib/identity/mpiTypes';

/** platformId → the synthetic Medicaid id we anchor each demo patient on. Maria reuses the
 *  id already in the engine's MOCK_RECORDS so she resolves to that same person. */
export const SEEDED_MEDICAID_IDS: Record<string, string> = {
  MARIA_SD_001: 'SD-MEDICAID-88213',
  'PAT-0042': 'SD-MEDICAID-00042',
  'PAT-0087': 'SD-MEDICAID-00087',
  'PAT-0103': 'SD-MEDICAID-00103',
  'PAT-0156': 'SD-MEDICAID-00156',
};

// The 5 demo patients as MPI candidates. medicaidId is the single deterministic anchor we
// control; name/dob mirror the patient registry so a probabilistic fallback would still land.
const SEED: SourceIdentityRecord[] = [
  {
    sourceSystem: 'payer',
    sourceRecordId: 'seed-MARIA_SD_001',
    traits: {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1992-06-15',
      sex: 'female',
      medicaidId: 'SD-MEDICAID-88213',
      zip: '57551',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'seed-PAT-0042',
    traits: {
      firstName: 'Dorothy',
      lastName: 'Simmons',
      dob: '1951-03-14',
      sex: 'female',
      medicaidId: 'SD-MEDICAID-00042',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'seed-PAT-0087',
    traits: {
      firstName: 'James',
      lastName: 'Wilson',
      dob: '1968-07-14',
      sex: 'male',
      medicaidId: 'SD-MEDICAID-00087',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'seed-PAT-0103',
    traits: {
      firstName: 'Robert',
      lastName: 'Chen',
      dob: '1964-11-03',
      sex: 'male',
      medicaidId: 'SD-MEDICAID-00103',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'seed-PAT-0156',
    traits: {
      firstName: 'Lisa',
      lastName: 'Thompson',
      dob: '1985-05-19',
      sex: 'female',
      medicaidId: 'SD-MEDICAID-00156',
    },
  },
];

/** The demo candidate pool. resolveEmpi flattens candidates across source systems, so all
 *  five under 'payer' are searchable regardless of the inbound source scope. */
export const seededIdentitySource: IdentitySource = {
  id: 'cdp-intake-seeded-demo-registry',
  mode: 'standalone',
  recordsFor(sys: SourceSystem): SourceIdentityRecord[] {
    return SEED.filter((r) => r.sourceSystem === sys);
  },
};
