import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * PAS (Prior Authorization Support) submit client — plan Slice 4.
 * Submits a DaVinci PAS Claim Bundle to Claim/$submit with an idempotency key.
 * The route that calls this enforces the HUMAN approval gate (blueprint §4D).
 */
import { serverEnv } from './env';
import { getAccessToken } from './smartSession';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { audit } from './audit';

export interface PasSubmitResult {
  ok: boolean;
  status: number;
  claimResponse: unknown | null;
  correlationId: string;
}

export async function submitPas(
  claimBundle: unknown,
  ctx: { actor: string; approvedBy: string; idempotencyKey: string; correlationId?: string }
): Promise<PasSubmitResult> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const url = `${env.fhirGatewayBase.replace(/\/$/, '')}/Claim/$submit`;
  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
        'Idempotency-Key': ctx.idempotencyKey,
      },
      body: JSON.stringify(claimBundle),
      cache: 'no-store',
    });
    const claimResponse = await res.json().catch(() => null);
    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor,
      action: 'pas.submit',
      correlationId,
      outcome: res.ok ? 'success' : 'failure',
      detail: `approvedBy=${ctx.approvedBy} idem=${ctx.idempotencyKey} status ${res.status}`,
    });
    return { ok: res.ok, status: res.status, claimResponse, correlationId };
  } catch {
    return { ok: false, status: 0, claimResponse: null, correlationId };
  }
}
