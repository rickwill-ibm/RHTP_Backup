# Agent Definition Language (`src/lib/agents/adl`)

An agent is declared **once, as configuration**. `agent-manifests.json` and
`agent-routing.json` are **generated** from that declaration and are never hand-edited.

```
data/<agent-id>.agent.json   ← the only authored artifact
../authority/data/authority-lock.json  ← the security control (separately reviewed;
                                          applied again at LOAD time by the manifest registry)
        │  compile()
        ├─► src/lib/agents/manifest/data/agent-manifests.json   (generated)
        └─► src/lib/agents/dispatch/data/agent-routing.json     (generated)
```

## Two gates, and why there are two

**1. The authority lock — the SECURITY control.**
Byte-equality between a generated file and its own previous output proves only
*consistency*. Widening a tool allowlist and regenerating satisfies it. The lock is an
independent, separately-reviewed record of the authority each agent may hold, so
compilation can only ever **narrow**:

- compiled tool set must be a **subset** of the locked tool set
- compiled `autonomyTier` must not exceed `maxAutonomyTier`
- compiled `phiPosture` must not exceed `maxPhiPosture`
- `escalationPolicyRef` must match exactly
- **an agent absent from the lock has no authority** — fail closed

Widening anything requires editing `src/lib/agents/authority/data/authority-lock.json`, which is a reviewed diff a
security owner reads. Put it under CODEOWNERS.

**2. Drift — the CONSISTENCY control.** The committed artifacts must equal
`compile(definitions)` byte-for-byte, so generated authority cannot be hand-edited.

Both run in `npm run adl:check`, which is wired into `npm run check:all`.

## Canonical form

`canonical.ts` is a frozen spec: object keys sorted, arrays in author order, two-space
indent, LF, exactly one trailing newline, no floats. Changing it moves every generated
byte, so it is versioned (`CANONICAL_SPEC_VERSION`) and has its own tests.

## Adding or changing an agent

1. Edit or add `data/<agent-id>.agent.json`.
2. If authority changed, edit `src/lib/agents/authority/data/authority-lock.json` — **this is the reviewed step**.
3. Regenerate the artifacts, then `npm run adl:check`.

## Body kinds — and what is deliberately not here

`body.kind` is `'module'` only. A declarative `steps` body executed by a generic
interpreter was designed and **blocked by adversarial review** pending:

- `onApprove` reachability enforced by a **capability minted at approval resolution**
  (keyed to `proposalId` + claim key + definition hash), not proven by static analysis;
- a **typed predicate registry** instead of a JSON expression language (which would be an
  injection surface with no fuzzing and no budget);
- **fail-closed guard semantics**, with an error-suppression outcome distinguishable from a
  clean suppression in telemetry;
- **consent-scoped `recall`** returning decision codes and timestamps only, never free
  text, with 42 CFR Part 2 sourced decisions excluded absent a declared basis;
- **definition-hash provenance** on every event and proposal, so a suspension that resumes
  under a changed definition escalates rather than silently continuing;
- a definition **test harness** as a compile precondition.

Until those exist, `parseAgentDefinition` refuses `kind: 'steps'` with
`ADL_UNSUPPORTED_BODY`. The four existing agents keep their hand-written, reviewed
bodies; this slice changed **no behaviour**, only where authority is declared.

## Known limits

- The `module` escape hatch will eat the design if new agents are allowed to use it.
  Permit it for the four legacy agents only; anything new needs a recorded waiver.
- No tenant axis yet. State-programme variation (escalation policy, appeal windows) will
  need one, and retrofitting it onto a flat definition file is a rewrite. Decide the
  variant axis before the fifth agent.
- No deprecation or tombstoning: deleting a definition orphans in-flight suspensions.
