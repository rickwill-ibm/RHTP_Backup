import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * CDS Hooks client (Coverage Requirements Discovery) — plan Slice 4.
 * RHTP CALLS the payer CDS service to discover coverage/PA requirements.
 * Deterministic result comes from the rule-engine behind cds-service — RHTP
 * never derives coverage itself.
 */
import { serverEnv } from './env';
import { getAccessToken } from './smartSession';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { audit } from './audit';

export interface CdsCard {
  summary: string;
  indicator: 'info' | 'warning' | 'critical';
  detail?: string;
  links?: { label: string; url: string; type: string }[];
}

export interface CdsResponse {
  cards: CdsCard[];
}

export async function invokeCrd(
  hookId: string,
  hookRequest: unknown,
  ctx: { actor?: string; correlationId?: string } = {}
): Promise<{ ok: boolean; status: number; cards: CdsCard[]; correlationId: string }> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const url = `${env.cdsGatewayBase.replace(/\/$/, '')}/cds-services/${hookId}`;
  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
      },
      body: JSON.stringify(hookRequest),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({ cards: [] }))) as CdsResponse;
    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor ?? 'system',
      action: 'cds.crd',
      resourceRef: hookId,
      correlationId,
      outcome: res.ok ? 'success' : 'failure',
      detail: `status ${res.status}`,
    });
    return { ok: res.ok, status: res.status, cards: body.cards ?? [], correlationId };
  } catch {
    return { ok: false, status: 0, cards: [], correlationId };
  }
}
