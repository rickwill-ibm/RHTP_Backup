/**
 * Financial Clearance orchestrator (increment #1).
 *
 * Runs the whole thread server-side for one member+order: Medical Necessity
 * (engine + gold card + propensity, using injectable data sources), Eligibility,
 * Patient Estimation, and work-queue routing — threading every step into one
 * Evidence Record and persisting it. This is the production entry point the
 * BFF route calls; the mock demo uses the same path with the seed library.
 */
import type { LoadedLibrary } from '@/lib/policy';
import { type DenialRateProvider, nullDenialRateProvider } from '@/lib/policy/denialRates';
import { type GoldCardDataSource } from '@/lib/policy/goldCardSource';
import { appendEntry, summarize, type EvidenceRecord, type EvidenceSummary } from '@/lib/evidence';
import { type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { runMedicalNecessity, type MedicalNecessityResult } from './medicalNecessity';
import { runEligibility, type EligibilityVM } from './eligibility';
import {
  estimatePatientCost,
  MOCK_ALLOWED_AMOUNTS,
  type BenefitDesign,
  type PatientEstimateVM,
} from './patientEstimation';
import { routeToQueue, type WorkItem } from './workQueue';
import type { ThreadInputs } from './fromFhirBundle';

export interface OrchestratorDeps {
  library: LoadedLibrary;
  goldCardSource: GoldCardDataSource;
  denialRates?: DenialRateProvider;
  store?: EvidenceStore;
  allowedAmounts?: Record<string, number>;
  benefit?: BenefitDesign;
  priority?: 'expedited' | 'standard';
  ts: string;
  ids: {
    evidence: string;
    determination: string;
    goldCard: string;
    propensity: string;
    eligibility: string;
    estimation: string;
  };
}

export interface ThreadResult {
  memberId: string;
  eligibility: EligibilityVM;
  medicalNecessity: MedicalNecessityResult;
  estimate: PatientEstimateVM;
  workItem: WorkItem;
  summary: EvidenceSummary;
  evidence: EvidenceRecord;
  netRequiresPA: boolean;
}

const DEFAULT_BENEFIT: BenefitDesign = {
  deductibleRemaining: 300,
  coinsuranceRate: 0.2,
  outOfPocketRemaining: 5000,
};

export async function runFinancialClearance(
  inputs: ThreadInputs,
  deps: OrchestratorDeps
): Promise<ThreadResult> {
  const denialProvider = deps.denialRates ?? nullDenialRateProvider;
  const denial = denialProvider.denialRate(inputs.order.code, inputs.member.plan);

  const mn = runMedicalNecessity(inputs.member, inputs.order, {
    library: deps.library,
    goldCard: deps.goldCardSource.context(deps.ts),
    ids: {
      determination: deps.ids.determination,
      goldCard: deps.ids.goldCard,
      propensity: deps.ids.propensity,
      evidence: deps.ids.evidence,
    },
    ts: deps.ts,
    historicalDenialRate: denial,
    // Wave-13.1: mark seeded/illustrative feeds so the surface never presents a mock
    // per-code / per-provider rate as an observed statistic.
    historicalDenialRateSeeded: denialProvider.seeded === true,
    goldCardSeeded: deps.goldCardSource.seeded === true,
  });

  const eligibility = runEligibility(inputs.coverage, {
    requiresPA: mn.determination.requiresPA,
    goldCardApplied: mn.goldCard.applied,
  });

  const allowed = (deps.allowedAmounts ?? MOCK_ALLOWED_AMOUNTS)[inputs.order.code] ?? 1000;
  const estimate = estimatePatientCost({
    code: inputs.order.code,
    display: inputs.order.display,
    allowedAmount: allowed,
    benefit: deps.benefit ?? DEFAULT_BENEFIT,
  });

  // thread eligibility + estimation into the (already det+gc+propensity) record
  let evidence = appendEntry(mn.evidence, {
    id: deps.ids.eligibility,
    ts: deps.ts,
    stage: 'eligibility',
    type: 'eligibility',
    requiresPA: eligibility.requiresPA,
    coverageRef: inputs.coverage.payer,
    note: eligibility.note,
  });
  evidence = appendEntry(evidence, {
    id: deps.ids.estimation,
    ts: deps.ts,
    stage: 'patient-estimation',
    type: 'note',
    text: `GFE: member owes $${estimate.memberResponsibility}; plan pays $${estimate.planPays}; propensity-to-pay ${estimate.propensityToPay.band}.`,
  });

  const workItem = routeToQueue({
    netOutcome: mn.netOutcome,
    requiresPA: mn.netRequiresPA,
    propensity: { score: mn.propensity.score, band: mn.propensity.band },
    priority: deps.priority ?? 'expedited',
    submittedAt: deps.ts,
    evidenceId: evidence.id,
    memberId: inputs.member.memberId,
    code: inputs.order.code,
  });

  if (deps.store) await deps.store.save(evidence);

  return {
    memberId: inputs.member.memberId,
    eligibility,
    medicalNecessity: mn,
    estimate,
    workItem,
    summary: summarize(evidence),
    evidence,
    netRequiresPA: mn.netRequiresPA,
  };
}
