import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * SMART-on-FHIR session & server-held token manager (plan F-3).
 *
 * REPLACES the browser-side mock in src/lib/services/smartAuth.ts. Tokens live in
 * an encrypted, httpOnly cookie — the browser NEVER sees an access token
 * (plan §1.4 guardrail). PKCE is used for the interactive authorization-code flow
 * against WSO2 Identity Server.
 *
 * WSO2 wiring is real but requires the OAuth app from ENV-1/ENV-3. When WSO2 is
 * not configured and ALLOW_DEV_MOCK_AUTH=true, a clearly-labelled dev token is
 * returned so the app runs offline — this MUST be disabled before any real use.
 *
 * Server-only: import from src/app/api/** or src/lib/server/** only.
 */
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { serverEnv, requireWso2, requireSessionSecret, type ServerEnv } from './env';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

const SESSION_COOKIE = 'rhtp_smart_session';
const PKCE_COOKIE = 'rhtp_pkce';

export interface SessionData {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  scope: string;
  patient?: string; // launch/patient context
  fhirUser?: string;
  expiresAt: number; // epoch ms
}

// ---- cookie crypto (AES-256-GCM) -------------------------------------------

function key(env: ServerEnv): Buffer {
  // R5: fail closed. requireSessionSecret throws in production when SESSION_SECRET
  // is unset (no public default -> no cookie forgery), and yields the labelled dev
  // secret ONLY in explicit dev-mock mode. The cookie key is NEVER a shared constant.
  return crypto.createHash('sha256').update(requireSessionSecret(env)).digest();
}

function seal(value: object, env: ServerEnv): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(env), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function open<T>(sealed: string, env: ServerEnv): T | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(env), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return null;
  }
}

// ---- PKCE -------------------------------------------------------------------

function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ---- public API -------------------------------------------------------------

/** Build the authorize URL and stash the PKCE verifier + state in short-lived cookies. */
export async function beginSmartLaunch(opts?: { aud?: string; scope?: string }): Promise<{
  authorizeUrl: string;
}> {
  const env = serverEnv();
  requireWso2(env);
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');

  const jar = await cookies();
  jar.set(PKCE_COOKIE, seal({ verifier, state, nonce }, env), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  const url = new URL(env.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.clientId);
  url.searchParams.set('redirect_uri', env.redirectUri);
  url.searchParams.set('scope', opts?.scope ?? env.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (opts?.aud) url.searchParams.set('aud', opts.aud);
  return { authorizeUrl: url.toString() };
}

/** Exchange the authorization code for tokens and set the encrypted session cookie. */
export async function completeSmartCallback(code: string, state: string): Promise<void> {
  const env = serverEnv();
  requireWso2(env);
  const jar = await cookies();
  const pk = open<{ verifier: string; state: string }>(jar.get(PKCE_COOKIE)?.value ?? '', env);
  if (!pk || pk.state !== state) throw new Error('Invalid PKCE state — possible CSRF');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.redirectUri,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code_verifier: pk.verifier,
  });
  const res = await fetch(env.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const tok = (await res.json()) as TokenResponse;
  await writeSession(tok, env);
  jar.delete(PKCE_COOKIE);
}

/** Server-only: return a valid access token, refreshing if near expiry. */
export async function getAccessToken(): Promise<string> {
  const env = serverEnv();
  const jar = await cookies();
  const session = open<SessionData>(jar.get(SESSION_COOKIE)?.value ?? '', env);

  if (session && session.expiresAt - clock.now() > 30_000) return session.accessToken;

  if (session?.refreshToken && env.tokenUrl) {
    const refreshed = await refresh(session.refreshToken, env);
    if (refreshed) return refreshed;
  }

  if (!env.tokenUrl && env.allowDevMockAuth) {
    // DEV ONLY — no WSO2 configured. Do not ship. (plan F-3 TODO)
    return 'dev-mock-access-token';
  }
  throw new Error('No valid SMART session — sign in via /api/auth/login');
}

/** client_credentials token for system-to-system flows (e.g. bulk export). */
export async function getSystemToken(): Promise<string> {
  const env = serverEnv();
  requireWso2(env);
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'system/*.read' });
  const res = await fetch(env.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64'),
    },
    body,
  });
  if (!res.ok) throw new Error(`client_credentials failed: ${res.status}`);
  const tok = (await res.json()) as TokenResponse;
  return tok.access_token;
}

