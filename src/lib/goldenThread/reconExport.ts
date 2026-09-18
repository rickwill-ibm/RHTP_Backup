/**
 * reconExport — minimum-necessary export of the reconciliation ledger to CSV / JSON. PURE +
 * CLIENT-SAFE (string builders only; the browser triggers the download via Blob — no node). The
 * exported column set is an EXPLICIT allowlist of codes / refs / amounts — it deliberately EXCLUDES
 * the raw `claimId` and any member identifier, so an export can never carry PHI. `EXPORT_COLUMNS` is
 * exported so a test can pin that the allowlist never widens to a PHI field.
 */
import type { ReconRecord } from '@/lib/goldenThread/flowSim';
import { feeScheduleVersionOf } from '@/lib/goldenThread/reconReport';

/** The ONLY fields that may leave the app. No `claimId`, no member id — codes/refs/amounts only. */
export const EXPORT_COLUMNS = [
  'seq',
  'claimRef', // already masked (837I · claim ••••3921 · CPT …)
  'provider',
  'payer',
  'reconClass',
  'group',
  'carc',
  'rarc',
  'contractedUsd',
  'paidUsd',
  'deltaUsd',
  'variancePct',
  'feeScheduleGroupingKey',
] as const;

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number>;

/**
 * Keep only the masked core of a claim reference (up to and including the CPT token). Some records
 * append a raw source id after the CPT (e.g. "· remit-0013"); the export must never carry that raw
 * id, so we truncate at the CPT token. The masked "claim ••••NNNN · CPT ccc" part is always retained.
 */
export function maskClaimRef(ref: string): string {
  const m = ref.match(/^(.*CPT \S+)/);
  return m ? m[1] : ref;
}

function toRow(r: ReconRecord): ExportRow {
  return {
    seq: r.seq,
    claimRef: maskClaimRef(r.claimRef),
    provider: r.provider,
    payer: r.payer,
    reconClass: r.reconClass,
    group: r.group,
    carc: r.carc,
    rarc: r.rarc,
    contractedUsd: r.contractedUsd,
    paidUsd: r.paidUsd,
    deltaUsd: r.deltaUsd,
    variancePct: r.variancePct,
    feeScheduleGroupingKey: feeScheduleVersionOf(r.provider, r.carc),
  };
}

const csvCell = (v: string | number): string => {
  const str = String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export function buildReconCsv(records: readonly ReconRecord[]): string {
  const header = EXPORT_COLUMNS.join(',');
  const lines = records.map((r) => {
    const row = toRow(r);
    return EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(',');
  });
  return [header, ...lines].join('\n');
}

export function buildReconJson(records: readonly ReconRecord[]): string {
  return JSON.stringify(records.map(toRow), null, 2);
}
