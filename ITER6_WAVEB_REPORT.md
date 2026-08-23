# Iteration 6 — Wave B report (referrals + immunizations)

Two T1 record domains built end-to-end THROUGH the domain template
(`src/lib/pipeline/adapters/_TEMPLATE.md`), following the medications reference and
the proven single-node domains (labs / allergies / procedures). Identity is
anchored id-only through the injected seam exactly as `medication.ts` does
(`deps.resolveIdentity(sourceId, { feed })`, no demographics). Clock is injected;
generic + synthetic, no hardcoded persona.

## Domain 1 — referrals (`referrals`, T1)

FHIR `ServiceRequest` -> normalized referral records.

- Adapter `src/lib/pipeline/adapters/referral.ts`: parses a synthetic SNOMED/CPT
  bundle; event `referral.requested`; captures the requested `serviceCode`
  (SNOMED/CPT triple) and any `performer[0].reference` as a RAW ref (`performerRef`,
  `''` when absent). Provenance `referring-provider`. One coding-less record
  quarantines (`missing-service-code`, PHI-safe).
- Mapping `src/lib/graph/mapping/referral.ts`: node `ServiceRequest`; edge
  `REFERRED_VIA` (Member -> ServiceRequest), associative, dated from `authoredOn`,
  provenance carried as an edge/node property. It mirrors medications
  `PRESCRIBED_FOR` order semantics (a referral is a factual order link, not an
  asserted causal claim). When a performer is named, it adds an associative
  `REFERRED_TO` (ServiceRequest -> Organization|Practitioner) to a node keyed by the
  RAW ref and flagged `providerResolution: 'deferred-I8A'`.
- Pins exported: `REFERRAL_DOMAIN`, `SERVICE_REQUEST_KIND`, `REFERRED_VIA`,
  `REFERRED_TO`.

## Domain 2 — immunizations (`immunizations`, T1)

CVX-coded FHIR `Immunization` -> normalized records.

- Adapter `src/lib/pipeline/adapters/immunization.ts`: parses a synthetic CVX bundle;
  event `immunization.administered`; carries the CVX triple, `occurrenceDateTime`,
  `lotNumber`; provenance `immunization-registry`. One coding-less record quarantines
  (`missing-vaccine-code`). (CVX is an ungoverned system for the stage-4 semantic
  gate, so no terminology-seed entry is needed.)
- Mapping `src/lib/graph/mapping/immunization.ts`: node `Immunization`; edge
  `IMMUNIZED_WITH` (Member -> Immunization), associative, dated from the occurrence
  date, provenance carried as a property. Mirrors labs-vitals `OBSERVED_FOR`
  factual-record semantics.
- Pins exported: `IMMUNIZATION_DOMAIN`, `IMMUNIZATION_KIND`, `IMMUNIZED_WITH`.

## Provider ref deferred to I8A (referrals)

The referral performer (organization or practitioner) is kept as an OPAQUE source
reference only. The mapping creates a stub node keyed by that raw ref with
`providerResolution: 'deferred-I8A'` and links it associatively; it never invents
provider identity (no name, no resolved NPI). Real NPI/NPPES resolution of the
performer is out of scope for this wave and is deferred to I8A. This is asserted in
both the graph test (the raw-ref node properties) and the namespace pin.

## Registries touched

- `src/lib/pipeline/index.ts`: `export { referralAdapter, ReferralPayload }`,
  `export { immunizationAdapter, ImmunizationPayload }`.
- `src/lib/graph/mapping/index.ts`: imported `referralSpec` + `immunizationSpec` and
  appended both to `MAPPING_SPECS`.
- `src/lib/pipeline/types.ts`: widened `WpcDomain` with `'referrals'` and
  `'immunizations'` (additive, non-overlapping with wave A's `care-team` /
  `goals-tasks`).
- `src/lib/terminology/data/terminology-seed.json`: added the two referral demo
  codes the fixture uses so the stage-4 semantic gate admits them — SNOMED
  `103696004` (Patient referral to specialist) and CPT `99242` (Office consultation).

## Namespace pinning (L3, coordinated with wave A)

The referrals + immunizations pins were appended additively. To keep the shared
`tests/pipeline/domainNamespaceIntegrity.test.ts` under the 500-line test cap while
wave A also grows it, both waves split their pins into wave-scoped companion suites
(wave A created `domainNamespaceIntegrity.waveA.test.ts`; this wave added
`domainNamespaceIntegrity.waveB.test.ts`). The shared file carries a NOTE pointing to
each. The companion suite pins the same surfaces (constants == literals, adapter/spec
domain agreement, both registries, and each `eventType` claimed by exactly its spec)
from the EXACT pinned module paths.

- namespace-pin updated: yes (referrals + immunizations pinned in
  `tests/pipeline/domainNamespaceIntegrity.waveB.test.ts`).

## Tests (27 new, all green)

Per domain: adapter normalization + T1 + provenance + quarantine, C9 tier assertion,
end-to-end `runPipeline`, graph projection (both pg-mem + Neo4j-fake byte-identical +
idempotent replay), a whole-person lens read, and namespace pinning.

- `tests/pipeline/referral.test.ts`, `tests/pipeline/immunization.test.ts`
- `tests/graph/referral.test.ts`, `tests/graph/immunization.test.ts`
- `tests/pipeline/domainNamespaceIntegrity.waveB.test.ts`
- Fixtures: `tests/pipeline/fixtures/referral.json`,
  `tests/pipeline/fixtures/immunization.json` (each 2 coded + 1 malformed).

## C9 coverage matrix (rows added by wave B)

| # | Domain id | Tier | Adapter | Mapping | Node type(s) | Edge type(s) | Arrival |
|---|---|---|---|---|---|---|---|
| 10 | referrals | T1 | `adapters/referral.ts` | `mapping/referral.ts` | ServiceRequest (+ raw Organization/Practitioner ref) | REFERRED_VIA (assoc, dated); REFERRED_TO (assoc, when performer) | batch (fhir-json) |
| 11 | immunizations | T1 | `adapters/immunization.ts` | `mapping/immunization.ts` | Immunization | IMMUNIZED_WITH (assoc, dated) | batch (fhir-json) |

C9 coverage after wave B: **11/20** (was 7/20 pre-Iteration-6; wave A added
care-team = 8 and goals-tasks = 9; wave B added referrals = 10 and immunizations = 11).

## Verification

- `npx tsc --noEmit`: **0 errors**.
- `npx vitest run`: **fully green** — 1030 passed, 1 expected-fail (pre-existing
  xfail), 91 skipped; 144 files passed. 27 new wave-B tests all pass.
- `bash check-file-sizes.sh`: **PASS** (no new violations, ratchet intact). Every new
  src file <= 400 lines, every test file <= 500 (shared pin file 330, wave-B pin 172).

Scope honored: did not touch care-team / goals-tasks logic (wave A), the 834 adapter,
or idempotency / dead-letter (wave C).
