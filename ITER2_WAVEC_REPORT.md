# Iteration 2 Wave C — Convergence (adversarial self-review + gate authority)

Convergence engineer, wave C. Live tree `/home/claude/baseline`. Adversarial review
across `src/lib/graph` (G1 dual-backend graph) + `src/lib/sde` (G2 SDE) + the
Iteration-1 outbox changes wave A hardened. Small issues fixed; larger ones
documented. No scope creep.

## Verification (the authoritative gates)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **670 passed, 3 expected-fail, 78 skipped; 88 files passed, 0 failed** |
| `bash check-file-sizes.sh` | **PASS** (ratchet intact; 75 frozen legacy files unchanged) |

All three green after the convergence edits. The suite includes the +4 new
Docker-guarded integration skips (real Postgres CAS/uniqueness, real bolt Neo4j,
live dual-backend lens) authored for the owner's CI.

---

## Known items — dispositions

### 1. Seam-id collision (flagged by wave B2) — FIXED

The SDE had reused the `sde` dataMode seam id, already bound to `sdResourceData.ts`
(the SD community-resource directory). Setting `DATA_MODE_SDE=production` to enable
the real disposition engine would also have flipped `sdResourceData` to a not-yet-
wired production path.

Fix: the SDE now has its own distinct seam id **`signalDisposition`**.

- `src/lib/config/dataMode.ts`: registered `signalDisposition` in `DATA_MODE_SEAMS`
  (the env axis is `DATA_MODE_SIGNAL_DISPOSITION`). `sde` remains, bound solely to
  `sdResourceData`.
- `src/lib/sde/policy/policyStore.ts`: `getPolicyPack()` now resolves
  `getDataMode('signalDisposition')`; the not-configured error text names the new
  env var.
- `src/lib/sde/index.ts`: `getSdeDemoDisposition()` now resolves
  `getDataMode('signalDisposition')`; the seam-anchor banner and docstrings updated.
- `src/lib/sde/README.md`: seam references updated.
- `tests/sde/dispositionEngine.test.ts`: the mock-vs-production seam test now drives
  `setSessionDataMode('signalDisposition', …)`.

`sdResourceData.ts` is **untouched** — still `// SEAM: sde` / `DATA_MODE_SDE`. The
two consumers are now independently switchable. `describeDataModes()` / the
`dataMode.test.ts` suite iterate `DATA_MODE_SEAMS` dynamically, so the added seam is
picked up without a hardcoded-list edit; gates stay green.

### 2. Co-equal backend purity — CONFIRMED PURE

`rg` for `SELECT|INSERT|UPDATE|CREATE|MERGE|MATCH|CYPHER|\.query\(|\.run\(|RETURNING`
across `projector.ts`, `mapping/`, `lens/`, `replay.ts`, `types.ts` returns only
**comments/docstrings** — no executable store-specific logic. Import audit:

- `projector.ts` imports only `@/lib/outbox` (event type), its own `types`, and
  `mapping`.
- `lens/lenses.ts` imports only `../types` (the `GraphStore` interface + records) and
  `../mapping` (the `MEMBER_KIND` constant). Every read is `store.getNode` /
  `store.listEdges` — no backend branch, no `getGraphBackend()` call.
- No `graphBackendKind` / `postgres` / `neo4j` branch anywhere in the projector core,
  the mapping specs, or the lens layer.

SQL lives only under `adapters/postgres/`; Cypher only under `adapters/neo4j/`. The
co-equal guarantee holds by construction and is enforced in code by the shared
`graphStore.contract.test.ts` + `lens.acceptance.test.ts` (both assert byte-identical
read-back across the two backends).

### 3. Determinism sweep — CLEAN

`rg "Date\.now\(\)|Math\.random\(\)|new Date\(\)"` across `src/lib/graph` +
`src/lib/sde` → **0 hits**. The only time source in the projector is the injected
`ProjectorDeps.now` (bound to `src/lib/clock.ts`); the SDE engine takes `deps.now`.
Note: `intake/signalIntake.ts` uses `Date.parse(event.occurredAt)` — parsing an
event's own recorded timestamp, not reading the wall clock — which is deterministic
and correct, not a violation.

