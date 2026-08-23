# Iteration 3 — IDOR closeout via a session-principal role model

Scope: close the 2 deferred IDOR findings (cycle-3 HIGH #2 / MEDIUM #3, retained
as `it.fails` in Iteration-1 wave C) on `/api/evidence/[id]` and
`/api/financial-clearance` with a session-principal role model. Parallel-agent
modules (`src/lib/agentRuntime`, `src/lib/agents`) were not touched.

## The principal model — `src/lib/authz/principal/`

Feature-first, 3 files, all under cap (`types.ts` 66, `index.ts` 145,
`README.md` 75).

```
Principal        = { userId, role, authorizedMemberScope }
MemberScope.kind = 'self' | 'panel' | 'org'
```

- **Roles reuse** the existing `src/lib/authz/guard.ts` vocabulary
  (`member | provider | payer-ops | pa-reviewer | care-manager | admin | auditor`).
  No conflicting second role system.
- **`getPrincipal(session)`** (pure) derives the acting identity from non-secret
  session facts (`smartSession.getSessionAuthContext()` — a new accessor returning
  `{ patient, fhirUser, scope }`, ids/references only, never a token):
  - `fhirUser` `Practitioner/…` → `pa-reviewer`; `Patient/…`/`RelatedPerson/…` →
    `member`; an explicit IdP `role` wins; **unidentifiable → fails secure to a
    self-only member**.
  - scope: `member` → `self` on the launch patient; reviewer roles → `panel` when
    an assigned panel is present, else `org` (current production default).
- **`canAccessMember(principal, memberId)`** decides: `self` allows only the
  scoped member; `panel` allows only assigned members; `org` allows any. Returns a
  PHI-safe `{ allow, reason }` (reason names the scope decision, never member data).
- **`purposeForRole(role)`** maps the principal's role to a permitted purpose so
  the existing `canReadMemberData` policy runs as a second, defense-in-depth gate
  driven by the **real** role instead of a constant.

This replaces BOTH the hardcoded `role:'pa-reviewer'` and the request-supplied id
that the routes previously trusted. The demo's reviewer session
(`fhirUser: 'Practitioner/dev'`) resolves to a reviewer with org scope, so its
current cross-member access is preserved.

## Routes fixed (before / after)

### `src/app/api/evidence/[id]/route.ts`
- **Before:** `canReadMemberData({ role: 'pa-reviewer', purpose: 'operations' })` —
  a constant; every authenticated caller was a reviewer, and the member id parsed
  from the evidence id was never checked against the session.
- **After:** after the consent gate, derive `principal = getPrincipal(await
  getSessionAuthContext())`, then `canAccessMember(principal, memberId)` → PHI-safe
  **403** audited `evidence.read.idor-denied` when the requested member is outside
  scope. Then `canReadMemberData` runs with `principal.role` /
  `purposeForRole(role)` as a second gate.

### `src/app/api/financial-clearance/route.ts`
- **Before:** `canReadMemberData({ role: 'pa-reviewer', purpose: 'operations',
  targetPatientId })` — the constant role meant a member-scoped session could pass
  any `body.patientId` and read another member's clearance.
- **After:** same pattern — `canAccessMember(principal, patientId)` → PHI-safe
  **403** audited `financial-clearance.idor-denied` when the body id is outside the
  session principal's scope; then the role-driven `canReadMemberData` gate.

The FHIR passthrough Patient read (scoped in wave C) was left unchanged
(out of these two findings' scope).

## Behavior-safety

The default session principal is a **reviewer with org scope** — identical
authorization to the prior hardcoded `pa-reviewer`, so every existing cross-member
ops read stays green. Only a session that identifies as a **member**
(`fhirUser: 'Patient/…'`) is self-only. The mocked-guard deny tests still 403
because `canReadMemberData` is retained as the second gate.

## Tests

- **New `tests/security/principal-authz.test.ts`** (24 cases): unit derivation
  (Practitioner→reviewer/org, Patient→member/self, panel, fail-secure, explicit
  role); unit `canAccessMember` (member self allow/deny, reviewer org allow,
  reviewer panel allow-in / deny-out, missing target, `purposeForRole`); route
  layer (member cross-member evidence 403 + self 200, member financial 403,
  reviewer cross-member evidence/financial 200, reviewer panel out-of-scope 403 /
  in-scope 200); grep proof both routes no longer match `role:\s*['"]pa-reviewer['"]`.
- **`tests/security/idor.test.ts`** — the 2 remaining IDOR `it.fails` (evidence +
  financial-clearance) **flipped to positive 403 assertions**; the file now models
  a member-scoped session (`fhirUser: 'Patient/MARIA_SD_001'`).
- **`tests/api/_helpers.ts`** — added `getSessionAuthContext` to the shared
  `smartSession` mock (reviewer default) + `fhirUser`/`scope`/`panel` to
  `sessionState`. Centralized, so all route tests keep prior behavior.

`it.fails` flipped: **2** (both IDOR findings). Remaining repo `it.fails`: **1** —
`input-validation.test.ts` `/api/match` no-body-validation in dev-mock (cycle-3
MEDIUM #5, an input-validation finding, not an IDOR finding, out of this scope).

## Hardcoded-role removal — grep proof

```
$ rg -n "role:\s*'pa-reviewer'" src/app/api/evidence src/app/api/financial-clearance
NONE FOUND
```

## Documented remainder

- **Panel scope is enforced but not yet sourced.** `getPrincipal` supports
  `panel` scope and the routes enforce it, but no reviewer→panel assignment store
  exists yet, so production reviewers resolve to `org` scope (preserving today's
  behavior). When an assignment store lands, populate `PrincipalSession.panel` and
  reviewers are automatically bounded — no route change. This is the honest gap:
  cross-member reads are now gated on **who is calling** (member vs reviewer)
  rather than a trusted request id, but reviewer reads are org-wide until panel
  data is wired.
- **`/api/work-queue`** still carries a hardcoded `role:'pa-reviewer'`
  (cycle-3 MEDIUM #3), but it is a list surface with no per-member id in the
  request, so it is not one of the 2 IDOR findings and is left as documented
  (its principal wiring is a follow-up, mechanically identical to these two).

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` (whole repo) → **693 passed, 0 failed, 1 expected-fail
  (match no-validation), 78 skipped**.
- `bash check-file-sizes.sh` → **PASS**, ratchet intact (75 frozen files
  unchanged); new files 66/145/75 lines, both edited routes under cap.
- Live-integration-executed count: **0** (no external backbone exercised; this
  finding is pure BFF authorization logic).
