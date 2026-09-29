/**
 * Route coverage (conventions §14) for the two WPCO agent-ops BFF surfaces that
 * close the E14 wired-path gap on the agent tranche:
 *
 *   POST /api/ops/agents/actions   — the agent demo run + its disclosure record.
 *   GET  /api/ops/agents/bindings  — the live tool-binding / fail-closed report.
 *
 * AUTHZ IS DRIVEN THROUGH THE REAL SESSION LAYER. Every case below presents a
 * REAL sealed session cookie and lets the real `getSessionAuthContext()` +
 * `getPrincipal()` decide. Nothing here mocks the auth-context factory, because a
 * mock-only field that passes an authz gate proves the gate only against itself:
 * the earlier version of this suite returned a `role` the `SessionAuthContext`
 * type did not have, so the 200 path existed in the tests and nowhere else.
 *
 * Each route: 401 unauthenticated · 401 when the session READ THROWS (the
 * fail-closed catch, which is otherwise unpinned) · 403 wrong role · 200 for ops
 * AND for auditor · a PHI-safe body asserted against PATTERNS over the WHOLE
 * body, never by eye.
 *
 * The 200 cases also pin the HONEST numbers: the production binding table ships
 * `{"bindings": []}` by design, so 11 granted / 0 bound / 11 fail-closed is the
 * expected answer and a future change that dresses it up turns this suite red.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Role } from '@/lib/authz/guard';
import * as clock from '@/lib/clock';
import { makeRequest, readJson, expectPhiSafeBody } from './_helpers';
import {
  failCookiesOnCall,
  giveSession,
  resetJar,
  useDevMockEnv,
  useRealAuthEnv,
} from './_sessionCookie';

// The ONLY seam mocked: the cookie jar. The session layer, the principal model and
// both route gates are the real ones.
vi.mock('next/headers', async () => (await import('./_sessionCookie')).nextHeadersMock());

import { POST as actionsPOST } from '@/app/api/ops/agents/actions/route';
import { GET as bindingsGET } from '@/app/api/ops/agents/bindings/route';
import { getSessionAuthContext, startDevSession } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';

const ACTIONS = '/api/ops/agents/actions';
const BINDINGS = '/api/ops/agents/bindings';

/** Every tool the shipped agent manifests grant (tools/seams/verify.mjs agrees). */
const GRANTED_COUNT = 11;

/** A code is lower-kebab; free text (spaces, punctuation, prose) cannot match. */
const CODE_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;
/**
 * A pseudonymous reference — FHIR-style `Type/id`, `org/id`, or a scoped demo key.
 * No whitespace and no comma, so a person's name, a DOB or a free-text clinical
 * string cannot satisfy it; this is the pattern that stands in for eyeballing.
 */
