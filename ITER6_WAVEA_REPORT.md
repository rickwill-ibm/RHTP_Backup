# Iteration 6 — Wave A Report (care-team + goals-tasks)

Two C9 record domains built THROUGH the L7 domain template
(`src/lib/pipeline/adapters/_TEMPLATE.md`), modeled on the medications reference.
Both are FHIR-JSON batch domains at tier **T1**, identity-anchored id-only through
the injected seam (`deps.resolveIdentity(sourceId, { feed })`, exactly as
`medication.ts`), generic + synthetic (no hardcoded persona, plan §1.2).

## Domains delivered

### 1. care-team (`care-team`, T1)
- **Adapter** `src/lib/pipeline/adapters/careTeam.ts`: parses a synthetic FHIR
  `CareTeam` bundle. One CareTeam resource + its participant roster -> ONE
  normalized `CareTeam` record (event `care-team.formed`), payload carrying the
  participants as references + role codes only (PHI-safe). Provenance
  `care-team-authoritative`. Subject anchored via the seam (never the graph key).
  A participant whose FHIR reference is a `Practitioner` is tagged `kind:
  'Practitioner'` (node reuse); every other participant is a `CareTeamMember`.
  Malformed record (no participant) quarantines with reason `missing-participant`.
- **Mapping** `src/lib/graph/mapping/careteam.ts` (EXTENDED, not duplicated):
  - `(CareTeam)-[:CARE_TEAM_FOR {dated}]->(Member)` associative
  - `(CareTeamMember|Practitioner)-[:MEMBER_OF_CARE_TEAM]->(CareTeam)` associative
  - `(Member)-[:HAS_CARE_TEAM]->(CareTeamMember|Practitioner)` associative
    — the existing edge, reused so the Iteration-2 care-team lens surfaces
    pipeline-fed participants too.

### 2. goals-tasks (`goals-tasks`, T1)
- **Adapter** `src/lib/pipeline/adapters/goalTask.ts`: one care-planning feed
  carries TWO resource kinds. `Goal` -> `Goal` record (event `goal.recorded`,
  provenance `care-plan-goal`); `Task` -> `Task` record (event `task.recorded`,
  provenance `care-plan-task`). A Task's `focus` reference to a Goal is carried on
  the payload (`goalRef`) so the edge can attach to the Goal; free-standing tasks
  carry `goalRef: ''`. Malformed Goal (no description coding) quarantines with
  reason `missing-goal-code`.
- **Mapping** `src/lib/graph/mapping/goalTask.ts` (NEW):
  - `(Member)-[:HAS_GOAL {valid from startDate}]->(Goal)` associative
  - `(Goal|Member)-[:HAS_TASK {valid from authoredOn}]->(Task)` associative — the
    Task hangs off its Goal when the source referenced one, else off the Member.
  Edges dated where the FHIR resource carries a date (Goal.startDate,
  Task.authoredOn), falling back to the event time otherwise.

## How careteam mapping was extended WITHOUT breaking the existing lens
The Iteration-2 demo path (`careteam.assigned` / `careteam.unassigned` ->
`(Member)-[:HAS_CARE_TEAM]->(CareTeamMember)`, with `unassigned` closing the edge
validity) is preserved **byte-for-byte** in a dedicated `assigned()` branch. The
spec's `matches()` was widened to claim BOTH `careteam.*` (demo) and `care-team.*`
(pipeline); `toMutations()` dispatches on the `care-team.` prefix to the new
`formed()` branch, leaving the demo branch untouched. The only internal change was
renaming the local `CARE_TEAM_KIND = 'CareTeamMember'` to the exported
`CARE_TEAM_MEMBER_KIND` (same value) and adding `CARE_TEAM_KIND = 'CareTeam'`, so
the demo projection still emits the identical `CareTeamMember` node + `HAS_CARE_TEAM`
edge the lens reads. `tests/graph/lens.acceptance.test.ts` (which pins the care-team
lens result to `['Member:M1', 'CareTeamMember:Practitioner/M1-cm']`) stays GREEN.
The pipeline path reuses `HAS_CARE_TEAM` off the member, so the same lens now also
surfaces pipeline-fed rosters (additive, not breaking).

