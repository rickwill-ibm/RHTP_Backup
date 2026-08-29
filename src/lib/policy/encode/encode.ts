/**
 * Encoder orchestrator (RHTP Policy Engine, encoding layer).
 *
 * Turns an extracted `CriteriaPolicy` (text) into a typed `PolicyLogic` IR by running the encoder
 * pattern set (E0..E9) over its criteria. Upholds the spec §1 safety invariants — notably the
 * FAIL-CLOSED default coverage role and no-silent-degradation (anything unparsed stays free-text
 * with a review flag).
 *
 * Design authority: docs/policy-encoder-spec.md §2, §3, §7 (build sequence).
 */
import type { CriteriaGroup, CriteriaPolicy, CriterionNode } from '../extract/criteria';
import type { Span } from '../extract/provenance';
import type {
  BoolExpr,
  CodedValueSet,
  DocRequirement,
  EncodedCriterion,
  Pathway,
  PolicyLogic,
  ProcedureRule,
} from './ir';
import { repairGlyphs, canonicalLabel } from './text';
import { parseMeasuresDetailed } from './measure';
import type { Measure } from './ir';
import { parseTimeWindow } from './time';
import { detectChoiceMin, isOpenSet, buildValueSet, type OptionInput } from './valueset';
import {
  adolescentPopulation,
  diabetesPopulation,
  isManualReview,
  parseThresholdVariant,
} from './population';
import { isNegationHeading } from './procedure';

const SPAN0: Span = { start: 0, end: 0 };
function spanOf(n: CriterionNode): Span {
  return n.span ?? SPAN0;
}

/** Attach a population threshold variant to the measure it actually shifts, BY FIELD (not blindly the
 *  first measure): e.g. an Asian-ancestry BMI shift lands on the BMI measure, never on the age one. */
function attachThresholdVariant(measures: Measure[], text: string): void {
  const variant = parseThresholdVariant(text, 'bmi');
  if (!variant) return;
  const fields = new Set(variant.substitutions.map((s) => s.field));
  const target =
    measures.find((m) => m.field !== undefined && fields.has(m.field)) ??
    measures.find((m) => m.field === 'bmi');
  if (target) target.thresholdVariant = variant;
}

/** Merge a review reason into a criterion's review flag without dropping any prior reason. */
function mergeReviewFlag(crit: EncodedCriterion, reason: string): void {
  crit.reviewFlag = crit.reviewFlag
    ? { reason: `${crit.reviewFlag.reason}; ${reason}` }
    : { reason };
}

/** A locally-negated threshold inside an indications group has ambiguous polarity ("a BMI < 35 is
 *  NOT medically necessary" is an exclusion, not an eligibility gate). Never auto-evaluate it: attach
 *  a review flag so `evalCriterion` returns 'unknown' and it can never auto-approve the population the
 *  policy excludes. (defect 1, fail-safe) */
function flagNegated(crit: EncodedCriterion, measures: Measure[]): void {
  if (measures.some((m) => m.negatedLocally === true)) {
    mergeReviewFlag(crit, 'exclusionary/negated threshold inside indications — human review');
  }
}

