// CONTRACT: C-REVQUAL
/**
 * Reviewer qualification for the two recovery routes, in one place.
 *
 * WHY `administrative`, AND WHY THAT IS NOT A WEAKER CHECK BUT A DIFFERENT ONE. These routes record
 * the payer's own underpayment-recovery and appeal-submission actions — a financial act on the
 * plan's revenue, not a determination about a member's benefit. 42 CFR 438.210(b)(3) attaches to "a
 * decision to deny a service authorization request, or to authorize a service in an amount,
 * duration, or scope that is less than requested"; none of that is in play here, so requiring a
 * clinical peer would have no statutory basis and would block legitimate revenue-cycle operations
 * while doing nothing for the case the rule is about.
 *
 * What IS required, and what this asserts: an identified human who exists in a credentialing system
 * of record and whose file is not stale. That refuses the placeholder identity `'session-user'`, a
 * name the source has never heard of, and a credential file nobody has refreshed in over a year —
 * none of which the decider-class check (`isNonAutomatedDecider`) can see.
 *
 * Extracted because BOTH routes need it and `action/route.ts` was at its 400-line cap. It is also
 * the right shape on its own terms: "which requirement applies to a recovery action" is one
 * decision, and it should not be made twice.
 */
import { NextResponse } from 'next/server';
import {
  assertReviewerQualified,
  CredentialingNotConfiguredError,
  ReviewerNotQualifiedError,
  type QualifiedReviewer,
} from '@/lib/authz/credentialing';
import { ooError } from '@/lib/fhir/operationOutcome';

export interface QualifyOutcome {
  /** Set when the reviewer was refused: the response to return, and the audit detail to record. */
  refusal?: { response: NextResponse; auditDetail: string };
  /** The minted proof, when permitted. Passed on to `runGovernedAction`, which requires one. */
  reviewer?: QualifiedReviewer;
}

/**
 * Assert the acting principal may record a recovery action.
 *
 * Returns a refusal rather than throwing, because both callers need to write their OWN audit row
 * (they use different action codes) before returning — and a helper that threw would either swallow
 * that or force a try/catch at each site, which is what this replaces.
 */
export function qualifyRecoveryDecider(
  decidedBy: string,
  decidedAtMs: number,
  headers: Record<string, string>
): QualifyOutcome {
  try {
    const reviewer = assertReviewerQualified(
      decidedBy,
      {
        kind: 'initial-determination',
        determinationClass: 'administrative',
        needDomain: 'medical',
        licenceJurisdiction: 'NY',
      },
      decidedAtMs
    );
    return { reviewer };
  } catch (err) {
    if (err instanceof CredentialingNotConfiguredError) {
      return {
        refusal: {
          auditDetail: 'credentialing system of record unavailable',
          response: NextResponse.json(
            ooError(
              'Reviewer credentialing is unavailable; no governed action can be recorded',
              'exception'
            ),
            { status: 503, headers }
          ),
        },
      };
    }
    if (!(err instanceof ReviewerNotQualifiedError)) throw err;
    return {
      refusal: {
        // The CODE only. A licence number and an NPI are directly identifying and this detail
        // reaches an audit row and a response body.
        auditDetail: `reviewer not qualified: ${err.code}`,
        response: NextResponse.json(
          ooError(`Reviewer is not qualified to record this action (${err.code})`, 'forbidden'),
          { status: 403, headers }
        ),
      },
    };
  }
}
