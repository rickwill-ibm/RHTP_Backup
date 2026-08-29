/**
 * Published coverage rules the runtime CRD consults.
 *
 * Publication topology (the correction): policy authoring publishes, per code, a coverage rule
 * — { PA required?, guideline/policy, → DTR questionnaire canonical, documentation needed, criteria
 * names, primary Dx } — and the runtime CRD READS that rule. It is NOT a hardcoded "PA required =
 * YES" mock. This module holds the demo's PUBLISHED rule set (the shape `buildCoverageRules` emits
 * from an authored policy) so CRD derives its determination + requirements from a real rule.
 *
 * NOTE: this is the demo's seeded published set. Wiring authoring→a persisted rule store is the
 * remaining publication-infra follow-up; the runtime contract (CRD reads a rule) is honored here.
 */

import { engineCoverageRuleForCode } from './policyEngineBridge';

export interface CrdDocRequirement {
  doc: string;
  sub?: string;
  requirement: 'required' | 'recommended';
}

export interface CrdPrimaryDx {
  code: string;
  label: string;
}

export interface CrdCoverageRule {
  code: string;
  priorAuthRequired: boolean;
  policyTitle: string;
  /** Canonical URL of the DTR questionnaire the CRD card points to. */
  questionnaireCanonical?: string;
  reason?: string;
  /** The typical ordering diagnosis for this service (demo seed; a real order carries its own Dx). */
  primaryDx?: CrdPrimaryDx;
  /** The payer-configured clinical guideline this rule was determined against. */
  clinicalGuideline?: string;
  /** Documentation the payer needs attached — the CRD `doc-needed`/`doc-purpose` list. */
  docNeeded?: CrdDocRequirement[];
  /** Names of the policy's requirement groups — CRD NAMES them; DTR evaluates them. */
  criteriaNames?: string[];
}

const Q = (slug: string): string => `urn:rhtp:dtr/Questionnaire/${slug}`;

/** The demo's published coverage rules (authoring output), keyed by procedure code. */
export const PUBLISHED_COVERAGE_RULES: readonly CrdCoverageRule[] = [
  {
    code: '72148',
    priorAuthRequired: true,
    policyTitle: 'MRI Lumbar Spine — Medical Necessity Policy',
    questionnaireCanonical: Q('mri-lumbar-spine'),
    reason: 'Advanced imaging requires prior authorization; complete the DTR template.',
    primaryDx: { code: 'M54.16', label: 'Radiculopathy, lumbar region' },
    clinicalGuideline: 'MSK Imaging v2025-01',
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
    criteriaNames: [
      'Symptom duration & conservative therapy',
      'Neurological deficit / red-flag findings',
      'Ordering provider specialty',
    ],
  },
  {
    code: '71275',
    priorAuthRequired: true,
    policyTitle: 'CT Angiography Chest — Medical Necessity Policy',
    questionnaireCanonical: Q('ct-angiography-chest'),
    reason: 'Advanced imaging requires prior authorization; complete the DTR template.',
    primaryDx: { code: 'R06.02', label: 'Shortness of breath' },
    clinicalGuideline: 'Advanced Imaging v2026-02',
    docNeeded: [
      { doc: 'Chest X-ray report', sub: 'most recent, prior to CTA', requirement: 'required' },
      { doc: 'D-dimer result', sub: 'within the episode', requirement: 'required' },
      { doc: 'Pulmonology consult note', sub: 'if available', requirement: 'recommended' },
    ],
    criteriaNames: [
      'Clinical indication documented',
      'Conservative imaging attempted first',
      'Ordering specialty match',
    ],
  },
  {
    code: '27447',
    priorAuthRequired: true,
    policyTitle: 'Total Knee Arthroplasty — Medical Necessity Policy',
    questionnaireCanonical: Q('total-knee-arthroplasty'),
    reason: 'Elective arthroplasty requires prior authorization; complete the DTR template.',
    primaryDx: { code: 'M17.11', label: 'Unilateral primary osteoarthritis, right knee' },
    clinicalGuideline: 'Musculoskeletal Surgery v2025-04',
    docNeeded: [
      {
        doc: 'Weight-bearing radiographs',
        sub: 'showing joint-space narrowing',
        requirement: 'required',
      },
      { doc: 'Conservative treatment record', sub: '≥ 3 months', requirement: 'required' },
    ],
    criteriaNames: [
      'Radiographic evidence of joint damage',
      'Failed conservative treatment ≥ 3 months',
      'Functional limitation documented',
    ],
  },
  {
    code: '95810',
    priorAuthRequired: true,
    policyTitle: 'Polysomnography (Sleep Study) — Medical Necessity Policy',
    questionnaireCanonical: Q('polysomnography'),
    reason: 'Attended sleep study requires prior authorization; complete the DTR template.',
    primaryDx: { code: 'G47.33', label: 'Obstructive sleep apnea (adult) (pediatric)' },
    clinicalGuideline: 'Sleep Medicine v2025-03',
    docNeeded: [
      { doc: 'Epworth Sleepiness Scale', sub: 'scored assessment', requirement: 'required' },
      { doc: 'Home sleep test result', sub: 'if attempted', requirement: 'recommended' },
    ],
    criteriaNames: [
      'Excessive daytime sleepiness documented',
      'Home sleep test attempted or contraindicated',
      'Comorbidity assessment',
    ],
  },
];

const BY_CODE = new Map(PUBLISHED_COVERAGE_RULES.map((r) => [r.code, r]));

/**
 * The published rule for a code, or a fail-honest default: PA required, review pending. We never
 * return "no PA required" for an unknown code (that would silently wave the member through) — an
 * unpublished code is routed to review, PA-required by default.
 */
export function coverageRuleForCode(code: string): CrdCoverageRule {
  // Engine first: the runtime CRD reads what the policy engine authored + published (the real
  // authoring→publication→runtime loop). The seed below is only a fallback for codes nothing has
  // published yet, so no code is ever silently waved through.
  const fromEngine = engineCoverageRuleForCode(code);
  if (fromEngine) return fromEngine;
  const found = BY_CODE.get(code);
  if (found) return found;
  return {
    code,
    priorAuthRequired: true,
    policyTitle: 'Unpublished coverage rule',
    reason: `No published coverage rule for ${code} — routed to review; PA required by default.`,
    criteriaNames: ['Clinical criteria per policy'],
    docNeeded: [{ doc: 'Supporting clinical documentation', requirement: 'required' }],
  };
}
