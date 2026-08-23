/**
 * BFF: run the outbox->projector consumer once (HW1 / I14, REC-01).
 *
 * POST /api/ops/projection/run → drains confirmed/published outbox intents into
 * the graph store, advancing the per-member checkpoint; returns the run result.
 * This is the REAL ENTRY POINT that wires the previously-unwired projection path
 * (before this, the outbox had no live consumer — the #1 hardening finding).
 *
 * Ops-scoped authz (payer-ops / admin), BFF-only, audited, PHI-safe body. In mock
 * mode it runs against the in-memory stores (demo-safe: nothing durable required);
 * in production it drives the registered durable outbox + graph store, or fails closed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { now } from '@/lib/clock';
import { runProjectionOnce } from '@/lib/graph/consumer';
import { resolveProjectionStores } from '@/lib/graph/consumer/provider';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal)) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'projection.run.denied',
      correlationId,
      outcome: 'failure',
      detail: `role=${principal.role} is not ops-scoped`,
    });
    return NextResponse.json(ooError('Projection run requires an ops role', 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  try {
    const stores = resolveProjectionStores();
    // deterministic rng seed for envelope ids within a run (audited, not security-sensitive)
    let seed = 0x2545f491;
    const rng = () => {
      seed = (Math.imul(seed, 0x01000193) >>> 0) || 1;
      return (seed >>> 8) / 0x01000000;
    };
    const result = await runProjectionOnce(stores.outbox, stores.graph, stores.checkpoint, {
      now,
      rng,
    });
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'projection.run',
      correlationId,
      outcome: 'success',
      detail: `applied=${result.applied}; skipped=${result.skipped}; members=${result.members}; durable=${stores.durable}`,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.name : 'exception';
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'projection.run.error',
      correlationId,
      outcome: 'failure',
      detail,
    });
    // A fail-closed production store (no durable factory) is a 503, not a 500.
    const status = detail.includes('NotConfigured') ? 503 : 500;
    return NextResponse.json(ooError('Projection run failed', 'exception'), {
      status,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
}
