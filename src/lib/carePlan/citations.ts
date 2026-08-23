/**
 * Care Plan citations — attach reference-level guideline citations to every
 * clinical recommendation in a generated plan (Cycle 2, DP-4 invariant P3
 * made minimally real; see g5-careplan.md section 3.2).
 *
 * HONESTY BOUNDARY: the registry (data/guidelineSources.json) is a
 * medical-lens drafted, reference-level pointer set — NOT SME-reviewed
 * extracted criteria. Every citation carries reviewLevel:'reference-level'
 * and smeReviewed:false; the plan-level disclaimer states it. GB-3 SME
 * sign-off is the gate that would ever upgrade this.
 */
import guidelineSources from './data/guidelineSources.json';
import type {
  CarePlanGoal,
  CarePlanIntervention,
  GeneratedCarePlan,
  GuidelineCitation,
  PlanCitationIndex,
} from './types';

interface RegistrySource {
  system: string;
  title: string;
  url?: string;
}

const SOURCES: Record<string, RegistrySource> = guidelineSources.sources;
const CATEGORY_TO_SOURCES: Record<string, string[]> = guidelineSources.categoryToSources;

export const CITATION_DISCLAIMER =
  'Reference-level guideline pointers, medical-lens drafted; NOT SME-reviewed (sign-off pending, GB-3). ' +
  'Decision-support context only — not extracted clinical criteria and not a substitute for clinical judgment.';

function citationsForCategory(category: string): GuidelineCitation[] {
  const ids = CATEGORY_TO_SOURCES[category] ?? CATEGORY_TO_SOURCES['general'] ?? [];
  const cites: GuidelineCitation[] = [];
  for (const sourceId of ids) {
    const source = SOURCES[sourceId];
    if (!source) continue;
    cites.push({
      sourceId,
      system: source.system,
      title: source.title,
      url: source.url,
      reviewLevel: 'reference-level',
      smeReviewed: false,
    });
  }
  return cites;
}

/** Deterministic post-hoc classifier mirroring the goal builder's branches. */
export function categorizeGoalForCitation(goal: CarePlanGoal): string {
  const d = (goal.description || '').toLowerCase();
  if (d.includes('social determinants')) return 'sdoh';
  if (d.startsWith('document and code')) return 'hcc-documentation';
  if (d.startsWith('mitigate')) return 'utilization-risk';
  if (d.includes('quality gap')) {
    if (d.includes('a1c') || d.includes('hba1c') || d.includes('lab')) return 'lab-glycemic';
    if (d.includes('depression') || d.includes('phq') || d.includes('edinburgh'))
      return 'behavioral-screening';
    if (d.includes('well-child') || d.includes('physical exam') || d.includes('immunization'))
      return 'well-child';
    return 'quality-gap-general';
  }
  return 'general';
}

/** Deterministic post-hoc classifier mirroring the intervention templates. */
export function categorizeInterventionForCitation(intervention: CarePlanIntervention): string {
  const d = (intervention.description || '').toLowerCase();
  if (intervention.type === 'Medication' || d.includes('medication review'))
    return 'medication-review';
  if (d.includes('community resource')) return 'sdoh';
  if (d.includes('lab test') || d.includes('a1c') || d.includes('lab results'))
    return 'lab-glycemic';
  if (d.includes('screening')) return 'behavioral-screening';
  if (intervention.type === 'Education') return 'education';
  if (intervention.type === 'Monitoring') return 'monitoring';
  if (intervention.type === 'Referral') return 'referral';
  if (d.includes('care plan review') || d.includes('follow-up')) return 'follow-up';
  return 'general';
}

/**
 * Build the citation index covering EVERY goal and EVERY intervention
 * (plan-level and goal-nested). Fallback category guarantees non-empty
 * coverage — that guarantee is what invariant P3 asserts.
 */
export function buildCitationIndex(
  goals: CarePlanGoal[],
  interventions: CarePlanIntervention[]
): PlanCitationIndex {
  const goalCitations: Record<string, GuidelineCitation[]> = {};
  const interventionCitations: Record<string, GuidelineCitation[]> = {};

  const addIntervention = (i: CarePlanIntervention): void => {
    if (!interventionCitations[i.id]) {
      interventionCitations[i.id] = citationsForCategory(categorizeInterventionForCitation(i));
    }
  };

  for (const goal of goals) {
    goalCitations[goal.id] = citationsForCategory(categorizeGoalForCitation(goal));
    (goal.interventions ?? []).forEach(addIntervention);
  }
  interventions.forEach(addIntervention);

  return {
    goals: goalCitations,
    interventions: interventionCitations,
    disclaimer: CITATION_DISCLAIMER,
  };
}

/** Attach a citation index to an already-assembled plan (additive, never mutates content). */
export function withCitations<T extends GeneratedCarePlan>(plan: T): T {
  return { ...plan, citations: buildCitationIndex(plan.goals, plan.interventions) };
}
