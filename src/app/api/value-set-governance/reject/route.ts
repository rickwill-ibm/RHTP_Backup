/**
 * BFF: POST /api/value-set-governance/reject — STEWARD rejects the pending
 * value-set version. Thin authz+validation over Wave A's governance backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { correlationFrom } from '@/lib/server/correlation';
import { resolveGovernanceBackend } from '../_lib/backendAdapter';
import {
  requireGovRole,
  parseMutationBody,
  auditGov,
  recordToWire,
  serverError,
} from '../_lib/routeKit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireGovRole(['steward']);
  if (!gate.ok) return gate.res;

  const parsed = await parseMutationBody(req, false);
  if (!parsed.ok) return parsed.res;

  const { valueSetId } = parsed.value;
  try {
    const record = resolveGovernanceBackend().reject({
      valueSetId,
      actor: gate.actor.userId,
      correlationId: correlationFrom(req.headers),
    });
    await auditGov(req, gate.actor.userId, 'value-set-governance.reject', valueSetId, 'success');
    return NextResponse.json(recordToWire(record), { status: 200 });
  } catch {
    await auditGov(req, gate.actor.userId, 'value-set-governance.reject', valueSetId, 'failure');
    return serverError('Failed to reject value-set version');
  }
}
