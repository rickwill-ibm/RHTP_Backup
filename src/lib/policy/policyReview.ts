/**
 * Policy review orchestration — one entry point for the DTR authoring workbench.
 *
 * Detects which of the two real payer-policy formats a document is, runs the right
 * extractor, maps it onto the repo's existing `NormalizedPolicy`, and returns a
 * UNIFIED review model the screen renders:
 *   • code-table ("Requirements By Product", e.g. Horizon) → product/code review (CRD side)
 *   • clinical-guideline (criteria, e.g. Elevance CG / Aetna CPB) → medical-necessity review
 *
 * INTEGRATION INVARIANT: the DTR questionnaire (`item[]`) for BOTH formats is produced by
 * the ONE existing generator, `generateQuestionnaireFromPolicy(NormalizedPolicy)` — there is
 * no parallel DTR path. A code list (no indications) therefore yields a near-empty DTR (it is
 * really a coverage artifact); a criteria guideline yields a fully-populated one. Deterministic;
 * format detection keys off standard section markers.
 */
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import { engineQuestionnaireItems } from '@/lib/policy/dtr/engineQuestionnaireItems';
import type { TextSource } from './extract/types';
import type { FieldProvenance } from './extract/provenance';
import type { NormalizedPolicy } from './types';
import { extractStructuredPolicy, structuredToNormalized } from './extract/structured';
import {
  extractCriteriaPolicy,
  criteriaToNormalized,
  type CriteriaGroup,
  type GuidelineCode,
} from './extract/criteria';
import { buildProductReview, type ProductReviewSection } from './productReview';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import { engineCoverageRulesForReview } from '@/lib/policy/crd/engineCoverageRules';

export type PolicyFormat = 'code-table' | 'criteria' | 'unknown';

/** Options for processing — carries the tenant (payer/plan) the policy belongs to. */
export interface ProcessOptions {
  /** The tenant name this policy is being authored for (e.g. a payer or plan). Used as
   *  review context and to segregate the policyId so tenants never collide. */
  tenant?: string;
}

