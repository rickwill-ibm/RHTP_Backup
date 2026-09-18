/**
 * External measures ingestion — types (HW4 / I19), program-spine contract C-MEAS.
 *
 * GOVERNING CONSTRAINT #4: this platform does NOT compute HEDIS/Stars/MIPS measures.
 * An EXTERNAL measures system computes them and emits FHIR Measure / MeasureReport /
 * Gaps-in-Care (Da Vinci DEQM) resources; this platform INGESTS that feed and
 * derives care-gap + Stars views FROM the loaded resources. The mock disposition is
 * today's authored demo gaps (preserved exactly); the production disposition loads
 * the external feed. Both normalize to the SAME MeasureGap shape (E15 parity).
 */

export type MeasureProgram = 'HEDIS' | 'STARS' | 'MIPS';
export type GapStatus = 'open' | 'in-progress' | 'closed';

/** One normalized care gap, program-agnostic (HEDIS/Stars/MIPS all map here). */
export interface MeasureGap {
  id: string;
  program: MeasureProgram;
  /** The measure's external id (e.g. 'CBP', 'C01', 'CDC-H9'). */
  measureId: string;
  measureName: string;
  domain: string;
  /** The plan/contract the measure is scored under. */
  contractName: string;
  /** Numerator/denominator when known (compliance derivation). */
  numerator?: number;
  denominator?: number;
  /** Open care gaps for this measure (denominator - numerator, or authored count). */
  gapCount: number;
  status: GapStatus;
  /** Where this gap came from — the authored demo, or an external DEQM feed. */
  source: 'authored' | 'deqm';
}

export interface CareGapView {
  gaps: MeasureGap[];
  summary: {
    total: number;
    open: number;
    byProgram: Record<MeasureProgram, number>;
  };
  /** The disposition that produced this view (for the ops/settings screen). */
  disposition: 'mock' | 'seeded' | 'production';
}

// ── Minimal Da Vinci DEQM FHIR shapes (the external feed's resources) ──────────

export interface FhirMeasureReportPopulation {
  code?: { coding?: Array<{ code?: string }> };
  count?: number;
}
export interface FhirMeasureReportGroup {
  population?: FhirMeasureReportPopulation[];
}

/** A DEQM MeasureReport (the external measures system's output). */
export interface FhirMeasureReport {
  resourceType: 'MeasureReport';
  id?: string;
  status?: string;
  type?: 'individual' | 'subject-list' | 'summary' | 'data-collection';
  measure?: string; // canonical url or id
  subject?: { reference?: string };
  group?: FhirMeasureReportGroup[];
  // extension carrying the human labels the external system provides
  _meta?: {
    measureId?: string;
    measureName?: string;
    domain?: string;
    contractName?: string;
    program?: MeasureProgram;
  };
}
