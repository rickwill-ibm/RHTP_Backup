/**
 * The bariatric (CG-SURG-83 class) computable DTR criteria, as a SERVER-side fixture.
 *
 * The `/api/dtr/evaluate` mock is stateless — it cannot reach the workbench client's live authored
 * review — so the server evaluates this fixture through the same `evaluateDtr` engine and the same
 * patient bundle. It mirrors the computable criteria `dtrCriteriaFromReview` lifts from the authored
 * CG-SURG-83 policy (age ≥ 18; BMI ≥ 40, or 35–40 with an obesity-related comorbidity; plus the
 * documentation-gated pre-op requirements) — a fixed representation, since the stateless endpoint
 * can't reach the live review — so the endpoint stops returning an unrelated lumbar-MRI scenario and
 * instead reads the patient's real BMI/diagnosis data against the bariatric criteria. The workbench's
 * PatientPrepopPanel is the path that evaluates the actual live authored review.
 */
import type { DtrCriteria } from './patientEvaluation';
import { OBESITY_COMORBIDITY_ICD10, OBESITY_COMORBIDITY_LABEL } from './dtrCriteriaFromPolicy';

export const BARIATRIC_DTR_CRITERIA: DtrCriteria = {
  policyTitle: 'Bariatric Surgery and Other Treatments for Clinically Severe Obesity (CG-SURG-83)',
  cptCode: '43644',
  minAge: 18,
  bmi: { threshold: 40, band: { lower: 35, upper: 40 } },
  comorbidity: { codes: OBESITY_COMORBIDITY_ICD10, label: OBESITY_COMORBIDITY_LABEL },
  documentation: [
    {
      title: 'Pre-operative medical and mental health evaluations and clearances',
      description:
        'Documentation of pre-operative medical and mental health evaluations and clearances.',
    },
    {
      title: 'Structured weight-loss / conservative therapy participation',
      description:
        'Documentation of past participation in a weight-loss program and inadequate weight loss despite a committed attempt at conservative medical therapy.',
    },
    {
      title: 'Treatment plan addressing pre- and post-operative needs',
      description:
        'A treatment plan which addresses the pre- and post-operative needs of an individual undergoing bariatric surgery.',
    },
  ],
};

/** CPT codes that map to the bariatric policy (the CG-SURG-83 code table) — used to route the evaluate
 *  endpoint to the bariatric evaluation instead of the legacy lumbar-MRI default. */
export const BARIATRIC_CPT_CODES: ReadonlySet<string> = new Set([
  '43644',
  '43645',
  '43770',
  '43771',
  '43772',
  '43773',
  '43774',
  '43775',
  '43842',
  '43843',
  '43845',
  '43846',
  '43847',
  '43848',
]);
