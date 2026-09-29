/**
 * schema.ts — the deployment configuration schema (iteration 9 wave B).
 *
 * PURPOSE. This is the single, deterministic declaration of what a deployment
 * MUST have configured before it can be declared production-ready. It answers
 * two questions the startup PREFLIGHT (preflight.ts) asks:
 *
 *   1. ENV KEYS — which server-only env keys are REQUIRED for a given deploy
 *      posture (development / staging / production). A production deploy with a
 *      missing or empty required key is not-ready (E9: a missing prod key must
 *      fail the preflight).
 *
 *   2. SEAM BACKENDS — for every `fail-closed-stub` seam (seamDispositions.ts),
 *      WHICH backend-connection env key configures its real production backend.
 *      A seam whose EFFECTIVE data mode (dataMode.ts) is `production` but whose
 *      connection key is unset would throw its `*NotConfiguredError` at runtime
 *      and fail closed — so the preflight surfaces it as an unmet requirement
 *      AHEAD of a request, naming the exact seam + key.
 *
 * This module is PURE and side-effect free: it declares policy as data and
 * validates its own completeness. It reads no env and makes no readiness
 * decision (that is preflight.ts). It does not import backend resolvers, so a
 * preflight never has a side effect on the seams it inspects.
 */
import { DATA_MODE_SEAMS, type DataModeSeam } from '@/lib/config/dataMode';
import { SEAM_DISPOSITIONS, seamsWithDisposition } from '@/lib/config/seamDispositions';
import { DEPLOYMENT_ENV_NAMES, type DeploymentEnvName } from '@/lib/server/env';

// ── 1. Required env keys per deploy posture ──────────────────────────────────
//
// Keys are server-only (no NEXT_PUBLIC_ prefix). production mirrors the two
// existing fail-closed assertions in env.ts: requireSessionSecret (SESSION_SECRET)
// and requireWso2 (the four WSO2 OAuth keys). staging requires the session
// secret but not full WSO2. development requires none (the offline demo posture).
export const REQUIRED_ENV_KEYS: Readonly<Record<DeploymentEnvName, readonly string[]>> =
  Object.freeze({
    development: Object.freeze([] as string[]),
    staging: Object.freeze(['SESSION_SECRET'] as string[]),
    production: Object.freeze([
      'SESSION_SECRET',
      'WSO2_AUTHORIZE_URL',
      'WSO2_TOKEN_URL',
      'WSO2_CLIENT_ID',
      'WSO2_CLIENT_SECRET',
    ] as string[]),
  });

/** Required env keys for a posture (never undefined; '[]' for development). */
export function requiredEnvKeys(env: DeploymentEnvName): readonly string[] {
  return REQUIRED_ENV_KEYS[env] ?? [];
}

// ── 2. Fail-closed-stub seam -> backend-connection env key ───────────────────
//
// One entry per `fail-closed-stub` seam. Two honest kinds of key (see the
// SUBSTRATE_BACKED_SEAMS note below), because the two kinds mean different things
// and an operator MUST NOT be misled about which:
//
//   SUBSTRATE-BACKED seams (evidence, deadLetterStore, idempotencyStore,
//     crossReference) are wired by the ONE substrate bootstrap (Iteration 9 Wave
//     A) from the single `DATABASE_URL` entry. So all four map to `DATABASE_URL`,
//     the exact string the substrate's own resolver (substrateConnectionString)
//     and the evidence/deadLetter composition roots read. Presence of DATABASE_URL
//     is a REAL wiring signal for these: the pg pool the substrate opens IS their
//     backend. The preflight consults the substrate's resolver directly (DRY —
//     one source of truth for "is persistence configured"), so it can never pass
//     while the substrate would throw SubstrateNotConfiguredError at boot.
//
//   ENDPOINT-CONTRACT seams (identity, terminology, profileValidation, consent,
//     signalDisposition, goldCardRoster, denialRateFeed, providerDirectory,
//     providerIdentity, valueSetGovernanceStore) are wired by a CODE-registered
//     production factory/source, not by reading an env URL — their live backend
//     client is CI-pending. The mapped key is the deployment CONTRACT endpoint the
//     operator must declare for that seam; presence is the operator's declared
//     intent, NOT proof the in-process factory is registered. The runtime backstop
//     is the seam's own fail-closed `*NotConfiguredError` at first use (E1, proven
//     by tests/governance/seamFailClosed.test.ts). The preflight surfaces an
//     undeclared endpoint as not-ready; the seam's throw is the hard guarantee.
//
// Keys are server-only. Completeness is asserted by
// assertConnectionKeyCompleteness() and by tests/deploy/schema.test.ts, so a new
// fail-closed-stub seam with no key mapping cannot ship silently.
export const SEAM_CONNECTION_KEYS: Readonly<Partial<Record<DataModeSeam, string>>> = Object.freeze({
  // endpoint-contract seams (operator-declared endpoint; live client CI-pending)
  identity: 'EMPI_CANDIDATE_SOURCE_URL',
  terminology: 'TERMINOLOGY_SERVICE_URL',
  profileValidation: 'PROFILE_VALIDATION_SERVICE_URL',
  consent: 'CONSENT_STORE_URL',
  signalDisposition: 'SDE_POLICY_PACK_URL',
  goldCardRoster: 'GOLD_CARD_ROSTER_URL',
  denialRateFeed: 'DENIAL_RATE_FEED_URL',
  providerDirectory: 'PROVIDER_DIRECTORY_URL',
  providerIdentity: 'NPPES_BASE_URL',
  // The credentialing SYSTEM OF RECORD — deliberately not NPPES_BASE_URL. NPPES carries no licence,
  // expiry, board certification, sanction or exclusion, so pointing this at it would wire a
  // credentialing gate to a registry that cannot answer the question (C-REVQUAL).
  credentialing: 'CREDENTIALING_SOURCE_URL',
  valueSetGovernanceStore: 'VALUE_SET_GOVERNANCE_STORE_URL',
  // substrate-backed seams: the single substrate entry (Wave A) is DATABASE_URL
  evidence: 'DATABASE_URL',
  idempotencyStore: 'DATABASE_URL',
  deadLetterStore: 'DATABASE_URL',
  crossReference: 'DATABASE_URL',
  // fail-closed-stub seams introduced in later hardening waves (graph projection I14,
  // whole-person record lifecycle I17, external DEQM measures ingestion I19). Each names
  // the server-only env key that configures its real backend; production stays fail-closed
  // until the key is present and a real resolver is registered.
  graph: 'GRAPH_STORE_URL',
  wpcRecord: 'WPC_RECORD_STORE_URL',
  measures: 'DEQM_MEASURES_URL',
  episodes: 'EPISODE_FEED_URL',
  // golden-thread order→cash seams (Wave: goldenThreadE2E). Each names the
  // server-only env key for its real backend (clearinghouse/ERA feed, contract
  // rate repository); production stays fail-closed until the key + resolver exist.
  remittanceGateway: 'REMITTANCE_GATEWAY_URL',
  contractRepository: 'CONTRACT_REPOSITORY_URL',
  // Wave-2 ledger integrity: the server-only key that names the real KMS/HSM
  // signer for the Evidence Record seal; production stays fail-closed until wired.
  signingKey: 'EVIDENCE_SIGNING_KEY',
  // Wave-4 governed submission: the server-only endpoint for the real 837/appeal
  // EDI clearinghouse; production stays fail-closed until the key + resolver exist.
  submissionGateway: 'SUBMISSION_GATEWAY_URL',
  // WPCO agent tranche: the three agent seams registered in dataMode.ts. Each names
  // the server-only key that would configure its real backend — the model-reasoning
  // provider, the consent-scoped recall read-model, and the deployment-supplied tool
  // binding table. None exists yet; production stays fail-closed until key + resolver
  // are both present (see lib/agents/seams/resolve.ts).
  agentReasoner: 'AGENT_REASONER_URL',
  agentMemoryRecall: 'AGENT_RECALL_STORE_URL',
  agentToolBinding: 'AGENT_TOOL_BINDING_TABLE_URL',
});

