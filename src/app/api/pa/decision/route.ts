/**
 * BFF: record a prior-authorization / coverage decision under the AI-accountability
 * invariant (HW-AI / I16, C-DEC).
 *
 * POST /api/pa/decision → records an approve/deny decision. The tier-independent
 * invariant is enforced HERE: an ADVERSE coverage action (denial/termination/
 * reduction) resolves ONLY with a qualified human decider, and its decision
 * provenance (fired rule + version + member-facing reason + appeal reference) must
 * be complete. A favorable decision may follow the agent's autonomy tier. This is
 * the real entry point that makes the governance invariant reachable, not just
 * unit-tested. Reviewer/ops authz, audited, PHI-safe body.
 */
import {
  assertAdverseEligible,
  ModelSourcedFactRefused,
  type ProvenancedFact,
} from '@/lib/agents/provenance';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { now } from '@/lib/clock';
import {
  CredentialingNotConfiguredError,
  ReviewerNotQualifiedError,
  type QualifiedReviewer,
} from '@/lib/authz/credentialing';
import { isDenialBasis, isNeedDomain, qualifyReviewer } from './qualification';
import {
  evaluateDecision,
  buildDecisionProvenance,
  isAdverseProvenanceComplete,
  recordOutcome,
} from '@/lib/agents/governance';
import type { ProposedAction, HumanDecision } from '@/lib/agentRuntime/types';

export const runtime = 'nodejs';

