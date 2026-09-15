/**
 * Reconciliation domain — the recon agent's classification, per-claim audit-record content,
 * and portfolio insights. PURE + CLIENT-SAFE: no engine import, no `@/lib/evidence` barrel,
 * no `node:crypto`. The chaining/sealing of these records into the recon sub-ledger is done by
 * the engine (flowSim), which owns mixHash and the SimState; this module only classifies and
 * derives PHI-safe content deterministically.
 *
 * WHAT IS REAL vs ILLUSTRATIVE (honesty):
 *  - REAL (reused domain): the X12 Claim-Adjustment GROUP semantics (CO/PR/OA/PI) and member-
 *    liability derivation are the same rules `@/lib/graph/mapping/carcGroup.ts` implements
 *    (CO = provider write-off, member NOT billed; PR = member owes; OA/PI = neither billed).
 *    The provider/payer SEAT boundary is the same `ROLE_SIDE` the Operations model enforces.
 *  - ILLUSTRATIVE (labelled): the per-claim CAS/CARC values here are a deterministic MODELLED
 *    distribution keyed off the claim id — NOT parsed from a live 835. Claim-level, not line-
 *    level (a real 835 carries CAS per service line). Amounts are PHI-safe synthetic seed.
 *
 * TWO-SIDED by design (adversarial-before HIGH): reconciliation is not one agent. The PROVIDER
 * side reconciles the 835 against its loaded contract and owns underpayment (→ appeal) and
 * bundling/downcode (→ coding). The PAYER side reconciles its own adjudication against its
 * config/policy and owns overpayment (→ 60-day report-and-return), systematic FWA patterns
 * (→ SIU/PI), and mis-loaded fee-schedule config (→ reprocess). Neither seat acts inside the
 * other institution; a provider-side finding that implicates the payer is SENT across the wire
 * as a governed submission, never pressed as a button inside the payer.
 */
import type { ScenarioId } from '@/lib/goldenThread/scenarios';

// ── X12 adjustment groups (same semantics as carcGroup.ts; re-expressed pure/client-safe) ──
export type AdjustmentGroup = 'CO' | 'PR' | 'OA' | 'PI';
export type MemberLiability =
  'member-responsibility' | 'not-member-responsibility' | 'indeterminate';
export const GROUP_MEANING: Readonly<Record<AdjustmentGroup, string>> = Object.freeze({
  CO: 'Contractual Obligation — provider write-off, member NOT billed',
  PR: 'Patient Responsibility — the member owes this portion',
  OA: 'Other Adjustment — neither party billed (informational/transfer)',
  PI: 'Payer-Initiated Reduction — payer reduction, member NOT billed',
});

/** Which institution's recon agent owns a class (mirrors ROLE_SIDE — no cross-boundary action). */
export type ReconSide = 'provider' | 'payer';

/** The reconciliation classification of one claim's 835-vs-contracted settlement. */
export type ReconClass =
  | 'clean' //                  allowed == contracted; nothing to reconcile
  | 'contractual-writeoff' //   CO within contract — the normal write-off, NOT a dispute
  | 'underpayment' //           allowed BELOW contracted beyond the permitted write-down → provider appeal
  | 'overpayment' //            paid ABOVE contracted → payer identified-overpayment (60-day report-and-return)
  | 'bundling-downcode' //      CO-97 bundling / downcode → provider coding review
  | 'timely-filing' //          CO-29 filing limit expired → provider process failure (not appealable)
  | 'member-liability-review'; //  PR on a Medicaid remit → review (Medicaid members generally not balance-billed)

export interface ReconClassSpec {
  label: string;
  group: AdjustmentGroup;
  carc: string; // PHI-safe X12 code label
  rarc: string; // paired remittance-advice remark (— when none)
  memberLiability: MemberLiability;
  side: ReconSide; // which recon seat owns it (never crosses the wire to act)
  /** The role a governed handoff routes to (null = no dispute/handoff; reconciled and closed). */
  handoffRole: string | null;
  /** The governed-action code-level actionType — MUST be an exact governance string so the
   *  submission/adverse human-gate applies (adversarial-before HIGH: '837-corrected' ≠
   *  'x12-837-corrected' would fail-open). '' = no outbound (internal routing only). */
  actionType: string;
  appealable: boolean;
  severity: 'info' | 'action' | 'warning' | 'critical';
  /** Does routing this handoff require a qualified human regardless of earned rung? */
  humanGated: boolean;
  blurb: string; // one-line PHI-safe rationale shown on the delta table
}

