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
import { isNegationHeading } from './procedure';

// A DTR Questionnaire asks the POSITIVE medical-necessity criteria a provider attests to. A coverage
// EXCLUSION ("… is investigational", "… does not meet criteria for coverage", "not covered") is a
// payer coverage rule, NOT an attestation item — rendering it asks the provider to "check" an
// exclusion, which is meaningless and asserts the opposite of coverage.
// INVARIANT: an exclusion criterion is never emitted as a Questionnaire item. It stays in the
// criteria registry (evaluation + CRD still see it); only the DTR questionnaire omits it.
function isExclusionCriterion(crit: EncodedCriterion): boolean {
  if (crit.negate === true) return true;
  const ms = crit.measures ?? (crit.measure ? [crit.measure] : []);
  if (ms.some((m) => m.negatedLocally === true)) return true;
  const t = crit.sourceText.toLowerCase();
  return (
    isNegationHeading(crit.sourceText) ||
    /\bdoes not meet\b|\bdo not meet\b|\bnot eligible\b|\b(is|are) excluded\b|\bconsidered cosmetic\b/.test(
      t
    )
  );
}

/** Display text for a questionnaire label: OCR-repaired (Ill.→III, necessaryfor→necessary for),
 *  trimmed. The verbatim source stays on the criterion for provenance; only the label is de-noised. */
function clean(s: string): string {
  return (
    repairGlyphs(s)
      .repaired.replace(/\s+/g, ' ')
      .trim()
      // Drop a dangling list conjunction/punctuation left on an item or option label when a
      // "…; or" / "…; and" enumeration is split into typed items ("Sleeve gastrectomy; or" →
      // "Sleeve gastrectomy"). Trailing only — a mid-sentence "or"/"and" is untouched. Display
      // only; the verbatim sourceText is kept for provenance.
      .replace(/\s*[;,]?\s*\b(?:or|and)\s*$/i, '')
      .replace(/\s*[;:]\s*$/, '')
      .trim()
  );
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
    | 'date'
    | 'attachment';
  required?: boolean;
  repeats?: boolean;
  enableWhen?: FhirEnableWhen[];
  enableBehavior?: 'all' | 'any';
  answerOption?: { valueCoding: FhirCoding }[];
  /** Terminology binding for the concept being measured (e.g. LOINC for BMI). */
  code?: FhirCoding[];
  item?: FhirItem[];
}

/** Standard LOINC codes for the engine's typed measure fields, so a measured item is a coded
 *  Observation concept (Da Vinci DTR expects coded, pre-populatable items — not bare text). Codes a
 *  field only when there is a well-established LOINC concept; unmapped fields stay uncoded (honest). */
