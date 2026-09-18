/**
 * Cited denial / prior-authorization baselines (#501 — shift-left grounding).
 *
 * The single source of truth for the industry baselines the shift-left surface
 * cites. Every figure carries a short SOURCE TAG (KFF / CAQH / JAMA / CMS) and is
 * framed as DECISION SUPPORT — a published industry baseline, NOT a guarantee of
 * any outcome and NOT this deployment's book of business. Grounding the panel here
 * (rather than in component copy) keeps the numbers auditable and lets a unit test
 * pin them so they cannot silently drift.
 *
 * Pure data + types only. PHI-safe: population statistics, no member data.
 */

/** One cited baseline figure with its provenance tag. */
export interface CitedBaseline {
  /** Stable id (test anchor). */
  id: string;
  /** Human-readable metric name. */
  label: string;
  /** The figure exactly as displayed (e.g. '~19%', '~$10.97'). */
  value: string;
  /** Short source tag, e.g. 'KFF 2024', 'CAQH 2023', 'JAMA 2019'. */
  source: string;
  /** Short PHI-safe qualifier that keeps the figure honest / in context. */
  note?: string;
}

/**
 * Denial + PA + cost + waste baselines. Verified figures (fact-checked upstream) —
 * do NOT edit values without re-verifying the cited source.
 */
export const DENIAL_BASELINES: readonly CitedBaseline[] = Object.freeze([
  {
    id: 'aca-denial-rate',
    label: 'ACA marketplace in-network claim denial rate',
    value: '~19%',
    source: 'KFF 2024',
    note: 'Of denials, only ~5% are medical-necessity; most are excluded-service / other.',
  },
  {
    id: 'ma-pa-denied',
    label: 'Medicare Advantage prior-auth determinations denied',
    value: '~7.7%',
    source: 'KFF 2024',
  },
  {
    id: 'ma-pa-appealed',
    label: 'MA prior-auth denials that are appealed',
    value: '~11.5%',
    source: 'KFF 2024',
    note: 'Of the denials that are appealed, ~80.7% are overturned.',
  },
  {
    id: 'pa-cost-manual',
    label: 'Provider prior-auth transaction cost — manual',
    value: '~$10.97',
    source: 'CAQH 2023',
  },
  {
    id: 'pa-cost-electronic',
    label: 'Provider prior-auth transaction cost — electronic',
    value: '~$5.79',
    source: 'CAQH 2023',
  },
  {
    id: 'admin-waste',
    label: 'U.S. administrative-complexity waste (annual)',
    value: '~$265.6B',
    source: 'JAMA 2019',
    note: 'Shrank et al.; the largest single category of estimated waste.',
  },
]);

/** A CMS-0057-F compliance milestone (effective date + scope note). */
export interface ComplianceMilestone {
  id: string;
  label: string;
  /** ISO effective date. */
  effective: string;
  source: string;
  note?: string;
}

/**
 * CMS-0057-F milestones. Scope is MA, Medicaid (FFS + managed care), CHIP, and QHPs
 * on the FFEs — NOT commercial. The Da Vinci CRD/DTR/PAS IGs are recommended, not
 * themselves mandated.
 */
export const CMS_0057F_MILESTONES: readonly ComplianceMilestone[] = Object.freeze([
  {
    id: 'process-metrics',
    label: 'CMS-0057-F process changes + PA metrics reporting',
    effective: '2026-01-01',
    source: 'CMS-0057-F',
  },
  {
    id: 'fhir-pa-api',
    label: 'CMS-0057-F FHIR Prior Authorization API',
    effective: '2027-01-01',
    source: 'CMS-0057-F',
    note: 'Applies to MA, Medicaid (FFS + MC), CHIP, and FFE QHPs — not commercial. Da Vinci CRD/DTR/PAS IGs are recommended, not mandated.',
  },
]);

/**
 * The framing shown with the baselines. States plainly that this is decision
 * support for shifting denial prevention to the point of order — not a guarantee.
 */
export const SHIFT_LEFT_FRAMING =
  'Decision-support baseline for shifting denial prevention to the point of order — cited industry figures, not a guarantee of any outcome and not this deployment’s book of business.';
