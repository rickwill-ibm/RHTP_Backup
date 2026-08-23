# Iteration 7 — verbatim agent prompts (exactly as sent)

Iteration-level master prompt (inherited by all below): `coalition/inputs/iteration7_context.md`. Below are the exact per-agent prompts sent via the Agent tool this iteration.

---

## Agent: iter7 probe (harness/scope)
```
Harness probe for Iteration 7 in /home/claude/baseline. Do exactly: (1) Bash `cd /home/claude/baseline && node -e "console.log('ok')"`; (2) confirm exist (ls): src/lib/pipeline/adapters/_TEMPLATE.md, src/lib/graph/mapping/index.ts; (3) locate the existing Part 2 / restricted-node handling: `rg -l "Part 2|part2|RESTRICTED|restricted|segmentation" src/lib/graph src/lib/pipeline | head`; (4) locate the goldenThread PA state machine: `rg -l "paMachine|prior-auth|PriorAuth|ClaimResponse" src/lib | head`; (5) Write /home/claude/baseline/.iter7probe with "ok". Reply under 45 words: node ok, template+mapping exist y/n, the Part 2 handling file(s), the PA state machine file(s).
```

## Agent: iter7 wave A — behavioral health + SUD + F2 Part 2 (HIGH CARE specialist)
```
You are the HIGH-CARE domain engineer, Iteration 7 wave A, in /home/claude/baseline (live tree, committed to production repo). Build the behavioral-health domain (BH + SUD) AND close register F2 (real 42 CFR Part 2 segmentation). FIRST READ /home/claude/coalition/inputs/iteration7_context.md IN FULL (the F2 CLOSURE section is your core spec + the L3 pinned namespace) and src/lib/pipeline/adapters/_TEMPLATE.md + the medication reference. Read existing Part 2 handling: src/lib/graph/types.ts, src/lib/pipeline/types.ts, and how the graph does restricted/consent-scoped lens reads (rg "restricted|consent" src/lib/graph). Read the consent seam (src/lib/consent) and the break-glass pattern (rg "break-glass|breakGlass|x-break-glass" src). Do NOT touch claims/pa (wave B) or assessments/caregiver/documents (wave C). Own tests/pipeline/domainNamespaceIntegrity.waveA.test.ts.

BUILD via the template + the F2 spec:
1. behavioral-health domain (`behavioral-health`, T1): src/lib/pipeline/adapters/behavioralHealth.ts (synthetic FHIR Condition for BH incl. an SUD subset, coded; -> normalized records, T1, provenance) + src/lib/graph/mapping/behavioralHealth.ts (node Condition; the SUD subset projects as a RESTRICTED node honoring the Part 2 label). Register both.
2. F2 REAL PART 2 SEGMENTATION:
   - Segment on the RIGHT basis: a record is Part 2-protected when it originates from a federally-assisted SUD program context (source/facility type + SUD diagnosis/service), NOT a single-code guess. Apply the segmentation label at transform; carry it to the RESTRICTED graph node. Make the basis a small, documented rule set, not a magic code.
   - Consent-directed release: a Part 2 record is disclosed only with a consent naming recipient + purpose (model the consent scope). Absent consent = held-restricted (not silently dropped, not disclosed).
   - Re-disclosure: a disclosed Part 2 record carries the re-disclosure-prohibition marker.
   - Break-glass: an emergency-access path granting time-boxed access with a DISTINCT audit class (reason captured, PHI-safe audited), reusing the existing break-glass pattern. Never a silent override.
   - Honest scope: full consent-management is I8A; deliver correct basis + restricted projection + consent-scope check + break-glass + re-disclosure marker, and note what remains.
3. Tests (tests/pipeline + tests/graph + waveA namespace pin): BH normalization T1; SUD subset gets the Part 2 label on the right basis (and a NON-SUD BH record does NOT); restricted node excluded from a lens without consent, included WITH consent, included via break-glass (audited); re-disclosure marker present; a wrongly-basised record is not over-restricted. This is the F2 proof.

VERIFY: npx tsc --noEmit 0; npx vitest run fully green; bash check-file-sizes.sh PASS; npx vitest run tests/governance green. WRITE /home/claude/baseline/ITER7_WAVEA_REPORT.md: [output contract]. Reply ONLY: BH domain built y/n, F2 segmentation basis correct y/n, break-glass audited y/n, new test count, verification status.
```

