# Layer D — The Autonomy Ladder

**Status:** DEFERRED (not being built now). This document is an execution-ready engineering plan.
**Scope:** Introduce a per-payer-function autonomy ladder (Rungs 0–4) to the RHTP prior-authorization platform, with the adverse-determination safety invariant enforced structurally rather than by convention.
**Owner:** Platform / PA core team.
**Architectural discipline (inherited, non-negotiable):** pure-core in `src/lib/**` (unit-tested, no I/O), thin shell in routes/components, feature-flagged rollout with classic fallback via `flag('name')` reading `NEXT_PUBLIC_*`, no payer-specific hardcoding, human-gated determinations.

---

## 0. Executive summary

Layer D adds a governed **autonomy ladder** that lets each payer function (eligibility, enrollment, financial clearance, estimation, prior auth) climb from "system of record" to "autonomous within strict scope" **at its own pace**, driven by policy configuration rather than code changes. The central risk is regulatory: an adverse medical-necessity determination (a denial) can **never** be produced by software without a licensed clinician. Layer D treats this not as a guideline but as a structural property of the code — the determination router has **no autonomous edge on the adverse path at the type level**, so "auto-deny" is not an expressible program state, not a runtime branch that could be mis-flagged. Autonomy therefore rides the **approval direction only**: auto-approval, gold-carding, and provider exemptions. When the decision clock expires, the platform **fails open to approval**, never to a silent denial, and that fail-open approval is recorded distinctly from a substantive clinical approval so it is auditable and reversible.

The build is dependency-ordered: first the pure-core types and the structurally-safe router (approvals can be produced autonomously, denials cannot be *expressed* autonomously), then the gold-carding model, then the runtime governance plane (circuit breaker, audit, provenance), then the clock-expiry fail-open wiring, then flag-gated shadow → limited → widen rollout, with adversarial tests gating every step.

---

## 1. Rung representation and structural enforcement

### 1.1 The five rungs, as a closed type

Rungs are an ordered enum. They are advisory *capability ceilings* per function; the router (§1.3) decides what a given rung actually permits, and no rung permits an autonomous adverse determination.

```
src/lib/pa/autonomy/rungs.ts
```

```ts
// Ordered — higher = more autonomy. Comparable via numeric backing.
export enum Rung {
  HeavyHuman   = 0, // system of record only
  HumanAssist  = 1, // AI drafts/extracts/suggests; human decides everything
  HITL         = 2, // AI proposes; named human approves each element before effect
  HOTL         = 3, // AI acts within a pre-approved envelope; humans supervise + can intervene
  Autonomous   = 4, // AI acts within strict scope; humans govern by policy/audit/circuit-breaker
}

export const PAYER_FUNCTIONS = [
  'eligibility',
  'enrollment',
  'financialClearance',
  'estimation',
  'priorAuth',
] as const;
export type PayerFunction = (typeof PAYER_FUNCTIONS)[number];
```

### 1.2 The policy surface (per-function autonomy level)

Autonomy level is **configuration, not code**. A per-function policy object is the single source of truth for "how far up the ladder this function may go", scoped so different payers/lines-of-business climb independently — with **no payer identity hardcoded in logic**; payer differences live only in data loaded through this surface.

```
src/lib/pa/autonomy/autonomyPolicy.ts        // pure: types + resolver
src/lib/pa/autonomy/autonomyPolicy.schema.ts // zod schema for external policy docs
```

```ts
export interface FunctionAutonomyPolicy {
  fn: PayerFunction;
  ceiling: Rung;                 // max rung this function may exercise
  envelope: EnvelopeSpec;        // what "within scope" means at Rung 3/4 (§2, §1.4)
  policyVersion: string;         // semver; stamped into every action's provenance
  effectiveAt: string;          // ISO
  circuitBreaker: BreakerBinding; // §3
}

export interface AutonomyPolicySet {
  policyVersion: string;
  functions: Record<PayerFunction, FunctionAutonomyPolicy>;
}

// Pure resolver — no I/O. The shell loads the doc; the core interprets it.
export function resolveAutonomy(
  policy: AutonomyPolicySet,
  fn: PayerFunction,
): FunctionAutonomyPolicy;
```

