# Connect360 seed bundles (UUIDv4 · PUT)

This directory is the **Connect360 projection** of the seed patients — the second of
two coexisting states. It is generated, never hand-edited.

| | Traditional (`../*.bundle.json`) | Connect360 (`./*.bundle.json`) |
|---|---|---|
| `resource.id` | human-readable slug (`dorothy-simmons-condition-1`) | UUIDv4 (`56789a4c-72e9-4b88-9025-b77fa9adb0ca`) |
| `entry.request` | `POST <Type>` (server assigns id) | `PUT <Type>/<uuid>` (client id, upsert) |
| `entry.fullUrl` | `urn:uuid:<random>` | `urn:uuid:<uuid>` (== `resource.id`) |
| consumer | our knowledge-graph pipeline + demo | the Connect360 FHIR server |

## Why two states

Connect360's FHIR server accepts **only UUIDv4 resource ids** and rejects any
human-readable id, and it ingests via **PUT** (idempotent update-as-create / upsert
by id) rather than POST. Rather than change our preexisting pipeline to suit one
downstream server, the traditional bundles are preserved untouched and Connect360 is
served this separate projection. The id scheme is a wire-format concern; the two
states carry identical clinical content (proven by `tests/seed/connect360*.test.ts`).

## How the ids are derived (deterministic, not random)

Each Connect360 `resource.id` is a **UUIDv4-shaped value deterministically derived
from the resource's traditional slug** — `sha1(namespace | slug)` with the version
nibble forced to `4` and the variant bits to `10xx`
(`tools/seed/lib/connect360Transform.mjs`, `uuidForKey`). Consequences:

- The id is a pure function of a **stable business key** (the slug), so a Connect360
  PUT-upsert stays **idempotent** across regenerations — the same person/resource
  always lands on the same id (a random uuid per run would create duplicates).
- Because it is deterministic, the projection is **reproducible and drift-guarded**.
- It passes a UUIDv4 **format** check (a server validates shape, not entropy). A slug
  *rename* yields a new uuid (a new resource on the upsert server) — so treat slugs as
  stable.

References keep their original form and only the id token is remapped: relational
references stay `urn:uuid:<uuid>` (resolve via `fullUrl`); logical evidence references
stay `Type/<uuid>` (resolve via the PUT `request.url`, and are the form our own
knowledge-graph SUPPORTED_BY join requires).

## Regenerating

These files are checked in. **After any intentional change to a traditional bundle,
regenerate** so the projection tracks it:

```bash
npm run seed:connect360     # node tools/seed/gen-connect360.mjs
npm run verify:connect360   # conformance + drift guard + ingest parity
```

The drift guard (`tests/seed/connect360.test.ts`) re-runs the transform on the
committed traditional bundles and fails if this directory is stale or hand-edited, so
the two states cannot silently diverge.
