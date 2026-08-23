# Governance Gate Report — the fail-closed invariant, made mechanical

The four Unacceptable defects (U1–U4) were caught only by a manual audit. This
gate makes that entire class — fail-open flags, mock-in-production, dead-wiring,
validators that fail open — impossible to introduce **silently**. A new seam now
either declares its production disposition and proves it fails closed, or CI goes
red.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` (full) | **902 passed · 1 expected-fail (pre-existing `test.fails`) · 83 skipped** — fully green |
| `npx vitest run tests/governance` | **29 passed** (2 files) |
| `bash check-file-sizes.sh` | **PASS** — no new violations; ratchet intact |

New files (all under caps): `seamDispositions.ts` 245/400, `seamFailClosed.test.ts`
299/500, `noFailOpenDefaults.test.ts` 131/500, `README.seams.md`.

## 1. The manifest — `src/lib/config/seamDispositions.ts`

One entry per seam in `DATA_MODE_SEAMS`, each:
`{ seamId, disposition, productionResolverRef, notConfiguredError?, note }`,
populated from the **current real state** of every seam (verified against code,
not labels). **17 seams enumerated** (via `rg "getDataMode\(" src` + the registry):

### fail-closed-stub (9) — production throws a named error, caller fails closed

| seam | production resolver | throws |
|---|---|---|
| `identity` | `getIdentitySource()` | `EmpiCandidateSourceNotConfiguredError` (U3) |
| `terminology` | `productionTerminologyService` (via `selectTerminologyService`) | `TerminologyServiceNotConfiguredError` |
| `profileValidation` | `productionProfileValidationService` (via `selectProfileValidator`) | `ProfileValidatorNotConfiguredError` (U2) |
| `evidence` | `getEvidenceStore()` | `EvidenceStoreNotConfiguredError` (U4) |
| `consent` | `getProviderAccessConsentStore()` | `Error` (plain — see judgment calls) |
| `signalDisposition` | `getPolicyPack()` | `SdePolicyStoreNotConfiguredError` |
| `goldCardRoster` | `getGoldCardRosterLoader().load()` | `DataSourceNotConfiguredError` |
| `denialRateFeed` | `getDenialRateFeedLoader().load()` | `DataSourceNotConfiguredError` |
| `providerDirectory` | `getProviderDirectoryLoader().load()` | `DataSourceNotConfiguredError` |

### real-impl (3) — production runs the real path, no mock fallback

| seam | production resolver | no-fallback proof |
|---|---|---|
| `fhirStore` | `fhirClient` `useMock()` | production ⇒ `useMock()===false` (real HTTP, not fixture store) |
| `agentRuntime` | `getAgentDemoActions()` | production returns EMERGENT actions, never the authored mock array |
| `agentManifests` | `loadAgentManifests()` | production honors the registered store loader; no mock variant to fall back to |

### mock-only (5) — registered for ops visibility; NO production decision consumer

`graph`, `sde`, `wpcRecord`, `carePlan`, `adequacy`. `getDataMode('<seam>')` is
never called on a decision path, so production cannot serve a fake value from
them (demo/UI sources, findings A14/A15). The gate forbids any of these from
gaining a production consumer without being reclassified.

## 2. The governance tests

### `tests/governance/seamFailClosed.test.ts` (24 tests)

- **Completeness** — every `DATA_MODE_SEAMS` id has a disposition entry, and every
  entry names a registered seam (both directions). **A new seam with no
  disposition FAILS here.** Plus per-entry consistency (seamId matches key,
  fail-closed-stub must declare its `notConfiguredError`).
- **No unregistered consumer** — a comment-stripped static scan of `src/` for
  `getDataMode('literal')`; every consumed seam must be registered.
- **Proof coverage** — every load-bearing seam (`real-impl` | `fail-closed-stub`)
  must have a registered prober. **A new such seam with no fail-closed proof FAILS
  here** — the proof can never be skipped.
- **Fail-closed proof** — each `fail-closed-stub` prober drives the production path
  and asserts the throw (matching the declared error), AND asserts mock/seeded
  does **not** throw — so the throw is production-specific, not a blanket break.
  For `profileValidation` it also asserts the gate quarantines
  (`profile-validation-unavailable`), not just fails loud.
- **No-fallback proof (U4 class)** — each `real-impl` prober asserts production does
  not return the mock/in-memory implementation.
- **Mock-only inertness** — each `mock-only` seam is asserted absent from the set of
  `getDataMode()`-consumed seams; wiring one flips this red and forces
  reclassification.

### `tests/governance/noFailOpenDefaults.test.ts` (5 tests)

- **Behavioral (U1)** — `serverEnv().allowDevMockAuth` and
  `getDefaultConfig().allowDevMockAuth` both default **false**; `devMockEnabled()`
  is false by default, false when the flag is ON but real auth (`WSO2_TOKEN_URL`)
  is configured, and true **only** in explicit mock mode (flag ON, no tokenUrl).
  A configured tokenUrl vetoes the flag for every truthy value.
- **Static guard** — scans all of `src/` for env flags whose name signals a
  dev-mock / dev-fallback / fail-open switch (`DEV_MOCK`, `MOCK_AUTH`, `ALLOW_DEV`,
  `FAIL_OPEN`, `DEV_FALLBACK`, `ALLOW_MOCK`, `BYPASS`) and asserts **none** defaults
  to `'true'`. A future flag that defaults ON — the exact U1 defect — turns the
  gate red. (Also asserts the known flag is seen, so a broken scan can't pass
  vacuously.)

## 3. How a future seam is FORCED to comply

Adding a seam and wiring `getDataMode('newSeam')` without more:

1. Completeness test → **red** ("seams missing a disposition: newSeam").
2. Declaring it `fail-closed-stub` or `real-impl` without a prober → proof-coverage
   test → **red** ("load-bearing seams with no proof registered: newSeam").
3. Declaring it `mock-only` but actually consuming it on a decision path →
   inertness test → **red** ("declared mock-only but is now consumed").
4. Declaring `fail-closed-stub` but the production path returns a value instead of
   throwing → fail-closed proof → **red**.

There is no green path that leaves a load-bearing seam undeclared or unproven.

## 4. Judgment calls (disposition assignments that needed a decision)

- **`agentRuntime` → real-impl, not fail-closed-stub.** Finding R1 (RISKY) notes the
  production runtime executes real agents on a non-durable in-memory engine. That
  is a documented **durability** fidelity gap (FAKE_FIDELITY.md), NOT a
  plausible-but-fake VALUE: production returns emergent decisions, never the
  authored mock. This gate enforces fail-closed-vs-fake, so `real-impl` is correct;
  the durability gap is tracked separately and is out of this gate's scope.
- **`agentManifests` → real-impl.** With no production loader, production serves the
  shipped manifest registry, which is validated reference data (policy-as-data,
  A15), identical across modes — not a mock. A registered store loader replaces it.
  There is no mock variant to fall back to, so this is not the U4 class.
- **`graph`, `sde`, `wpcRecord`, `carePlan`, `adequacy` → mock-only (a third
  category beyond the requested binary).** These are registered but **inert**:
  `getDataMode` is never called for them on any decision path (verified by the
  scan). Marking them `fail-closed-stub` would be false (they don't throw) and
  `real-impl` would be false (no backend). `mock-only` is the honest state, and the
  gate makes it safe by forbidding a production consumer without reclassification.
- **`consent` throws a plain `Error`, not a named `*NotConfiguredError`.** It still
  fails closed (message-gated, asserted on `/consent=production/`), so it is
  compliant, but it is the one seam that deviates from the named-error convention.
  Recorded in the manifest note; **recommended follow-up**: introduce
  `ConsentStoreNotConfiguredError` for parity with the other eight fail-closed seams.

## 5. Remaining non-compliance

**None** among the 17 seams: 9 fail-closed-stub (all proven to throw in production),
3 real-impl (all proven not to fall back to mock), 5 mock-only (all proven inert).
The only convention deviation is `consent`'s plain-`Error` throw (still fail-closed;
follow-up recommended above). All governance tests pass; the full suite stays green.
