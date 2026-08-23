import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * $member-match client (plan Slice 2 — Provider Access, Slice 3 — P2P).
 * The payer identifies the member before releasing data.
 */
import { serverEnv } from './env';
import { getAccessToken } from './smartSession';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { audit } from './audit';

export async function memberMatch(
  parameters: unknown,
  ctx: { actor: string; correlationId?: string }
): Promise<{ ok: boolean; status: number; result: unknown | null; correlationId: string }> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const url = `${env.fhirGatewayBase.replace(/\/$/, '')}/Patient/$member-match`;
  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
      },
      body: JSON.stringify(parameters),
      cache: 'no-store',
    });
    const result = await res.json().catch(() => null);
    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor,
      action: 'member-match',
      correlationId,
      outcome: res.ok ? 'success' : 'failure',
      detail: `status ${res.status}`,
    });
    return { ok: res.ok, status: res.status, result, correlationId };
  } catch {
    return { ok: false, status: 0, result: null, correlationId };
  }
}
