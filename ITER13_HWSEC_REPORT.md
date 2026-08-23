# Iteration 13 — HW-SEC: Security & multi-tenancy (the tenant/plan/LOB boundary)

Phase 1 · program-spine contract **C-TEN** (the keystone) · framework v1.5 · governing constraints #1–#3.

## Definition of Ready
- NFR/regulatory manifest: tenant isolation (no cross-tenant/cross-LOB member access, even for an
  org-scoped reviewer), fail-closed on absent claim, demo-neutral (single demo tenant), config-switched.
- Lens-coverage: security & multi-tenancy (owning), domain-fidelity (LOB taxonomy), stub-legitimacy
  (production must not fall back to demo scope), negative-space (BOLA on clinical reads).
- Consumes: C-DEMO (HW0 gate). Freezes for downstream: **C-TEN** (`TenantContext`, `TenantScope`,
  `assertTenantScope`, `canAccessMemberTenantAware`, `resolveMemberTenant`) — HW1 stores, HW2 audit,
  HW3 CRUD, HW-FIN, HW4 all build tenant-scoped against this.

## What landed (all real, wired, gated)
- `src/lib/security/tenant/` — `types.ts` (`TenantContext{tenantId,planId,lob}`, `TenantScope`,
  `LINES_OF_BUSINESS`), `resolve.ts` (member-tenant + actor-scope resolution, seam-gated),
  `authz.ts` (`assertTenantScope` fail-closed + `canAccessMemberTenantAware` composing tenant ∧
  member scope), `index.ts`.
- **BOLA closed** — `src/app/api/fhir/[...path]/route.ts`: the documented gap ("clinical searches
  remain a reviewer surface") is now gated. Every non-Patient clinical read (Coverage/Condition/…)
  passes `canAccessMemberTenantAware` before serving; cross-tenant/out-of-scope → 403 + audit.
  Break-glass excepted (audited). **Wired** — E14 reachable 535→539.
- `tenancy` seam registered in `dataMode.ts` + `seamDispositions.ts` (real-impl) with a governance
  prober proving production never returns the demo scope (no mock fallback) and fails closed on an
  absent tenant claim.
- Tests: `tests/security/tenant.test.ts` (6) — demo permissive; production denies cross-tenant even
  for org scope; matching-claim allows; empty-claim fails closed; LOB sub-scoping. Governance suite
  extended (tenancy prober) — 34 pass.

## Demo preservation (constraint #2) — proven
Golden diff after the change: `config.dataModes` **ADDED ['tenancy']**, REMOVED none; every other
panel byte-identical. FHIR passthrough route tests: 7 pass. The demo runs as the single demo tenant,
so the BOLA gate is permissive in mock — no demo behavior changed. Golden regenerated intentionally.

## Gate results
tsc 0 · tenant+governance tests 34 pass · E14 134/134 (tenant module WIRED, reachable +4) ·
demo-preservation 26 pass · seam completeness + fail-closed governance green.

## Production-Readiness / ceiling
The enforcement logic is production-real and wired. The live cutover needs the IdP to emit the
verified `tenantId`/`tenantIds`/`lobs` claims on the session (an integration step, NS-05 ceiling);
until then production fails closed (deny), which is the safe posture. Secrets rotation, rate-limiting,
CSP/CSRF headers, and SBOM (the rest of the security lens) are follow-on HW-SEC work items.
