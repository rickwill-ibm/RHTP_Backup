/**
 * Coordination of Benefits — order-of-benefits determination (HW-FIN-B / I24).
 *
 * When a member has more than one coverage, the PRIMARY payer pays first. This
 * applies the standard COB rules (a bounded, deterministic subset): Medicare
 * secondary-payer rules, active-employee-vs-retiree, and the birthday rule for
 * dependents. Getting the order wrong causes overpayment/underpayment and FWA
 * exposure — so it is a mechanical determination, not a guess.
 */

export interface Coverage {
  coverageId: string;
  /** The line of business / payer type. */
  type: 'medicare' | 'commercial-active' | 'commercial-retiree' | 'medicaid' | 'other';
  /** The subscriber's birth month-day 'MM-DD' (for the birthday rule on dependents). */
  subscriberBirthday?: string;
  /** True when this coverage is via the member's own active employment. */
  activeEmployment?: boolean;
}

export interface CobOrder {
  ordered: Coverage[];
  reason: string;
}

/**
 * Rank value — LOWER pays first. Medicaid is ALWAYS the payer of last resort;
 * Medicare is secondary to active commercial (MSP) but primary to retiree/medicaid.
 */
function rank(c: Coverage): number {
  switch (c.type) {
    case 'commercial-active': return 0;   // active employer coverage pays first (MSP)
    case 'medicare': return 1;            // Medicare secondary to active employer, primary to the rest
    case 'commercial-retiree': return 2;
    case 'other': return 3;
    case 'medicaid': return 9;            // payer of last resort
  }
}

/** Determine the order of benefits across a member's coverages. */
export function orderOfBenefits(coverages: Coverage[]): CobOrder {
  const ordered = [...coverages].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    // tiebreak within the same rank: the birthday rule (earlier month-day first)
    const ab = a.subscriberBirthday ?? '99-99';
    const bb = b.subscriberBirthday ?? '99-99';
    if (ab !== bb) return ab < bb ? -1 : 1;
    return a.coverageId.localeCompare(b.coverageId);
  });
  const primary = ordered[0];
  const reason = primary
    ? `${primary.type} is primary${coverages.length > 1 ? ' (COB order applied)' : ''}`
    : 'no coverage';
  return { ordered, reason };
}

/** The primary payer, or null when there is no coverage. */
export function primaryPayer(coverages: Coverage[]): Coverage | null {
  return orderOfBenefits(coverages).ordered[0] ?? null;
}
