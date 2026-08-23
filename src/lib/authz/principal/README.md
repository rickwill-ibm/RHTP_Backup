# authz/principal — session-principal role model

Derives the **acting principal** from the session and answers a single question:
**may this principal access this member's record?** It closes the two deferred
cycle-3 IDOR findings on the evidence read and financial-clearance routes by
replacing (a) the hardcoded `role:'pa-reviewer'` and (b) the request-supplied
member id that both routes previously trusted.

## Model

```
Principal = { userId, role, authorizedMemberScope }
MemberScope.kind = 'self' | 'panel' | 'org'
```

- **role** reuses the existing vocabulary in `src/lib/authz/guard.ts`
  (`member | provider | payer-ops | pa-reviewer | care-manager | admin | auditor`).
  No second, conflicting role system is introduced.
- **authorizedMemberScope** is the envelope the principal may touch:
  - `self`  — a `member`-role principal: their own record only.
  - `panel` — a reviewer / care-manager bounded to an explicitly assigned set of members.
  - `org`   — an unbounded operational role (organization-wide reach).

## Derivation (`getPrincipal(session)`)

Pure. Reads only non-secret session facts (ids / references / scopes, never a token):

| Session fact | Effect |
|---|---|
| explicit `role` from the IdP | used verbatim if known |
| `fhirUser` starts `Practitioner/` | role `pa-reviewer` (reviewer-class) |
| `fhirUser` starts `Patient/` or `RelatedPerson/` | role `member` |
| neither identifies the caller | **fails secure** → `member` (self-only) |
| role is `member` | scope `self` on `session.patient` |
| reviewer role + `panel` present | scope `panel` |
| reviewer role, no panel | scope `org` (current production default) |

The demo/dev session sets `fhirUser: 'Practitioner/dev'`, so it resolves to a
reviewer with organization-wide scope — its current cross-member access is
preserved. A real member SMART login (`fhirUser: 'Patient/<id>'`) resolves to a
self-only member.

## Decision (`canAccessMember(principal, memberId)`)

- `self`  → allow iff `memberId` equals the scoped member.
- `panel` → allow iff `memberId` is in the assigned panel.
- `org`   → allow.

Returns a PHI-safe `{ allow, reason }` (the reason names the scope decision, never
member data). `purposeForRole(role)` maps a role to the permitted purpose so the
existing `canReadMemberData` policy runs as a second, defense-in-depth gate driven
by the **real** session role rather than a constant.

## Wiring

Both routes derive the principal from `smartSession.getSessionAuthContext()`, then:

1. `canAccessMember(principal, targetMemberId)` — scope check → PHI-safe **403**
   (audited `*.idor-denied`) when the requested member is outside scope.
2. `canReadMemberData({ role: principal.role, purpose: purposeForRole(role), ... })`
   — the existing role/purpose policy, now fed the real role → **403** on deny.

Routes wired: `src/app/api/evidence/[id]/route.ts`,
`src/app/api/financial-clearance/route.ts`. (The FHIR passthrough Patient read was
scoped in Iteration 1 wave C and is unchanged here.)

## Documented remainder

`panel` scope is **modeled and enforced**, but the panel-assignment data source is
not yet wired, so production reviewers currently resolve to `org` scope (which
preserves today's behavior and the demo). When a reviewer→panel assignment store
exists, populate `PrincipalSession.panel` (from the session/IdP) and reviewers are
automatically bounded to their panel with no route change. This is the honest gap:
cross-member reads are now gated on **who is calling** (member vs reviewer) rather
than a trusted request id, but reviewer reads are org-wide until panel data lands.
