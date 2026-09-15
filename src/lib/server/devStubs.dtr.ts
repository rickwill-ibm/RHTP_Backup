// ─── devStubs.dtr.ts ──────────────────────────────────────────────────────────
// DTR (Documentation Templates and Rules) evaluation dispatcher.
//
// The per-patient scenario DATA + the questionnaire-package definitions live in
// `devStubs.dtr.data.json` (AI-CODING-CONVENTIONS v2 §2-3: data → *.json), so this
// file stays a thin dispatcher well under the size cap regardless of formatting.
// The only LOGIC here is routing patient/CPT → scenario. Any policy registered in
// `policyRegistry.data.json` is evaluated LIVE and generically (no per-policy branch);
// unregistered codes fall through to the canned scenarios below.

import { profileFor } from './devStubs.profiles';
import { evaluateLivePolicy } from '@/lib/policy/dtr/evaluate/policyRegistry';
import data from './devStubs.dtr.data.json';

const SCENARIOS = data.scenarios;

/** DTR policy evaluation — generic live registry (data-driven), then canned per-patient scenarios. */
export async function devDtrEvaluation(patientId: string, cptCode: string): Promise<unknown> {
  profileFor(patientId); // ensure valid patient

  // Any registered live policy (bariatric CG-SURG-83 today; add more via policyRegistry.data.json):
  // parse the real authored PDF through the shared `dtrCriteriaFromReview` encoder and evaluate it
  // against the row's sample patient through the shared engine — real reads, not a hand-typed literal,
  // and NO per-policy branch here. Unregistered codes return undefined and fall through.
  const live = await evaluateLivePolicy(cptCode);
  if (live !== undefined) return live;

  const scenario =
    patientId === 'PAT-0042' || cptCode === '75561'
      ? SCENARIOS.cardiacMri
      : patientId === 'PAT-0087' || cptCode === '93306'
        ? SCENARIOS.echo
        : patientId === 'PAT-0103' || cptCode === '99243'
          ? SCENARIOS.nephrology
          : patientId === 'PAT-0156' || cptCode === '99244'
            ? SCENARIOS.pulmonology
            : SCENARIOS.mariaMock; // default: Maria's lumbar MRI
  return { ...scenario, cptCode };
}

/**
 * Patient/CPT-aware DTR $questionnaire-package Bundle.
 * Falls back to the lumbar MRI questionnaire if the CPT is not mapped.
 */
export function devQuestionnairePackage(cptCode?: string): unknown {
  const questionnaires = data.questionnaires as Record<
    string,
    { id: string; url: string; title: string; item: unknown[] }
  >;
  const q = questionnaires[cptCode ?? '72148'] ?? questionnaires['72148'];
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'Questionnaire',
          id: q.id,
          url: q.url,
          status: 'active',
          title: q.title,
          item: q.item,
        },
      },
    ],
  };
}
