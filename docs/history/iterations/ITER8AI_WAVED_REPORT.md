# Iteration 8A-i — Wave D report: convergence + E9 sweep + red-team panel

Role: Convergence engineer (B3) + red-team panel host. Framework v1.2.
Working tree: /home/claude/baseline (live, committed to the production repo).
Scope: reconcile the three build waves (A survivorship+xref, B external EMPI,
C provider identity) to DRY; run the E9 fail-open standing sweep on the IDENTITY
path; host the mandatory R1/R2/R3 red-team panel; fix all Unacceptable; close /
advance F3 + F5 in the register. No new domains added.

## 1. Convergence to DRY

The three shared-file partitions were reconciled and confirmed consistent:

- **`config/dataMode.ts`** — wave C (`providerIdentity`) and wave A
  (`crossReference`) appended blocks coexist; no duplicate seam ids;
  `DEFAULT_DATA_MODES` derives from the frozen `DATA_MODE_SEAMS` union.
- **`config/seamDispositions.ts`** — both new entries present, both
  `fail-closed-stub` with named `*NotConfiguredError`; the completeness +
  proof-coverage governance gate is green (probers registered for both new seams
  in `seamFailClosed.test.ts`).
- **`identity/index.ts`** — the barrel carried ONLY wave A's export block; waves
  B (`external`) and C (`provider`) never appended theirs. **Convergence action:**
  added collision-free `export * from './external'` and `export * from
  './provider'` so the identity public surface is complete and non-divergent.
  tsc 0 after. (No consumer imported the missing symbols through the barrel — the
  governance test imports the sub-barrels directly — so this is a consistency fix,
  not a break repair.)
- **Registries consistent** — `DATA_MODE_SEAMS` ⇄ `SEAM_DISPOSITIONS` one-to-one;
  no divergent exports; resolver-kind (`internal | external-pixpdq |
  external-pixm-pdqm`) layered over the `identity` seam, unchanged and correct.
- **Determinism intact** — every new module injects the clock (`clock.now` /
  `opts.now`) and rng; no `Date.now()` / `Math.random()` at a decision point.
- **Per-wave test partitions all run** — `tests/identity/{survivorship,
  crossReference,externalEmpi,providerIdentity}.test.ts` green.

## 2. E9 fail-open sweep (IDENTITY PATH) — result: FIXED-1

Swept every `catch` / `??` / `||` fallback + default-return shape across
`src/lib/identity`. One genuine identity-path fail-open found and fixed
fail-closed NOW:

**E9-8Ai-1 (Unacceptable → FIXED)** — the PDQ/PDQm DEMOGRAPHIC parse fabricated
an enterprise anchor. `parsePdqResponse` (hl7v2.ts) and `parsePdqmResponse`
(fhirPixm.ts) used `ids.find(id => authority === enterprise) ?? ids[0]`: a
candidate with NO id in the enterprise assigning authority had an arbitrary
peer-domain id (e.g. a local MRN) promoted to `enterpriseId` and mislabeled with
the enterprise authority. `decideDemographic` would then auto-link the member to
that wrong-domain anchor once the demographic score cleared auto-link (90). Fix:

- parse: no enterprise-authority id → `enterpriseId: ''`; the candidate is
  RETAINED (still counts toward dominance/ambiguity, never dropped).
- `decideDemographic`: an `anchorable` guard now HOLDS any top candidate with an
  empty `enterpriseId`, however high its demographic confidence.
- +2 regression tests (HL7v2 + FHIR): a 99-confidence peer-only candidate is
  HELD, `memberId === ''`.

The PIX/PIXm CROSS-REFERENCE path was already correct (no enterprise match →
`not-found` / `ambiguous` → `enterpriseId: ''` → HELD). Every other fallback is
justified in place: provider `mergeRecord` (directory fact wins else inline, NPI
authoritative — not fail-open); survivorship `recency-fallback` (deliberate,
provenance-labeled); xref `?? new Set` and clock defaults; external async
resolvers throw `ExternalEmpiNotConfiguredError` when unwired (never a default
identity); id-only xref-ambiguous → HELD.

**E9 statement:** an ambiguous/low-confidence match fails to HELD; an unresolved
external query throws `ExternalEmpiNotConfiguredError` or resolves HELD (never a
default identity); an unresolvable provider stays raw+flagged or throws (never a
fabricated NPI). No fail-open shapes remain on the identity path.

## 3. Red-team panel (every persona produced findings)

### R1 — Domain-Fidelity (IHE PIX/PDQ + PIXm/PDQm, EMPI survivorship, NPPES)

