/**
 * Evidence tier ladder (Wave-1, Twin-Ladder governance).
 *
 * Classifies each evidence entry into an EvidenceTier by a PLAIN DATA LOOKUP on
 * its type — no persona logic, no id branching — and derives a record's process
 * tier as the WEAKEST-LINK (minimum) tier over its decision-critical inputs.
 *
 * The process tier is NON-MONOTONE by construction: it is recomputed from the
 * current entry set every time, so a later weak entry (e.g. a raw D0 remittance
 * appended after a D2 reconciliation) LOWERS the tier. The runtime never trusts a
 * cached/stored tier; it recomputes here at each authority check.
 */
import type { EvidenceEntry, EvidenceEntryType, EvidenceRecord } from './evidenceRecord';
import { type EvidenceTier, EVIDENCE_TIER_ORDER } from './tierConfig';

/**
 * Entry-type → evidence tier. A plain data table, keyed by entry.type:
 *   D0  raw payer statements as received (remittance / 835)
 *   D1  conformed single-source records
 *   D2  reconciled / contested findings
 *   D3  settlement-grade artifacts
 * Any type not listed defaults to D1 in tierOfEntry (exhaustive-safe).
 */
const ENTRY_TYPE_TIER: Readonly<Record<EvidenceEntryType, EvidenceTier>> = Object.freeze({
  // D0 — raw payer statement
  remittance: 'D0',
  // D1 — conformed single-source
  eligibility: 'D1',
  'coverage-determination': 'D1',
  'gold-card': 'D1',
  'dtr-response': 'D1',
  propensity: 'D1',
  'pas-submission': 'D1',
  'pas-decision': 'D1',
  'claim-submission': 'D1',
  note: 'D1',
  // Wave-4 must-fix 4: a terminal lifecycle marker is a conformed single-source
  // record, D1. It records WHO/WHEN of the decision — never evidence strength.
  'recovery-decision': 'D1',
  // D2 — reconciled / contested
  reconciliation: 'D2',
  underpayment: 'D2',
  // D3 — settlement-grade
  recovery: 'D3',
  // Wave-9: a governed analyst ACTION (X12 / communication / ticket-update) is an
  // ACTION record, not evidence strength — mapped D3 (settlement-grade artifact
  // class) exactly like `submission`, so the weakest-link MIN in computeProcessTier
  // can never LIFT a record's authority tier off the back of an action. It only ever
  // ties or is dominated by weaker entries; it never raises the min.
  'governed-action': 'D3',
  // Wave-4 must-fix 1/4: a submission is an ACTION record (settlement-grade
  // artifact class, D3), NOT evidence strength. The weakest-link MIN in
  // computeProcessTier means a D3 submission can NEVER lift a record's authority
  // tier — same discipline as the recovery draft. It only ever ties or lowers via
  // the other entries; it never raises the min.
  submission: 'D3',
});

/**
 * The tier of a single entry, by data lookup on its type. No persona/if-branching
 * on ids or fields; unknown types fall back to the exhaustive-safe default 'D1'.
 */
export function tierOfEntry(e: EvidenceEntry): EvidenceTier {
  return ENTRY_TYPE_TIER[e.type] ?? 'D1';
}

/**
 * A scope for narrowing which entries feed the process tier (e.g. by stage or
 * action class). Optional — the default computation uses ALL entries.
 */
export interface ProcessTierScope {
  process: string;
  actionClass: string;
  scope: string;
}

/**
 * The process tier for a record: the MINIMUM (weakest-link) tier over its
 * decision-critical entries. An empty record (no entries in scope) is 'D0'.
 *
 * NON-MONOTONE: recomputed from the current entry set, so appending a weaker
 * entry lowers the result. Order-independent: the min over a set is the same
 * regardless of append order.
 *
 * The `scope` argument is reserved for stage/actionClass filtering; the default
 * (no scope) considers every entry. Filtering that empties the set yields 'D0'.
 */
export function computeProcessTier(record: EvidenceRecord, scope?: ProcessTierScope): EvidenceTier {
  const entries = scope ? record.entries.filter((e) => e.stage === scope.scope) : record.entries;
  if (entries.length === 0) return 'D0';

  let minTier: EvidenceTier = 'D3';
  for (const e of entries) {
    const t = tierOfEntry(e);
    if (EVIDENCE_TIER_ORDER[t] < EVIDENCE_TIER_ORDER[minTier]) {
      minTier = t;
    }
  }
  return minTier;
}
