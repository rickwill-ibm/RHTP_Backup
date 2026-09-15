/**
 * threadScenarios.ts (Phase A — Golden Thread guided reviewer surface).
 *
 * The three NAMED order→cash scenarios the guided surface threads through the REAL
 * orchestrator. Pure data + PHI-safe (codes / amounts / refs only) — every scenario
 * is a real `Normalized835` (code 72148 / UnitedHealthcare Community Plan) plus the
 * stipulated PA disposition; the reconciliation VERDICT is never precomputed here, it
 * is computed downstream by `reconcile` (reconciliation.ts) from the contracted
 * allowed (fee schedule: 72148 = $1150) and these per-group X12 amounts.
 *
 *   underpayment (default): paid 880, CO 670 + PR 150 → payer-owed 1150−150 = 1000,
 *                           paid 880 → Δ120 shortfall; PA approved → `underpaid`
 *                           (D2 lift), a recovery draft is proposed. Δ set above the
 *                           strictest preset materiality floor ($100 conservative) so the
 *                           flagship "recoverable" case recovers under ALL three presets.
 *   clean:                  paid 1000, CO 550 + PR 150 → payer-owed 1000 = paid →
 *                           `matched`, no recovery.
 *   co197:                  paid 0, CO 1150 (CARC 197 = no-authorization write-off),
 *                           PA denied → payer-owed 1150, paid 0 is a real shortfall
 *                           but under a NON-approving PA → `not-recoverable`. The CO
 *                           group is present so member-liability is DERIVABLE (a bare
 *                           no-group 835 would reconcile `indeterminate`).
 *
 * The page wraps the chosen `remit` as `{ asOf, remittances: [remit] }` (the
 * RemittanceAdvice shape) before handing it to runOrderToCash.
 */
import type { Normalized835 } from '@/lib/dataSources/remittanceGateway';
import type { ReconcilePasDecision } from './reconciliation';

export type ThreadScenarioId = 'underpayment' | 'clean' | 'co197';

export interface ThreadScenario {
  id: ThreadScenarioId;
  label: string;
  /** The payer 835 as received (code 72148 / UHC). The verdict is computed, not stored. */
  remit: Normalized835;
  /** The stipulated PA adjudication outcome upstream of the claim (scenario fact). */
  pasDecision: ReconcilePasDecision;
}

const PAYER = 'UnitedHealthcare Community Plan';
const CODE = '72148';
/** Deterministic remittance date (aligns with DEMO_THREAD_TS's calendar day). */
const PAID_DATE = '2026-08-30';

export const THREAD_SCENARIOS: Record<ThreadScenarioId, ThreadScenario> = {
  // Derived from the seed shape (billed 1700, code 72148 / UHC): paid 880 + CO 670 +
  // PR 150; payer-owed 1150 − PR 150 = 1000 but paid 880 → Δ120 recoverable.
  underpayment: {
    id: 'underpayment',
    label: 'Underpayment — payer short $120 (recoverable)',
    pasDecision: 'approved',
    remit: {
      remittanceId: 'RA-UHC-72148-0001',
      claimRef: 'CLM-72148-0001',
      payer: PAYER,
      code: CODE,
      // payer-owed 1150 − PR 150 = 1000; paid 880 → Δ120 shortfall. Δ is set above the
      // strictest preset materiality floor ($100 conservative) so the "recoverable"
      // scenario recovers under ALL three presets (the policy-sensitivity story lives in
      // the batch PolicyCompare, not in a silent no-op on the flagship case).
      billedAmount: 1700,
      paidAmount: 880,
      adjustments: [
        { group: 'CO', amount: 670 },
        { group: 'PR', amount: 150 },
      ],
      carcCodes: ['45', '2'],
      rarcCodes: ['N130'],
      carcGroups: ['CO', 'PR'],
      paidDate: PAID_DATE,
    },
  },
  // Paid correctly: payer-owed 1150 − PR 150 = 1000 = paid 1000 → matched, no recovery.
  clean: {
    id: 'clean',
    label: 'Clean — paid correctly (no recovery)',
    pasDecision: 'approved',
    remit: {
      remittanceId: 'RA-UHC-72148-CLEAN',
      claimRef: 'CLM-72148-CLEAN',
      payer: PAYER,
      code: CODE,
      billedAmount: 1700,
      paidAmount: 1000,
      adjustments: [
        { group: 'CO', amount: 550 },
        { group: 'PR', amount: 150 },
      ],
      carcCodes: ['45'],
      rarcCodes: [],
      carcGroups: ['CO', 'PR'],
      paidDate: PAID_DATE,
    },
  },
  // CARC 197 (required authorization absent) written off under CO; PA denied. Payer-owed
  // 1150 − 0 = 1150, paid 0 is a real shortfall, but a NON-approving PA makes it
  // reconciled-but-not-recoverable. The CO group keeps member-liability derivable.
  co197: {
    id: 'co197',
    label: 'CARC 197 — PA not approving (not recoverable)',
    pasDecision: 'denied',
    remit: {
      remittanceId: 'RA-UHC-72148-CO197',
      claimRef: 'CLM-72148-CO197',
      payer: PAYER,
      code: CODE,
      billedAmount: 1700,
      paidAmount: 0,
      adjustments: [{ group: 'CO', amount: 1150 }],
      carcCodes: ['197'],
      rarcCodes: [],
      carcGroups: ['CO'],
      paidDate: PAID_DATE,
    },
  },
};

/** The picker list (id + label), stable order. */
export const scenarioList: ReadonlyArray<{ id: ThreadScenarioId; label: string }> = (
  ['underpayment', 'clean', 'co197'] as const
).map((id) => ({ id, label: THREAD_SCENARIOS[id].label }));
