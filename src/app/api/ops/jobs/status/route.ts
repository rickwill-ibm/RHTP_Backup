/**
 * Ops jobs surface — GET /api/ops/jobs/status?runId=...  (WPC-01 Phase 5).
 * Service-token auth (fail-closed). Reads a run's status back from the process-
 * shared ops driver (the poll half of the trigger/poll contract).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ooError } from '@/lib/fhir/operationOutcome';
import { CORRELATION_HEADER, correlationFrom } from '@/lib/server/correlation';
import { checkOpsJobsAuth } from '@/lib/server/opsAuth';
import { getSharedOpsJobDriver } from '@/lib/jobs/opsRuntime';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };

  const auth = checkOpsJobsAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return NextResponse.json(ooError(`ops jobs: ${auth.reason}`, 'security'), {
      status: auth.status,
      headers,
    });
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId) {
    return NextResponse.json(ooError('runId is required', 'invalid'), { status: 400, headers });
  }

  const status = await getSharedOpsJobDriver().status({ runId, jobName: '' });
  if (!status) {
    return NextResponse.json(ooError(`run '${runId}' not found`, 'not-found'), {
      status: 404,
      headers,
    });
  }
  return NextResponse.json(status, { status: 200, headers });
}
