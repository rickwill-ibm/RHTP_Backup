/**
 * Policy-engine bridge (RHTP) — connects the runtime CRD to the real policy intelligence engine.
 *
 * The demo's coverage policies are authored as `CriteriaPolicy` inputs, run through the engine
 * (`@/lib/policy/encode`: encode → publish), and served to the runtime from the engine's publication
 * store. `publishedCoverage.coverageRuleForCode` reads THIS first, so the CRD screen renders
 * engine-produced coverage rules — not a hardcoded seed. Any newly authored/published policy shows up
 * here automatically; the legacy seed remains only as a fallback for codes nothing has published.
 *
 * This is the wiring that closes the authoring → publication → runtime loop for the live screen.
 */
import type { CriteriaPolicy, CriterionNode } from '@/lib/policy/extract/criteria';
import {
  createStore,
  authorAndPublish,
  coverageRuleForCode as engineRuleForCode,
  artifactForCode,
  type PublicationStore,
  type ProcedureRule,
  type FhirItem,
} from '@/lib/policy/encode';
import type { CrdCoverageRule, CrdDocRequirement, CrdPrimaryDx } from './publishedCoverage';
import type { DtrMatchResult, DtrGroup } from './pa-types';

/** A concise authored-policy spec; expands into a CriteriaPolicy the engine encodes. */
interface DemoPolicySpec {
  code: string;
  service: string;
  guidelineId: string;
  primaryDx: CrdPrimaryDx;
  criteriaNames: string[];
  docNeeded: CrdDocRequirement[];
}

/**
 * The demo's authored policies. Criteria carry NO label (unlabeled bullets) so the engine emits the
 * authored names verbatim. Content mirrors what the payer's medical policy states — nothing invented.
 */
const DEMO_POLICIES: DemoPolicySpec[] = [
  {
    code: '72148',
    service: 'MRI Lumbar Spine — Medical Necessity Policy',
    guidelineId: 'MSK Imaging v2025-01',
    primaryDx: { code: 'M54.16', label: 'Radiculopathy, lumbar region' },
    criteriaNames: [
      'Symptom duration & conservative therapy',
      'Neurological deficit / red-flag findings',
      'Ordering provider specialty',
    ],
    docNeeded: [
      {
        doc: 'Prior imaging report',
        sub: 'CT or prior MRI, if available',
        requirement: 'recommended',
      },
      {
        doc: 'Physical therapy notes',
        sub: 'most recent episode of care',
        requirement: 'required',
      },
    ],
  },
  {
    code: '71275',
    service: 'CT Angiography Chest — Medical Necessity Policy',
    guidelineId: 'Advanced Imaging v2026-02',
    primaryDx: { code: 'R06.02', label: 'Shortness of breath' },
    criteriaNames: [
      'Clinical indication documented',
      'Conservative imaging attempted first',
      'Ordering specialty match',
    ],
    docNeeded: [
      { doc: 'Chest X-ray report', sub: 'most recent, prior to CTA', requirement: 'required' },
      { doc: 'D-dimer result', sub: 'within the episode', requirement: 'required' },
      { doc: 'Pulmonology consult note', sub: 'if available', requirement: 'recommended' },
    ],
  },
  {
    code: '27447',
    service: 'Total Knee Arthroplasty — Medical Necessity Policy',
    guidelineId: 'Musculoskeletal Surgery v2025-04',
    primaryDx: { code: 'M17.11', label: 'Unilateral primary osteoarthritis, right knee' },
    criteriaNames: [
      'Radiographic evidence of joint damage',
      'Failed conservative treatment ≥ 3 months',
      'Functional limitation documented',
    ],
    docNeeded: [
      {
        doc: 'Weight-bearing radiographs',
        sub: 'showing joint-space narrowing',
        requirement: 'required',
      },
      { doc: 'Conservative treatment record', sub: '≥ 3 months', requirement: 'required' },
    ],
  },
  {
    code: '95810',
    service: 'Polysomnography (Sleep Study) — Medical Necessity Policy',
    guidelineId: 'Sleep Medicine v2025-03',
    primaryDx: { code: 'G47.33', label: 'Obstructive sleep apnea (adult) (pediatric)' },
    criteriaNames: [
      'Excessive daytime sleepiness documented',
      'Home sleep test attempted or contraindicated',
      'Comorbidity assessment',
    ],
    docNeeded: [
      { doc: 'Epworth Sleepiness Scale', sub: 'scored assessment', requirement: 'required' },
      { doc: 'Home sleep test result', sub: 'if attempted', requirement: 'recommended' },
    ],
  },
];

