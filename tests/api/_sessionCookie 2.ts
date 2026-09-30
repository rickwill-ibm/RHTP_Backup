/**
 * Real-session-layer harness for BFF route tests.
 *
 * WHY THIS EXISTS. A route test that mocks `getSessionAuthContext()` and returns a
 * `role` proves nothing about authorization: the mock supplies the very field the
 * gate reads, so the gate passes on a field no real session carries. That is the
 * defect this module removes. Here we mock ONLY `next/headers` — the cookie jar,
 * the one true I/O edge of the session layer — and let the REAL
 * `smartSession.getSessionAuthContext()` open a REAL sealed session cookie and the
 * REAL `authz/principal.getPrincipal()` derive the role from it.
 *
 * The cookie is sealed with the same AES-256-GCM scheme and the same key
 * derivation (`sha256(SESSION_SECRET)`) that `smartSession.seal()` uses, so the
 * server accepts it exactly as it would accept one it minted itself. A test
 * therefore cannot grant itself a role the session format cannot carry.
 *
 * `throwOnCalls` reproduces the other real failure mode: a session read that
 * THROWS. It is what pins the fail-closed `.catch()` on every authz boundary —
 * without it, flipping `catch(() => false)` to `catch(() => true)` changes no test.
 */
import crypto from 'crypto';
import type { Role } from '@/lib/authz/guard';

/** The cookie name smartSession seals the session into. */
const SESSION_COOKIE = 'rhtp_smart_session';

/**
 * The SESSION_SECRET these tests configure. Setting it (with a WSO2 tokenUrl also
 * set) puts the session layer on its PRODUCTION-shaped path: dev-mock auth is
 * impossible, so a session exists only because a real sealed cookie was presented.
 */
export const TEST_SESSION_SECRET = 'route-test-session-secret-not-a-real-key';

/** The subset of smartSession's SessionData a route test needs to control. */
export interface TestSession {
  patient?: string;
  fhirUser?: string;
  /** The IdP-asserted role claim carried by the session. */
  role?: Role;
  /** Epoch ms; default is 1h ahead of the injected clock. */
  expiresAt?: number;
  scope?: string;
}

function sealKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/** Seal a session the way smartSession.seal() does — same cipher, same key. */
export function sealSession(session: object, secret = TEST_SESSION_SECRET): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealKey(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

/** The in-memory cookie jar the mocked `next/headers` serves. */
export const jar = {
  cookies: new Map<string, string>(),
  /**
   * 1-based ordinals of `cookies()` calls that must THROW. `isAuthenticated()` and
   * `getSessionAuthContext()` each take one call, in that order, so {1} fails the
   * auth read and {2} fails only the auth-context read.
   */
  throwOnCalls: new Set<number>(),
  calls: 0,
};

/** Clear the jar and the failure injection between tests. */
export function resetJar(): void {
  jar.cookies.clear();
  jar.throwOnCalls.clear();
  jar.calls = 0;
}

/** Put a live, sealed session in the jar — the REAL cookie the server would read. */
export function giveSession(session: TestSession, nowMs = Date.now()): void {
  jar.cookies.set(
    SESSION_COOKIE,
    sealSession({
      accessToken: 'test-access-token',
      scope: session.scope === undefined ? 'launch openid fhirUser' : session.scope,
      expiresAt: session.expiresAt === undefined ? nowMs + 3_600_000 : session.expiresAt,
      ...(session.patient === undefined ? {} : { patient: session.patient }),
      ...(session.fhirUser === undefined ? {} : { fhirUser: session.fhirUser }),
      ...(session.role === undefined ? {} : { role: session.role }),
    })
  );
}

/** Make the Nth `cookies()` call reject (a session store that is unavailable). */
export function failCookiesOnCall(...ordinals: number[]): void {
  for (const n of ordinals) jar.throwOnCalls.add(n);
}

/**
 * Factory for `vi.mock('next/headers', ...)`. Only the three jar methods
 * smartSession uses are implemented — a route that reached for anything else
 * would fail loudly rather than silently get a stub.
 */
export function nextHeadersMock(): { cookies: () => Promise<unknown> } {
  return {
    cookies: async (): Promise<unknown> => {
      jar.calls += 1;
      if (jar.throwOnCalls.has(jar.calls)) {
        throw new Error('session cookie store unavailable');
      }
      await Promise.resolve();
      return {
        get: (name: string): { name: string; value: string } | undefined => {
          const value = jar.cookies.get(name);
          return value === undefined ? undefined : { name, value };
        },
        set: (name: string, value: string): void => {
          jar.cookies.set(name, value);
        },
        delete: (name: string): void => {
          jar.cookies.delete(name);
        },
      };
    },
  };
}

/**
 * Put the session layer on its production-shaped path: a real SESSION_SECRET and a
 * configured WSO2 tokenUrl, so `!tokenUrl && allowDevMockAuth` — the dev-mock
 * double-gate — can never fire and no dev session can be auto-established.
 */
export function useRealAuthEnv(): void {
  process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.WSO2_TOKEN_URL = 'https://wso2.test.invalid/oauth2/token';
  process.env.ALLOW_DEV_MOCK_AUTH = 'false';
}

/** Put the session layer on the OFFLINE dev-mock path (no WSO2, flag explicitly on). */
export function useDevMockEnv(): void {
  delete process.env.SESSION_SECRET;
  delete process.env.WSO2_TOKEN_URL;
  process.env.ALLOW_DEV_MOCK_AUTH = 'true';
}
