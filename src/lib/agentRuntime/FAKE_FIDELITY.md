# Fake-fidelity ledger — in-memory WorkflowEngine vs real Temporal (L1)

The journey-lane runtime is verified in CI against the **in-memory fake**
(`InMemoryWorkflowEngine`) because real Temporal needs a running server and this
sandbox has no Docker. Per the L1 rule (fake-fidelity ledger required), this file
names EXACTLY what the fake does NOT model, so no reader mistakes a green unit
suite for production-durable behavior. Each gap has a matching Docker-guarded
assertion in
[`tests/integration/agentRuntime.temporal.testcontainers.test.ts`](../../../tests/integration/agentRuntime.temporal.testcontainers.test.ts),
which skips-with-reason until a Temporal/Docker environment runs it in CI.

The fake is faithful to the runtime CONTRACT (the `WorkflowEngine` interface,
the HITL `proposeAndWait` semantics, per-member ordering, escalation-as-data,
PHI-safe event types, least-privilege tool enforcement). It is NOT faithful to
Temporal's DURABILITY and DELIVERY guarantees. The gaps:

| #   | Property                                  | Real Temporal                                                                                                                                          | The in-memory fake                                                                                                 | Risk if confused                                                            |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | **Durable timers across restart**         | Timers (escalation SLAs, `setTimer`) are persisted in the cluster; they survive a process/worker restart and fire on schedule.                         | Timers live in a `Map` in one process and advance only via `advanceTime()`. A restart loses every pending timer.   | An escalation SLA silently never fires after a deploy.                      |
| 2   | **At-least-once activity retries**        | Activities (the tool effects) are retried with a configurable policy until success or a retry cap; idempotency keys make them safe.                    | `useTool` runs the effect exactly once and never retries on failure; a throw just rejects the workflow.            | A transient send failure is treated as terminal; the touchpoint is dropped. |
| 3   | **Worker crash recovery**                 | Workflow state is event-sourced in history; a crashed worker's workflows resume on another worker from the last committed event with no lost progress. | State is in-process object graphs; a crash loses all running workflows and their suspended `proposeAndWait` waits. | An approved proposal never resumes after a crash mid-journey.               |
| 4   | **Visibility / query**                    | Workflows are queryable across the cluster (list, filter, `query` by id) from a durable visibility store, even after the calling process is gone.      | `query()` reads a local `Map`; nothing is visible outside this process or after it exits.                          | An ops dashboard shows no in-flight journeys after a restart.               |
| 5   | **Sticky execution / determinism replay** | Workflow code is re-executed deterministically from history on resume; non-deterministic changes are caught by replay; sticky caches speed resume.     | The workflow body runs once as a plain async function; there is no history, no replay, no non-determinism check.   | Code that reads wall-clock time passes the fake but breaks real replay.     |

## What the fake DOES guarantee (and the integration spec re-checks)

- The HITL primitive suspends until a decision and never auto-executes at the
  `HITL` tier (guardrail).
- Per-member ordering under concurrent signals (partition = memberId).
- Escalation walks the hierarchy, then ABANDONS the proposal with audit: its own
  `agent.task.abandoned` event, the work item moved to the `parked` queue, and the
  workflow terminated with status `abandoned`. Never a silent expiry, and never a
  synthesised approval or rejection. A decision arriving afterwards is refused with
  `WorkflowTerminatedError`; the runtime provides NO re-activation path, so re-filing
  a parked item is a human act.
- **The escalation SLA is an INTERNAL review clock, with no relationship to 42 CFR
  438.210(d).** It is measured from `proposeAndWait` — the moment this runtime was
  asked — whereas the regulation's 7-calendar-day standard and 72-hour expedited
  timeframes run from RECEIPT OF THE REQUEST FOR SERVICE, which this runtime never
  observes. Abandonment is therefore not a determination: it issues no notice and
  starts no appeal clock, and 42 CFR 438.404(c)(5) (an untimely decision IS a denial,
  notice due the day the timeframe expires) is discharged by nothing here. Reading a
  green escalation suite as timeliness compliance would be a category error.
- Only the pre-allocated C2 event types are emitted; anything else throws
  `UnallowedAgentEventError`.

### 6 · THE ESCALATION LADDER NEVER FIRES IN THE RUNNING APPLICATION

This is the most important line in this file and it was missing from it.

Virtual time advances **only** through `advanceTime()`, and `advanceTime()` has **zero callers in
`src/`** — verified by grep, not asserted. Every composition root constructs
`createManualClock(Date.parse(...))` at a pinned instant and never moves it: the financial-clearance
route, the recovery decision-support path, the escalation console and its sibling reviewer pages. No
driver exists.

So, in the app a reviewer actually uses:

- no `agent.task.escalated` hop is ever emitted;
- no proposal is ever abandoned, so `agent.task.abandoned` is never emitted;
- **no work item ever reaches the `parked` queue by this path**, and the "Parked (escalation
  exhausted)" lane on the work-queue page is, from the runtime, permanently empty;
- `WorkflowTerminatedError` is unreachable in production — the only production signaller
  (`runReconstructAndSignal`) builds a *fresh* engine and replays to suspension, so it has no
  abandoned instance to refuse against and the decision is simply accepted.

Row 1 above ("a restart loses every pending timer") is true and is the WEAKER claim; read alone it
implies timers fire between restarts. They do not fire at all. The ladder, its terminal and their
tests are a correct, tested subsystem with no production driver — which is a real gap and is filed as
G-057, not something this file should let a reader discover for themselves.

Closing it needs a wall-clock or sweep driver at the `// SEAM: workflow-engine` anchor, wired from a
composition root and asserted by an E14 wired-path test. That is a wave with its own design round.

## How to run the real spec

```
DOCKER_HOST=... npx vitest run tests/integration/agentRuntime.temporal.testcontainers.test.ts
```

With Docker present it starts a Temporal dev server (testcontainer), runs the
same proposeAndWait / escalation / ordering flows, then asserts properties 1–5
that the fake cannot: it restarts the worker and confirms a pending escalation
timer STILL fires (1), kills a worker mid-journey and confirms the approved
proposal resumes (3), and queries the workflow from a second client after the
first exits (4). Until then it prints a clear skip reason and the unit suite
(`tests/agents/*`) covers the contract in-process.

**Live-integration-executed count: 0 (CI-pending).** No Temporal container has run
in this environment; the spec is authored-for-CI and skips here.
