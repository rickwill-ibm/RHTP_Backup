---
name: delivery-preflight
description: >
  This skill should be used BEFORE producing any substantial deliverable or code
  change — a document, deck, chart, plan, analysis, report, spreadsheet, module,
  patch, or architectural decision. It runs a default-deny pre-flight gate that
  confirms FRAME, SHAPE and DONE with the user before work starts, and governs how
  the result is reported. Trigger phrases include "build", "create", "write",
  "produce", "make me a", "draft", "update this", "fix", "implement", "put together",
  "generate a deck/chart/plan/report", "review the codebase", "harden", "red team",
  "what else is missing". When in doubt, run it — the cost of running it is one line;
  the cost of skipping it is a wrong deliverable.
metadata:
  version: "0.1.0"
---

# Delivery Pre-Flight

This gate exists because of five observed, catalogued failures: two adherence
failures (built solo against a standing coalition rule; skipped a mandated
verification check), four specification failures (wrong FRAME twice, wrong SHAPE
twice), and one convention failure (recommendation buried on page 6 of 11). Plus
one runaway research agent: 25 minutes, 51 fetches, nothing produced.

Four of those five were caught by the user reading output, not by any control.
The job of this skill is to make them cheap to catch *before* the work happens.

---

## 1. The gate — default-deny, three fields

Before writing the first line of any substantial deliverable, emit exactly this
and **STOP. Do not begin work. Wait for the user's confirmation.**

```
FRAME = <what world this work is in — the target architecture, the institution,
         the audience, the operating context>
SHAPE = <what the finished thing looks like, in one line — "7 market cards in
         3 tiers", "one 16:9 slide", "24-page Word doc, editable tables">
DONE  = <the falsifiable condition that makes this finished>
BUDGET = <max wall-clock and/or tool calls, when research or subagents are involved>
— confirm before I build
```

Rules that make this real:

- **Stopping is the point.** Stating the three fields and proceeding in the same
  turn is not the gate; it is narration. Stop.
- **Never infer FRAME from a source document.** If the user hands over a plan, a
  deck, or a prior artifact, the frame *of that artifact* is a hypothesis, not the
  target. Inheriting a document's architecture while correcting its facts is the
  single most expensive failure mode on record. State the frame you believe applies
  and let the user correct it.
- **SHAPE is the user's word, not yours.** Terms like "market map", "mode",
  "one-pager", "chart" carry a definition the user holds. If the term is one that
  could mean two different artifacts, say which one you mean, concretely, in the
  SHAPE line.
- Skip the gate only for trivial, reversible, single-step work: answering a
  question, one-line edits, a lookup.

## 2. Method declaration — solo requires an affirmative yes

Before the first `Write` or `Edit` of a new module, file, capability, or a
consulting deliverable, declare the method in the gate:

```
METHOD = solo | coalition | coalition + adversarial | coalition + adversarial + red-team
```

**Solo is default-deny for anything non-trivial.** If the work is a multi-screen,
architectural, or IA decision; a new capability; a patch to ship; or a
consulting-grade deliverable — run the coalition. Use the `agentic-build-framework`
skill for the full operating model, and dispatch the coalition seats defined in
this plugin's agents, whose tool grants make the wrong behaviour impossible rather
than merely discouraged.

## 3. Budgets bind subagents, not prose

A budget stated in a parent prompt is not transmitted to a subagent as a
constraint. Enforce it structurally: dispatch research through the
`bounded-researcher` agent (turn-capped, no write tools) rather than an
unconstrained general agent. State the budget to the user, and when a budget is
hit, **stop and report what you have** — never overrun silently.

## 4. The six non-negotiables (from CLAUDE.md, restated here because CLAUDE.md does not load in Cowork)

1. **VERIFY LIVE.** Every claim — yours, a subagent's, a document's, a
   screenshot's — is a *hypothesis* until confirmed against the live working tree
   on disk, never a stale copy, upload, or baseline. Subagents review snapshots;
   re-verify locally.
2. **REUSE FIRST.** Before writing new code, grep for an existing hook, component,
   store, or helper and bind to it. A second hook, a duplicate constant, a parallel
   store is a defect. Name the seam being reused.
3. **DECISION → COALITION + RED-TEAM.** Any multi-screen, architectural, or IA
   decision runs the coalition and the R1–R5 adversarial lenses, with
   chain-of-thought and tree-of-thought, *before* code.
4. **DoD GATES (E1–E16).** Browser-verified on the running app · relevant grep-gate
   green · demo-preservation parity re-walked · quality ratchet respected (never add
   to a file in `quality-baseline.json`) · `npm run check:all` exits 0.
5. **SINGLE SOURCE.** Extend the existing store, registry, or engine. Never fork a
   parallel context or state mechanism.
6. **VISIBLE CLOSE-OUT.** If it isn't stated, it wasn't done.

Standing non-negotiables for the RHTP codebase: BFF-only security invariant · AI
guardrails server-side, deterministic-first, human-gated, PHI-safe, labelled,
feature-flagged · quality ratchet · `check:all` exits 0 before a task is done.

## 5. Reporting — receipts, not checkmarks

A Definition-of-Done checklist written by the same model that did the work carries
zero information: the model that skipped a verification step writes "✓ verified"
with exactly the same fluency as the model that ran it.

Therefore:

- **A DoD line may assert nothing without a receipt** — a file path, an exit code,
  a command that ran, an artifact name, a timestamp, a tool-call result.
- **A check with no receipt is OMITTED, not asserted.** The missing line is the
  signal. Never fill a checklist to make it look complete.
- Report what was *not* done as explicitly as what was. An all-green checklist is
  a red flag, not a pass.

## 6. Output conventions

- **Recommendation in the first 100 words.** Always. Never on page 6.
- **Restate FRAME and SHAPE in the header of the deliverable itself**, so drift is
  visible in the artifact rather than having to be remembered from the prompt.
- Thought-leader voice, not vendor voice.
- Say directly when the scope looks wrong rather than carrying it forward silently.
- Expert seats are specified to the actual institution in scope — a South Dakota
  Medicaid MES architect, not a generic payer SME.

For repo-specific commands, repo map, read order and stop conditions, read
`AGENTS.md` in the repo root — it is the single source and is deliberately not
duplicated here.

## 7. Structuring the request

See `references/prompt-sections.md` for the section structure that eliminates the
specification failures — what belongs in the standing layer versus what belongs in
each request, and where each physically lives in Cowork.