The policy document itself is loaded by the thin shell (from config store / DB) and validated against `autonomyPolicy.schema.ts` at the boundary; the pure core only ever receives an already-parsed, typed `AutonomyPolicySet`.

### 1.3 The structural invariant: an adverse path with no autonomous edge

This is the heart of Layer D. We model determination outcomes as a **discriminated union in which the autonomous constructor cannot carry an adverse disposition** — the compiler, not a runtime `if`, forbids "autonomous denial".

```
src/lib/pa/autonomy/determinationRouter.ts   // pure router
src/lib/pa/autonomy/determination.types.ts   // the load-bearing types
```

```ts
// --- determination.types.ts ---

export type Disposition = 'approve' | 'deny' | 'partial' | 'pend';

// An approval-only disposition. Type-level guarantee: no 'deny'/'partial'.
export type ApprovalDisposition = 'approve';

// How a determination came to be. The union is the enforcement mechanism.
export type Determination =
  // Autonomous actions can ONLY be approvals. There is no constructor here
  // that accepts an adverse disposition — "auto-deny" is unrepresentable.
  | {
      kind: 'autonomous';
      disposition: ApprovalDisposition;      // <- structurally approval-only
      basis: AutoApprovalBasis;              // 'ruleMatch' | 'goldCard' | 'clockExpiryFailOpen'
      provenance: Provenance;                // §3
    }
  // Anything not an autonomous approval must route to a human.
  | {
      kind: 'humanRequired';
      proposed: Disposition;                 // AI may PROPOSE deny; a human must decide
      reason: HumanRequiredReason;           // 'adverse' | 'outOfEnvelope' | 'lowConfidence' | ...
      provenance: Provenance;
    }
  // A human decided (HITL/HOTL approval or ANY denial).
  | {
      kind: 'humanDecided';
      disposition: Disposition;              // denials live ONLY here
      decider: ClinicianRef;                 // licensed clinician for any adverse med-nec decision
      provenance: Provenance;
    };

export type AutoApprovalBasis = 'ruleMatch' | 'goldCard' | 'clockExpiryFailOpen';
```

```ts
// --- determinationRouter.ts (pure) ---

// The router is total: every input maps to exactly one Determination.
// It can construct 'autonomous' ONLY for approvals; every adverse or
// uncertain outcome is forced to 'humanRequired'. There is no code path
// that constructs { kind: 'autonomous', disposition: 'deny' } because the
// type makes it uninhabitable.
export function routeDetermination(input: RouterInput): Determination;
```

**Why this is structural, not documented:** the field `disposition` on the `autonomous` variant is typed `ApprovalDisposition = 'approve'`. A future engineer who tries to emit an autonomous denial gets a **compile error**, not a passing test that someone forgot to write. Denials are only inhabitable on `humanDecided` (with a required `ClinicianRef`) and can be *proposed* on `humanRequired`. Adversarial tests (§6) assert this property holds for arbitrary inputs, but the first line of defense is the type system.

A supporting **ESLint boundary rule** (`no-autonomous-adverse`) and a CI grep gate reject any literal object that pairs `kind: 'autonomous'` with a non-`approve` disposition anywhere in the tree, as belt-and-suspenders against `as any` casts.

### 1.4 Rung → capability mapping (pure)

```
src/lib/pa/autonomy/capability.ts
```

A pure function maps `(Rung, FunctionAutonomyPolicy, RouterInput)` to the *allowed* action set. Key rules encoded here:
- Rungs 0–2 never produce `kind: 'autonomous'`; they yield `humanRequired`/`humanDecided` only (Rung 1 attaches AI drafts; Rung 2 requires a named approver per element).
- Rungs 3–4 may produce `kind: 'autonomous'` **only** when disposition is `approve` **and** the input is inside `EnvelopeSpec` (Rung 4 = wider envelope, policy-governed audit; Rung 3 = narrower envelope, active human supervision + intervene).
- No rung, at any input, can yield an autonomous adverse outcome — guaranteed by §1.3's type, independent of this mapping being correct.

