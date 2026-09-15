/**
 * dataMode.ts — the single configuration-driven mode registry (plan D5).
 *
 * Every mock-vs-production seam in the app resolves its data mode HERE, so
 * switching any seam from mock to production is a config change, never a code
 * change. Deployment: deploy.config.yaml's `dataMode:` block feeds these env
 * vars at deployment time (per plan D5) —
 *
 *   dataMode:
 *     global: production        ->  DATA_MODE=production
 *     seams:
 *       consent: mock           ->  DATA_MODE_CONSENT=mock
 *       fhirStore: production   ->  DATA_MODE_FHIR_STORE=production
 *
 * Resolution order (first hit wins):
 *   1. Session override        — setSessionDataMode(); the runtime demo toggle
 *                                (e.g. the UI FHIR/Mock switch) layers here,
 *                                ABOVE config, so demos can flip live.
 *   2. Per-seam env override   — DATA_MODE_<SEAM> (seam id upper-snake-cased,
 *                                e.g. fhirStore -> DATA_MODE_FHIR_STORE).
 *   3. Global env              — DATA_MODE.
 *   4. Legacy compat env       — per-seam mapping for pre-registry vars
 *                                (fhirStore honors NEXT_PUBLIC_USE_MOCK_DATA).
 *   5. Built-in default        — 'mock' (the demo stays green by default).
 *
 * Invalid env values are ignored and resolution falls through to the next
 * layer. Unknown (not-yet-registered) seam ids resolve through the same
 * layers — the union below is extensible; add the id when a new seam appears.
 */

export const DATA_MODES = Object.freeze(['mock', 'seeded', 'production'] as const);
export type DataMode = (typeof DATA_MODES)[number];

/**
 * Registered seam identifiers. "Wired" seams already call getDataMode() at
 * their switch point; the rest are registered so config/ops tooling can see
 * and set them before their production backends exist.
 */
