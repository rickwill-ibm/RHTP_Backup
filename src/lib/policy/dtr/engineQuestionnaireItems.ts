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
import type {
  QuestionnaireAnswerOption,
  QuestionnaireItemDef,
  QuestionnaireItemType,
} from '@/lib/dtr/questionnaireResponse';
import {
  defaultConceptRegistry,
  type ConceptBindingRegistry,
} from '@/lib/policy/dtr/terminology/registry';
import {
  selectExpansionProvider,
  type ValueSetExpansionProvider,
} from '@/lib/policy/dtr/terminology/expansion';

function mapItemType(t: FhirItem['type']): QuestionnaireItemType | null {
  switch (t) {
    case 'open-choice':
      return 'choice';
    case 'boolean':
    case 'integer':
    case 'decimal':
    case 'choice':
    case 'string':
    case 'date':
    case 'attachment':
      return t;
    default:
      return null; // 'group' is flattened by the caller
  }
}

/** Translate the engine's typed FHIR items into the renderer's item definitions (flatten groups).
 *  Pure/sync. `registry` is injectable for tests; it only ever ADDS an `answerValueSet` URI (a string),
 *  never mutates options, so this stays a pure projection. */
export function fhirItemsToDefs(
  items: FhirItem[],
  registry: ConceptBindingRegistry = defaultConceptRegistry,
  // Recursion-only: whether to emit a `display` section header for a top-level pathway group. On the
  // top call it is derived — headers appear ONLY when a policy has 2+ determination pathways, so a
  // single-determination policy is unchanged; inner (criterion) groups are always flattened.
  emitGroupHeaders?: boolean
): QuestionnaireItemDef[] {
  const headers = emitGroupHeaders ?? items.filter((i) => i.type === 'group').length >= 2;
  const out: QuestionnaireItemDef[] = [];
  for (const it of items) {
    if (it.type === 'group') {
      if (headers && it.text) {
        out.push({ linkId: `section-${it.linkId}`, text: it.text, type: 'display' });
      }
      if (it.item) out.push(...fhirItemsToDefs(it.item, registry, false));
      continue;
    }
    const type = mapItemType(it.type);
    if (!type) continue;
    const def: QuestionnaireItemDef = { linkId: it.linkId, text: it.text, type };
    if (it.required !== undefined) def.required = it.required;
    // Carry the terminology binding through — the code system is kept, not dropped, so a coded item
    // (e.g. a LOINC-coded BMI) stays coded downstream.
    if (it.code && it.code.length > 0) {
      def.code = it.code
        .filter((c) => c.system && c.code)
        .map((c) => ({ system: c.system as string, code: c.code as string, display: c.display }));
    }
    if (it.answerOption) {
      def.answerOption = it.answerOption.map((o) => ({
        value: o.valueCoding.code ?? o.valueCoding.display,
        label: o.valueCoding.display,
        ...(o.valueCoding.system && o.valueCoding.code
          ? {
              coding: {
                system: o.valueCoding.system,
                code: o.valueCoding.code,
                display: o.valueCoding.display,
              },
            }
          : {}),
      }));
      // Bind the choice to an authoritative canonical ValueSet when the concept resolves confidently.
      // The engine's own concept id is synthetic, so we resolve off the item heading + option
      // displays; an unconfident match returns undefined and the item stays unbound (safe no-op).
      if (type === 'choice') {
        const binding = registry.resolve({
          text: it.text,
          optionDisplays: it.answerOption.map((o) => o.valueCoding.display),
          optionSystems: it.answerOption
            .map((o) => o.valueCoding.system)
            .filter((s): s is string => !!s),
        });
        if (binding) def.answerValueSet = binding.valueSetUri;
      }
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
  // Append the generic catch-all upload ONLY as a FALLBACK — when the policy produced no discrete
  // documentation attachment of its own. A policy whose documentation requirements became per-
  // requirement attachments no longer needs (or should have) a single "attach everything" upload
  // that forces manual review; a policy with no documentation criteria still gets the catch-all.
  if (!items.some((d) => d.type === 'attachment')) {
    items.push({
      linkId: 'clinical-documentation',
      text: 'Attach clinical documentation supporting medical necessity',
      type: 'attachment',
      helpText: 'Upload the chart note / imaging / lab report that evidences the criteria above.',
      required: true,
    });
  }
  return items;
}

function codingsToOptions(codings: { system: string; code: string; display?: string }[]): {
  answerOption: QuestionnaireAnswerOption[];
} {
  return {
    answerOption: codings.map((c) => ({
      value: c.code,
      label: c.display ?? c.code,
      coding: { system: c.system, code: c.code, display: c.display },
    })),
  };
}

/**
 * OPT-IN async post-pass: for every item already bound to an `answerValueSet`, `$expand` that value
 * set through the selected provider and REPLACE its options with the authoritative codings. This is
 * the ONLY async boundary — `fhirItemsToDefs` / `engineQuestionnaireItems` stay pure and sync, and
 * callers that don't need hydrated codings never touch it. Fail-safe: on a miss or an empty/failed
 * expansion the item's existing options are left intact (never regressed to bare display), so calling
 * this can only improve an item, never blank one.
 */
export async function hydrateExpansions(
  items: QuestionnaireItemDef[],
  provider: ValueSetExpansionProvider = selectExpansionProvider().provider
): Promise<QuestionnaireItemDef[]> {
  const out: QuestionnaireItemDef[] = [];
  for (const def of items) {
    if (!def.answerValueSet) {
      out.push(def);
      continue;
    }
    let expanded;
    try {
      expanded = await provider.expand(def.answerValueSet);
    } catch {
      expanded = undefined; // gated/unconfigured provider — leave the item as-is
    }
    if (expanded && expanded.codings.length > 0) {
      out.push({ ...def, ...codingsToOptions(expanded.codings) });
    } else {
      out.push(def);
    }
  }
  return out;
}
