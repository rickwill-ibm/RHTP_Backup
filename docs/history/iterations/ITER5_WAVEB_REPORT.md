# Iteration 5 — Wave B Report (NS-04 durable idempotency + R5 session-secret fail-closed)

Closes register findings **NS-04** (HIGH, durable consumer idempotency) and **R5**
(HIGH, session-secret fail-closed). Live tree: `/home/claude/baseline`. Did not
touch `src/lib/deadLetter` or the pipeline producers (wave A owns those).

## Progress numbers
- New tests added: **29** — 28 in dedicated new files (10 idempotency contract
  [memory + pg-mem] + 4 SDE durable intake + 3 agent send-effect dedupe + 8
  session-secret + 3 Docker-guarded testcontainer cases) plus 1 new governance
  prober case for the `idempotencyStore` seam. 25 run green, 3 skip-with-reason
  (Docker absent).
- Full suite: **955 passed**, 1 expected-fail marker (pre-existing), 86 skipped.

---

## 1. Durable idempotency store — `src/lib/idempotency/` (NS-04)

Feature-first module, every file well under the 400-line cap (index 82, pg 77,
types 59, memory 38):

- **`types.ts`** — `IdempotencyStore` contract: `markProcessed(consumer, eventId)
  -> { firstProcessed }` (atomic check-and-set, the dedupe primitive) and
  `isProcessed(consumer, eventId)` (read-only probe). Per-consumer namespace so
  the SDE and each agent dedupe independently.
- **`memoryIdempotencyStore.ts`** — mock mode. Check-and-set with no await between
  read and write (atomic in the JS single-writer model, mirroring the pg
  insert-if-absent). The default instance is process-global so a same-process
  republish is deduped across calls (the property the old per-call `Set` lacked).
- **`pgIdempotencyStore.ts`** — production logic. `PRIMARY KEY (consumer,
  event_id)` + a plain INSERT; a concurrent double-delivery races on the
  constraint, the loser raises a unique violation translated to
  `firstProcessed: false`. (Raise-and-catch, not `ON CONFLICT DO NOTHING
  RETURNING`, because pg-mem returns the EXISTING row on conflict — the same
  quirk the outbox store documents — so RETURNING row-count cannot portably tell
  winner from loser. Raise-and-catch is identical across real PG and pg-mem.)
  Deterministic: injected clock (`now`).
- **`index.ts`** — seam selector `getIdempotencyStore()` via
  `getDataMode('idempotencyStore')`: mock/seeded -> the process-global in-memory
  store; production -> a registered pg factory, or throw
  `IdempotencyStoreNotConfiguredError` (fail-closed). `IDEMPOTENCY_CONSUMERS`
  names the three consumer namespaces.
- **`README.md`** + **`FAKE_FIDELITY.md`** (L1 ledger: the in-memory fake does not
  model cross-PROCESS concurrency or durability-across-restart; the pg store is
  the safe path; the Docker-guarded spec re-checks real-PG primary-key
  concurrency).

**Fake fidelity**: pg logic verified via **pg-mem** (in-process); a Docker-guarded
**testcontainer** spec (`tests/integration/idempotency.testcontainers.test.ts`)
exercises real-Postgres PRIMARY KEY concurrency and skips-with-reason when Docker
is absent.

## 2. Wiring (NS-04 fix)

- **SDE intake** — added `intakeSignalsDurable(events, tax, deps)` in
  `src/lib/sde/intake/signalIntake.ts`, replacing the per-call in-memory `Set`
  with an atomic `markProcessed('sde-intake', eventId)`. A republished event
  stream produces no new signals (dedupe survives across calls, not just within
  one fold). The sync `intakeSignals` is retained for pure taxonomy-mapping
  (fixtures/explain) with a doc note pointing to the durable path.
- **Outreach agent** — the send effect is claimed once per `touchpointId` under
  consumer `outreach-agent` before the `comms-channel.send` tool fires; a deduped
  republish returns `outcome: 'deduped'` (new PHI-safe variant). Guard is an
  optional dep, default-wired to the seam store, so existing tests (which inject
  only `send`/`consentGranted`) are unaffected.
- **Referral agent** — the coordination action is claimed once per `referralRef`
  under consumer `referral-coordination-agent`; same optional-dep pattern and
  `deduped` outcome.

Behavior preserved: full suite green; demo default resolves the mock store, so a
non-duplicate first delivery behaves exactly as before.

## 3. R5 — session secret fails closed

`src/lib/server/env.ts`:
- Removed the public default. `sessionSecret` is now `opt('SESSION_SECRET')` (`''`
  when unset), never the old shared constant.
- Added `requireSessionSecret(env)`: returns the configured secret; when absent
  returns a **labelled** `DEV_SESSION_SECRET` ONLY in explicit dev-mock mode
  (`!tokenUrl && allowDevMockAuth` — the exact U1 double-gate); otherwise throws
  `SessionSecretNotConfiguredError`. A dev secret is therefore impossible once
  real auth (WSO2 tokenUrl) is configured.
- `src/lib/server/smartSession.ts` `key()` now derives the cookie key via
  `requireSessionSecret(env)`, so production without `SESSION_SECRET` fails closed
  at seal/open time (no cookie forgery under a baked-in constant).

Governance test `tests/security/session-secret-fail-closed.test.ts`: throws in
production without config; throws when the dev flag is ON but real auth is
configured; serves the dev secret only in explicit dev mode; returns the operator
secret verbatim when set; **static scan** asserts no `SESSION_SECRET` default in
`src/` resolves to a non-empty public constant (only `''` allowed).

## 4. Seam disposition (E1)

Added `idempotencyStore` to `DATA_MODE_SEAMS` (dataMode.ts) and to
`SEAM_DISPOSITIONS` (seamDispositions.ts) with disposition **`fail-closed-stub`**
(notConfiguredError `IdempotencyStoreNotConfiguredError`) — honest: pg logic runs
via pg-mem in tests but no production factory is wired, so production throws until
one is registered. Registered a prober in `tests/governance/seamFailClosed.test.ts`
proving production throws and mock does not. The E1 completeness / proof-coverage /
fail-closed governance suite passes with the new seam.

## 5. Tests

| Suite | Proves |
|---|---|
| `tests/idempotency/idempotencyStore.contract.test.ts` | check-and-set (2nd delivery no-op); concurrent double-delivery deduped to one winner; per-consumer isolation; run against memory AND pg-mem |
| `tests/integration/idempotency.testcontainers.test.ts` | same over real Postgres (Docker-guarded, skip-with-reason) |
| `tests/sde/intakeDurable.test.ts` | SDE does not double-produce on republish; partial republish re-emits only new events; sde-intake namespace |
| `tests/agents/idempotency.test.ts` | outreach send / referral action not duplicated on republish; a control case proves the guard is load-bearing |
| `tests/security/session-secret-fail-closed.test.ts` | R5 throws in prod without config; works in explicit dev; default is not a public constant |
| `tests/governance/seamFailClosed.test.ts` | E1 governance passes with the new `idempotencyStore` seam + prober |

## Verification
- `npx tsc --noEmit` -> **0**
- `npx vitest run` -> **955 passed**, 1 expected-fail marker, 86 skipped (fully green)
- `bash check-file-sizes.sh` -> **PASS** (ratchet intact; all new files <=82 lines)
