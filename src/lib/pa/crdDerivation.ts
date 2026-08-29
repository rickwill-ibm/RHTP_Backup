/**
 * CRD derivation — the Coverage Requirements Discovery checklist, computed from the PATIENT'S
 * coverage and the PUBLISHED coverage rule, not a canned mock.
 *
 * Fidelity rules (findings C2/C3/H3):
 *  • Eligibility is asserted only from a real coverage signal (active + verified as-of the service
 *    date). Inactive/unknown ⇒ NOT eligible — never assumed (guards-fail-closed).
 *  • Payer/plan detail is read from the member's coverage, never a hardcoded "South Dakota Medicaid".
 *  • "Prior authorization required" is a DETERMINATION (required / not-required), not a pass/fail
 *    check — carried as `paRequired.required`; the view renders it as its own row.
 *  • Provider network status is only "in-network" from an explicit signal; otherwise reported
 *    unverified (no-silent-degradation).
 *
 * `parseCrdCards` extracts a determination from real CDS-Hooks cards when the BFF returns them.
 * Pure.
 */
import type { CrdCheckResult } from '@/lib/pa/pa-types';
import { isCoverageActive, type PatientContext } from '@/lib/pa/patientContext';
import type { CrdCoverageRule } from '@/lib/pa/publishedCoverage';

export interface DeriveCrdOptions {
  /** Date of service (ISO or locale) the eligibility is checked against. */
  serviceDate?: string;
  /** Explicit network-match signal for the ordering provider; undefined ⇒ unverified. */
  orderingProviderInNetwork?: boolean;
  /** Ordering provider display, for the network check detail. */
  orderingProvider?: string;
  /** Optional signal parsed from real CDS cards (overrides the rule's PA determination). */
  cardSignal?: CrdCardSignal;
}

/**
 * Derive the CRD checklist for one procedure code, in the context of the patient's coverage and
 * the published rule for that code.
 */
export function deriveCrdResult(
  ctx: PatientContext,
  code: string,
  rule: CrdCoverageRule,
  opts: DeriveCrdOptions = {}
): CrdCheckResult {
  const active = ctx.coverage.coverageStatus === 'active';
  const eligible = isCoverageActive(ctx, opts.serviceDate);
  const paRequired = opts.cardSignal?.priorAuthRequired ?? rule.priorAuthRequired;

  const netKnown = typeof opts.orderingProviderInNetwork === 'boolean';
  const inNetwork = opts.orderingProviderInNetwork === true;

  const guidelineConflict = opts.cardSignal?.guidelineConflict === true;

  return {
    patientEnrolled: {
      pass: active,
      label: 'Patient Enrolled',
      detail: active
        ? `Active coverage — ${ctx.coverage.payer} · ${ctx.coverage.plan} (member ${ctx.coverage.memberId})`
        : `Coverage ${ctx.coverage.coverageStatus} for ${ctx.coverage.payer} — not enrolled`,
      source: 'pa',
    },
    patientEligible: {
      pass: eligible,
      label: 'Patient Eligible',
      detail: eligible
        ? `Eligibility confirmed${ctx.coverage.eligibilityVerifiedOn ? ` (verified ${ctx.coverage.eligibilityVerifiedOn})` : ''}`
        : ctx.coverage.eligibilityVerifiedOn
          ? `Eligibility not confirmed for the date of service (last verified ${ctx.coverage.eligibilityVerifiedOn})`
          : 'Eligibility unverified — confirm before submission',
      source: 'pa',
    },
    providerInNetwork: {
      pass: netKnown ? inNetwork : false,
      label: 'Provider In-Network',
      detail: !netKnown
        ? `Network status not verified${opts.orderingProvider ? ` for ${opts.orderingProvider}` : ''} — confirm before submission`
        : inNetwork
          ? `${opts.orderingProvider ?? 'Ordering provider'} confirmed in-network (${ctx.coverage.network ?? ctx.coverage.plan})`
          : `${opts.orderingProvider ?? 'Ordering provider'} is out-of-network for ${ctx.coverage.plan}`,
      source: 'emr',
    },
    noConflictingGuideline: {
      pass: !guidelineConflict,
      label: 'No Conflicting Milliman/InterQual Guideline',
      detail: guidelineConflict
        ? 'A conflicting utilization guideline was flagged — route to review'
        : 'No conflicting guideline identified',
      source: 'guideline',
    },
    paRequired: {
      pass: true, // the determination itself is available; not a pass/fail check
      required: paRequired,
      label: 'Prior Authorization Determination',
      detail: paRequired
        ? `Prior authorization REQUIRED — ${rule.policyTitle} (CPT ${code})`
        : `Prior authorization NOT required — ${rule.policyTitle} (CPT ${code})`,
      source: null,
    },
  };
}

// ── CDS-Hooks card parsing (real /api/cds path) ──────────────────────────────

export interface CrdCard {
  summary?: string;
  detail?: string;
  indicator?: string;
  source?: { label?: string };
}

export interface CrdCardSignal {
  priorAuthRequired?: boolean;
  guidelineConflict?: boolean;
  notes: string[];
}

/**
 * Parse CDS-Hooks cards into a determination signal. Precision-not-recall: only a card that
 * explicitly speaks to prior authorization sets `priorAuthRequired`; a card that merely exists
 * does not. Returns undefined when nothing relevant is present (caller falls back to the rule).
 */
export function parseCrdCards(cards: CrdCard[] | undefined | null): CrdCardSignal | undefined {
  if (!cards || cards.length === 0) return undefined;
  const notes: string[] = [];
  let priorAuthRequired: boolean | undefined;
  let guidelineConflict: boolean | undefined;

  for (const c of cards) {
    const text = `${c.summary ?? ''} ${c.detail ?? ''}`.toLowerCase();
    if (!text.trim()) continue;
    notes.push(c.summary ?? c.detail ?? '');
    if (/\bprior auth\w*\b|\bpre-?auth\w*\b|\bpa\s+required\b/.test(text)) {
      // an explicit "no"/"not required" negates; otherwise a PA-speaking card asserts required
      priorAuthRequired = !/\bnot?\s+required\b|\bno\s+prior\b|\bnot\s+require/.test(text);
    }
    // A guideline conflict is flagged ONLY by a warning/critical card that actually asserts one —
    // never by an informational "no conflicting guideline identified" card (which also contains the
    // words "conflicting" + "guideline"). Precision-not-recall; fail toward "no conflict".
    const mentionsConflict = /\bconflict\w*\b/.test(text) && /\bguideline\b/.test(text);
    const negatesConflict = /\bno\b[^.]*\bconflict/.test(text) || /\bnot?\s+conflict/.test(text);
    if (
      mentionsConflict &&
      !negatesConflict &&
      (c.indicator === 'warning' || c.indicator === 'critical')
    ) {
      guidelineConflict = true;
    }
  }

  if (priorAuthRequired === undefined && guidelineConflict === undefined && notes.length === 0) {
    return undefined;
  }
  return { priorAuthRequired, guidelineConflict, notes };
}
