/**
 * library.ts (Phase D — Surveillance / FWA algorithm library).
 *
 * Pure, dependency-free encoding of the program-integrity / FWA algorithm library from
 * `Surveillance_Algorithm_Library_Plan.md` — the analytics layer that runs ON the shared,
 * tamper-evident evidence record. Every entry carries the plan's governance: its tier
 * (payer P / provider-counter Pr / neutral arbiter N), technique (R rules · S statistical ·
 * G graph · ML anomaly), the Twin-Ladder max authority rung, the action LANE (adverse ·
 * mutual-consent · self-directed · neutral-attestation), the Da Vinci / CMS feed-ins, and
 * the rollout phase / demo-shortlist rank.
 *
 * SOURCE-COUNT NOTE (surfaced, not silently reconciled): the plan's prose headlines "33
 * algorithms (rebuild from 28)", but its Section-3 catalog NAMES 40 distinct algorithms.
 * This library encodes all 40 named — nothing dropped — and the UI shows the live count.
 * `PLAN_HEADLINE_COUNT` records the prose figure so the surface can flag the gap.
 */

export type Tier = 'P' | 'Pr' | 'N';
export type Technique = 'R' | 'S' | 'G' | 'ML';
export type Rung = 'A0' | 'A1' | 'A2' | 'A3';
export type Lane = 'adverse' | 'mutual-consent' | 'self-directed' | 'neutral-attestation';

export const PLAN_HEADLINE_COUNT = 33;

export const CATEGORIES: Record<number, string> = {
  1: 'Billing Integrity',
  2: 'Clinical Appropriateness',
  3: 'Coding Intensity / Risk Adjustment',
  4: 'Network / Referral / Directory',
  5: 'Eligibility & Coverage',
  6: 'Pharmacy',
  7: 'Provider Identity & Exclusion',
  8: 'Temporal / Behavioral',
  9: 'Cross-Party Counter-Surveillance',
  10: 'Independent / Arbiter',
};

export const TIER_LABEL: Record<Tier, string> = {
  P: 'Payer',
  Pr: 'Provider-counter',
  N: 'Neutral arbiter',
};

export const LANE_LABEL: Record<Lane, string> = {
  adverse: 'Adverse action (capped A2, human)',
  'mutual-consent': 'Mutual-consent auto-correct (A3)',
  'self-directed': 'Self-directed (A3)',
  'neutral-attestation': 'Neutral attestation',
};

export const TECHNIQUE_LABEL: Record<Technique, string> = {
  R: 'Rules',
  S: 'Statistical',
  G: 'Graph',
  ML: 'ML anomaly',
};

export interface Algorithm {
  id: string;
  cat: number;
  tiers: Tier[];
  techniques: Technique[];
  maxRung: Rung;
  lane: Lane;
  /** The plan's rung note (e.g. "A2 adverse", "A3 for MAI-3 impossibilities"). */
  rungNote: string;
  desc: string;
  /** Da Vinci / CMS feed-ins that source this algorithm. */
  feeds: string[];
  /** Rollout phase from Section 8 (1–4), or 0 when the plan doesn't phase it explicitly. */
  phase: number;
  /** Demo-shortlist rank (Section 9), 1–6; undefined otherwise. */
  demoRank?: number;
}