---

## 2. Gold-carding data model

Gold-carding = a provider earns an **exemption** from prior-auth review for a specific procedure/policy based on track record; matching future requests **auto-approve**. It is one of the three safe autonomy levers and feeds only the *approval* direction.

```
src/lib/pa/autonomy/goldCard.types.ts
src/lib/pa/autonomy/goldCardEligibility.ts   // pure: does this request match a live card?
src/lib/pa/autonomy/goldCardScoring.ts       // pure: track-record → eligibility (offline/batch)
```

### 2.1 Model

```ts
export interface GoldCard {
  id: string;
  providerRef: ProviderRef;          // NPI/TIN abstraction; never a payer-specific literal
  scope: {
    procedure: ProcedureCode;        // e.g. CPT/HCPCS abstraction
    policyId: string;                // coverage policy this card exempts from review
    lineOfBusiness?: string;
  };
  basis: {
    windowStart: string; windowEnd: string;   // track-record window evaluated
    approvedCount: number; totalCount: number; // approval rate over window
    denialRate: number;                        // must be below policy threshold to hold a card
  };
  status: 'active' | 'suspended' | 'revoked';
  effectiveAt: string;               // ISO
  expiresAt: string;                 // ISO — cards ALWAYS expire; re-earned by re-scoring
  revocation?: { at: string; reason: string; actor: ActorRef };
  policyVersion: string;             // gold-card program policy version, for provenance
}
```

### 2.2 Feeding auto-approval

- `goldCardEligibility.eligibleCard(request, cards, now)` is **pure**: returns the single active, unexpired, non-revoked card whose scope matches, or `null`. Expiry and revocation are evaluated **against `now` at decision time** — a card past `expiresAt` or with `status !== 'active'` is treated as absent. This is what makes revocation "immediate" (§6): eligibility is recomputed per request from current card state, never cached into a running decision.
- When a card matches **and** the function's rung permits autonomy (Rung ≥ 3) **and** the request is inside envelope, `routeDetermination` may emit `{ kind: 'autonomous', disposition: 'approve', basis: 'goldCard', ... }`.
- Gold-carding can **only** approve. There is no "adverse gold card"; the type in §1.3 makes an autonomous denial via any basis impossible.
- `goldCardScoring` computes eligibility from historical determinations offline (batch job, not in the request path). Scoring never itself grants autonomy at request time; it only writes/expires `GoldCard` records that eligibility later reads.

### 2.3 Revocation & suspension

Revocation and suspension are writes to `GoldCard.status` (+ `revocation`) through a shell service; because eligibility reads current status per request, a revoke takes effect on the **next** decision with no cache to flush. A revoked card is retained (not deleted) for audit.

---

## 3. Circuit-breaker, kill-switch, audit, provenance

### 3.1 Provenance (stamped on every determination)

```
src/lib/pa/autonomy/provenance.types.ts
```

```ts
export interface Provenance {
  determinationId: string;
  fn: PayerFunction;
  rungExercised: Rung;
  autonomyPolicyVersion: string;     // §1.2
  goldCardPolicyVersion?: string;    // §2, when basis === 'goldCard'
  goldCardId?: string;
  ruleId?: string;                   // when basis === 'ruleMatch' (crdDerivation/publishedCoverage)
  clockSnapshot?: ClockSnapshot;     // §4, when basis === 'clockExpiryFailOpen'
  inputsDigest: string;              // hash of the normalized RouterInput (reproducibility)
  createdAt: string;
  actor: ActorRef;                   // 'system:autonomous' | ClinicianRef | ...
}
```

Every `Determination` carries `Provenance`. Autonomous approvals therefore always record *which policy version, which basis, which rule/card/clock* produced them — reconstructable and reversible.

### 3.2 Audit trail

```
src/lib/pa/autonomy/auditEvent.ts     // pure: build the immutable event
src/app/api/pa/audit/**               // thin shell: append-only sink
```

