# Iteration 8A-ii — verbatim agent prompts (exactly as sent, composed per v1.2)

Iteration-level master brief inherited by all: `coalition/inputs/iteration8aii_context.md`. Each per-agent prompt is COMPOSED (ROLE / INHERITS / CONTEXT MANIFEST / SCOPE / DoD / OUTPUT / STYLE) and captured verbatim at send-time (E10). Wave D appended at iteration close.

---

## Agent: 8A-ii wave A — real validate + expand + version + UCUM
```
ROLE: Terminology specialist (framework B2), disjoint tree. Framework v1.2.
INHERITS: /home/claude/coalition/inputs/iteration8aii_context.md (Wave A scope + pinned namespace + shared-file partitions).
CONTEXT MANIFEST: read the brief; src/lib/terminology/{types.ts, semanticValidator.ts, seedTerminologyService.ts, productionTerminologyService.ts, index.ts}; src/lib/terminology/registry/{valueSetRegistry.ts, assetTypes.ts, data/terminology-assets.json}; src/lib/terminology/data/terminology-seed.json; src/lib/config/{dataMode,seamDispositions}.ts; src/lib/clock.ts. You OWN src/lib/terminology/{semanticValidator.ts, seedTerminologyService.ts}, new src/lib/terminology/{validateCode,expand}/, terminology-seed.json membership/version extensions, and tests/terminology/{validateCode,expand,version,ucum}.test.ts. Do NOT touch translate/ or classify/ (wave B) or registry/currency.ts or pipeline wiring (wave C). Shared files (seamDispositions.ts, dataMode.ts, terminology/index.ts, registry/index.ts): append ONLY your clearly-commented block.
Working tree /home/claude/baseline; live, committed to production repo.

SCOPE (make validate real):
1. validateCode REAL over the seeded value sets: a governed coding (RxNorm/LOINC/SNOMED-CT/ICD-10-CM/CPT-HCPCS/HCC) is valid ONLY if it is a member of the bound value-set VERSION. Return CodeValidation with the CodeAssetBinding (assetId, version, current). Unknown code in a governed system -> unknown-code; ungoverned system -> unsupported-system.
2. $expand: enumerate the membership of a value-set version (bounded, PHI-free) so membership checks are real, not a flat allowlist.
3. Version + retirement: a code valid in an older version but RETIRED/removed in the CURRENT bound version returns a `retired` status (invalid for admission) with the bound version noted. Inject clock for "current version at check time" (deterministic).
4. UCUM: for LOINC quantitative results, validate the unit is a valid UCUM unit and appropriate for the LOINC (seeded UCUM allowlist per LOINC). A bad unit is a semantic finding.
5. Production posture unchanged: productionTerminologyService stays fail-closed (throws / gate quarantines `semantic-terminology-unavailable`).
6. Tests: member-of-version valid; non-member unknown-code; retired code rejected with version; $expand enumerates; UCUM good/bad unit; production fails closed. PHI-safe findings only.

DoD: composite DoD v1.2; specifically prove member-of-bound-version validity, retired-code rejection, $expand, UCUM. E9: an unverifiable OR retired code must NOT pass as valid.
OUTPUT: write /home/claude/baseline/ITER8AII_WAVEA_REPORT.md; reply ONLY: validate-real y/n, expand y/n, retired-rejected y/n, ucum y/n, new test count, verification status (tsc/vitest/size).
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-ii wave B — $translate crosswalks + HCC/risk classification
```
ROLE: Terminology/classification specialist (B2), disjoint tree. Framework v1.2.
INHERITS: /home/claude/coalition/inputs/iteration8aii_context.md (Wave B scope).
CONTEXT MANIFEST: read the brief; src/lib/terminology/{types.ts, index.ts}; registry/{assetTypes.ts (families clinical/risk/behavioral/social), data/terminology-assets.json}; src/lib/config/{dataMode,seamDispositions}.ts; src/lib/clock.ts. You OWN src/lib/terminology/translate/ and src/lib/terminology/classify/ and their data/ seed files and tests/terminology/{translate,classify}.test.ts. Do NOT touch semanticValidator/seedTerminologyService/validateCode/expand (wave A) or registry/currency.ts or pipeline (wave C). Shared files: append only your clearly-commented block.
Working tree /home/claude/baseline; live.

