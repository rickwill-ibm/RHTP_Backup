/**
 * Server-only environment configuration for CMS-0057-F integration.
 *
 * SECURITY (plan §1.4): none of these keys use the NEXT_PUBLIC_ prefix, so they
 * are NEVER exposed to the browser bundle. Import this only from server code
 * (src/app/api/** or src/lib/server/**).
 */

export interface ServerEnv {
  /** APIM gateway FHIR base, e.g. https://localhost:8243/<ctx>/fhir/r4 */
  fhirGatewayBase: string;
  /** CDS Hooks gateway base */
  cdsGatewayBase: string;
  /** Bulk export gateway base */
  bulkGatewayBase: string;
  /** WSO2 IS OAuth2 endpoints */
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /**
   * Symmetric key used to encrypt the session cookie payload. Read RAW here (the
   * literal SESSION_SECRET, or '' when unset) — NEVER a public default. The
   * fail-closed resolution lives in requireSessionSecret(), which throws in
   * production when this is empty and only serves a labelled dev secret in
   * explicit dev-mock mode. Callers that seal/open cookies MUST go through
   * requireSessionSecret(env), never read this field directly. (R5 fix.)
   */
  sessionSecret: string;
  /**
   * Dev-only mock-auth opt-in. Defaults OFF (fail-closed). Even when true it is
   * IGNORED once real auth is configured (tokenUrl set) — see devMockEnabled()
   * and smartSession.ts, which both double-gate on `!tokenUrl`. A production
   * deploy with real auth therefore never serves the dev stubs.
   */
  allowDevMockAuth: boolean;
}

function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/**
 * The labelled dev session secret. Used ONLY in explicit dev-mock mode (real auth
 * NOT configured AND ALLOW_DEV_MOCK_AUTH=true) so the offline install can seal a
 * local cookie. Its name makes its status self-evident; it is NEVER the value in
 * production — requireSessionSecret() throws there instead. (R5 fix, mirrors the
 * U1 dev-mock-auth double-gate: a dev fallback is impossible once real auth is on.)
 */
export const DEV_SESSION_SECRET = 'dev-only-insecure-session-secret-DO-NOT-USE-IN-PROD';

/** Thrown when a cookie seal/open is attempted in production with no SESSION_SECRET. */
export class SessionSecretNotConfiguredError extends Error {
  constructor() {
    super(
      'SESSION_SECRET is not configured. The session cookie cannot be sealed ' +
        'without it — set SESSION_SECRET (server-only, no NEXT_PUBLIC_ prefix). ' +
        'A public default is refused: cookie forgery risk (R5). A labelled dev ' +
        'secret is available ONLY in explicit dev-mock mode (WSO2 unconfigured AND ' +
        'ALLOW_DEV_MOCK_AUTH=true).'
    );
    this.name = 'SessionSecretNotConfiguredError';
  }
}

/**
 * Read + validate server env. Throws only for the keys a given code path needs
 * (callers decide), so the app still boots for read-only/dev flows.
 */
export function serverEnv(): ServerEnv {
  return {
    fhirGatewayBase: opt('FHIR_GATEWAY_BASE', 'http://localhost:8080/fhir/r4'),
    cdsGatewayBase: opt('CDS_GATEWAY_BASE', 'http://localhost:9096'),
    bulkGatewayBase: opt('BULK_GATEWAY_BASE', 'http://localhost:8091/bulk'),
    authorizeUrl: opt('WSO2_AUTHORIZE_URL'),
    tokenUrl: opt('WSO2_TOKEN_URL'),
    clientId: opt('WSO2_CLIENT_ID'),
    clientSecret: opt('WSO2_CLIENT_SECRET'),
    redirectUri: opt('WSO2_REDIRECT_URI', 'http://localhost:4029/api/auth/callback'),
    scope: opt('WSO2_SCOPE', 'openid fhirUser launch/patient patient/*.read offline_access'),
    // RAW read — no public default (R5). '' when unset; requireSessionSecret()
    // does the fail-closed resolution at the point cookies are actually sealed.
    sessionSecret: opt('SESSION_SECRET'),
    // Fail-closed default: OFF unless an operator explicitly opts in. (U1 fix)
    allowDevMockAuth: opt('ALLOW_DEV_MOCK_AUTH', 'false').toLowerCase() === 'true',
  };
}

/**
 * Fail-closed resolution of the session secret (R5). Returns the configured
 * SESSION_SECRET when present. When absent, returns the labelled dev secret ONLY
 * in explicit dev-mock mode (real auth NOT configured AND ALLOW_DEV_MOCK_AUTH on)
 * — the exact double-gate the dev-mock auth path uses (U1). Otherwise THROWS, so
 * production can never seal a cookie under a shared public constant. Every cookie
 * seal/open goes through this, never the raw field.
 */
export function requireSessionSecret(env: ServerEnv = serverEnv()): string {
  if (env.sessionSecret) return env.sessionSecret;
  if (!env.tokenUrl && env.allowDevMockAuth) return DEV_SESSION_SECRET;
  throw new SessionSecretNotConfiguredError();
}

/** Assert the WSO2 OAuth keys are present; used by the real auth path. */
export function requireWso2(env: ServerEnv): void {
  const missing = (['authorizeUrl', 'tokenUrl', 'clientId', 'clientSecret'] as const).filter(
    (k) => !env[k]
  );
  if (missing.length) {
    throw new Error(
      `WSO2 OAuth not configured — missing: ${missing.join(', ')}. ` +
        `Set them in .env.local (server-only, no NEXT_PUBLIC_ prefix). See plan ENV-3.`
    );
  }
}

// ── Deployment / readiness keys (iteration 9 wave B) ─────────────────────────
// Appended block: the deployment-posture reader + a raw deployment-key reader
// the startup PREFLIGHT consumes. Server-only, no NEXT_PUBLIC_ prefix. The
// posture (development/staging/production) selects WHICH keys are required; the
// policy that maps seams and environments to required keys lives in
// src/lib/deploy/schema.ts. env.ts only READS raw values, it never decides
// readiness (the same separation serverEnv()/requireSessionSecret() keeps).

/** The deploy postures the preflight recognizes. */
export const DEPLOYMENT_ENV_NAMES = Object.freeze([
  'development',
  'staging',
  'production',
] as const);
export type DeploymentEnvName = (typeof DEPLOYMENT_ENV_NAMES)[number];

function isDeploymentEnvName(v: unknown): v is DeploymentEnvName {
  return typeof v === 'string' && (DEPLOYMENT_ENV_NAMES as readonly string[]).includes(v);
}

/**
 * Resolve the target deploy posture. Resolution order (first hit wins):
 *   1. DEPLOY_ENV (explicit, case-insensitive; the deployment-time control)
 *   2. NODE_ENV=production -> 'production'
 *   3. 'development' (fail-safe default: the least-privileged posture, which
 *      requires the FEWEST prod keys, so a mislabelled deploy cannot be waved
 *      through as production-ready — it is the strict prod set that gates.)
 */
export function deploymentEnvName(): DeploymentEnvName {
  const explicit = (process.env.DEPLOY_ENV ?? '').toLowerCase();
  if (isDeploymentEnvName(explicit)) return explicit;
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') return 'production';
  return 'development';
}

/**
 * Raw read of a single deployment key. Returns the trimmed value, or '' when
 * unset/blank. The preflight treats '' as NotConfigured (fail-closed) — a
 * present-but-empty key is never counted as configured.
 */
export function deploymentValue(name: string): string {
  const raw = process.env[name];
  return raw === undefined ? '' : raw.trim();
}