## Agent: iter7 wave B — claims-financial + pa-lifecycle (specialist)
```
You are the domain engineer, Iteration 7 wave B... [ROLE + disjoint-tree boundary: do NOT touch wave A or C; own the waveB namespace pin file]. READS: iteration7_context.md (L3 namespace), _TEMPLATE.md, medication reference, the existing goldenThread PA state machine paMachine.ts + pasService.ts (LINK to it, do not duplicate).
SCOPE: 1) claims-financial (Claim/ClaimResponse/EOB -> golden-thread chain, CARC/RARC on denials) + mapping (has-claim/adjudicated-by/explained-by). 2) pa-lifecycle with a STATUS LIFECYCLE (submitted->pending->approved/denied/appealed), linked to paMachine but CRITICAL: must NOT set authoritative PA state - only paMachine/ClaimResponse does; reference, do not drive. 3) pin waveB. 4) tests incl. an assertion the pa-lifecycle domain does NOT mutate paMachine state.
VERIFY: tsc 0; vitest green; size gate. OUTPUT CONTRACT: report + reply-only line (domains, PA-does-not-set-authoritative-state y/n, test count, pin updated y/n, verification).
```
(condensed here for length; the full text mirrors wave A's structure exactly - role, reads, numbered scope, verify, output contract, style)

## Agent: iter7 wave C — assessments + caregiver-household + documents (specialist)
```
You are the domain engineer, Iteration 7 wave C... [disjoint-tree boundary; own waveC namespace pin]. READS: iteration7_context.md, _TEMPLATE.md, medication reference.
SCOPE: 1) assessments (QuestionnaireResponse, T1, provenance patient-reported vs clinician). 2) caregiver-household (RelatedPerson, T1, relationship role). 3) documents (DocumentReference, tier T2 DOCUMENT-LEVEL - honestly NOT computable T1; carry doc-type + content pointer, do NOT pretend to extract T1 data). 4) pin waveC. 5) tests incl. SPECIFICALLY assert documents is T2 and carries no parsed clinical data.
VERIFY: tsc 0; vitest green; size gate. OUTPUT CONTRACT: report + reply-only line (domains, documents-is-T2 y/n, test count, pin updated y/n, verification).
```

---

## Prompt-engineering review notes (for improvement)
- STRENGTHS observed this iteration: each prompt carries an explicit disjoint-tree boundary ("do NOT touch wave X"), a pre-allocated namespace to claim from, an honest-scope clause (F2 "what remains for I8A", documents "do not pretend to extract T1"), and a fixed reply-only output contract that makes results parseable. These are deliberate anti-drift / anti-overclaim devices.
- WEAKNESSES / optimization targets: (1) prompts are hand-authored per wave and repeat governance boilerplate; they should be COMPOSED from the persona cards (docs/framework/references/personas.md) + the brief. (2) The reads list is long; a per-agent context manifest (spine artifact) would tighten it. (3) The verify block is duplicated; it is really the DoD and could be referenced. (4) Wave B/C here are shown condensed - going forward every per-agent prompt is captured FULLY verbatim in this file at send time, not summarized.

## Agent: iter7 wave D — convergence + red-team panel (COMPOSED per v1.1 standard; captured verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity=42 CFR Part 2/privacy-law + financial-integrity, R2 negative-space, R3 stub-legitimacy). Framework v1.1.
INHERITS: coalition/inputs/iteration7_context.md.
CONTEXT MANIFEST: read the 3 wave reports + register + the 6 domains' adapter/mapping code + Part 2 restricted-node handling; may edit any file to fix findings; add no new domains.
SCOPE: 1) convergence (registries + WpcDomain=17 + per-wave namespace pins, determinism, console, ratchet, BFF). 2) E9 FAIL-OPEN SWEEP (standing check): rg fail-open shapes; Part 2 ambiguity must fail RESTRICTED not disclosable; fix Unacceptable now. 3) RED-TEAM PANEL mandatory: R1 Part2/financial, R2 negative-space missing-list, R3 stub-legitimacy; fix Unacceptable; append Iteration-7 register section.
DoD: composite DoD; specifically prove tsc 0, suite green, governance green, Part 2 fails-safe, C9 17/20.
OUTPUT: ITER7_WAVED_REPORT.md + ITERATION7_SUMMARY.md; reply-only line (convergence, E9 result, R1/R2/R3 findings, Unacceptable fixed, F2 disposition, register y/n, DRY, verification).
STYLE: no em dash followed by a space; no double spaces.
```
NOTE: this is the first prompt authored under the v1.1 Prompt Composition Standard - blocks are ROLE/INHERITS/CONTEXT MANIFEST/SCOPE/DoD-ref/OUTPUT/STYLE, boilerplate referenced not inlined. Compare its length + structure to the wave-A/B/C hand-authored prompts above.

## Wave D outcome + review note
The E9 fail-open sweep (new standing check) found TWO Unacceptable fail-open defects on the Part 2 restricted path (SUD defaulting to disclosable on ambiguous provenance; a lens vacuous-every disclosure). Both fixed fail-safe. REVIEW NOTE: promoting the fail-open sweep from an ad-hoc red-team habit to a NAMED standing check immediately caught the highest-severity class on the highest-stakes surface. This is the E9 gate paying off before it is even a lint. Strong signal to implement E9 as a mechanical CI check next.