SCOPE ($translate + classification):
1. $translate cross-map over SEEDED crosswalks: at minimum ICD-10-CM <-> CMS-HCC and SNOMED-CT <-> ICD-10-CM. Given a source coding, return the target coding(s) with the crosswalk asset id + version. An untranslatable code returns NO-MAP (empty), never a guessed/fabricated target.
2. Classification: map a diagnosis code to its HCC group via the seeded HCC crosswalk (data-driven, versioned). Expose the risk-family taxonomy (CMS-HCC, RxHCC, HHS-HCC, CDPS) as DATA so HCC is clearly ONE family of several. Classification returns the group + the bound asset/version.
3. Live crosswalk server is CI-pending: fail-closed via the terminology seam (extend the SAME seam; do not mint a second) when a live-only translation is requested and not configured.
4. Deterministic; feature-first; <=400 lines/file; README for the crosswalk/classify data provenance (what the seed represents, that it is synthetic/sample not the full licensed map).
5. Tests: ICD-10 -> HCC translate returns seeded target+version; SNOMED -> ICD-10 translate; untranslatable -> no-map (not fabricated); HCC classification data-driven with version; risk families enumerated (HCC is one); live-only path fails closed.

DoD: composite DoD v1.2; prove real seeded crosswalk translate, no fabricated maps, data-driven HCC classification, risk families as data. E9: an untranslatable code must NOT fabricate a target.
OUTPUT: write /home/claude/baseline/ITER8AII_WAVEB_REPORT.md; reply ONLY: translate-real y/n, no-fabricated-map y/n, hcc-classify-data-driven y/n, risk-families-as-data y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-ii wave C — pipeline binding + value-set currency
```
ROLE: Pipeline/terminology-integration specialist (B2), disjoint tree. Framework v1.2.
INHERITS: /home/claude/coalition/inputs/iteration8aii_context.md (Wave C scope).
CONTEXT MANIFEST: read the brief; src/lib/terminology/{semanticValidator.ts (the stage-4 gate you WIRE, do not reimplement), index.ts}; registry/{valueSetRegistry.ts, assetTypes.ts}; how the pipeline runs stage-4 validation + quarantine (rg "stage-4|semantic|quarantine|FhirProfileValidator" src/lib/pipeline); the dead-letter/quarantine path (src/lib/deadLetter); the code-carrying adapters (medications, labs, conditions/behavioral-health, procedures, immunizations) in src/lib/pipeline/adapters; src/lib/clock.ts. You OWN src/lib/terminology/registry/currency.ts + the pipeline stage-4 binding wiring + tests/terminology/currency.test.ts + tests/pipeline/semanticBinding.test.ts. Do NOT reimplement validateCode/translate/classify (waves A/B) - CALL them. Shared files: append only your clearly-commented block.
Working tree /home/claude/baseline; live.

SCOPE (bind + currency):
1. Pipeline binding: code-carrying domains run their governed codings through the stage-4 semantic gate at transform; a semantic failure QUARANTINES PHI-safe (reuse the existing dead-letter/quarantine path - do NOT invent a new store), never admits an unverified or retired code. Bind by REUSING wave A's validateCode via the semanticValidator - do not duplicate logic.
2. Value-set currency enforcement (registry/currency.ts): a value-set binding whose bound version is EXPIRED/SUPERSEDED is flagged; in production posture a stale binding quarantines rather than validating against a stale set. Deterministic (inject clock for "expired at check time").
3. Tests: a code-carrying record with a bad code is quarantined (not admitted); a good record passes; a record bound to a stale/expired value-set version is flagged/quarantined in production posture; the binding reuses the semantic gate (no duplicated validation logic).

DoD: composite DoD v1.2; prove pipeline binding quarantines bad/retired codes, currency enforcement on stale versions, reuse (no duplication). E9: a stale value-set version must NOT silently validate; an unverifiable code must fail closed.
OUTPUT: write /home/claude/baseline/ITER8AII_WAVEC_REPORT.md; reply ONLY: pipeline-binding y/n, quarantines-bad-code y/n, currency-enforced y/n, reuse-not-duplicate y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```
Note: composed COMPLETE prompts as sent.

