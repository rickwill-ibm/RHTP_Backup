# Operating Model (project-agnostic)

The orchestration mechanics that make a multi-agent build reliable. These are the rules the orchestrator follows across every iteration. They were learned by hitting each failure once; adopt them to skip the lesson.

## The execution unit: the WAVE
Every iteration is a sequence of waves, and every wave has the same shape:

  probe -> parallel build (2-4 specialists on DISJOINT trees) -> convergence -> red-team panel -> orchestrator authoritative gate -> one sync

Scale by ADDING waves, never by widening a single agent's scope. Disjoint trees are what make parallelism safe; the spine's namespace reservation is what keeps them disjoint.

## Iteration lifecycle
1. BRIEF: the orchestrator writes an iteration context that carries: the binding governance (rules, contracts, direction), the PRE-ALLOCATED namespace, the definition of done, the fidelity/infra reality (what is verified against fakes vs live), and the open register items to pull in.
2. PROBE: a cheap harness health check before any fan-out.
3. SPINE (when decisions are needed): decide, publish contracts, reserve namespace, author the golden path, AND publish a per-agent CONTEXT MANIFEST for each planned specialist (exact reads, what-not-to-touch, the reserved namespace slice INCLUDING shared-file partitions — e.g. per-wave companion test files — so two parallel agents never improvise how they split a shared file).
4. BUILD WAVES: specialists in parallel on disjoint trees. Each agent's prompt is COMPOSED (persona card + brief reference + its context manifest + scope + DoD reference + output contract), not hand-authored, and captured verbatim at send-time (E10).
5. CONVERGENCE: first-class, cross-agent adversarial reconciliation, to DRY.
6. RED-TEAM PANEL: domain-fidelity + negative-space + stub-legitimacy (+ engineering), producing findings into the register; Unacceptable fixed now.
7. AUTHORITATIVE GATE: the orchestrator re-runs types + full tests + size/lint itself.
8. SYNC: one artifact (a single archive) to durable storage at the boundary; update the recovery point and register.

## The operating rules (generalized)
- Trust artifacts, not reports. An agent's "done" holds only when its files exist with plausible content.
- Probe before fan-out. Seconds spent here prevent a whole failed wave.
- Fall back down the orchestration ladder (scripted -> direct parallel calls -> inline) on the FIRST infrastructure failure, rather than retrying the broken layer.
- Durable inputs. Any human-supplied artifact is copied into durable, versioned storage the moment it arrives; conversation context is not storage.
- Checkpoint at boundaries. Each phase's outputs are synced before the next begins; the sync IS the recovery point.
- Keep external dependencies off the critical path. If a sync/commit channel is unreliable, queue it and continue; never block work on it.
- Prose files over rigid schemas for rich agent output. Reserve strict schemas for tiny verdict tuples; rich content forced through a schema fails where a prose file plus a mechanical rule succeeds.
- Pre-allocate AND pin the namespace (E3) — including SHARED-FILE PARTITIONS, not just names: when two parallel agents must both edit one file (a shared registry, a namespace test), the spine pre-declares how they split it (e.g. per-wave companion files), so the partition is designed, not improvised mid-run.
- INTERFACE-FREEZE before parallel build (v1.4): when wave B consumes something wave A produces, the spine publishes the INTERFACE (a typed stub / signature) BEFORE either starts, and both code against the stub — never against the other wave's in-flight symbols. This kills two recurring rework costs: a downstream wave guessing an adapter the convergence pass then has to collapse, and cross-wave transient type errors while one wave's shared edit is not yet visible. Corollary: serialize the single edit to a shared union/registry (one wave owns the append; others reference the frozen interface), so the mid-flight tree is never inconsistent.
- SHIFT VERIFICATION LEFT (v1.4): a defect class the red-team keeps catching becomes a BUILD-TIME self-check the specialist runs before reporting green, not only a Wave-D sweep. The fail-open lint (E9) is the first example promoted this way. This frees convergence and the red-team to hunt NOVEL defects instead of re-finding the same class, and cuts the build->review->fix rework loop.
- Compose per-agent prompts from reusable parts and capture them verbatim (persona standard + E10).
- Route cross-cutting findings to a single decisive amendment (the spine reconvened with context intact), not to parallel re-runs.
- One canonical baseline/register; the orchestrator owns the authoritative gate run; agents verify only their own scope.