| id | sev | finding | disposition |
|---|---|---|---|
| R1-8Ai-1 | Unacceptable | PDQ/PDQm demographic parse fabricated an enterprise anchor from a peer id; high-confidence demographic candidate auto-linked to a wrong-domain identifier. | **FIXED this wave** (E9-8Ai-1). |
| R1-8Ai-2 | MED | Survivorship `rules.tiebreak` validates `'source-order'` but `winnerForField` always applies most-recent; declared config never honored. | OPEN → I8A. Not fail-open (deterministic, provenance-labeled). |
| R1-8Ai-3 | MED | PIX/PDQ (MSH/QPD/RCP, CX `value^^^&OID&ISO`) + PIXm/PDQm (`$ihe-pix` Parameters, PDQm Bundle `search.score`) standard-faithful in shape but verified only vs a message-shaped fake; no live MLLP/ACK framing, retransmit, timeout. | OPEN → NS-05 (live integration). Logic real, transport fail-closed. |
| R1-8Ai-4 | LOW | `extractNpi` returns the first Luhn-valid `\d{10}` run; an 11+-digit token could yield a spurious-but-valid substring. | OPEN (low). Synthetic feeds only; anchor always check-digit-valid. |

Verified real/standard-faithful: PIX QBP^Q23 / PDQ QBP^Q22 build + RSP^K23/K22
parse; PIXm `$ihe-pix` + PDQm `Patient?` FHIR query/parse; assigning-authority /
OID split (enterprise vs peer; >1 enterprise → ambiguous → HELD); survivorship a
true golden-record PROJECTION (source-attributed facts stored, golden view
derived, per-field provenance, rules AS DATA changeable without data loss);
merge/unmerge rekey-by-REPLAY (`graph/replay.ts`, survivor-keyed events, never
in-place); NPI validation the real NPPES `80840`-prefixed Luhn (verified vs
known-valid + bad-check-digit).

### R2 — Negative-Space (production identity capability entirely ABSENT)

Missing-list: (1) link/unlink **audit trail** surface (who/why — ties open
R1-DL1); (2) **held-review adjudication UI** to inspect the candidate set and
record MERGE/LINK/CREATE-NEW; (3) cross-reference under **concurrent writers**
(pg race, proven only via pg-mem); (4) **external assigning-authority conflicts**
(two MPIs disagree on the enterprise id; OID change); (5) survivorship
**tie-breaks** beyond most-recent (source-order unwired; no clinical rules); (6)
**unmerge split completeness** (facts accreted while merged are survivor-keyed);
(7) **provider coverage** beyond referrals (claims/care-team/medication — F5-b).

### R3 — Stub-Legitimacy (grade the new external seams)

| seam | grade | rationale |
|---|---|---|
| `crossReference` pg store | **Acceptable** | fail-closed-stub; prod-no-factory throws `CrossReferenceStoreNotConfiguredError`; append-only, no UPDATE/DELETE; pg logic via pg-mem; governance prober present. |
| `identity` external MPI (PIX/PDQ + PIXm/PDQm) | **Acceptable** | build/parse real, verified vs fake MPI; unwired transport OR incomplete config throws `ExternalEmpiNotConfiguredError` before any work; after E9-8Ai-1 no fail-open in parse→disposition. |
| `providerIdentity` NPPES | **Acceptable** | fail-closed-stub; prod-no-client throws `NppesNotConfiguredError`; seed is a labeled synthetic data file never served as prod; lookup miss → `undefined`, never fabricated. |

**0 Risky, 0 Unacceptable left open.** The single Unacceptable (R1-8Ai-1) fixed
this wave.

## 4. F3 / F5 disposition

- **F3 (CRITICAL) → CLOSED.** Survivorship projection + cross-reference
  fragmentation fix + replay-rekey merge/unmerge; E9 xref-ambiguous → HELD.
  Residual: live pg verified only via pg-mem → folds into NS-05.
- **F5 (HIGH) → CLOSED.** Real NPPES 80840-Luhn NPI validation + fail-closed
  NPPES directory seam + referral performer resolution to a ProviderIdentity
  node. Residual: **F5-b (HIGH)** — claims/care-team/medication performer refs
  still raw (apply `anchorProviderRef` to the remaining mappings) → I8A.

Register updated: `verification/GAP_AND_STUB_RISK_REGISTER.md` gains an
"ITERATION 8A-i" section (F3/F5 close, E9 fix, R1/R2/R3 tables, dispositions);
the CRITICAL/HIGH tables mark F3 and F5 CLOSED and add F5-b.

## 5. Final verification (composite gate v1.2)

- `tsc --noEmit`: **0 errors**.
- Full suite: **1198 passed, 1 expected-fail, 91 skipped, 0 failed** (+2 E9
  regression tests over the merged waves' 1196). Orchestrator re-runs
  authoritatively.
- Identity + governance partitions: **141 passed** (was 139; +2).
- Size / ratchet: **PASS**, no new violations; every edited file under cap
  (hl7v2 279, fhirPixm 194, disposition 97, barrel 46; test 421 < 500).
- E9: no fail-open shapes on the identity path (1 fixed).
- E1: `crossReference`, `providerIdentity`, external `identity` all declared /
  confirmed fail-closed with named errors + governance probers.
- Convergence: DRY (shared partitions reconciled, barrel completed, registries
  one-to-one).
- Red-team: all three personas produced findings; 0 new Unacceptable open.
