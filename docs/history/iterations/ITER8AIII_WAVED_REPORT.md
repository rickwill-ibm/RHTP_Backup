# Iteration 8A-iii, Wave D — Convergence + Red-Team (B3)

Role: Convergence engineer (B3) + red-team panel host. Framework v1.2.
Working tree: `/home/claude/baseline` (live). This wave CLOSES the I8A block.

Waves A/B/C landed three parallel governance slices that never actually met: a real
backend engine (A), a console that re-implemented governance on a local adapter (B),
and BFF routes over a port stood up by an in-memory double (C). This wave converges
them to ONE lifecycle + ONE maker-checker, sweeps the governance path for fail-open,
runs the mandatory three-persona red-team, and fixes the one Unacceptable.

---

## 1. Convergence to DRY

### The divergence found (three of everything)

| concern | Wave A (backend, authoritative) | Wave B (console) | Wave C (routes) |
|---|---|---|---|
| lifecycle states | draft / in-review / approved / rejected / retired / superseded | draft / proposed / approved / **active** / superseded / retired | draft / **pending-approval** / approved / rejected / retired |
| role model | `GovernanceRole` (steward / reviewer) | `AdminRole` maker/checker **sets** | raw session role string → steward/reviewer |
| maker-checker | inline in `service.approve` | inline in `evaluateApprovalGate` | inline in double + route boundary |
| data source | real service + store seam | **hand-authored** VERSIONS/HISTORY seed | in-memory `integrationDouble` |
| replay | `replayAgainstVersion` (real membership) | `v.members.includes(code)` (mirrored) | echoes `boundVersion = version` |

Three lifecycle vocabularies, three role models, **three** maker-checker copies, and
the console/route data mirrored the engine instead of reading it. Nothing was wired.

### What converged

1. **ONE maker-checker rule.** Extracted the separation-of-duties predicate to
   `src/lib/terminology/governance/makerChecker.ts` (`evaluateMakerChecker`) and
   exported it. It is now the SINGLE implementation used by all three layers:
   - `service.approve` throws `MakerCheckerViolationError` on a non-ok decision
     (the inline copy deleted);
   - the console gate (`evaluateApprovalGate`) disables the control on a non-ok
     decision (its inline copy deleted);
   - the BFF `approve/route.ts` boundary AND the mock double's `approve` both call
     it (their inline copies deleted).
   The rule cannot drift between UI, routes, and engine any more.

2. **Console adapter collapsed to a thin delegation.** `governanceApi.ts` no longer
   declares a lifecycle, a role model, a gate, or a seed. It:
   - re-uses the engine's `VersionLifecycleState` (the duplicate `GovernanceState`
     union is gone; `STATE_META` is keyed by engine states);
   - adopts the governance-role actor model (`govRole: GovernanceRole | null`),
     the SAME shape the BFF uses (`GovActor`), dropping the AdminRole maker/checker
     sets entirely;
   - builds its demo by driving the REAL `createValueSetGovernanceService` through
     REAL transitions (createDraft → submit → approve → …), so the version list,
     the **history timeline is the engine's own append-only ledger**, and the
     maker-checker gate all come from the engine — not mirrored;
   - reads member content and replay from the REAL versioned membership data layer
     (`membersForVersion`) + the engine's `service.replay` (→ `replayAgainstVersion`).
     Diff, replay, and E9 no-fallback are computed by the engine.
   The demo scenario is grounded in real data: ICD-10-CM **FY2025 → FY2026** (R51
   retired in FY2026), plus FY2027 (in-review, steward-submitted) and FY2028
   (in-review, reviewer-submitted) to exercise both maker-checker branches.

3. **Shared partitions reconciled.** One `valueSetGovernanceStore` seam
   (`dataMode.ts`, `seamDispositions.ts`), one governance-role block in
   `authz/principal/types.ts` (the two roles, additive, separate from the core
   `Role` union — `ALLOWED_PURPOSE` undisturbed), the governance surface re-exported
   from `terminology/index.ts`. No second seam, no divergent export (tsc 0).