/**
 * The frozen per-class descriptor. ONE value (the class) is drawn from the claim-id hash; every
 * other field is looked up here — so the tuple is ALWAYS coherent (a CO-45 never carries a PR
 * member-liability, the exact contradiction carcGroup.ts exists to prevent). Governance strings
 * are exact members of the submission/adverse sets in decisionGate.ts.
 */
export const RECON_CLASS_SPEC: Readonly<Record<ReconClass, ReconClassSpec>> = Object.freeze({
  clean: {
    label: 'Clean — paid at contract',
    group: 'OA',
    carc: '—',
    rarc: '—',
    memberLiability: 'not-member-responsibility',
    side: 'provider',
    handoffRole: null,
    actionType: '',
    appealable: false,
    severity: 'info',
    humanGated: false,
    blurb: 'Allowed equals the loaded contracted rate — nothing to reconcile.',
  },
  'contractual-writeoff': {
    label: 'Contractual write-off (within contract)',
    group: 'CO',
    carc: 'CO-45',
    rarc: 'N130',
    memberLiability: 'not-member-responsibility',
    side: 'provider',
    handoffRole: null,
    actionType: '',
    appealable: false,
    severity: 'info',
    humanGated: false,
    blurb:
      'CO-45 billed-minus-allowed write-off is WITHIN the contracted adjustment — correct, member not billed, no dispute.',
  },
  underpayment: {
    label: 'Underpayment — allowed below contract',
    group: 'CO',
    carc: 'CO-45 (over-adjustment)',
    rarc: 'N130',
    memberLiability: 'not-member-responsibility',
    side: 'provider',
    handoffRole: 'provider-revint',
    actionType: 'appeal',
    appealable: true,
    severity: 'action',
    humanGated: true,
    blurb:
      'CO-45 write-off EXCEEDS the contract-permitted adjustment — a plan-side shortfall (no PR group). Governed appeal; transmission human-gated.',
  },
  overpayment: {
    label: 'Overpayment — paid above contract',
    group: 'PI',
    carc: 'post-pay audit',
    rarc: '—',
    memberLiability: 'not-member-responsibility',
    side: 'payer',
    handoffRole: 'payer-pi',
    actionType: 'overpayment-return',
    appealable: false,
    severity: 'warning',
    humanGated: true,
    blurb:
      'Paid ABOVE the contracted rate — an identified overpayment. 42 USC 1320a-7k(d)/ACA §6402: report-and-return within 60 days. Recoupment is a human determination.',
  },
  'bundling-downcode': {
    label: 'Bundling / downcode',
    group: 'CO',
    carc: 'CO-97',
    rarc: 'M15',
    memberLiability: 'not-member-responsibility',
    side: 'provider',
    handoffRole: 'provider-coding',
    actionType: 'coding-review',
    appealable: true,
    severity: 'action',
    humanGated: false,
    blurb:
      'CO-97 — service bundled into another line/downcoded. Coding review; appealable ONLY if unbundling (modifier/documentation) is supported.',
  },
  'timely-filing': {
    label: 'Timely-filing denial',
    group: 'CO',
    carc: 'CO-29',
    rarc: 'N211',
    memberLiability: 'not-member-responsibility',
    side: 'provider',
    handoffRole: 'provider-revint',
    actionType: '',
    appealable: false,
    severity: 'warning',
    humanGated: false,
    blurb:
      'CO-29 filing limit expired — a provider submission-lag process failure, generally NOT appealable. Root-cause the lag; do not draft an appeal.',
  },
  'member-liability-review': {
    // Owner is Program-Integrity / member-protection (NOT the fee-schedule config desk — a PR balance-bill
    // signal is not a rate-config defect). actionType carries 'balance-bill' so the ADVERSE predicate itself
    // requires a human — the gate is not a hand-set flag alone (adversarial-after HIGH: predicate governs).
    label: 'Member-liability review (Medicaid)',
    group: 'PR',
    carc: 'PR-3',
    rarc: 'N130',
    memberLiability: 'member-responsibility',
    side: 'payer',
    handoffRole: 'payer-pi',
    actionType: 'balance-bill-review',
    appealable: false,
    severity: 'warning',
    humanGated: true,
    blurb:
      'A PR (member-owes) group on a Medicaid remittance — Medicaid members are generally NOT balance-billed, so a PR here is often an error/improper-billing signal to REVIEW, not a benign member charge.',
  },
});

