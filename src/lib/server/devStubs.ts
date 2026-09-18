// ─── devStubs.ts ─────────────────────────────────────────────────────────────
// Barrel — import from here as before.
// CRD stubs   → devStubs.cds.ts
// DTR stubs   → devStubs.dtr.ts
// PAS stubs   → devStubs.pas.ts
// Profiles    → devStubs.profiles.ts

import { serverEnv } from './env';

/**
 * Whether the dev-mock stub responses (canned CRD cards, devClaimResponseApproved,
 * devMemberMatch, …) may be served for this request.
 *
 * U1 fix — double-gated EXACTLY like the session path (smartSession.ts 145/178/
 * 233/244): the dev stubs are only enabled when BOTH
 *   (a) no real auth is configured — `!env.tokenUrl` (WSO2 token endpoint unset),
 *       so a production deploy with real auth can NEVER reach a stub; and
 *   (b) the operator has explicitly opted in — `allowDevMockAuth`, which now
 *       defaults OFF (env.ts) — so the fail-open default is gone.
 * Previously this gated on `allowDevMockAuth` ALONE (defaulting true), which let
 * a production deploy with WSO2 wired but the flag left unset return a canned
 * "Prior authorization approved" ClaimResponse. Both gates must now hold.
 */
export function devMockEnabled(): boolean {
  const env = serverEnv();
  return !env.tokenUrl && env.allowDevMockAuth === true;
}

export { devCrdCards } from './devStubs.cds';
export { devDtrEvaluation, devQuestionnairePackage } from './devStubs.dtr';
export {
  devMemberMatch,
  devBulkStart,
  devBulkStatus,
  devWorkQueueItems,
  devClaimResponseApproved,
} from './devStubs.pas';
