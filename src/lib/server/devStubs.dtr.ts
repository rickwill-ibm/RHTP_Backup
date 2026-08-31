// ─── devStubs.dtr.ts ──────────────────────────────────────────────────────────
// DTR (Documentation Templates and Rules) evaluation dispatcher.
//
// The per-patient scenario DATA + the questionnaire-package definitions live in
// `devStubs.dtr.data.json` (AI-CODING-CONVENTIONS v2 §2-3: data → *.json), so this
// file stays a thin dispatcher well under the size cap regardless of formatting.
// The only LOGIC here is routing patient/CPT → scenario, and the bariatric branch,
// which evaluates the CG-SURG-83 criteria against a patient's real FHIR record.

import { profileFor } from './devStubs.profiles';
import { evaluateDtr } from '@/lib/policy/dtr/evaluate/patientEvaluation';
import { bariatricPatientBundle } from '@/lib/policy/dtr/evaluate/patientData';
import {
  BARIATRIC_DTR_CRITERIA,
  BARIATRIC_CPT_CODES,
} from '@/lib/policy/dtr/evaluate/bariatricCriteria';
import data from './devStubs.dtr.data.json';

const SCENARIOS = data.scenarios;

/** DTR policy evaluation — full per-patient scenarios (data-driven), plus the bariatric FHIR evaluation. */
export function devDtrEvaluation(patientId: string, cptCode: string): unknown {
  profileFor(patientId); // ensure valid patient

  // Bariatric codes: evaluate the CG-SURG-83 computable criteria against a fixed SAMPLE patient bundle
  // (Maria) through the shared engine — real age/BMI/comorbidity reads, not a hardcoded literal. This is
  // a fixed demo fixture (the workbench's PatientPrepopPanel evaluates the LIVE authored review).
  if (BARIATRIC_CPT_CODES.has(cptCode)) {
    return evaluateDtr(
      { ...BARIATRIC_DTR_CRITERIA, cptCode },
      bariatricPatientBundle,
      new Date('2026-08-30')
    );
  }

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