/** The full audit-trail row content (the engine adds seq/prevHash/hash when it chains + seals). */
export interface ReconRecordContent {
  claimRef: string; // PHI-safe (e.g. "837I · claim ••••3921 · CPT 99215")
  provider: string; // illustrative, PHI-safe
  payer: string;
  reconClass: ReconClass;
  group: AdjustmentGroup;
  carc: string;
  rarc: string;
  memberLiability: MemberLiability;
  side: ReconSide;
  billedUsd: number;
  contractedUsd: number;
  paidUsd: number;
  deltaUsd: number; // signed: negative = underpaid (provider short), positive = overpaid (payer over)
  variancePct: number; // |delta| / contracted, one decimal
  handoffRole: string | null;
  actionType: string;
  appealable: boolean;
  severity: ReconClassSpec['severity'];
  humanGated: boolean;
  /** appeal / report-and-return deadline in ticks from the record's tick (0 = none). */
  clockTicks: number;
  /** realized recovery — set by the engine when a modelled 835 posts on an accepted appeal. */
  recoveredUsd?: number;
}

// ── Deterministic, RNG-free derivation (does NOT touch the engine's mulberry stream) ──
/** A stable 32-bit hash of a string — pure, no engine coupling (FNV-1a). */
export function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** A stable 0..1 from a string + salt. */
function unit(id: string, salt: string): number {
  return hashStr(`${id}#${salt}`) / 4294967296;
}

/** Illustrative multi-payer / multi-provider seed book for recon records (PHI-safe). */
export const RECON_PROVIDERS: readonly string[] = Object.freeze([
  'Cascadia Integrated Health System (illustrative)',
  'Olympic Multispecialty Group (illustrative)',
  'Rainier Community FQHC (illustrative)',
  'Puget Sound Surgical (illustrative)',
]);
export const RECON_PAYERS: readonly string[] = Object.freeze([
  'UnitedHealthcare Community Plan (illustrative)',
  'Molina Healthcare of WA (illustrative)',
  'Coordinated Care / Centene (illustrative)',
]);
const CPT_POOL = ['99213', '99215', '99417', '72148', '43239', '29881', '90837', '80053'];
const CLAIM_KINDS = ['837P', '837I', '837D'];

/**
 * Non-dispute class distribution (used when the engine's existing `disputed` roll did NOT fire).
 * The `disputed` roll (a real mulberry draw, unchanged) pins `underpayment`; everything else is
 * derived here from the id-hash so the main RNG stream — and the determinism pin — is untouched.
 * Weighted so most claims are correctly paid (clean/contractual dominate), which is the honest
 * shape: reconciliation mostly CONFIRMS payment; only a minority are true exceptions.
 */
const NONDISPUTE_CLASSES: ReadonlyArray<[ReconClass, number]> = [
  ['clean', 46],
  ['contractual-writeoff', 24],
  ['bundling-downcode', 10],
  ['overpayment', 7],
  ['timely-filing', 6],
  ['member-liability-review', 7],
];

function pickNonDispute(id: string): ReconClass {
  const total = NONDISPUTE_CLASSES.reduce((a, [, w]) => a + w, 0);
  let r = unit(id, 'class') * total;
  for (const [c, w] of NONDISPUTE_CLASSES) {
    r -= w;
    if (r < 0) return c;
  }
  return 'clean';
}

/**
 * Classify one claim's reconciliation from stable, PHI-safe inputs. `disputed` is the engine's
 * existing reconciliation roll (a real mulberry draw) — when true this is a genuine underpayment
 * that already routes through the recovery lane, so we pin the class to keep the two consistent.
 * `patternProvider` (optional) forces a designed CARC concentration on one provider so the
 * systematic-pattern + fee-schedule-config insights are REAL on the warm book (adversarial-before
 * MED). Everything is derived from `id` — no RNG draw — so the main stream stays byte-identical.
 */
