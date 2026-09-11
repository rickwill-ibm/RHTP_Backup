# Prompt Sections — the two layers, and where each physically lives

The standard framing is two halves, and they are two *different* layers with two
different homes. Collapsing them is what produced four of five observed failures.

```
  STANDING LAYER (set once)            PER-REQUEST LAYER (typed each time)
  ┌──────────────────────┐             ┌──────────┐  ┌──────────┐
  │ Role  — who to be    │             │   TASK   │  │ CONTEXT  │
  │ Tone  — how to speak │             └──────────┘  └──────────┘
  │ Constraints — avoid  │             ┌──────────┐  ┌──────────┐
  └──────────────────────┘             │CONSTRAINTS│ │  OUTPUT  │
                                        └──────────┘  │  FORMAT  │
                                                      └──────────┘
```

---

## Layer 1 — Standing (Role / Tone / Constraints)

Set once. This is what turns a generalist into a specialist.

**Where it must live in Cowork — this is the part that goes wrong.**

| Home | Loads in a Cowork session? |
|---|---|
| `<repo>/CLAUDE.md` | **No.** Auto-loads from the session's working directory. In Cowork that is the cloud container, not the repo — the repo is on the far side of the device bridge. It enters context only if the assistant chooses to read it. |
| `<repo>/.claude/skills/` | **No.** Project-scoped; Cowork launches with `--setting-sources user`. |
| **Cowork project instructions** | **Yes.** |
| **Account-level skill or plugin** (this one) | **Yes** — syncs into the sandbox. |
| **Memory preferences** | **Yes** — re-delivered each session. |

Put the standing layer in the Cowork project instructions and in this plugin.
Keep `CLAUDE.md` in the repo for CLI sessions; it is not the Cowork delivery path.

The standing block itself is in `system-prompt.md` in this directory. It is also
the preamble every coalition agent in this plugin inherits, so a seat cannot drift
from the house standard just because it runs in its own context.

---

## Layer 2 — Per-request (Task / Context / Constraints / Output Format)

Typed each time. Here is the mapping that matters, and the diagnosis:

| Box | What it carries | Observed failure when omitted |
|---|---|---|
| **Task** | One sentence, imperative, one outcome. | — This box was almost always filled. |
| **Context** | **The FRAME.** What world this sits in: target architecture, institution, audience, operating context. | **Both FRAME failures.** "Fix this plan" inherited the plan's own architecture — payer instead of state, demo-repair instead of production system. The frame lived in the source document and in the requester's head, never in the prompt. |
| **Constraints** | What to avoid, plus the **budget**. | The 25-minute / 51-fetch research run. No budget was stated, so none bound. |
| **Output Format** | **The SHAPE and the DONE condition.** What the finished artifact looks like; what makes it finished. | **Both SHAPE failures** — a strategy scatter where a market map was wanted; a persona where a mode was wanted. Plus the buried recommendation. |

**The diagnosis in one line: Task was being filled; Context and Output Format were
being skipped — and those two boxes are exactly where four of the five failures
came from.**

This is why the pre-flight gate confirms three fields and no more. FRAME is the
Context box. SHAPE and DONE are the Output Format box. BUDGET is the Constraints
box. Task is the request itself. Ten fields get trimmed to four under time
pressure, and the expensive ones — the ones requiring actual thought — are the
first to go. Three fields at 90% compliance beats ten at 20%.

---

## The minimum viable request

```
TASK     Retarget the overview deck from payer to state Medicaid/HHS.
CONTEXT  FRAME = state agency buyer, SD FFS with PCCM, no risk-based MCOs.
         Not a payer deck with words swapped.
CONSTRAIN No claim that isn't backed by a file:line or a citation. 20 min.
OUTPUT   SHAPE = same visual system, same slide count, relabelled.
         DONE = every changed label validated against the codebase, render check shown.
         Recommendation first.
```

Four lines. If only one line can be written, write CONTEXT — the frame is the box
whose omission is most expensive and least recoverable.
