/**
 * seamDispositions.ts — the production-disposition manifest for every dataMode seam.
 *
 * WHY THIS EXISTS (governance gate over the fail-closed rule).
 * The platform has one correct safe-stub pattern: a seam that has no real backend
 * yet must, in production mode, throw a named `*NotConfiguredError` and let its
 * caller FAIL CLOSED — never return a plausible-but-fake value. The audit
 * (verification/STUB_LEGITIMACY_FINDINGS.md) found four seams where that pattern
 * was skipped or inverted (fail-open dev auth, a validator that failed open, a
 * mock EMPI in production, an evidence ledger that was dead wiring). Those are
 * fixed — but only a manual audit caught them.
 *
 * This manifest makes the invariant MECHANICAL. Every seam id in
 * DATA_MODE_SEAMS must have an entry here declaring its production disposition,
 * and tests/governance/seamFailClosed.test.ts proves each entry is honest:
 *   - a `fail-closed-stub` seam must actually throw in production (never a fake);
 *   - a `real-impl` seam must not fall back to the mock/in-memory path;
 *   - a `mock-only` seam must have NO production decision consumer at all.
 *
 * ADDING A NEW SEAM: register it in DATA_MODE_SEAMS (dataMode.ts) AND add an
 * entry here. If you don't, the completeness test goes red. If you declare it
 * `fail-closed-stub` you must also register a prober in the governance test that
 * drives its production path and proves the throw — otherwise the proof-coverage
 * test goes red. There is no way to add a load-bearing seam silently.
 *
 * See src/lib/config/README.seams.md for the full contract.
 */
import type { DataModeSeam } from './dataMode';

/**
 * The three honest production dispositions a seam can have.
 *
 *  - `real-impl`        A real production implementation exists and is wired; in
 *                       production mode the resolver returns it and must NOT fall
 *                       back to the mock/in-memory path (the U4 dead-wiring class).
 *  - `fail-closed-stub` No real backend yet; in production mode the resolver (or
 *                       the code it drives) throws a named `*NotConfiguredError`
 *                       so the caller fails closed. Never a plausible-but-fake
 *                       value. This is the standing safe-stub pattern.
 *  - `mock-only`        Registered for config/ops visibility only. It has NO
 *                       production consumer — `getDataMode('<seam>')` is never
 *                       called on a decision path — so production mode cannot
 *                       serve a fake value from it. A demo/UI data source
 *                       (STUB_LEGITIMACY_FINDINGS A14/A15). The gate FORBIDS a
 *                       mock-only seam from gaining a production consumer without
 *                       being reclassified real-impl or fail-closed-stub.
 */
export type SeamDisposition = 'real-impl' | 'fail-closed-stub' | 'mock-only';

export interface SeamDispositionEntry {
  /** The dataMode seam id (must be a member of DATA_MODE_SEAMS). */
  seamId: DataModeSeam;
  disposition: SeamDisposition;
  /** Where the real/throwing production implementation (or the demo source) lives. */
  productionResolverRef: string;
  /**
   * For `fail-closed-stub`: the error type thrown in production. Named so the
   * governance test can assert the throw is the declared, intentional one.
   * (`consent` throws a plain Error today — see note — recorded as 'Error'.)
   */
  notConfiguredError?: string;
  note: string;
}

/**
 * The manifest — one entry per DATA_MODE_SEAMS id, populated from the CURRENT
 * real state of every seam (verified against the code, not the labels).
 */
