# Ops Work-Item Status Lifecycle — Design & Honest Gap Analysis

**Status:** design / reflection artifact (no code changes). Drives the build backlog and keeps the demo narration honest.
**Scope:** the surveillance-findings, reconciliation-exception, and systematic-pattern routing surfaces
(`OperationsBoard`, `SurveillanceConsole`, `ReconciliationBoard`) and the governed work-item model behind them.

---

## 1. The problem observed

On the surveillance/reconciliation screens, a routed item shows a **destination** ("routed to Program-Integrity",
"routed → provider-revint", "✓ routed (advisory)") but not a **state**. There is no Open / In-Progress / Under-Review /
Pending-Info / Resolved. A queue whose items only say "routed" is a list of decisions with no life after the decision —
so a reviewer can't see how many are open, sitting with an analyst, awaiting a human decision, breaching SLA, or
auto-resolved by an agent with no human in the loop. That last view is the entire operational and governance value.

This is the same missing piece as the "do the Route buttons actually do anything" question, one layer up:
**an item today gets a routing destination, but not a governed lifecycle.**

---

## 2. Ground truth — what exists today (real vs. thin vs. stub)

The lifecycle machinery already exists in the lib layer; it is only fully wired on one of the four surfaces.

| Surface | Route action calls | Lifecycle today | Honest label |
|---|---|---|---|
| **Recovery / appeal** (`workflow.ts` `WfState`) | `onStartAppeal` → instantiates a `Workflow` | **Full**: `assembling → awaiting-review → awaiting-release → released → awaiting-response → accepted / denied / rejected`; SLA clock (`slaHours`, `respondTick`, `slaWarned`, `SLA_WARN_FRACTION`); each step sealed to the ledger; status **derived** via `ticketStatusFor()` | **REAL** — reference implementation |
| **Surveillance findings** (`SurveillanceConsole`) | `op.route(...)` then `op.grab(...)` | **Thin**: `detected → routed → Assigned → Proposed → Closed`; routing sealed (`routedSeal`) | **REAL but shallow** — no in-progress / under-review / pending-info / SLA / resolved-vs-closed |
| **Reconciliation systematic patterns** (`ReconciliationBoard`) | `op.routePattern(...)` | **One-shot**: sets a flag, renders `✓ routed (advisory)` | **DEPICTED, not actuated** — the "dumb message" |
| **Per-claim exceptions** (`ReconciliationBoard`) | `op.routeRecon(seq)` (or `onStartAppeal` to promote) | **One-shot** `✓ routed → role`, unless promoted into the appeal workflow | **DEPICTED** (handoff label) / **REAL** (only if promoted to appeal) |

Primitives already in the codebase to reuse (do **not** fork a parallel status machine — `workflow.ts` explicitly warns
"there is no parallel status machine"; status is derived from the step machine):

- `WfState` + `WfStep` + `ticketStatusFor()` — the derive-status-from-steps pattern.
- `WorkItem` / `QueueName` (`auto-cleared`, `ready-to-submit`, `high-risk-review`, `denied-appeal`, `more-info`,
  `agent-proposal`, `escalated`) + `slaHours`, `submittedAt`, `dueBy`.
- `governedAction` lifecycle: `proposed → approved → executed | rejected`, sealed to the ledger.
- `escalationRouter` (party/role routing, `queue: 'escalated'`), `escalationSignals`.
- `WfNotification` kinds: `assigned`, `approval-needed`, `released`, `response-received`, `resolved`, `sla-warning`.
- SLA clock: integer-tick, deterministic (`TICKS_PER_HOUR`, `SLA_WARN_FRACTION = 0.75`).

**Conclusion:** the gap is not a missing capability — it is that three of the four surfaces don't instantiate the
lifecycle that the fourth already proves out.

---

## 3. Root insight — routing and status are one fix, not two

The "Route buttons don't do anything" gap and the "no statuses" gap have the **same** root cause and the **same** fix:

> A route action must **instantiate a workflow-backed ticket**, not set a `routed` flag.

Once a routed finding/pattern/exception becomes a ticket whose status is **derived from a step machine** (exactly like
the appeal path), it automatically gets: a durable queue placement, a lifecycle status, an SLA clock, sealed
transitions, and downstream consumption by the target seat's workbench. One change closes both gaps.

---

## 4. Target status model (generalize `WfState`, per ticket kind)

Keep the derive-from-steps rule. Add ticket **kinds** for the surveillance/recon destinations, each with its own step
sequence; the human-facing status is derived from the current step. Candidate ticket kinds (from the existing route
targets): `fee-schedule-reprocess` (→ payer Claims-Config), `fwa-case` (→ payer Program-Integrity), `member-liability-review`
(→ payer-pi), `bundling-downcode-dispute` (→ provider-coding), `timely-filing-review` (→ provider-revint),
`underpayment-appeal` (already exists).

**Human-facing status set (the queue chip — keep it to ~6; the rest are sub-state):**

