/**
 * glidePathModel.ts (Phase B — Gain-Share dashboards).
 *
 * Pure, dependency-free content model for the two payer/provider VBC screens built from
 * the approved `m2_glide_*` / `m3_money_*` mocks:
 *
 *   1. Glide Path — a lens (payer / provider / state) × phase (0/1/2) matrix: for each
 *      cell, the party's value bullets ("in focus"), the other two parties' one-line
 *      posture ("meanwhile"), and three KPI chips. The phase carries the shared contract
 *      lever, the gate, and the shrinking-recovery note.
 *   2. Follow the Money — an illustrative PMPM series (benchmark / actual paid spend /
 *      the shared-savings wedge split payer|provider / the quarantined recovery floor)
 *      across the three phases, plus the per-phase headline tiles.
 *
 * HONESTY: every dollar / percent here is ILLUSTRATIVE — a shape-and-magnitude story for
 * the VBC glide path, NOT member data and NOT this deployment's book of business. The
 * screens render the "figures illustrative · live values would bind to the evidence
 * record" disclaimer verbatim. The diagonal cells (payer@0, provider@1, state@2) are the
 * approved mock copy; the off-diagonal cells extend each party's posture coherently from
 * the same phase mechanics and the mock's "meanwhile" fragments.
 */

export type Lens = 'payer' | 'provider' | 'state';
export type PhaseId = 0 | 1 | 2;

export const LENS_LABEL: Record<Lens, string> = {
  payer: 'Payer / MCO',
  provider: 'Provider',
  state: 'State / regulator',
};

// NOTE: the per-lens Tailwind ACCENT CLASS strings deliberately live in the component
// (GlidePathBoard.tsx), NOT here. Tailwind's content globs scan src/components / src/app,
// not src/lib — a class literal placed in this lib module would never be generated. Keep
// visual class strings in scanned files; keep semantic data (labels, matrix, series) here.

export interface PhaseSpec {
  id: PhaseId;
  name: string;
  /** The shared contract mechanics for this rung (same across lenses). */
  contractLever: string;
  gate: string;
  /** The recovery-module note (red in the mock) — it shrinks as spend moves to savings. */
  recoveryNote: string;
  /** Illustrative risk-transfer % and the timeframe label shown under the slider. */
  riskTransferredPct: number;
  timeframe: string;
}

export const PHASES: readonly PhaseSpec[] = [
  {
    id: 0,
    name: 'Phase 0 · Clean-claim safe harbor',
    contractLever:
      'Claims conforming to disclosed requirements can’t be denied on those documentation grounds (MN / fraud / eligibility / COB unaffected).',
    gate: 'Safe harbor consistent with the MCO’s program-integrity obligations under the State contract.',
    recoveryNote: 'Recovery module: full size (FFS era) — but never counted as shared savings.',
    riskTransferredPct: 0,
    timeframe: 'now',
  },
  {
    id: 1,
    name: 'Phase 1 · Shared-computation substrate',
    contractLever:
      'Upside-only shared savings computed on jointly-replayable methodology-as-code (attribution · TCOC · quality · completeness).',
    gate: 'Canonical methodology + rebasing protection + rate-certifiable PMPM infra payment + encounter-completeness SLA.',
    recoveryNote: 'Recovery module: shrinking as spend moves to shared-savings computation.',
    riskTransferredPct: 4,
    timeframe: '12–24 mo',
  },
  {
    id: 2,
    name: 'Phase 2 · Population-based (LAN Cat 4)',
    contractLever:
      'Two-sided risk (LAN Cat 3B) escalating to population-based / capitation (LAN Cat 4) — sub-capitation is a mechanism WITHIN Cat 4, not a rung above two-sided. The ledger reduces settlement disputes; capital and reinsurance carry the risk, not the ledger.',
    gate: 'Reinsurance/stop-loss + risk-bearing-entity compliance + sustained risk-corridor performance + settled RA method.',
    recoveryNote:
      'Recovery module: near-zero — per-claim value has evaporated under global budgets, by design.',
    riskTransferredPct: 47,
    timeframe: 'when gates met',
  },
];

export interface KpiChip {
  arrow: '↑' | '↓' | '■';
  label: string;
  value: string;
}

export interface LensPhaseCell {
  /** The active-lens value bullets ("IN FOCUS"). */
  inFocus: string[];
  /** The three KPI chips shown below the cards. */
  kpis: [KpiChip, KpiChip, KpiChip];
}

/** One-line posture for a party at a phase (used in the "MEANWHILE" column). */
const MEANWHILE: Record<PhaseId, Record<Lens, string>> = {
  0: {
    payer: 'adjudication authority retained; less rework',
    provider: '↓ avoidable denials on documentation grounds',
    state: 'program-integrity controls preserved',
  },
  1: {
    payer: '↓ leakage on a shared, reproducible benchmark',
    provider: 'upside-only shared savings; disputes replay to a number',
    state: 'encounter-data completeness improves rate-setting',
  },
  2: {
    payer: 'total-cost-of-care management as risk transfers',
    provider: 'larger reward for managing total cost',
    state: 'MLR / rate integrity preserved through transfer',
  },
};

