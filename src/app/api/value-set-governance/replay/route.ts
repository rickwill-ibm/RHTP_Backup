/**
 * BFF: POST /api/value-set-governance/replay — STEWARD or REVIEWER replays a
 * chosen value-set version and receives the binding it resolves to.
 * Thin authz+validation over Wave A's governance backend; the route computes no
 * binding of its own, it returns the backend's chosen-version binding verbatim.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveGovernanceBackend } from '../_lib/backendAdapter';
import {
  requireGovRole,
  parseMutationBody,
  auditGov,
  serverError,
} from '../_lib/routeKit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireGovRole(['steward', 'reviewer']);
  if (!gate.ok) return gate.res;

  // Replay targets a specific chosen version, so version is required.
  const parsed = await parseMutationBody(req, true);
  if (!parsed.ok) return parsed.res;

  const { valueSetId, version } = parsed.value;
  try {
    const binding = resolveGovernanceBackend().replay(valueSetId, version);
    await auditGov(
      req,
      gate.actor.userId,
      'value-set-governance.replay',
      valueSetId,
      'success',
      `version=${version}`,
    );
    return NextResponse.json(binding, { status: 200 });
  } catch {
    await auditGov(req, gate.actor.userId, 'value-set-governance.replay', valueSetId, 'failure');
    return serverError('Failed to replay value-set version');
  }
}