---

## Agent: 8A-ii wave D — convergence + red-team panel (COMPOSED v1.2; captured verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity = terminology / semantic interoperability: RxNorm/LOINC/SNOMED-CT/ICD-10-CM/CPT-HCPCS/CVX/UCUM/HCC correctness, FHIR $validate-code/$translate/$expand semantics, value-set binding + versioning/retirement, Gravity/Z-code SDOH; R2 negative-space; R3 stub-legitimacy on the new seed/crosswalk data). Framework v1.2.
INHERITS: /home/claude/coalition/inputs/iteration8aii_context.md.
CONTEXT MANIFEST: working tree /home/claude/baseline (live). Read ITER8AII_WAVEA/B/C_REPORT.md; src/lib/terminology/** (validateCode, expand, translate, classify, registry/currency, semanticValidator, index); src/lib/config/{dataMode,seamDispositions}.ts; the pipeline stage-4 binding + quarantine path; verification/GAP_AND_STUB_RISK_REGISTER.md. You MAY edit any file to fix findings; add NO new domains.
SCOPE:
1) CONVERGENCE to DRY: reconcile the shared partitions the three waves appended to (seamDispositions.ts, dataMode.ts, terminology/index.ts, registry/index.ts, types.ts) - no duplicate seam entries or divergent exports; confirm the per-wave test partitions all run; validateCode is CALLED by the pipeline binding (wave C) and by translate/classify where needed, not duplicated; determinism (clock) intact.
2) E9 FAIL-OPEN SWEEP on the TERMINOLOGY path: an unverifiable OR retired code must fail closed / quarantine, never pass as valid; an untranslatable code must return no-map, never a fabricated target; a stale/expired value-set version must not silently validate; the production terminology server stays fail-closed. rg the fail-open shapes across src/lib/terminology; each hit justified inline or fixed fail-closed NOW.
3) RED-TEAM PANEL (mandatory; every persona MUST produce findings):
   - R1 terminology/semantic: are the code systems + URIs correct? Is $validate-code member-of-value-set (not a flat allowlist)? Is $translate a real seeded crosswalk with asset+version (no fabricated maps)? Is retirement/version handled per FHIR (a retired code is not active)? Is HCC classification one family among CMS-HCC/RxHCC/HHS-HCC/CDPS? UCUM correctness on LOINC quantities? Gravity/Z-code SDOH coverage gaps?
   - R2 negative-space: what is ABSENT (value-set expansion caching/invalidation, code-system version pinning per binding, partial-match/post-coordination for SNOMED, translate reverse-direction, bulk validate, terminology audit trail)? Missing-list, not a pass.
   - R3 stub-legitimacy: grade the seed/crosswalk/HCC data + the extended seam Acceptable/Risky/Unacceptable; anything that could masquerade as the full licensed map or fail open is Unacceptable - fix now (or clearly label synthetic + fail-closed for live).
4) Fix all Unacceptable this wave. Update verification/GAP_AND_STUB_RISK_REGISTER.md: add an "Iteration 8A-ii" section; note the terminology stub advanced to real logic with residuals (live server, full licensed maps) routed forward.
DoD (composite gate v1.2): tsc 0; full suite green (orchestrator re-runs it authoritatively); size/ratchet PASS; no fail-open shapes (E9); seams declared fail-closed (E1); convergence DRY; every red-team persona produced findings; zero new Unacceptable left open; register updated.
OUTPUT: write /home/claude/baseline/ITER8AII_WAVED_REPORT.md. Reply ONLY: convergence DRY y/n, E9 result (clean or fixed-N), R1/R2/R3 finding counts, Unacceptable fixed y/n, register updated y/n, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
