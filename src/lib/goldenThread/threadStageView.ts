/**
 * threadStageView.ts (Phase A — Golden Thread guided reviewer surface).
 *
 * Projects a real `CashResult` evidence record into an ORDERED list of stage models
 * for the guided surface — one card per order→cash stage. Pure + deterministic: it
 * only reads the record's entries, classifies each stage's evidence tier by the REAL
 * `tierOfEntry` lookup, and reads the tier→rung ceiling from the REAL
 * `TIER_RUNG_CEILING`. It computes NO governance of its own.
 *
 * DEEP imports (never the '@/lib/evidence' barrel, which re-exports ledgerIntegrity →
 * node:crypto): `tierOfEntry` and the tier/rung config are pure modules. The
 * `CashResult` / `EvidenceEntry` imports are type-only (erased at compile time), so
 * this module carries no runtime dependency on the orchestrator's node:crypto surface.
 */
import type { EvidenceEntry, EvidenceEntryType } from '@/lib/evidence/evidenceRecord';
import { tierOfEntry } from '@/lib/evidence/tier';
import {
  TIER_RUNG_CEILING,
  type EvidenceTier,
  type AuthorityRung,
} from '@/lib/evidence/tierConfig';
import type { CashResult } from './orderToCash';

export type StageKey =
  | 'order'
  | 'coverage'
  | 'eligibility'
  | 'necessity'
  | 'prior-auth'
  | 'patient-cost'
  | 'claim'
  | 'remittance'
  | 'reconciliation'
  | 'underpayment'
  | 'recovery'
  | 'gold-card-fold';

export interface StageModel {
  key: StageKey;
  label: string;
  agent: string;
  /** The record entries this stage pulls (in record order); primary is entries[0]. */
  entries: EvidenceEntry[];
  /** Evidence tier of the primary entry (tierOfEntry). Absent when no entry backs the stage. */
  tier?: EvidenceTier;
  /** The authority-rung ceiling the primary entry's tier permits (TIER_RUNG_CEILING). */
  ceilingRung?: AuthorityRung;
  /** True when the stage is backed by at least one entry (order is a synthesized header → always true). */
  present: boolean;
}

interface StageSpec {
  key: StageKey;
  label: string;
  /** The entry type(s) this stage pulls from cash.evidence.entries. Empty → synthesized header. */
  types: EvidenceEntryType[];
}

/** The ordered stage → entry-type(s) map. `order` is a synthesized header (no entry). */
export const STAGE_SPEC: readonly StageSpec[] = [
  { key: 'order', label: 'Order', types: [] },
  { key: 'coverage', label: 'Coverage / CRD', types: ['coverage-determination'] },
  { key: 'eligibility', label: 'Eligibility', types: ['eligibility'] },
  {
    key: 'necessity',
    label: 'Medical Necessity / DTR',
    types: ['coverage-determination', 'dtr-response'],
  },
  { key: 'prior-auth', label: 'Prior Authorization', types: ['pas-submission', 'pas-decision'] },
  { key: 'patient-cost', label: 'Patient Cost-Share', types: ['note'] },
  { key: 'claim', label: 'Claim (837)', types: ['claim-submission'] },
  { key: 'remittance', label: 'Remittance (835)', types: ['remittance'] },
  { key: 'reconciliation', label: 'Reconciliation', types: ['reconciliation'] },
  { key: 'underpayment', label: 'Underpayment', types: ['underpayment'] },
  { key: 'recovery', label: 'Recovery', types: ['recovery'] },
  { key: 'gold-card-fold', label: 'Gold-Card Fold', types: ['gold-card'] },
];

/** Which agent owns each stage (display attribution — PHI-safe label only). */
export const STAGE_AGENT: Record<StageKey, string> = {
  order: 'Intake',
  coverage: 'Coverage agent',
  eligibility: 'Coverage agent',
  necessity: 'Knowledge-Graph agent',
  'prior-auth': 'Prior-Auth agent',
  'patient-cost': 'Intake',
  claim: 'Revenue-Cycle agent',
  remittance: 'Revenue-Cycle agent',
  reconciliation: 'Revenue-Cycle agent',
  underpayment: 'Revenue-Cycle agent',
  recovery: 'Revenue-Cycle agent',
  'gold-card-fold': 'Knowledge-Graph agent',
};

/**
 * Build the ordered stage models from a real CashResult. Every stage keeps its fixed
 * position (so the reviewer sees stable numbering); a stage with no backing entry has
 * `present:false` (the surface renders only present stages). `order` is always present
 * (a synthesized header carrying no evidence entry, hence no tier).
 */
export function buildStageModels(cash: CashResult): StageModel[] {
  const allEntries = cash.evidence.entries;
  return STAGE_SPEC.map((spec) => {
    const entries = spec.types.length ? allEntries.filter((e) => spec.types.includes(e.type)) : [];
    const primary = entries[0];
    const tier = primary ? tierOfEntry(primary) : undefined;
    return {
      key: spec.key,
      label: spec.label,
      agent: STAGE_AGENT[spec.key],
      entries,
      ...(tier ? { tier, ceilingRung: TIER_RUNG_CEILING[tier] } : {}),
      present: spec.key === 'order' ? true : entries.length > 0,
    };
  });
}
