# RHTP Session Adherence — Hardened Design (v2)

v1 of this document was wrong in its diagnosis. This version supersedes it.
The corrections are listed at the end so the reasoning is auditable.

---

## Root cause (verified, not inferred)

Your framework did not decay during the session. **It never loaded.**

| Artifact | Where it lives | Loaded in a Cowork session? |
|---|---|---|
| `CLAUDE.md` | `<repo>/CLAUDE.md` on your Windows machine | **No.** Claude Code auto-loads CLAUDE.md from the session's working directory. In Cowork that is the cloud container (`/home/claude`), not your repo — the repo is reachable only through the device bridge. It enters context only if the assistant chooses to read it. |
| `AGENTS.md` | `<repo>/AGENTS.md` | **No**, same reason. |
| `agentic-build-framework` skill | `<repo>/.claude/skills/` | **No.** Project-scoped. Cowork launches with `--setting-sources user`; the container's skills come from the account-synced set. |
| `tools/hooks/pre-commit`, `pre-push` | repo, `core.hooksPath=tools/hooks` | **Yes** — these are real and they fire on any commit in that repo. |
| `.claude/settings.json` hooks | does not exist in your repo | N/A — and would not load in Cowork regardless. |

So during the failing session, the only part of your framework that was live was the
git-hook/CI path — which has jurisdiction over commits, and four of the five failures
were document deliverables that never reach a commit.

Your `CLAUDE.md` already contains the right control. It opens by naming the exact
problem ("the full framework scrolls out of working memory mid-task") and mandates a
**VISIBLE PRE-FLIGHT LINE** with the closing rule *"If it isn't stated, it wasn't done."*
That is the correct design. It was never delivered to the session that needed it.

**Fix the address before adding more framework.**

---

## Reclassify the five failures honestly

Framing all five as "adherence" implies stated rules were ignored. In the majority the
rule was never present at that turn — and half the fix is on the requester's side.

| # | Failure | Class |
|---|---|---|
| 1 | Solo build despite standing coalition rule | **Adherence** |
| 2 | Skipped render verification | **Adherence** |
| 3 | Wrong FRAME ×2 (payer→state; demo-repair→production) | **Specification** — the frame was in the source document and in your head, not in the prompt |
| 4 | Wrong SHAPE ×2 (strategy scatter vs market map; persona vs mode) | **Specification** — "market map" and "mode" carry a definition you hold and did not transmit |
| 5 | Recommendation on page 6 of 11 | **Convention** |

2 adherence · 4 specification · 1 convention. An adherence framing generates more
framework as the answer to failures more framework cannot touch.

---

## Layer 1 — Delivery (do this first; it is mostly a copy)

Move the framework from **repo scope** to **account scope**, so it materialises inside
every Cowork container automatically. Account-level skills and plugins demonstrably sync
into the sandbox; repo-level ones do not.

- Package `agentic-build-framework` (SKILL.md + `references/`) as an account-level skill
  or a Cowork plugin.
- Put the six-point PRE-FLIGHT block at the very top of the SKILL.md body, not in a
  reference file — the body is what loads.
- Keep `CLAUDE.md` in the repo for CLI sessions. It is not the Cowork delivery path.

**Open item, worth one 10-minute test:** whether a plugin's `hooks/hooks.json` fires in
Cowork. Hooks *do* execute in the Cowork container — this session's git identity was set
by a `SessionStart` hook that ran before your first message — but those come from a
root-owned launcher file, and the public reports of plugin hooks not firing
(`--setting-sources user`) are unverified bug reports, not tested behaviour. If plugin
hooks do fire, you get a real `UserPromptSubmit` injection channel and a real `Stop`
gate, and most of the layers below become unnecessary.

---

## Layer 2 — Physics (structural; not persuasion)

Convert rules into topology, so the failure is arithmetically impossible rather than
discouraged.

**Coalition seats as defined agents with tool grants.** Runtime-enforced, verified:

