/**
 * DTR match result → FHIR QuestionnaireResponse (finding D2/A2, DTR-model convergence).
 *
 * The scenario's DTR (`DtrMatchResult` groups) and the PAS evidence are the SAME data in two
 * renderings: this maps each requirement group to a QuestionnaireResponse item, reusing the ONE
 * QuestionnaireResponse model (`@/lib/dtr/questionnaireResponse`) the policy engine already uses —
 * not a second, parallel shape. The result is what the PAS bundle carries as supportingInfo.
 *
 * Honesty (finding M1/E1): a met criterion answers TRUE; an uploaded-but-unconfirmed criterion is
 * carried as an ATTACHMENT (pending review), NOT as a satisfied boolean; an open gap is unanswered.
 * Pure.
 */
import type {
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from '@/lib/dtr/questionnaireResponse';
import type { DtrMatchResult } from '@/lib/pa/pa-types';
import type { PatientContext } from '@/lib/pa/patientContext';

export interface DtrToQrOptions {
  /** Canonical URL of the source questionnaire (from the published coverage rule). */
  questionnaireCanonical?: string;
}

/** True when a group is genuinely resolved for submission: met, or attached with a DocumentReference. */
export function isGroupResolved(g: DtrMatchResult['groups'][number]): boolean {
  if (g.status === 'met') return true;
  // an upload marks it pending payer review — resolved for SUBMISSION only if a doc is attached
  if (g.status === 'pending' && g.uploadedDocumentReference) return true;
  return false;
}

function itemFor(g: DtrMatchResult['groups'][number]): QuestionnaireResponseItem {
  const linkId = `group-${g.id}`;
  if (g.status === 'met') {
    return {
      linkId,
      text: g.title,
      answer: [{ valueBoolean: true }],
    };
  }
  if (g.status === 'pending' && g.uploadedDocumentReference) {
    const title = g.uploadedDocumentReference.content[0]?.attachment.title ?? 'attachment';
    return {
      linkId,
      text: g.title,
      answer: [
        {
          valueAttachment: {
            title,
            contentType: g.uploadedDocumentReference.content[0]?.attachment.contentType,
          },
        },
      ],
    };
  }
  // open gap — unanswered (no fabricated satisfaction)
  return { linkId, text: g.title };
}

/**
 * Build a QuestionnaireResponse for one DTR match result. Status is `completed` only when every
 * REQUIRED group is resolved; otherwise `in-progress` — a bundle can still be assembled, but it is
 * not represented as a complete response.
 */
export function dtrToQuestionnaireResponse(
  dtr: DtrMatchResult,
  ctx: PatientContext,
  opts: DtrToQrOptions = {}
): QuestionnaireResponse {
  const requiredGroups = dtr.groups.filter((g) => g.required !== false);
  const complete = requiredGroups.every(isGroupResolved);
  return {
    resourceType: 'QuestionnaireResponse',
    status: complete ? 'completed' : 'in-progress',
    questionnaire: opts.questionnaireCanonical,
    subject: { reference: `Patient/${ctx.patientId}` },
    item: dtr.groups.map(itemFor),
  };
}