const REF_PATTERN = /^[A-Za-z0-9_.:#/-]+$/;
/** Keys that would carry a member value or free-text clinical content. */
const MEMBER_OR_FREETEXT_KEY =
  /"(subjectId|memberId|memberRef|patient|name|given|family|note|text|valueString|diagnosis|narrative)"\s*:/;

/** Give the request a live session acting in `role` (a real sealed cookie). */
function signIn(role: Role): void {
  giveSession({ fhirUser: 'Practitioner/ops-dev', role }, clock.now());
}

function record(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function rows(value: unknown): Record<string, unknown>[] {
  expect(Array.isArray(value)).toBe(true);
  return (value as unknown[]).map(record);
}

beforeEach(() => {
  resetJar();
  useRealAuthEnv();
  signIn('payer-ops');
  setSessionDataMode('agentRuntime', 'mock');
  vi.clearAllMocks();
});
afterEach(() => {
  clearSessionDataModes();
  resetJar();
});

/**
 * The exact input the ops gate reads, pinned end-to-end: a sealed cookie →
 * `getSessionAuthContext()` → `getPrincipal()`. These are the contract the four
 * routes' `isOpsPrincipal(...) || role === 'auditor'` gate depends on, so each rule
 * is asserted where it is decided rather than only through a route's status code.
 */
describe('the session role the ops gate reads', () => {
  it('carries a recognised IdP role through to the principal', async () => {
    signIn('payer-ops');
    const ctx = await getSessionAuthContext();
    expect(ctx?.role).toBe('payer-ops');
    expect(getPrincipal(ctx).role).toBe('payer-ops');
  });

  it('a session with NO role claim still derives pa-reviewer from fhirUser', async () => {
    giveSession({ fhirUser: 'Practitioner/ops-dev' }, clock.now());
    const ctx = await getSessionAuthContext();
    expect(ctx?.role).toBeNull();
    expect(getPrincipal(ctx).role).toBe('pa-reviewer');
  });

  it('an UNRECOGNISED role fails CLOSED to member — it never falls through to fhirUser', async () => {
    // A role outside the vocabulary is a misconfigured claim. It must not be
    // ignored in favour of the fhirUser derivation, which would PROMOTE this
    // Practitioner session to pa-reviewer on the strength of a rejected string.
    giveSession({ fhirUser: 'Practitioner/ops-dev', role: 'super-admin' as Role }, clock.now());
    // The session layer drops it at the boundary …
    expect((await getSessionAuthContext())?.role).toBeNull();
    // … and the principal model, handed the raw value directly, fails closed too.
    const principal = getPrincipal({
      fhirUser: 'Practitioner/ops-dev',
      role: 'super-admin' as Role,
    });
    expect(principal.role).toBe('member');
    expect(principal.authorizedMemberScope.kind).toBe('self');
  });

  it('the offline DEV session carries an ops role (the surfaces are reachable)', async () => {
    resetJar();
    useDevMockEnv();
    expect(await startDevSession()).toBe(true);
    expect(getPrincipal(await getSessionAuthContext()).role).toBe('payer-ops');
  });
});

describe('POST /api/ops/agents/actions', () => {
  it('401 (PHI-safe) when unauthenticated', async () => {
    resetJar(); // no session cookie at all
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('401 (fail-CLOSED) when the session read THROWS, never treated as authenticated', async () => {
    signIn('payer-ops'); // a valid ops session exists …
    failCookiesOnCall(1); // … but the session store is unavailable on the auth read
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('403 (PHI-safe) when the principal is not ops/auditor (pa-reviewer denied)', async () => {
    signIn('pa-reviewer');
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });

  it('403 when the session carries NO role claim (fails closed to member)', async () => {
    // A Practitioner session with no IdP role is a pa-reviewer, not ops.
    giveSession({ fhirUser: 'Practitioner/ops-dev' }, clock.now());
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('200 for an auditor: reports the seam and the data mode HONESTLY', async () => {
    signIn('auditor');
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = record(await readJson(res));
    expect(body.seam).toBe('agentRuntime');
    // Mock mode must never be labelled production, and must not claim emergence.
    expect(body.dataMode).toBe('mock');
    expect(body.emergent).toBe(false);
    const actions = rows(body.actions);
    expect(body.actionCount).toBe(actions.length);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('200 for the OFFLINE DEV SESSION — the ops surface is reachable by a real caller', async () => {
    resetJar();
    useDevMockEnv();
    expect(await startDevSession()).toBe(true);
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(200);
  });

  it('mock mode says plainly that authored actions carry no disclosure ledger', async () => {
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    const body = record(await readJson(res));
    const disclosures = record(body.disclosures);
    expect(disclosures.available).toBe(false);
    expect(disclosures.unavailableReason).toBe('authored-actions-carry-no-disclosure-ledger');
    expect(disclosures.decisionCount).toBe(0);
    expect(disclosures.refusalCount).toBe(0);
  });

  it('production mode runs the REAL agents and returns the run disclosure record', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = record(await readJson(res));
    expect(body.dataMode).toBe('production');
    expect(body.emergent).toBe(true);
    const disclosures = record(body.disclosures);
    expect(disclosures.available).toBe(true);
    expect(disclosures.unavailableReason).toBeUndefined();
    const decisions = rows(disclosures.decisions);
    expect(disclosures.decisionCount).toBe(decisions.length);
    // The plane actually decided something — otherwise this route would be
    // reporting an empty ledger as a success.
    expect(decisions.length).toBeGreaterThan(0);
    expect(disclosures.permitCount).toBe(decisions.filter((d) => d.outcome === 'permit').length);
    expect(disclosures.denyCount).toBe(decisions.filter((d) => d.outcome === 'deny').length);
  });

  it('PHI-safe: the WHOLE body carries no member key — permitted actions included', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    const body = record(await readJson(res));
    expectPhiSafeBody(body, 'actions body');
    // The scan is applied to the ENTIRE payload, not just `disclosures`. The
    // earlier version scoped it to the ledger, which is exactly how the action
    // rows kept emitting `memberId` while the header claimed it was dropped.
    expect(JSON.stringify(body)).not.toMatch(MEMBER_OR_FREETEXT_KEY);
    const disclosures = record(body.disclosures);
    for (const d of rows(disclosures.decisions)) {
      expect(String(d.dataClass)).toMatch(CODE_PATTERN);
      expect(String(d.purposeOfUse)).toMatch(CODE_PATTERN);
      expect(String(d.outcome)).toMatch(CODE_PATTERN);
      if (d.reasonCode !== undefined) expect(String(d.reasonCode)).toMatch(CODE_PATTERN);
      expect(String(d.requestingAgentId)).toMatch(REF_PATTERN);
      expect(String(d.recipientOrgId)).toMatch(REF_PATTERN);
    }
    for (const r of rows(disclosures.refusals)) {
      expect(String(r.reason)).toMatch(CODE_PATTERN);
      expect(String(r.signalId)).toMatch(REF_PATTERN);
      expect(String(r.agentId)).toMatch(REF_PATTERN);
    }
  });

  it('PHI-safe: an action row carries agent/task/outcome + refs, and NO subject', async () => {
    const res = await actionsPOST(makeRequest(ACTIONS, { method: 'POST' }));
    const body = record(await readJson(res));
    expectPhiSafeBody(body, 'actions body');
    expect(JSON.stringify(body)).not.toMatch(MEMBER_OR_FREETEXT_KEY);
    for (const a of rows(body.actions)) {
      // The subject is dropped from PERMITTED actions exactly as it is from
      // denial rows — one posture, both directions.
      expect(a.memberId).toBeUndefined();
      expect(String(a.agentId)).toMatch(REF_PATTERN);
      expect(String(a.taskKind)).toMatch(CODE_PATTERN);
      expect(String(a.actionType)).toMatch(CODE_PATTERN);
      expect(String(a.outcome)).toMatch(CODE_PATTERN);
      for (const ref of Object.values(record(a.refs))) expect(String(ref)).toMatch(REF_PATTERN);
    }
  });
});

describe('GET /api/ops/agents/bindings', () => {
  it('401 (PHI-safe) when unauthenticated', async () => {
    resetJar();
    const res = await bindingsGET(makeRequest(BINDINGS));
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('401 (fail-CLOSED) when the session read THROWS, never treated as authenticated', async () => {
    signIn('payer-ops');
    failCookiesOnCall(1);
    const res = await bindingsGET(makeRequest(BINDINGS));
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('403 (PHI-safe) when the principal is not ops/auditor (member denied)', async () => {
    signIn('member');
    const res = await bindingsGET(makeRequest(BINDINGS));
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });

  it('200: an auditor may read the tool-binding report', async () => {
    signIn('auditor');
    const res = await bindingsGET(makeRequest(BINDINGS));
    expect(res.status).toBe(200);
    expect(record(await readJson(res)).seam).toBe('tool-binding');
  });

  it('200: reports the granted tool set derived from the agent manifests', async () => {
    const res = await bindingsGET(makeRequest(BINDINGS));
    expect(res.status).toBe(200);
    const body = record(await readJson(res));
    expect(body.seam).toBe('tool-binding');
    expect(body.grantedCount).toBe(GRANTED_COUNT);
    const granted = body.grantedTools as string[];
    expect(granted).toHaveLength(GRANTED_COUNT);
    expect([...granted].sort()).toEqual(granted); // stable, sorted output
    for (const tool of granted) expect(tool).toMatch(CODE_PATTERN);
  });

  it('the mock table binds every granted tool (nothing fails closed in the demo)', async () => {
    const res = await bindingsGET(makeRequest(BINDINGS));
    const mock = record(record(record(await readJson(res)).tables).mock);
    expect(mock.parsed).toBe(true);
    expect(mock.mode).toBe('mock');
    expect(mock.boundCount).toBe(GRANTED_COUNT);
    expect(mock.failClosed).toEqual([]);
    expect(mock.failClosedCount).toBe(0);
    expect(mock.bindingsOutsideGrants).toEqual([]);
    expect(mock.mismatches).toEqual([]);
  });

  it('the production table ships UNBOUND: 11 granted, 0 bound, all fail closed', async () => {
    const res = await bindingsGET(makeRequest(BINDINGS));
    const body = record(await readJson(res));
    const production = record(record(body.tables).production);
    expect(production.parsed).toBe(true);
    expect(production.mode).toBe('production');
    expect(production.boundCount).toBe(0);
    expect(production.boundTools).toEqual([]);
    expect(production.failClosedCount).toBe(GRANTED_COUNT);
    expect(production.failClosed).toEqual(body.grantedTools);
    // No binding tries to create authority — the mismatch is the UNBOUND one.
    expect(production.bindingsOutsideGrants).toEqual([]);
    const mismatches = rows(production.mismatches);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.invariant).toBe('all-grants-bound');
    expect(mismatches[0]?.code).toBe('SEAM_NOT_CONFIGURED');
    // The route does NOT dress this up as ready.
    expect(body.productionReady).toBe(false);
  });

  it('PHI-safe: the report carries tool ids, counts and seam codes only', async () => {
    const res = await bindingsGET(makeRequest(BINDINGS));
    const body = record(await readJson(res));
    expectPhiSafeBody(body, 'bindings body');
    expect(JSON.stringify(body)).not.toMatch(MEMBER_OR_FREETEXT_KEY);
    for (const table of [
      record(record(body.tables).mock),
      record(record(body.tables).production),
    ]) {
      for (const tool of table.boundTools as string[]) expect(tool).toMatch(CODE_PATTERN);
      for (const tool of table.failClosed as string[]) expect(tool).toMatch(CODE_PATTERN);
      for (const m of rows(table.mismatches)) {
        expect(String(m.code)).toMatch(/^SEAM_[A-Z_]+$/);
        expect(String(m.invariant)).toMatch(CODE_PATTERN);
      }
    }
  });
});
