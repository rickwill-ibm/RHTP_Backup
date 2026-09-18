/**
 * nistMap.ts — the SINGLE source of truth for the NIST AI-RMF per-record mapping and the exec
 * Twin-Ladder code vocabulary, shared by the engine (flowSim) and every view (live board, Operations,
 * workbench). There is exactly ONE work→NIST-function map in the system, and it lives here.
 *
 * Per-record we carry the AI-RMF FUNCTION the act contributes to (GOVERN/MAP/MEASURE/MANAGE), the
 * trustworthiness CHARACTERISTIC it supports, and the human-OVERSIGHT mode (HITL/HOTL/none) — framed
 * as ALIGNMENT, illustrative, not a conformance assessment. NIST does not certify AI systems.
 * Subcategory conformance is an org/system-level outcome, surfaced on the NIST-AI-RMF tab, not here.
 *
 * CLIENT-SAFE: pure data + pure functions. No `@/lib/evidence` barrel, no `node:crypto`.
 */
export type NistFn = 'GOVERN' | 'MAP' | 'MEASURE' | 'MANAGE';
export type Oversight = 'HITL' | 'HOTL' | 'watch' | 'none'; // human-in / human-on / watch-only (unearned) / unsupervised

export interface NistSpec {
  fn: NistFn;
  char: string; // one of the 7 AI-RMF trustworthiness characteristics this act supports
}

/** The one map: what fired → the AI-RMF function + the characteristic it supports. */
export const NIST_SPEC: Record<string, NistSpec> = {
  'emr-launch': { fn: 'MAP', char: 'Valid & Reliable' },
  crd: { fn: 'MAP', char: 'Explainable & Interpretable' },
  'gold-card': { fn: 'GOVERN', char: 'Accountable & Transparent' },
  dtr: { fn: 'MAP', char: 'Valid & Reliable' },
  'pas-submit': { fn: 'GOVERN', char: 'Accountable & Transparent' },
  'payer-ops': { fn: 'GOVERN', char: 'Accountable & Transparent' },
  intake: { fn: 'MAP', char: 'Valid & Reliable' },
  eligibility: { fn: 'MAP', char: 'Valid & Reliable' },
  nurse: { fn: 'MEASURE', char: 'Safe' },
  rfi: { fn: 'MANAGE', char: 'Accountable & Transparent' },
  md: { fn: 'MEASURE', char: 'Safe' }, // clinical medical-necessity determination — the Safe characteristic
  determination: { fn: 'GOVERN', char: 'Accountable & Transparent' },
  'deemed-adverse': { fn: 'MANAGE', char: 'Accountable & Transparent' }, // 438.404(c)(5) due-process NABD
  'clock-jeopardy': { fn: 'MANAGE', char: 'Accountable & Transparent' }, // PREEMPTIVE advisory (clock at risk) — not the timeout FAILURE
  notify: { fn: 'MANAGE', char: 'Explainable & Interpretable' },
  claim: { fn: 'MEASURE', char: 'Valid & Reliable' },
  remittance: { fn: 'MEASURE', char: 'Valid & Reliable' },
  reconciliation: { fn: 'MEASURE', char: 'Valid & Reliable' },
  recovery: { fn: 'MANAGE', char: 'Accountable & Transparent' },
  surveillance: { fn: 'MANAGE', char: 'Secure & Resilient' },
  records: { fn: 'MAP', char: 'Privacy-Enhanced' },
  status: { fn: 'MEASURE', char: 'Explainable & Interpretable' },
  'fairness-screen': { fn: 'MEASURE', char: 'Fair — Harmful Bias Managed' },
  appeal: { fn: 'MANAGE', char: 'Fair — Harmful Bias Managed' },
  'governed-action': { fn: 'MANAGE', char: 'Accountable & Transparent' }, // an analyst's governed outbound
  routing: { fn: 'GOVERN', char: 'Accountable & Transparent' }, // a detection routed into a seat's governed queue
  'refer-out': { fn: 'GOVERN', char: 'Accountable & Transparent' }, // credible-fraud referral OUT to State/MFCU (455.23)
  'recon-pattern': { fn: 'MEASURE', char: 'Valid & Reliable' }, // a systematic pattern measured over the recon book
  'fee-schedule-config': { fn: 'MANAGE', char: 'Accountable & Transparent' }, // mis-loaded fee schedule → config reprocess
};
export const nistSpec = (key: string): NistSpec =>
  NIST_SPEC[key] ?? { fn: 'MEASURE', char: 'Accountable & Transparent' };

