# Cycle 1 Wave 2 Report

## Data-Mode Registry (mode-registry engineer)

**New module:** `src/lib/config/dataMode.ts` (137 lines). One configuration-driven registry for every mock-vs-production seam. Modes: `mock | seeded | production`. Resolution order, first hit wins:

1. Session override (`setSessionDataMode` / `clearSessionDataModes`): the runtime demo-toggle layer; the UI FHIR/Mock switch (`setFhirMockMode`) now writes here.
2. Per-seam env: `DATA_MODE_<SEAM>` (seam id upper-snake-cased, e.g. `fhirStore` -> `DATA_MODE_FHIR_STORE`).
3. Global env: `DATA_MODE`.
4. Legacy compat: `NEXT_PUBLIC_USE_MOCK_DATA` still feeds the `fhirStore` seam (below the new vars, above the default).
5. Built-in default: `mock` (demo stays green with zero config).

API: `getDataMode(seam)`, `describeDataModes()` (seam, mode, source layer, env var: for a settings/ops screen later), `setSessionDataMode`, `clearSessionDataModes`, `seamEnvVar`. Defaults (`DEFAULT_DATA_MODES`), the seam list, and the mode list are frozen. Invalid env values are ignored (fall through); unknown seam ids resolve through the same layers so the union stays extensible.

**Seams wired now** (call `getDataMode()` at the switch point, behavior unchanged under defaults):

- `consent`: `src/lib/consent/providerAccessOptOut.ts` gains `getProviderAccessConsentStore()`; `src/app/api/consent/provider-access/route.ts` uses it. `mock`/`seeded` serve the in-memory store; `production` throws a clear config error until a real consent-repository client is wired at the `// SEAM: consent` anchor.
- `fhirStore`: `src/lib/services/fhirClient.ts` resolves mock-vs-live per call via `getDataMode('fhirStore')`; `setFhirMockMode()` is now a session override on the registry, so the existing UI toggle keeps working.

**Seams registered for later** (mode resolution live today, backend switch pending at a `// SEAM:` anchor):

- `graph`: anchor in `src/lib/careTeam/graph/resources.ts` (authored whole-person graph is the mock source).
- `sde`: anchor in `src/lib/sdResourceData.ts` (authored SD community-resource data is the mock source).
- `wpcRecord`, `carePlan`, `evidence`, `adequacy`: ids registered so config and ops tooling can address them; no code switch yet.

**deploy.config.yaml mapping (plan D5):** the `dataMode:` block feeds these env vars at deployment; switching a seam is a config change only:

```yaml
dataMode:
  global: production            # -> DATA_MODE=production
  seams:
    consent: mock               # -> DATA_MODE_CONSENT=mock
    fhirStore: production       # -> DATA_MODE_FHIR_STORE=production
    sde: seeded                 # -> DATA_MODE_SDE=seeded
```

**Tests:** `tests/config/dataMode.test.ts`: resolution order (per-seam beats global beats legacy beats default), invalid values, unknown seams, session-override layering and clearing, immutability of the frozen defaults.
