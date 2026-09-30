/**
 * Route coverage (conventions §14) for the WPCO agent BFF tranche:
 *   POST /api/ops/agents/reasoning  — bounded reasoning + the model-taint gate.
 *   GET  /api/ops/agents/authority  — ADL compile + semantic drift attestation.
 *
 * AUTHZ IS DRIVEN THROUGH THE REAL SESSION LAYER. Only `next/headers` is mocked;
 * every case presents a REAL sealed session cookie and the real
 * `getSessionAuthContext()` + `getPrincipal()` decide the role. Mocking the
 * auth-context factory and returning a `role` — which is what this suite used to
 * do — proves a gate only against the mock that feeds it.
 *
 * 401 / 403 / 200 on both, plus:
 *   - the fail-closed catches are PINNED: a session read that THROWS yields 401,
 *     and an auth-context read that throws never yields an ops principal. Without
 *     these, flipping `catch(() => false)` to `catch(() => true)` changes no test;
 *   - an auditor gets 200 on BOTH routes (the allowance both headers claim);
 *   - the model-taint gate actually FIRES on a real request (the point of route 1);
 *   - a DRIFTED PROMPT is refused, AUDITED and CORRELATED — not a framework 500;
 *   - the reasoning seam fails CLOSED in production mode (503, never a fake);
 *   - the authority payload labels its drift check `semantic` and never implies
 *     byte equality (the honesty requirement is asserted, not trusted);
 *   - every committed prompt template's pinnedHash equals sha256(text), so
 *     editing a prompt without re-pinning fails HERE rather than at request time;
 *   - every response body is PHI-safe by pattern, including the fact list.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { Role } from '@/lib/authz/guard';
import type { AuditEvent } from '@/lib/server/audit';
import * as clock from '@/lib/clock';
import { failCookiesOnCall, giveSession, resetJar, useRealAuthEnv } from './_sessionCookie';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-agents-route-audit');

/** Flip on to make the injected digest disagree with every reviewed pin. */
const promptDrift = { on: false };
const DRIFTED_DIGEST = `sha256:${'0'.repeat(64)}`;

// The ONLY session seam mocked: the cookie jar.
vi.mock('next/headers', async () => (await import('./_sessionCookie')).nextHeadersMock());

/**
 * Drift injection at the DIGEST, not at the registry: the real
 * `createPromptRegistry` then does the real comparison and raises its real
 * `PromptIntegrityError('content-drift')`. Nothing about the refusal is faked.
 */
vi.mock('@/lib/agents/reasoning/nodeDigest', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agents/reasoning/nodeDigest')>();
  return {
    nodeDigest: (text: string): string => (promptDrift.on ? DRIFTED_DIGEST : real.nodeDigest(text)),
  };
});

/** Audit is recorded, not written, so a test can assert what the route audited. */
const auditRows: AuditEvent[] = [];
vi.mock('@/lib/server/audit', () => ({
  audit: vi.fn(async (event: AuditEvent) => {
    auditRows.push(event);
    await Promise.resolve();
  }),
}));

import { POST as reasoningPOST } from '@/app/api/ops/agents/reasoning/route';
import { GET as authorityGET } from '@/app/api/ops/agents/authority/route';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { CORRELATION_HEADER } from '@/lib/server/correlation';
import promptTemplates from '@/lib/agents/reasoning/data/prompt-templates.json';

const BASE = 'http://localhost:4029';
const REASONING = '/api/ops/agents/reasoning';
const AUTHORITY = '/api/ops/agents/authority';

function req(pathname: string, method = 'GET'): NextRequest {
  return new NextRequest(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json' },
  } as ConstructorParameters<typeof NextRequest>[1]);
}

/** Give the request a live session acting in `role` (a real sealed cookie). */
function signIn(role: Role): void {
  giveSession({ fhirUser: 'Practitioner/ops-dev', role }, clock.now());
}

// PHI-safety is asserted against PATTERNS, never eyeballed (conventions §14).
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const DOB = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
const PHI_KEYS = /"(birthDate|dob|ssn|address|telecom|mrn|name|given|family|gender)"\s*:/;
const SEED_NAMES = /redhawk|dorothy|simmons|thunderbird|yellowhorse|maria\b/i;

function expectPhiSafe(body: unknown, label: string): void {
  const s = JSON.stringify(body) ?? '';
  expect(s, `${label}: no SSN-shaped value`).not.toMatch(SSN);
  expect(s, `${label}: no DOB-shaped date`).not.toMatch(DOB);
  expect(s, `${label}: no PHI-bearing keys`).not.toMatch(PHI_KEYS);
  expect(s, `${label}: no seed patient name`).not.toMatch(SEED_NAMES);
}

