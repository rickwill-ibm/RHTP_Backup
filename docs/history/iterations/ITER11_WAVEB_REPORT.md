# ITER11 Wave B (B2) Report: conditions, diagnostic-reports, family-history

Role: Domain engineer (B2), disjoint tree. Framework v1.2. Composite v1.2.
Scope owned: `src/lib/pipeline/adapters/{conditions,diagnosticReports,familyHistory}.ts`,
`src/lib/graph/mapping/{conditions,diagnosticReports,familyHistory}.ts`, the WpcDomain
3-append block, both registrations, `tests/pipeline/{conditions,diagnosticReports,familyHistory}.test.ts`,
and the 20/20 record-count test. Did NOT touch claims/provider (Wave A) or referral/goal (Wave C).

## What was built (three C9 record domains, through the L7 template)

| Domain id | Adapter | Mapping | Resource | Event | Tier | Node / Edge |
|---|---|---|---|---|---|---|
| `conditions` | `adapters/conditions.ts` | `mapping/conditions.ts` | Condition (problem list) | `condition.recorded` | T1 | `Condition` / `HAS_PROBLEM` (assoc, dated) |
| `diagnostic-reports` | `adapters/diagnosticReports.ts` | `mapping/diagnosticReports.ts` | DiagnosticReport (lab + imaging) | `diagnostic-report.recorded` | T1 computable / T2 narrative | `DiagnosticReport` / `HAS_DIAGNOSTIC_REPORT` (assoc) + `REPORTS_RESULT`->`Observation` |
| `family-history` | `adapters/familyHistory.ts` | `mapping/familyHistory.ts` | FamilyMemberHistory | `family-history.recorded` | T1 | `FamilyMemberHistory` / `HAS_FAMILY_HISTORY` (assoc, dated) |

All adapters: FHIR-JSON, batch arrival; subject anchored through the injected identity
seam (never the graph key, plan §1.2); PHI-minimal payloads (codes + refs only); clock
injected (deterministic); one deliberately malformed record per fixture exercises the
quarantine lane with a PHI-safe reason code.

### 1. conditions — coded problem list, HCC-relevant, semantic-gated
- Carries ICD-10-CM + (when dual-coded) SNOMED-CT + (when attached) CMS-HCC codings.
  `hccRelevant` is honest and source-driven: true iff a CMS-HCC coding is present; the
  adapter never infers risk adjustment from the ICD alone.
- **Added `'conditions'` to `CODE_CARRYING_DOMAINS`** (`semanticBinding.ts`), so its
  governed codings run the SAME stage-4 semantic gate at transform time: an unrecognized
  or retired diagnosis code is quarantined before admission, PHI-safe reason
  (`semantic-unrecognized-code`), proven by a test. This required updating the one
  enumerating assertion in `tests/pipeline/semanticBinding.test.ts` (a Wave-C-authored
  pin) to include `conditions`; that is the single cross-file edit outside my tree, and
  it is the legitimate consequence of gating the new domain (the set is append-only).
- Distinct from `behavioral-health` (which owns the BH/Part 2 Condition subset via its
  own `behavioral-health.*` namespace). Both project `Condition` nodes keyed by their own
  `conditionRef`, so they never collide.

### 2. diagnostic-reports — honest per-record tier (E9)
- Tier is assigned PER RECORD by computability: a report that LINKS structured `result`
  Observations is computable -> **T1** (emits `REPORTS_RESULT` edges to the Observation
  nodes the labs domain owns); a NARRATIVE-ONLY imaging report (only a `presentedForm`
  pointer, no structured results, no computable code) is **T2**, carrying `computable:false`
  and the pointer, and emits NO `REPORTS_RESULT` edge.
- **E9 satisfied and tested**: a narrative-only diagnostic never claims the T1 it cannot
  compute, and never fabricates result linkage. The e2e test asserts the propagated
  events carry tiers `['T1','T2']` honestly. A report with neither results nor a
  presentedForm is quarantined (`missing-report-content`).

### 3. family-history — relationship + coded relative conditions
- Captures the relationship role (v3-RoleCode) and the SNOMED/ICD condition codings
  attributed to the relative. The relative is NEVER a graph node and is never anchored
  (PHI-minimal): only the role + condition codes ride as node properties. The member is
  anchored through the seam. Associative attachment, not a causal claim about the member.

## Registrations (open/closed; append-only, clearly commented)
- `WpcDomain` extended 17 -> 20 (append block in `types.ts`, order preserved).
- `src/lib/pipeline/index.ts`: three adapters + payload types exported.
- `src/lib/graph/mapping/index.ts`: three specs imported and appended to `MAPPING_SPECS`.
- The projector / runTransform / runPipeline / lenses are unchanged (they read the
  registries and never name a domain).

## The 20/20 record-count test
`tests/pipeline/domainRecordCount.test.ts` pins the count from both ends:
1. `ALL_WPC_DOMAINS: WpcDomain[]` (20 entries) — TypeScript rejects any non-existent
   domain id at compile time.
2. Runtime: `MAPPING_SPECS.length === 20`, and the set of the 20 declared ids equals the
   set of domains the registered specs claim. A spec without a domain, or a domain without
   its spec, breaks the equality. 20 ids <-> 20 registered specs.

## Namespace pinning (F-C1 lesson)
Each domain's own test file pins its constants against the adapter, the mapping, and BOTH
registries, and asserts every `eventType` the adapter emits is claimed by exactly that
domain's spec. Kept in the owned per-domain test files (not the shared integrity files) to
avoid edit conflicts with the parallel waves.

## Verification (in /home/claude/baseline)
- `npx tsc --noEmit`: **0 errors**.
- `npx vitest run tests/pipeline`: **34 files, 236 tests, all green** (four new test files
  add 29 tests; nothing prior broke).
- `npx vitest run tests/graph`: 20 files, 132 tests green (no regression).
- `bash check-file-sizes.sh`: **PASS** (no new violations; ratchet intact). New files:
  adapters 148-177 lines, mappings 70-93, tests 154-186 — all under the 400/500 caps.

## C9 coverage matrix delta
Domains: **20/20**. New rows: conditions (T1, semantic-gated), diagnostic-reports
(T1/T2 honest), family-history (T1). Real-backend integration count stays 0 (pure record
domains project over the in-memory / pg-mem fakes).

New tests added: **29**.