### 4. `console.*` sweep — CLEAN

`rg "console\.(log|debug)" src` → **0**. Broader `console\.` across graph + sde → 0.

### 5. Ratchet / convention — CLEAN

- Largest new source file: `src/lib/sde/types.ts` at **250** lines; every new
  `src/lib/graph/**` and `src/lib/sde/**` source file is ≤400. Largest new test:
  `dispositionEngine.test.ts` at 275 (≤500 cap).
- Data lives in `data/*.json` (signal taxonomy, disposition policy pack, demo batch).
  No inline data blocks in source; `LENS_NAMES` is a canonical-order enum list (code
  structure), not data.
- BFF-only intact: nothing outside `src/lib/graph` / `src/lib/sde` imports them except
  `dataMode.ts` (a comment seam-anchor, not an import). No `'use client'` component
  reaches the graph or SDE. Production read paths are wired above the store interface,
  reached via server/API only.

### 6. Part 2 restriction enforcement — CONFIRMED on both backends

Enforced at the **lens/read** layer, uniformly, and backend-agnostically:
`lens/lenses.ts` `collect()` applies `scopeCovers(target, scope)` to every target
node before it is emitted, so no lens can leak a restricted node. Because `collect`
speaks only `store.getNode` / `store.listEdges`, the identical gate runs on Postgres
and Neo4j; `lens.acceptance.test.ts` asserts byte-identical `LensResult` across both,
including the redacted-without-scope / visible-with-scope Part 2 cases.

Label flow pipeline → projector → restricted node is intact and closed:
`mapping/spec.ts` reads restriction from the **envelope** (`consentContext.
part2Restricted` + `segmentLabels`), never the payload; `resourceNode()` stamps
`restricted: true`, a `Restricted` label, and every segmentation label onto the node.
`isRestricted` is true only when `part2Restricted` (which itself contributes the
`42-CFR-Part-2` label) or a non-empty `segmentLabels` — so a restricted node **always**
carries at least one restricting label, closing the otherwise-latent `scopeCovers`
empty-restricting hole (a node marked restricted with zero labels would be visible
without consent; that state is unreachable through the mapping).

### 7. At-least-once crash-republish idempotency — CONFIRMED, tests present

Wave A's residual is that `writer.drain` republishes already-`confirmed` rows
publish-then-mark (at-least-once, same `eventId`). A republish is therefore
equivalent to a duplicate event in the consumed stream. Both downstreams are
idempotent and already proven:

- **Projector**: every mutation is an idempotent upsert keyed by business identity;
  `projector.test.ts` ("replaying twice yields the same nodes and edges") and
  `replay.test.ts` ("replay is idempotent: twice equals once") prove a duplicated /
  replayed event stream produces the identical graph.
- **SDE intake**: `intakeSignals` dedupes on `eventId` (a `Set`); `intake.test.ts`
  ("is idempotent on eventId — a re-delivered event does not double-count") proves it.

No new test needed; the coverage was already in place. Safe to republish.

---

## Adversarial findings

**New material defects found in convergence: 0.**

Everything reviewed held: purity, determinism, no console, ratchet, Part 2
enforcement on both backends, label flow, and republish idempotency all verified
clean. The one flagged item (seam collision) was fixed. Carried (not new, not
silently changed):

- **Carried**: outbox crash-recovery republish of confirmed rows stays at-least-once
  by design (idempotent downstream, verified above). The named pending-claim window
  is fully closed at the data layer (wave A step 0).
- **Carried (CI-pending)**: real-Postgres CAS/uniqueness, real-bolt Neo4j, and live
  dual-backend lens behavior are authored as Docker-guarded integration specs and
  await the owner's CI (no Docker in sandbox). See the parity table in the summary.

## Verdict: **DRY**

< 3 new material defects (0), and all three authoritative gates pass. The Iteration-2
graph (both co-equal backends) + SDE increment is converged.