/** Is there a live session? (safe to expose to the browser — boolean only) */
export async function isAuthenticated(): Promise<boolean> {
  const env = serverEnv();
  const jar = await cookies();
  const session = open<SessionData>(jar.get(SESSION_COOKIE)?.value ?? '', env);
  if (session && session.expiresAt > clock.now()) return true;
  // Dev offline path: no WSO2 configured + ALLOW_DEV_MOCK_AUTH=true → auto-establish a dev session
  if (!env.tokenUrl && env.allowDevMockAuth) {
    await startDevSession();
    return true;
  }
  return false;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The launch/patient context of the current session (safe: an id, not a token). */
export async function getSessionPatient(): Promise<string | null> {
  const env = serverEnv();
  const jar = await cookies();
  const session = open<SessionData>(jar.get(SESSION_COOKIE)?.value ?? '', env);
  return session?.patient ?? null;
}

/**
 * Non-secret session facts the principal role model derives from (ids / scopes /
 * references, never a token). Safe to pass to lib/authz/principal.getPrincipal.
 */
export interface SessionAuthContext {
  patient: string | null;
  fhirUser: string | null;
  scope: string | null;
}

/** The acting session's authorization context (for lib/authz/principal). */
export async function getSessionAuthContext(): Promise<SessionAuthContext | null> {
  const env = serverEnv();
  const jar = await cookies();
  const session = open<SessionData>(jar.get(SESSION_COOKIE)?.value ?? '', env);
  if (session && session.expiresAt > clock.now()) {
    return {
      patient: session.patient ?? null,
      fhirUser: session.fhirUser ?? null,
      scope: session.scope ?? null,
    };
  }
  // Dev offline path: mirror isAuthenticated's auto-established dev session.
  if (!env.tokenUrl && env.allowDevMockAuth) {
    await startDevSession();
    const dev = open<SessionData>((await cookies()).get(SESSION_COOKIE)?.value ?? '', env);
    return dev
      ? { patient: dev.patient ?? null, fhirUser: dev.fhirUser ?? null, scope: dev.scope ?? null }
      : null;
  }
  return null;
}

export async function setDevSessionPatient(patient: string): Promise<boolean> {
  const env = serverEnv();
  if (env.tokenUrl || !env.allowDevMockAuth) return false;
  return startDevSession(patient);
}

/**
 * DEV ONLY — establish a local session WITHOUT WSO2 so the integrated offline
 * install renders real FHIR data. Only works when WSO2 is unconfigured AND
 * ALLOW_DEV_MOCK_AUTH=true. Never fires in production.
 */
export async function startDevSession(patient = DEMO_MEMBER_ID): Promise<boolean> {
  const env = serverEnv();
  if (env.tokenUrl || !env.allowDevMockAuth) return false;
  const jar = await cookies();
  const session: SessionData = {
    accessToken: 'dev-mock-access-token',
    scope: env.scope,
    patient,
    fhirUser: 'Practitioner/dev',
    expiresAt: clock.now() + 8 * 60 * 60 * 1000,
  };
  jar.set(SESSION_COOKIE, seal(session, env), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return true;
}

// ---- internals --------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in?: number;
  patient?: string;
  fhirUser?: string;
}

async function writeSession(tok: TokenResponse, env: ServerEnv): Promise<void> {
  const jar = await cookies();
  const session: SessionData = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    idToken: tok.id_token,
    scope: tok.scope ?? env.scope,
    patient: tok.patient,
    fhirUser: tok.fhirUser,
    expiresAt: clock.now() + (tok.expires_in ?? 3600) * 1000,
  };
  jar.set(SESSION_COOKIE, seal(session, env), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

async function refresh(refreshToken: string, env: ServerEnv): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
    });
    const res = await fetch(env.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const tok = (await res.json()) as TokenResponse;
    await writeSession(tok, env);
    return tok.access_token;
  } catch {
    return null;
  }
}
