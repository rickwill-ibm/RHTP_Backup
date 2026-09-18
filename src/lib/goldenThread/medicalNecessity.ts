/**
 * Medical Necessity stage (increment GT-3).
 *
 * Orchestrates the pieces into one stage result: run the Policy Engine, apply
 * any gold-card exemption, score propensity-to-deny, thread everything into the
 * Evidence Record, and derive a remediation loop + a view model for the UI.
 *
 * Pure orchestration — callers pass ids/timestamps (no wall-clock reads) so the
 * whole stage is reproducible and testable.
 */
import {
  evaluate,
  evaluateGoldCard,
  goldCardToEvidence,
  scorePropensity,
  propensityInputFromDetermination,
  type CoverageDetermination,
  type MemberContext,
  type LoadedLibrary,
  type GoldCardContext,
  type GoldCardStatus,
  type PropensityResult,
} from '@/lib/policy';
import {
  createEvidenceRecord,
  recordDetermination,
  recordGoldCard,
  appendEntry,
  type EvidenceRecord,
} from '@/lib/evidence';

export interface StageOrder {
  code: string;
  codeSystem?: string;
  display?: string;
  providerNpi: string;
  payer: string;
}

export interface RemediationOption {
  action: 'attach-documentation' | 'add-on-label-diagnosis' | 'file-exception' | 'submit';
  label: string;
  detail: string;
  examples?: string[];
}

export type NetOutcome = 'pa-exempt-gold-card' | CoverageDetermination['outcome'];

export interface MedicalNecessityVM {
  order: StageOrder;
  memberId: string;
  netRequiresPA: boolean;
  netOutcome: NetOutcome;
  criteriaMet: boolean | null;
  indications: { label: string; title: string }[];
  deficiencies: { kind: string; detail: string }[];
  goldCard: {
    applied: boolean;
    reason: string;
    approvalRate?: number;
    program: string;
    /**
     * Wave-13.1 (MED-5): the roster / approval history behind `approvalRate` is SEEDED /
     * illustrative (the mock demo feed), not observed provider history. The panel labels
     * the per-provider rate accordingly. Absent/false → rendered as before.
     */
    seeded?: boolean;
  };
  propensity: {
    score: number;
    band: PropensityResult['band'];
    factors: PropensityResult['factors'];
  };
  remediation: RemediationOption[];
  rationale: string;
}

export interface MedicalNecessityResult {
  determination: CoverageDetermination;
  goldCard: GoldCardStatus;
  propensity: PropensityResult;
  netRequiresPA: boolean;
  netOutcome: NetOutcome;
  evidence: EvidenceRecord;
  vm: MedicalNecessityVM;
}

export interface RunContext {
  library: LoadedLibrary;
  goldCard: GoldCardContext;
  evidence?: EvidenceRecord;
  ids: { determination: string; goldCard: string; propensity: string; evidence?: string };
  ts: string;
  historicalDenialRate?: number;
  /** Wave-13.1 (HIGH-4): the historical denial rate came from a seeded/illustrative feed. */
  historicalDenialRateSeeded?: boolean;
  /** Wave-13.1 (MED-5): the gold-card roster/approval history is seeded/illustrative. */
  goldCardSeeded?: boolean;
}

function remediationFor(
  det: CoverageDetermination,
  indications: { label: string; title: string }[]
): RemediationOption[] {
  const out: RemediationOption[] = [];
  for (const d of det.deficiencies) {
    if (d.kind === 'missing-supporting-diagnosis') {
      out.push({
        action: 'add-on-label-diagnosis',
        label: 'Add an on-label diagnosis',
        detail:
          'No coded diagnosis matched the policy’s covered indications. Add a supporting diagnosis or attach clinical documentation, then re-evaluate.',
        examples: indications.slice(0, 4).map((i) => i.title),
      });
      out.push({
        action: 'attach-documentation',
        label: 'Attach clinical documentation',
        detail: 'Provide chart notes / prior imaging supporting medical necessity.',
      });
    } else if (d.kind === 'missing-documentation') {
      out.push({
        action: 'attach-documentation',
        label: 'Attach clinical documentation',
        detail: d.detail,
      });
    } else if (d.kind === 'experimental-service') {
      out.push({
        action: 'file-exception',
        label: 'File a medical-exception request',
        detail:
          'Service is experimental/not covered; a documented exception or appeal is required.',
      });
    }
  }
  if (out.length === 0) {
    out.push({
      action: 'submit',
      label: 'Submit with documentation',
      detail: 'Criteria are met — proceed to DTR/PAS with standard documentation.',
    });
  }
  return out;
}

/** Run the Medical Necessity stage end-to-end. */
export function runMedicalNecessity(
  member: MemberContext,
  order: StageOrder,
  ctx: RunContext
): MedicalNecessityResult {
  const determination = evaluate(
    member,
    { code: order.code, codeSystem: order.codeSystem, display: order.display },
    ctx.library
  );

  const goldCard = evaluateGoldCard(
    { providerNpi: order.providerNpi, code: order.code, payer: order.payer },
    ctx.goldCard
  );

  const propensity = scorePropensity(
    propensityInputFromDetermination(determination, {
      goldCardApplied: goldCard.applied,
      historicalDenialRate: ctx.historicalDenialRate,
      historicalDenialRateSeeded: ctx.historicalDenialRateSeeded,
    })
  );

  const netRequiresPA = goldCard.applied ? false : determination.requiresPA;
  const netOutcome: NetOutcome = goldCard.applied ? 'pa-exempt-gold-card' : determination.outcome;

  // thread the Evidence Record
  let evidence =
    ctx.evidence ??
    createEvidenceRecord({
      id: ctx.ids.evidence ?? `ev-${member.memberId}-${order.code}`,
      memberId: member.memberId,
      order: { code: order.code, display: order.display, providerNpi: order.providerNpi },
      createdAt: ctx.ts,
    });
  evidence = recordDetermination(evidence, {
    id: ctx.ids.determination,
    ts: ctx.ts,
    determination,
  });
  evidence = recordGoldCard(evidence, {
    id: ctx.ids.goldCard,
    ts: ctx.ts,
    exemption: goldCardToEvidence(goldCard),
  });
  evidence = appendEntry(evidence, {
    id: ctx.ids.propensity,
    ts: ctx.ts,
    stage: 'medical-necessity',
    type: 'propensity',
    score: propensity.score,
    band: propensity.band,
  });

  const indications = determination.indicationsConsidered.map((i) => ({
    label: i.label,
    title: i.title,
  }));

  const vm: MedicalNecessityVM = {
    order,
    memberId: member.memberId,
    netRequiresPA,
    netOutcome,
    criteriaMet: determination.criteriaMet,
    indications,
    deficiencies: (goldCard.applied ? [] : determination.deficiencies).map((d) => ({
      kind: d.kind,
      detail: d.detail,
    })),
    goldCard: {
      applied: goldCard.applied,
      reason: goldCard.reason,
      approvalRate: goldCard.approvalRate,
      program: goldCard.program,
      seeded: ctx.goldCardSeeded,
    },
    propensity: { score: propensity.score, band: propensity.band, factors: propensity.factors },
    remediation: goldCard.applied
      ? [{ action: 'submit', label: 'No PA required (gold-carded)', detail: goldCard.reason }]
      : remediationFor(determination, indications),
    rationale: goldCard.applied
      ? `Prior authorization exempt — ${goldCard.reason}.`
      : determination.rationale,
  };

  return { determination, goldCard, propensity, netRequiresPA, netOutcome, evidence, vm };
}
