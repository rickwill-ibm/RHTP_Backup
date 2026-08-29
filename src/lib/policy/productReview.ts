/**
 * Product-coverage review — the code-table (CRD) side of the policy workbench.
 *
 * A "Requirements By Product" policy (e.g. Horizon) carries NO medical-necessity
 * criteria — it is a product → procedure → CPT/HCPCS code list with an AI confidence
 * per row. That is a coverage/CRD artifact, not a DTR. This helper produces the
 * reviewable structure the policy expert inspects and corrects (grouped by product,
 * with low-confidence rows flagged), and nothing more.
 *
 * It deliberately does NOT emit a Questionnaire: DTR generation for every format goes
 * through the repo's single existing generator (`generateQuestionnaireFromPolicy`),
 * so there is exactly one DTR path. Generic over any "Requirements By Product" policy.
 */
import type { StructuredPolicy } from './extract/structured';

/** Codes at or below this confidence are flagged for expert review by default. */
export const DEFAULT_REVIEW_THRESHOLD = 50;

export interface ReviewCode {
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  description: string;
  confidence: number | null;
  /** true when the AI confidence is low enough to warrant expert review. */
  needsReview: boolean;
}

export interface ReviewProcedure {
  procedure: string;
  codes: ReviewCode[];
}

export interface ProductReviewSection {
  product: string;
  procedures: ReviewProcedure[];
}

export interface ProductReview {
  sections: ProductReviewSection[];
  stats: {
    products: number;
    procedures: number;
    codes: number;
    flaggedForReview: number;
  };
}

export interface ProductReviewOptions {
  reviewThreshold?: number;
}

export function buildProductReview(
  policy: StructuredPolicy,
  opts: ProductReviewOptions = {}
): ProductReview {
  const threshold = opts.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;
  const sections: ProductReviewSection[] = [];
  let procedures = 0;
  let codes = 0;
  let flaggedForReview = 0;

  for (const prod of policy.products) {
    const section: ProductReviewSection = { product: prod.product, procedures: [] };
    for (const pr of prod.procedures) {
      procedures += 1;
      const reviewCodes: ReviewCode[] = pr.codes.map((c) => {
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
      section.procedures.push({ procedure: pr.procedure, codes: reviewCodes });
    }
    sections.push(section);
  }

  return {
    sections,
    stats: { products: policy.products.length, procedures, codes, flaggedForReview },
  };
}
