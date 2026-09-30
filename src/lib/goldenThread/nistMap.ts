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

/** The four authority rungs, restated locally so this module stays free of the evidence barrel. */
export type EffectiveRung = 'A0' | 'A1' | 'A2' | 'A3';

/**
 * The EFFECTIVE autonomy label for a rung — the single rung→label map in the system.
 *
 * TWO CONCEPTS, NOT ONE, and the distinction is the whole point of the twin-ladder interlock:
 *   • the GRANT  — `AutonomyTier` ('HITL' | 'HOTL' | 'autonomous'), what a manifest ALLOWS. Three
 *     members, no 'assist'. Adding a fourth is now a decision the compiler forces rather than a
 *     silent fall-through: `agents/authority/types.ts` derives `AUTONOMY_ORDER` from the same object
 *     that declares the union, `decisionGate.evaluateDecision` switches exhaustively with a `never`
 *     witness, and `interlock.minRung` floors an unranked rung to A0 instead of returning the other
 *     side. Each of those three was a separate fail-open, and the first version of this comment
 *     named only one of them.
 *   • the EFFECTIVE label — this type. FOUR members, because A0 exists: an agent at A0 may only
 *     advise. A0 has no counterpart in the grant vocabulary and never should.
 *
 * WHAT THIS REPLACED. Three independent rung→label mappings existed, and two of them disagreed:
 *   1. `RUNG_AUTONOMY` in e2eFlow.ts       A0→'assist'
 *   2. `RUNG_GATE` in escalationSignals.ts A0→'assist'  (lower-cased for the rest)
 *   3. an inline ternary in flowSim.ts     A0→'watch'   ← the divergence
 * So an A0 record carried `assist` or `watch` in its hashed `version` field depending only on which
 * code path sealed it. `'watch'` was copied from `Oversight` below, where it is a legitimate and
 * DIFFERENT value — oversight mode, not autonomy label — and is emitted independently into the
 * record's own `oversight` field for every non-human A0 act. So nothing read `'watch'` out of
 * `version`, and collapsing it loses no information.
 *
 * `Oversight` (below) stays a separate vocabulary on purpose. Its tokens 'HITL'/'HOTL' overlap these
 * by SPELLING and not by meaning: one answers "how much autonomy did this act exercise", the other
 * "what human oversight mode was in force". A future pass to "unify all the autonomy strings" must
 * not merge them.
 */
export type EffectiveAutonomy = 'assist' | 'HITL' | 'HOTL' | 'autonomous';

const EFFECTIVE_AUTONOMY_MAP = Object.freeze({
  A0: 'assist',
  A1: 'HITL',
  A2: 'HOTL',
  A3: 'autonomous',
}) satisfies Readonly<Record<EffectiveRung, EffectiveAutonomy>>;

/** The effective autonomy label for a rung. Total over `EffectiveRung` by construction. */
export const effectiveAutonomy = (rung: EffectiveRung): EffectiveAutonomy =>
  EFFECTIVE_AUTONOMY_MAP[rung];

/**
 * The same label for a rung expressed as a NUMBER (a clamped ceiling), which is the shape the engine
 * holds. Out-of-range clamps to A0 rather than throwing: a seal must never fail on a label lookup,
 * and A0 is the safe end — an act recorded as advise-only understates authority, never overstates it.
 */
export const effectiveAutonomyForLevel = (level: number): EffectiveAutonomy =>
  EFFECTIVE_AUTONOMY_MAP[`A${Math.max(0, Math.min(3, Math.trunc(level)))}` as EffectiveRung];

/**
 * The wire/queue token for the same value. `ProcessGate` stays a NOMINAL type rather than becoming a
 * `.toLowerCase()` of the above, because `gate` crosses an HTTP boundary — `/api/evidence/[id]`
 * returns it inside `analysis.routed`, a client renders the raw token, and a test fixture pins the
 * literal `'hitl'`. Deriving it by string transform would change an API body with no compile-time
 * signal; an explicit map means widening the vocabulary is a type error at this table.
 */
export const PROCESS_GATE_OF = Object.freeze({
  assist: 'assist',
  HITL: 'hitl',
  HOTL: 'hotl',
  autonomous: 'autonomous',
}) satisfies Readonly<Record<EffectiveAutonomy, string>>;

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
