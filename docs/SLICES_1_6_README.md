# Slices 1ΓÇô6 ΓÇö native experience first pass (branch `feat/cms0057f-native`)

Builds on Slice 0. All provisions of CMS-0057-F now have native RHTP code, wired
to the F-4 BFF. Backbone-dependent behavior is stubbed behind the BFF so it's
ready when the WSO2/Ballerina stack is up.

## Gate results (run in a clean clone)

| Gate | Command | Result |
|---|---|---|
| Compile | `npm run type-check` | Γ£à exit 0 |
| Unit tests | `npm run test` | Γ£à **37/37** (10 files) |
| Lint (new code) | `npm run lint` | Γ£à new files clean (pre-existing warnings only in `components/ui/AppIcon`,`AppImage`) |

## What was built

**Slice 1 ΓÇö Patient Access (core):** `src/app/(member)/access/page.tsx` ΓÇö member views Coverage, Conditions, and **PA status** via `/api/fhir`; `lib/fhir/viewModels.ts`; `ConsentPanel`, `ProvenanceBadge`.

**Slice 2 ΓÇö Provider Access:** `src/app/(provider)/provider-access/page.tsx`; `$member-match` client + `/api/match`; `lib/authz/guard.ts` (member vs provider authorization basis, break-glass elevates audit).

**Slice 3 ΓÇö Payer-to-Payer:** `src/app/(ops)/payer-to-payer/page.tsx`; `lib/server/bulkClient.ts` + `/api/bulk/{start,status}`; `lib/workflow/bulkJob.ts` (dedupe, idempotent callbacks); `StatusTimeline`.

**Slice 4 ΓÇö Prior Authorization:** `src/app/(reviewer)/prior-auth/page.tsx`; CDS client + `/api/cds` (CRD); native DTR renderer (`components/dtr/QuestionnaireRenderer.tsx`) + `lib/dtr/questionnaireResponse.ts`; PAS client + `/api/pas/submit` (**human-gated**, idempotency key); authenticated webhook `/api/webhooks/claim-response`; **PA state machine** `lib/workflow/paMachine.ts`.

**Slice 5 ΓÇö AI DTR:** feature-flagged **off** (`lib/flags/flags.ts` ΓåÆ `aiDtrGeneration=false`) pending the human-review gate; pipeline integration point is `/api/dtr/package`.

**Slice 6 ΓÇö Hardening scaffolds:** feature flags, parity gate tracker (`docs/parity/README.md`), traceability matrix (`docs/traceability.md`).

## Guardrails honored (plan ┬º1.4)
- Browser calls only `/api/*` (BFF); no direct FHIR/APIM; no secrets in `NEXT_PUBLIC_`.
- **PAS submit and gap closure are human-gated** ΓÇö the route returns 202 without an approver, and `paMachine` refuses `submit`/`close-gap` without `approvedBy`.
- LLM/agent never sets a coverage or PA determination ΓÇö only a payer `ClaimResponse` moves the machine to Approved/Denied.
- Webhook requires a shared secret (replace with signature/mTLS for prod).

## First pass ΓÇö explicit limitations
- **UI is functional scaffold**, not final design; pages are standalone (not yet wired into the app shell/nav).
- Server clients compile and are correct in shape, but only exercise the network against the live backbone (they degrade gracefully offline).
- `fhirServer.vm` still mirrors `raw`; swap in `fhirResourceMappers` per provision.
- Patient id is hardcoded to the seeded `MARIA_SD_001` ΓÇö replace with the SMART session patient context.
- AI DTR generation (Slice 5) is a flagged integration point, not yet wired to the reference pipeline.

## What still needs the backbone (unchanged from Slice 0 list)
Stand up WSO2/Ballerina/MySQL (or Devant), fill `.env.local` (see `docs/integration-endpoints.md`), then verify: real SMART login, 401-vs-200 on `/api/fhir`, `$member-match`, CRD/DTR/PAS end-to-end, bulk export, and `npm run test:contract` against the reference Postman collection.