export interface PolicyReview {
  kind: PolicyFormat;
  /** The tenant (payer/plan) this policy was processed for, if provided. */
  tenant: string | null;
  title: string;
  policyId: string;
  guidelineId: string | null;
  source: string;
  sourceFile: string;
  status: 'draft';
  /** False when there is nothing substantive to sign off — no medical-necessity criteria,
   *  no codes, or an unrecognized format. The promotion gate must refuse an empty draft. */
  promotable: boolean;
  /** code-table format */
  productSections?: ProductReviewSection[];
  /** criteria format */
  criteriaSections?: CriteriaGroup[];
  notMedicallyNecessary?: string[];
  guidelineCodes?: GuidelineCode[];
  /** DTR questionnaire items (both formats) — from the existing generator. */
  item: QuestionnaireItemDef[];
  /**
   * CRD coverage-rule artifact — the SIBLING of the DTR questionnaire (Da Vinci: CRD and DTR are two
   * artifacts published from one policy, joined by the Questionnaire canonical). One rule per authored
   * code: covered?, prior-auth?, and the DTR Questionnaire canonical the CRD card launches.
   */
  coverageRules?: CoverageRule[];
  /** The single DTR Questionnaire canonical URL the CRD rules point at (== the package Questionnaire.url). */
  questionnaireCanonical?: string;
  provenance: FieldProvenance[];
  warnings: string[];
  stats: {
    format: PolicyFormat;
    products?: number;
    procedures?: number;
    codes: number;
    criteria?: number;
    flaggedForReview?: number;
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Segregate a policy id under its tenant so two tenants' policies never collide. */
function scopeToTenant(tenant: string | undefined, baseId: string): string {
  return tenant && tenant.trim().length > 0 ? `${slug(tenant)}/${baseId}` : baseId;
}

/**
 * Detect the policy format from its STRUCTURE (never payer/doc-type wording), so it works for
 * any payer or state medical policy:
 *   • code-table  — a product → procedure → code layout ("Requirements By Product").
 *   • criteria    — any medical-necessity region ("Medically Necessary" / "Medical Necessity").
 * A code table wins when both signals are present (it is the more specific shape).
 */
export function detectPolicyFormat(src: TextSource): PolicyFormat {
  const t = src.text;
  if (/Requirements?\s+By\s+Product/i.test(t)) return 'code-table';
  if (/Medical(?:ly)?\s+Necess/i.test(t)) return 'criteria';
  return 'unknown';
}

/** Process a document into a unified, reviewable draft DTR, in the context of a tenant. */
export function processPolicyDocument(src: TextSource, opts: ProcessOptions = {}): PolicyReview {
  const kind = detectPolicyFormat(src);
  const tenant = opts.tenant?.trim() ? opts.tenant.trim() : null;

  if (kind === 'code-table') {
    const structured = extractStructuredPolicy(src);
    const review = buildProductReview(structured);
    const perProduct = structuredToNormalized(structured);
    const title = structured.title ?? 'Untitled policy';
    // Every format's DTR comes from the ONE existing generator. A code list has no
    // indications, so this is honestly near-empty (coverage artifact, not a DTR). Build it
    // from a POLICY-LEVEL view (all products' codes unioned) rather than silently picking the
    // first product — the DTR represents the whole policy, not one arbitrary line of business.
    const wholePolicy: NormalizedPolicy | null =
      perProduct.length > 0
        ? {
            ...perProduct[0],
            title,
            plan: undefined,
            allPaCodes: Array.from(new Set(perProduct.flatMap((p) => p.allPaCodes ?? []))).sort(),
          }
        : null;
    // A code list has no clinical criteria, so its DTR is honestly just a documentation upload —
    // the engine has nothing to encode here (one path, no fabricated indications).
    const item: QuestionnaireItemDef[] = wholePolicy
      ? [
          {
            linkId: 'clinical-documentation',
            text: 'Attach clinical documentation supporting the requested code(s)',
            type: 'attachment',
            required: true,
          },
        ]
      : [];
    const baseId = `${slug(title)}${structured.policyNumber ? `-${slug(structured.policyNumber)}` : ''}`;
    return {
      kind,
      tenant,
      title,
      policyId: scopeToTenant(tenant ?? undefined, baseId),
      guidelineId: null,
      source: title,
      sourceFile: structured.sourceFile,
      status: 'draft',
      promotable: review.stats.codes > 0,
      productSections: review.sections,
      item,
      provenance: structured.provenance,
      warnings: structured.warnings,
      stats: {
        format: kind,
        products: review.stats.products,
        procedures: review.stats.procedures,
        codes: review.stats.codes,
        flaggedForReview: review.stats.flaggedForReview,
      },
    };
  }

  if (kind === 'criteria') {
    const cp = extractCriteriaPolicy(src);
    const normalized = criteriaToNormalized(cp);
    const title = normalized.title;
    // Criteria → the policy ENGINE's typed questionnaire (BMI decimal, age integer, choice sets,
    // OCR-repaired, population-gated once) via the single seam `engineQuestionnaireItems`. The legacy
    // flat generator is the fallback only when the engine yields nothing to encode.
    const item =
      engineQuestionnaireItems(cp.medicallyNecessary, {
        service: title,
        guidelineId: cp.guidelineId ?? undefined,
        codes: cp.codes,
      }) ?? [];
    // CRD sibling artifact from the ENGINE — coverage rules for each authored code, sharing the DTR
    // Questionnaire canonical (Da Vinci: CRD card references the DTR Questionnaire). No codes ⇒ no rules.
    const coverageRules =
      engineCoverageRulesForReview(cp.medicallyNecessary, cp.codes, {
        service: title,
        guidelineId: cp.guidelineId ?? undefined,
        policyId: normalized.policyId,
        policyTitle: title,
      }) ?? [];
    const questionnaireCanonical =
      coverageRules[0]?.questionnaireCanonical ??
      `urn:rhtp:dtr/Questionnaire/${slug(normalized.policyId)}`;
    return {
      kind,
      tenant,
      title,
      policyId: scopeToTenant(tenant ?? undefined, normalized.policyId),
      guidelineId: cp.guidelineId,
      source: normalized.source,
      sourceFile: src.sourceFile,
      status: 'draft',
      promotable: cp.stats.criteria > 0,
      criteriaSections: cp.medicallyNecessary,
      notMedicallyNecessary: cp.notMedicallyNecessary,
      guidelineCodes: cp.codes,
      item,
      coverageRules,
      questionnaireCanonical,
      provenance: cp.provenance,
      warnings: cp.warnings,
      stats: { format: kind, criteria: cp.stats.criteria, codes: cp.stats.codes },
    };
  }

  const looksScanned = src.text.replace(/\s/g, '').length < 16;
  const unknownWarning = looksScanned
    ? 'No readable text found — this looks like a scanned/image PDF with no text layer. Configure an OCR service (set OCR_ENDPOINT) to ingest scanned documents.'
    : 'Unrecognized policy format — not a "Requirements By Product" list or a clinical guideline with medical-necessity criteria.';
  return {
    kind: 'unknown',
    tenant,
    title: src.sourceFile,
    policyId: scopeToTenant(tenant ?? undefined, slug(src.sourceFile)),
    guidelineId: null,
    source: src.sourceFile,
    sourceFile: src.sourceFile,
    status: 'draft',
    promotable: false,
    item: [],
    provenance: [],
    warnings: [unknownWarning],
    stats: { format: 'unknown', codes: 0 },
  };
}