export function classifyRecon(args: {
  id: string;
  tick: number;
  disputed: boolean;
  scenario: ScenarioId;
  patternProvider?: string; // when set, this record is part of the seeded systematic cluster
}): ReconRecordContent {
  const { id, disputed, patternProvider } = args;
  let reconClass: ReconClass = disputed ? 'underpayment' : pickNonDispute(id);
  // The seeded systematic cluster is a run of underpayments on ONE provider/CPT (a mis-loaded fee
  // schedule) — so pattern + config insights have signal. Only applied to cluster members.
  if (patternProvider) reconClass = 'underpayment';

  const spec = RECON_CLASS_SPEC[reconClass];
  const provider =
    patternProvider ?? RECON_PROVIDERS[hashStr(id + 'prov') % RECON_PROVIDERS.length];
  const payer = RECON_PAYERS[hashStr(id + 'pay') % RECON_PAYERS.length];
  const cpt = patternProvider ? '99215' : CPT_POOL[hashStr(id + 'cpt') % CPT_POOL.length];
  const kind = CLAIM_KINDS[hashStr(id + 'k') % CLAIM_KINDS.length];
  const claimNo = String(1000 + (hashStr(id + 'n') % 8999));
  const claimRef = `${kind} · claim ••••${claimNo} · CPT ${cpt}`;

  // Amounts (PHI-safe synthetic). Contracted is the reference; billed sits above it; paid derives
  // from the class so delta/variance are coherent with the classification.
  const contractedUsd = 180 + Math.floor(unit(id, 'amt') * 2200); // $180..$2380
  const billedUsd = Math.round(contractedUsd * (1.35 + unit(id, 'bill') * 0.5)); // billed > contracted
  let paidUsd = contractedUsd;
  let clockTicks = 0;
  switch (reconClass) {
    case 'clean':
      paidUsd = contractedUsd;
      break;
    case 'contractual-writeoff':
      paidUsd = contractedUsd;
      break; // paid at contract; the write-off is billed−contracted (correct)
    case 'underpayment': {
      const shortPct = 0.1 + unit(id, 'short') * 0.18; // 10–28% below contract
      paidUsd = Math.round(contractedUsd * (1 - shortPct));
      clockTicks = 120; // dispute/appeal deadline clock (illustrative)
      break;
    }
    case 'overpayment': {
      const overPct = 0.06 + unit(id, 'over') * 0.16; // 6–22% above contract
      paidUsd = Math.round(contractedUsd * (1 + overPct));
      clockTicks = 180; // 60-day report-and-return clock (illustrative mapping)
      break;
    }
    case 'bundling-downcode':
      paidUsd = Math.round(contractedUsd * (0.55 + unit(id, 'bd') * 0.2));
      break; // partially paid
    case 'timely-filing':
      paidUsd = 0;
      break; // denied for filing
    case 'member-liability-review':
      paidUsd = Math.round(contractedUsd * (0.7 + unit(id, 'pr') * 0.2));
      break; // remainder posted PR
  }
  const deltaUsd = paidUsd - contractedUsd; // signed
  const variancePct =
    contractedUsd > 0 ? Number(((Math.abs(deltaUsd) / contractedUsd) * 100).toFixed(1)) : 0;

  return {
    claimRef,
    provider,
    payer,
    reconClass,
    group: spec.group,
    carc: spec.carc,
    rarc: spec.rarc,
    memberLiability: spec.memberLiability,
    side: spec.side,
    billedUsd,
    contractedUsd,
    paidUsd,
    deltaUsd,
    variancePct,
    handoffRole: spec.handoffRole,
    actionType: spec.actionType,
    appealable: spec.appealable,
    severity: spec.severity,
    humanGated: spec.humanGated,
    clockTicks,
  };
}

