/**
 * Ops jobs surface — POST /api/ops/jobs/run  (WPC-01 Phase 5).
 * Body: { name: string, input?: unknown }. Service-token auth (fail-closed).
 * Triggers the named job through the process-shared ops driver and returns the
 * terminal run status. This is the surface Airflow (or any orchestrator) calls;
 * the app never imports Airflow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ooError } from '@/lib/fhir/operationOutcome';
import { CORRELATION_HEADER, correlationFrom } from '@/lib/server/correlation';
import { audit } from '@/lib/server/audit';
import { checkOpsJobsAuth } from '@/lib/server/opsAuth';
import { ensureCoreJobsRegistered, getSharedOpsJobDriver } from '@/lib/jobs/opsRuntime';
import { JobNotRegisteredError } from '@/lib/jobs/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };

  const auth = checkOpsJobsAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return NextResponse.json(ooError(`ops jobs: ${auth.reason}`, 'security'), {
      status: auth.status,
      headers,
    });
  }

  const body = (await req.json().catch(() => null)) as { name?: string; input?: unknown } | null;
  const name = body?.name;
  if (!name) {
    return NextResponse.json(ooError('job name is required', 'invalid'), { status: 400, headers });
  }

  try {
    ensureCoreJobsRegistered();
    const driver = getSharedOpsJobDriver();
    const handle = await driver.trigger(name, body?.input);
    const status = await driver.status(handle);
    const ok = status?.state === 'succeeded';
    await audit({
      ts: new Date().toISOString(),
      actor: 'ops-service',
      action: 'ops.job.run',
      resourceRef: `Job/${name}`,
      correlationId,
      outcome: ok ? 'success' : 'failure',
      detail: `runId=${handle.runId} state=${status?.state ?? 'unknown'}`,
    });
    return NextResponse.json(
      {
        runId: handle.runId,
        jobName: name,
        state: status?.state,
        metrics: status?.result?.metrics ?? null,
        error: status?.error ?? null,
      },
      { status: ok ? 200 : 500, headers }
    );
  } catch (err) {
    const notReg = err instanceof JobNotRegisteredError;
    return NextResponse.json(
      ooError(
        notReg ? `unknown job '${name}'` : 'ops job trigger failed',
        notReg ? 'not-found' : 'exception'
      ),
      { status: notReg ? 404 : 500, headers }
    );
  }
}
