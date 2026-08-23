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
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { now } from '@/lib/clock';
import {
  evaluateDecision,
  buildDecisionProvenance,
  isAdverseProvenanceComplete,
} from '@/lib/agents/governance';
import type { ProposedAction, HumanDecision } from '@/lib/agentRuntime/types';

export const runtime = 'nodejs';

const REVIEWER_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401, headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!REVIEWER_ROLES.has(principal.role)) {
    return NextResponse.json(ooError('Recording a coverage decision requires a reviewer role', 'forbidden'), {
      status: 403, headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  const body = (await req.json().catch(() => null)) as {
    proposalId?: string; actionType?: string; decision?: 'approved' | 'rejected';
    priority?: 'routine' | 'high' | 'urgent'; refs?: Record<string, string>;
    firedRule?: string; ruleVersion?: string; memberFacingReason?: string; appealRef?: string;
  } | null;

  if (!body?.proposalId || !body.actionType || (body.decision !== 'approved' && body.decision !== 'rejected')) {
    return NextResponse.json(ooError('proposalId, actionType, and decision are required', 'invalid'), {
      status: 400, headers: { [CORRELATION_HEADER]: correlationId },
    });
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
      ts: new Date().toISOString(), actor: principal.userId, action: 'pa.decision.blocked',
      resourceRef: body.proposalId, correlationId, outcome: 'failure', detail: gate.reason,
    });
    return NextResponse.json(ooError(gate.reason, 'forbidden'), {
      status: 403, headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  const provenance = buildDecisionProvenance({
    action, humanDecision, requiresHuman: gate.requiresHuman,
    firedRule: body.firedRule ?? 'unspecified', ruleVersion: body.ruleVersion ?? '0',
    memberFacingReason: body.memberFacingReason ?? '', appealRef: body.appealRef,
  });

  // An adverse determination MUST carry a member-facing reason + an appeal path.
  if (!isAdverseProvenanceComplete(provenance)) {
    await audit({
      ts: new Date().toISOString(), actor: principal.userId, action: 'pa.decision.incomplete-provenance',
      resourceRef: body.proposalId, correlationId, outcome: 'failure',
      detail: 'adverse decision missing member-facing reason or appeal reference',
    });
    return NextResponse.json(
      ooError('An adverse determination requires a member-facing reason and an appeal reference', 'invalid'),
      { status: 422, headers: { [CORRELATION_HEADER]: correlationId } },
    );
  }

  await audit({
    ts: new Date().toISOString(), actor: principal.userId, action: 'pa.decision.recorded',
    resourceRef: body.proposalId, correlationId, outcome: 'success',
    detail: `decision=${provenance.decision}; requiresHuman=${provenance.requiresHuman}; rule=${provenance.firedRule}@${provenance.ruleVersion}`,
  });
  return NextResponse.json({ recorded: true, provenance }, {
    status: 200, headers: { [CORRELATION_HEADER]: correlationId },
  });
}
