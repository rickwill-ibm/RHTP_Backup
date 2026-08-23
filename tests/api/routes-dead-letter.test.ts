/**
 * Route coverage (conventions §14): the ops dead-letter surface (NS-01).
 *   GET  /api/ops/dead-letter        — list open items (ops-scoped).
 *   POST /api/ops/dead-letter/[id]    — resolve / retry / dismiss (ops-scoped).
 * Auth + ops authz (non-ops denied) + validation + PHI-safe bodies.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import type { Role } from '@/lib/authz/guard';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-deadletter-audit');

// Controllable session: authenticated flag + acting role (drives isOpsPrincipal).
const session = { authenticated: true, role: 'admin' as Role };

vi.mock('@/lib/server/smartSession', () => ({
  isAuthenticated: vi.fn(async () => session.authenticated),
  getSessionAuthContext: vi.fn(async () =>
    session.authenticated
      ? { patient: null, fhirUser: 'Practitioner/ops-dev', scope: 'launch', role: session.role }
      : null,
  ),
}));

import { GET as listGET } from '@/app/api/ops/dead-letter/route';
import { POST as actionPOST } from '@/app/api/ops/dead-letter/[id]/route';
import {
  defaultDeadLetterStore,
  resetDefaultDeadLetterStore,
} from '@/lib/deadLetter';
import { setDeadLetterRetryLane, clearDeadLetterRetryLanes } from '@/lib/deadLetter/review';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';

const BASE = 'http://localhost:4029';

function req(pathname: string, opts: { method?: string; body?: unknown } = {}): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new NextRequest(`${BASE}${pathname}`, init as ConstructorParameters<typeof NextRequest>[1]);
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seed() {
  const store = defaultDeadLetterStore();
  const held = await store.append({ kind: 'held-identity', memberRef: 's:adt', reasonCode: 'identity-possible-match', sourceRef: 'MSG-1', payloadRef: 'b#h1' });
  const outbox = await store.append({ kind: 'failed-outbox', memberRef: 'mem-1', reasonCode: 'fhir-503', sourceRef: 'i-9', payloadRef: 'intent:i-9;attempts=5' });
  return { held, outbox };
}

function expectPhiSafe(body: unknown): void {
  const s = JSON.stringify(body) ?? '';
  expect(s).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/); // SSN
  expect(s).not.toMatch(/"(birthDate|dob|ssn|address|telecom)"\s*:/);
}

beforeEach(() => {
  session.authenticated = true;
  session.role = 'admin';
  setSessionDataMode('deadLetterStore', 'mock');
  resetDefaultDeadLetterStore();
  clearDeadLetterRetryLanes();
  vi.clearAllMocks();
});
afterEach(() => clearSessionDataModes());

describe('GET /api/ops/dead-letter', () => {
  it('401 (PHI-safe) when unauthenticated', async () => {
    session.authenticated = false;
    const res = await listGET(req('/api/ops/dead-letter'));
    expect(res.status).toBe(401);
    expectPhiSafe(await res.json());
  });

  it('403 when the principal is not ops-scoped (pa-reviewer denied)', async () => {
    session.role = 'pa-reviewer';
    await seed();
    const res = await listGET(req('/api/ops/dead-letter'));
    expect(res.status).toBe(403);
    expectPhiSafe(await res.json());
  });

  it('lists open items for an ops principal', async () => {
    await seed();
    const res = await listGET(req('/api/ops/dead-letter'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; items: Array<{ kind: string }> };
    expect(body.count).toBe(2);
    expectPhiSafe(body);
  });

  it('filters by kind', async () => {
    await seed();
    const res = await listGET(req('/api/ops/dead-letter?kind=held-identity'));
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(1);
  });

  it('400 for an invalid kind', async () => {
    const res = await listGET(req('/api/ops/dead-letter?kind=bogus'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ops/dead-letter/[id]', () => {
  it('403 for a non-ops principal', async () => {
    session.role = 'member';
    const { held } = await seed();
    const res = await actionPOST(req(`/api/ops/dead-letter/${held.id}`, { method: 'POST', body: { action: 'resolve' } }), routeParams(held.id));
    expect(res.status).toBe(403);
  });

  it('400 for a missing/invalid action', async () => {
    const { held } = await seed();
    const res = await actionPOST(req(`/api/ops/dead-letter/${held.id}`, { method: 'POST', body: { action: 'nope' } }), routeParams(held.id));
    expect(res.status).toBe(400);
  });

  it('resolves an item', async () => {
    const { held } = await seed();
    const res = await actionPOST(req(`/api/ops/dead-letter/${held.id}`, { method: 'POST', body: { action: 'resolve' } }), routeParams(held.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; record: { status: string } };
    expect(body.record.status).toBe('resolved');
  });

  it('dismisses an item', async () => {
    const { held } = await seed();
    const res = await actionPOST(req(`/api/ops/dead-letter/${held.id}`, { method: 'POST', body: { action: 'dismiss' } }), routeParams(held.id));
    expect((await res.json() as { record: { status: string } }).record.status).toBe('dismissed');
  });

  it('404 for an unknown id', async () => {
    const res = await actionPOST(req('/api/ops/dead-letter/nope', { method: 'POST', body: { action: 'resolve' } }), routeParams('nope'));
    expect(res.status).toBe(404);
  });

  it('retry with no wired lane fails closed (503) and leaves the item open', async () => {
    const { held } = await seed();
    const res = await actionPOST(req(`/api/ops/dead-letter/${held.id}`, { method: 'POST', body: { action: 'retry' } }), routeParams(held.id));
    expect(res.status).toBe(503);
    expect((await defaultDeadLetterStore().get(held.id))?.status).toBe('open');
  });

  it('retry through a registered lane marks the item retried', async () => {
    const { outbox } = await seed();
    setDeadLetterRetryLane('failed-outbox', async () => ({ ok: true, detail: 're-enqueued' }));
    const res = await actionPOST(req(`/api/ops/dead-letter/${outbox.id}`, { method: 'POST', body: { action: 'retry' } }), routeParams(outbox.id));
    expect(res.status).toBe(200);
    expect((await defaultDeadLetterStore().get(outbox.id))?.status).toBe('retried');
  });
});
