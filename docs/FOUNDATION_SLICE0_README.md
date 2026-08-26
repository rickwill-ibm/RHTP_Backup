# Slice 0 ΓÇö Foundation (delivered branch `feat/cms0057f-native`)

The secured walking skeleton from the Executable Plan. Implemented and **validated in a clean clone** of RHTP `main`.

## Gate results (run here, in this sandbox)

| Gate | Command | Result |
|---|---|---|
| Compile | `npm run type-check` | Γ£à exit 0 |
| Unit tests | `npm run test` (vitest) | Γ£à 16/16 passing (4 files) |
| Lint (new code) | `npm run lint` | Γ£à new files clean (1 pre-existing `any` **warning** in `cds-hooks/order-sign`) |

> Baseline check: a fresh `tsc --noEmit` on unmodified `main` was already green, so these results reflect the new code, not pre-existing drift.

## What was built (tasks F-2 ΓÇª F-7)
- **F-2** ΓÇö vitest harness (`vitest.config.ts`, `tests/**`), scripts `test`, `test:watch`, `test:contract`, `test:e2e`, `seed:maria`.
- **F-3** ΓÇö real SMART session, **server-held** tokens (`src/lib/server/smartSession.ts`) + `/api/auth/{login,callback,logout,session}`; PKCE; AES-256-GCM encrypted httpOnly cookie. Replaces the mock `smartAuth.ts`.
- **F-4** ΓÇö server-mediated FHIR BFF (`src/lib/server/fhirServer.ts`) + `/api/fhir/[...path]`; bearer injection, correlation id, raw-FHIR retained, writes validated.
- **F-5** ΓÇö FHIR structural validator + OperationOutcome model + `<OperationOutcomeView/>`.
- **F-6** ΓÇö PHI-safe append-only audit + correlation IDs (`audit.ts`, `correlation.ts`).
- **F-7** ΓÇö Maria FHIR seed bundle (`tools/seed/maria.bundle.json`, incl. CPT 72148 to line up with the reference PA example) + loader.

## Guardrails honored (plan ┬º1.4)
- No secret uses `NEXT_PUBLIC_` (all in `src/lib/server`, read via server env).
- Browser never calls FHIR/APIM directly ΓÇö only `/api/fhir/*`.
- No token returned to the browser (`/api/auth/session` returns a boolean).
- Raw FHIR retained alongside view models.
- No LLM/agent makes any coverage/PA determination (none added here).

## What you must run on YOUR machine (needs the backbone ΓÇö cannot pass here)
1. **ENV-1** ΓÇö stand up the WSO2/Ballerina/MySQL backbone (or Devant) and confirm the four flows via the reference Postman collection.
2. **ENV-2/3** ΓÇö fill `.env.local` server keys from `docs/integration-endpoints.md`; set `ALLOW_DEV_MOCK_AUTH=false`.
3. **F-3 live** ΓÇö register the OAuth app in APIM; complete a real `/api/auth/login` ΓåÆ IS ΓåÆ `/api/auth/callback` round-trip.
4. **F-4 live** ΓÇö `curl -s localhost:4029/api/fhir/Patient/MARIA_SD_001` with a session (200) and without (401).
5. **F-7 seed** ΓÇö `FHIR_GATEWAY_BASE=ΓÇª BEARER=ΓÇª npm run seed:maria`.
6. **`npm run test:contract`** ΓÇö add `tools/contract/cms0057f.postman_collection.json` + `local.postman_environment.json` and run green against the live backbone.

## How to apply
```bash
git checkout -b feat/cms0057f-native      # if not present
git apply slice0-foundation.patch          # or: git am
npm install                                # picks up vitest + test deps
npm run type-check && npm run test         # should be green offline
```

## Notes / honest limitations
- `smartSession` refresh/token exchange is real code but only exercised against a live WSO2 IS; offline it falls back to a labelled dev token (`ALLOW_DEV_MOCK_AUTH`) ΓÇö **disable before any real use**.
- `fhirServer.vm` currently mirrors `raw`; provision slices swap in `fhirResourceMappers`.
- Two pre-existing `cds-hooks` route files were Prettier-formatted (formatting only, no logic change) so `npm run lint` is green.
