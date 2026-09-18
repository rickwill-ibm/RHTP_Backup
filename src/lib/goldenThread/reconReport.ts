/**
 * reconReport — reporting projections over the reconciliation sub-ledger, for the analyst view that
 * goes beyond "all claims / exceptions only": roll-ups (by provider / CARC / fee-schedule grouping),
 * a recovery waterfall, and a systematic-pattern → affected-claims drill. PURE + CLIENT-SAFE
 * (type-only engine import; no barrel, no node). Nothing here is persisted or hashed — it reads the
 * ledger the engine already sealed.
 *
 * HONESTY: `feeScheduleVersionOf` is a DERIVED grouping key (id-hash), an illustrative label — NOT a
 * real loaded-config identifier; it is computed at read time and never written into a record.
 * Expected realization is projected ONLY over the PURSUED (in-dispute) dollars at the modelled appeal
 * accept rate — never over every identified dollar (most identified underpayments are never appealed).
 */
import { hashStr, type ReconRecordContent } from '@/lib/goldenThread/reconcile';
import type { ReconRecord } from '@/lib/goldenThread/flowSim';

/** The modelled appeal accept rate — documents workflow.ts `appealOutcome` (accept when hash < 0.68). */
export const APPEAL_ACCEPT_RATE = 0.68;

/** Illustrative fee-schedule grouping key (derived id-hash) — NOT a real config version identifier. */
export function feeScheduleVersionOf(provider: string, carc: string): string {
  const h = hashStr(`${provider}|${carc}`);
  return `FS-2026.R${(h % 4) + 1}`;
}

/** Rows that carry a real adjustment worth reporting on (drop clean / normal write-offs). */
export const isException = (r: ReconRecordContent): boolean =>
  r.reconClass !== 'clean' && r.reconClass !== 'contractual-writeoff';

export interface RollUp {
  key: string;
  label: string;
  count: number;
  amountUsd: number; // sum of |delta| in the group
}

function rollup(
  records: readonly ReconRecordContent[],
  keyOf: (r: ReconRecordContent) => { key: string; label: string }
): RollUp[] {
  const m = new Map<string, RollUp>();
  for (const r of records) {
    if (!isException(r)) continue;
    const { key, label } = keyOf(r);
    const g = m.get(key) ?? { key, label, count: 0, amountUsd: 0 };
    g.count += 1;
    g.amountUsd += Math.abs(r.deltaUsd);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.amountUsd - a.amountUsd);
}

export const rollupByProvider = (records: readonly ReconRecordContent[]): RollUp[] =>
  rollup(records, (r) => ({ key: r.provider, label: r.provider }));

export const rollupByCarc = (records: readonly ReconRecordContent[]): RollUp[] =>
  rollup(records, (r) => ({ key: r.carc, label: `${r.carc} · ${r.group}` }));

export const rollupByFeeSchedule = (records: readonly ReconRecordContent[]): RollUp[] =>
  rollup(records, (r) => {
    const v = feeScheduleVersionOf(r.provider, r.carc);
    return { key: v, label: v };
  });

export interface RecoveryWaterfall {
  identifiedUsd: number; // all identified underpayment (pre-appeal) — NOT yet pursued
  inDisputeUsd: number; // identified AND an appeal workflow exists (pursued)
  realizedUsd: number; // modelled 835 posted on an accepted appeal
  returnableUsd: number; // overpayment the payer must report-and-return (60-day)
  expectedRealizationIfPursuedUsd: number; // inDispute × accept rate — a modelled projection over PURSUED $ only
}

/**
 * The recovery lifecycle in dollars. `pursuedSeqs` = recon seqs that have an appeal workflow, so
 * "in dispute" and the expected-realization projection reflect what is actually being pursued, not
 * the whole identified pool.
 */
export function recoveryWaterfall(
  records: readonly ReconRecord[],
  pursuedSeqs: ReadonlySet<number>
): RecoveryWaterfall {
  let identifiedUsd = 0;
  let inDisputeUsd = 0;
  let realizedUsd = 0;
  let returnableUsd = 0;
  for (const r of records) {
    if (r.reconClass === 'underpayment') {
      identifiedUsd += Math.abs(r.deltaUsd);
      if (pursuedSeqs.has(r.seq)) inDisputeUsd += Math.abs(r.deltaUsd);
    }
    if (r.recoveredUsd) realizedUsd += r.recoveredUsd;
    if (r.reconClass === 'overpayment') returnableUsd += r.deltaUsd;
  }
  return {
    identifiedUsd,
    inDisputeUsd,
    realizedUsd,
    returnableUsd,
    expectedRealizationIfPursuedUsd: Math.round(inDisputeUsd * APPEAL_ACCEPT_RATE),
  };
}

/** The claims underneath a systematic pattern (same provider × CARC) — the drill target. */
export function claimsForPattern(
  records: readonly ReconRecord[],
  provider: string,
  carc: string
): ReconRecord[] {
  return records.filter((r) => r.provider === provider && r.carc === carc);
}
