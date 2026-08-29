/**
 * DTR QuestionnaireResponse builder (plan Slice 4 / blueprint §6.4).
 * Turns user/prepopulated answers into a FHIR R4 QuestionnaireResponse. Pure.
 *
 * Item model supports the answer modalities a real DTR form needs: boolean (criterion
 * met?), string (with an optional `format` constraint — e.g. an ICD-10 code, validated
 * so free-text can't be "any crap"), integer/decimal (measured values), choice (a fixed
 * option set), date, and attachment (a real document upload). `enableWhen` gates an item
 * on another item's boolean answer, so downstream questions appear only when relevant.
 */

export type QuestionnaireItemType =
  'string' | 'boolean' | 'integer' | 'decimal' | 'choice' | 'date' | 'attachment';

/** A value constraint the renderer enforces so a typed field can't accept arbitrary text. */
export type QuestionnaireItemFormat = 'icd10';

export interface QuestionnaireAnswerOption {
  value: string;
  label?: string;
}

/** Gate: this item is active only when answers[question] === answerBoolean (all conditions, AND). */
export interface QuestionnaireEnableWhen {
  question: string;
  answerBoolean: boolean;
}

export interface QuestionnaireItemDef {
  linkId: string;
  text: string;
  type: QuestionnaireItemType;
  required?: boolean;
  /** Format constraint for `string` items (e.g. an ICD-10 code) — enforced on input. */
  format?: QuestionnaireItemFormat;
  /** Fixed option set for `choice` items. */
  answerOption?: QuestionnaireAnswerOption[];
  /** Show/require this item only when these conditions (AND) hold. */
  enableWhen?: QuestionnaireEnableWhen[];
  /** Optional helper text rendered under the label. */
  helpText?: string;
}

export type AnswerValue = string | boolean | number;

/** ICD-10-CM code shape: a letter, a digit, an alphanumeric, then an optional subcategory of
 *  up to 4 alphanumerics — with or without the conventional dot (E66.01 and E6601 both valid). */
export const ICD10_RE = /^[A-TV-Z][0-9][0-9A-Z](?:\.?[0-9A-Z]{1,4})?$/i;

export interface QuestionnaireResponseItem {
  linkId: string;
  text: string;
  answer?: {
    valueString?: string;
    valueBoolean?: boolean;
    valueInteger?: number;
    valueDecimal?: number;
    valueDate?: string;
    valueAttachment?: { title?: string; contentType?: string; url?: string };
  }[];
}

export interface QuestionnaireResponse {
  resourceType: 'QuestionnaireResponse';
  status: 'in-progress' | 'completed';
  questionnaire?: string;
  subject?: { reference: string };
  item: QuestionnaireResponseItem[];
}

function toAnswer(
  type: QuestionnaireItemDef['type'],
  value: AnswerValue
): QuestionnaireResponseItem['answer'] {
  switch (type) {
    case 'boolean':
      return [{ valueBoolean: Boolean(value) }];
    case 'integer':
      return [{ valueInteger: Number(value) }];
    case 'decimal':
      return [{ valueDecimal: Number(value) }];
    case 'date':
      return [{ valueDate: String(value) }];
    case 'attachment':
      return [{ valueAttachment: { title: String(value) } }];
    default:
      return [{ valueString: String(value) }];
  }
}

/** True when an item's enableWhen gate (if any) is satisfied by the current answers. */
export function isItemActive(
  def: QuestionnaireItemDef,
  answers: Record<string, AnswerValue | undefined>
): boolean {
  if (!def.enableWhen || def.enableWhen.length === 0) return true;
  return def.enableWhen.every((w) => Boolean(answers[w.question]) === w.answerBoolean);
}

/** Format validation for a typed field. Empty is "not invalid" (required-ness is a separate check). */
export function isItemAnswerValid(
  def: QuestionnaireItemDef,
  value: AnswerValue | undefined
): boolean {
  if (value === undefined || value === '') return true;
  if (def.type === 'string' && def.format === 'icd10') return ICD10_RE.test(String(value).trim());
  if (def.type === 'choice' && def.answerOption && def.answerOption.length > 0) {
    return def.answerOption.some((o) => o.value === String(value));
  }
  return true;
}

export function buildQuestionnaireResponse(params: {
  questionnaireCanonical?: string;
  patientRef?: string;
  items: QuestionnaireItemDef[];
  answers: Record<string, AnswerValue | undefined>;
  complete: boolean;
}): { response: QuestionnaireResponse; missingRequired: string[]; invalid: string[] } {
  const missingRequired: string[] = [];
  const invalid: string[] = [];
  const item: QuestionnaireResponseItem[] = params.items.map((def) => {
    const active = isItemActive(def, params.answers);
    const val = active ? params.answers[def.linkId] : undefined;
    if (active && def.required && (val === undefined || val === ''))
      missingRequired.push(def.linkId);
    if (active && !isItemAnswerValid(def, val)) invalid.push(def.linkId);
    return {
      linkId: def.linkId,
      text: def.text,
      answer: val === undefined || val === '' ? undefined : toAnswer(def.type, val),
    };
  });

  return {
    response: {
      resourceType: 'QuestionnaireResponse',
      status:
        params.complete && missingRequired.length === 0 && invalid.length === 0
          ? 'completed'
          : 'in-progress',
      questionnaire: params.questionnaireCanonical,
      subject: params.patientRef ? { reference: params.patientRef } : undefined,
      item,
    },
    missingRequired,
    invalid,
  };
}