- Every autonomous action (and every human decision, and every breaker trip, and every gold-card grant/revoke) emits an append-only `AuditEvent { provenance, before, after, reversalOf? }`.
- Events are **reversible**: an autonomous approval carries enough state (provenance + `before`) to be programmatically walked back, and a reversal is itself an audit event referencing the original (`reversalOf`).
- The audit builder is pure; persistence is a thin shell writing to an append-only store (WORM semantics; no in-place update/delete).

### 3.3 Circuit breaker / kill-switch

```
src/lib/pa/autonomy/circuitBreaker.ts   // pure: state machine + trip predicates
src/app/api/pa/autonomy/breaker/**      // thin shell: state store + admin control
```

```ts
export type BreakerState = 'closed' | 'open' | 'halfOpen';
export interface BreakerBinding {
  scope: 'global' | { fn: PayerFunction } | { fn: PayerFunction; procedure: ProcedureCode };
  trips: TripRule[];  // e.g. override-rate > X, near-miss invariant > 0, error-rate spike
}
```

- **Kill-switch = force-open at the broadest scope.** A single admin action (and an automatic feature-flag off, §5) flips the breaker `open` at `global` scope, which makes `routeDetermination` fall back to `humanRequired` for all functions — the classic HITL path — with zero autonomous edges. This is the always-available manual override.
- **Automatic trips:** `circuitBreaker` is a pure state machine; the shell feeds it live metrics (§5). Any **near-miss on the denial invariant** (§6.4 detector firing) trips the breaker to `open` immediately and pages on-call. Elevated override rate or auto-approval anomalies trip per-function.
- When open, autonomy is unavailable but the platform keeps operating at Rung 2 (HITL) — **safe degradation, never a denial**.
- Breaker state changes are audited with provenance.

---

## 4. Fail-open-on-clock-expiry (wired to `paDecisionClock.ts`)

Regulation requires a determination within the decision timeframe (72h / 7-day per `paDecisionClock.ts`); when the clock expires without a human determination, the request **fails open to approval** — never a silent denial.

```
src/lib/pa/autonomy/failOpen.ts      // pure: clock → determination
```

- `failOpen.onClockExpiry(clock, request, now)` calls into the existing `paDecisionClock.ts` to test expiry. If expired **and** no `humanDecided` determination exists, it returns `{ kind: 'autonomous', disposition: 'approve', basis: 'clockExpiryFailOpen', provenance: { clockSnapshot, ... } }`.
- Because the outcome is an `autonomous` variant, it is — by the §1.3 type — necessarily an **approval**. A clock-expiry path that produced a denial is unrepresentable.
- This fail-open is **independent of rung**: it fires even for functions parked at Rung 0–2, because it is a regulatory floor, not an autonomy feature. (It is the one place a low-rung function can emit an `autonomous` node, and it can only ever be an approval.)

### 4.1 Distinguishing fail-open from substantive approval in audit

- `basis: 'clockExpiryFailOpen'` vs `basis: 'ruleMatch' | 'goldCard'` is the discriminator in provenance — always present, never inferred.
- The `clockSnapshot` (timeframe type, start, expiry, `now`, elapsed) is recorded **only** on fail-open events, giving auditors the exact timing that forced the approval.
- Metrics (§5) count `clockExpiryFailOpen` approvals on a **separate series** from substantive auto-approvals; a rising fail-open rate signals an operational SLA problem (humans too slow), not a working autonomy program, and is alarmed independently.
- Reporting/UX labels these "regulatory timeout approvals," never conflating them with clinical approvals.

---

## 5. Feature-flag gating & safe rollout

### 5.1 Flags (classic fallback = today's Rung-2 HITL everywhere)

Read via `flag('name')` from `NEXT_PUBLIC_*`. All default **off** ⇒ every function behaves exactly as today (HITL), no autonomous edges.

- `NEXT_PUBLIC_PA_AUTONOMY_ENABLED` — master gate for Layer D.
- `NEXT_PUBLIC_PA_AUTONOMY_SHADOW` — shadow mode: router computes what it *would* do and logs it, but the classic HITL result is what takes effect.
- `NEXT_PUBLIC_PA_GOLDCARD_ENABLED` — gold-card auto-approval.
- `NEXT_PUBLIC_PA_AUTONOMY_<FUNCTION>_CEILING` — per-function ceiling clamp (data-driven; still bounded by policy `ceiling`).

