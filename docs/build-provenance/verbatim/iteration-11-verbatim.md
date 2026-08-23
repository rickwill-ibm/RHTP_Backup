# Iteration 11 — verbatim agent prompts (closeout; composed per v1.2->v1.3)

Iteration-level master brief inherited by all: `coalition/inputs/iteration11_context.md`. Composed per the standard, captured verbatim at send-time (E10). Wave D (convergence + R5 cross-examiner red-team) appended at iteration close.

---

## Agent: 11 wave A — F5-b provider resolution + claims integrity + CARC group
```
ROLE: Claims/provider-integration specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration11_context.md (Wave A scope).
CONTEXT MANIFEST: read the brief; the 8A-i provider resolver (src/lib/identity/provider/{resolver,npi,node}.ts - the anchorProviderRef NPI->ProviderIdentity pattern to REUSE); the referral mapping that already resolves (src/lib/graph/mapping/referral.ts) as the template; the claims mapping + adapter (rg -l "claims|Claim|ClaimResponse|ADJUDICATED_BY|EXPLAINED_BY|CARC" src/lib); care-team + medication mappings with raw performer/prescriber refs; the stage-4 terminology gate (semanticValidator). You OWN the claims/careTeam/medication provider-ref resolution + claims integrity + CARC group in those mappings + tests/pipeline/{claimsProviderRef,claimsIntegrity,carcGroup}.test.ts. Do NOT add domains (wave B) or touch referral/goal lifecycle (wave C). REUSE the resolver + terminology gate, do not reimplement.
Working tree /home/claude/baseline; live.
SCOPE: 1) F5-b: resolve claims/care-team/medication performer+prescriber refs to a ProviderIdentity node via the NPI resolver; no valid NPI -> stays raw+flagged (never invent an NPI). 2) claims golden-thread integrity: a ClaimResponse whose Claim node is absent must HOLD/quarantine (reuse dead-letter) rather than create a dangling ADJUDICATED_BY/EXPLAINED_BY edge. 3) CARC group code: capture the X12 group (CO/PR/OA/PI) so member-liability (CO write-off vs PR member-owes) is derivable; route CARC/RARC through the stage-4 terminology gate. Tests prove each.
Verify: npx tsc --noEmit 0; npx vitest run tests/pipeline tests/graph green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove F5-b resolution + orphan-claim-does-not-dangle + CARC-group-captured. E9: unresolvable provider stays raw; orphan claim holds not dangles; missing CARC group does not default a liability.
OUTPUT: /home/claude/baseline/ITER11_WAVEA_REPORT.md; reply ONLY: f5b-resolved y/n, claims-integrity-enforced y/n, carc-group-captured y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 11 wave B — 3 new record domains (conditions, diagnostic-reports, family-history) -> 20/20
```
ROLE: Domain engineer (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration11_context.md (Wave B scope).
CONTEXT MANIFEST: read the brief; the L7 template (src/lib/pipeline/adapters/_TEMPLATE.md); a recent domain as a model (behavioralHealth or medications adapter + its graph mapping); the WpcDomain union (src/lib/pipeline/types.ts - 17 domains); the domain registry + record-count assertion; the stage-4 semantic gate. You OWN src/lib/pipeline/adapters/{conditions,diagnosticReports,familyHistory}.ts + src/lib/graph/mapping/{conditions,diagnosticReports,familyHistory}.ts + the WpcDomain 3-append block + registrations + tests/pipeline/{conditions,diagnosticReports,familyHistory}.test.ts + the 20/20 record-count test. Do NOT touch claims/provider (wave A) or referral/goal (wave C).
Working tree /home/claude/baseline; live.
SCOPE (through the template): 1) conditions (Condition / problem list; ICD-10-CM + SNOMED codings; clinicalStatus/verificationStatus; HCC-relevant; T1) - governed codings run the semantic gate. 2) diagnostic-reports (DiagnosticReport incl. imaging; category, result Observation linkage, presentedForm pointer; T1 where computable, honest T2 for narrative-only). 3) family-history (FamilyMemberHistory; relationship, condition codings; T1). Register all 3; extend WpcDomain to 20; the record-count test asserts 20/20.
Verify: npx tsc --noEmit 0; npx vitest run tests/pipeline green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; 3 domains T1 (documents-honest where narrative), registered, semantic-gated; record 20/20 tested. E9: a narrative-only diagnostic must not claim T1 it cannot compute.
OUTPUT: /home/claude/baseline/ITER11_WAVEB_REPORT.md; reply ONLY: conditions y/n, diagnostic-reports y/n, family-history y/n, record-20-of-20 y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 11 wave C — referral loop-closure + goal status + survivorship tiebreak
```
ROLE: Care-coordination lifecycle specialist (B2), disjoint tree. Framework v1.2.
INHERITS: coalition/inputs/iteration11_context.md (Wave C scope).
CONTEXT MANIFEST: read the brief; src/lib/graph/mapping/referral.ts (ServiceRequest capture - add the status lifecycle) + goalTask.ts (Goal/Task - add status); src/lib/identity/survivorship/rules.ts (winnerForField - honor the source-order tiebreak that is declared but ignored, R1-8Ai-2). You OWN referral.ts + goalTask.ts lifecycle + survivorship/rules.ts tiebreak + tests/{pipeline/referralLifecycle,pipeline/goalStatus,identity/survivorshipTiebreak}.test.ts. Do NOT touch claims/provider (A) or the new domains (B).
Working tree /home/claude/baseline; live.
SCOPE: 1) referral loop-closure: ServiceRequest.status lifecycle (active->on-hold->completed/revoked/entered-in-error) + a closed-loop signal (scheduled/seen/declined/dropped) so closed-loop rate is computable. 2) Goal: lifecycleStatus (proposed->active->completed/cancelled) + achievementStatus (in-progress/achieved/not-achieved) + target, so a goal can be MET; keep the Task.focus->Goal linkage. 3) survivorship source-order tiebreak: winnerForField must honor tiebreak='source-order' (currently always most-recent) - deterministic, provenance-labeled. Tests prove each transition + the tiebreak.
Verify: npx tsc --noEmit 0; npx vitest run tests/pipeline tests/identity green; bash check-file-sizes.sh PASS.
DoD: composite v1.2; prove referral lifecycle + closed-loop signal, goal achievement, source-order tiebreak honored. E9: a lifecycle default must not silently mark a referral/goal complete.
OUTPUT: /home/claude/baseline/ITER11_WAVEC_REPORT.md; reply ONLY: referral-loop-closure y/n, goal-status y/n, tiebreak-honored y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 11 wave F — framework enhancement (R5 verification/cross-examiner persona + E12)
```
ROLE: Framework author (B1/spine), disjoint tree - DOCS ONLY (docs/framework), no product code. Framework v1.2 -> v1.3.
INHERITS: coalition/inputs/iteration11_context.md (Wave F scope).
CONTEXT MANIFEST: read the brief; docs/framework/SKILL.md; docs/framework/references/{personas.md, enforcement-kit.md, operating-model.md}. You OWN docs/framework/** only. Do NOT touch src/ or tests/.
Working tree /home/claude/baseline; live.
SCOPE: 1) personas.md: add R5 - the VERIFICATION / CROSS-EXAMINER adversary. Unlike R1-R4 (each hunts one defect class), R5 CROSS-EXAMINES the other reviewers' verdicts and the build's own claims: for each 'supported / fixed / closed / green', does it hold under a hostile re-read? is it a shallow-test green? did a fix open a new seam? R5 outputs a demote/uphold verdict per prior claim + a rationale. This is the 'stronger verification agent to spot what conformance review misses' the owner asked for. 2) enforcement-kit.md: add E12 - claim-vs-evidence check: every register CLOSED / matrix supported item must cite a passing test id that EXISTS and actually exercises the claim; a closed item with no live evidence fails the check. Add E12 to the composite DoD. 3) SKILL.md: bump to v1.3, note R5 + E12 in the version line + the E-list + the persona/DoD references. 4) Repackage: produce the updated docs/framework/agentic-build-framework.skill (zip of SKILL.md + references) - note in the report the repackage command so the orchestrator can rebuild the distributable + the v1.3 team zip.
Verify: no code to compile; confirm the docs are internally consistent (E-list, DoD, persona list all mention R5/E12/v1.3).
DoD: R5 persona + E12 gate documented + wired into the DoD; SKILL.md v1.3. E9 n/a (docs). This is the framework self-improvement the whole build has been feeding.
OUTPUT: /home/claude/baseline/ITER11_WAVEF_REPORT.md; reply ONLY: r5-persona y/n, e12-gate y/n, dod-updated y/n, skill-v1.3 y/n, files changed count.
STYLE: no em dash followed by a space; no double spaces.
```
Note: composed COMPLETE prompts as sent.

---

## Agent: 11 wave D — convergence + FIVE-persona red-team incl. R5 cross-examiner (COMPOSED v1.3; verbatim per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host for the FULL FIVE-persona panel (R1 domain-fidelity, R2 negative-space, R3 stub-legitimacy, R4 governance, and the NEW R5 VERIFICATION/CROSS-EXAMINER turned on THIS iteration's own claims). Framework v1.3.
INHERITS: coalition/inputs/iteration11_context.md.
CONTEXT MANIFEST: working tree /home/claude/baseline (live). Read ITER11_WAVEA/B/C/F_REPORT.md; the changed claims/provider/CARC + new-domain + referral/goal/tiebreak code; src/lib/pipeline/types.ts (WpcDomain=20); verification/GAP_AND_STUB_RISK_REGISTER.md (the findings this iteration closes: F5-b, R1-I7-5, R1-I7-6, R1-I6-1, R1-I6-2, R1-8Ai-2). Edit any file to fix findings; add no new capability.
SCOPE:
1) CONVERGENCE to DRY: reconcile shared partitions (WpcDomain union appended once to 20; registries one-to-one; provider resolution + terminology gate + dead-letter REUSED not duplicated across waves). Confirm all per-wave test partitions run.
2) E9 FAIL-OPEN SWEEP: orphan claim must HOLD not dangle; unresolvable provider stays raw; missing CARC group must not default a liability; a narrative-only diagnostic must not claim T1; a lifecycle default must not silently mark a referral/goal complete. Fix any Unacceptable.
3) FIVE-PERSONA RED-TEAM (every persona MUST produce findings): R1 domain-fidelity on the 3 new domains + claims/CARC + lifecycle correctness; R2 negative-space; R3 stub-legitimacy; R4 governance; and R5 CROSS-EXAMINER: hostilely re-read EACH claim this iteration makes (f5b-resolved, claims-integrity, carc-group, conditions/diagnostic/family T1, record-20/20, referral-loop-closure, goal-status, tiebreak) and each register item about to be marked CLOSED - is the cited test DEEP (exercises the requirement, not a tautology/mock-echo/happy-path)? UPHOLD or DEMOTE each; demotions do NOT get closed.
4) E12 CLAIM-VS-EVIDENCE: before marking any register finding CLOSED, confirm it cites a real passing test id that exercises it. Only then close F5-b, R1-I7-5, R1-I7-6, R1-I6-1, R1-I6-2, R1-8Ai-2. Update verification/GAP_AND_STUB_RISK_REGISTER.md with an Iteration 11 FINAL CLOSEOUT: record 20/20; the closed findings (each with its evidencing test); and the FINAL residual list = ONLY the non-buildable items (live infra/NS-05, licensing, external accreditation). State the build is at buildable-completion.
DoD (composite v1.3): tsc 0; full suite green (orchestrator re-runs); size/ratchet PASS; no fail-open (E9); seams fail-closed (E1); convergence DRY; five-persona panel ran incl R5 with per-claim verdicts; E12 satisfied (no closed item without live test); zero new Unacceptable; register final closeout done; record 20/20.
OUTPUT: /home/claude/baseline/ITER11_WAVED_REPORT.md + ITERATION11_SUMMARY.md. Reply ONLY: convergence DRY y/n, E9 result, R1/R2/R3/R4 counts, R5 verdicts {upheld/demoted}, E12 satisfied y/n, findings-closed count, record-20/20 y/n, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
