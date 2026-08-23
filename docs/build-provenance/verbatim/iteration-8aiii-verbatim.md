# Iteration 8A-iii — verbatim agent prompts (exactly as sent, composed per v1.2)

Iteration-level master brief inherited by all: `coalition/inputs/iteration8aiii_context.md`. Each per-agent prompt is COMPOSED (ROLE / INHERITS / CONTEXT MANIFEST / SCOPE / DoD / OUTPUT / STYLE) and captured verbatim at send-time (E10). Wave D appended at iteration close.

---

## Agent: 8A-iii wave A — governance backend (lifecycle + maker-checker + replay + audit)
```
ROLE: Governance/backend specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration8aiii_context.md (Wave A scope + pinned namespace + shared-file partitions).
CONTEXT MANIFEST: read the brief; src/lib/terminology/registry/{valueSetRegistry.ts, assetTypes.ts, currency.ts, index.ts}; src/lib/terminology/validateCode/ (REUSE for replay); src/lib/evidence/{evidenceRecord.ts, evidenceStore.ts, index.ts} (REUSE as the immutable audit trail); src/lib/authz/principal/{types.ts, index.ts}; src/lib/config/{seamDispositions.ts, dataMode.ts}; src/lib/clock.ts. You OWN src/lib/terminology/governance/ + tests/terminology/governance.test.ts. Do NOT touch the UI (wave B) or routes (wave C). Shared files (seamDispositions.ts, dataMode.ts, terminology/index.ts, authz/principal/types.ts): append ONLY your clearly-commented block; add the two roles value-set-steward + value-set-reviewer to the principal role set.
Working tree /home/claude/baseline; live, committed to production repo.

SCOPE:
1. Version-lifecycle state machine: draft -> in-review -> approved(active) / rejected -> retired/superseded. Transitions guarded; an illegal transition throws. Only one active version per value-set at a time (approving supersedes the prior active).
2. Maker-checker approval (ENFORCED, not advisory): the principal who submitted a version for review cannot approve it; a value-set-reviewer approves. A config flag approvalMode: maker-checker | single-approver (default maker-checker) selects; in single-approver the submitter may approve.
3. Traceability: every transition appended to the evidence ledger (principal, timestamp via injected clock, from->to, reason) - immutable, PHI-free. Expose a history query.
4. Version replay: given a code + a chosen historical version, bind/evaluate via the 8A-ii validateCode against THAT version (not current), returning the historical result so a past adjudication reproduces.
5. Seam: valueSetGovernanceStore (in-memory/seeded for tests, pg fail-closed in production) declared in seamDispositions.ts.
6. Deterministic (<=400 lines/file, inject clock). Tests: guarded transitions; maker cannot self-approve (maker-checker) but can in single-approver; every transition audited immutably; replay binds the chosen version; illegal transition rejected; one-active-version invariant.

DoD: composite DoD v1.2; prove separation-of-duties, immutable audit, chosen-version replay, guarded lifecycle. E9: an unapproved/rejected version must NOT become active; replay must NOT fall back to current.
OUTPUT: write /home/claude/baseline/ITER8AIII_WAVEA_REPORT.md; reply ONLY: lifecycle-guarded y/n, maker-checker-enforced y/n, single-approver-configurable y/n, immutable-audit y/n, chosen-version-replay y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-iii wave B — governance console UI (dual-mode)
```
ROLE: Frontend/console specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration8aiii_context.md (Wave B scope).
CONTEXT MANIFEST: read the brief; existing admin-console pages for the pattern (src/app/admin-console/{audit-compliance,consent-governance,data-quality}/page.tsx) + shared UI components (src/components/ui/*, StatusBadge, RiskBadge); src/components/AppLayout.nav.ts (add the nav entry); the governance backend TYPES from wave A (src/lib/terminology/governance - consume its exported types/read API; do NOT reimplement lifecycle). You OWN src/app/admin-console/value-set-governance/ + tests/app/valueSetGovernanceConsole.test.tsx. Do NOT touch the backend (wave A) or routes (wave C). NO browser storage (in-conversation render restriction). Shared file AppLayout.nav.ts: append only your nav entry block.
Working tree /home/claude/baseline; live.

SCOPE (dual-mode admin/UI governance console):
1. page.tsx: list value-set versions with state + a current/active badge; a version DIFF view (added/removed/changed members between two versions); the approval workflow gates - submit / approve / reject controls, gated by role AND by the maker-checker rule (a maker sees their submitted version's approve control DISABLED with an explanation); a version history / audit timeline; a replay panel (pick a version, enter a sample code, show the historical binding result).
2. Dual-mode: admin mode = full controls; viewer/read mode = history + replay only (controls hidden/disabled). Drive mode from the principal/role (no new auth).
3. Reuse existing admin-console layout + shared components; feature-first; <=400 lines/file (split components if needed); accessible (labels, focus).
4. Tests (component/render): renders the version list with states; approve control disabled for the maker on their own version; hidden in viewer mode; replay panel present + calls the read API.

DoD: composite DoD v1.2; prove the workflow gates render + gate by role/mode, the maker-checker disable, replay panel. E9 (UI): a disabled/absent control must not be a false-enable; the UI must not itself perform an approval a maker-checker rule forbids.
OUTPUT: write /home/claude/baseline/ITER8AIII_WAVEB_REPORT.md; reply ONLY: console-renders y/n, workflow-gates-by-role y/n, maker-checker-visible y/n, replay-panel y/n, dual-mode y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-iii wave C — BFF routes + authz
```
ROLE: BFF/authz specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration8aiii_context.md (Wave C scope).
CONTEXT MANIFEST: read the brief; the BFF route pattern (src/app/api/work-queue/route.ts or src/app/api/match/route.ts) + tests/api/_helpers.ts; src/lib/authz/guard.ts + principal/types.ts (the roles value-set-steward + value-set-reviewer are added by wave A - consume them); the governance backend from wave A (src/lib/terminology/governance - CALL its lifecycle/approval/replay/history; do NOT duplicate). You OWN src/app/api/value-set-governance/** + tests/api/routes-value-set-governance.test.ts. Do NOT touch the backend (wave A) or UI (wave B).
Working tree /home/claude/baseline; live.

SCOPE:
1. Routes: submit, approve, reject, retire, replay, history under src/app/api/value-set-governance/. Each role-gated via the authz guard (steward submits/rejects/retires; reviewer approves; both read history; replay per role). PHI-safe request/response.
2. Maker-checker enforced at the ROUTE boundary too (defense in depth): an approve by the same principal who submitted returns 403 in maker-checker mode.
3. CALL wave A's backend for all state changes; the route is a thin authz+validation layer, no duplicated lifecycle logic.
4. Tests (via _helpers): 401 no-principal; 403 wrong-role (steward tries approve); 403 maker self-approve (maker-checker); 200 reviewer approve; 200 history read; replay returns the chosen-version binding; PHI-safe bodies; a skipped infra-bound case carries a reason.

DoD: composite DoD v1.2; prove role-gating, maker-checker at the boundary, call-not-duplicate, PHI-safe. E9: an unauth'd or wrong-role governance action must fail closed (401/403), never default-allow.
OUTPUT: write /home/claude/baseline/ITER8AIII_WAVEC_REPORT.md; reply ONLY: routes-role-gated y/n, maker-checker-at-boundary y/n, call-not-duplicate y/n, phi-safe y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```
Note: composed COMPLETE prompts as sent.

---

## Agent: 8A-iii wave D — convergence + red-team panel (COMPOSED v1.2; captured verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity = governance / workflow-integrity + versioning/traceability + separation-of-duties + auditability; R2 negative-space; R3 stub-legitimacy on the governance store seam). Framework v1.2.
INHERITS: coalition/inputs/iteration8aiii_context.md.
CONTEXT MANIFEST: working tree /home/claude/baseline (live). Read ITER8AIII_WAVEA/B/C_REPORT.md; src/lib/terminology/governance/**; src/app/admin-console/value-set-governance/** (incl. the local governanceApi.ts adapter wave B created); src/app/api/value-set-governance/**; src/lib/config/{seamDispositions,dataMode}.ts; src/lib/authz/principal/types.ts; src/lib/evidence/*; verification/GAP_AND_STUB_RISK_REGISTER.md. You MAY edit any file to fix findings; add NO new capability.
SCOPE:
1) CONVERGENCE to DRY: WIRE the console (wave B) to wave A's REAL read API (activeVersion/listVersions/history/replayAgainstVersion) - collapse the local governanceApi.ts adapter to a thin delegation or remove it, so the UI/routes/backend share ONE lifecycle + ONE maker-checker implementation (no duplication). Reconcile the shared partitions (seamDispositions.ts single valueSetGovernanceStore seam, dataMode.ts, terminology/index.ts, authz/principal/types.ts single role addition). Confirm the per-wave test partitions all run.
2) E9 FAIL-OPEN SWEEP on the governance path: an unapproved/rejected version must NOT become active; a maker must NOT self-approve in maker-checker (backend AND route); replay must bind the CHOSEN version, never silently fall back to current; an unauth'd/wrong-role governance action must fail closed (401/403), never default-allow; the UI must not perform an action the rule forbids. rg the fail-open shapes; each hit justified inline or fixed fail-closed NOW.
3) RED-TEAM PANEL (mandatory; every persona MUST produce findings): R1 governance - is separation-of-duties actually enforceable (can a maker approve via a different path)? Is the audit trail truly immutable + complete (every transition, no gaps)? Is version replay faithful (binds the exact historical membership)? Is single-approver vs maker-checker config honored everywhere? R2 negative-space - what is ABSENT (approval delegation/expiry, emergency override with audit, concurrent-edit conflict, retire-then-reactivate, bulk approve, notification, four-eyes on retire)? R3 stub-legitimacy - grade the governance store seam + any in-memory adapter Acceptable/Risky/Unacceptable.
4) Fix all Unacceptable this wave. Update verification/GAP_AND_STUB_RISK_REGISTER.md: add an "Iteration 8A-iii" section; note the console delivered with residuals (live pg store, notifications, delegation) routed forward. This CLOSES the I8A block - note it.
DoD (composite gate v1.2): tsc 0; full suite green (orchestrator re-runs authoritatively); size/ratchet PASS; no fail-open shapes (E9); seams declared fail-closed (E1); convergence DRY (single lifecycle, adapter collapsed); every red-team persona produced findings; zero new Unacceptable left open; register updated.
OUTPUT: write /home/claude/baseline/ITER8AIII_WAVED_REPORT.md. Reply ONLY: convergence DRY y/n, adapter-collapsed y/n, E9 result (clean or fixed-N), R1/R2/R3 finding counts, Unacceptable fixed y/n, register updated y/n, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