| Status | Meaning | Derived from |
|---|---|---|
| **New / Detected** | finding created, not yet routed | pre-route |
| **Routed** | placed in a named role-queue, unassigned | routing sealed, no owner |
| **In Progress** | a seat (or agent) has picked it up and is working it | owner set / grabbed |
| **Awaiting Decision** | an action is *proposed* and suspended at the human gate (HITL) | `proposed`, `awaiting-review`/`awaiting-release` |
| **Pending Info** | waiting on records / provider or payer response | `awaiting-response`, `more-info` |
| **Resolved** | outcome recorded (reprocessed, case closed, appeal accepted/denied, cleared) | terminal step |
| **Escalated** *(cross-cutting)* | SLA breach or authority-exceeded → hop to a higher seat | `queue: 'escalated'` |

**Two overlays on every ticket (not extra statuses — badges):**

- **Autonomy tag** — `auto-resolved` vs `human-gated`, from the Twin-Ladder rung. An A3 arithmetic-undisputed item may
  read `New → Resolved (no human required — mutual consent)`; **any adverse action or payer↔provider submission is
  forced** `New → Routed → Awaiting-Decision → Approved/Rejected → Resolved`. Showing that contrast — some items
  auto-clear, adverse ones structurally cannot — is the single most persuasive thing this screen can demonstrate.
- **SLA state** — `on-track` / `warning` (≥ `SLA_WARN_FRACTION`) / `breached`, from the existing tick clock.

---

## 5. Transitions & governance (every transition is a sealed ledger event)

Each transition emits a sealed record carrying: **actor** (human seat id, or agent id + autonomy rung), **tick**,
**reason**, the **Twin-Ladder verdict** at that moment, and the emitted **notification**. The status lifecycle *is* the
forensic log made legible — which is the NIST "live agent-activity recording" story, not a static checklist.

```
New ──route()──▶ Routed ──grab()/auto-assign──▶ In Progress
   In Progress ──propose(action)──▶ Awaiting Decision ──approve()──▶ (execute) ──▶ Resolved
                                   └─reject()──────────────────────────────────▶ Resolved (rejected)
   In Progress / Awaiting Decision ──needs-info──▶ Pending Info ──response──▶ (back to prior)
   any human-owned state ──SLA breach / authority-exceeded──▶ Escalated ──▶ (re-enter at higher seat)
```

Governance rules baked into the transitions:
- **Adverse / submission tickets cannot skip Awaiting Decision** — the interlock forces the human gate regardless of rung
  (the `isSubmission` invariant already in `governedAction`).
- **Segregation of duties** — reviewer ≠ releaser (already modeled: `APPEAL_REVIEWER_SEAT` vs `APPEAL_RELEASER`).
- **Auto-advance is allowed only for agent steps within the permitted rung**; everything else waits on a seat action.
- Notifications (`assigned`, `approval-needed`, `sla-warning`, `resolved`) fire on the matching transition — the model
  already defines them; they just need to be raised from the generalized machine.

---

## 6. UI implications (the three boards)

1. **Status chip on every routed row** (not just "routed"): the 6 human-facing statuses + SLA badge + autonomy tag.
2. **Queue views grouped / filterable by status** — "Open", "Awaiting my decision", "Breached SLA", "Auto-resolved".
   The per-role work-baskets in `OperationsBoard` already group by role; add the status dimension.
3. **The contrast panel** — a count of `auto-resolved (no human)` vs `awaiting human decision` vs `escalated`. This is
   the governance money-shot and is currently invisible.
4. **Ticket detail** — show the step machine (done/pending), the sealed actor per step, and the SLA clock (already true
   for the appeal workflow; extend to the other kinds).

---

## 7. Build backlog (prioritized)

- **P1 — Generalize the workflow-backed ticket.** Lift `WfState`/`ticketStatusFor` into a kind-parameterized step
  machine and give each route target (`fee-schedule-reprocess`, `fwa-case`, `member-liability-review`,
  `bundling-downcode-dispute`, `timely-filing-review`) its own step sequence. Make `op.routePattern` / `op.routeRecon`
  **instantiate a ticket** instead of setting a `routed` flag. *This one change closes both the routing-actuation gap
  and the status gap.*
- **P2 — Surface status.** Status chip + SLA badge + autonomy tag on every row across the three boards; add the
  status filter/group and the auto-vs-human contrast panel.
- **P3 — Deepen the surveillance lifecycle.** Extend `detected → routed → Assigned → Proposed → Closed` to the full
  set (In-Progress, Pending-Info, Resolved-vs-Closed) so surveillance matches the appeal path.
- **P4 — Wire notifications.** Raise the existing `WfNotification` kinds from the generalized transitions so the
  inbox/work-baskets update on state change.
- **P5 — Seal every transition.** Ensure each status change appends a sealed ledger record (actor + rung + reason),
  so the Forensic-Log view shows the lifecycle and it stays replayable.

---

## 8. What to say in the demo *today* (honesty line)

> "The recovery/appeal path runs a full governed lifecycle end to end. The surveillance and reconciliation routing
> computes and **seals the correct governed destination** — who it goes to and why — but the downstream work-item
> lifecycle on those two is **depicted, not yet actuated**. The backlog is to instantiate the same workflow-backed
> ticket the appeal path already uses, so every routed item carries a real status, SLA, and audit trail."

That framing is defensible to a payer/State audience, credits what is real, and names the build honestly.