/** Human-oversight mode, single-sourced from who acted + the rung reached. This is THE only place the
 *  rung→oversight mapping is computed — every view derives its oversight chip from here. A0 (watch-only,
 *  un-earned) is 'watch', distinct from A3 'none' (unsupervised/autonomous). */
export const deriveOversight = (human: boolean, rung: string): Oversight =>
  human ? 'HITL' : rung === 'A3' ? 'none' : rung === 'A0' ? 'watch' : 'HOTL';

/**
 * The surveillance-catalogue side of the SAME map: each detection `algorithm` resolves to the `fired`
 * key above, so a forensic row (keyed by algorithm) gets its NIST specifics from NIST_SPEC — no second
 * map. Anything unmapped falls back to 'surveillance'.
 */
export const ALGORITHM_FIRED: Record<string, string> = {
  'CALENDAR-IMPOSSIBLE': 'surveillance',
  'DENY-DISPARATE-IMPACT': 'fairness-screen',
  'UNDERPAY-CONTRACT': 'recovery',
  'UPCODE-DRIFT': 'surveillance',
  'COB-TPL': 'reconciliation',
  'EXCLUDED-PROVIDER': 'surveillance',
  'DEEMED-ADVERSE-TIMEOUT': 'deemed-adverse',
  'CLOCK-JEOPARDY': 'clock-jeopardy', // preemptive early-warning (before expiry) — distinct from the timeout failure
  // Reconciliation-agent handoffs — each resolves to the fired key that carries its NIST specifics.
  'UNDERPAY-RECOVERY': 'recovery', // provider-side governed appeal
  'OVERPAY-RETURN': 'recovery', // payer-side 60-day report-and-return
  'BUNDLE-REVIEW': 'reconciliation',
  'TIMELY-FILING': 'reconciliation',
  'MEMBER-LIABILITY': 'reconciliation',
  'FEE-SCHEDULE-CONFIG': 'fee-schedule-config',
  'RECON-PATTERN-FWA': 'recon-pattern',
  'APPEAL-DENIED': 'recovery', // a denied appeal routed to the arbiter (appeal-of-appeal)
};
export const nistForAlgorithm = (algorithm: string): NistSpec =>
  nistSpec(ALGORITHM_FIRED[algorithm] ?? 'surveillance');

// ── NIST function colors (shared by every ledger/forensic surface) ────────────────
export const NIST_COLOR: Record<NistFn, string> = {
  GOVERN: '#3538cd',
  MAP: '#0e7490',
  MEASURE: '#5b3fa3',
  MANAGE: '#b45309',
};

// ── Exec Twin-Ladder code vocabulary (shared) ─────────────────────────────────────
export const PROOF_CODES = ['D0', 'D1', 'D2', 'D3'] as const; // evidence-tier codes (proof)
export const AUTH_CODES = ['A0', 'A1', 'A2', 'A3'] as const; // authority-rung codes
export const PROOF_LABELS = [
  'Unproven — Human Assist',
  'Partly Proven — HITL',
  'Well Proven — HOTL',
  'Ironclad — Autonomous',
] as const;
export const AUTH_LABELS = [
  'Watch (no action)',
  'Advise — a human decides',
  'Act with sign-off',
  'Act on its own',
] as const;

const TIER_ORD: Record<string, number> = { D0: 0, D1: 1, D2: 2, D3: 3 };
const RUNG_ORD: Record<string, number> = { A0: 0, A1: 1, A2: 2, A3: 3 };
/** Plain-English for an evidence tier "D2" / authority rung "A2". */
export const proofLabel = (tier: string): string => PROOF_LABELS[TIER_ORD[tier] ?? 0];
export const authLabel = (rung: string): string => AUTH_LABELS[RUNG_ORD[rung] ?? 0];
