/**
 * BFF: GET /api/value-set-governance/history?valueSetId=... — STEWARD or
 * REVIEWER reads the PHI-free governance history for a value set.
 * Thin authz+validation over Wave A's governance backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveGovernanceBackend } from '../_lib/backendAdapter';
import {
  requireGovRole,
  auditGov,
  badRequest,
  serverError,
} from '../_lib/routeKit';

export const runtime = 'nodejs';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireGovRole(['steward', 'reviewer']);
  if (!gate.ok) return gate.res;

  const valueSetId = req.nextUrl.searchParams.get('valueSetId') ?? '';
  if (!ID_PATTERN.test(valueSetId)) {
    return badRequest('valueSetId query parameter is required and must be a valid identifier');
  }

  try {
    const entries = resolveGovernanceBackend().history(valueSetId);
    await auditGov(
      req,
      gate.actor.userId,
      'value-set-governance.history',
      valueSetId,
      'success',
      `entries=${entries.length}`,
    );
    return NextResponse.json({ valueSetId, count: entries.length, entries }, { status: 200 });
  } catch {
    await auditGov(req, gate.actor.userId, 'value-set-governance.history', valueSetId, 'failure');
    return serverError('Failed to read value-set governance history');
  }
}