export const DATA_MODE_SEAMS = Object.freeze([
  'consent', //     wired: provider-access opt-out consent store (lib/consent/providerAccessOptOut.ts)
  'graph', //       registered: whole-person graph (SEAM anchor in lib/careTeam/graph/resources.ts)
  'sde', //         registered: SD community-resource data (SEAM anchor in lib/sdResourceData.ts)
  'episodes', //    registered: episodic analytics — authored bundle (mock/seeded) vs external ETG/grouper + measure feed (production, fail-closed); switched in lib/episodes/index.ts
  'signalDisposition', // wired: Signal Disposition Engine — authored disposition (mock) vs the real engine over the seeded batch (production); switched in lib/sde/index.ts
  'wpcRecord', //   wired: whole-person holistic context — authored engine (mock) vs projected-graph aggregator (production, fail-closed); switched in lib/wpc/holisticContext.ts
  'carePlan', //    registered: care plan source
  'evidence', //    wired: evidence store seam — mock vs pg append-only ledger (lib/evidence/store/index.ts)
  'adequacy', //    registered: network adequacy input (lib/networkAdequacy/network.ts)
  'fhirStore', //   wired: FhirClient mock store vs live FHIR server (lib/services/fhirClient.ts)
  'goldCardRoster', //    wired: gold-card roster loader (lib/dataSources/goldCardRoster.ts)
  'denialRateFeed', //    wired: historical denial-rate feed (lib/dataSources/denialRateFeed.ts)
  'providerDirectory', // wired: provider directory loader (lib/dataSources/providerDirectory.ts)
  'agentRuntime', //      wired: agent runtime (G4) — mock authored actions vs real journey engine (lib/agentRuntime/)
  'agentManifests', //    wired: agent manifest registry source (lib/agents/manifest/)
  'identity', //          wired: pipeline identity resolution — deterministic stub (demo) vs EMPI match engine (production) (lib/pipeline/stages.ts)
  'terminology', //       wired: stage-4 semantic gate — seed code allowlist (mock/seeded) vs FHIR terminology server (production) (lib/terminology/)
  'profileValidation', // wired: stage-4 profile gate — structural pre-flight (mock/seeded) vs US Core $validate, fail-closed until wired (lib/pipeline/profileValidator.ts)
  'idempotencyStore', // wired: durable consumer-idempotency store (NS-04) — in-memory (mock/seeded) vs pg marker table, fail-closed until wired (lib/idempotency/)
  'deadLetterStore', //  wired: dead-letter / held-review store (NS-01) — in-memory (mock/seeded) vs pg append-only store, fail-closed until wired (lib/deadLetter/)
  // ── I8A wave C (F5 provider identity) — appended block ──────────────────────
  'providerIdentity', // wired: NPI/NPPES provider directory — seeded directory (mock/seeded) vs live NPPES client, fail-closed until wired (lib/identity/provider/)
  // ── I8A wave A (F3 golden-record survivorship + cross-reference) — appended block ──
  'crossReference', //   wired: member<->source-id xref (F3) — in-memory (mock/seeded) vs pg append-only table, fail-closed until wired (lib/identity/crossReference/)
  // ── I8A-iii Wave A (value-set governance lifecycle) — appended block ──────────
  'valueSetGovernanceStore', // wired: value-set version-lifecycle + maker-checker audit ledger — in-memory (mock/seeded) vs pg append-only governance ledger, fail-closed until wired (lib/terminology/governance/)
  // ── I13 HW-SEC (tenant/plan/LOB boundary) — appended block ───────────────────
  'tenancy', //     wired: tenant/plan/LOB isolation (C-TEN) — single demo tenant (mock/seeded, demo intact) vs per-record tenant + IdP-claim actor scope, fail-closed (lib/security/tenant/)
  // ── I19 HW4 (external DEQM measures ingestion) — appended block ───────────────
  'measures', //    wired: external HEDIS/Stars/MIPS measures (C-MEAS) — authored demo gaps (mock/seeded, demo intact) vs ingested Da Vinci DEQM MeasureReport feed, fail-closed. Platform ingests, does not compute (lib/measures/)
  // ── Wave-1 order→cash (golden-thread E2E) — appended block ───────────────────
  'remittanceGateway', // wired: 835 remittance advice loader — seeded ERA (mock/seeded) vs live payer/clearinghouse ERA client, fail-closed until wired (lib/dataSources/remittanceGateway.ts)
  'contractRepository', // wired: contracted fee-schedule loader — seeded rates (mock/seeded) vs live contract-management client, fail-closed until wired (lib/dataSources/contractRepository.ts)
  // ── Wave-2 ledger integrity (tamper-evident seal) — appended block ───────────
  'signingKey', //  wired: ledger signing-key material — demo HMAC key (mock/seeded) vs a real KMS/HSM asymmetric signer, fail-closed until wired (lib/dataSources/signingKey.ts)
  // ── Wave-4 governed submission (durable resume/submit loop) — appended block ──
  'submissionGateway', // wired: payer appeal/837 EDI submission transport — mock not-transmitted receipt (mock/seeded) vs a real 837/appeal EDI clearinghouse, fail-closed until wired (lib/dataSources/submissionGateway.ts)
] as const);
export type DataModeSeam = (typeof DATA_MODE_SEAMS)[number];

/** Built-in defaults — one per registered seam, frozen (the ratchet's floor). */
export const DEFAULT_DATA_MODES: Readonly<Record<DataModeSeam, DataMode>> = Object.freeze(
  Object.fromEntries(DATA_MODE_SEAMS.map((s) => [s, 'mock'])) as Record<DataModeSeam, DataMode>
);

const DEFAULT_MODE: DataMode = 'mock';

function isDataMode(value: unknown): value is DataMode {
  return typeof value === 'string' && (DATA_MODES as readonly string[]).includes(value);
}

