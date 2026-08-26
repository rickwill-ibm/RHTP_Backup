# Cycle 1A Report: Mechanical Hardening Sweeper (Iteration 0)

Date: 2026-08-22. Tree: /home/claude/baseline. Governing rules: AI-CODING-CONVENTIONS_v2 and ACE Production Gap Execution Plan sections 11-12. All paths below are relative to /home/claude/baseline.

Note on concurrency: while this cycle ran, another cycle was actively writing new route tests into tests/api/ (11 new files, root-owned, timestamps during this session). That is why the vitest total rose from the 223 baseline to 330; the count never fell and all pass. A transient tsc error in their tests/api/_helpers.ts appeared mid-session and was fixed by that cycle before final verification; no action was needed from this cycle.

## Sweep 1: Persona residue (defect class, conventions section 1.2)

### Logic fixes (2 files)

| File | Fix |
|---|---|
| src/lib/services/carePlanGenerator.helpers.ts | Minted referral ids as `ref-margaret-<ts>-<n>` for every member. Replaced with a slug derived from the member context: `ref-<memberId-slug>-<ts>-<n>` (lowercased, non-alphanumerics collapsed to `-`). |
| src/app/md-smart-launch/components/OrderEntryModule.tsx | buildFhirServiceRequest hardcoded `display: 'Margaret Okonkwo'` on the subject while the reference was the dynamic launch `patientId`. Removed the hardcoded display (FhirReference.display is optional); the reference alone carries the patient. |

No other logic file mints identifiers, keys, or templates from a persona name.

### Classified as DATA (persona content legitimate, left in place)

Pure data / seed / mock modules in src/lib:

