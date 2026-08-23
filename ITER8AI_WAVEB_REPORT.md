# Iteration 8A-i — Wave B report: external EMPI made real

Owner: Identity/interoperability specialist (B2), disjoint tree. Framework v1.1.
Scope: `src/lib/identity/external/` (I4 stubs -> real adapters) +
`tests/identity/externalEmpi.test.ts`. No survivorship / crossReference (Wave A)
or provider (Wave C) files touched. No shared-file appends were needed (the
`identity` seam + resolver-kind already existed and are confirmed correct).

## What changed (stub -> real)

The two IHE identity families now build real queries and parse real responses.
The wire send is factored out behind an injected transport so the build/parse
LOGIC always runs and is verified against a fake, message-shaped MPI; the live
endpoint stays CI-pending and an unwired resolver fails closed.

### New modules

- `hl7v2.ts` — ER7 codec (segment/field/component/repetition/subcomponent split,
  CX identifier parse/encode) + the PIX/PDQ message layer:
  - `buildPixQuery` -> `QBP^Q23` (PIX cross-reference, ITI-9) with MSH/QPD/RCP,
    the source id encoded as a CX (`value^^^&OID&ISO`).
  - `parsePixResponse` -> parses `RSP^K23`: reads `QAK` status, walks the `PID-3`
    repetitions, splits the enterprise id (matching the enterprise OID) from the
    peer-domain cross references; >1 enterprise id => `ambiguous`.
  - `buildPdqQuery` -> `QBP^Q22` (PDQ demographics, ITI-21) with `@PID.5.1.1^`,
    `@PID.7.1^` etc. demographic search params.
  - `parsePdqResponse` -> parses `RSP^K22`: one candidate per `PID`, the trailing
    `QRI-1` weight mapped to 0-100 confidence, name/DOB/gender decoded.
- `fhirPixm.ts` — the FHIR restatement:
  - `buildPixmRequest` -> `GET Patient/$ihe-pix?sourceIdentifier=sys|val&targetSystem=`,
    with auth headers (bearer/basic; smart-backend is a transport concern).
  - `parsePixmResponse` -> parses the `Parameters` result (`targetIdentifier`),
    enterprise id vs peers; `OperationOutcome`/HTTP>=400 => `ambiguous`.
  - `buildPdqmRequest` -> `GET Patient?family=&given=&birthdate=&gender=&identifier=`.
  - `parsePdqmResponse` -> parses the searchset `Bundle`, `entry.search.score`
    (0-1) mapped to 0-100 confidence.
- `disposition.ts` — maps an external response onto the platform's link/HELD
  decision using the SAME `MATCH_THRESHOLDS` the internal resolver uses:
  - `decideCrossReference`: `resolved` + single enterprise id -> LINKED (anchor =
    enterprise id); `ambiguous` / `not-found` / no id -> HELD.
  - `decideDemographic`: a single dominant candidate at/above `autoLinkMin` (90)
    -> LINKED; a possible-match-band score, several close candidates, or no
    candidate -> HELD. A low-confidence external match is HELD, never auto-linked.

### Edited stubs

- `pixPdqResolver.ts` / `pixmPdqmResolver.ts` — `create*Resolver(config?, transport?)`.
  Both `crossReference` and `demographicQuery` now build the real request, send it
  through the injected transport, and parse the real response. Fail-closed rule:
  an incomplete config OR no wired transport throws `ExternalEmpiNotConfiguredError`
  before any work (a config shape alone is not a live MPI). The synchronous
  pipeline `IdentityResolver` seam still fails closed (never a default identity,
  E9); async pre-resolution + `disposition.ts` mapping is the documented wiring.
- `types.ts` — added `Hl7v2Transport`, `FhirTransport`, `FhirTransportRequest`,
  `FhirTransportResponse` (the CI-pending live-endpoint boundary).
- `index.ts` — exported the transports, disposition fns, and build/parse helpers.

## Resolver-kind selection

Unchanged and confirmed: `internal | external-pixpdq | external-pixm-pdqm` via
`setIdentityResolverKind` / `IDENTITY_RESOLVER_KIND` env, layered over the
`identity` dataMode seam in `selectIdentityResolver()`. Internal stays default.
The `identity` seam disposition (`fail-closed-stub`) in `seamDispositions.ts` is
unchanged and correct — no append needed.

## Integration point for Wave A (survivorship / cross-reference)

`src/lib/identity/survivorship/` and `src/lib/identity/crossReference/` did not
exist in the tree at build time (parallel disjoint wave). The enterprise id from a
LINKED external disposition (`ExternalDisposition.memberId`) is the anchored member
id and is the value that should be handed to Wave A's `crossReference` `link()`
(member <-> source-id xref) once available; a HELD disposition feeds the
held-for-review lane exactly as the internal resolver's `HeldIdentityError` does.

## Verification

- `tsc --noEmit`: exit 0.
- Size gate (`check-file-sizes.sh src/lib/identity/external`): PASS, 7 files, all
  under caps (largest `hl7v2.ts` 275). Test file 369 lines (< 500).
- New tests: `tests/identity/externalEmpi.test.ts` — 21 passing. Pre-existing
  `externalResolver.test.ts` stays green (11) — the "complete config but unwired"
  cases still fail closed because no transport is wired.
- `tests/identity/` full: 87 passed.
- Full suite: 1177 passed, 1 expected-fail, 91 skipped, 0 failed. (Two transient
  failures observed during one run were Wave C mid-write on the shared
  `dataMode.ts` / `seamDispositions.ts` + its own `providerIdentity.test.ts`; they
  cleared once Wave C's edits settled — governance `seamFailClosed` re-ran 26/26.)

## E9 (no fail-open) statement

Every not-resolved external outcome fails closed or HELD, never a default
identity: unwired resolver throws; ambiguous/not-found cross-reference -> HELD
(memberId ''); weak/no demographic candidate -> HELD; the sync pipeline seam
throws rather than returning a fabricated id.