/** The other two parties' one-line posture at a phase, in a stable order. */
export function meanwhileFor(lens: Lens, phase: PhaseId): Array<{ lens: Lens; note: string }> {
  const order: Lens[] = ['payer', 'provider', 'state'];
  return order.filter((l) => l !== lens).map((l) => ({ lens: l, note: MEANWHILE[phase][l] }));
}

/**
 * The lens × phase matrix. Diagonal cells (payer@0, provider@1, state@2) are the approved
 * mock copy; off-diagonal cells extend the same-phase mechanics to that party's posture.
 */
export const MATRIX: Record<Lens, Record<PhaseId, LensPhaseCell>> = {
  payer: {
    0: {
      inFocus: [
        '↑ auto-adjudication rate',
        '↓ appeal-overturn exposure',
        '↓ admin cost / MLR admin line',
        'adjudication authority retained',
      ],
      kpis: [
        { arrow: '↑', label: 'Auto-adjudication rate', value: 'safe-harbor conforming' },
        { arrow: '↓', label: 'Appeal-overturn exposure', value: 'fewer defensive denials' },
        { arrow: '↓', label: 'Admin cost / MLR admin', value: 'less rework' },
      ],
    },
    1: {
      inFocus: [
        '↓ leakage on a shared, reproducible benchmark',
        'upside-only exposure — no downside yet',
        'disputes replay to a number, not a lawsuit',
        'adjudication authority retained',
      ],
      kpis: [
        { arrow: '↓', label: 'Leakage', value: 'shared reproducible benchmark' },
        { arrow: '■', label: 'Downside exposure', value: 'none — upside-only' },
        { arrow: '↓', label: 'Dispute cost', value: 'replay, not lawsuit' },
      ],
    },
    2: {
      inFocus: [
        'total-cost-of-care management as risk transfers',
        'MLR / rate integrity preserved through transfer',
        'capital & reinsurance carry the risk, not the ledger',
        'adjudication authority retained',
      ],
      kpis: [
        { arrow: '↓', label: 'TCOC management', value: 'risk transfers out' },
        { arrow: '■', label: 'MLR / rate integrity', value: 'preserved' },
        { arrow: '■', label: 'Risk carrier', value: 'capital & reinsurance' },
      ],
    },
  },
  provider: {
    0: {
      inFocus: [
        '↓ avoidable denials on documentation grounds',
        'faster clean-claim cash',
        'predictable payment on conforming claims',
        'no downside risk yet',
      ],
      kpis: [
        { arrow: '↑', label: 'Clean-claim cash', value: 'faster' },
        { arrow: '↓', label: 'Avoidable denials', value: 'documentation grounds' },
        { arrow: '↑', label: 'Payment predictability', value: 'conforming claims' },
      ],
    },
    1: {
      inFocus: [
        'upfront PMPM infra payment funds the build',
        'rebasing-protection keeps its own gains',
        'upside-only shared savings on the reproducible benchmark',
        'disputes replay to a number, not a lawsuit',
      ],
      kpis: [
        { arrow: '↑', label: 'Build funded', value: 'upfront PMPM infra' },
        { arrow: '■', label: 'Gains protected', value: 'rebasing-protection' },
        { arrow: '↑', label: 'Upside share', value: 'reproducible benchmark' },
      ],
    },
    2: {
      inFocus: [
        'larger reward for managing total cost',
        'population-based / capitation posture (LAN Cat 4)',
        'continuity of care under global budgets',
        'reinsurance / stop-loss caps the downside',
      ],
      kpis: [
        { arrow: '↑', label: 'Total-cost reward', value: 'larger' },
        { arrow: '■', label: 'Risk posture', value: 'Cat 3B → Cat 4 (capitation)' },
        { arrow: '↑', label: 'Continuity', value: 'global budgets' },
      ],
    },
  },
  state: {
    0: {
      inFocus: [
        'program-integrity controls preserved',
        'disclosed-requirement transparency',
        'MN / fraud / eligibility / COB unaffected',
        'safe harbor bounded by the State contract',
      ],
      kpis: [
        { arrow: '■', label: 'Program integrity', value: 'controls preserved' },
        { arrow: '↑', label: 'Requirement transparency', value: 'disclosed' },
        { arrow: '■', label: 'Adjudication integrity', value: 'MN / fraud unaffected' },
      ],
    },
    1: {
      inFocus: [
        'encounter-data completeness improves rate-setting',
        'canonical methodology-as-code, jointly replayable',
        'SLA-backed completeness',
        'no surrender of adjudication authority',
      ],
      kpis: [
        { arrow: '↑', label: 'Encounter completeness', value: 'SLA-backed' },
        { arrow: '■', label: 'Methodology', value: 'canonical, replayable' },
        { arrow: '↑', label: 'Rate-setting inputs', value: 'improved' },
      ],
    },
    2: {
      inFocus: [
        'risk borne by a compliant risk-bearing entity',
        'encounter-data attestation (State↔MCO) strengthens',
        'continuity of care under global budgets',
        'MLR / rate integrity preserved through transfer',
      ],
      kpis: [
        { arrow: '■', label: 'Risk-bearing compliance', value: 'licensed entity' },
        { arrow: '■', label: 'Encounter attestation', value: 'State↔MCO' },
        { arrow: '■', label: 'MLR / rate integrity', value: 'preserved' },
      ],
    },
  },
};

