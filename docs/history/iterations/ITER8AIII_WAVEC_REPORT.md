# Iteration 8a-iii — Wave C (BFF / authz for Value-Set Governance)

Role: BFF/authz specialist (B2), disjoint tree. Framework v1.2.
Scope owned: `src/app/api/value-set-governance/**` + `tests/api/routes-value-set-governance.test.ts`.
Did NOT touch: Wave A backend (`src/lib/terminology/governance`, guard/principal role additions) or Wave B UI.

## What was built

Six BFF endpoints, each a THIN authz+validation layer over the governance backend port:

| Route | Method | Role gate | Notes |
|-------|--------|-----------|-------|
| `/api/value-set-governance/submit`  | POST | steward | submit a version for review |
| `/api/value-set-governance/approve` | POST | reviewer | maker-checker enforced at the boundary |
| `/api/value-set-governance/reject`  | POST | steward | reject the pending version |
| `/api/value-set-governance/retire`  | POST | steward | retire an approved version |
| `/api/value-set-governance/replay`  | POST | steward OR reviewer | returns the chosen-version binding |
| `/api/value-set-governance/history` | GET  | steward OR reviewer | PHI-free transition history |

Supporting private lib (colocated, non-routable `_lib/`):
- `_lib/backendPort.ts` — the `GovernanceBackend` contract (submit/approve/reject/retire/replay/history/getRecord/makerCheckerEnabled) + PHI-free record/history/binding types.
- `_lib/backendAdapter.ts` — `resolveGovernanceBackend()` + `registerGovernanceBackend()` registration seam, plus a clearly-labeled in-memory integration double (temporary stand-in, unused once Wave A registers).
- `_lib/routeKit.ts` — `requireGovRole`, `resolveGovActor`, body validation, PHI-free 401/403/400/500 helpers, `auditGov`, `recordToWire`.

## DoD proof

- **Role-gating (E9 fail-closed):** `requireGovRole(allowed)` returns 401 when unauthenticated and 403 when the principal's governance role is absent or not in the allowed set — NEVER default-allow. Steward vs reviewer capabilities are gated per route. Governance role is read from the raw session `role` field so the slice is resilient to Wave A not yet having widened the `Role` union.
- **Maker-checker at the ROUTE boundary (defense in depth):** `approve/route.ts` fetches `backend.getRecord(valueSetId)` and returns 403 BEFORE any backend call when `makerCheckerEnabled()` and `submittedBy === actor.userId`. The backend enforces the same rule; the route is the redundant boundary gate. Actor identity is the fhirUser reference from `getPrincipal`.
- **Call-not-duplicate:** every state change delegates to `resolveGovernanceBackend().{submit,approve,reject,retire,replay,history}`. No lifecycle logic lives in a route handler; the handlers only authorize, validate, delegate, audit, and project to a PHI-free wire shape.
- **PHI-safe:** requests carry only `valueSetId` / `version` (validated against id/version patterns); responses carry ids/versions/states/actor-references only. Every error uses `ooError` with a generic PHI-free diagnostic. Audit events reference `ValueSet/<id>` only. All 20 tests assert `expectPhiSafeBody`.

## Integration point (Wave A parallel)

Wave A's backend and the two roles (`value-set-steward`, `value-set-reviewer`) are not present in the tree at authoring time. The routes depend ONLY on the port, so Wave A wires its real facade with ONE call at startup and no route change:

```ts
import { registerGovernanceBackend } from 'src/app/api/value-set-governance/_lib/backendAdapter';
import { valueSetGovernanceBackend } from '@/lib/terminology/governance'; // Wave A
registerGovernanceBackend(valueSetGovernanceBackend);
```

Until then the labeled integration double stands in so this slice compiles, tests, and role-gates independently. The governance-role literals are matched from the session role string, so no dependency on the guard `Role` union having been extended yet.

## Tests — `tests/api/routes-value-set-governance.test.ts` (20 tests, all green)

Built on `tests/api/_helpers` (`makeRequest`, `readJson`, `expectPhiSafeBody`), session/role injected via inline `smartSession` mock:
- 401 no-principal (submit, approve, history)
- 403 wrong-role: steward tries approve; reviewer tries submit; reviewer tries retire; non-governance role denied on history and replay
- 403 maker self-approve (maker-checker at boundary), body matches `/maker-checker/i`
- 200 reviewer approve (maker != checker) → state `approved`, `approvedBy` = reviewer
- 200 steward submit → `pending-approval`, `submittedBy` recorded
- 200 history read (steward and reviewer); 400 when `valueSetId` missing
- 200 replay returns chosen-version binding (`version` === `boundVersion` === `2.1.0`), for steward and reviewer
- 400 validation (missing valueSetId, missing version)
- 200 steward reject → `rejected`; 200 steward retire → `retired`
- PHI-safe assertions on every error AND success body

No skipped cases in this file (all infra is in-process via the port; nothing infra-bound to skip).

## Verification (in /home/claude/baseline)

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run tests/api` → **175 passed | 9 skipped** (the 9 skips are pre-existing in other files; this file: 20 passed, 0 skipped)
- `npx vitest run tests/api/routes-value-set-governance.test.ts` → **20 passed**
- `bash check-file-sizes.sh` → **PASS** (no new violations; all new files ≤ 177 lines prod / 314 lines test, well under 400/500 caps)
