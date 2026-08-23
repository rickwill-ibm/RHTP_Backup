/**
 * BFF: reviewer work queue (reviewer UI).
 *
 * GET /api/work-queue → work items derived from persisted Evidence Records,
 * grouped by disposition. Authenticated + authorized + audited. Read-only.
 *
 * In mock mode returns seeded items from devStubs so the queue is never empty
 * in a fresh demo session (Evidence Records only populate after a financial
 * clearance run, which requires a seed bundle — mock always shows the demo data).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom } from '@/lib/server/correlation';
import { canReadMemberData } from '@/lib/authz/guard';
import { audit } from '@/lib/server/audit';
import { flag } from '@/lib/flags/flags';
import { getEvidenceStore } from '@/lib/evidence/store';
import { listWorkItems, groupByQueue } from '@/lib/goldenThread/workQueueView';
import { devMockEnabled, devWorkQueueItems } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!flag('goldenThread')) {
    return NextResponse.json(ooError('Work queue not enabled', 'not-supported'), { status: 404 });
  }
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const decision = canReadMemberData({ role: 'pa-reviewer', purpose: 'operations' });
  if (!decision.allow) {
    return NextResponse.json(ooError(decision.reason, 'forbidden'), { status: 403 });
  }

  try {
    // In mock mode always return seeded demo items — the in-memory evidence store
    // is empty on a fresh session unless financial-clearance has been run first.
    if (devMockEnabled()) {
      const seeded = devWorkQueueItems();
      type QN = 'auto-cleared' | 'ready-to-submit' | 'high-risk-review' | 'denied-appeal' | 'more-info';
      const groups: Record<QN, typeof seeded> = { 'auto-cleared': [], 'ready-to-submit': [], 'high-risk-review': [], 'denied-appeal': [], 'more-info': [] };
      for (const it of seeded) groups[it.queue as QN].push(it);
      return NextResponse.json({ count: seeded.length, groups }, { status: 200 });
    }
    const items = await listWorkItems(getEvidenceStore());
    await audit({
      ts: new Date().toISOString(),
      actor: 'session-user',
      action: 'work-queue.list',
      correlationId,
      outcome: 'success',
      detail: `items=${items.length}`,
    });
    return NextResponse.json({ count: items.length, groups: groupByQueue(items) }, { status: 200 });
  } catch {
    return NextResponse.json(ooError('Failed to load work queue', 'exception'), { status: 500 });
  }
}