/** Map a 0–100 scrub position to a phase (thirds). */
export function phaseForScrub(scrub: number): PhaseId {
  if (scrub < 34) return 0;
  if (scrub < 67) return 1;
  return 2;
}

// ── Follow the Money — illustrative PMPM series ──────────────────────────────────

export interface MoneyPoint {
  /** 0..1 across the ~4-year horizon. */
  t: number;
  phase: PhaseId;
  benchmark: number; // what spend would have been
  actual: number; // actual paid spend (≤ benchmark once savings open)
  providerShareTop: number; // upper bound of the provider slice of the wedge
  recovery: number; // quarantined recovery $ at the floor (shrinking)
}

/**
 * Illustrative PMPM curve. Benchmark drifts up; actual paid spend bends below it as the
 * shared-savings wedge opens in Phase 1 and widens in Phase 2. The wedge (benchmark −
 * actual) splits provider (lower slice) then payer (upper slice). Recovery sits at the
 * floor and shrinks — never inside the wedge.
 */
export const MONEY_SERIES: readonly MoneyPoint[] = [
  { t: 0.0, phase: 0, benchmark: 505, actual: 504, providerShareTop: 504, recovery: 420 },
  { t: 0.16, phase: 0, benchmark: 508, actual: 506, providerShareTop: 506, recovery: 417 },
  { t: 0.33, phase: 0, benchmark: 512, actual: 509, providerShareTop: 508.5, recovery: 414 },
  { t: 0.42, phase: 1, benchmark: 515, actual: 507, providerShareTop: 511, recovery: 405 },
  { t: 0.55, phase: 1, benchmark: 519, actual: 501, providerShareTop: 510, recovery: 395 },
  { t: 0.66, phase: 1, benchmark: 523, actual: 508, providerShareTop: 515.5, recovery: 388 },
  { t: 0.75, phase: 2, benchmark: 527, actual: 500, providerShareTop: 513, recovery: 380 },
  { t: 0.88, phase: 2, benchmark: 531, actual: 490, providerShareTop: 510, recovery: 372 },
  { t: 1.0, phase: 2, benchmark: 535, actual: 480, providerShareTop: 507, recovery: 365 },
];

export interface MoneyTiles {
  sharedSavingsPmpm: number;
  providerShare: number;
  payerRetained: number;
  recoveryPmpm: number;
  adminSaved: number;
  note: string;
}

/** Per-phase headline tiles (illustrative), matching the m3_money mock beats. */
export const MONEY_TILES: Record<PhaseId, MoneyTiles> = {
  0: {
    sharedSavingsPmpm: 0.6,
    providerShare: 0.0,
    payerRetained: 0.6,
    recoveryPmpm: 7.5,
    adminSaved: 1.7,
    note: 'Phase 0 — clean-claim safe harbor. Almost no TCOC savings yet (the wedge is nearly closed); the value here is higher auto-adjudication, fewer avoidable denials, faster clean-claim cash. Recovery money is at full size — but never counted as savings.',
  },
  1: {
    sharedSavingsPmpm: 12.0,
    providerShare: 6.0,
    payerRetained: 6.0,
    recoveryPmpm: 5.2,
    adminSaved: 2.4,
    note: 'Phase 1 — shared-computation substrate. The savings wedge opens on a jointly-replayable benchmark and splits upside-only between provider and payer. Recovery money is shrinking as spend moves to shared-savings computation.',
  },
  2: {
    sharedSavingsPmpm: 45.0,
    providerShare: 27.0,
    payerRetained: 18.0,
    recoveryPmpm: 1.3,
    adminSaved: 3.1,
    note: 'Phase 2 — population-based (LAN Cat 4). Two-sided risk (Cat 3B) escalating to capitation (Cat 4; sub-cap is a mechanism within) widens the wedge; capital and reinsurance carry the risk, not the ledger. Per-claim recovery value is near-zero under global budgets, by design.',
  },
};