const MEASURE_LOINC: Record<string, FhirCoding> = {
  age: { system: 'http://loinc.org', code: '30525-0', display: 'Age' },
  bmi: { system: 'http://loinc.org', code: '39156-5', display: 'Body mass index (BMI)' },
  systolicBP: { system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' },
  diastolicBP: { system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' },
  weight: { system: 'http://loinc.org', code: '29463-7', display: 'Body weight' },
  height: { system: 'http://loinc.org', code: '8302-2', display: 'Body height' },
  hba1c: { system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' },
  glucose: { system: 'http://loinc.org', code: '2339-0', display: 'Glucose' },
  egfr: { system: 'http://loinc.org', code: '33914-3', display: 'eGFR' },
  ldl: { system: 'http://loinc.org', code: '18262-6', display: 'LDL cholesterol' },
  hdl: { system: 'http://loinc.org', code: '2085-9', display: 'HDL cholesterol' },
  totalCholesterol: { system: 'http://loinc.org', code: '2093-3', display: 'Total cholesterol' },
  triglycerides: { system: 'http://loinc.org', code: '2571-8', display: 'Triglycerides' },
  lvef: {
    system: 'http://loinc.org',
    code: '10230-1',
    display: 'Left ventricular ejection fraction',
  },
};

/** LOINC codings for a measure's field, if a standard concept exists. */
function measureCoding(m: Measure | undefined): FhirCoding[] | undefined {
  const c = m?.field ? MEASURE_LOINC[m.field] : undefined;
  return c ? [c] : undefined;
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
  const code = measureCoding(crit.measure);
  return {
    linkId: crit.id,
    text: clean(crit.sourceText),
    type: decimal ? 'decimal' : 'integer',
    required: true,
    ...(code ? { code } : {}),
  };
}

/** One typed item per measure in a multi-threshold criterion, each with a UNIQUE linkId. The suffix is
 *  INDEX-based (`${crit.id}::0`, `::1`) so uniqueness holds even if two measures ever share a field. */
function measureItemsMulti(crit: EncodedCriterion, measures: Measure[]): FhirItem[] {
  return measures.map((m, i) => {
    const code = measureCoding(m);
    return {
      linkId: `${crit.id}::${i}`,
      text: clean(crit.sourceText),
      type: isDecimalMeasure(m) ? ('decimal' as const) : ('integer' as const),
      required: true,
      ...(code ? { code } : {}),
    };
  });
}

function choiceItem(crit: EncodedCriterion, vs: CodedValueSet): FhirItem[] {
  // Display-only options get a deterministic local code so answerOption ↔ enableWhen(answerCoding)
  // matching works (an undefined code makes the gated follow-up unreachable). (red-team finding #4)
  const optSystem = (o: CodedValueSet['options'][number]): string => o.system ?? 'urn:rhtp:vs';
  const optDisplay = (o: CodedValueSet['options'][number]): string => clean(o.display);
  const optCode = (o: CodedValueSet['options'][number]): string =>
    o.code ?? `opt-${slug(optDisplay(o))}`;
  const item: FhirItem = {
    linkId: crit.id,
    text: clean(crit.sourceText),
    type: vs.open ? 'open-choice' : 'choice',
    repeats: true,
    required: true,
    answerOption: vs.options.map((o) => ({
      valueCoding: { system: optSystem(o), code: optCode(o), display: optDisplay(o) },
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
            answerCoding: { system: optSystem(o), code: optCode(o), display: optDisplay(o) },
          },
        ],
      };
      siblings.push(sib);
    }
  }
  return [item, ...siblings];
}

/** A documentation requirement → a DISCRETE item set: an attestation boolean (which still gates the
 *  determination), its OWN targeted attachment gated on the attestation, and an optional typed datum
 *  (completion date / evaluating provider / named complication). Replaces the single shared catch-all. */
function docItems(crit: EncodedCriterion): FhirItem[] {
  const spec = crit.docSpec;
  if (!spec) return [{ linkId: crit.id, text: clean(crit.sourceText), type: 'boolean' }];
  const gate: FhirEnableWhen = { question: crit.id, operator: '=', answerBoolean: true };
  const items: FhirItem[] = [
    { linkId: crit.id, text: clean(spec.attestationText), type: 'boolean', required: true },
    {
      linkId: `${crit.id}.evidence`,
      text: clean(spec.attachmentText),
      type: 'attachment',
      required: true,
      enableWhen: [gate],
    },
  ];
  const d = spec.datum;
  if (d) {
    const datum: FhirItem = {
      linkId: `${crit.id}.datum`,
      text: d.label,
      type: d.kind === 'date' ? 'date' : d.kind === 'provider' ? 'string' : 'open-choice',
      enableWhen: [gate],
    };
    if (d.kind === 'complication-type' && d.options) {
      datum.answerOption = d.options.map((o) => ({
        valueCoding: {
          system: 'urn:rhtp:vs',
          code: `opt-${slug(clean(o.display))}`,
          display: clean(o.display),
        },
      }));
    }
    items.push(datum);
  }
  return items;
}

function critItems(crit: EncodedCriterion, vsById: Map<string, CodedValueSet>): FhirItem[] {
  if (crit.kind === 'measure' && crit.measure) {
    const base =
      crit.measures && crit.measures.length > 1
        ? measureItemsMulti(crit, crit.measures)
        : [measureItem(crit)];
    // A measure node MAY carry a child enumeration ("BMI ≥ 35 WITH a qualifying comorbidity"): render
    // the threshold AND the child choice, so the band's comorbidity requirement is never dropped.
    if (crit.children) return [...base, ...crit.children.flatMap((c) => critItems(c, vsById))];
    return base;
  }
  if (crit.kind === 'choice' && crit.choice) {
    const vs = vsById.get(crit.choice.valueSetId);
    if (vs) return choiceItem(crit, vs);
  }
  if (crit.kind === 'documentation') return docItems(crit);
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
      // The determination heading titles the pathway; falls back to the population label, then a
      // generic "Eligibility" only when the policy stated no heading.
      text: p.label ?? (p.population ? `Pathway (${p.population.concept})` : 'Eligibility'),
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
      // Coverage exclusions are payer rules, never provider-attestation questions — omit them from
      // the DTR questionnaire (they remain in the registry for evaluation + CRD).
      if (isExclusionCriterion(crit)) continue;
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
