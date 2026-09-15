/**
 * recoveryCohorts.ts (Wave-13.1) — the NAMED recovery scenarios (dropdown picker) and
 * the batch cohorts (batch dropdown) for the recovery-policy simulation.
 *
 * Extracted from recoverySimulation.ts so the simulation ENGINE (reconcile + the
 * Twin-Ladder interlock GATE) and the scenario DATA live in separate modules and each
 * stays within the file-size cap. The public surface is unchanged: recoverySimulation.ts
 * re-exports everything here, so existing importers are byte-identical.
 *
 * Pure data + deterministic builders; client-safe (no node:crypto). PHI-safe:
 * codes / amounts / dates only.
 */
import type { SimScenario } from './recoverySimulation';
import { FAIL_SCENARIOS } from './recoveryFailScenarios';

// ── Named single scenarios (the dropdown picker) ─────────────────────────────
export const SCENARIOS: readonly SimScenario[] = [
  {
    id: 'strong-underpaid',
    label: 'Underpaid — reconciled, strong evidence (D2)',
    cpt: '72148',
    service: 'MRI lumbar spine',
    contractedAllowed: 1150,
    paidAmount: 900,
    prAmount: 150,
    coAmount: 100,
    pasDecision: 'approved',
    evidenceTier: 'D2',
    goldCarded: false,
    remittanceDate: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'weak-underpaid',
    label: 'Underpaid — fragmented evidence (D0, tier-capped)',
    cpt: '70553',
    service: 'MRI brain w/ & w/o contrast',
    contractedAllowed: 1400,
    paidAmount: 1050,
    prAmount: 200,
    coAmount: 120,
    pasDecision: 'approved',
    evidenceTier: 'D0',
    goldCarded: false,
    remittanceDate: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'settlement-underpaid',
    label: 'Underpaid — settlement-grade evidence (D3)',
    cpt: '74177',
    service: 'CT abdomen/pelvis w/ contrast',
    contractedAllowed: 1650,
    paidAmount: 1300,
    prAmount: 250,
    coAmount: 130,
    pasDecision: 'approved',
    evidenceTier: 'D3',
    goldCarded: false,
    remittanceDate: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'pa-denied',
    label: 'Underpayment but PA denied — not recoverable',
    cpt: '72148',
    service: 'MRI lumbar spine',
    contractedAllowed: 1150,
    paidAmount: 800,
    prAmount: 150,
    coAmount: 100,
    pasDecision: 'denied',
    evidenceTier: 'D2',
    goldCarded: false,
    remittanceDate: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'past-window',
    label: 'Underpaid — past the timely-filing window',
    cpt: '73721',
    service: 'MRI lower extremity joint',
    contractedAllowed: 1200,
    paidAmount: 950,
    prAmount: 150,
    coAmount: 100,
    pasDecision: 'approved',
    evidenceTier: 'D2',
    goldCarded: false,
    remittanceDate: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'matched',
    label: 'Paid correctly — no recovery',
    cpt: '72148',
    service: 'MRI lumbar spine',
    contractedAllowed: 1000,
    paidAmount: 850,
    prAmount: 150,
    coAmount: 0,
    pasDecision: 'approved',
    evidenceTier: 'D2',
    goldCarded: true,
    remittanceDate: '2026-08-20T00:00:00.000Z',
  },
  // #495 — explicit interlock FAIL / fail-closed probes (governance holds under adversity).
  ...FAIL_SCENARIOS,
  // Wave-13.1 MED-6 (4) — indeterminate member-liability: a remittance with NO recognized
  // X12 group (no CO/PR adjustments) makes member liability UNDERIVABLE, so `reconcile`
  // returns the fail-closed `indeterminate` verdict — no recovery is asserted on data that
  // cannot support it. This is a reconcile-level fail-closed (not an interlock probe).
  {
    id: 'fail-indeterminate-liability',
    label:
      'FAIL (indeterminate): no recognized X12 group — member liability underivable, no recovery',
    cpt: '73721',
    service: 'MRI lower extremity joint',
    contractedAllowed: 1200,
    paidAmount: 900,
    prAmount: 0,
    coAmount: 0,
    pasDecision: 'approved',
    evidenceTier: 'D0',
    goldCarded: false,
    remittanceDate: '2026-08-12T00:00:00.000Z',
  },
];

export function scenarioById(id: string): SimScenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

// ── Batch examples (the batch dropdown) ──────────────────────────────────────
export interface SimBatch {
  id: string;
  label: string;
  scenarios: SimScenario[];
}

/** Deterministically expand a distribution into a cohort (no randomness). */
function buildBatch(id: string, label: string, spec: Array<[string, number]>): SimBatch {
  const scenarios: SimScenario[] = [];
  let n = 0;
  for (const [baseId, copies] of spec) {
    const base = scenarioById(baseId);
    for (let i = 0; i < copies; i += 1) {
      n += 1;
      // Vary amounts slightly & deterministically so the table isn't identical rows.
      const bump = (n % 5) * 20;
      scenarios.push({
        ...base,
        id: `${id}-${n}`,
        contractedAllowed: base.contractedAllowed + bump,
        paidAmount: base.paidAmount + Math.floor(bump / 2),
      });
    }
  }
  return { id, label, scenarios };
}

export const BATCHES: readonly SimBatch[] = [
  buildBatch('rad-q3', 'Radiology Q3 remittance cohort (24 claims)', [
    ['strong-underpaid', 8],
    ['weak-underpaid', 6],
    ['settlement-underpaid', 3],
    ['pa-denied', 3],
    ['past-window', 2],
    ['matched', 2],
  ]),
  buildBatch('appeals-mix', 'Mixed-tier appeals batch (18 claims)', [
    ['weak-underpaid', 7],
    ['strong-underpaid', 5],
    ['past-window', 3],
    ['settlement-underpaid', 2],
    ['pa-denied', 1],
  ]),
  // #495 / Wave-13.1 MED-6 — a cohort that stresses the governance GATE with every
  // fail-closed scenario the payer/provider skeptic demands: adverse-on-thin-evidence,
  // adverse-at-full-rung (still blocked), submission gateway, absent evidence, and the
  // indeterminate-liability reconcile fail-closed.
  buildBatch('gov-failclosed', 'Governance fail-closed cohort (7 claims)', [
    ['fail-payer-autodeny-thin', 1],
    ['fail-adverse-recoup-d3', 1],
    ['fail-submission-gateway', 1],
    ['fail-provider-thin-evidence', 1],
    ['fail-indeterminate-liability', 1],
    ['strong-underpaid', 2],
  ]),
];

export function batchById(id: string): SimBatch {
  return BATCHES.find((b) => b.id === id) ?? BATCHES[0];
}