export const SEAM_DISPOSITIONS: Readonly<Record<DataModeSeam, SeamDispositionEntry>> =
  Object.freeze({
    // ── fail-closed-stub: production throws a named *NotConfiguredError ──────────
    identity: {
      seamId: 'identity',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/identity/identitySource.ts → getIdentitySource()',
      notConfiguredError: 'EmpiCandidateSourceNotConfiguredError',
      note:
        'U3 fix. The real EMPI match engine must score against a real candidate ' +
        'source; production with no registered source throws rather than scoring ' +
        'against the 3 demo records. mock/seeded → the in-memory demo registry.',
    },
    terminology: {
      seamId: 'terminology',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/terminology/productionTerminologyService.ts (via selectTerminologyService)',
      notConfiguredError: 'TerminologyServiceNotConfiguredError',
      note:
        'Stage-4 semantic gate. production terminology service throws on every ' +
        'validateCode/translate/classify; the gate turns the throw into a ' +
        'fail-closed quarantine (semantic-terminology-unavailable).',
    },
    profileValidation: {
      seamId: 'profileValidation',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/pipeline/profileValidator.ts → productionProfileValidationService (via selectProfileValidator)',
      notConfiguredError: 'ProfileValidatorNotConfiguredError',
      note:
        'U2 fix. The US Core $validate backend is not wired; the production service ' +
        'throws and the gate quarantines every record (profile-validation-unavailable) ' +
        'rather than admitting it unverified. mock/seeded → structural pre-flight.',
    },
    evidence: {
      seamId: 'evidence',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/evidence/store/index.ts → getEvidenceStore()',
      notConfiguredError: 'EvidenceStoreNotConfiguredError',
      note:
        'U4 fix. Callers route through getEvidenceStore(); production with no ' +
        'registered pg-ledger factory throws (never a silent in-memory Map). The ' +
        'composition root additionally throws EvidenceLedgerConnectionNotConfiguredError ' +
        'when the factory runs without a connection string.',
    },
    consent: {
      seamId: 'consent',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/consent/providerAccessOptOut.ts → getProviderAccessConsentStore()',
      notConfiguredError: 'Error',
      note:
        'Provider-access opt-out store. production throws until a real consent ' +
        'repository is wired; the SDE consent gate treats the throw as fail-closed ' +
        'no-contact. NOTE: throws a plain Error (message-gated), not a named ' +
        '*NotConfiguredError — recommended follow-up: name it for parity.',
    },
    signalDisposition: {
      seamId: 'signalDisposition',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/sde/policy/policyStore.ts → getPolicyPack()',
      notConfiguredError: 'SdePolicyStoreNotConfiguredError',
      note:
        'Signal Disposition Engine policy pack. The production DECISION path ' +
        '(getPolicyPack, consumed by the engine) throws with no registered pack ' +
        'loader. The demo projection (getSdeDemoDisposition) deliberately runs the ' +
        'real engine on the default reference pack and is not a decision path.',
    },
    idempotencyStore: {
      seamId: 'idempotencyStore',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/idempotency/index.ts → getIdempotencyStore()',
      notConfiguredError: 'IdempotencyStoreNotConfiguredError',
      note:
        'NS-04 fix. Durable consumer-idempotency store (eventId -> processed marker, ' +
        'per-consumer namespace) guarding at-least-once republish/send-effects. Callers ' +
        'route through getIdempotencyStore(); production with no registered pg-marker ' +
        'factory throws (never a silent in-memory Map as durable dedupe). mock/seeded → ' +
        'the process-global in-memory store; pg logic verified via pg-mem.',
    },
    deadLetterStore: {
      seamId: 'deadLetterStore',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/deadLetter/index.ts → getDeadLetterStore()',
      notConfiguredError: 'DeadLetterStoreNotConfiguredError',
      note:
        'NS-01 fix. Durable append-only store for the three record kinds the pipeline ' +
        'used to build then DROP (quarantine, held-identity EMPI 60-90 band, failed-outbox), ' +
        'so a held member can no longer silently disappear. Callers route through ' +
        'getDeadLetterStore(); production with no registered pg-store factory throws (never ' +
        'a silent in-memory Map as durable). mock/seeded → the in-memory append-only store; ' +
        'pg logic verified via pg-mem.',
    },
    goldCardRoster: {
      seamId: 'goldCardRoster',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/dataSources/goldCardRoster.ts → getGoldCardRosterLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: 'Data-source seam. production loader throws until a real roster client is wired.',
    },
    denialRateFeed: {
      seamId: 'denialRateFeed',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/dataSources/denialRateFeed.ts → getDenialRateFeedLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: 'Data-source seam. production loader throws until a real denial-rate feed is wired.',
    },
    providerDirectory: {
      seamId: 'providerDirectory',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/dataSources/providerDirectory.ts → getProviderDirectoryLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: 'Data-source seam. production loader throws until a real provider directory is wired.',
    },
    // ── Wave-1 order→cash (golden-thread E2E) — appended block ───────────────────
    remittanceGateway: {
      seamId: 'remittanceGateway',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/dataSources/remittanceGateway.ts → getRemittanceGatewayLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: 'Data-source seam. production loader throws until a real 835/ERA remittance client is wired.',
    },
    contractRepository: {
      seamId: 'contractRepository',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/dataSources/contractRepository.ts → getContractRepositoryLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: 'Data-source seam. production loader throws until a real contract/fee-schedule client is wired.',
    },
    // ── Wave-2 ledger integrity (tamper-evident seal) — appended block ───────────
    signingKey: {
      seamId: 'signingKey',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/dataSources/signingKey.ts → getSigningKeyLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note:
        'Ledger signing-key material for the tamper-evident Evidence Record seal ' +
        '(lib/evidence/ledgerIntegrity.ts). mock/seeded → a demo-only HMAC key; production ' +
        'loader throws until a real KMS/HSM asymmetric signer is wired. Integrity/provenance ' +
        'only — never affects the evidence tier or authority rung.',
    },
    // ── Wave-4 governed submission (durable resume/submit loop) — appended block ──
    submissionGateway: {
      seamId: 'submissionGateway',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/dataSources/submissionGateway.ts → getSubmissionGatewayLoader().load()',
      notConfiguredError: 'DataSourceNotConfiguredError',
      note: "Payer appeal/837 EDI submission transport. mock/seeded → a MOCK not-transmitted receipt (channel:'mock', transmitted:false) so the demo is honest end-to-end; production loader throws until a real 837/appeal EDI clearinghouse client is wired. No plausible-but-fake transmission — a real appeal must never appear sent when it was not.",
    },
    // ── I8A wave C (F5 provider identity) — appended block ──────────────────────
    providerIdentity: {
      seamId: 'providerIdentity',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/identity/provider/directory.ts → getProviderDirectory()',
      notConfiguredError: 'NppesNotConfiguredError',
      note:
        'F5 fix. NPI/NPPES provider resolution. The provider resolver anchors a ' +
        'provider by its VALIDATED NPI (NPPES 80840-prefixed Luhn) and enriches from ' +
        'the NPPES directory seam. mock/seeded → the in-repo seeded synthetic ' +
        'directory (demo stays green); production with no live NPPES client wired ' +
        'throws NppesNotConfiguredError (fail closed) rather than serving the seed as ' +
        'production data. NPI validation is offline + deterministic; an invalid NPI ' +
        'is rejected and never anchored (E9: no fabricated provider identity).',
    },
    // ── I8A wave A (F3 golden-record survivorship + cross-reference) — appended block ──
    crossReference: {
      seamId: 'crossReference',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/identity/crossReference/index.ts → getCrossReferenceStore()',
      notConfiguredError: 'CrossReferenceStoreNotConfiguredError',
      note: 'F3 fix. Member<->source-id cross-reference table that closes identity fragmentation: a source id already linked resolves to the EXISTING member instead of minting a new one per feed. Append-only + merge-aware (DP-7); link/unlink/merge/unmerge emit memberId-partitioned C2 events so the graph rekeys by REPLAY (never in-place). mock/seeded → the in-memory store (demo stays green); production with no registered pg-store factory throws CrossReferenceStoreNotConfiguredError (fail closed, never a silent Map). E9: an ambiguous source id (distinct unmerged members) resolves to HELD, never a wrong member.',
    },

    // ── I8A-iii Wave A (value-set governance lifecycle) — appended block ──────────
    valueSetGovernanceStore: {
      seamId: 'valueSetGovernanceStore',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/terminology/governance/store.ts → getValueSetGovernanceStore()',
      notConfiguredError: 'ValueSetGovernanceStoreNotConfiguredError',
      note: 'B2 fix. Value-set version-lifecycle governance (draft -> in-review -> approved(active) / rejected -> retired/superseded) with ENFORCED maker-checker approval and an immutable, PHI-free transition audit ledger. Callers route through getValueSetGovernanceStore(); production with no registered pg-ledger factory throws (never a silent in-memory Map presented as durable governance). mock/seeded → the process-global in-memory append-only store (the demo stays green). The lifecycle is guarded (an illegal transition throws) and one version per value set is active at a time.',
    },

    // ── real-impl: production runs the real path, no mock fallback ───────────────
    fhirStore: {
      seamId: 'fhirStore',
      disposition: 'real-impl',
      productionResolverRef: 'lib/services/fhirClient.ts → useMock()/getFhirMockMode()',
      note:
        'production issues real HTTP requests against NEXT_PUBLIC_FHIR_BASE_URL; ' +
        'mock/seeded serve the in-memory fixture store. In production useMock() is ' +
        'false — the fixture store is never the production read path.',
    },
    agentRuntime: {
      seamId: 'agentRuntime',
      disposition: 'real-impl',
      productionResolverRef: 'lib/agents/demo/index.ts → getAgentDemoActions() (agentRuntimeMode)',
      note:
        'production runs the REAL agents/runtime and returns EMERGENT actions; ' +
        'mock returns the authored demo actions. production never returns the ' +
        'authored mock. (The durable-engine backend is a documented L1 fidelity ' +
        'gap — FAKE_FIDELITY.md / finding R1 — orthogonal to this fail-closed gate.)',
    },
    agentManifests: {
      seamId: 'agentManifests',
      disposition: 'real-impl',
      productionResolverRef: 'lib/agents/manifest/registry.ts → loadAgentManifests()',
      note:
        'The shipped manifest registry is validated reference data (policy-as-data, ' +
        'finding A15), identical across modes; production honors a registered ' +
        'store-backed loader when present. There is no mock variant to fall back to.',
    },

    // ── mock-only: registered for ops visibility; NO production decision consumer ─
    // (graph + wpcRecord were reclassified fail-closed-stub in I14/I17 when the
    //  projection consumer + record-lifecycle wired real production consumers.)
    graph: {
      seamId: 'graph',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/graph/consumer/provider.ts → resolveProjectionStores()',
      notConfiguredError: 'ProjectionStoresNotConfiguredError',
      note:
        'I14 (REC-01) wired the outbox->projector consumer: resolveProjectionStores() ' +
        "consults getDataMode('graph'). production requires a REGISTERED durable " +
        'outbox + graph-store factory, or throws ProjectionStoresNotConfiguredError ' +
        '(never the in-memory fake presented as durable). mock/seeded → the in-memory ' +
        'projection stores (demo/authored graph unchanged).',
    },
    episodes: {
      seamId: 'episodes',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/episodes/index.ts → setProductionEpisodeFeedLoader() / ingestEpisodeFeed()',
      notConfiguredError: 'EpisodeFeedNotConfiguredError',
      note:
        'Episodic analytics: mock/seeded serve the authored bundle; production ingests an ' +
        'external ETG/grouper + measure feed via the registered loader, fail-closed until wired ' +
        '(EpisodeFeedNotConfiguredError); ingestEpisodeFeed throws EpisodeFeedMalformedError on a bad feed.',
    },
    sde: {
      seamId: 'sde',
      disposition: 'mock-only',
      productionResolverRef: 'lib/sdResourceData.ts (SEAM anchor; getDataMode not called)',
      note:
        'Authored SD community-resource data, a demo/UI source only (finding A15). ' +
        'No data-mode decision consumer for sde. Distinct from signalDisposition, which is ' +
        'the wired SDE decision seam.',
    },
    wpcRecord: {
      seamId: 'wpcRecord',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/lifecycle/recordLifecycle.ts → getRecordLifecycleStore() (via /api/records)',
      notConfiguredError: 'RecordLifecycleNotConfiguredError',
      note:
        'I17 (RP-01/CRUD-02) wired the record-correction/void route: it consults ' +
        "getDataMode('wpcRecord') and resolves getRecordLifecycleStore(durable). " +
        'production requires a REGISTERED durable lifecycle factory, or throws ' +
        'RecordLifecycleNotConfiguredError (never a process-local Map as durable). ' +
        'mock/seeded → the in-memory lifecycle store (demo unchanged).',
    },
    carePlan: {
      seamId: 'carePlan',
      disposition: 'mock-only',
      productionResolverRef: 'registered in dataMode.ts; no consumer wired yet',
      note:
        'Care-plan source seam, registered ahead of its backend. No ' +
        'a data-mode decision consumer for carePlan is not wired yet — inert until then.',
    },
    adequacy: {
      seamId: 'adequacy',
      disposition: 'mock-only',
      productionResolverRef:
        'lib/networkAdequacy/network.ts (loads seed directly; getDataMode not called)',
      note:
        'Network-adequacy input seam. loadMockNetwork() serves the bundled seed; ' +
        'non-mock callers pass their own AdequacyInput. No data-mode decision consumer for adequacy ' +
        'consumer exists — inert until wired.',
    },

    // ── I13 HW-SEC: tenant/plan/LOB boundary (C-TEN) ─────────────────────────────
    tenancy: {
      seamId: 'tenancy',
      disposition: 'real-impl',
      productionResolverRef:
        'lib/security/tenant/resolve.ts → resolveActorTenantScope()/resolveMemberTenant()',
      note:
        'Tenant/plan/LOB isolation. production derives the member tenant from the ' +
        'record (payer/contract) and the actor scope from VERIFIED IdP claims on the ' +
        'session, then assertTenantScope() denies cross-tenant/cross-LOB access — even ' +
        'for an org-scoped reviewer. production NEVER returns the permissive demo scope ' +
        '(no mock fallback); an absent claim fails CLOSED to an empty scope (deny). ' +
        'mock/seeded → the single demo tenant so the frontend-only demo is unchanged.',
    },

    // ── I19 HW4: external DEQM measures ingestion (C-MEAS) ────────────────────────
    measures: {
      seamId: 'measures',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/measures/index.ts → getCareGapView()',
      notConfiguredError: 'MeasuresFeedNotConfiguredError',
      note:
        'External HEDIS/Stars/MIPS measures. The platform INGESTS a Da Vinci DEQM ' +
        'MeasureReport feed; it does NOT compute measures (constraint #4). production ' +
        'with no registered external feed loader throws MeasuresFeedNotConfiguredError ' +
        '(never a fabricated gap list presented as the real feed). mock/seeded → the ' +
        'authored demo gaps (HEDIS/Stars/MIPS), normalized read-only so the demo golden ' +
        'is unchanged.',
    },
  } as const);

/** Every seam id declared in the manifest. */
export function dispositionSeamIds(): DataModeSeam[] {
  return Object.keys(SEAM_DISPOSITIONS) as DataModeSeam[];
}

/** The seam ids that carry a given disposition. */
export function seamsWithDisposition(disposition: SeamDisposition): DataModeSeam[] {
  return dispositionSeamIds().filter((id) => SEAM_DISPOSITIONS[id].disposition === disposition);
}
