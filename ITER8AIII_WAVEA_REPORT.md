# Iteration 8A-iii, Wave A (B2) — Value-Set Governance Lifecycle

Role: Governance/backend specialist (B2), disjoint tree. Framework v1.2.
Owned: `src/lib/terminology/governance/` + `tests/terminology/governance.test.ts`.

## Scope delivered

A version-lifecycle governance facility for terminology value sets: a guarded
state machine, ENFORCED maker-checker approval, an immutable PHI-free transition
audit ledger with a history query, chosen-version replay, and a fail-closed
production seam. All deterministic (injected clock, no wall-clock/randomness).

### Files created (all under the 400/500-line caps)

| File | Lines | Responsibility |
|------|------:|----------------|
| `src/lib/terminology/governance/types.ts` | 128 | States, actions, config, records, errors |
| `src/lib/terminology/governance/stateMachine.ts` | 58 | Guarded transitions; illegal edge throws |
| `src/lib/terminology/governance/store.ts` | 132 | In-memory store + append-only ledger + fail-closed seam |
| `src/lib/terminology/governance/service.ts` | 225 | Orchestrator: lifecycle + maker-checker + one-active + audit + replay |
| `src/lib/terminology/governance/replay.ts` | 92 | Chosen-version replay (E9: never falls back to current) |
| `src/lib/terminology/governance/index.ts` | 62 | Public surface (exported for Waves B/C) |
| `tests/terminology/governance.test.ts` | 286 | 19 tests |

### Shared files — appended, clearly-commented blocks only

- `src/lib/authz/principal/types.ts` — added the two governance roles
  (`value-set-steward`, `value-set-reviewer`), `GOVERNANCE_ROLES`,
  `GovernanceRole`, `GovernancePrincipal`, `isGovernanceRole`. Kept ADDITIVE and
  separate from the core authz `Role` union so the exhaustive `ALLOWED_PURPOSE`
  record in `guard.ts` is not disturbed.
- `src/lib/config/dataMode.ts` — registered the `valueSetGovernanceStore` seam.
- `src/lib/config/seamDispositions.ts` — declared it `fail-closed-stub` with
  `ValueSetGovernanceStoreNotConfiguredError`.
- `src/lib/terminology/index.ts` — re-exported the governance surface + roles.
- `tests/governance/seamFailClosed.test.ts` — registered the required prober for
  the new seam (the mechanical proof-coverage gate demands one; without it the
  whole-repo gate would go red).

## Design decisions

1. **Lifecycle graph (guarded).** `draft -> in-review -> approved(active) /
   rejected -> retired/superseded`, plus `draft|approved -> retired`. Terminal
   states (`rejected`, `retired`, `superseded`) have no outgoing edges. The ONLY
   edge into `approved` is `in-review --approve--> approved`, so E9 holds
   structurally: a `draft` cannot jump to active and a `rejected` version can
   never become active. `nextState` throws `IllegalTransitionError` on any
   non-edge.
2. **Maker-checker ENFORCED.** Under the default `maker-checker` mode, `approve`
   throws `MakerCheckerViolationError` when the approver is the submitter
   (`self-approval`) or is not a `value-set-reviewer` (`not-a-reviewer`). Under
   `single-approver` (config-selectable) the submitter may approve.
3. **One active version.** `approve` first supersedes any existing active version
   of the same value set (a system-attributed `supersede` transition), so at most
   one `approved` version exists at a time.
4. **Immutable audit.** Every transition is appended to a monotonic, frozen,
   append-only ledger with principal id + role, `from -> to`, reason, and an
   injected-clock ISO timestamp. `history()` returns copies; the ledger is
   PHI-free (ids/versions/states only). Follows the evidence ledger's append-only
   discipline (`lib/evidence`).
5. **Chosen-version replay.** `replayAgainstVersion` binds via the 8A-ii
   `membersForVersion(system, chosenVersion)`, never `currentMembers`. E9: an
   unmodeled version returns `reproduced:false` / `version-not-modeled` with
   `boundVersion:null` — it never silently answers from the current version.
   Proven: `R51` replays valid against ICD-10-CM `FY2025` yet is retired in the
   current `FY2026`; `HCC58` replays valid against CMS-HCC `V24`.
6. **Seam, fail-closed.** `getValueSetGovernanceStore()` serves the in-memory
   store in mock/seeded and throws `ValueSetGovernanceStoreNotConfiguredError` in
   production with no registered factory — mirrors `getEvidenceStore()`.

## DoD proof (all in `tests/terminology/governance.test.ts`, 19 tests)

- Guarded transitions + illegal-transition rejection (state machine and via the
  service, e.g. approving a never-submitted draft throws and stays inactive).
- Maker cannot self-approve under maker-checker; a non-reviewer cannot approve; a
  different reviewer can.
- Single-approver: the submitter may approve (configurable).
- Every transition audited immutably; history is a copy; audit is PHI-free.
- One-active invariant: approving a new version supersedes the prior active;
  exactly one `approved` remains; the supersede is a recorded system transition.
- Replay binds the chosen version; E9 no-fallback-to-current; ungoverned system
  is unsupported (never fabricated).

## Verification (in `/home/claude/baseline`)

- `npx tsc --noEmit` — exit 0.
- `npx vitest run tests/terminology` — 11 files, 111 passed (was 92; +19).
- `bash check-file-sizes.sh` — PASS (no new violations; ratchet intact).
- `tests/governance/seamFailClosed.test.ts` — 27 passed (mechanical seam gate
  green with the new `valueSetGovernanceStore` disposition + prober).

Note on the full suite: `tests/app/valueSetGovernanceConsole.test.tsx` and
`tests/app/_probe.test.ts` fail to parse. These are Wave B (UI) files being
written in parallel (timestamps within minutes of this run) and are outside this
wave's partition. `tsc --noEmit` compiles the whole tree — including Wave B/C
source that consumes this wave's exported API and roles — at exit 0, confirming
the exported surface is compatible for the downstream waves.
