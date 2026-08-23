# Iteration 4 — External-Integration Seams Report

External-integration seam engineer. Built two honest stubs/seams behind the
repo's fail-loud pattern: a configurable **external EMPI/MPI identity** path
(IHE PIX/PDQ + PIXm/PDQm) and a **terminology / semantic-validation** service
wired as a stage-4 gate. Full integration (real EMPI + real terminology server)
is a later roadmap iteration; everything here fails loud until wired, and the
demo stays green by default.

## 1. External EMPI/MPI identity seam — `src/lib/identity/external/`

Identity matching now supports the internal engine (default) AND a configurable
external EMPI over the two IHE identity protocol families. Both families
implement ONE seam (`ExternalIdentityResolver`): a cross-reference call and a
demographics call; only the wire encoding differs.

| Seam call          | PIX/PDQ (HL7v2)               | PIXm/PDQm (FHIR)                    |
| ------------------ | ----------------------------- | ---------------------------------- |
| `crossReference`   | PIX `QBP^Q23` / `RSP^K23`     | PIXm `Patient/$ihe-pix`            |
| `demographicQuery` | PDQ `QBP^Q22` / `RSP^K22`     | PDQm `GET Patient?family=&birthdate=` |
| Transport          | HL7v2 over MLLP               | FHIR REST + auth                   |

Files:

- `types.ts` — `ExternalIdentityResolver` + `PixQuery/PixResponse`,
  `PdqQuery/PdqResponse`, the config shapes, and `ExternalEmpiNotConfiguredError`.
- `pixPdqResolver.ts` — HL7v2 stub. Throws naming the config needed.
- `pixmPdqmResolver.ts` — FHIR stub. Throws naming the config needed.
- `index.ts` — resolver-kind selection (`internal | external-pixpdq |
  external-pixm-pdqm`), env `IDENTITY_RESOLVER_KIND` + `setIdentityResolverKind`.
- `README.md`.

### Config each external plug-in needs to go live

- **PIX/PDQ (`PixPdqConfig`)**: `endpoint` (MLLP host:port),
  `assigningAuthorityOid`, `sendingApplication`, `sendingFacility`,
  `receivingApplication`, `receivingFacility` (+ ER7/XML encoding).
  Env: `PIXPDQ_ENDPOINT`, `PIXPDQ_ASSIGNING_AUTHORITY_OID`, `PIXPDQ_SENDING_APP`,
  `PIXPDQ_SENDING_FACILITY`, `PIXPDQ_RECEIVING_APP`, `PIXPDQ_RECEIVING_FACILITY`.
- **PIXm/PDQm (`PixmPdqmConfig`)**: `fhirBaseUrl`, `assigningAuthoritySystem`,
  `auth` (`none | bearer | basic | smart-backend`).
  Env: `PIXM_FHIR_BASE_URL`, `PIXM_ASSIGNING_AUTHORITY_SYSTEM`, `PIXM_AUTH_KIND` (+ creds).

### Selection + semantics

`selectIdentityResolver()` (in `pipeline/stages.ts`) now layers a resolver KIND
over the `identity` dataMode seam. `internal` stays the default (production →
match engine, mock/seeded → deterministic stub), so the demo is unchanged. An
external EMPI returns an **enterprise / global id** (`PixResponse.enterpriseId`)
that becomes the **anchored member id**. Resolution semantics still apply:
confident cross-reference auto-links; an ambiguous demographics result is HELD
for review via the existing held-for-review lane (documented in the README;
wiring maps external status/score onto that decision).

## 2. Terminology / semantic-validation seam — `src/lib/terminology/`

`TerminologyService` interface with three operations over six governed systems
(`RxNorm`, `LOINC`, `SNOMED-CT`, `ICD-10-CM`, `CPT-HCPCS`, `HCC`):

- `validateCode(system, code)` — is this a real code? (`$validate-code`)
- `translate(code, source, target)` — cross-system mapping (`$translate` / ConceptMap)
- `classify(code, scheme, valueSetId?)` — HCC risk-adjustment grouping / value-set membership

Files: `types.ts`, `seedTerminologyService.ts` (allowlist from
`data/terminology-seed.json`), `productionTerminologyService.ts` (throws),
`semanticValidator.ts` (the stage-4 gate + code extraction + selection),
`index.ts`, `README.md`.

### HCC classification note