Flags **clamp** the policy ceiling; they can only *lower* autonomy, never raise it above policy. Flag-off and breaker-open both collapse to the same safe Rung-2 path (shared code, one fallback).

### 5.2 Rollout stages

1. **Shadow mode.** `AUTONOMY_ENABLED=off`/`SHADOW=on`. Router runs in parallel; every would-be autonomous approval is logged with full provenance but the human still decides. Gate to advance: shadow auto-approvals show **zero** denial-invariant near-misses and an agreement/quality bar vs human approvals over N determinations.
2. **Limited envelope.** Turn on for **one function** (prior auth is the natural first, already at Rung 2 → 3) at a **narrow** `EnvelopeSpec` (few procedures, tight clinical criteria, gold-card required). Breaker armed. Watch metrics daily.
3. **Widen.** Grow the envelope / raise per-function ceilings incrementally (Rung 3 → 4 for proven functions), one policy-version bump at a time, each reversible by flag or breaker.

### 5.3 Metrics (each per-function, per-policy-version)

- **Auto-approval rate** — autonomous approvals / total determinations; broken out by `basis` (`ruleMatch`, `goldCard`) — `clockExpiryFailOpen` tracked separately (§4).
- **Override rate** — human reversals of autonomous approvals / autonomous approvals; feeds a breaker trip rule.
- **Denial-invariant near-miss count** — MUST be 0; any non-zero trips the breaker and pages (§6.4).
- **Fail-open (timeout) rate** — regulatory-timeout approvals / total; an SLA alarm, not an autonomy success signal.
- **Time-to-determination** distribution; envelope hit/miss rate; gold-card coverage & expiry churn.

Metrics are emitted from audit events (single source), so dashboards and breaker inputs never diverge.

---

## 6. Test strategy (including adversarial)

Pure cores are exhaustively unit-tested (they have no I/O). The adversarial suite is a **gate on every milestone** and runs in CI on every change to `src/lib/pa/autonomy/**`.

### 6.1 Structural / type-level tests
- **Compile-fail fixtures** (via `tsd`/`expect-error`): attempting to construct `{ kind: 'autonomous', disposition: 'deny' }` (or `'partial'`) must **fail to type-check**. This proves the invariant is structural.
- ESLint `no-autonomous-adverse` rule has its own fixtures (valid/invalid).

### 6.2 Denial can NEVER be autonomous (property-based)
- Fuzz `routeDetermination` with **arbitrary** `RouterInput` (property-based, thousands of cases incl. adversarial: malformed clinical data, conflicting rules, hostile confidence scores, forged gold cards, every rung/function combo). Assert the invariant: **no output satisfies `kind === 'autonomous' && disposition !== 'approve'`**, for all inputs. Any `deny`/`partial` outcome must be `humanRequired` (proposed) or `humanDecided` (with a `ClinicianRef`).
- Assert every adverse `humanDecided` carries a **licensed** `ClinicianRef` (medical-necessity gate).

### 6.3 Clock-expiry always yields approval-not-denial
- Property test over `paDecisionClock` states: for every expired-clock input with no prior human determination, `failOpen` returns `disposition === 'approve'`, `basis === 'clockExpiryFailOpen'`, with a `clockSnapshot`. Assert **no** clock input path can yield a denial. Include boundary cases (exactly-at-expiry, 72h vs 7-day, DST/clock-skew inputs).

### 6.4 Gold-card revocation & expiry are immediate
- Given an active card producing auto-approval, then a revoke/suspend/expire between requests, assert the **very next** `eligibleCard` returns `null` and the next determination routes to `humanRequired` — no cached autonomy. Same for `expiresAt` crossing.
- **Near-miss detector test:** a synthetic scenario where an autonomous approval is emitted for a request whose clinical signals actually indicate adversity must be caught by the near-miss detector (which cross-checks autonomous-approval inputs against adverse signals) → count increments → breaker trips. This detector exists precisely to catch a *logic* mistake that the type system can't (approving something that should have been denied).

