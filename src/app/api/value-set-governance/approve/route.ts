/**
 * BFF: POST /api/value-set-governance/approve — REVIEWER approves the pending
 * value-set version.
 *
 * MAKER-CHECKER AT THE ROUTE BOUNDARY (defense in depth, per brief §2): even a
 * reviewer principal may not approve a version they themselves submitted while
 * maker-checker mode is enforced — the route returns 403 BEFORE calling the
 * backend. The backend (Wave A) enforces the same rule; this is the redundant
 * boundary gate so an authz regression there still fails closed (E9).
 */
import { NextRequest, NextResponse } from 'next/server';
import { correlationFrom } from '@/lib/server/correlation';
import { evaluateMakerChecker } from '@/lib/terminology/governance';
import { resolveGovernanceBackend } from '../_lib/backendAdapter';
import {
  requireGovRole,
  parseMutationBody,
  auditGov,
  recordToWire,
  forbidden,
  serverError,
} from '../_lib/routeKit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireGovRole(['reviewer']);
  if (!gate.ok) return gate.res;

  const parsed = await parseMutationBody(req, false);
  if (!parsed.ok) return parsed.res;

  const { valueSetId } = parsed.value;
  const backend = resolveGovernanceBackend();

  // Maker-checker at the boundary via the SINGLE shared predicate: block
  // self-approval before any state change. approve is reviewer-gated above, so the
  // acting governance role is a reviewer.
  if (backend.makerCheckerEnabled()) {
    const current = backend.getRecord(valueSetId);
    const decision = evaluateMakerChecker({
      approvalMode: 'maker-checker',
      submittedBy: current?.submittedBy,
      approverId: gate.actor.userId,
      approverRole: 'value-set-reviewer',
    });
    if (!decision.ok) {
      await auditGov(
        req,
        gate.actor.userId,
        'value-set-governance.approve.maker-checker-denied',
        valueSetId,
        'failure',
        'submitter may not approve own submission'
      );
      return forbidden('maker-checker: the submitter may not approve their own value-set version');
    }
  }

  try {
    const record = backend.approve({
      valueSetId,
      actor: gate.actor.userId,
      correlationId: correlationFrom(req.headers),
    });
    await auditGov(req, gate.actor.userId, 'value-set-governance.approve', valueSetId, 'success');
    return NextResponse.json(recordToWire(record), { status: 200 });
  } catch {
    await auditGov(req, gate.actor.userId, 'value-set-governance.approve', valueSetId, 'failure');
    return serverError('Failed to approve value-set version');
  }
}