HCC (Hierarchical Condition Category) grouping drives risk-adjustment payment:
ICD-10-CM diagnoses roll up into HCC groups carrying risk weights. `classify(code,
'HCC')` returns the group (e.g. `E11.9` → `HCC38`). The seed ships a **small stub
crosswalk**, NOT the full CMS mapping; production resolves HCC via the real
crosswalk / grouping service.

### Stage-4 semantic gate (alongside the structural gate)

`conformAndLoad` (stage 4) now runs **two** gates per record: the existing
structural `FhirProfileValidator` (unchanged), then the `SemanticValidator`. The
semantic gate extracts governed codings from `record.payload` and validates each
against the `TerminologyService` chosen by the `terminology` dataMode seam:

- **mock / seeded** → seed allowlist. Demo codes are valid → demo stays green; an
  unrecognized code is quarantined `semantic-unrecognized-code` (PHI-safe).
- **production** → not-configured server stub. Codes can't be verified, so the
  gate **fails closed**: coded records are quarantined
  `semantic-terminology-unavailable` rather than admitted unverified. (The stub
  itself still throws when called directly, preserving fail-loud for integration
  code.)

Callers may pass `semanticValidator: null` to disable the gate.

### What the real terminology server plug-in needs

`TERMINOLOGY_SERVER_BASE_URL` (a FHIR terminology server) + auth, mapping the
three operations to `CodeSystem/$validate-code`, `ConceptMap/$translate`, and
`ValueSet/$expand` (+ an HCC grouping service for `classify`). Replace the
throwing bodies of `productionTerminologyService`; the seam and gate don't change.

## Real-now vs deferred

| Capability | Real now (this iteration) | Deferred (later roadmap iteration) |
| ---------- | ------------------------- | ---------------------------------- |
| External identity | Seam + typed PIX/PDQ + PIXm/PDQm queries/responses + config shapes; kind selection; fail-loud stubs | MLLP + QBP/RSP wiring; FHIR `$ihe-pix` + PDQm fetch; async resolver; status/score → auto-link/held mapping |
| Terminology | `TerminologyService` seam; seed allowlist validateCode/translate/classify; stage-4 semantic gate; production fail-loud stub | Real FHIR terminology server ($validate-code/$translate/$expand); full CMS-HCC crosswalk; value-set governance |

Both external calls throw a NotConfigured error naming the exact config needed
(`ExternalEmpiNotConfiguredError`, `TerminologyServiceNotConfiguredError`).

## Recommended scope — future Terminology + External-Identity iteration

1. **Async identity resolver.** The pipeline `IdentityResolver` is synchronous; a
   real PIX/PDQ or PIXm/PDQm call is async. Either add a pre-resolution stage or
   make `IdentityResolver` async. This is the gating design decision.
2. **Wire one external family end-to-end** (PIXm/PDQm first — FHIR is simpler than
   MLLP), including mapping `CrossReferenceStatus` / candidate confidence onto the
   existing auto-link vs held-for-review lanes, with held records surfaced exactly
   as internal holds.
3. **Wire a FHIR terminology server** for validateCode/translate, behind the same
   `terminology` seam; keep the seed allowlist as the mock/seeded backend.
4. **Full CMS-HCC crosswalk** for `classify`, sourced as `data/*.json` (data-is-
   not-code), plus value-set governance (versioned value sets, `$expand`).
5. **Contract tests** against a reference PIX/PDQ manager and a reference
   terminology server (e.g. HAPI), gated like the existing backbone integrations
   (CI-pending count tracked).
6. **Ops surface**: expose resolver kind + terminology mode in the dataMode
   settings/ops screen (`describeDataModes`).

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` → **834 passed**, 1 expected-fail, 83 skipped (0 failures).
  Includes **28 new tests** (external identity 11, terminology service 12,
  semantic gate 5).
- `bash check-file-sizes.sh` → **PASS** (no new violations; ratchet intact; every
  new file ≤ 160 lines, well under the 400/500 caps).

### Out-of-scope note

The stage-4 semantic gate would have quarantined the parallel **procedures**
domain's CPT/SNOMED demo codes (`45378`, `80146002`). Rather than touch the
procedure files (owned by a parallel agent), those two demo codes were added to
my own `data/terminology-seed.json` allowlist so the procedures pipeline stays
green. No procedure source files were modified.