### 6.5 Circuit-breaker & audit
- Breaker state-machine unit tests (closed→open→halfOpen transitions, trip rules).
- Kill-switch test: force-open ⇒ all functions fall back to `humanRequired`; no autonomous node emitted.
- Audit completeness: every autonomous action, human decision, breaker trip, gold-card grant/revoke produces exactly one append-only event with full provenance and a valid reversal path; reversal test walks an autonomous approval back and links `reversalOf`.

### 6.6 Rollout safety
- Flag matrix tests: all-flags-off ≡ today's HITL (golden-master vs current behavior). Shadow mode never mutates the effective result. Flags can only lower, never raise, the policy ceiling.

---

## 7. Phased milestones (dependency-ordered)

Each milestone lists modules, an acceptance gate, and a definition of done (DoD). Milestones are strictly dependency-ordered; the adversarial suite (§6) is a standing gate from M1 onward.

### M1 — Core types & the structurally-safe router
- **Modules:** `rungs.ts`, `autonomyPolicy.ts`, `autonomyPolicy.schema.ts`, `determination.types.ts`, `determinationRouter.ts`, `capability.ts`, ESLint `no-autonomous-adverse`, `tsd` compile-fail fixtures.
- **Acceptance gate:** §6.1 (type-level) + §6.2 (property: no autonomous adverse) green; router is total; all-off flag path unchanged.
- **DoD:** `routeDetermination` is pure, total, exhaustively typed; "auto-deny" is a compile error; property tests pass at ≥ configured iteration count; no payer literals in `src/lib/pa/autonomy/**`.

### M2 — Gold-carding model
- **Modules:** `goldCard.types.ts`, `goldCardEligibility.ts`, `goldCardScoring.ts`.
- **Depends on:** M1.
- **Acceptance gate:** §6.4 (revocation/expiry immediate) green; eligibility is pure and evaluated against `now`.
- **DoD:** gold cards can only feed `basis: 'goldCard'` approvals; scoring is offline; revoke/suspend/expire take effect on next decision; cards retained for audit.

### M3 — Governance plane: provenance, audit, circuit-breaker/kill-switch
- **Modules:** `provenance.types.ts`, `auditEvent.ts`, `circuitBreaker.ts`, shell sinks under `src/app/api/pa/audit/**` and `src/app/api/pa/autonomy/breaker/**`.
- **Depends on:** M1 (M2 for gold-card provenance fields).
- **Acceptance gate:** §6.5 green; append-only store verified; kill-switch collapses to HITL.
- **DoD:** every autonomous/human/breaker/gold-card event audited with policy version + provenance; actions reversible; kill-switch and per-function/auto trips work; breaker state audited.

### M4 — Fail-open on clock expiry
- **Modules:** `failOpen.ts` (wired to existing `paDecisionClock.ts`); provenance `clockSnapshot`.
- **Depends on:** M1, M3.
- **Acceptance gate:** §6.3 green; fail-open events carry `clockSnapshot` and distinct `basis`; separate metric series exists.
- **DoD:** expired clock without human determination always yields approval-not-denial; rung-independent; audit distinguishes timeout approvals from substantive ones.

### M5 — Feature-flag gating & metrics
- **Modules:** flag wiring (`flag()` / `NEXT_PUBLIC_*`), metrics emitters derived from audit events, dashboards, breaker metric inputs.
- **Depends on:** M1–M4.
- **Acceptance gate:** §6.6 green; all-off ≡ today (golden master); flags clamp-only; metrics for auto-approval rate, override rate, denial near-miss, fail-open rate live.
- **DoD:** master + per-function + gold-card + shadow flags in place, default off; metrics feed both dashboards and breaker; classic fallback verified.

### M6 — Shadow-mode rollout
- **Depends on:** M1–M5.
- **Acceptance gate:** shadow run over N determinations shows **zero** denial-invariant near-misses and meets the agreement/quality bar vs human approvals.
- **DoD:** shadow logs would-be autonomous approvals with full provenance; effective results unchanged; go/no-go review documented.

