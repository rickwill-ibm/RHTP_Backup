# Iteration 8A-i — Wave C report (F5: provider identity via NPI/NPPES)

Role: B2 provider-identity specialist, disjoint tree. Framework v1.1.
Owned: `src/lib/identity/provider/` + its graph node + `tests/identity/providerIdentity.test.ts`.
Shared files touched (append-only, clearly-commented blocks): `src/lib/config/dataMode.ts`,
`src/lib/config/seamDispositions.ts`, `tests/governance/seamFailClosed.test.ts`.
In-scope neighbor edits (F5 provider refs): `src/lib/graph/mapping/referral.ts`,
`src/lib/pipeline/adapters/referral.ts`.

## What shipped

### 1. NPI validation + provider resolver (`src/lib/identity/provider/`)
- `npi.ts` — NPPES `80840`-prefixed Luhn check digit. `isValidNpi` / `assertValidNpi`
  reject any 10-digit value whose check digit is wrong and any mis-shaped input.
  `extractNpi(rawRef)` returns the first check-digit-valid 10-digit run in a ref, or
  `null` — an invalid run is never returned. Pure, offline, deterministic.
- `types.ts` — `ProviderIdentity` (NPI-anchored; name/taxonomy/organization/entityType
  optional; explicit `source` provenance) + `NppesNotConfiguredError`.
- `seedDirectory.ts` — the seeded synthetic provider directory **data file**
  (mock/seeded backing). Every NPI is check-digit valid; providers are fabricated
  demo entities, no PHI.
- `directory.ts` — the `providerIdentity` **seam**: `getProviderDirectory()` returns
  the seed in mock/seeded and the registered live NPPES client in production, throwing
  `NppesNotConfiguredError` when none is wired (**fail closed**).
- `resolver.ts` — `resolveProvider` (async, seam-backed enrichment; throws
  `InvalidNpiError` on a bad explicit NPI, `NppesNotConfiguredError` when production is
  unwired, returns `null` when no NPI is present at all) and `anchorProviderRef` (sync,
  registry-free anchor used by the pure graph projector).
- `node.ts` — the `ProviderIdentity` graph-node namespace: `PROVIDER_IDENTITY_KIND`,
  `providerNodeKey` (`npi:<npi>`), `providerNodeProps`. Imports nothing from the graph
  layer (only a type), keeping identity graph-agnostic.
- `README.md` — module contract + the E9 rules.

### 2. Seam declaration
- `providerIdentity` added to `DATA_MODE_SEAMS` (dataMode.ts) and to
  `SEAM_DISPOSITIONS` as `fail-closed-stub` / `NppesNotConfiguredError`
  (seamDispositions.ts). A prober was registered in `seamFailClosed.test.ts` (required:
  a fail-closed-stub with no prober fails the proof-coverage gate) proving production
  throws and mock/seeded do not.

### 3. Graph node + deferred refs now resolve
- `ProviderIdentity` node type, NPI-anchored (key `npi:<npi>`), projected by the
  referral mapping.
- `graph/mapping/referral.ts` — the performer, previously always a raw +
  `deferred-I8A` reference node, now RESOLVES to a `ProviderIdentity` node when the
  referral carries a valid NPI (an explicit `performerNpi`, or one extractable from the
  performer ref). `REFERRED_TO` points at the resolved node. With no valid NPI the ref
  stays raw + `deferred-I8A`, unchanged.
- `pipeline/adapters/referral.ts` — surfaces `performerNpi` from a us-npi Identifier on
  the FHIR performer so a real feed flows an NPI through to the mapping.

The projector stays pure/synchronous and NEVER calls the fail-closed NPPES seam: it
anchors by validated NPI + inline attributes (`resolutionSource: 'inline'`). Async NPPES
enrichment is `resolveProvider`, exercised directly (seeded directory, live client).

## E9 — never fail open to a fabricated identity
- Invalid NPI → `null` (sync) / `InvalidNpiError` (async); never rounded, guessed, or
  anchored. A performer NPI that fails the check digit is kept raw (tested).
- A valid-but-unseeded NPI resolves to its REAL anchor + inline facts only — no invented
  name/taxonomy (tested).
- Production with no NPPES client wired throws (tested, and enforced by the governance
  gate).

## Verification
- `tsc --noEmit`: **0 errors**.
- New suite `tests/identity/providerIdentity.test.ts`: **15 tests, all green** (NPI valid
  pass / bad-check-digit + mis-shape reject; extractNpi; seeded resolution; unseeded
  anchor-only; invalid throws; production fail-closed; live client used not seed;
  referral performer projects a ProviderIdentity node; explicit performerNpi resolves;
  no-NPI stays raw+deferred; bad-check-digit stays raw). Plus one governance
  prober-driven case (`providerIdentity` fail-closed proof).
- Affected suites (graph, identity, pipeline, config, governance): 427/427 green.
- **Full suite** (orchestrator-style single run): 1177 passed, 1 expected-fail, 91
  skipped, 0 failed.
- File-size + ratchet gate: **PASS** (owned files 32-103 lines; referral mapping 147,
  adapter 160; no new violations, ratchet intact).

## Notes for wave D / convergence
- Shared-file appends coordinated cleanly with wave A (crossReference) — both seam
  entries and both governance imports coexist; final tsc + full suite are green.
- The seeded directory is a demo data file; production fails closed until a live NPPES
  client is registered via `setProductionProviderDirectory`.
- Follow-up opportunity (not required by scope): the same `anchorProviderRef` pattern
  could be applied to claims/care-team/medication performer refs; only the referral
  mapping carried the `deferred-I8A` flag, so that was the load-bearing one closed here.
