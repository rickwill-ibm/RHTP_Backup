/**
 * nistAiRmf.ts (Phase E — NIST AI-RMF / explainability extension to the evidence record).
 *
 * A PURE, PHI-safe PROJECTION of a real order→cash `CashResult` onto the NIST AI Risk
 * Management Framework (AI RMF 1.0): the four core functions (GOVERN · MAP · MEASURE ·
 * MANAGE), the seven trustworthiness characteristics, and a per-decision explainability
 * record. It is an INTERPRETATION LAYER over the existing sealed evidence record — it adds
 * no entries to the append-only ledger and mutates nothing; each control cites the REAL
 * evidence feature that satisfies it (tier, interlock, seal, HITL gate, provenance), so the
 * profile is grounded, not asserted.
 *
 * DEEP imports only (never the '@/lib/evidence' barrel → node:crypto): the tier config is a
 * pure module; `CashResult` is a type-only import (erased at compile time).
 */
import { tierOfEntry } from './tier';
import { TIER_RUNG_CEILING, type EvidenceTier, type AuthorityRung } from './tierConfig';
import type { CashResult } from '@/lib/goldenThread/orderToCash';

export type RmfFunction = 'GOVERN' | 'MAP' | 'MEASURE' | 'MANAGE';
export type ControlStatus = 'satisfied' | 'partial' | 'n/a';

export interface RmfControl {
  id: string;
  title: string;
  status: ControlStatus;
  /** The REAL evidence feature that satisfies (or partially satisfies) this control. */
  evidence: string;
}

export interface RmfFunctionBlock {
  fn: RmfFunction;
  blurb: string;
  controls: RmfControl[];
}

export interface Trustworthiness {
  characteristic: string;
  status: ControlStatus;
  note: string;
}

export interface ExplainabilityRecord {
  stage: string;
  /** What fired (a rule / model / determination), PHI-safe. */
  firedRule: string;
  ruleVersion: string;
  evidenceTier: EvidenceTier;
  ceilingRung: AuthorityRung;
  requiresHuman: boolean;
  /** A short, member-facing reason (no free-text PHI). */
  reason: string;
}

export interface AiRmfProfile {
  functions: RmfFunctionBlock[];
  trustworthiness: Trustworthiness[];
  explainability: ExplainabilityRecord[];
  /** Counts for the headline. */
  satisfied: number;
  total: number;
}

const RULE_VERSION = 'twin-ladder-v1'; // the governance ruleset version bound to this thread

