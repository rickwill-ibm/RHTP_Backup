// cdp-intake/types.ts — intake-local contracts for the CDP Assembly demo.
//
// This whole tree (src/lib/cdp-intake/) is NET-NEW and DELETABLE: it depends on the
// existing pipeline only through injected functions + type-only imports, and nothing
// in pipeline/identity/runtime imports it back (a CI guard enforces that). Removing
// the folder + its one flag-guarded mount reverts the feature with zero residue.
//
// The core is PURE: runIntake() takes an injected IntakeDispatch bound at the edge to
// the REAL front doors (ingestBundleJson for FHIR, runPipeline for raw). The core never
// imports the engine at runtime — only these shapes, type-only.

import type { IngestBundleResult } from '@/lib/runtime/ingestBundle';
import type { ArrivalMode, QuarantineRecord } from '@/lib/pipeline';

// ArrivalMode is the pipeline's canonical union — re-exported, never duplicated here.
export type { ArrivalMode };

/** One line of an index.json manifest — the authoritative source→adapter mapping. */
export interface IntakeManifestEntry {
  file: string;
  sourceSystem: string;
  format: string; // a SourceFormat id, or a registry-extended id
  adapter: string; // owning adapter/domain, or 'fhir-bundle'
  arrivalMode: ArrivalMode;
}
export interface IntakeManifest {
  sources: IntakeManifestEntry[];
}

/** A raw file read verbatim from the source folder (the DR replay payload). */
export interface FileEntry {
  file: string; // relative name
  path: string; // absolute path
  bytes: number;
  text: string; // verbatim payload
}

/** A file after classification + hashing — ready to route to a front door. */
export interface ClassifiedFile extends IntakeManifestEntry {
  path: string;
  bytes: number;
  text: string;
  sha256: string;
}

/** The intake receipt — a PHI-safe index over what landed (no payload values). */
export interface IntakeReceipt {
  receiptId: string;
  dir: string;
  receivedAt: string;
  files: Array<{
    file: string;
    sourceSystem: string;
    format: string;
    adapter: string;
    arrivalMode: ArrivalMode;
    bytes: number;
    sha256: string;
  }>;
}

/**
 * Normalized per-source outcome. The edge maps IngestBundleResult / PipelineRunResult
 * onto this so the coordinator never depends on either engine return shape at runtime.
 */
export interface SourceLoadOutcome {
  sourceSystem: string;
  file: string;
  memberId: string;
  held: boolean;
  loaded: number; // admitted record count
  quarantined: number;
  byDomain: Record<string, number>;
  quarantineRecords?: QuarantineRecord[];
}

/**
 * The injected dispatch. The edge (BFF / wiring.ts) binds these to the REAL front doors:
 *   ingestFhir  → ingestBundleJson(payload, {sourceSystem,…}, stores)
 *   runAdapter  → runPipeline(adapter, {source, format, payload}, deps, {writer})
 * Keeping them injected is what keeps the core pure, testable, and engine-free.
 */
export interface IntakeDispatch {
  ingestFhir(payload: string, sourceSystem: string): Promise<IngestBundleResult>;
  runAdapter(
    adapter: string,
    sourceSystem: string,
    format: string,
    payload: string
  ): Promise<SourceLoadOutcome>;
}

export interface IntakeTotals {
  files: number;
  loaded: number;
  quarantined: number;
  held: number;
  members: number;
}

export interface IntakeRunResult {
  receipt: IntakeReceipt;
  outcomes: SourceLoadOutcome[];
  totals: IntakeTotals;
}
