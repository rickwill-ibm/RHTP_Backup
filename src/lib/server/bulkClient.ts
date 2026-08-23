import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Payer-to-Payer bulk export client — plan Slice 3.
 * Kicks off a PDex $export via the bulk-export-client and polls status.
 * Uses a system (client_credentials) token for the async job.
 */
import { serverEnv } from './env';
import { getSystemToken } from './smartSession';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { audit } from './audit';

export async function startExport(
  priorPayer: string,
  memberMatch: unknown,
  ctx: { actor: string; correlationId?: string }
): Promise<{ ok: boolean; status: number; jobId: string | null; correlationId: string }> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  try {
    const token = await getSystemToken();
    const res = await fetch(`${env.bulkGatewayBase.replace(/\/$/, '')}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
      },
      body: JSON.stringify({ priorPayer, memberMatch }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string };
    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor,
      action: 'p2p.export.start',
      resourceRef: priorPayer,
      correlationId,
      outcome: res.ok ? 'success' : 'failure',
      detail: `status ${res.status}`,
    });
    return { ok: res.ok, status: res.status, jobId: body.jobId ?? null, correlationId };
  } catch {
    return { ok: false, status: 0, jobId: null, correlationId };
  }
}

export async function exportStatus(
  jobId: string,
  ctx: { correlationId?: string } = {}
): Promise<{ ok: boolean; status: number; state: string; fileUrls: string[] }> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  try {
    const token = await getSystemToken();
    const res = await fetch(
      `${env.bulkGatewayBase.replace(/\/$/, '')}/export/${encodeURIComponent(jobId)}`,
      {
        headers: { Authorization: `Bearer ${token}`, [CORRELATION_HEADER]: correlationId },
        cache: 'no-store',
      }
    );
    const body = (await res.json().catch(() => ({}))) as {
      state?: string;
      output?: { url: string }[];
    };
    return {
      ok: res.ok,
      status: res.status,
      state: body.state ?? 'unknown',
      fileUrls: (body.output ?? []).map((o) => o.url),
    };
  } catch {
    return { ok: false, status: 0, state: 'error', fileUrls: [] };
  }
}
