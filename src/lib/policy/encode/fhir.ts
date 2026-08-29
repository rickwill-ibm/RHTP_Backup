/**
 * Generator — PolicyLogic → FHIR R4 DTR Questionnaire (RHTP Policy Engine).
 *
 * Emits TYPED items (integer/decimal for measures, choice/open-choice for value sets, boolean for
 * attestations, attachment for documentation) — not the flat yes/no checkboxes the old generator
 * produced. Options carrying nested criteria compile to `answerOption` + `enableWhen(answerCoding)`
 * sibling items (spec F3). Population-gated pathways emit an `enableWhen` on a population item.
 *
 * This is a minimal, self-contained SDC-shaped projection (no external FHIR lib): enough to be
 * consumed by the DTR renderer and to be conformance-checked field-by-field per spec §5.
 *
 * Design authority: docs/policy-encoder-spec.md §5.
 */
import type { CodedValueSet, EncodedCriterion, Measure, PolicyLogic } from './ir';
import { repairGlyphs } from './text';

/** Display text for a questionnaire label: OCR-repaired (Ill.→III, necessaryfor→necessary for),
 *  trimmed. The verbatim source stays on the criterion for provenance; only the label is de-noised. */
function clean(s: string): string {
  return repairGlyphs(s).repaired.replace(/\s+/g, ' ').trim();
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display: string;
}
export interface FhirEnableWhen {
  question: string;
  operator: '=' | 'exists';
  answerBoolean?: boolean;
  answerCoding?: FhirCoding;
}
export interface FhirItem {
  linkId: string;
  text: string;
  type:
    | 'group'
    | 'boolean'
    | 'integer'
    | 'decimal'
    | 'choice'
    | 'open-choice'
    | 'string'
    | 'attachment';
  required?: boolean;
  repeats?: boolean;
  enableWhen?: FhirEnableWhen[];
  enableBehavior?: 'all' | 'any';
  answerOption?: { valueCoding: FhirCoding }[];
  item?: FhirItem[];
}
export interface FhirQuestionnaire {
  resourceType: 'Questionnaire';
  url: string;
  status: 'active' | 'draft';
  title: string;
  item: FhirItem[];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function questionnaireUrl(policy: PolicyLogic): string {
  return `urn:rhtp:dtr/Questionnaire/${slug(policy.service)}`;
}

/** A measure is decimal-typed for BMI / kg-m² / % / ratio fields, or any non-integer-valued threshold;
 *  counts and age are integer. Generalizes the old bmi-only check across the dimension registry. */
function isDecimalMeasure(m: Measure): boolean {
  if (m.field === 'bmi') return true;
  if (m.unit === 'kg/m²' || m.unit === '%' || m.unit === 'mmol/L') return true;
  if (m.value !== undefined && !Number.isInteger(m.value)) return true;
  if (m.value2 !== undefined && !Number.isInteger(m.value2)) return true;
  return false;
}

function measureItem(crit: EncodedCriterion): FhirItem {
  const decimal = crit.measure ? isDecimalMeasure(crit.measure) : false;
  return {
    linkId: crit.id,
    text: clean(crit.sourceText),
    type: decimal ? 'decimal' : 'integer',
    required: true,
  };
}

/** One typed item per measure in a multi-threshold criterion, each with a UNIQUE linkId. The suffix is
 *  INDEX-based (`${crit.id}::0`, `::1`) so uniqueness holds even if two measures ever share a field. */
function measureItemsMulti(crit: EncodedCriterion, measures: Measure[]): FhirItem[] {
  return measures.map((m, i) => ({
    linkId: `${crit.id}::${i}`,
    text: clean(crit.sourceText),
    type: isDecimalMeasure(m) ? ('decimal' as const) : ('integer' as const),
    required: true,
  }));
}

function choiceItem(crit: EncodedCriterion, vs: CodedValueSet): FhirItem[] {
  // Display-only options get a deterministic local code so answerOption ↔ enableWhen(answerCoding)
  // matching works (an undefined code makes the gated follow-up unreachable). (red-team finding #4)
  const optSystem = (o: CodedValueSet['options'][number]): string => o.system ?? 'urn:rhtp:vs';
  const optCode = (o: CodedValueSet['options'][number]): string =>
    o.code ?? `opt-${slug(o.display)}`;
  const item: FhirItem = {
    linkId: crit.id,
    text: clean(crit.sourceText),
    type: vs.open ? 'open-choice' : 'choice',
    repeats: true,
    required: true,
    answerOption: vs.options.map((o) => ({
      valueCoding: { system: optSystem(o), code: optCode(o), display: o.display },
    })),
  };
  // Options with follow-ups ⇒ sibling items gated by enableWhen(answerCoding).
  const siblings: FhirItem[] = [];
  for (const o of vs.options) {
    if (!o.followUp) continue;
    for (const f of o.followUp) {
      const sib: FhirItem = {
        linkId: f.id,
        text: clean(f.sourceText),
        type: f.measure ? (isDecimalMeasure(f.measure) ? 'decimal' : 'integer') : 'boolean',
        enableWhen: [
          {
            question: crit.id,
            operator: '=',
            answerCoding: { system: optSystem(o), code: optCode(o), display: o.display },
          },
        ],
      };
      siblings.push(sib);
    }
  }
  return [item, ...siblings];
}

function critItems(crit: EncodedCriterion, vsById: Map<string, CodedValueSet>): FhirItem[] {
  if (crit.kind === 'measure' && crit.measure) {
    return crit.measures && crit.measures.length > 1
      ? measureItemsMulti(crit, crit.measures)
      : [measureItem(crit)];
  }
  if (crit.kind === 'choice' && crit.choice) {
    const vs = vsById.get(crit.choice.valueSetId);
    if (vs) return choiceItem(crit, vs);
  }
  // attestation / documentation / freetext
  const item: FhirItem = {
    linkId: crit.id,
    text: clean(crit.sourceText),
    type: 'boolean',
  };
  if (crit.children) {
    item.type = 'group';
    item.item = crit.children.flatMap((c) => critItems(c, vsById));
  }
  return [item];
}

/** Project a PolicyLogic into a DTR Questionnaire. */
export function toQuestionnaire(policy: PolicyLogic): FhirQuestionnaire {
  const items: FhirItem[] = [];
  // linkId MUST be unique across the WHOLE Questionnaire (FHIR R4). Dedupe across pathways so a
  // criterion shared by two pathways is emitted once. (red-team finding #2)
  const seen = new Set<string>();
  for (const p of policy.pathways) {
    if (p.role === 'manual-review') continue;
    const vsById = new Map(p.valueSets.map((vs) => [vs.id, vs]));
    const groupItems: FhirItem[] = [];
    const group: FhirItem = {
      linkId: p.id,
      text: p.population ? `Pathway (${p.population.concept})` : 'Eligibility',
      type: 'group',
      item: groupItems,
    };
    // Population gate: a leading boolean the group is enabled by.
    if (p.population) {
      const popId = `${p.id}.population.${p.population.concept}`;
      items.push({
        linkId: popId,
        text: p.population.sourceText || `Population: ${p.population.concept}`,
        type: 'boolean',
      });
      group.enableWhen = [{ question: popId, operator: '=', answerBoolean: true }];
    }
    // Attach top-level criteria for this pathway via its BoolExpr leaves (deduped across pathways).
    for (const id of collectLeafIds(p.logic)) {
      const crit = policy.criteria[id];
      if (!crit || seen.has(id)) continue;
      seen.add(id);
      groupItems.push(...critItems(crit, vsById));
    }
    items.push(group);
  }
  // Documentation items.
  for (const d of policy.documentation) {
    items.push({
      linkId: `doc.${slug(d.doc)}`,
      text: d.doc,
      type: 'attachment',
      required: d.requirement === 'required',
    });
  }
  return {
    resourceType: 'Questionnaire',
    url: questionnaireUrl(policy),
    status: 'active',
    title: policy.service,
    item: items,
  };
}

function collectLeafIds(expr: PolicyLogic['pathways'][number]['logic']): string[] {
  if (!expr) return [];
  if (expr.op === 'leaf') return [expr.criterionId];
  if (expr.op === 'not') return collectLeafIds(expr.node);
  return expr.nodes.flatMap(collectLeafIds);
}