function toCriteriaPolicy(spec: DemoPolicySpec): CriteriaPolicy {
  const criteria: CriterionNode[] = spec.criteriaNames.map((text) => ({
    label: '', // unlabeled ⇒ verbatim name, positional unique id
    text,
    children: [],
  }));
  return {
    title: spec.service,
    guidelineId: spec.guidelineId,
    status: 'active',
    medicallyNecessary: [
      {
        heading: 'is considered medically necessary when all of the following are met',
        logic: 'all',
        criteria,
      },
    ],
    notMedicallyNecessary: ['Services not meeting the above criteria are not medically necessary.'],
    codes: [],
    provenance: [],
    warnings: [],
    stats: { groups: 1, criteria: spec.criteriaNames.length, codes: 0 },
  };
}

const store: PublicationStore = createStore();
const DX_BY_CODE = new Map<string, CrdPrimaryDx>();
let bootstrapped = false;

/** Author + publish every demo policy through the engine (idempotent). */
function bootstrap(): void {
  if (bootstrapped) return;
  for (const spec of DEMO_POLICIES) {
    const procedures: ProcedureRule[] = [
      {
        code: spec.code,
        system: 'CPT',
        coverageCode: 'covered',
        sourceText: spec.service,
        sourceSpan: { start: 0, end: 0 },
      },
    ];
    authorAndPublish(store, toCriteriaPolicy(spec), {
      procedures,
      service: spec.service,
      documentation: spec.docNeeded,
      now: () => '2026-08-28T00:00:00.000Z',
    });
    DX_BY_CODE.set(spec.code, spec.primaryDx);
  }
  bootstrapped = true;
}

/** The engine-published coverage rule for a code, mapped to the CRD's rule shape, or undefined. */
export function engineCoverageRuleForCode(code: string): CrdCoverageRule | undefined {
  bootstrap();
  const r = engineRuleForCode(store, code);
  if (!r) return undefined;
  const rule: CrdCoverageRule = {
    code: r.code,
    priorAuthRequired: r.priorAuthRequired,
    policyTitle: r.policyTitle,
    questionnaireCanonical: r.questionnaireCanonical,
    reason: r.reason,
    clinicalGuideline: r.clinicalGuideline,
    docNeeded: r.docNeeded?.map((d) => ({ doc: d.doc, sub: d.sub, requirement: d.requirement })),
    criteriaNames: r.criteriaNames,
  };
  const dx = DX_BY_CODE.get(code);
  if (dx) rule.primaryDx = dx;
  return rule;
}

/** The engine publication store (for callers that need the Questionnaire or determination). */
export function engineStore(): PublicationStore {
  bootstrap();
  return store;
}

/** Flatten a Questionnaire's items to its leaves (criteria + documentation), dropping group wrappers. */
function flattenLeaves(items: FhirItem[], out: FhirItem[]): void {
  for (const it of items) {
    if (it.type === 'group') {
      if (it.item) flattenLeaves(it.item, out);
    } else {
      out.push(it);
    }
  }
}

/**
 * The DTR "medical necessity match" for a procedure code, projected from the engine's PUBLISHED
 * Questionnaire — the real criteria the policy engine emitted, not a hand-written mock. Every leaf
 * (criterion or documentation item) becomes a requirement group the reviewer completes; a required
 * doc renders as a gap until attached (then attached-pending), consistent with dtrReadiness. Returns
 * null when nothing is published for the code (caller falls back to its BFF/mock path).
 */
export function engineDtrMatchForCode(code: string): DtrMatchResult | null {
  const artifact = artifactForCode(engineStore(), code);
  if (!artifact) return null;
  const leaves: FhirItem[] = [];
  flattenLeaves(artifact.questionnaire.item, leaves);
  const groups: DtrGroup[] = leaves.map((it, i) => {
    const g: DtrGroup = {
      id: i + 1,
      title: it.text,
      status: 'pending', // documentation to complete; upload marks it attached-pending
      description: it.text,
    };
    if (it.required === false) g.required = false; // recommended docs are optional
    return g;
  });
  return {
    policyTitle: `${artifact.service} (CPT ${code})`,
    cptCode: code,
    groups,
    allMet: false,
  };
}