4. **Per-wave test partitions all run:** backend 19, console 7 (was 5; +2 E9),
   routes 20, seam-gate 27. Full suite 1314 passed, 1 expected-fail, 91 skipped.

---

## 2. E9 fail-open sweep (governance path) — 1 found, fixed

`rg` of the fail-open shapes across `src/lib/terminology/governance`,
`src/app/api/value-set-governance`, and `src/app/admin-console/value-set-governance`.

**FOUND + FIXED — `resolveGovernanceBackend()` production masquerade.** It returned
`bound ?? integrationDouble`: in production with no backend registered, the routes
served an in-memory double AS durable governance (the U4 dead-wiring pattern — an
unapproved change would look persisted, a restart would silently drop the ledger).
Fixed fail-closed: `resolveGovernanceBackend()` is now seam-aware — production with
no registered backend throws `GovernanceBackendNotConfiguredError` (mirrors
`ValueSetGovernanceStoreNotConfiguredError`); the double serves mock/seeded ONLY.

Every other shape justified inline:
- `replayAgainstVersion` `reproduced:true` / `valid:true` are gated on the CHOSEN
  version's membership being found; unsupported-system and version-not-modeled
  return `reproduced:false` with `boundVersion:null` — **never a fallback to current**
  (E9 hard invariant; now proven end-to-end through the console too: FY2027 replays
  not-reproduced).
- state machine: the sole edge into `approved` is `in-review --approve--> approved`;
  a `draft` cannot jump active and terminal `rejected`/`retired` have no edges — an
  unapproved/rejected version cannot become active structurally.
- routeKit `isAuthenticated().catch(()=>false)`, `getSessionAuthContext().catch(()=>null)`,
  `req.json().catch(()=>null)`, `searchParams.get() ?? ''` all resolve to DENY /
  400 (fail closed).
- `makerCheckerEnabled(): true` in the mock double enables SoD (fail-closed default).
- route `catch {}` → `serverError` 500 + failure audit.

Note (not fail-open, tracked as R1-8Aiii-1): the console gate and the route boundary
hardcode `approvalMode:'maker-checker'`. That is stricter than single-approver, so it
is fail-CLOSED, but it means the single-approver config is not honored outside the
engine — a fidelity finding, not a security hole.

---

## 3. Red-team panel (every persona produced findings)

### R1 — Governance domain-fidelity (SoD / audit / replay / config) — 4 findings

- **R1-8Aiii-1 (MED).** Single-approver config is honored only in the ENGINE
  (`service.approve` reads `config.approvalMode`); the console gate and the BFF
  approve boundary hardcode `maker-checker`. Direction is safe (stricter = fail
  closed), but a deployment configured single-approver would still see the UI/route
  block self-approval — config is not honored everywhere. Route the mode through the
  boundary + gate (read it from the backend) to close.
- **R1-8Aiii-2 (MED).** Audit completeness: `createDraft` records the version but
  appends NO ledger entry — the immutable trail's first event per version is
  `submit` (draft → in-review). Draft creation (who authored it, when) lives only on
  the mutable record's `createdBy/createdAt`, not in the append-only ledger. Every
  STATE TRANSITION is audited immutably (frozen entries, monotonic seq, copies on
  read), but creation is a governance event absent from the ledger.
- **R1-8Aiii-3 (MED).** Replay faithfulness is real (binds the exact historical
  membership via `membersForVersion(system, version)`; no fallback), but it is
  faithful ONLY when the governance version string equals a modeled terminology
  system version. The engine governs version STATE, not per-version MEMBERSHIP — it
  stores no member snapshot — so a governed value-set version whose token is not a
  terminology system version replays as `version-not-modeled`. Governance-version ↔
  terminology-version are conflated in replay.