## The build lessons (generalized, the "do not relearn these")
- Fakes are necessary, not sufficient: they hide concurrency, constraints, and protocol semantics. Fidelity ledger + a required (deferred) live spec (E7).
- Convergence is first-class and finds the real defects; budget it every time (E4).
- Concurrency correctness belongs in the definition of done, not discovered later.
- Templatize the repeatable unit before mass-producing it (build one golden example + checklist, then each instance is a fill-in).
- Verification attacks THREE layers, not one: conformance (does code match spec), domain-fidelity (is the spec right against reality), and negative-space (what is entirely absent). Conformance-only review is how honestly-labeled but load-bearing gaps ship. The red-team panel is this control.
- A labeled stub is not automatically acceptable; grade every stub, fix the load-bearing ones now (E1 + R3).
- L10 — Checkpoint + sync discipline (v1.4): take a labeled backup tarball before an XL/irreversible iteration; sync at every boundary by CHECKSUM DIFF (a manifest of the tree, compared on the target, pushing only the delta) rather than re-pushing or trusting memory of what changed. The diff is also the proof the target matches the build.
- L11 — Canonical-artifact, locate-don't-recreate (v1.4): before authoring anything that may already exist (a shared doc, a framework file, a registry), an agent MUST locate the canonical copy and extend it; recreating it from scratch forks the source of truth and forces an orchestrator reconciliation. The context manifest names the canonical path.
- L12 — Right-size the fan-out (v1.4): match the wave count to the iteration's true size. Over-parallelizing a small iteration spends more in convergence (reconciling shared edits) than it saves in build time. Three disjoint waves is often the sweet spot; one specialist is fine for a one-tree change.

## Reasoning mode: chain-of-thought by default, tree-of-thought at the forks (v1.4)
Most of the loop is CHAIN-of-thought - a single linear path is the right, cheap default for execution (fill the template, wire the seam, converge the registries). But CoT commits to one path early, and at a few DECISION FORKS the wrong single path is expensive to reverse. There, INJECT TREE-of-thought: enumerate the viable branches, evaluate each against explicit criteria a step or two deep, PRUNE the weak ones, then proceed on the survivor (grafting the best ideas from the runners-up).

Inject ToT at these forks, not everywhere:
- DESIGN / spine decisions with >=2 viable approaches and high reversal cost (architecture, a protocol choice, an approval model). Use the judge-panel form: N independent candidate designs -> score against reversibility / blast-radius / conformance / cost -> synthesize from the winner. (Example this build would have benefited: internal match-engine vs external EMPI; the governance approval model.)
- RED-TEAM hypothesis generation: instead of linear defect-hunting, BRANCH on failure hypotheses (malformed / concurrent / partial / out-of-order / adversarial / stale), explore each one step, prune the implausible, deep-dive the survivors. Tree-shaped hunting finds the non-obvious failure modes negative-space review misses.
- AMBIGUOUS-REQUIREMENT forks: branch on interpretations, cheaply evaluate consequences, then pick or escalate rather than committing to one reading.

Do NOT inject ToT into mechanical single-path tasks (template fills, convergence bookkeeping, a well-specified seam) - the branching has no value there and only burns tokens. The spine/orchestrator flags each SCOPE item's mode; a persona whose SCOPE contains such a fork expands it tree-style before building (see the persona skeleton's reasoning-mode clause).

## Tighter adversarial loop (v1.4)
- A HIGH/Unacceptable red-team finding triggers an IMMEDIATE in-wave fix (the same agent re-prompted with the finding, or a scoped fix agent) rather than register-and-defer, when the fix is in-scope and cheap. Defer only genuinely cross-cutting or out-of-scope findings.
- For the HIGHEST-stakes findings, raise confidence with N-INDEPENDENT-SKEPTIC voting: spawn a few reviewers each prompted to REFUTE the finding (or the fix), and treat it as confirmed only on a majority. Independent refutation catches the plausible-but-wrong that a single pass lets through.
- Rotate the R1 domain-fidelity LENS to the iteration's subject (identity, terminology, deployment, certification) explicitly - a fixed lens goes stale; the sharpest domain-fidelity review is the one aimed at what changed.

## When to use this framework
Any build where: work is decomposed across multiple agents; correctness matters more than speed; the domain has real-world standards a generalist engineer would not know; and the cost of a silent gap shipping is high. It is heavier than a single-agent build — the payoff is that the failure modes above are caught structurally rather than by luck or by the customer.

## When NOT to over-apply it
A trivial or throwaway task does not need the full wave unit. Scale the ceremony to the stakes: a one-file fix needs the gate, not a red-team panel. The judgment call is the orchestrator's.
