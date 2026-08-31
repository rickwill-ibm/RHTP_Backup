/**
 * A SPECIMEN QuestionnaireResponse for the authoring PAS preview — there is no live patient at authoring
 * time. It reuses the real `buildQuestionnaireResponse` with EMPTY answers, so every answer stays unset
 * (`status:'in-progress'`) and `missingRequired` lists exactly what a real submission would need. Nothing
 * clinical is fabricated; the subject is a synthetic specimen patient, never a member id.
 */
import {
  buildQuestionnaireResponse,
  type QuestionnaireItemDef,
  type QuestionnaireResponse,
} from '@/lib/dtr/questionnaireResponse';

export const SPECIMEN_PATIENT_ID = 'specimen';
export const SPECIMEN_IDENTIFIER_SYSTEM = 'urn:rhtp:pas:specimen';

export function buildSpecimenResponse(
  items: QuestionnaireItemDef[],
  questionnaireCanonical?: string
): { response: QuestionnaireResponse; missingRequired: string[] } {
  const { response, missingRequired } = buildQuestionnaireResponse({
    questionnaireCanonical,
    patientRef: `Patient/${SPECIMEN_PATIENT_ID}`,
    items,
    answers: {}, // nothing fabricated — all answers unset
    complete: false,
  });
  return { response, missingRequired };
}