- **R1-8Aiii-4 (LOW).** Durability of the "immutable" ledger is in-memory
  (mock/seeded); the append-only frozen discipline is honest but a process restart
  drops it. The production pg ledger is fail-closed-unwired (the seam throws). The
  audit trail is immutable-in-memory, not yet durable.

### R2 — Negative-space (absent that production governance needs) — 7-item missing list

1. **Approval delegation / expiry** — no delegation of reviewer authority and no
   submit-request expiry/timeout (a version can sit in-review forever).
2. **Emergency override (break-glass) with audit** — no audited path to activate
   under an incident when a second reviewer is unavailable.
3. **Concurrent-edit / concurrent-approval conflict** — `putVersion` is
   last-writer-wins with no optimistic-version guard; the read-active-then-supersede
   in `approve` is not transactional (single-threaded in-memory hides it; a pg store
   needs a guard or the one-active invariant can race).
4. **Retire-then-reactivate** — `retired` is terminal; no audited un-retire /
   reactivate path (recovery is only via a brand-new version).
5. **Bulk approve** — one version at a time; no batch decision.
6. **Notification** — no notify-reviewer-on-submit or notify-steward-on-decision.
7. **Four-eyes on retire (and reject)** — `approve` is four-eyes (maker-checker) but
   `retire` and `reject` are single-actor steward actions. Retiring an ACTIVE
   production value set takes one person and no second approver.

### R3 — Stub-legitimacy (governance store seam + in-memory adapters) — 3 graded

| seam / stub | grade | rationale |
|---|---|---|
| `valueSetGovernanceStore` (Wave A store) | **Acceptable** | fail-closed-stub declared; production with no pg factory throws `ValueSetGovernanceStoreNotConfiguredError`; mock/seeded = in-memory; append-only, frozen entries, copies on read; governance prober present. |
| routes' `integrationDouble` (backendAdapter) | **Acceptable (was Unacceptable, FIXED)** | BEFORE: `bound ?? integrationDouble` served the in-memory double in PRODUCTION = dead-wiring masquerade. FIXED: `resolveGovernanceBackend()` fails closed in production (`GovernanceBackendNotConfiguredError`); the double serves mock/seeded ONLY, and its maker-checker now delegates to the shared predicate. Residual: no real Wave-A→port facade registered yet (production throws until it is) — routed forward, symmetric with the store's pg residual. |
| console seeded service (`governanceApi.ts`) | **Acceptable** | a DEMO read-model that drives the REAL engine through real transitions with a deterministic injected clock; clearly labeled; never presented as durable governance (an admin demo surface, not the production store). |

**0 Risky, 0 Unacceptable left open** (the single Unacceptable — the routes' production
masquerade — fixed this wave).

---

## 4. Register + block closure

`verification/GAP_AND_STUB_RISK_REGISTER.md` updated with an "Iteration 8A-iii"
section: convergence verdict, E9 result, the three red-team dispositions, the
Unacceptable fixed, and the residuals routed forward (live pg governance ledger +
Wave-A→port facade registration, notifications, approval delegation/expiry,
four-eyes on retire, concurrency guard). The I8A block is noted CLOSED.

---

## Verification (in `/home/claude/baseline`)

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` (full) → **1314 passed | 1 expected-fail | 91 skipped**, no regressions.
- Partitions: backend `19`, console `7`, routes `20`, seam-gate `27` — all green.
- `bash check-file-sizes.sh` → **PASS** (no new violations; ratchet intact). New/changed
  files under caps: `makerChecker.ts` 58, `governanceApi.ts` 332, `backendAdapter.ts` 162.
- E9 sweep → **fixed-1** (production backend masquerade); all other shapes justified.

**DoD:** convergence DRY yes · adapter collapsed yes · E9 fixed-1 · R1 4 / R2 7 / R3 3 ·
Unacceptable fixed yes · register updated yes · tsc 0 / suite green / size PASS.
