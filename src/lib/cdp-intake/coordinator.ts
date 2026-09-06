// cdp-intake/coordinator.ts — the pure orchestrator.
//
// folder → classify → receipt → (per source) dispatch to the EXISTING front doors →
// normalize → reconcile. It imports NO engine at runtime: the dispatch is injected, so
// the same coordinator runs under a mock (tests) or the real ingestBundleJson/runPipeline
// wiring (the edge). Ordering is deterministic and ANCHOR-FIRST: batch (demographics-
// bearing) loads run before stream/micro-batch, because the stream door's identity
// pre-resolution gate refuses to mint a blind identity from a subject-only record.

import type {
  ArrivalMode,
  ClassifiedFile,
  IntakeDispatch,
  IntakeReceipt,
  IntakeRunResult,
  IntakeTotals,
  SourceLoadOutcome,
} from './types';
import type { IngestBundleResult } from '@/lib/runtime/ingestBundle';
import { readFolder, readManifest } from './folderSource';
import { classify, isUnclassified } from './classifier';
import { buildReceipt } from './receipt';
import { formatSpec } from './formatRegistry';

/** Map the rich FHIR ingest result onto the normalized per-source outcome. */
function normalizeFhir(
  r: IngestBundleResult,
  sourceSystem: string,
  file: string
): SourceLoadOutcome {
  const loaded = Object.values(r.admittedByDomain).reduce((a, b) => a + b, 0);
  return {
    sourceSystem,
    file,
    memberId: r.memberId,
    held: r.held,
    loaded,
    quarantined: r.quarantined.length,
    byDomain: r.admittedByDomain,
    quarantineRecords: r.quarantined,
  };
}

/** An unclassifiable file never reaches an adapter — it is a receipt-level reject. */
function quarantineOutcome(c: ClassifiedFile): SourceLoadOutcome {
  return {
    sourceSystem: c.sourceSystem,
    file: c.file,
    memberId: '',
    held: false,
    loaded: 0,
    quarantined: 1,
    byDomain: {},
  };
}

function arrivalRank(c: ClassifiedFile): number {
  return c.arrivalMode === 'batch' ? 0 : 1; // anchor-first
}

function totalsOf(outcomes: SourceLoadOutcome[]): IntakeTotals {
  const members = new Set(outcomes.map((o) => o.memberId).filter(Boolean));
  return {
    files: outcomes.length,
    loaded: outcomes.reduce((n, o) => n + o.loaded, 0),
    quarantined: outcomes.reduce((n, o) => n + o.quarantined, 0),
    held: outcomes.filter((o) => o.held).length,
    members: members.size,
  };
}

export interface RunIntakeOptions {
  /** Injected clock (edge passes the real one); default is deterministic for tests. */
  receivedAt?: string;
}

export async function runIntake(
  dir: string,
  dispatch: IntakeDispatch,
  opts: RunIntakeOptions = {}
): Promise<IntakeRunResult> {
  const receivedAt = opts.receivedAt ?? new Date(0).toISOString();
  const files = readFolder(dir);
  const manifest = readManifest(dir);
  const classified = classify(files, manifest);
  const receipt = buildReceipt(dir, classified, receivedAt);

  const ordered = [...classified].sort(
    (a, b) =>
      a.sourceSystem.localeCompare(b.sourceSystem) ||
      arrivalRank(a) - arrivalRank(b) ||
      a.file.localeCompare(b.file)
  );

  const outcomes: SourceLoadOutcome[] = [];
  for (const c of ordered) {
    if (isUnclassified(c)) {
      outcomes.push(quarantineOutcome(c));
      continue;
    }
    const spec = formatSpec(c.format);
    if (spec?.isFhir) {
      const r = await dispatch.ingestFhir(c.text, c.sourceSystem);
      outcomes.push(normalizeFhir(r, c.sourceSystem, c.file));
    } else {
      const o = await dispatch.runAdapter(c.adapter, c.sourceSystem, c.format, c.text);
      // Attribution is authoritative in the coordinator, not the dispatch.
      outcomes.push({ ...o, file: c.file, sourceSystem: c.sourceSystem });
    }
  }

  return { receipt, outcomes, totals: totalsOf(outcomes) };
}

// ─── Dry-run plan (no ingest) — the inspect endpoint + a pre-run preview ────────

export interface IntakePlanItem {
  file: string;
  sourceSystem: string;
  format: string;
  adapter: string;
  arrivalMode: ArrivalMode;
  door: 'fhir' | 'adapter' | 'quarantine';
  bytes: number;
  sha256: string;
}
export interface IntakePlan {
  receipt: IntakeReceipt;
  plan: IntakePlanItem[];
}

/** Classify + receipt + routing decision for a folder WITHOUT ingesting anything. */
export function planIntake(dir: string, opts: RunIntakeOptions = {}): IntakePlan {
  const receivedAt = opts.receivedAt ?? new Date(0).toISOString();
  const files = readFolder(dir);
  const manifest = readManifest(dir);
  const classified = classify(files, manifest);
  const receipt = buildReceipt(dir, classified, receivedAt);
  const ordered = [...classified].sort(
    (a, b) =>
      a.sourceSystem.localeCompare(b.sourceSystem) ||
      arrivalRank(a) - arrivalRank(b) ||
      a.file.localeCompare(b.file)
  );
  const plan: IntakePlanItem[] = ordered.map((c) => ({
    file: c.file,
    sourceSystem: c.sourceSystem,
    format: c.format,
    adapter: c.adapter,
    arrivalMode: c.arrivalMode,
    bytes: c.bytes,
    sha256: c.sha256,
    door: isUnclassified(c) ? 'quarantine' : formatSpec(c.format)?.isFhir ? 'fhir' : 'adapter',
  }));
  return { receipt, plan };
}
