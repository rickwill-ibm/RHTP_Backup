# Signal Disposition Engine (SDE)

The first real agent on the stream lane (DP-2). It consumes typed **signals**
about a member (derived from C2 member events), folds a member's pending signal
set, and decides — per signal — **act / bundle / suppress / delay**, composing
the approved decisions into **one coordinated touchpoint**. Every decision is
explainable (it names the policy rule that fired) and auditable (PHI-safe).

Nothing here keys on a persona (plan §1.2): signal kinds, priorities, channels,
and every policy rule are typed **data** evaluated by a generic engine.

## Signal taxonomy (data)

`data/signal-taxonomy.json`, validated at load (`schema.ts`). Each entry maps one
or more C2 `eventType`s to a signal kind and declares its default priority,
actionability, fold behavior, default channel, consent scope, dedupe-key
template, and TTL. Classes covered: care-gap opened/closed, ADT admit/discharge,
screening result, missed appointment (source-gated: refuses until a scheduling
feed exists), referral stall, denial, PA status change, plus behavioral-window
and behavioral-health (Part 2) kinds. Intake (`intake/signalIntake.ts`) maps C2
events through the taxonomy alone — idempotent on `eventId`, ordered by the
outbox `sequence` (the memberId partition guarantees per-member ordering, C6),
and it drops Part 2-restricted events by envelope inspection unless cleared.

## Decision model (`engine/dispositionEngine.ts`)

Pure fold: `(signals, pack, memberContext, deps{now, audit, consentGranted})`.
Signals are folded in sequence order; each becomes exactly one decision:

| decision | when |
|---|---|
| `suppress(internal-only)` | signal is internal-only (no contact) |
| `suppress(duplicate-collapse)` | a later signal shares an earlier one's dedupe key |
| `suppress(consent-absent)` | the required consent scope is not granted (or member opted out) |
| `suppress(superseded-on-closure)` | outreach for a measure already closed |
| `suppress(expired-ttl)` | signal passed its actionable TTL |
| `delay(quiet-hours-window)` | sms outreach outside the contact window (parks to next window) |
| `suppress(frequency-cap)` | channel contact cap reached |
| `act` / `bundle` | otherwise — the highest-priority approval opens the touchpoint (`act`), the rest `bundle` into it |

Approved decisions compose into a single coordinated touchpoint (per
`bundling.maxIntentsPerTouchpoint`); delayed decisions parked to the same window
compose into a delay bundle (`touchpoint/composer.ts`). Deterministic: same set +
pack + injected clock => same decisions. Nothing silently drops — every signal
yields a recorded decision.

## Policy is data (`policy/policyStore.ts`, SEAM: sde-policy-store)

`data/disposition-policy.default.json` holds priority weights, frequency caps,
channel preference, sms window, bundling cadence, suppression toggles, and the
rule id/version strings surfaced in explanations. A state tunes the file; the
engine reads it. `getPolicyPack()` resolves the `signalDisposition` data mode: mock/seeded
serve the default pack; production loads a versioned pack from a registered
loader, and refuses loudly when none is wired. An invalid pack throws at parse
and the last valid pack is retained.

## Consent gate (`consentGate.ts`, SEAM: consent)

Reuses the existing provider-access consent seam as a hard opt-out block on top
of the member's granted purposes (C1). Fails **closed** (no contact) on any
consent-store error.

## Explainability & audit

Every disposition carries `policyIds` (id/version). `engine/explain.ts` renders a
care-team-facing "why" view-model. `audit.ts` is the audit sink seam; the engine
emits one PHI-safe entry per disposition plus a fold-level entry (references,
codes, counts only — never member PHI). In production the sink is backed by the
ADR-005 ledger behind the same interface.

## Seam & the demo (dataMode `signalDisposition`)

`getSdeDemoDisposition()` returns the demo's **authored** disposition in mock mode
(the hardcoded `signal-disposition-engine` page stays green) and runs the **real**
engine over the seeded batch (`data/demo-signal-batch.json`) in production mode.
The acceptance shape — **5 approved, 3 suppressed, 1 delayed, one coordinated
touchpoint** — is emergent from policy in production, never hardcoded into the
engine. `tests/sde/` proves the shape emerges from both the seeded signal batch
and a real C2 event stream.

## Public surface

`index.ts` only. Key exports: `disposeBatch`, `intakeSignals`, `signalFromEvent`,
`getPolicyPack` / `defaultPolicyPack` / `loadPolicyPack`, `defaultTaxonomy`,
`consentGranted`, `explainDisposition` / `explainBatch`, `composeTouchpoints` /
`bundleDelays`, `createMemoryAuditSink`, `getSdeDemoDisposition`,
`runMemberDispositions`, `loadDemoBatch`.