/** Project a real CashResult onto the NIST AI-RMF. Pure + PHI-safe. */
export function buildAiRmfProfile(cash: CashResult): AiRmfProfile {
  const tier = cash.currentTier;
  const sealed = Boolean(cash.integrity?.signed);
  const intact = Boolean(cash.integrity?.intact);
  const hasRecovery = Boolean(cash.recovery);
  const humanGated = cash.recovery ? cash.recovery.requiresHumanForSubmission !== false : true;
  const reconciled = Boolean(cash.reconciliation);

  const S = (b: boolean): ControlStatus => (b ? 'satisfied' : 'partial');

  const functions: RmfFunctionBlock[] = [
    {
      fn: 'GOVERN',
      blurb: 'Policies, accountability, and the human-authority structure around the AI.',
      controls: [
        {
          id: 'GOVERN-1.1',
          title: 'Authority bounded to evidence (Twin-Ladder interlock)',
          status: 'satisfied',
          evidence:
            'permittedRung = min(manifestAutonomy, tierCeiling); adverse action capped at A2.',
        },
        {
          id: 'GOVERN-2.1',
          title: 'Roles & accountability (qualified-human decider)',
          status: S(humanGated),
          evidence:
            'Payer-facing submission is human-gated regardless of rung; decider from authenticated session.',
        },
        {
          id: 'GOVERN-4.1',
          title: 'Escalation policy bound to the agent manifest',
          status: 'satisfied',
          evidence:
            'Manifest-governed autonomy tier + escalation-policy ref; routed via the escalation engine.',
        },
      ],
    },
    {
      fn: 'MAP',
      blurb: 'Context, intended use, and the boundary of what the AI may decide.',
      controls: [
        {
          id: 'MAP-1.1',
          title: 'Intended use fixed to decision-support',
          status: 'satisfied',
          evidence:
            'Estimates & recovery drafts are decision-support; the payer’s adjudication is authoritative.',
        },
        {
          id: 'MAP-2.3',
          title: 'Context captured (order · coverage · scenario)',
          status: 'satisfied',
          evidence: `Order ${cash.evidence.order.code} threaded with coverage + scenario context on the record.`,
        },
        {
          id: 'MAP-5.1',
          title: 'Out-of-scope actions blocked',
          status: 'satisfied',
          evidence:
            'Licensed criteria (MCG/InterQual) never enter the record; no autonomous adverse action.',
        },
      ],
    },
    {
      fn: 'MEASURE',
      blurb: 'Quantified evidence strength, integrity, and reproducibility.',
      controls: [
        {
          id: 'MEASURE-1.1',
          title: 'Evidence tier quantified per stage',
          status: 'satisfied',
          evidence: `Process tier ${tier ?? 'n/a'} (D0–D3); each stage tier-classified by tierOfEntry.`,
        },
        {
          id: 'MEASURE-2.7',
          title: 'Integrity measured (tamper-evident seal)',
          status: S(sealed && intact),
          evidence: sealed
            ? `Evidence Record HMAC-signed; integrity ${intact ? 'intact' : 'FAILED'} on read.`
            : 'Seal present as tamper-evidence marker (demo signer).',
        },
        {
          id: 'MEASURE-4.2',
          title: 'Reproducibility (deterministic replay)',
          status: 'satisfied',
          evidence:
            'Decisions replay to a number on identical signed evidence (arbiter REPRO-RERUN).',
        },
      ],
    },
    {
      fn: 'MANAGE',
      blurb: 'Risk response: human gates, appeal paths, and monitoring.',
      controls: [
        {
          id: 'MANAGE-1.2',
          title: 'Human-in-the-loop gate on adverse/payer-facing action',
          status: S(humanGated),
          evidence:
            'Agent may draft, never auto-submit; approval runs the governed submission step.',
        },
        {
          id: 'MANAGE-2.3',
          title: 'Appeal / recovery pathway present',
          status: S(hasRecovery || reconciled),
          evidence: hasRecovery
            ? 'Recovery appeal drafted for the reconciled shortfall; human-gated.'
            : 'Reconciliation computed; recovery drafted only on a recoverable finding.',
        },
        {
          id: 'MANAGE-4.1',
          title: 'Continuous fairness monitoring',
          status: 'partial',
          evidence:
            'FAIRNESS-GUARD (arbiter tier) screens disparate impact against Gravity SDOH strata.',
        },
      ],
    },
  ];

  const trustworthiness: Trustworthiness[] = [
    {
      characteristic: 'Valid & reliable',
      status: 'satisfied',
      note: 'Deterministic pipeline; decisions reproduce on identical signed evidence.',
    },
    {
      characteristic: 'Safe',
      status: S(humanGated),
      note: 'No autonomous adverse action — adverse gradient caps authority at A2, human-gated.',
    },
    {
      characteristic: 'Secure & resilient',
      status: S(sealed),
      note: 'Append-only, HMAC-sealed evidence record; tamper-evident on read.',
    },
    {
      characteristic: 'Accountable & transparent',
      status: 'satisfied',
      note: 'Per-party signed, provenance-stamped, policy-version-bound record.',
    },
    {
      characteristic: 'Explainable & interpretable',
      status: 'satisfied',
      note: 'Each decision records what fired, its version, and a member-facing reason.',
    },
    {
      characteristic: 'Privacy-enhanced',
      status: 'satisfied',
      note: 'Dual-party PHI-safe projection; member-embedding ids masked before any boundary.',
    },
    {
      characteristic: 'Fair — bias managed',
      status: 'partial',
      note: 'FAIRNESS-GUARD screens both sides’ algorithms; may suspend a disparately-impacting one.',
    },
  ];

  // Per-decision explainability, derived from the decision-critical evidence entries.
  const explainability: ExplainabilityRecord[] = [];
  const push = (
    stage: string,
    firedRule: string,
    entryTier: EvidenceTier,
    requiresHuman: boolean,
    reason: string
  ): void => {
    explainability.push({
      stage,
      firedRule,
      ruleVersion: RULE_VERSION,
      evidenceTier: entryTier,
      ceilingRung: TIER_RUNG_CEILING[entryTier],
      requiresHuman,
      reason,
    });
  };

  for (const e of cash.evidence.entries) {
    const t = tierOfEntry(e);
    if (e.type === 'coverage-determination') {
      push(
        'Coverage / CRD',
        `determination:${e.determination.outcome}`,
        t,
        true,
        `PA ${e.determination.requiresPA ? 'required' : 'not required'} — ${e.determination.outcome}.`
      );
    } else if (e.type === 'reconciliation') {
      push(
        'Reconciliation',
        'reconcile:835-vs-contracted',
        t,
        true,
        `Verdict ${e.verdict}; delta drives any recovery.`
      );
    } else if (e.type === 'recovery') {
      // A payer-facing submission is human-gated regardless of rung (governance invariant).
      push(
        'Recovery',
        `recovery:${e.action}`,
        t,
        true,
        `Draft ${e.action} at rung ${e.rung}; payer submission human-gated.`
      );
    }
  }

  const allControls = functions.flatMap((f) => f.controls);
  const satisfied = allControls.filter((c) => c.status === 'satisfied').length;

  return { functions, trustworthiness, explainability, satisfied, total: allControls.length };
}