/** camelCase seam id -> env var suffix: fhirStore -> FHIR_STORE. */
export function seamEnvVar(seam: string): string {
  return `DATA_MODE_${seam.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const raw = process.env[name];
  return raw === undefined || raw === '' ? undefined : raw;
}

/** Env value -> DataMode (case-insensitive); undefined when unset or invalid. */
function envMode(name: string): DataMode | undefined {
  const raw = readEnv(name)?.toLowerCase();
  return isDataMode(raw) ? raw : undefined;
}

/** Legacy pre-registry env compat, consulted below DATA_MODE, above the default. */
function legacyEnvMode(seam: string): DataMode | undefined {
  if (seam === 'fhirStore') {
    const legacy = readEnv('NEXT_PUBLIC_USE_MOCK_DATA');
    if (legacy !== undefined) return legacy.toLowerCase() === 'true' ? 'mock' : 'production';
  }
  return undefined;
}

// ─── Session override hook ───────────────────────────────────────────────────
// The existing runtime demo toggle (AppContext useMockData -> useFhirModeSync)
// keeps working by writing here: a per-seam override layered ABOVE env config,
// process-local, never persisted.

const sessionOverrides = new Map<string, DataMode>();

/**
 * Set (or, with null/undefined, clear) a runtime override for one seam.
 * Fails loud on an invalid mode: a programmatic override is a code path, not
 * env config, so a bad value must never silently change data-mode resolution.
 */
export function setSessionDataMode(
  seam: DataModeSeam | string,
  mode: DataMode | null | undefined
): void {
  if (mode === null || mode === undefined) {
    sessionOverrides.delete(seam);
    return;
  }
  if (!isDataMode(mode)) {
    throw new TypeError(
      `setSessionDataMode: invalid mode '${String(mode)}' for seam '${seam}' (valid: ${DATA_MODES.join(', ')})`
    );
  }
  sessionOverrides.set(seam, mode);
}

/** Clear every session override (tests; "reset demo" actions). */
export function clearSessionDataModes(): void {
  sessionOverrides.clear();
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export type DataModeSource = 'session' | 'env-seam' | 'env-global' | 'env-legacy' | 'default';

function resolve(seam: string): { mode: DataMode; source: DataModeSource } {
  const session = sessionOverrides.get(seam);
  if (session !== undefined) return { mode: session, source: 'session' };

  const perSeam = envMode(seamEnvVar(seam));
  if (perSeam !== undefined) return { mode: perSeam, source: 'env-seam' };

  const global = envMode('DATA_MODE');
  if (global !== undefined) return { mode: global, source: 'env-global' };

  const legacy = legacyEnvMode(seam);
  if (legacy !== undefined) return { mode: legacy, source: 'env-legacy' };

  return { mode: DEFAULT_MODE, source: 'default' };
}

/** The effective mode for a seam. Unknown seams resolve through the same layers. */
export function getDataMode(seam: DataModeSeam | (string & {})): DataMode {
  return resolve(seam).mode;
}

export interface DataModeDescription {
  seam: DataModeSeam;
  mode: DataMode;
  /** Which resolution layer produced the mode (for a settings/ops screen). */
  source: DataModeSource;
  /** The env var that configures this seam at deployment. */
  envVar: string;
}

/** Snapshot of every registered seam — for a settings/ops screen later. */
export function describeDataModes(): DataModeDescription[] {
  return DATA_MODE_SEAMS.map((seam) => ({ seam, ...resolve(seam), envVar: seamEnvVar(seam) }));
}

// ─── Graph backend selection (ADR-001 v12.3: two co-equal certified backends) ──
// The `graph` seam above is the mock-vs-production switch (authored demo graph vs
// projected store). WHICH certified production backend the projected store uses is
// a SECOND, orthogonal axis: Postgres-projection or Neo4j (self-hosted / Aura).
// Both are conformance-gated and switchable by config ALONE — the projector and
// the store interface never change. Resolved from GRAPH_BACKEND; default is the
// Postgres reference projection (the always-available backend).

export const GRAPH_BACKENDS = Object.freeze([
  'postgres-projection',
  'neo4j-selfhosted',
  'neo4j-aura',
] as const);
export type GraphBackend = (typeof GRAPH_BACKENDS)[number];

const DEFAULT_GRAPH_BACKEND: GraphBackend = 'postgres-projection';

function isGraphBackend(v: unknown): v is GraphBackend {
  return typeof v === 'string' && (GRAPH_BACKENDS as readonly string[]).includes(v);
}

const graphBackendOverride: { value: GraphBackend | null } = { value: null };

/** Set (or clear, with null) a process-local graph-backend override (tests/ops). */
export function setGraphBackend(backend: GraphBackend | null | undefined): void {
  if (backend === null || backend === undefined) {
    graphBackendOverride.value = null;
    return;
  }
  if (!isGraphBackend(backend)) {
    throw new TypeError(
      `setGraphBackend: invalid backend '${String(backend)}' (valid: ${GRAPH_BACKENDS.join(', ')})`
    );
  }
  graphBackendOverride.value = backend;
}

/** The effective graph backend: session override, then GRAPH_BACKEND env, then default. */
export function getGraphBackend(): GraphBackend {
  if (graphBackendOverride.value) return graphBackendOverride.value;
  const env = readEnv('GRAPH_BACKEND')?.toLowerCase();
  return isGraphBackend(env) ? env : DEFAULT_GRAPH_BACKEND;
}

/** The store KIND a backend id maps to — the factory switch (postgres vs neo4j). */
export function graphBackendKind(backend: GraphBackend = getGraphBackend()): 'postgres' | 'neo4j' {
  return backend === 'postgres-projection' ? 'postgres' : 'neo4j';
}
