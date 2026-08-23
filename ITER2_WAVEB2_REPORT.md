# Iteration 2 — Wave B2 Report: Signal Disposition Engine (SDE, DP-2)

Built under `src/lib/sde/` (feature-first, ≤400 lines/file, `types.ts` + `index.ts`
+ `README.md`). The SDE is the first real agent on the stream lane: it consumes
typed signals derived from C2 member events, folds a member's pending signal set,
and decides act / bundle / suppress / delay — composing the approvals into one
coordinated touchpoint. Deterministic (injected clock), explainable (every
decision names its policy rule), audited (PHI-safe). No persona is hardcoded.

## Modules created

| File | Role |
|---|---|
| `types.ts` | Signal, Disposition (act/bundle/suppress/delay discriminated union), Touchpoint, DelayBundle, PolicyPack, MemberContext, audit + engine seam types |
| `schema.ts` | Hand validators (no zod dep) for taxonomy + policy pack; `SdeConfigError` refuses invalid data loudly |
| `taxonomy.ts` | Loads `data/signal-taxonomy.json`, indexes C2 eventType → signal kind, fills dedupe templates |
| `intake/signalIntake.ts` | C2 events → typed signals; idempotent on eventId; outbox-sequence ordering; Part 2 drop-at-intake; source-gating |
| `consentGate.ts` | Consent-scope check reusing the provider-access consent seam; fails closed |
| `audit.ts` | Audit sink seam + in-memory PHI-safe default |
| `policy/policyStore.ts` | SEAM `sde-policy-store`: default pack as data, production loader registration, last-valid retention, loud refusal |
| `engine/rules.ts` | Pure rule evaluators: priority score, channel resolution, supersede, TTL, sms-window (UTC), frequency cap, window ids |
| `engine/dispositionEngine.ts` | The pure fold `disposeBatch(signals, pack, ctx, deps)` — the decision model |
| `engine/explain.ts` | Explanation view-model (fired policies + reason per decision) |
| `touchpoint/composer.ts` | Compose acts/bundles → one coordinated touchpoint; group delays → delay bundles |
| `index.ts` | Public surface + `getSdeDemoDisposition()` (the `sde` mock/prod seam) + `loadDemoBatch` / `runRealDemo` / `runMemberDispositions` |
| `data/signal-taxonomy.json` | Signal taxonomy (data) |
| `data/disposition-policy.default.json` | Disposition policy pack (data) |
| `data/demo-signal-batch.json` | Seeded 9-signal batch + member context + authored summary |

## Signal taxonomy

Generic, data-driven (`data/signal-taxonomy.json`, validated at load). Classes:
care-gap opened/closed, ADT admit/discharge, screening result, missed appointment
(`sourceGated: scheduling-feed` — refuses honestly until a feed exists), referral
stall, denial, PA status change, plus behavioral-window and behavioral-health
(Part 2, consent-scoped) kinds. Each entry declares source event types, default
priority, actionability, fold behavior, default channel, consent scope, dedupe
template, and TTL. Intake maps events through the taxonomy alone (no persona key),
is idempotent on `eventId`, orders by the outbox `sequence` (per-member ordering
the memberId partition guarantees, C6), and drops Part 2-restricted events by
envelope inspection unless the deployment is cleared.

## Decision model (act / suppress / delay / bundle)

Pure fold, injected clock. Signals fold in sequence order; each yields exactly one
recorded decision (nothing silently drops). Rule order: internal-only → duplicate
collapse → consent → supersede-on-closure → TTL expiry → sms quiet-hours (delay) →
frequency cap → approve. Approvals are ranked by priority score; the top opens the
touchpoint (`act`) and the rest `bundle` into it (chunked by
`maxIntentsPerTouchpoint`). Delays parked to the same window compose into a delay
bundle. Deterministic: same set + pack + clock → identical decisions (asserted).

## Policy as data

`data/disposition-policy.default.json`: priority weights, per-channel frequency
caps, channel preference order, sms contact window, bundling cadence + max intents,
supersede/dedupe toggles, and rule id/version strings (`supersede-on-closure/1.2`,
`bundling-window/2.0`, etc.). A state tunes the file; the engine reads it. Tests
prove that toggling `supersedeOnClosure` off or tightening a cap changes the
outcome with **no code change**. `getPolicyPack()` resolves the `sde` data mode;
production requires a registered loader and refuses loudly otherwise; an invalid
pack throws at parse and the last valid pack is retained.

## Consent gate

`consentGate.ts` reuses the existing `providerAccessOptOut` consent seam as a hard
opt-out block on top of the member's granted purposes (C1 MemberContext). A
member-contact signal whose scope is absent is `suppress(consent-absent)`. Fails
**closed** (no contact) on any consent-store error.

## Explainability & audit

Every disposition carries `policyIds` (id/version); `explain.ts` renders the
care-team "why" view-model. The engine emits one PHI-safe audit entry per
disposition plus a fold-level entry (references, codes, counts only). The audit
sink is a seam; production backs it with the ADR-005 ledger unchanged.

## Acceptance reproduction (the seam)

`getSdeDemoDisposition()` resolves data mode `sde`: **mock** returns the demo's
authored disposition (`5 approved · 3 suppressed · 1 delayed — single coordinated
touchpoint`), so the hardcoded `signal-disposition-engine` page stays green;
**production** runs the real engine over the seeded batch. The seeded 9-signal
batch, folded by the real engine against the default policy pack, yields exactly
**5 approved, 3 suppressed (duplicate-collapse, consent-absent, superseded-on-
closure), 1 delayed (sms quiet-hours), and one coordinated touchpoint of 5
intents** — the shape is emergent from policy, asserted both from the seeded
signal set and from a reconstructed C2 event stream.

## Tests (26, all green)

`tests/sde/dispositionEngine.test.ts` (18) + `tests/sde/intake.test.ts` (8):
acceptance reproduction (5/3/1/one-touchpoint from policy, and authored == engine),
mock-vs-production seam, frequency-cap suppression, consent-absent suppression
(incl. consent-seam opt-out), supersede-on-closure, duplicate-collapse,
delay-to-window bundling (+ in-window act), per-member ordering, determinism,
policy-as-data (supersede toggle and cap tightening change outcomes),
explainability (every decision names an id/version rule), PHI-safe audit, C2 intake
mapping + idempotency + engine reproduction from events, source-gating, Part 2 drop,
and loud config refusal.

## Verification

- `npx tsc --noEmit` → **0**
- `npx vitest run` → **670 passed, 3 expected-fail, 78 skipped; 88 files passed, 0 failed** (26 new SDE tests; nothing prior broke)
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; largest new file `dispositionEngine.test.ts` well under the 500 test cap, all `src/lib/sde/*` under 400)

## Finding (reported, not silently fixed) — `sde` seam-id collision

The dataMode registry's `sde` seam id is **already bound** to `sdResourceData.ts`
("SD community-resource data" / SDoH resource directory — see its `SEAM: sde`
anchor and `DATA_MODE_SDE`). Per the wave instruction ("register 'sde' … mock
returns the authored disposition, production runs the real engine") the SDE reads
`getDataMode('sde')`, which satisfies the instruction and keeps the demo green
(mock default). But this couples two unrelated consumers under one mode flag:
setting `DATA_MODE_SDE=production` to enable the real disposition engine would also
flip `sdResourceData` to production (which currently throws, unwired). Recommend the
spine split these into distinct ids (e.g. keep `sde` for the disposition engine and
rename the resource-directory seam to `sdResources`, or vice-versa) in a small
registry follow-up. Left for the spine to decide; no out-of-scope rename made here.
