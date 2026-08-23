# External EMPI/MPI identity seam (`src/lib/identity/external/`)

Identity matching runs the **internal** match engine by default (see
`../empiResolver.ts`). This folder adds a configurable **external** path so a
deployment can defer identity resolution to an enterprise MPI/EMPI over IHE
identity profiles. Everything here is an **honest stub**: the types and seam are
real; every external call throws `ExternalEmpiNotConfiguredError` until an
endpoint is wired (full integration is a later roadmap iteration).

## PIX/PDQ vs PIXm/PDQm

Both express the **same seam** (`ExternalIdentityResolver`): a cross-reference
call and a demographics call. Only the wire encoding differs.

| Seam call          | PIX/PDQ (HL7v2)                  | PIXm/PDQm (FHIR)                         |
| ------------------ | -------------------------------- | ---------------------------------------- |
| `crossReference`   | **PIX** `QBP^Q23` / `RSP^K23`    | **PIXm** `Patient/$ihe-pix`              |
| `demographicQuery` | **PDQ** `QBP^Q22` / `RSP^K22`    | **PDQm** `GET Patient?family=&birthdate=`|
| Transport          | HL7v2 over MLLP                  | FHIR REST + auth                         |

- **PIX / PIXm** — Patient Identifier Cross-referencing: given a patient id in
  one assigning authority, return the id(s) in other domains **plus the
  enterprise id**.
- **PDQ / PDQm** — Patient Demographics Query: given demographic traits, return
  candidate patients (each with a responder match score).

## What each stub needs to go live

`pixPdqResolver` (HL7v2), config `PixPdqConfig`:

- `endpoint` — MLLP host:port of the PIX/PDQ manager
- `assigningAuthorityOid` — OID this app queries under (CX.4 / MSH)
- `sendingApplication`, `sendingFacility` — MSH-3 / MSH-4
- `receivingApplication`, `receivingFacility` — MSH-5 / MSH-6

`pixmPdqmResolver` (FHIR), config `PixmPdqmConfig`:

- `fhirBaseUrl` — base URL exposing `$ihe-pix` + `Patient` search
- `assigningAuthoritySystem` — system uri for the app's local ids
- `auth` — `none | bearer | basic | smart-backend` + credentials

Going live means replacing the stub throws with MLLP send/receive + QBP/RSP
parsing (PIX/PDQ) or `fetch()` + Bundle/Parameters parsing (PIXm/PDQm).

## Selection

`selectIdentityResolver()` (in `../../pipeline/stages.ts`) chooses by a
resolver **kind** layered over the `identity` dataMode seam:

- `internal` (**default**) — the match engine in production, the deterministic
  stub in mock/seeded. The demo stays green.
- `external-pixpdq` — the PIX/PDQ stub.
- `external-pixm-pdqm` — the PIXm/PDQm stub.

Set it with `IDENTITY_RESOLVER_KIND` (env) or `setIdentityResolverKind()`
(process-local, for tests/ops).

## The enterprise id becomes the anchored member id

An external EMPI returns an **enterprise / global id** (`PixResponse.enterpriseId`).
That id becomes the **anchored member id** the rest of the pipeline uses — the
same slot the internal resolver fills with its anchored id.

## Resolution semantics still apply

External results are **not** exempt from the platform's resolution semantics. A
confident cross-reference **auto-links** to the enterprise id; an **ambiguous**
demographics result (multiple candidates / low score) is **HELD for review**
via the same held-for-review lane the internal resolver uses (`HeldIdentityError`
→ quarantine `status: 'held-for-review'`), never silently auto-attached. Wiring
the external adapters includes mapping their status/score onto that same
auto-link vs held decision.

## Async note (roadmap)

The pipeline's `IdentityResolver` is synchronous; a real PIX/PDQ or PIXm/PDQm
call is async. The stubs throw synchronously (fail loud) before any I/O. Going
live requires either a pre-resolution step (resolve ids ahead of the transform)
or making `IdentityResolver` async — a noted item for the external-identity
iteration.
