# P1b — Critical fix: the MD-SMART summary screen renders mock data, and the frozen monolith blocks the seam

**Status:** documented, on hold (per decision 3). This is the design of record for the fix; no code lands until it is scheduled.
**Scope:** `src/app/md-smart-launch/components/MdSmartSummaryScreen.tsx` (2,504 lines, frozen in `quality-baseline.json`) and its data module `MdSmartSummaryScreen.data.ts`.
**Related:** the projected-graph holistic seam (`buildHolisticContextFromGraph`), the coding-gap → RADV bridge (`materializeCandidateCaptures`, P1a), and `GET /api/wpc/context`.

## The defect

MD-SMART is the flagship point-of-care clinician surface — the screen a provider opens inside Cerner to see the member's whole-person summary, care gaps, CDI/HCC opportunities, medications, labs, and referrals. Every value it renders is a **hardcoded constant** for a single fictional patient ("Maria"), imported directly from `MdSmartSummaryScreen.data.ts` (`VISIT_REASONS`, `CARE_GAPS_ENHANCED`, `CDI_OPPORTUNITIES`, `MEDS_DATA`, `LABS_DATA`, `CHRONIC_CONDITIONS`, …). The screen never reads the member it was launched for. The platform now has a real, consent-scoped whole-person context for that member in the projected graph — the very data this screen purports to show — and the two are not connected.

This is a **critical** fix for three reasons. First, demo integrity: the screen presents fabricated clinical values (A1C 9.2%, eGFR 42, specific NDCs and prescribers) as if they were the launched member's, which is exactly the "unwired realness" the platform's own E14 gate exists to catch — here in the UI layer the gate does not reach. Second, patient safety at go-live: a clinician acting on another person's labs and medication list is a wrong-patient hazard; the screen must show the launched member or show nothing. Third, it silently strands P1a: the coding-gap → RADV candidate captures we just built have no path to the surface where a provider would actually act on them.

## Why the obvious fix is blocked

The screen is a 2,504-line monolith frozen in the quality baseline (`"src/app/md-smart-launch/components/MdSmartSummaryScreen.tsx": 2504`). The size gate is a **ratchet**: any net line-add to a frozen file fails `check:sizes`. The natural fix — thread real data through the component's body, add loading/empty/consent states inline, map graph shapes to view models in place — adds hundreds of lines to the one file that cannot grow. So the fix is not "wire it up"; it is "wire it up **without adding a net line to the monolith**," and that constraint is what makes it a designed change rather than an afternoon's edit.

## The fix: a data seam the component consumes by props, mapping done outside the frozen file

Invert the dependency. Today the component *imports* mock constants; after the fix it *receives* a single typed data object, and all mapping, fetching, and fallback live in new files the ratchet does not freeze.

**1. Name the contract.** Promote the shapes already implied by `MdSmartSummaryScreen.data.ts` into one exported interface, `MdSmartData` (visitReasons, careGaps, cdiOpportunities, meds, labs, chronicConditions, referrals, sdohBadges, vitalsTrend, journeyPhase, …). The existing constants become its **default value**, `MOCK_MD_SMART_DATA` — the demo's Maria, unchanged, so the demo is byte-for-byte preserved. This is a move, not a rewrite, and it happens in the *data* file, not the frozen component.

**2. Map real → contract in a new file.** Add `mdSmartFromContext.ts` (new, unfrozen): a pure function `mdSmartFromContext(ctx: HolisticPatientContext, candidates: CandidateCapture[]): MdSmartData`. It projects the real member's context onto the view model — `clinicalProfile` → chronic conditions and labs, `codingGaps` + the RADV candidates → the CDI/HCC opportunity cards (now honest: only closed-gap, RADV-defensible candidates render as actionable, suspected gaps render as hypotheses), care-gap Flags → the gaps table, meds/referrals from their dimensions. It is PHI-safe by construction (it consumes the already-consent-filtered context) and fully unit-testable off a seeded store, exactly like the P1a bridge.

**3. Switch the component from import to prop — a line-for-line change.** The frozen file changes only its *import surface*: replace `import { VISIT_REASONS, … } from './MdSmartSummaryScreen.data'` with `import { MOCK_MD_SMART_DATA, type MdSmartData } from './MdSmartSummaryScreen.data'` and take `data: MdSmartData = MOCK_MD_SMART_DATA` as a prop, then reference `data.visitReasons` where it referenced `VISIT_REASONS`. These are **substitutions**, not additions — the net line count holds flat or falls, so the ratchet stays green. Renaming references is mechanical and reviewable; no new control flow enters the monolith.

**4. Fetch, fallback, and states in the container.** A new `MdSmartSummaryContainer.tsx` (unfrozen) calls `GET /api/wpc/context?memberId=…` (and, for the opportunity cards, `GET /api/risk-adjustment/hcc?memberId=…`), runs `mdSmartFromContext`, and renders `<MdSmartSummaryScreen data={…} />`. Loading, empty (member has no projected context → show an explicit "no data for this member" state, never Maria), and consent-restricted states live here — the container is where real-world states belong, and none of them touch the frozen file. The route already fails closed (503) and is tenant- + role-scoped; the container surfaces those honestly.

## Why this respects every existing invariant

The size ratchet stays green because the monolith's body is edited by substitution, not addition, and all genuinely new code (the mapper, the container, the states) lands in new files with their own budgets. The demo stays pixel-identical because `MOCK_MD_SMART_DATA` is the old constants unchanged and is the default when no `data` prop is supplied — the seam is opt-in per mount. E14 improves: the real screen becomes reachable from the real context seam instead of being a mock island. Consent is inherited, not re-implemented: the mapper consumes the already-filtered `HolisticPatientContext`, so a Part 2-restricted item the lens dropped can never reappear on the screen. And it unblocks P1a: the RADV candidate captures finally have a clinician surface.

## Test + rollback plan

Unit-test `mdSmartFromContext` on a seeded store for the five demo members (both graph backends), asserting the mapped view model matches the member's real dimensions and that a restricted item never surfaces without scope. Add one container test that the empty-context path renders the "no data" state, not the mock. Snapshot the demo mount (`data` defaulted) to prove Maria is unchanged. Rollback is a one-line revert at each mount (drop the `data` prop → mock default returns), so the change is dark-launchable screen-by-screen and reversible without touching the mapper.

## Effort and sequencing

The mechanical reference-rename in the frozen file is the bulk of the diff and the only risky part (2,504 lines of substitutions to review); the mapper and container are small and well-bounded. Sequence it **after** Wave D so the RAF the opportunity cards display is the real hierarchy-aware value, not a placeholder. Until then this document is the design of record; the screen stays on mock data with this defect known and tracked, rather than a half-wired seam that would fail the ratchet or the demo-parity gate.
