/**
 * Shared helpers for BFF route tests (AI-CODING-CONVENTIONS §14).
 *
 * House pattern: import the route file's exported GET/POST directly, invoke it
 * with a constructed NextRequest, and stub the session/authz seams via vi.mock
 * in each test file using the factories below:
 *
 *   vi.mock('@/lib/server/smartSession', async () =>
 *     (await import('./_helpers')).smartSessionMock());
 *   vi.mock('@/lib/authz/guard', async () =>
 *     (await import('./_helpers')).guardMock());
 *
 * Dev-mock mode (offline stub data) is driven by the real env switch the
 * routes read (ALLOW_DEV_MOCK_AUTH) - no route code is altered to be testable.
 */
import { NextRequest } from 'next/server';
import { vi, expect } from 'vitest';
import os from 'os';
import path from 'path';

// Audit events emitted by routes under test go to a temp sink, never the repo.
process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-route-test-audit');

export const BASE = 'http://localhost:4029';

export interface RequestOpts {
  method?: string;
  /** JSON-serialized body. */
  body?: unknown;
  /** Verbatim body - for malformed-JSON cases. Wins over `body`. */
  rawBody?: string;
  headers?: Record<string, string>;
}

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

/** Build a NextRequest the way the browser would hit the BFF. */
export function makeRequest(pathname: string, opts: RequestOpts = {}): NextRequest {
  const { method = 'GET', body, rawBody, headers = {} } = opts;
  const init: NextRequestInit = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (rawBody !== undefined) init.body = rawBody;
  else if (body !== undefined) init.body = JSON.stringify(body);
  return new NextRequest(`${BASE}${pathname}`, init);
}

/** Parse a route response body as JSON. */
export async function readJson(res: Response): Promise<unknown> {
  return (await res.json()) as unknown;
}

/** Second argument for dynamic routes: routeParams({ id: 'x' }). */
export function routeParams<T>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

// ── Session state + mock (seam: @/lib/server/smartSession) ──────────────────

export const sessionState = {
  authenticated: true,
  patient: 'MARIA_SD_001' as string | null,
  devSessionOk: true,
  // Default principal is a reviewer (Practitioner) with org-wide scope — this
  // mirrors the demo's reviewer workflow and the routes' prior hardcoded
  // role:'pa-reviewer', so existing cross-member ops reads stay green. A member-
  // scoped session sets fhirUser to 'Patient/<id>' (self-only) instead.
  fhirUser: 'Practitioner/reviewer-dev' as string | null,
  scope: 'launch openid fhirUser' as string | null,
  panel: null as string[] | null,
};

export function resetSessionState(): void {
  sessionState.authenticated = true;
  sessionState.patient = 'MARIA_SD_001';
  sessionState.devSessionOk = true;
  sessionState.fhirUser = 'Practitioner/reviewer-dev';
  sessionState.scope = 'launch openid fhirUser';
  sessionState.panel = null;
}

/** Singleton mock fns so tests can assert calls / override per test. */
export const smartSession = {
  isAuthenticated: vi.fn(async () => sessionState.authenticated),
  getSessionPatient: vi.fn(async () => sessionState.patient),
  getSessionAuthContext: vi.fn(async () =>
    sessionState.authenticated
      ? { patient: sessionState.patient, fhirUser: sessionState.fhirUser, scope: sessionState.scope, panel: sessionState.panel }
      : null
  ),
  setDevSessionPatient: vi.fn(async (_patient: string) => sessionState.devSessionOk),
  startDevSession: vi.fn(async (_patient?: string) => sessionState.devSessionOk),
  beginSmartLaunch: vi.fn(async (): Promise<{ authorizeUrl: string }> => {
    throw new Error('WSO2 OAuth not configured');
  }),
  completeSmartCallback: vi.fn(async (_code: string, _state: string) => undefined),
  logout: vi.fn(async () => undefined),
  getAccessToken: vi.fn(async () => 'test-access-token'),
  getSystemToken: vi.fn(async () => 'test-system-token'),
};

export function smartSessionMock(): typeof smartSession {
  return smartSession;
}

// ── Authz guard state + mock (seam: @/lib/authz/guard) ──────────────────────

export const guardState = {
  deny: false,
  reason: 'purpose "operations" not permitted for role "member"',
};

export function resetGuardState(): void {
  guardState.deny = false;
}

export function guardMock(): {
  canReadMemberData: ReturnType<typeof vi.fn>;
} {
  return {
    canReadMemberData: vi.fn(() =>
      guardState.deny
        ? { allow: false, reason: guardState.reason, elevatedAudit: false }
        : { allow: true, reason: 'permitted (test default)', elevatedAudit: false }
    ),
  };
}

// ── Env switches the routes actually read ────────────────────────────────────

/** Toggle dev-mock (offline stub) mode exactly as the routes see it. */
export function setDevMock(on: boolean): void {
  process.env.ALLOW_DEV_MOCK_AUTH = on ? 'true' : 'false';
}

/** Restore all env switches these tests touch to their repo defaults. */
export function resetRouteEnv(): void {
  // Explicit mock opt-in — mirrors the demo/e2e config (playwright.config.ts sets
  // ALLOW_DEV_MOCK_AUTH=true). The flag now defaults OFF (U1 fix), so route tests
  // that exercise the offline stub path must opt in explicitly, exactly as a demo
  // deploy does. No real tokenUrl is set here, so the double-gate is satisfied.
  process.env.ALLOW_DEV_MOCK_AUTH = 'true';
  delete process.env.WSO2_TOKEN_URL; // keep the '!tokenUrl' half of the dev-mock gate true
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD;
  delete process.env.NEXT_PUBLIC_FLAG_NETWORK_ADEQUACY;
  delete process.env.WEBHOOK_SHARED_SECRET;
}

// ── PHI-safe body assertion (conventions §6.3 / §14) ─────────────────────────

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const DOB_PATTERN = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
const SEED_PATIENT_NAMES =
  /redhawk|dorothy|simmons|thunderbird|yellowhorse|maria\b/i;
const PHI_KEY_PATTERN = /"(birthDate|dob|ssn|address|telecom|mrn)"\s*:/;

/**
 * Fails when a response body carries obvious PHI: SSN-shaped strings,
 * DOB-shaped ISO dates, seed-patient names, or PHI-bearing JSON keys.
 * Apply to every error body (401/400/403/404/5xx) per conventions §14.
 */
export function expectPhiSafeBody(body: unknown, label = 'error body'): void {
  const s = JSON.stringify(body) ?? '';
  expect(s, `${label} must not contain an SSN-shaped value`).not.toMatch(SSN_PATTERN);
  expect(s, `${label} must not contain a DOB-shaped date`).not.toMatch(DOB_PATTERN);
  expect(s, `${label} must not contain a seed patient name`).not.toMatch(SEED_PATIENT_NAMES);
  expect(s, `${label} must not contain PHI-bearing keys`).not.toMatch(PHI_KEY_PATTERN);
}

/** Shorthand: assert status, read the JSON body, and check it is PHI-safe. */
export async function expectPhiSafeError(
  res: Response,
  status: number
): Promise<unknown> {
  expect(res.status).toBe(status);
  const body = await readJson(res);
  expectPhiSafeBody(body, `${status} body`);
  return body;
}