### M7 — Limited-envelope activation (prior auth first, Rung 2 → 3)
- **Depends on:** M6.
- **Acceptance gate:** one function, narrow envelope, gold-card-required; daily metrics within thresholds; breaker armed; near-miss count 0.
- **DoD:** first real autonomous approvals in production, reversible by flag or breaker; on-call runbook + kill-switch drill completed.

### M8 — Widen
- **Depends on:** M7.
- **Acceptance gate:** each envelope/ceiling increase is a single policy-version bump with metrics holding and near-miss at 0; each step independently revertible.
- **DoD:** additional functions/procedures climb (Rung 3 → 4 where proven), governed entirely by policy config, no code change to raise autonomy.

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | An autonomous denial reaches a patient (regulatory violation, patient harm). | Low (structurally blocked) | Critical | Type-level impossibility (§1.3) + ESLint/CI grep + property tests + near-miss detector + breaker. Defense in depth. |
| R2 | A *logic* error auto-approves something that should have been denied. | Medium | High | Near-miss detector cross-checks autonomous approvals against adverse signals; trips breaker; shadow mode catches before production; override-rate monitoring. |
| R3 | Fail-open exploited (providers stall humans to force timeout approvals). | Medium | Medium | Separate fail-open metric + SLA alarm; timeout approvals flagged distinctly; staffing/SLA response, not a code fallback to denial. |
| R4 | Stale gold card auto-approves after provider quality degraded. | Medium | High | Cards always expire; per-request eligibility against `now`; immediate revoke/suspend; denial-rate threshold in scoring. |
| R5 | Policy misconfiguration raises autonomy too far. | Medium | High | Flags clamp-only (can't exceed policy); schema validation at boundary; policy-version stamped + audited; staged rollout. |
| R6 | Audit store gap makes an autonomous action irreversible/unexplained. | Low | High | Append-only WORM store; provenance mandatory on every determination; reversal-linkage tests; no-event ⇒ block action. |
| R7 | Breaker/kill-switch fails to actually stop autonomy. | Low | Critical | Kill-switch shares the flag-off fallback path (well-worn HITL code); periodic drills (M7 DoD); breaker-open tests. |
| R8 | Payer-specific behavior leaks into core logic. | Medium | Medium | Lint/CI guard against payer literals in `src/lib/pa/**`; all payer variance via policy data. |

## 9. Open decisions

1. **Envelope specification language.** How rich is `EnvelopeSpec` — enumerated procedures + criteria, or a small policy DSL? (Start enumerated; revisit if it grows unwieldy.)
2. **Gold-card scoring thresholds & window.** Exact approval-rate / denial-rate thresholds, window length, and minimum volume before a card is issued — needs clinical + compliance sign-off.
3. **Near-miss detector definition.** Precise cross-check for "should have been adverse" on an autonomous approval — which signals, what sensitivity vs false-positive tolerance (false positive = unnecessary breaker trip).
4. **Half-open recovery policy.** After a breaker trips, automatic half-open probing vs mandatory human re-arm.
5. **Audit store technology & retention.** WORM store choice and regulatory retention period per MA / state UM law.
6. **Licensed-clinician verification.** How `ClinicianRef` proves active licensure at decision time (integration point, out of pure core).
7. **Shadow-mode agreement bar.** The exact quality/agreement threshold and N to graduate M6 → M7.
8. **Cross-function envelope interactions.** Whether enrollment/eligibility autonomy can gate prior-auth autonomy, or each is fully independent.

---

## 10. Non-goals (this layer)
- No application/UI code is built now (this is a deferred plan).
- No autonomy in the **adverse** direction, ever — not a configuration option, not a future rung.
- No payer-specific hardcoding; all payer variance is policy data.
- No change to the existing pure cores' contracts; Layer D builds **on** `paDecisionClock.ts`, `dtrReadiness.ts`, `crdDerivation.ts` + `publishedCoverage.ts`, `patientContext.ts`, `pasBundle.ts`, consuming them rather than modifying them.
