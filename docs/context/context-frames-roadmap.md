# Context-Frames & Roles — Roadmap (deferred work)

Companion to `src/lib/context/screenFrames.ts` (the route → {frame, role} registry) and the
Screen Role & Context-Frame Matrix. Captures work deliberately deferred so context — patient
**and** role — is never messed up, especially under the scripted demo.

## 1. Demo owns ROLE context per step (deferred by decision)

Today the DemoNavigator owns **patient + route** deterministically (`setActiveCitizen` every
step) but does **not** own the acting role axes. Those come only from manual left-nav toggles:
`user.role` (care_manager | physician), `physicianPersona` (rick | jon), `entryContext`
(browse | cerner-launch). The 10 demo personas *are* roles (State Executive, Network/Pop-Health
Director, PCP, Care Manager, CHW, BH/Crisis, Specialist, Quality Analyst, Agentic-Maria,
watsonx-Cerner), so in an automated run a "Dr. Chen, PCP, in Cerner" step renders with whatever
was last toggled — a role-context integrity gap of the same class as the patient one already fixed.

Two scopes, in order:

- **Safe scope (no identity change):** sadd optional `physicianPersona` / `entryContext` to
  `DemoStep` (or map by persona id) and set them on step change alongside `setActiveCitizen`.
  Deterministic; can't change screen behavior beyond the intended view (specialist ↔ PCP,
  browse ↔ Cerner). Persona → context map is unambiguous from the persona ids.
- **Full fidelity (bigger):** switch the acting **user** per persona (Sarah Johnson → Dr. Chen →
  an analyst), which changes the top-bar identity/role chip and may alter role-gated screen
  behavior. Treat as its own scoped feature; the app's `UserRole` is only `care_manager | physician`
  today, so this also means widening the role model (executive, analyst, CHW).

Guardrail: role context must persist across a reload like the patient does (patient uses
`sessionStorage 'wpco.activeCitizen'`; role/persona/entry currently reset to defaults on reload —
asymmetric). If role becomes demo-driven, persist it the same way.

## 2. Real scope selectors (replace the frame labels)

`AppTopBarActions` shows a static scope **label** ("Team caseload" / "Population view") on
non-member frames. Next: working selectors —

- **Caseload frames:** sa whose-book selector — `My caseload` / `My team (pod)` / `Unassigned` /
  `All (supervisor)`. Panel ≠ Caseload ≠ Team; opening a queue row sets the active member and
  hands off to a Member screen, then clears on return.
- **Population/Executive frames:** a cohort / contract / region selector bound to
  `selectedContractId` / cohort state already in appContext.

## 3. De-hardcode remaining population content

- **CBO Directory** — done: filters default to the full network; pins colour-matched to card
  badges; zip filter wired; map fed the filtered set; referral banner follows the active member.
- **Episodic Management Analytics** — still renders member-specific (Maria) content under the
  corrected Population chrome; convert to cohort/episode aggregates.
- Sweep the other Population-frame screens for any remaining single-member defaults.

## 4. Launch precedence — extend

- **Done:** MD Smart Launch sets the global active member from `?patientId=` (URL wins).
- **To do:** sapply the same to `care-plan-monitor/[patientId]` and `(reviewer)/evidence/[id]`.

## 5. Flagged nav / dedupe (from the matrix)

- **Done:** re-parented CBO Directory + Episodic Management Analytics out of the member
  "Whole Person Care" nav group into "RHTP Program" (Population).
- **To do:** sde-persona-fy Family Thread — Sofia and Caregiver Intelligence — Elena (make them
  states of Household / member context, not named-persona nav entries); dedupe the duplicate
  WPC View, Signal Disposition, and CDP Assembly routes.

## 6. Unclassified-route guard

`resolveScreenContext` fails safe (switcher hidden) and warns in dev for any route missing from the
registry. Keep the registry in sync as routes are added; consider a CI check that every
`app/**/page.tsx` route has a registry entry.


## P1 executed (this session)

- Fail-open sweep: 13 screen sites converted to fail-closed. Pattern A (9 sites) now
  `getPatientById(activeCitizenId) ?? placeholderMember(activeCitizenId)` (new neutral helper
  in patientRegistry.ts, mirrors placeholderPersona — no Maria PII on unknown members).
  Pattern B (whole-person-intelligence, cdp-assembly, signal-disposition-engine) identity
  fallbacks neutralized. Server route (financial-clearance) fails closed on no session member.
- PatientSwitcherDropdown `?? patients[0]` -> `?? null` (render already guarded; shows 'Select Patient').
- MariaStatusStrip demoted to a READ-ONLY band (removed its member `<select>`; shell switcher owns switching).
- Launch precedence added to care-plan-monitor/[patientId] (URL patientId -> global active member).
- Maria de-hardcoding ratchet: 99 -> 80 (baseline re-locked to 80).
- Browser swap test PASS: unknown member -> neutral 'Member' placeholder (no Maria leak);
  valid member (Dorothy) -> correct member; golden (Maria) -> renders, no errors.
  Frame-clear verified: population frame hides the switcher and shows the 'Population view' scope label.

### Deferred from P1 (documented)
- (reviewer)/evidence/[id]: launch precedence NOT applied. The viewer fetches a record by id and
  shows that record (no Maria fail-open, so no safety risk). Syncing the global active member to the
  evidence subject needs record-subject parsing + FHIR-id resolution; deferred to avoid a fragile edit.

## Scheduled: incremental size-ratchet refactor (worst-first)

Prior --no-verify commits let several page components grow far past the 400-line cap AND
skip prettier (long compressed lines). This session reconciled the size baselines to the
current *formatted* sizes so the gate is re-armed (no file may grow further; P2/P4 held to it)
and verified commits work again. The existing bloat is now tracked debt, to be ratcheted DOWN
incrementally — one file per change, each verified (tsc + vitest + browser + demo parity), with
its baseline lowered as it shrinks. The ratchet's 'may only shrink' rule is designed for exactly
this.

Order (worst-first; formatted line counts):
1. **wholePersonGraphData.ts (2212)** — FIRST + cleanest: it's authored graph DATA in a .ts file.
   Move the data to `data/*.json` (exempt) / `src/lib/**/data` modules. ~1400-line, behavior-safe win.
2. controller-agentic-super-orchestration-centerpiece (4036) — extract panels/sections to components.
3. whole-person-care-summary (2901), episodic-management-analytics (2292), care-manager (2200),
   social-needs-screening (2003), care-team-inbox (1941), consumer-360 (1928), DemoNavigator (1823).
4. Remaining 1000-1700-line pages (chw-workflow, cbo-directory, referral-journey-tracker,
   care-gap-closure-verification, submitted-referrals, agent-impact-dashboard, caregiver-elena,
   signal-disposition-engine, whole-person-care, episode-detail, program-eligibility).
5. Sub-1000 stragglers (specialist-inbox, whole-person-intelligence, cdp-assembly, referral-tracking,
   CaseloadDashboard, payer-to-payer, SignalGraph, patient-episode-summary, care-plan-monitor,
   access, AppLayout).

Method per file: identify cohesive blocks (data → JSON/module; sub-views → components; helpers →
lib), extract, re-verify, lower the baseline. Never a big-bang; each is independently revertible.