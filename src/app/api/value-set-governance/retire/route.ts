/**
 * BFF: POST /api/value-set-governance/retire — STEWARD retires an approved
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

  const parsed = await parseMutationBody(req, true);
  if (!parsed.ok) return parsed.res;

  const { valueSetId, version } = parsed.value;
  try {
    const record = resolveGovernanceBackend().retire({
      valueSetId,
      version,
      actor: gate.actor.userId,
      correlationId: correlationFrom(req.headers),
    });
    await auditGov(req, gate.actor.userId, 'value-set-governance.retire', valueSetId, 'success');
    return NextResponse.json(recordToWire(record), { status: 200 });
  } catch {
    await auditGov(req, gate.actor.userId, 'value-set-governance.retire', valueSetId, 'failure');
    return serverError('Failed to retire value-set version');
  }
}
