/**
 * Authoring "Generate DTR" adapter (policy layer).
 *
 * The ONE seam that turns reviewed criteria into the DTR questionnaire items the workbench renders,
 * sourced from the policy engine — replacing the legacy flat generator (`generateQuestionnaireFromPolicy`,
 * which emits "Does the member meet indication X?" booleans with OCR noise and duplicated headers).
 *
 * This is REUSE, not a new generator: all questionnaire logic lives in the engine's `toQuestionnaire`.
 * The only work here is (a) assembling a `CriteriaPolicy` from the reviewed criteria and (b) translating
 * the engine's `FhirItem` into the renderer's `QuestionnaireItemDef`. Pure.
 *
 * Layer note: engine (`@/lib/policy/encode`) stays free of UI types; this policy-layer module owns the
 * FhirItem → QuestionnaireItemDef translation, so the engine and the pa runtime bridge stay decoupled.
 */
import { encodePolicy, toQuestionnaire, type FhirItem } from '@/lib/policy/encode';
import type { CriteriaGroup, GuidelineCode } from '@/lib/policy/extract/criteria';
import { buildCriteriaPolicy } from '@/lib/policy/authoring/criteriaPolicy';
import type { QuestionnaireItemDef, QuestionnaireItemType } from '@/lib/dtr/questionnaireResponse';

function mapItemType(t: FhirItem['type']): QuestionnaireItemType | null {
  switch (t) {
    case 'open-choice':
      return 'choice';
    case 'boolean':
    case 'integer':
    case 'decimal':
    case 'choice':
    case 'string':
    case 'attachment':
      return t;
    default:
      return null; // 'group' is flattened by the caller
  }
}

/** Translate the engine's typed FHIR items into the renderer's item definitions (flatten groups). */
export function fhirItemsToDefs(items: FhirItem[]): QuestionnaireItemDef[] {
  const out: QuestionnaireItemDef[] = [];
  for (const it of items) {
    if (it.type === 'group') {
      if (it.item) out.push(...fhirItemsToDefs(it.item));
      continue;
    }
    const type = mapItemType(it.type);
    if (!type) continue;
    const def: QuestionnaireItemDef = { linkId: it.linkId, text: it.text, type };
    if (it.required !== undefined) def.required = it.required;
    if (it.answerOption) {
      def.answerOption = it.answerOption.map((o) => ({
        value: o.valueCoding.code ?? o.valueCoding.display,
        label: o.valueCoding.display,
      }));
    }
    // The renderer's enableWhen supports boolean gates (e.g. a population question). Coding-gated
    // follow-ups (choice answers) can't be expressed in that model, so they render ungated, not lost.
    if (it.enableWhen) {
      const gates = it.enableWhen
        .filter((w) => w.answerBoolean !== undefined)
        .map((w) => ({ question: w.question, answerBoolean: w.answerBoolean === true }));
      if (gates.length) def.enableWhen = gates;
    }
    out.push(def);
  }
  return out;
}

/**
 * Build the DTR questionnaire items for the authoring Generate stage from the engine. Typed (BMI
 * decimal, age integer, choice sets), OCR-repaired, population-gated once at the pathway level, with
 * no "Does the member meet indication …?" wrapper. Returns `null` when there are no criteria to
 * encode, so the caller keeps its legacy items (e.g. a code-table policy with no indications).
 */
export function engineQuestionnaireItems(
  criteriaSections: CriteriaGroup[] | undefined,
  opts: { service?: string; guidelineId?: string; codes?: GuidelineCode[] } = {}
): QuestionnaireItemDef[] | null {
  if (!criteriaSections || criteriaSections.length === 0) return null;
  const logic = encodePolicy(buildCriteriaPolicy(criteriaSections, opts), {
    service: opts.service,
  });
  const items = fhirItemsToDefs(toQuestionnaire(logic).item);
  // Preserve the authoring convention of a final documentation upload (as the legacy generator did).
  items.push({
    linkId: 'clinical-documentation',
    text: 'Attach clinical documentation supporting medical necessity',
    type: 'attachment',
    helpText: 'Upload the chart note / imaging / lab report that evidences the criteria above.',
    required: true,
  });
  return items;
}