interface ReasoningBody {
  modelTaintGate: { refused: boolean; error?: string; factName?: string };
  reasoning: { facts: { factName: string; origin: string }[]; toolRequests: string[] };
  toolBindings: { tool: string; disposition: string; code?: string }[];
  seamModes: { agentReasoner: string; agentToolBinding: string };
  prompt: { id: string; templateHash: string };
}

interface AuthorityBody {
  attestation: { driftCheck: string; drifted: string[]; byteLevelGate: string };
  agents: { id: string; toolCount: number }[];
  routes: { id: string }[];
}

beforeEach(() => {
  resetJar();
  useRealAuthEnv();
  signIn('admin');
  promptDrift.on = false;
  auditRows.length = 0;
  clearSessionDataModes();
  setSessionDataMode('agentReasoner', 'mock');
  setSessionDataMode('agentToolBinding', 'mock');
  vi.clearAllMocks();
});
afterEach(() => {
  clearSessionDataModes();
  resetJar();
  promptDrift.on = false;
});

describe('POST /api/ops/agents/reasoning', () => {
  it('401 (PHI-safe) when unauthenticated', async () => {
    resetJar(); // no session cookie at all
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(401);
    expectPhiSafe(await res.json(), '401 body');
  });

  it('401 (fail-CLOSED) when the session read THROWS, never treated as authenticated', async () => {
    signIn('admin'); // a valid ops session exists …
    failCookiesOnCall(1); // … but the session store fails on the auth read
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(401);
    expectPhiSafe(await res.json(), '401 body');
  });

  it('403 (fail-CLOSED) when the AUTH-CONTEXT read throws — no ops role is recovered', async () => {
    signIn('admin'); // the session IS ops …
    failCookiesOnCall(2); // … but the context read (the 2nd jar call) fails
    const res = await reasoningPOST(req(REASONING, 'POST'));
    // A failed identity read must never yield the ops principal the cookie held.
    expect(res.status).toBe(403);
    expectPhiSafe(await res.json(), '403 body');
  });

  it('403 (PHI-safe) for a non-ops, non-auditor role', async () => {
    signIn('pa-reviewer');
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(403);
    expectPhiSafe(await res.json(), '403 body');
  });

  it("200: the model-taint gate REFUSES the step's model-origin facts", async () => {
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReasoningBody;
    expectPhiSafe(body, '200 body');
    // The whole point of the route: the gate fired on a real request.
    expect(body.modelTaintGate.refused).toBe(true);
    expect(body.modelTaintGate.error).toBe('ModelSourcedFactRefused');
    expect(body.reasoning.facts.length).toBeGreaterThan(0);
    expect(body.reasoning.facts.every((f) => f.origin === 'model')).toBe(true);
    expect(body.modelTaintGate.factName).toBe(body.reasoning.facts[0]?.factName);
  });

  it('200: an auditor may run the reasoning probe (the allowance the gate claims)', async () => {
    signIn('auditor');
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReasoningBody;
    expect(body.modelTaintGate.refused).toBe(true);
  });

  it('200: the response carries fact NAMES and digests, never fact values', async () => {
    const res = await reasoningPOST(req(REASONING, 'POST'));
    const body = (await res.json()) as ReasoningBody;
    const s = JSON.stringify(body);
    // The transcript's recorded values must not cross the BFF boundary.
    expect(s).not.toContain('tier-2');
    expect(s).not.toContain('Communication/chan-demo-1');
    expect(body.prompt.templateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('200: requested tools resolve through the mock binding table', async () => {
    const res = await reasoningPOST(req(REASONING, 'POST'));
    const body = (await res.json()) as ReasoningBody;
    expect(body.reasoning.toolRequests).toEqual(['person-context.read']);
    expect(body.toolBindings).toEqual([
      { tool: 'person-context.read', disposition: 'bound', providerKind: 'in-process' },
    ]);
  });

  it('a DRIFTED PROMPT is refused, AUDITED and CORRELATED — never a bare 500', async () => {
    promptDrift.on = true;
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(500);
    // The refusal the route exists to demonstrate must be traceable …
    expect(res.headers.get(CORRELATION_HEADER)).toBeTruthy();
    const body = await res.json();
    expectPhiSafe(body, 'drifted-prompt body');
    expect(JSON.stringify(body)).toContain('content-drift');
    // … and audited, with the refusal's own code, not swallowed by the framework.
    const failures = auditRows.filter(
      (r) => r.action === 'agents.reasoning.probe' && r.outcome === 'failure'
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.detail).toContain('content-drift');
    expect(failures[0]?.correlationId).toBe(res.headers.get(CORRELATION_HEADER));
  });

  it('the ledger workflowId is SERVER-MINTED, not the caller-supplied header', async () => {
    const attacker = 'x'.repeat(4096);
    const res = await reasoningPOST(
      new NextRequest(`${BASE}${REASONING}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CORRELATION_HEADER]: attacker },
      } as ConstructorParameters<typeof NextRequest>[1])
    );
    expect(res.status).toBe(200);
    // The inbound header still correlates the response/audit (that is its job) …
    expect(res.headers.get(CORRELATION_HEADER)).toBe(attacker);
    const succeeded = auditRows.filter((r) => r.outcome === 'success');
    expect(succeeded.length).toBeGreaterThan(0);
    // … but it must not become the ledger's run key. The probe's run id is minted
    // server-side and reported, so a caller cannot choose a ledger key.
    const body = (await res.json()) as ReasoningBody & { runId?: string };
    expect(body.runId).toBeTruthy();
    expect(body.runId).not.toBe(attacker);
  });

  it('503 (PHI-safe) when the reasoning seam is in production — fails closed', async () => {
    setSessionDataMode('agentReasoner', 'production');
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expectPhiSafe(body, '503 body');
    expect(JSON.stringify(body)).toContain('SEAM_NOT_CONFIGURED');
  });

  it('production tool binding is REFUSED, not silently served from the mock table', async () => {
    setSessionDataMode('agentToolBinding', 'production');
    const res = await reasoningPOST(req(REASONING, 'POST'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReasoningBody;
    expect(body.seamModes.agentToolBinding).toBe('production');
    expect(body.toolBindings).toEqual([
      { tool: 'person-context.read', disposition: 'refused', code: 'SEAM_NOT_CONFIGURED' },
    ]);
  });
});

describe('prompt template pins are recomputed, not trusted', () => {
  it('every committed template pinnedHash equals sha256(text)', () => {
    expect(promptTemplates.templates.length).toBeGreaterThan(0);
    for (const t of promptTemplates.templates) {
      const actual = `sha256:${createHash('sha256').update(t.text, 'utf8').digest('hex')}`;
      expect(
        actual,
        `${t.id}@${t.version}: text no longer matches its pin — re-pin it (this is the ` +
          'gate that stops an unreviewed prompt edit reaching a request)'
      ).toBe(t.pinnedHash);
    }
  });
});

describe('GET /api/ops/agents/authority', () => {
  it('401 (PHI-safe) when unauthenticated', async () => {
    resetJar();
    const res = await authorityGET(req(AUTHORITY));
    expect(res.status).toBe(401);
    expectPhiSafe(await res.json(), '401 body');
  });

  it('401 (fail-CLOSED) when the session read THROWS, never treated as authenticated', async () => {
    signIn('admin');
    failCookiesOnCall(1);
    const res = await authorityGET(req(AUTHORITY));
    expect(res.status).toBe(401);
    expectPhiSafe(await res.json(), '401 body');
  });

  it('403 (PHI-safe) for a non-ops, non-auditor role', async () => {
    signIn('provider');
    const res = await authorityGET(req(AUTHORITY));
    expect(res.status).toBe(403);
    expectPhiSafe(await res.json(), '403 body');
  });

  it('200: compiles the committed definitions with no semantic drift', async () => {
    const res = await authorityGET(req(AUTHORITY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthorityBody;
    expectPhiSafe(body, '200 body');
    expect(body.attestation.drifted).toEqual([]);
    expect(body.agents.length).toBeGreaterThanOrEqual(4);
    expect(body.routes.length).toBeGreaterThan(0);
    expect(body.agents.every((a) => a.toolCount > 0)).toBe(true);
  });

  it('200: labels the drift check SEMANTIC and never claims byte equality', async () => {
    const res = await authorityGET(req(AUTHORITY));
    const body = (await res.json()) as AuthorityBody;
    expect(body.attestation.driftCheck).toBe('semantic');
    // The payload must point at the gate that DOES prove bytes …
    expect(body.attestation.byteLevelGate).toMatch(/adl:check/);
    // … and must not assert byte equality anywhere in it.
    expect(JSON.stringify(body.attestation)).not.toMatch(/byteEqual|"byte"|bytes-equal/);
  });

  it('200: an auditor may read the attestation', async () => {
    signIn('auditor');
    const res = await authorityGET(req(AUTHORITY));
    expect(res.status).toBe(200);
  });
});