// ── Portfolio insights (pure over an array of records — computed at render, never in advance()) ──
export interface CarcDriver {
  carc: string;
  group: AdjustmentGroup;
  count: number;
  amountUsd: number;
}
export interface SystematicPattern {
  provider: string;
  carc: string;
  count: number;
  amountUsd: number;
  kind: 'fwa-signal' | 'fee-schedule-config'; // FWA/SIU pattern vs a mis-loaded fee schedule
  routeRole: string; // payer-pi (FWA) or payer-config (fee schedule)
}
export interface ReconInsights {
  total: number;
  byClass: Record<ReconClass, number>;
  topCarcDrivers: CarcDriver[];
  systematicPatterns: SystematicPattern[];
  totalRecoverableUsd: number; // sum of |underpayment| deltas identified (provider short-paid)
  totalRealizedUsd: number; //   of which realized — a modelled 835 posted on an accepted appeal
  totalReturnableUsd: number; //  sum of overpayment deltas (payer over-paid → report-and-return)
  disputeCount: number; // records with a governed handoff (a dispute/action)
}

const SYSTEMATIC_MIN = 3; // same CARC on one provider ≥ this ⇒ systematic, not one-off

/** Aggregate a set of recon records into portfolio insights. Pure + deterministic. */
export function reconInsights(records: readonly ReconRecordContent[]): ReconInsights {
  const byClass = {
    clean: 0,
    'contractual-writeoff': 0,
    underpayment: 0,
    overpayment: 0,
    'bundling-downcode': 0,
    'timely-filing': 0,
    'member-liability-review': 0,
  } as Record<ReconClass, number>;
  const carcMap = new Map<string, CarcDriver>();
  const provCarc = new Map<
    string,
    { provider: string; carc: string; cls: ReconClass; count: number; amt: number }
  >();
  let totalRecoverableUsd = 0;
  let totalRealizedUsd = 0;
  let totalReturnableUsd = 0;
  let disputeCount = 0;

  for (const r of records) {
    byClass[r.reconClass] += 1;
    if (r.handoffRole) disputeCount += 1;
    if (r.reconClass === 'underpayment') totalRecoverableUsd += Math.abs(r.deltaUsd);
    if (r.recoveredUsd) totalRealizedUsd += r.recoveredUsd;
    if (r.reconClass === 'overpayment') totalReturnableUsd += r.deltaUsd;
    if (r.carc !== '—') {
      const d = carcMap.get(r.carc) ?? { carc: r.carc, group: r.group, count: 0, amountUsd: 0 };
      d.count += 1;
      d.amountUsd += Math.abs(r.deltaUsd);
      carcMap.set(r.carc, d);
      // provider×carc concentration (for systematic detection) — only for adjustment-bearing rows
      if (
        r.reconClass === 'underpayment' ||
        r.reconClass === 'bundling-downcode' ||
        r.reconClass === 'overpayment'
      ) {
        const key = `${r.provider}|${r.carc}`;
        const p = provCarc.get(key) ?? {
          provider: r.provider,
          carc: r.carc,
          cls: r.reconClass,
          count: 0,
          amt: 0,
        };
        p.count += 1;
        p.amt += Math.abs(r.deltaUsd);
        provCarc.set(key, p);
      }
    }
  }

  const topCarcDrivers = [...carcMap.values()]
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 6);
  const systematicPatterns: SystematicPattern[] = [...provCarc.values()]
    .filter((p) => p.count >= SYSTEMATIC_MIN)
    .map((p) => {
      // A uniform underpayment concentration reads as a mis-loaded fee schedule (config → payer-config);
      // any other repeated concentration is an FWA/utilization signal (→ payer-pi/SIU).
      const feeSchedule = p.cls === 'underpayment';
      return {
        provider: p.provider,
        carc: p.carc,
        count: p.count,
        amountUsd: p.amt,
        kind: feeSchedule ? 'fee-schedule-config' : 'fwa-signal',
        routeRole: feeSchedule ? 'payer-config' : 'payer-pi',
      } as SystematicPattern;
    })
    .sort((a, b) => b.amountUsd - a.amountUsd);

  return {
    total: records.length,
    byClass,
    topCarcDrivers,
    systematicPatterns,
    totalRecoverableUsd,
    totalRealizedUsd,
    totalReturnableUsd,
    disputeCount,
  };
}