## Registries touched (exactly the template's two, per domain)
| Registry | File | Edit |
|---|---|---|
| Pipeline adapter | `src/lib/pipeline/index.ts` | `export { careTeamAdapter, ... }`; `export { goalTaskAdapter, ... }` |
| Graph mapping | `src/lib/graph/mapping/index.ts` | import + register `goalTaskSpec` in `MAPPING_SPECS` (careteamSpec already registered) |
| Domain union | `src/lib/pipeline/types.ts` | `WpcDomain` gained `'care-team'`, `'goals-tasks'` |

`SourceFormat` already carried `'fhir-json'`. No projector/lens/runTransform change
(open/closed — they read the registries).

## Tests (28 new, all green; full suite 1040 passed / 1 expected-fail / 91 skipped)
- `tests/pipeline/careTeam.test.ts` (3): fixture -> normalized, T1 + provenance
  assertions, anchored `mem-` id, PHI-safe payload/quarantine, C9 tier sweep,
  end-to-end `runPipeline` (events, class, `source.tier`).
- `tests/pipeline/goalTask.test.ts` (3): same shape; asserts task-1 Goal-anchored,
  task-2 member-anchored, C9 tier sweep, e2e.
- `tests/graph/careTeam.test.ts` (5): projector instruction set, both backends
  (pg-mem + Neo4j fake) byte-identical, idempotent replay, care-team + whole-person
  lens reads surface the pipeline-fed roster.
- `tests/graph/goalTask.test.ts` (6): projector, both backends, idempotent replay,
  whole-person lens surfaces Goal + free-standing Task.
- `tests/pipeline/domainNamespaceIntegrity.waveA.test.ts` (11, NEW companion): pins
  both domains — constants, adapter/mapping domain-id agreement, both registries,
  every emitted eventType claimed by exactly the domain's spec, projected node
  kinds + edge types, and that the extended care-team spec still owns the demo
  events. Split into a companion file so the frozen
  `domainNamespaceIntegrity.test.ts` stays under the ≤500-line test cap (a pointer
  note was added there); the main file is otherwise unmodified by wave A.
- Fixtures: `tests/pipeline/fixtures/careTeam.json`, `.../goalTask.json` (synthetic,
  PHI-free, each with one malformed record for the quarantine lane).

## C9 coverage matrix rows (wave A additions)
| Domain id | Tier | Adapter | Mapping | Node types | Edge types | Arrival |
|---|---|---|---|---|---|---|
| care-team | T1 | `adapters/careTeam.ts` | `mapping/careteam.ts` (extended) | CareTeam, CareTeamMember, Practitioner (reused) | CARE_TEAM_FOR, MEMBER_OF_CARE_TEAM, HAS_CARE_TEAM (reused) | batch / fhir-json |
| goals-tasks | T1 | `adapters/goalTask.ts` | `mapping/goalTask.ts` | Goal, Task | HAS_GOAL, HAS_TASK | batch / fhir-json |

Wave A moves the pipeline-fed record-domain count **7/20 -> 9/20** (care-team is now
a pipeline domain, not only the demo lens). Wave B (referrals + immunizations)
carries it to 11/20.

## Verification
- `npx tsc --noEmit` = **0**
- `npx vitest run` = **fully green** (1040 passed, 1 pre-existing expected-fail, 91
  skipped); existing care-team lens (`lens.acceptance.test.ts`) green.
- `bash check-file-sizes.sh` = **PASS** (ratchet intact; every new file well under
  cap: adapters 160/171, mappings 155/99, tests 94/98/106/116/184).
