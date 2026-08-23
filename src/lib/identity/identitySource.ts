/**
 * Cross-source identity registry seam (Dev Plan Workstream A5/A6).
 *
 * Same data-source-seam pattern as lib/policy/goldCardSource.ts: an interface
 * that lets a real production source replace the in-memory mock without changing
 * callers. Two integration modes are supported, matching the choice V3 offered HCA:
 *
 *  - "standalone": the platform operates its own identity registry (this mock is
 *    the standalone implementation, seeded with demo cross-source records).
 *  - "hca-mpi": the platform defers to HCA's existing Master Patient/Client Index.
 *    No adapter is implemented against a specific HCA system yet — this is a
 *    business/architecture decision that must be made jointly with HCA (Dev Plan
 *    task A5), so this file only defines the seam, not a live integration.
 */
import { getDataMode } from '@/lib/config/dataMode';
import type { SourceIdentityRecord, SourceSystem } from './mpiTypes';

export type IdentityIntegrationMode = 'standalone' | 'hca-mpi';

export interface IdentitySource {
  id: string;
  mode: IdentityIntegrationMode;
  /** All known records for a source system (used to search for match candidates). */
  recordsFor(sourceSystem: SourceSystem): SourceIdentityRecord[];
}

const MOCK_RECORDS: SourceIdentityRecord[] = [
  {
    sourceSystem: 'emr',
    sourceRecordId: 'emr-pat-4471',
    traits: {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      sex: 'female',
      zip: '57104',
      phone: '605-555-0142',
    },
  },
  {
    sourceSystem: 'payer',
    sourceRecordId: 'payer-mem-MARIA_SD_001',
    traits: {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      sex: 'female',
      medicaidId: 'SD-MEDICAID-88213',
      zip: '57104',
    },
  },
  {
    sourceSystem: 'state-agency',
    sourceRecordId: 'sd-hca-enroll-99231',
    traits: {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      medicaidId: 'SD-MEDICAID-88213',
      ssnLast4: '4471',
    },
  },
];

/** In-memory standalone registry — swap for a real cross-source client in production. */
function createMockIdentitySource(): IdentitySource {
  return {
    id: 'mock-standalone-identity-registry',
    mode: 'standalone',
    recordsFor(sourceSystem: SourceSystem): SourceIdentityRecord[] {
      return MOCK_RECORDS.filter((r) => r.sourceSystem === sourceSystem);
    },
  };
}

export const mockIdentitySource: IdentitySource = createMockIdentitySource();

// ─── Production candidate-source seam (U3 fix) ───────────────────────────────
/**
 * The REAL match engine (matchEngine.ts) must score inbound records against a
 * REAL candidate pool — never the 3 hard-coded demo records. Until an HCA-MPI /
 * cross-source client is registered, production fails loud (never silently scores
 * or mints against the demo fixture). This is the BackboneNotConfigured pattern
 * every sibling seam uses (goldCardRoster, terminology, consent, evidence).
 */
export class EmpiCandidateSourceNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE identity=production: no production EMPI candidate source is wired yet. ' +
        'Register one with setProductionIdentitySource(realCrossSourceClient) ' +
        '(SEAM: identity) or set DATA_MODE_IDENTITY=mock to score against the demo registry.'
    );
    this.name = 'EmpiCandidateSourceNotConfiguredError';
  }
}

let productionIdentitySource: IdentitySource | null = null;

/** Register (or clear, with null) the production candidate source (composition root / tests). */
export function setProductionIdentitySource(source: IdentitySource | null): void {
  productionIdentitySource = source;
}

/**
 * Resolve the EMPI candidate source for the configured `identity` data mode.
 *   mock / seeded -> the in-memory demo registry (demo stays green).
 *   production     -> the registered production source, or throw
 *                     EmpiCandidateSourceNotConfiguredError (fail loud) if none.
 */
export function getIdentitySource(): IdentitySource {
  if (getDataMode('identity') === 'production') {
    if (!productionIdentitySource) throw new EmpiCandidateSourceNotConfiguredError();
    return productionIdentitySource;
  }
  return mockIdentitySource;
}
