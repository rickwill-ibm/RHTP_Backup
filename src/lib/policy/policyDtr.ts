/**
 * Policy → DTR generator.
 *
 * Builds a DRAFT DTR (Documentation Templates & Rules) questionnaire from a
 * STRUCTURED policy extraction — using ONLY what the document contains
 * (product → procedure → codes + AI confidence). No invented clinical criteria:
 * for a payer PA code-list policy, the DTR is the documentation requirement per
 * procedure, with the extracted codes attached and low-confidence rows flagged
 * for the policy expert to review. Generic over any "Requirements By Product"
 * policy — nothing here is Horizon-specific.
 *
 * The draft is `status: 'draft'` — a human sign-off gate is required before it
 * goes `active`, exactly like the repo's existing DTR generator.
 */
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import type { FieldProvenance } from './extract/provenance';
import type { StructuredPolicy } from './extract/structured';

/** Codes at or below this confidence are flagged for expert review by default. */
export const DEFAULT_REVIEW_THRESHOLD = 50;

export interface DtrCode {
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  description: string;
  confidence: number | null;
  /** true when the AI confidence is low enough to warrant expert review. */
  needsReview: boolean;
}

export interface DtrProcedureItem {
  linkId: string;
  procedure: string;
  codes: DtrCode[];
}

export interface DtrProductSection {
  product: string;
  procedures: DtrProcedureItem[];
}

export interface PolicyDtr {
  resourceType: 'Questionnaire';
  status: 'draft';
  title: string;
  policyId: string;
  policyNumber: string | null;
  source: string;
  category: string | null;
  sourceFile: string;
  /** The reviewable structure the policy-expert screen renders. */
  sections: DtrProductSection[];
  /** A flat, FHIR-compatible item projection (one boolean per procedure + a documentation item). */
  item: QuestionnaireItemDef[];
  provenance: FieldProvenance[];
  warnings: string[];
  stats: {
    products: number;
    procedures: number;
    codes: number;
    flaggedForReview: number;
  };
}

export interface BuildDtrOptions {
  reviewThreshold?: number;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildPolicyDtr(policy: StructuredPolicy, opts: BuildDtrOptions = {}): PolicyDtr {
  const threshold = opts.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;
  const title = policy.title ?? 'Untitled policy';
  const policyId = `${slug(title)}${policy.policyNumber ? `-${slug(policy.policyNumber)}` : ''}`;

  const item: QuestionnaireItemDef[] = [];
  const sections: DtrProductSection[] = [];
  let procedures = 0;
  let codes = 0;
  let flaggedForReview = 0;

  policy.products.forEach((prod, pi) => {
    const section: DtrProductSection = { product: prod.product, procedures: [] };
    prod.procedures.forEach((pr, pj) => {
      procedures += 1;
      const linkId = `p${pi}-proc${pj}-${slug(pr.procedure).slice(0, 32)}`;
      const dtrCodes: DtrCode[] = pr.codes.map((c) => {
        codes += 1;
        const needsReview = c.confidence !== null && c.confidence <= threshold;
        if (needsReview) flaggedForReview += 1;
        return {
          code: c.code,
          codeSystem: c.codeSystem,
          description: c.description,
          confidence: c.confidence,
          needsReview,
        };
      });
      section.procedures.push({ linkId, procedure: pr.procedure, codes: dtrCodes });

      // FHIR-compatible: a boolean gate per procedure (is this the requested service?).
      const codeList = dtrCodes.map((c) => c.code).join(', ');
      item.push({
        linkId,
        text: `${prod.product} — is the member being scheduled for "${pr.procedure}"? (${codeList})`,
        type: 'boolean',
        required: false,
      });
    });
    sections.push(section);
  });

  // A single documentation-attachment item, mirroring the repo's DTR generator.
  item.push({
    linkId: 'clinical-documentation',
    text: 'Attach or reference the clinical documentation supporting medical necessity for the requested procedure.',
    type: 'string',
    required: true,
  });

  const warnings = [...policy.warnings];
  if (codes === 0)
    warnings.push('DTR has no codes — the source produced no product/procedure tables');

  return {
    resourceType: 'Questionnaire',
    status: 'draft',
    title: `DTR — ${title}`,
    policyId,
    policyNumber: policy.policyNumber,
    source: title,
    category: policy.category,
    sourceFile: policy.sourceFile,
    sections,
    item,
    provenance: policy.provenance,
    warnings,
    stats: { products: policy.products.length, procedures, codes, flaggedForReview },
  };
}