```yaml
# reviewer / adversarial seat — cannot build, by construction
tools: Read, Grep, Glob
disallowedTools: Write, Edit
```
```yaml
# research seat — cannot run 51 fetches, by arithmetic
tools: WebSearch, WebFetch, Read
maxTurns: 12
```

A reviewer that cannot write cannot go solo and build. A researcher with a turn cap
cannot burn 25 minutes. That is failure #1 and the runaway subagent, fixed structurally.

**Workflow script for the sequence.** A workflow script runs *outside* the assistant's
decision loop: the script decides the order, not the model, and `agent()` calls take an
output `schema` that forces structured returns. Encode the coalition as
`design → adversarial → build → adversarial → verify` and the phases cannot be reordered
or skipped, because skipping is not an option the model is offered.

**Schema-constrained deliverables.** The SHAPE failures are exactly the class schemas
eliminate. A market map emitted as validated rows *cannot* come back as a strategy
scatter — the wrong shape fails validation instead of arriving as a plausible document.

---

## Layer 3 — Detection (optimise what already works)

You caught 5 of 5. Human review of output is the control in this system that is
demonstrably working. Make drift cheaper to spot rather than harder to produce.

**The echo-back gate — three fields, default-deny.** Before any substantial build, one
line, then *stop and wait*:

```
FRAME = <what world this work is in>
SHAPE = <what the finished thing looks like, one line>
DONE  = <the falsifiable done condition>
— confirm before I build
```

Three seconds of your attention. Available at turn 34, which a pasted prompt-prefix is
not. Covers failures #3, #4 and #5. This is your own PRE-FLIGHT LINE with a stop added.

**Three fields, not ten.** Under time pressure people keep the cheap fields and drop the
expensive ones — and FRAME, SHAPE and DONE are both the expensive ones and the three
that map to the observed failures. A control's value is coverage × compliance; 90%
compliance on three fields beats 20% on ten.

**Restate FRAME and SHAPE in every deliverable header**, so drift is visible in the
artifact instead of having to be remembered from the prompt.

**Receipts, not checkmarks.** A DoD line may assert nothing without a receipt — a file
path, an exit code, an artifact name, a timestamp. A check with no receipt is
**omitted**, and the omission is the failure signal. An all-green checklist written by
the model that did the work is unfalsifiable by construction: the model that skipped the
render check writes "✓ render verified" with exactly the same fluency as the model that
ran it. Never let `ci-gates.sh` read the prose checklist — that converts an unreliable
signal into an official record.

---

## Layer 4 — Instrumentation

Five columns, two weeks, roughly twenty rows: *task · echo-back used y/n · FRAME+SHAPE
stated y/n · failure y/n · failure class*. This settles the adherence-vs-specification
argument with data instead of argument, and lets a control be retired rather than
becoming ritual.

---

## Corrections to v1

| v1 claim | Status |
|---|---|
| "There is no kill switch — hooks do not fire in Cowork." | **Overstated.** Hooks execute in the Cowork container; the reports concern *your* hooks being on the wrong machine. Delivery problem, not a capability gap. |
| "Your framework is persuasion that decays." | **Wrong.** It is persuasion that never arrived. |
| "The framework sits at the wrong altitude." | **Wrong address, not wrong altitude.** |
| "Paste a ten-section control block before every prompt." | **Same failure class as what it replaced**, with a worse duty cycle — nobody pastes it at turn 34, which is where the failures happened. Replaced by the three-field echo-back gate. |
| "Fold the block into `agent-coalition-first`." | **Circular.** Failure #1 *was* that skill not firing; nesting the control inside it makes the control unavailable on the exact task class where it misfires. |
| "Add a DoD gate to `ci-gates.sh`." | **Harmful as specified** — it would launder self-report into an official record. Gate on receipts only. |
| "`ci-gates.sh` is real enforcement." | **True but narrow.** Verified installed (`core.hooksPath=tools/hooks`, `pre-commit`, `pre-push`). Jurisdiction is the commit path only — absent for 4 of the 5 observed failures. |
| "Hooks are the only deterministic in-session control." | **False.** Subagent tool grants and turn caps, workflow scripts, and output schemas are all deterministic and available in Cowork today. |
