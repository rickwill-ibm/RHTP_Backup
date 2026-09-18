/**
 * SMART on FHIR EHR-launch (OAuth 2.0 + PKCE).
 *
 * Real flow (live mode, e.g. Cerner / Oracle Health):
 *   1. EHR opens app with ?iss=<fhir-base>&launch=<token>
 *   2. discoverSmartConfiguration(iss) → authorization/token endpoints
 *   3. buildAuthorizationUrl(...) → redirect to EHR authorize endpoint
 *   4. EHR redirects back with ?code= → exchangeCodeForToken(...)
 *   5. Token response carries patient / encounter / fhirUser context
 *
 * Demo bypass: when no iss/launch params are present (or mock mode is on),
 * SmartLaunchHandler falls back to the simulated launch context, so the
 * app always works locally. This is the same flow Oracle Health's code
 * console requires — pointing at a Cerner sandbox is a config change.
 */

export interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities?: string[];
  code_challenge_methods_supported?: string[];
}

export interface SmartTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  patient?: string;
  encounter?: string;
  id_token?: string;
  refresh_token?: string;
  fhirUser?: string;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_SMART_CLIENT_ID ?? 'tcoc-client';
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_SMART_REDIRECT_URI ?? 'http://localhost:4030/md-smart-launch';
const SCOPE =
  process.env.NEXT_PUBLIC_SMART_SCOPE ??
  'launch launch/patient patient/*.read openid fhirUser offline_access';

const PKCE_STORAGE_KEY = 'smart_pkce_verifier';
const ISS_STORAGE_KEY = 'smart_iss';

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ── Launch steps ─────────────────────────────────────────────────────────────

/** Read ?iss=&launch= from the current URL — presence means a real EHR launch. */
export function readLaunchParams(): { iss: string; launch: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const iss = params.get('iss');
  const launch = params.get('launch');
  return iss && launch ? { iss, launch } : null;
}

/** Read ?code= callback param after the EHR redirects back. */
export function readAuthCode(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('code');
}

export async function discoverSmartConfiguration(iss: string): Promise<SmartConfiguration> {
  const res = await fetch(`${iss.replace(/\/$/, '')}/.well-known/smart-configuration`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`SMART discovery failed (${res.status}) at ${iss}`);
  return res.json();
}

/** Build the authorize URL and stash the PKCE verifier + iss for the callback leg. */
export async function buildAuthorizationUrl(
  config: SmartConfiguration,
  iss: string,
  launch: string
): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);
  sessionStorage.setItem(ISS_STORAGE_KEY, iss);

  const url = new URL(config.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('launch', launch);
  url.searchParams.set('aud', iss);
  url.searchParams.set('state', crypto.randomUUID());
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCodeForToken(
  config: SmartConfiguration,
  code: string
): Promise<SmartTokenResponse> {
  const verifier = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!verifier) throw new Error('PKCE verifier missing — launch flow was not initiated here');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  return res.json();
}

export function storedIss(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ISS_STORAGE_KEY);
}