/** Encode one criterion node into an EncodedCriterion, registering it and its children by id. */
function encodeNode(
  node: CriterionNode,
  path: string,
  section: string,
  registry: Record<string, EncodedCriterion>,
  valueSets: CodedValueSet[]
): string {
  // Unlabeled criteria (bullet lists with no A./1. marker) get a stable, unique positional id so
  // siblings never collide in the registry, and their names render verbatim (no synthetic prefix).
  const labelKey = canonicalLabel(node.label);
  const uniq = labelKey || `n${Object.keys(registry).length}`;
  const id = path ? `${path}.${uniq}` : uniq;
  const repaired = repairGlyphs(node.text);
  const text = repaired.repaired;

  const crit: EncodedCriterion = {
    id,
    label: node.label,
    sourceText: node.text,
    sourceSpan: spanOf(node),
    sourceSection: section,
    labelSource: repaired.changed ? 'ocr-repaired' : 'extracted',
    kind: 'attestation',
  };
  if (repaired.needsReview)
    crit.reviewFlag = { reason: repaired.notes.find((n) => n.startsWith('REVIEW:')) ?? 'ocr' };

  // E1 measure. A single criterion may carry MORE THAN ONE threshold (age AND BMI); all are kept and
  // AND-combined at evaluation. Review reasons (unit-required / out-of-range) are surfaced, never dropped.
  const { measures, reviewReasons } = parseMeasuresDetailed(text);
  if (measures.length) {
    crit.kind = 'measure';
    crit.measure = measures[0];
    if (measures.length > 1) crit.measures = measures;
    attachThresholdVariant(measures, text);
    flagNegated(crit, measures);
  }
  if (reviewReasons.length) mergeReviewFlag(crit, reviewReasons.join('; '));

  // E5 time window.
  const tw = parseTimeWindow(text);
  if (tw) crit.timeWindow = tw;

  // Population hints.
  const diab = diabetesPopulation(text);
  if (diab) crit.population = diab;

  // E4 choice: a "one or more of" heading with child options.
  const min = detectChoiceMin(text);
  if (node.children.length && min !== null && min >= 1) {
    const vsId = `${id}:vs`;
    const options: OptionInput[] = node.children.map((child) => {
      const opt: OptionInput = { display: child.text, sourceText: child.text };
      const childText = repairGlyphs(child.text).repaired;
      const { measures: childMeasures, reviewReasons: childReasons } =
        parseMeasuresDetailed(childText);
      const childTw = parseTimeWindow(childText);
      if (childMeasures.length || childTw) {
        const followId = `${id}.${canonicalLabel(child.label)}`;
        const follow: EncodedCriterion = {
          id: followId,
          label: child.label,
          sourceText: child.text,
          sourceSpan: spanOf(child),
          sourceSection: section,
          labelSource: 'extracted',
          kind: childMeasures.length ? 'measure' : 'attestation',
        };
        if (childMeasures.length) {
          follow.measure = childMeasures[0];
          if (childMeasures.length > 1) follow.measures = childMeasures;
          attachThresholdVariant(childMeasures, childText);
          flagNegated(follow, childMeasures);
        }
        if (childTw) follow.timeWindow = childTw;
        if (childReasons.length) mergeReviewFlag(follow, childReasons.join('; '));
        opt.followUp = [follow];
      }
      return opt;
    });
    valueSets.push(buildValueSet(vsId, `${id} options`, text, options, 'inclusion', 'eligibility'));
    crit.kind = 'choice';
    crit.choice = { valueSetId: vsId, min: 1 };
    // note the open-set flag lives on the value set (isOpenSet applied inside buildValueSet)
    void isOpenSet;
  } else {
    // Recurse into children as sub-criteria (AND under this node), if any and not a choice.
    for (const child of node.children) {
      const childId = encodeNode(child, id, section, registry, valueSets);
      crit.children = crit.children ?? [];
      crit.children.push(registry[childId]);
    }
  }

  registry[id] = crit;
  return id;
}

/** Build the BoolExpr for a group from its top-level criteria and stated logic. */
function groupExpr(group: CriteriaGroup, ids: string[]): BoolExpr {
  const leaves: BoolExpr[] = ids.map((criterionId) => ({ op: 'leaf', criterionId }));
  if (leaves.length === 1) return leaves[0];
  return { op: group.logic === 'any' ? 'or' : 'and', nodes: leaves };
}

/**
 * Encode a whole policy. `procedureExtras` lets the caller inject procedure rules parsed elsewhere
 * (e.g. from a code table); the orchestrator focuses on criteria pathways + the fail-closed default.
 */