const REVIEWER_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!REVIEWER_ROLES.has(principal.role)) {
    return NextResponse.json(
      ooError('Recording a coverage decision requires a reviewer role', 'forbidden'),
      {
        status: 403,
        headers: { [CORRELATION_HEADER]: correlationId },
      }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    proposalId?: string;
    actionType?: string;
    decision?: 'approved' | 'rejected';
    priority?: 'routine' | 'high' | 'urgent';
    refs?: Record<string, string>;
    firedRule?: string;
    ruleVersion?: string;
    memberFacingReason?: string;
    appealRef?: string;
    /** A coarse, PHI-safe cohort label for disparate-impact monitoring (HW-AI-B). */
    cohort?: string;
    /**
     * The facts that DETERMINED this decision, each carrying its origin.
     *
     * REQUIRED when `decision === 'rejected'`. An adverse determination with no declared
     * fact provenance is refused — see the gate below.
     */
    determinativeFacts?: Record<string, ProvenancedFact<string>>;
    /**
     * Which of 42 CFR 438.210(b)(3)'s three need domains this determination addresses:
     * 'medical' | 'behavioral-health' | 'ltss'. REQUIRED on an adverse decision and deliberately
     * undefaulted — see `qualification.ts`.
     */
    needDomain?: string;
    /** The jurisdiction whose licence the reviewer must hold (USPS state code). */
    licenceJurisdiction?: string;
    /**
     * Why this denial is adverse: 'clinical' (default) | 'eligibility' | 'timeliness' |
     * 'benefit-exhaustion'. Only the last three relax the clinical-peer requirement, they are
     * validated against a closed set, and anything unrecognised is treated as CLINICAL — the safe
     * end. A rejection never gets to be administrative by accident.
     */
    denialBasis?: string;
  } | null;

  if (
    !body?.proposalId ||
    !body.actionType ||
    (body.decision !== 'approved' && body.decision !== 'rejected')
  ) {
    return NextResponse.json(
      ooError('proposalId, actionType, and decision are required', 'invalid'),
      {
        status: 400,
        headers: { [CORRELATION_HEADER]: correlationId },
      }
    );
  }

  const action: ProposedAction = {
    actionType: body.actionType,
    priority: body.priority ?? 'routine',
    refs: body.refs ?? {},
  };
  // The decider is the AUTHENTICATED principal — never trusted from the body.
  const humanDecision: HumanDecision = {
    decision: body.decision,
    decidedBy: principal.userId,
    proposalId: body.proposalId,
    decidedAtMs: now(),
  };

  // The tier-independent gate. The agent tier is irrelevant for an adverse action.
  const gate = evaluateDecision({ action, autonomyTier: 'HITL', humanDecision });
  if (!gate.resolved) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'pa.decision.blocked',
      resourceRef: body.proposalId,
      correlationId,
      outcome: 'failure',
      detail: gate.reason,
    });
    return NextResponse.json(ooError(gate.reason, 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  /**
   * REVIEWER QUALIFICATION (C-REVQUAL) — 42 CFR 438.210(b)(3). Runs BEFORE the fact-taint gate; see
   * `qualification.ts` for why the order matters. `decidedBy` is the authenticated principal, so
   * this asks the credentialing system of record about the person who is actually acting.
   */
  const decidedAtMs = humanDecision.decidedAtMs;
  const adverseDecision = body.decision === 'rejected';
  if (adverseDecision && !isNeedDomain(body.needDomain)) {
    return NextResponse.json(
      ooError(
        'An adverse determination must declare needDomain (medical | behavioral-health | ltss) — ' +
          'a reviewer attested for one is not thereby attested for another',
        'invalid'
      ),
      { status: 422, headers: { [CORRELATION_HEADER]: correlationId } }
    );
  }
  let qualified: QualifiedReviewer;
  try {
    qualified = qualifyReviewer({
      reviewerRef: principal.userId,
      decision: body.decision,
      denialBasis: isDenialBasis(body.denialBasis) ? body.denialBasis : 'clinical',
      needDomain: isNeedDomain(body.needDomain) ? body.needDomain : 'medical',
      licenceJurisdiction: body.licenceJurisdiction ?? 'NY',
      asOfMs: decidedAtMs,
    });
  } catch (err) {
    if (err instanceof CredentialingNotConfiguredError) {
      await audit({
        ts: new Date().toISOString(),
        actor: principal.userId,
        action: 'pa.decision.credentialing-unavailable',
        resourceRef: body.proposalId,
        correlationId,
        outcome: 'failure',
        detail: 'credentialing system of record is not wired; no determination can be attributed',
      });
      return NextResponse.json(
        ooError(
          'Reviewer credentialing is unavailable; no determination can be recorded',
          'exception'
        ),
        { status: 503, headers: { [CORRELATION_HEADER]: correlationId } }
      );
    }
    if (!(err instanceof ReviewerNotQualifiedError)) throw err;
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'pa.decision.reviewer-not-qualified',
      resourceRef: body.proposalId,
      correlationId,
      outcome: 'failure',
      // The CODE, never the licence number or the NPI: this detail is identity-safe by construction.
      detail: `reviewer qualification refused: ${err.code}`,
    });
    return NextResponse.json(
      ooError(`Reviewer is not qualified for this determination (${err.code})`, 'forbidden'),
      { status: 403, headers: { [CORRELATION_HEADER]: correlationId } }
    );
  }

  /**
   * THE ADVERSE FACT-TAINT GATE. `assertAdverseEligible` refuses a fact set a model shaped,
   * and this is the first place in the application it runs on a member path.
   *
   * WHY IT WAS NEEDED. The gate had exactly ONE non-test caller in `src/`:
   * `api/ops/agents/reasoning/probeChain.ts`, whose own header says it is "an OPS self-test
   * surface, not a member-facing path". So the platform's central regulatory claim — that a
   * model cannot be the sole basis of an adverse determination — was made by a function
   * whose only caller was a self-test. `isAdverseProvenanceComplete` below is a DIFFERENT
   * check: it validates the decision RECORD carries a member-facing reason and an appeal
   * reference (42 CFR 438.404 notice content). Nothing validated the FACTS that produced it.
   *
   * FAIL CLOSED ON ABSENCE. An adverse decision that declares no determinative facts is
   * REFUSED, not passed. A gate that treats "no provenance supplied" as clean is the
   * fail-open this whole plane exists to prevent, and it is the easy mistake here.
   *
   * KNOWN RESIDUE, named rather than hidden: the facts arrive in the request body, so a
   * caller could mis-declare an origin. The same is already true of `firedRule` and
   * `ruleVersion`. The structural fix is a server-side determinative-fact store that this
   * route reads instead of trusts; that is its own wave. Until then this gate stops the
   * accidental case (a model-shaped fact flowing through an honest client) and not the
   * dishonest one, and the audit row records which it was.
   */
  if (body.decision === 'rejected') {
    const facts = body.determinativeFacts;
    if (!facts || Object.keys(facts).length === 0) {
      await audit({
        ts: new Date().toISOString(),
        actor: principal.userId,
        action: 'pa.decision.no-fact-provenance',
        resourceRef: body.proposalId,
        correlationId,
        outcome: 'failure',
        detail:
          'adverse determination declared no determinative facts' +
          ` [reviewer ${qualified.verdict.reviewerRef} via ${qualified.verdict.sourceId}]`,
      });
      return NextResponse.json(
        ooError(
          'An adverse determination must declare the facts that determined it, each with its origin',
          'invalid'
        ),
        { status: 422, headers: { [CORRELATION_HEADER]: correlationId } }
      );
    }
    try {
      assertAdverseEligible(facts);
    } catch (err) {
      if (!(err instanceof ModelSourcedFactRefused)) throw err;
      await audit({
        ts: new Date().toISOString(),
        actor: principal.userId,
        action: 'pa.decision.model-sourced-fact-refused',
        resourceRef: body.proposalId,
        correlationId,
        outcome: 'failure',
        // The verdict from the FIRST gate rides along, so a taint refusal is still attributable to
        // a credentialed actor — otherwise a re-submission with different facts is untraceable.
        detail:
          `fact "${err.factName}" is model-sourced or has unresolvable ancestry` +
          ` [reviewer ${qualified.verdict.reviewerRef} via ${qualified.verdict.sourceId}` +
          ` as-of ${String(qualified.verdict.asOfMs)}]`,
      });
      return NextResponse.json(
        ooError(
          'An adverse determination may not rest on a model-sourced fact: ' +
            `"${err.factName}" was refused`,
          'forbidden'
        ),
        { status: 403, headers: { [CORRELATION_HEADER]: correlationId } }
      );
    }
  }

  const provenance = buildDecisionProvenance({
    qualification: qualified.verdict, // the receipt reaches the durable record, not just the gate
    action,
    humanDecision,
    requiresHuman: gate.requiresHuman,
    firedRule: body.firedRule ?? 'unspecified',
    ruleVersion: body.ruleVersion ?? '0',
    memberFacingReason: body.memberFacingReason ?? '',
    appealRef: body.appealRef,
  });

  // An adverse determination MUST carry a member-facing reason + an appeal path.
  if (!isAdverseProvenanceComplete(provenance)) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'pa.decision.incomplete-provenance',
      resourceRef: body.proposalId,
      correlationId,
      outcome: 'failure',
      detail: 'adverse decision missing member-facing reason or appeal reference',
    });
    return NextResponse.json(
      ooError(
        'An adverse determination requires a member-facing reason and an appeal reference',
        'invalid'
      ),
      { status: 422, headers: { [CORRELATION_HEADER]: correlationId } }
    );
  }

  // Disparate-impact monitoring (HW-AI-B): record the outcome by PHI-safe cohort.
  if (body.cohort)
    recordOutcome({ cohort: body.cohort, favorable: provenance.decision === 'approved' });
  await audit({
    ts: new Date().toISOString(),
    actor: principal.userId,
    action: 'pa.decision.recorded',
    resourceRef: body.proposalId,
    correlationId,
    outcome: 'success',
    detail: `decision=${provenance.decision}; requiresHuman=${provenance.requiresHuman}; rule=${provenance.firedRule}@${provenance.ruleVersion}`,
  });
  return NextResponse.json(
    { recorded: true, provenance },
    {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    }
  );
}
