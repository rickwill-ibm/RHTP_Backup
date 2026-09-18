# RHTP Delivery Framework

Packages the delivery standard as an **account-level Cowork plugin**, so it loads
in every session instead of sitting in a repo the session cannot see.

## The problem this fixes

`CLAUDE.md`, `AGENTS.md` and `<repo>/.claude/skills/` do **not** load in a Cowork
session. Cowork runs in a cloud sandbox; the repo is on the far side of the device
bridge, and Cowork launches with `--setting-sources user`, which excludes
project-scoped settings and skills. The framework was never decaying mid-session —
it was never arriving. Account-level plugins sync into the sandbox, so this one
does arrive.

## Components

| Component | What it does |
|---|---|
| **skill: delivery-preflight** | The default-deny gate. Confirms FRAME · SHAPE · DONE before work starts, declares solo vs coalition, binds budgets, and governs reporting (receipts, not checkmarks; recommendation first). |
| **skill: agentic-build-framework** | The full operating model, wave unit, R1–R5 persona library and E1–E16 enforcement kit. Unchanged from the repo original. |
| **agent: adversarial-reviewer** | Red seat. Tool grant is `Read, Grep, Glob, WebSearch, WebFetch` — **no Write or Edit**, so it is structurally incapable of becoming the builder. |
| **agent: bounded-researcher** | Research seat, hard budget (default 10 min / 12 fetches), no write tools. Exists because a budget stated in a parent prompt does not bind a subagent. |
| **hooks** | `SessionStart` delivers the standing system prompt; `UserPromptSubmit` re-injects the three-field gate on **every turn** — the only channel that survives compaction. |

## References worth reading

- `skills/delivery-preflight/references/system-prompt.md` — the standing Role /
  Tone / Constraints block. Paste it into Cowork project instructions; every agent
  here already inherits it.
- `skills/delivery-preflight/references/prompt-sections.md` — the two prompt
  layers, which box maps to which observed failure, and where each layer
  physically lives in Cowork.

## Verifying the hooks fire

Both hook scripts emit a marker line:

```
[RHTP-HOOK-ALIVE :: SessionStart]
[RHTP-HOOK-ALIVE :: UserPromptSubmit]
```

Install the plugin, start a **fresh** Cowork session, and ask: *"Do you see any
line beginning with RHTP-HOOK-ALIVE in your context?"*

- **Marker present** → plugin hooks fire in Cowork. That is the strong result: a
  real per-turn injection channel that survives compaction, and the skills and
  agents below it become a backstop rather than the primary control.
- **Marker absent** → plugin hooks do not fire in this surface. Nothing is lost —
  the skills and agents still load and still work. Delete `hooks/` and rely on the
  `delivery-preflight` skill plus the standing block in project instructions.

Hooks demonstrably execute in the Cowork sandbox (the session's git identity is
set by one before the first message). The open question is only whether
*plugin-supplied* hooks are wired in. This is the ten-minute test that settles it.

## Origin

Built from the RHTP repo's `CLAUDE.md`, `AGENTS.md` and
`.claude/skills/agentic-build-framework`, after a session audit found five
adherence and specification failures — two adherence, four specification, one
convention — none of which the existing framework could reach, because none of it
was loaded.

## Source of truth and repacking

`skills/agentic-build-framework/**` is **generated**. Its single source is
`.claude/skills/agentic-build-framework/` in this repo — edit there, never here.
Run `./sync.sh` to regenerate the copy, validate every frontmatter block as YAML,
and repack `rhtp-delivery-framework.plugin`.

`AGENTS.md` is deliberately not duplicated into this plugin for the same reason:
one source, referenced by name.