export const ALGORITHMS: readonly Algorithm[] = [
  // ── Cat 1 — Billing Integrity ──
  {
    id: 'UNBUNDLE-SENTINEL',
    cat: 1,
    tiers: ['P'],
    techniques: ['R', 'G'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2 adverse',
    desc: 'NCCI PTP + modifier-59 graph — read the attached evidence, don’t just apply the edit.',
    feeds: ['CDex', 'PAS'],
    phase: 2,
    demoRank: 2,
  },
  {
    id: 'MUE-CEILING',
    cat: 1,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A3 for MAI-3 impossibilities',
    desc: 'MUE / MAI logic — impossible unit counts auto-correct under mutual consent.',
    feeds: ['CDex'],
    phase: 1,
  },
  {
    id: 'DUPLICATE-PHANTOM',
    cat: 1,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A3 exact dup / A2 phantom',
    desc: 'Claim vs signed encounter — exact duplicate auto-voids; phantom is flagged for review.',
    feeds: ['CDex', 'Notifications/ADT'],
    phase: 1,
  },
  {
    id: 'DRG-VALIDATE',
    cat: 1,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2, clinical human review',
    desc: 'DRG grouper + CC/MCC capture consistency against the signed documentation.',
    feeds: ['CDex'],
    phase: 2,
  },
  {
    id: 'EM-LEVEL-DRIFT',
    cat: 1,
    tiers: ['P'],
    techniques: ['S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1 only',
    desc: 'E&M level vs peer distribution + note signals — triage flag, never an autonomous downcode.',
    feeds: ['DTR'],
    phase: 3,
  },
  {
    id: 'PRE-BILL-SCRUB',
    cat: 1,
    tiers: ['Pr'],
    techniques: ['R', 'G'],
    maxRung: 'A3',
    lane: 'self-directed',
    rungNote: 'A3 self-directed',
    desc: 'The same billing-integrity engines pointed inward — a provider scrubs its own claims pre-submission.',
    feeds: ['CDex'],
    phase: 1,
  },

  // ── Cat 2 — Clinical Appropriateness (disclosure-sufficiency, not criteria-reading) ──
  {
    id: 'DOC-SUFFICIENCY',
    cat: 2,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2 adverse',
    desc: 'Disclosed CRD/DTR elements only — is the documentation sufficient for the disclosed requirement?',
    feeds: ['CRD', 'DTR'],
    phase: 2,
  },
  {
    id: 'NECESSITY-CONSISTENCY',
    cat: 2,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1',
    desc: 'Self-consistency of the necessity narrative across the signed record — flag, not determination.',
    feeds: ['DTR'],
    phase: 2,
  },
  {
    id: 'CRITERIA-DRIFT',
    cat: 2,
    tiers: ['Pr', 'N'],
    techniques: ['S'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Change-point on approval rate by DECLARED criteria version — detects drift behaviorally, never by reading criteria. (shared with Cat 9)',
    feeds: ['CRD', 'PAS'],
    phase: 3,
  },
  {
    id: 'APPROPRIATE-SETTING',
    cat: 2,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 clinical',
    desc: 'Site-of-service appropriateness against disclosed setting requirements.',
    feeds: ['Notifications/ADT', 'PAS'],
    phase: 3,
  },

  // ── Cat 3 — Coding Intensity / Risk Adjustment ──
  {
    id: 'HCC-INTENSITY',
    cat: 3,
    tiers: ['P', 'N'],
    techniques: ['S'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 sampling',
    desc: '“Recognized-but-not-improving” RAF-vs-treatment intensity — the high-stakes RA case handled with restraint.',
    feeds: ['Risk-Adjustment CDex', 'PDex', 'DEQM'],
    phase: 3,
    demoRank: 5,
  },
  {
    id: 'RADV-SAMPLER',
    cat: 3,
    tiers: ['P', 'N'],
    techniques: ['S'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2',
    desc: 'Defensible stratified sample + extrapolation for RADV audit.',
    feeds: ['Risk-Adjustment CDex'],
    phase: 3,
  },
  {
    id: 'ADDED-DX-NOSHOW',
    cat: 3,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1',
    desc: 'Diagnoses appearing only in RA sweeps (never treated), provenance-tagged.',
    feeds: ['Risk-Adjustment CDex', 'PDex'],
    phase: 3,
  },
  {
    id: 'RA-SELF-CHECK',
    cat: 3,
    tiers: ['Pr'],
    techniques: ['R', 'S'],
    maxRung: 'A3',
    lane: 'self-directed',
    rungNote: 'A3',
    desc: 'Risk-adjustment coding integrity turned inward by the provider before submission.',
    feeds: ['Risk-Adjustment CDex'],
    phase: 1,
  },

  // ── Cat 4 — Network / Referral / Directory ──
  {
    id: 'GHOST-NETWORK',
    cat: 4,
    tiers: ['Pr', 'N'],
    techniques: ['G'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Plan-Net “in-network” vs NDH/NPPES vs claims vs contract triangulation — phantom-network detector.',
    feeds: ['Plan-Net', 'NDH', 'NPPES'],
    phase: 2,
  },
  {
    id: 'REFERRAL-RING',
    cat: 4,
    tiers: ['P'],
    techniques: ['G'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1 human + counsel',
    desc: 'Stark / AKS graph proxies — self-referral / kickback pattern proxies, human + counsel gated.',
    feeds: ['CDex', 'PDex'],
    phase: 3,
  },
  {
    id: 'DIRECTORY-DRIFT',
    cat: 4,
    tiers: ['N'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'neutral-attestation',
    rungNote: 'A2 attestation',
    desc: 'Plan-Net vs NDH reconciliation — neutral directory-accuracy attestation.',
    feeds: ['Plan-Net', 'NDH'],
    phase: 3,
  },
  {
    id: 'STEERING-DETECT',
    cat: 4,
    tiers: ['Pr'],
    techniques: ['S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1',
    desc: 'Directory de-list / tier change unsupported by a quality signal — steering detector.',
    feeds: ['Plan-Net'],
    phase: 3,
  },

  // ── Cat 5 — Eligibility & Coverage ──
  {
    id: 'ELIG-PHANTOM',
    cat: 5,
    tiers: ['P'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A3 mutual-consent',
    desc: 'Date-of-service eligibility join — clean mismatches auto-resolve under mutual consent.',
    feeds: ['PDex'],
    phase: 1,
  },
  {
    id: 'RETRO-TERM-TRAP',
    cat: 5,
    tiers: ['Pr'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Retroactive termination AFTER pre-approved care — temporal-ordering trap on the payer.',
    feeds: ['PAS', 'PDex'],
    phase: 2,
  },
  {
    id: 'COB-GAP',
    cat: 5,
    tiers: ['P', 'Pr'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2 either direction',
    desc: 'Wrong primary / double pay / wrongful primary-denial — coordination-of-benefits, either direction.',
    feeds: ['PDex'],
    phase: 2,
  },

  // ── Cat 6 — Pharmacy ──
  {
    id: 'RX-DUP-THERAPY',
    cat: 6,
    tiers: ['P'],
    techniques: ['G'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2',
    desc: 'Prescriber–pharmacy–member graph for duplicate therapy.',
    feeds: ['PDex'],
    phase: 3,
  },
  {
    id: 'RX-DIVERSION',
    cat: 6,
    tiers: ['P', 'N'],
    techniques: ['S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1 SIU / PDMP',
    desc: 'MME + geographic implausibility — diversion signal routed to SIU / PDMP.',
    feeds: ['PDex'],
    phase: 3,
  },
  {
    id: 'FORMULARY-DENIAL-DRIFT',
    cat: 6,
    tiers: ['Pr'],
    techniques: ['S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1',
    desc: 'Pharmacy denials vs the disclosed formulary version — formulary-drift on the payer.',
    feeds: ['CRD', 'PAS'],
    phase: 3,
  },

  // ── Cat 7 — Provider Identity & Exclusion ──
  {
    id: 'EXCLUSION-SCREEN',
    cat: 7,
    tiers: ['P', 'N'],
    techniques: ['G', 'R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A2 / A3 exact match',
    desc: 'LEIE + SAM + identity-resolution graph (reincorporation) — continuous, service-date-bound; exact match auto-acts.',
    feeds: ['LEIE + SAM', 'NPPES'],
    phase: 1,
  },
  {
    id: 'NPI-INTEGRITY',
    cat: 7,
    tiers: ['P', 'N'],
    techniques: ['G'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2',
    desc: 'Shared / borrowed / dead NPIs — models locum & supervision to avoid false flags.',
    feeds: ['NPPES', 'NDH'],
    phase: 2,
  },
  {
    id: 'CREDENTIAL-LAPSE',
    cat: 7,
    tiers: ['P', 'Pr'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A2 either direction',
    desc: 'Service during a license lapse OR a payer denying a validly-credentialed provider — either direction.',
    feeds: ['NPPES', 'Plan-Net'],
    phase: 2,
  },

  // ── Cat 8 — Temporal / Behavioral ──
  {
    id: 'CALENDAR-IMPOSSIBLE',
    cat: 8,
    tiers: ['P', 'N'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A1/A2/A3-mutual',
    desc: 'Hard time-arithmetic — >24h/day, two-locations-at-once. Near-zero false positives; the unbeatable opener.',
    feeds: ['Notifications/ADT', 'CDex'],
    phase: 2,
    demoRank: 1,
  },
  {
    id: 'VELOCITY-SPIKE',
    cat: 8,
    tiers: ['P'],
    techniques: ['ML', 'S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1 only',
    desc: 'Self + peer baseline anomaly (aligns with CMS FPS) — triage recall, never sole basis of harm.',
    feeds: ['CDex'],
    phase: 3,
  },
  {
    id: 'OFF-HOURS-PATTERN',
    cat: 8,
    tiers: ['P'],
    techniques: ['S'],
    maxRung: 'A1',
    lane: 'adverse',
    rungNote: 'A1',
    desc: 'Off-hours billing pattern anomaly — flag only.',
    feeds: ['CDex'],
    phase: 3,
  },
  {
    id: 'DENIAL-VELOCITY',
    cat: 8,
    tiers: ['Pr'],
    techniques: ['R', 'S'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Decision latency < time-to-read-the-attachment = “click-deny” on the payer.',
    feeds: ['PAS'],
    phase: 2,
    demoRank: 4,
  },

  // ── Cat 9 — Cross-Party Counter-Surveillance ──
  {
    id: 'UNDERPAY-CARC',
    cat: 9,
    tiers: ['Pr'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A3 mutual-consent',
    desc: 'Contract-rate arithmetic + CARC clustering — the payer auto-honors a contracted-rate underpayment, live.',
    feeds: ['PAS'],
    phase: 1,
    demoRank: 3,
  },
  {
    id: 'AUTO-DENY-PATTERN',
    cat: 9,
    tiers: ['Pr', 'N'],
    techniques: ['S'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Abnormal overturn-on-appeal rate by denial reason — the KFF 80.7% stat made visceral.',
    feeds: ['PAS'],
    phase: 2,
    demoRank: 4,
  },
  {
    id: 'DOWNCODE-SILENT',
    cat: 9,
    tiers: ['Pr'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A2 / A3-mutual',
    desc: 'Billed ≠ paid with no documented rationale — silent-downcode detector on the payer.',
    feeds: ['PAS'],
    phase: 2,
  },
  {
    id: 'PROMPT-PAY-WATCH',
    cat: 9,
    tiers: ['Pr'],
    techniques: ['R'],
    maxRung: 'A3',
    lane: 'mutual-consent',
    rungNote: 'A3 mutual-consent',
    desc: 'Statutory interest owed on late clean claims — prompt-pay arithmetic auto-honored.',
    feeds: ['PAS'],
    phase: 1,
  },
  {
    id: 'RECOUP-OVERREACH',
    cat: 9,
    tiers: ['Pr'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'adverse',
    rungNote: 'A1/A2 attestation',
    desc: 'Recoupment outside the lookback / notice window — recoupment-overreach on the payer.',
    feeds: ['PAS'],
    phase: 2,
  },

  // ── Cat 10 — Independent / Arbiter (neutral only) ──
  {
    id: 'REPRO-RERUN',
    cat: 10,
    tiers: ['N'],
    techniques: ['R'],
    maxRung: 'A2',
    lane: 'neutral-attestation',
    rungNote: 'A2 attestation',
    desc: 'Deterministic replay of any adverse finding vs identical signed evidence + signed algo/model version — the admissibility gate.',
    feeds: ['TEFCA/QHIN'],
    phase: 2,
    demoRank: 6,
  },
  {
    id: 'RECON-GAP',
    cat: 10,
    tiers: ['N'],
    techniques: ['G'],
    maxRung: 'A2',
    lane: 'neutral-attestation',
    rungNote: 'A1/A2',
    desc: 'Bipartite match of signed vs countersigned events — the phantom / missing detector.',
    feeds: ['TEFCA/QHIN'],
    phase: 2,
  },
  {
    id: 'DRIFT-ATTEST',
    cat: 10,
    tiers: ['N'],
    techniques: ['S'],
    maxRung: 'A2',
    lane: 'neutral-attestation',
    rungNote: 'A2',
    desc: 'Independent re-computation of drift / overturn / underpay findings by the neutral.',
    feeds: ['TEFCA/QHIN'],
    phase: 3,
  },
  {
    id: 'FAIRNESS-GUARD',
    cat: 10,
    tiers: ['N'],
    techniques: ['ML', 'S'],
    maxRung: 'A2',
    lane: 'neutral-attestation',
    rungNote: 'A1/A2 — may suspend an algorithm',
    desc: 'Disparate-impact screening of BOTH sides’ algorithms against Gravity SDOH strata; can suspend an algorithm.',
    feeds: ['Gravity SDOH', 'DEQM'],
    phase: 4,
  },
];

/** Live counts for the surface (self-consistent regardless of the plan's prose headline). */
export const ALGO_COUNT = ALGORITHMS.length;
export const CATEGORY_COUNT = new Set(ALGORITHMS.map((a) => a.cat)).size;

export const DEMO_SHORTLIST: readonly Algorithm[] = [...ALGORITHMS]
  .filter((a) => a.demoRank !== undefined)
  .sort((a, b) => (a.demoRank ?? 99) - (b.demoRank ?? 99));