- src/lib/mockData.data.ts, mockData.data2.ts, mockData.data.patients.ts, mockData.data.providers.ts (demo referrals, care plans, episodes)
- src/lib/patientRegistry.data1.ts, patientContext.defaults.ts (Maria Redhawk and Dorothy Simmons default states, FHIR id maps)
- src/lib/socialMockData.data1.ts, socialMockData.data2.ts (SDOH demo dataset)
- src/lib/sdResourceData.ts, sdResourceData.data2.ts (MARIA_CONFIRMED_PRAPARE and transport resources)
- src/lib/smartFhirMockData.ts (mock CDS cards and launch context)
- src/lib/fhirCareTeamData.data.ts (legacy static export defaulting to the Maria dataset)
- src/lib/wholePersonGraphData.ts (knowledge graph nodes for the Maria demo)
- src/lib/identity/identitySource.ts (demo identity source records)
- src/lib/server/devStubs.profiles.ts, devStubs.dtr.ts, devStubs.cds.ts, devStubs.pas.ts (dev-mode stub payloads keyed to demo patient profiles)
- src/lib/careTeam/triage.ts (demo signal dataset), careTeam/population.ts and careTeam/attribution.ts (synthetic-name pools that merely include common names such as Margaret; not persona logic)
- src/lib/policy/goldCarding.ts (demo provider roster; persona appears only in comments), src/lib/policy/README.md (docs)
- src/lib/networkAdequacy/network.ts and networkAdequacy/data/network-adequacy.seed.json (seed network, comments only)
- src/lib/cms0057fEndpoints.ts (patient-to-endpoint data map; also carries DEFAULT_PATIENT_ID, see follow-ups)
- src/lib/fhir/store.ts seeds fhir/seed/maria-redhawk.bundle.json and exports DEMO_PATIENT_ID constants (seed wiring)
- src/uhg/data/* (maria.ts, persona.ts, citizenContext.ts, journeys.ts, scenario.ts, scenarioRegistry.ts), src/uhg/components/shared/* including MariaStatusStrip.tsx and orchestration payloads, src/uhg/lib/generateDetailedScreenPDF.ts and generateTalkTrackPDF.ts (demo deck content), src/uhg/lib/signalGenerator.ts and src/uhg/store/demoStore.ts (demo scenario data and staging; the Maria signal injection is the product feature being demoed)
- src/components/pa/OrderView.tsx (MARIA_BANNER prefill data), src/components/DemoNavigator.tsx (demo scenario table), src/components/PostmanSuiteTab.tsx (default demo patient for collection generation), src/components/networkAdequacy/NetworkAssistant.tsx (example prompt copy)
- All matched src/app pages and components (about 70 files, e.g. care-manager, care-team-inbox, crisis-pathway, chw-workflow, patient-detail/*, referral-tracking/*, uhg-orchestrate/*, md-smart-launch/* data and screens): page copy rendering demo persona content; no identifier generation from persona names found in any of them beyond the OrderEntryModule fix above.

### Accepted persona-keyed demo routing (logic files, intentionally left; see follow-ups)

These select demo datasets or default the active patient via the demo member id MARIA_SD_001 (an id constant, not a name baked into generated identifiers): src/lib/services/holisticContextEngine.ts, src/lib/pa/dtrService.ts, src/lib/careTeam/visitPlan.ts, src/lib/careTeam/graph/resources.ts, src/lib/careTeam/identity.ts, src/lib/networkAdequacy/assistant.ts (query parser recognizes the demo persona by design), src/lib/server/smartSession.ts (dev session default), src/lib/appContext.tsx, src/lib/patientContext.tsx, src/lib/runtimeConfig.ts.

## Sweep 2: Determinism (injected clock/rng seam)

Pattern chosen (applied consistently, documented at each refactored file): a single module src/lib/clock.ts (new, 41 lines) holding module-level defaults `let _now = () => Date.now()` and `let _rng = () => Math.random()` with exported test setters setClock/setRng. Call sites use `clock.now()`, `clock.nowDate()`, `clock.nowIso()`, `clock.rng()` via `import * as clock from '@/lib/clock'`; the import line in every refactored file carries the seam comment. Defaults preserve production behavior exactly; no behavior change.

Files refactored (31), one line why each: every no-arg `new Date()`, `Date.now()`, and `Math.random()` in the file routed through the seam.

- src/lib/stores/carePlanStore.ts (plan timestamps, note ids)
- src/lib/exportUtils.ts and src/lib/exportUtils.pdf.ts (export filenames and generated-at stamps)
- src/lib/services/referralService.fhir.ts (authoredOn / issued / recorded stamps)
- src/lib/services/patientService.ts (observation and audit timestamps)
- src/lib/services/carePlanGenerator.goals.ts, carePlanGenerator.helpers.ts, carePlanGenerator.holistic.ts (goal dates, referral ids, deadline math)
- src/lib/services/tieredInterventionGenerator.ts and tieredInterventionGenerator.helpers.ts (intervention scheduling)
- src/lib/services/fhirResourceMappers.ts (daysOpen / age computations; frozen file, held at its 444-line baseline by removing one blank line)
- src/lib/services/holisticContextEngine.ts (context timestamps)
- src/lib/server/smartSession.ts (token expiry windows)
- src/lib/server/fhirServer.ts, pasClient.ts, cdsClient.ts, bulkClient.ts, memberMatch.ts, identityResolution.ts (audit ts and correlation stamps)
- src/lib/server/correlation.ts (correlation id entropy via clock.now and clock.rng)
- src/lib/pa/pasService.ts (PA numbers, timestamps, rng-based PA number suffix)
- src/lib/pa/cdexDocumentReference.ts (document date)
- src/lib/careTeam/assignments.ts and careTeam/cohorts.ts (audit / cohort ids and timestamps)
- src/lib/actionRegistry.ts (audit id entropy and timestamp)
- src/lib/fhir/store.ts (local resource ids, meta.lastUpdated)
- src/lib/fhir/hooks.ts (fetchedAt stamps)
- src/lib/fhir/cdsHooks.ts (hook request timestamp)
- src/lib/fhir/types.ts (period helper current time)
- src/lib/consent/providerAccessOptOut.ts (consent decision timestamp)
- src/lib/runtimeConfig.ts (lastSaved stamp)

Excluded by scope (data / demo stubs, unchanged): src/lib/smartFhirMockData.ts, src/lib/mockData.data2.ts (data portions), src/lib/server/devStubs.pas.ts. UI components displaying current time were left alone per the sweep rules.

## Sweep 3: Logging

New module: src/lib/server/log.ts (42 lines): debug/info/warn/error taking an event name plus a PHI-safe fields object, emitting one structured JSON line per call via console.debug/info/warn/error; header comment marks it as the future OTel seam.

console.log count in src: 22 found, 0 remaining.

Server/lib replacements (structured logger):

- src/lib/services/carePlanGenerator.ts: 1 call replaced. PHI redaction: the old line logged `patient.name`; the new event carePlan.referrals.autoCreated logs `patientId` and a count instead.
- src/lib/services/referralService.fhir.ts: 7 calls replaced with referral.* events carrying resource ids only.
- src/lib/mockData.data2.ts: 7 calls consolidated into 2 structured events (demo.gapClosed with referralId, measure id, and share amounts; demo.reset.complete with counts). No names or DOBs were being logged. Frozen file: went from 450 to 446 lines, ratchet respected.

Client-component deletions (trivial debug noise, 7 calls):

- src/app/md-smart-launch/components/SmartLaunchHandler.tsx: 2 debug logs deleted, including one that printed the patient display name; also removed the now-dead patientName derivation block and the now-unused appConfig import.
- src/app/specialist-inbox/page.tsx: 2 deleted.
- src/app/care-manager/components/CaseloadDashboard.tsx: 1 deleted.
- src/app/social-needs-screening/page.tsx: 1 deleted.

## Sweep 4: Silent-failure audit

All 25 catch statements and 23 promise .catch handlers in src/lib were reviewed. Nearly all already rethrow, return a typed failure ({ ok:false, status, ... }, null-with-contract, or defaults), or log via console.warn/error. One genuine silent swallow was found and fixed:

- src/lib/services/patientService.ts updateCareTeamMember: `catch { /* silently ignore */ }` now emits log.debug('patientService.careTeam.updateSkipped', { careTeamId, role }) so the expected skip is visible. No redesign elsewhere.

## Every file changed (37 total)

New: src/lib/clock.ts (determinism seam), src/lib/server/log.ts (structured logger).

Edited: src/lib/services/carePlanGenerator.helpers.ts (persona id fix + clock), src/app/md-smart-launch/components/OrderEntryModule.tsx (persona display fix), the 31 determinism files listed in Sweep 2, src/lib/services/carePlanGenerator.ts (logger), src/lib/services/referralService.fhir.ts (logger + clock), src/lib/mockData.data2.ts (logger), src/lib/services/patientService.ts (logger + clock + catch fix), src/app/md-smart-launch/components/SmartLaunchHandler.tsx, src/app/specialist-inbox/page.tsx, src/app/care-manager/components/CaseloadDashboard.tsx, src/app/social-needs-screening/page.tsx (console.log deletions).

## Follow-up items

1. Centralize the demo member default: MARIA_SD_001 is hardcoded as the default active patient in about 10 logic files (appContext.tsx, patientContext.tsx, smartSession.ts, devStubs.*, dtrService.ts, careTeam/*, runtimeConfig.ts, cms0057fEndpoints.ts DEFAULT_PATIENT_ID). A single DEMO_MEMBER_ID constant module would make future persona swaps one-line.
2. src/lib/services/holisticContextEngine.ts is a service-shaped file that returns a hardcoded Maria context; migrate its payload into a data module the engine reads by member id.
3. src/app/md-smart-launch.backup/components/OrderEntryModule.tsx still contains the hardcoded 'Margaret Okonkwo' display (backup dir, size-gate exempt); delete the backup tree or apply the same fix.
4. Determinism in excluded demo-stub files (devStubs.pas.ts, smartFhirMockData.ts, mockData.data2.ts data portions) still uses wall-clock/rng; acceptable for demo data, could adopt the clock seam in a later pass.
5. Raw console.warn/console.error remain in several lib catch paths (fhirClient.ts, carePlanGenerator.ts, referralService.fhir.ts retry, server/audit.ts fallback); they satisfy the audit rule but could migrate to log.warn/log.error for uniform structure.
6. tests/api tests (added concurrently by another cycle) skip 9 cases; owned by that cycle.

## Verification outputs (final state)

- `npx tsc --noEmit`: exit code 0, no diagnostics.
- `npx vitest run`: Test Files 44 passed (44); Tests 321 passed | 9 skipped (330). Baseline was 223 passed; the rise comes from the concurrent cycle's new tests/api suite; the count never fell and nothing fails.
- `bash check-file-sizes.sh`: PASS, no new violations, no GREW findings; ratchet intact (75 frozen legacy files unchanged or smaller). Frozen files touched: fhirResourceMappers.ts held at 444, mockData.data2.ts shrunk 450 to 446.