export function encodePolicy(
  policy: CriteriaPolicy,
  opts: { procedures?: ProcedureRule[]; service?: string; documentation?: DocRequirement[] } = {}
): PolicyLogic {
  const registry: Record<string, EncodedCriterion> = {};
  const pathways: Pathway[] = [];
  const exclusions: EncodedCriterion[] = [];

  policy.medicallyNecessary.forEach((group, gi) => {
    const section = `indications.group${gi}`;
    const valueSets: CodedValueSet[] = [];

    // A manual-review escalation clause anywhere in the group ⇒ a manual-review pathway.
    const manualNode = group.criteria.find((c) => isManualReview(repairGlyphs(c.text).repaired));
    if (manualNode) {
      pathways.push({
        id: `pathway.${gi}.manual-review`,
        role: 'manual-review',
        routingInstruction: manualNode.text.trim(),
        valueSets: [],
      });
    }

    const topIds = group.criteria
      .filter((c) => !isManualReview(repairGlyphs(c.text).repaired))
      .map((c) => encodeNode(c, `g${gi}`, section, registry, valueSets));

    // Population is taken from the GROUP HEADING only (e.g. "For members with diabetes…",
    // "Adolescents…"). It is NEVER inferred from a mention inside the age criterion — the under-18
    // *exception* text lives inside the adult age criterion and must not gate the adult pathway
    // (spec F4/§1.6). That exception text is preserved on its criterion for review / future E2.
    const heading = repairGlyphs(group.heading).repaired;
    let population = diabetesPopulation(heading) ?? undefined;
    if (!population && /adolescent|pediatric|under 18/i.test(heading)) {
      population = adolescentPopulation(heading);
    }

    // A group that reduced to zero eligibility leaves (e.g. entirely manual-review clauses) must NOT
    // become a satisfiable pathway — an empty AND would auto-approve. The manual-review pathway (if
    // any) already carries the routing. (red-team finding #1)
    if (topIds.length > 0) {
      const pathway: Pathway = {
        id: `pathway.${gi}`,
        role: 'eligibility',
        logic: groupExpr(group, topIds),
        valueSets,
      };
      if (population) pathway.population = population;
      pathways.push(pathway);
    }
  });

  // notMedicallyNecessary strings → exclusions; detect the fail-closed "all other" clause.
  // Fail-closed default (spec §1.1): when the policy enumerates a procedure set, an un-listed code
  // defaults to not-covered — independent of whether the "all other…" sentence parsed (OCR may eat
  // it). Only a policy with NO enumerated procedures (no code universe to judge against) stays
  // auth-needed and falls through to eligibility. (red-team finding #2)
  let defaultProcedureRole: PolicyLogic['defaultProcedureRole'] =
    (opts.procedures?.length ?? 0) > 0 ? 'not-covered' : 'auth-needed';
  policy.notMedicallyNecessary.forEach((raw, i) => {
    const text = repairGlyphs(raw).repaired;
    if (isNegationHeading(text)) {
      exclusions.push({
        id: `exclusion.${i}`,
        label: `NMN${i}`,
        sourceText: raw,
        sourceSpan: SPAN0,
        sourceSection: 'not-medically-necessary',
        labelSource: 'extracted',
        kind: 'exclusion',
        negate: true,
      });
    }
    if (
      /all other|not (?:considered )?(?:medically )?necessary for members who have not met|who have not met (?:the )?criteria|not otherwise/i.test(
        text
      )
    ) {
      defaultProcedureRole = 'not-covered'; // fail-closed default (spec §1.1)
    }
  });

  return {
    service: opts.service ?? policy.title ?? 'unknown-service',
    guidelineId: policy.guidelineId ?? 'unknown-guideline',
    sourceSectionMap: { indications: 'Clinical Indications' },
    pathways,
    criteria: registry,
    procedures: opts.procedures ?? [],
    defaultProcedureRole,
    exclusions,
    documentation: opts.documentation ?? [],
    provenance: Object.values(registry).map((c) => ({ field: c.id, span: c.sourceSpan })),
    rolePrecedence: [
      'conditional',
      'benefit-exclusion',
      'experimental-investigational',
      'criteria-not-met',
    ],
  };
}