/**
 * The `fail-closed-stub` seams whose backend is the ONE pg substrate the Wave-A
 * bootstrap wires from `DATABASE_URL`. For these the preflight consults the
 * substrate's own connection resolver (see preflight.ts), so readiness and the
 * substrate's SubstrateNotConfiguredError disposition can never disagree. Kept as
 * a set (not re-derived from the '=== DATABASE_URL' string) so the intent is
 * explicit and a future non-substrate seam that happens to reuse DATABASE_URL
 * would not be silently swept in.
 */
export const SUBSTRATE_BACKED_SEAMS: ReadonlySet<DataModeSeam> = new Set<DataModeSeam>([
  'evidence',
  'idempotencyStore',
  'deadLetterStore',
  'crossReference',
]);

/** True when a seam is wired by the shared substrate bootstrap (DATABASE_URL). */
export function isSubstrateBackedSeam(seam: DataModeSeam): boolean {
  return SUBSTRATE_BACKED_SEAMS.has(seam);
}

/** The connection key for a seam, or undefined when the seam has no backend key. */
export function seamConnectionKey(seam: DataModeSeam): string | undefined {
  return SEAM_CONNECTION_KEYS[seam];
}

/**
 * Completeness invariant: every `fail-closed-stub` seam MUST map to a connection
 * key, and no key may reference an unregistered seam. Returns the list of
 * problems ([] when the schema is complete) so the preflight and the schema test
 * can both assert it without throwing at import time.
 */
export function connectionKeyCompletenessProblems(): string[] {
  const problems: string[] = [];
  const stubs = seamsWithDisposition('fail-closed-stub');
  for (const seam of stubs) {
    if (!SEAM_CONNECTION_KEYS[seam]) {
      problems.push(
        `fail-closed-stub seam '${seam}' has no backend connection key in SEAM_CONNECTION_KEYS`
      );
    }
  }
  const registered = new Set<string>(DATA_MODE_SEAMS as readonly string[]);
  for (const seam of Object.keys(SEAM_CONNECTION_KEYS)) {
    if (!registered.has(seam)) {
      problems.push(`SEAM_CONNECTION_KEYS references unregistered seam '${seam}'`);
    }
    // A key mapped to a non-stub seam would never be consulted — flag the drift.
    const s = seam as DataModeSeam;
    if (registered.has(seam) && SEAM_DISPOSITIONS[s].disposition !== 'fail-closed-stub') {
      problems.push(
        `SEAM_CONNECTION_KEYS maps '${seam}', which is '${SEAM_DISPOSITIONS[s].disposition}', not fail-closed-stub`
      );
    }
  }
  return problems;
}

/** Throwing form of the completeness check (for a boot-time schema self-test). */
export function assertConnectionKeyCompleteness(): void {
  const problems = connectionKeyCompletenessProblems();
  if (problems.length) {
    throw new Error(`deploy schema incomplete:\n  - ${problems.join('\n  - ')}`);
  }
}

/** Every deployment key this schema references (env keys + seam connection keys). */
export function allDeploymentKeys(): string[] {
  const keys = new Set<string>();
  for (const env of DEPLOYMENT_ENV_NAMES) {
    for (const k of REQUIRED_ENV_KEYS[env]) keys.add(k);
  }
  for (const k of Object.values(SEAM_CONNECTION_KEYS)) {
    if (k) keys.add(k);
  }
  return [...keys].sort();
}
