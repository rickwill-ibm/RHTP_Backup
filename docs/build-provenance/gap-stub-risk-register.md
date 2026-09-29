# Gap & Stub Risk Register (E8)

`docs/framework/enforcement-kit.md` E8 requires **one cumulative register**: *"a review finds gaps
that are acknowledged and then forgotten … Every red-team finding lands there with a disposition …
It is both an input and an exit artifact."*

**This file did not exist until Wave 0's adversarial-AFTER round, which is itself an E8 finding.**
Findings were landing in `coalition-log.md` — a chronological narrative, correct for provenance and
wrong for this job: a gap recorded at line 3400 of a 3700-line log is acknowledged and forgotten
exactly as E8 describes. Read this file at wave start; update it at wave end.

**Disposition vocabulary** (E8): `Unacceptable` = fixed in the iteration that found it ·
`Critical`/`High` = owning iteration or backlog · `Med` = revisit · `Closed` = fixed AND citing a
test that exists and passes (E12: *"a 'closed' that nothing proves"* is the failure this guards).

---

## OPEN — Critical

### G-001 · CLOSED IN W8 — the escalation terminal now abandons with a record
> Moved to **CLOSED (W8)** at the foot of this file. Kept as a stub because two source files cite
> "register G-001" by name and a dangling citation is its own defect.

### G-002 · CLOSED IN W8 — `agent.task.executed` removed; `agent.task.settled` replaces it
> Moved to **CLOSED (W8)**. The tripwire that carried this entry did NOT go red at closure, and why
> it did not is recorded there, because it is the more transferable lesson than the fix.

### G-003 · `denial.issued` permits a BH adverse determination under HIPAA TPO with no consent lookup
`src/lib/sde/data/signal-taxonomy.json` · `src/lib/agents/disclosure/decide.ts`

`denial.issued` floors at `['demographic']` and `pa-documentation-agent`'s recipient is `internal`,
so `decideDisclosure` returns the baseline TPO permit **before `selectBasis` is called**. For a NY
MCO with a HARP population a prior-auth denial is overwhelmingly likely to name an OMH- or
OASAS-licensed service, and the denial reason names it — NY MHL §33.13 clinical-record material, and
Part 2 material where the service is OASAS-certified.

`src/lib/agents/dispatch/disclosureGate.ts` describes this exact defect in its own header (*"A
positive EPDS perinatal depression screen was decided under HIPAA treatment/payment/operations with
no consent lookup at all"*) and presents it as closed. It is closed for `bh.screening.indicated` and
open for `denial.issued` — the higher-volume path, and the one carrying an adverse determination.

`denial.issued` cannot carry a single floor, because the class depends on the denied service.

### G-004 · The heightened-regime disclosure plane is reached by one signal through one flag
`src/lib/sde/data/signal-taxonomy.json`

Derived from the taxonomy's 11 entries plus a live trace of `runRealDemo()`:
- **ten of eleven** kinds floor at `demographic` or `social-need`;
- **exactly one** floors at `mental-health` — `bh.screening.indicated` — and the SDE **suppresses**
  it (`reasonCode: 'consent-absent'`) before dispatch exists, so the disclosure plane never sees it;
- **nothing** floors at `hiv` or `substance-use-disorder`. SUD arrives only via the instance-level
  `part2Restricted` flag (`sig-10`); the NY PHL Art 27-F branch has **no data path at all** and is
  reachable only from tests.

`dispatcher.ts` presents three regimes (42 CFR Part 2 / NY MHL §33.13 / NY PHL Art 27-F) as the
heightened set. R3: a declared regime with no data path is a governance claim the demo cannot make.

---

## OPEN — High

### G-005 · `AUTONOMY_ORDER` and `PHI_ORDER` are hand-restated against their unions — CLOSED (W7.5b)
`src/lib/agents/authority/types.ts` · `src/lib/agents/manifest/types.ts` · `tools/adl/compile.mjs`

**Was:** `readonly string[]` literals against `AutonomyTier` and `PhiPosture`. Adding a tier to the
union forced nothing. Wave 0 built exactly the tool for this (`Record<Union, true>` + `Object.keys`)
and applied it to task kinds, PA states and PA event types — the three that are *not* authority
ceilings — while the two that bound **what an agent is permitted to be** stayed hand-written. Their
`compile.mjs` mirror copies were also unpinned by the parity test.

**Closed by DERIVATION, after a first attempt that only DETECTED.** The first cut added an
exhaustiveness witness in a test. Adversarial review rejected it on two counts, both upheld on
inspection of the live tree:

1. It justified itself with a **false security claim** — that a forgotten array entry left `rank()`
   returning `-1`, silently ranking an un-reviewed tier as the weakest in the system.
   `assertAuthority.ts:21-25` reads `if (i < 0) throw raise(...)`. It **throws**; `presetRegistry`
   throws; `lockedMaxTier` falls back to `AUTONOMY_ORDER[0]`. The real consequence was always a loud
   refusal at manifest load. A false INVARIANT comment in the security-critical authority module is
   itself a defect in this programme's terms, so it is recorded rather than quietly deleted.
2. The house pattern was **available and not reused** (CLAUDE.md pre-flight #2). The blocker cited
   above — that authority may not import the unions from manifest without inverting the layering —
   was real but solved the wrong way. The unions now live in `authority/`, declared as objects, with
   both the union (`keyof typeof`) and the ordered array (`Object.keys`) derived from the same
   declaration; `manifest/types.ts` re-exports them so no import site changed. A member cannot be
   added to one and forgotten in the other, because there is no "other".

**Residue, deliberate:** `Object.keys` order carries the strength ladder, so ORDER is still a
property no type can state. `tests/agents/authorityVocabulary.test.ts` pins both arrays with
`toEqual`, and `tests/agents/adl/mirrorParity.test.ts` now pins `compile.mjs`'s `AUTONOMY` and `PHI`
against them **in order** — the mirror ranks a definition against its lock by `indexOf`, so a
divergent order is a divergent answer to "is this agent within its ceiling", not merely a divergent
list. `tests/agents/authorityGateRuntime.test.ts` pins the load-time refusal of an unknown tier and
an unknown posture through a production loader, which is the boundary that was asserted in comments
and covered by nothing.

### G-006 · `bh-screening-triage-agent` is a declaration with no implementation, served under an `attest` action
`src/lib/agents/adl/data/bh-screening-triage-agent.agent.json`

`owningModule: "src/lib/agents/behavioralHealth"` — **the directory does not exist.** `routes: []`.
No `WorkflowDefinition` declares its `agentId`, and `AgentWorkflows` is mapped over `AgentTaskKind`,
so it structurally cannot have one. Its two tests assert the manifest and the lock against
themselves. E14 passes because it compares declared *resolvers* to imports, never `owningModule` to
the filesystem.

It is genuinely unreachable (three independent barriers — no route; no workflow; every app entry into
escalation hardcodes the revenue-cycle agent), so it cannot act. **What it misrepresents is not
nothing:** `/api/ops/agents/authority` returns it to an ops or auditor principal under audit action
`agents.authority.attest`, asserting a BH triage purpose with no escalation path carrying any BH
content, an `owningModule` that is not a directory, three tools nothing can invoke, an
`autonomyTier: HITL` claim about human gating on a workflow that does not exist, and a declared
intent to touch NY MHL §33.13 material.

**Disposition decided: WITHDRAW the declaration** (user ruling, "make the refusal honest first, build
later"). W1 removes it from `adl/data/`, the lock and the manifest, and lands the `owning-module`
resolution rule — whose red output on today's tree is recorded in `coalition-log.md`:
`owningModule "src/lib/agents/behavioralHealth" is not a directory that exists`. The clinical
reasoning in `bhAuthority.test.ts` is the most valuable artefact of that agent and survives as a
design note; it does not need a manifest entry.

### G-007 · No behavioural-health escalation policy, and escalation-as-data cannot express one
`src/lib/agentRuntime/data/escalation-policies.json`

A `bh-acute` set was authored in Wave 0 to make `check-ref-resolution.mjs` green, and **withdrawn**
on adversarial review. What was wrong with it, recorded because W1 must not rebuild it:
- its **urgent** tier was byte-identical to the general-purpose `default` — the policy governing
  `revenue-cycle-agent`, an underpayment-appeal drafter. The name was the only clinical content;
- `hierarchy[0]` was `assigned-reviewer`, the person the item had been waiting on since T+0, so the
  first hop escalated to the existing owner and **nothing above the assignee saw an acute item until
  T+8h**, no clinical supervisor until T+12h;
- derived park times, which the per-hop figure hid: urgent **T+16h**, high T+32h, routine **T+72h** —
  the last being the same park as the revenue-cycle default's `high` tier;
- its terminal was a management supervisor. Escalating up a management chain is the response to a
  work-queue SLA breach; the response to an unanswered acute behavioural-health item is **lateral**,
  to crisis services;
- `hierarchy: string[]` asserts no licensure. Nothing in the tree references 988, mobile crisis,
  CORE/crisis intervention, or psychiatric on-call.

`bh-screening-triage-agent` is provisionally on `default`, marked by a tripwire assertion in
`bhAuthority.test.ts` that fails the moment a BH policy is authored. **A clinically-worded policy set
that no production path calls is a load-bearing stub in production shape, and a gate made green by
authoring unreachable clinical content certified the wrong thing.** Blocked on G-001 (`onExhaust`).

### G-008 · 42 CFR Part 2 model is pre-February-2026 — requires primary-source verification
`src/lib/agents/disclosure/decide.ts` · `src/lib/agents/disclosure/types.ts`

Reported by the D4 seat, **not accepted as established here** and carried as a verification task
against primary sources: the 2024 final rule implementing CARES Act §3221 had a compliance date of
16 Feb 2026, after which a recipient covered entity **may** redisclose Part 2 records received under
a TPO consent per HIPAA, while the prohibition surviving universally is use against the patient in
proceedings. `decide.ts` asserts `part2-redisclosure-prohibited` unconditionally on the data class,
and `OBLIGATIONS` has no member for the proceedings prohibition — the two the wrong way round.

Separately and structurally: `ConsentBasis.recipientOrgIds` is a flat `readonly string[]`, so it
**cannot represent** a post-2024 general-designation TPO consent, and every compliant one denies
`recipient-not-named`.

### G-009 · Gate scripts have no tests; their containments are proven only by recorded executions
`docs/build-provenance/check-mutation.mjs` · `docs/build-provenance/check-ref-resolution.mjs`

Both are blocking CI steps. Every containment is proven by executions transcribed into
`coalition-log.md`, which establishes they held **once, on one tree, against one attack, by one
author**. `check-testlink.mjs` cannot require a test for either: it walks `src` only, and filters to
`.ts`/`.tsx`, so `.mjs` under `docs/build-provenance/` is excluded twice over — by accident of the
filter, not by a reviewed decision, and nothing records the exemption.

This is not theoretical. `check-mutation.mjs` has already corrupted `disclosureGate.ts` in this
programme, inverting the 42 CFR Part 2 fail-closed check, and it was found **by a failing test, not
by a gate**. The containments now guarding it are four interacting mechanisms in ~110 lines with no
regression test; `isRecoverable` returns `false` when `DECLARED_TARGETS === null`, so one reordered
line reverts it to an arbitrary-path write primitive.

Requires: `tests/tooling/{mutationSentinel,refResolution}.test.ts` driving both scripts via
`execFileSync` against `mkdtempSync` fixture trees, asserting **exit code and stderr** per
containment; then extend `check-testlink.mjs` to `.mjs` candidates with the baseline absorbing the
backlog.

### G-010 · No disclosure-accounting projection
`src/lib/agents/disclosure/**` · `src/lib/agents/demo/index.ts`

`DisclosureLedger` records decisions and is **returned, not stored** — the right PHI posture and the
wrong retention posture. HIPAA 45 CFR 164.528, NY MHL §33.13 and NY PHL Art 27-F each impose
*accounting* obligations with different scopes, retention periods and member-request response times.
There is no accounting projection, no retention policy and no member-facing request path. A state
Medicaid agency's first external audit question about an agentic care-coordination platform is
"produce the accounting of disclosures for this member."

---

## OPEN — Med

| id | gap | where |
|---|---|---|
| G-011 | `requiresDisclosureGate`'s docstring is false — it never reads `recipient.kind`, so a `social-need` signal bound for an `outside-covered-entity` CBO returns "may be dispatched without the gate". Fail-closed by crash in practice (the gate is a required input), but exported from the barrel with a false contract. | `dispatch/disclosureGate.ts` |
| G-012 | `TPO_REACHABLE_KINDS` wrong in both directions: no `health-care-provider` kind, so 45 CFR 164.506(c)(2)-(3) disclosures to a non-covered-entity provider (an OMH Part 599 clinic, an OASAS Part 822 program) deny; and 164.506(c)(4)'s relationship conditions are unchecked for `operations` to a `covered-entity`. | `disclosure/decide.ts` |
| G-013 | `42 CFR 2.20` cited for a general "strictest regime controls" architectural principle. §2.20 is *Relationship to State laws* and supports that for the Part 2 ↔ state-law pair only; it says nothing about HIPAA ↔ MHL. Honest citation for the HIPAA side is 45 CFR 160.203(b). | `dispatch/disclosureGate.ts` (two sites) |
| G-014 | `RecipientKind` has no member for *facility*, *health home*, *BHO* or *MCO* — the distinctions NY MHL §33.13(d) actually turns on. A `PERMITTED_BY_STATUTE` branch keyed on `recipient.kind` **cannot be written correctly** against this vocabulary. | `disclosure/types.ts` |
| G-015 | `deadline-unknown` maps to the `high` tier — a 32-hour park under an acute policy, for an item whose defining property is an undeterminable deadline. Should escalate to the tightest tier. | `agentRuntime/escalation.ts` |
| G-016 | NY's heightened-class set is larger than the three modelled: Civil Rights Law §79-l (genetic), MHL §22.05 / 14 NYCRR Part 815 (OASAS, binding independently of federal Part 2), reproductive-health protections. | `disclosure/types.ts` |
| G-017 | `evidence.append` fires BEFORE the transition in `paAgent.ts`, so a `not-advanced` result leaves an orphaned evidence write the record does not name, and no idempotency key deduplicates a retry (conventions §7.2). | `agents/pa/paAgent.ts` |
| G-018 | `recordUnrouted`'s dedupe key is `${reason}:${signalId}` with no `memberId`, so two members sharing a signalId collapse to one refusal. Unreachable from the seeded batch. | `dispatch/dispatcher.ts` |
| G-019 | The idempotency store is a process-wide singleton, documented in a comment: *"the SECOND run in a process reported a deduped outreach as `executed`."* `/api/ops/agents/actions` is a POST executing a real run; two ops users clicking at once share it. | `agents/demo/index.ts` |
| G-020 | Three further data cross-references with no `check-ref-resolution` rule: `crosswalks.json` `assetId` and `risk-families.json` `activeAssetId` → `terminology-assets.json`; `agent-manifests.json` `toolAllowlist[]` → `tool-bindings.mock.json` `handlerId`. | `docs/build-provenance/check-ref-resolution.mjs` |
| G-021 | `AGENT_DEMO_OUTCOMES` is a cross-agent vocabulary carrying `not-advanced`, which names a PA state-machine event: a `not-advanced` referral row is unrepresentable in the domain and representable in the type. Per-kind outcome vocabularies are the better end state. Recorded as a live disagreement — see the note on the enum. | `agents/demo/index.ts` |
| G-022 | **REWRITTEN — the original was false.** It claimed nothing enforces authored-vs-real parity for the demo seam. `demoSeam.test.ts` "production mode runs the real agents; the emergent actions match the authored parity" does `expect(actions).toEqual(authoredAgentActions())` — full deep equality between the production run and the authored artifact, plus an outcome pin, and the register's own stated failure scenario breaks both lines. Mischaracterising an existing test to manufacture an open gap is the mirror image of the offence this register audits. **The residual gap, stated against the code that exists:** nothing pins `authored-agent-actions.json`'s SHAPE independent of a live run, so if the real run and the authored file drift together (a re-author of both) the parity assertion still passes. | `agents/demo/**` |
| G-023 | `no-console` and `no-explicit-any` are `warn`, not `error`, and `console.error/warn/info` are allowlisted globally. Disclosed debt (conventions §18). Separately, the gate scripts' `console` use is **unexempted rather than exempted** — nothing in the conventions permits it; it passes because `next lint` never reaches `.mjs` under `docs/`. | `.eslintrc.json` · conventions §8.1 |
| G-024 | Nothing asserts the two new gates are WIRED. Deleting `run "data ref resolution" g_refresolution` from `ci-gates.sh` is invisible — E14's own doctrine is not applied to the enforcement kit. | `scripts/ci-gates.sh` |
| G-025 | A receipts table in `coalition-log.md` went stale across two amendments that grew a source file, and read as false until re-run. Receipts should carry the amendment they were measured at. | `docs/framework/coalition-protocol.md` |

### G-026 · `AGENT_TASK_KINDS` discards the type it was derived from
`src/lib/agents/dispatch/types.ts` — `readonly string[]`, not `readonly AgentTaskKind[]`. Costs one
cast and lets a consumer iterate kinds type-safely, which a derived mapped `AgentWorkflows` needs.

### G-027 · `adl` reaches past the `dispatch` barrel
`src/lib/agents/adl/{schema,types}.ts` import from `@/lib/agents/dispatch/types` directly;
`dispatch/index.ts` exports `type AgentTaskKind` but **not** `AGENT_TASK_KINDS` or `isAgentTaskKind`.
Every other cross-module consumer in the repo goes through the barrel, so a future split of
`dispatch/types.ts` keeps the barrel green and breaks `adl`.

### G-028 · NY MHL §33.21 minor self-consent is unrepresentable
`ConsentBasis` has `subjectId` and nothing about WHO may execute the instrument. NY permits a minor to
consent to their own OMH outpatient mental-health treatment in defined circumstances, and to SUD
treatment, and the resulting record is not disclosable to a parent on request. The seeded signal is a
**perinatal depression screen**, whose subject may be a minor. Raised by the D4 seat and omitted from
the first cut of this register — which is why G-016's list of NY heightened classes is necessary but
not sufficient.

### G-029 · The recovery proof covers the sequential single-process case only
`docs/build-provenance/check-mutation.mjs`. Round 1's "Recovery proven, not asserted" was narrowed to
sequential-single-process, with the excuse "concurrency was not a threat model". **That excuse is
withdrawn:** by the time it was written the file carried an explicit concurrency containment (C4, the
per-PID sentinel and `pidAlive()`), listed in the containment table itself. Concurrency plainly WAS in
the threat model. The honest statement is narrower and worse — the concurrent case is handled and is
proven by exactly one recorded execution, which G-009 concedes has no test. Keep the narrowing, drop
the excuse.

### G-032 · Wrong-member record on the render path — CLOSED, with named residue
`src/lib/patientContext.tsx` · `src/app/patient-detail/page.tsx`

The registry holds **5** members. `getInitialState()` ended in a bare `return defaultMariaState`,
and `patient-detail` carried a second, independent ladder (`?? 'Maria Redhawk'`, `?? '0.82'` RAF,
`?? 'MODERATE'`, `?? 'Medicaid RHTP Track 3'`, `?? 1` HCC) plus a third default
(`|| 'MARIA_SD_001'`). So **six ids the app's own navigation emits** rendered one real member's
MRN, DOB, RAF, HCC suspects, care gaps and BH risk under another member's name:

| source | id | displayed as |
|---|---|---|
| `specialist-inbox` | `PAT-0113` | "Margaret Okonkwo" |
| `specialist-inbox` | `PAT-0201` | "Patricia Nguyen" |
| `mockReferrals` | `patient-005`, `-006`, `-011`, `-012` | referral rows |

Two clicks into the demo, with every gate green — because the only gate for this class,
`check-maria-hardcoding.sh`, is a **count ratchet at 80** over `src/app/**/*.tsx`, and the root
cause was one directory outside its scan.

**Closed by reusing the seam that already existed** and that this screen had never adopted:
`useActiveCitizen()`'s `status` and `MemberScopeNotice` (shipped, 3 other callers). The guard is at
the ROUTE, before `PatientContextProvider` mounts. A **nullable context was designed first and
rejected** on adversarial review: it pushes optional chaining through ~97 dereferences in 6
consumers, 4 of them frozen in `quality-baseline.json`, and a screen of dashes reads as a real
empty member record — a new fail-open, not a fix. `MemberScopeNotice` gained a `light` theme so the
guard does not look like a rendering bug in the Carbon shell.

Also closed: `SmartLaunchHandler`'s `|| 'Maria Redhawk'` (an EHR-embedded banner), `crisis-pathway`'s
`?? 'Medicaid RHTP Track 3'` (a program enrolment is a funding-eligibility claim),
`care-team-inbox`'s `?? 'Moderate'` riskTier, `?? 'Sarah Johnson'` goal owner and the **fabricated
`Practitioner/practitioner-rick` reference** (the load-bearing FHIR field, where only the display
had been falling back — a Task that looks right and points nowhere). `/api/dtr/evaluate` now 400s on
a missing `patientId` instead of answering with the golden member's evaluation.
`src/components/DorothyStatusBanner.tsx` **deleted**: 0 importers, and it mounted the provider with
no id so it rendered Maria's MRN, episode status and BH risk under the label "Dorothy Simmons".

`patientContext.tsx`'s FHIR path fabricated `fhirId` from any string
(`PLATFORM_TO_FHIR_ID_MAP[id] ?? id.replace(...)`) and handed it to
`gapStore.setActivePatientContext`, so a `closeGap` wrote a gap-closure Observation against a
non-existent `Patient/PAT-0201` — a fabricated clinical record, not a missing one. Now mapped-only.
(`resolveToCanonicalFhirPatientId` was suggested as the fix and **rejected**: it carries the same
`id.replace(...)` fabrication on a miss.)

**Gate:** `scripts/check-member-substitution.sh`, **zero tolerance**, scope `src` not `src/app`,
wired to `check:all` and the fast tier. The count ratchet is locked at its new floor, **80 → 73**.

**TWO withdrawn measurements, and the process rule they produced.** The reduction was first
recorded as **80 → 57** (cloud), then "corrected" to **80 → 73** (repository), and is **80 → 57**.
The first number was right. The correction was wrong, and wrong in the LENIENT direction.

On seeing 57 against 73 the cause was *inferred* — "the cloud copy holds 179 `src/app/*.tsx` against
the repository's 194, so its count is invalid" — and the baseline was moved to 73. Both halves were
false. The 15-file difference is `src/app/md-smart-launch.backup/`, which carries **zero** persona
literals (measured). The actual cause was **93 files that had never been landed**, including the
entire W1/W1.5 de-attribution tranche that this register and the programme plan both recorded as
DONE. After landing all 93, the repository measures 57 and the trees agree.

So a ratchet was loosened by 16 literals on the strength of a plausible, specific, unverified
explanation — worse than leaving it wrong, because it looked reconciled. **RULE, recorded at
`scripts/MARIA-BASELINE-NOTE.md`: a count-based baseline is meaningless while two trees disagree —
reconcile by hash comparison, then count once; and when two measurements disagree, FIND the cause,
never infer it.**

**Proof:** `tests/wpc/memberSubstitution.test.ts`, 18 cases — the registry set pinned as a SET (a
count of five is satisfied by five wrong members), each unresolvable id asserted absent AND asserted
not to resolve to the demo member, and the gate's own scope pinned so the blind spot cannot be
narrowed back in.

**RESIDUE, named rather than closed:** the six nav ids still do not resolve, so those clicks now
land on an honest not-found instead of the wrong member. Fixing the CAUSE — nav payloads referencing
members that exist — is a data change to `specialist-inbox` and `mockReferrals` and is **G-034**.
Two demo paths are affected; re-walk before the next demo.

### G-033 · `?? 'MARIA_SD_001'` in the dev API stubs · Med
`src/lib/server/devStubs.cds.ts`, `devStubs.pas.ts`. `profileFor()` already fails closed to
`PLACEHOLDER_PROFILE`, and these callers **defeat it** by substituting the golden id first, so a
request naming no patient gets a real member's CDS/PAS data. Their own docstring documents the
pattern as intended for demo-default callers, so it is a route-contract decision and was **not**
changed unilaterally inside a screen fix. Excluded from the zero gate by name, with the reason in
the script.

### G-034 · Six navigation ids reference members that do not exist · High
`src/app/specialist-inbox/page.tsx` (`PAT-0113`, `PAT-0201`), `src/lib/referrals/mockReferrals.ts`
(`patient-005/006/011/012`). Post-G-032 these fail closed rather than showing the wrong member, but
the rows still name people the registry has never heard of. Either add them to the registry with
their own records, or point the rows at registry members — and note `specialist-inbox` already
prefers `reg?.name`, so registry ids would make the displayed name self-consistent.

### G-035 · The adverse-determination fact-taint gate was declared and unwired — CLOSED (W7.5a)
`src/lib/agents/provenance/factProvenance.ts` · `src/app/api/pa/decision/route.ts`

`assertAdverseEligible` is the executable form of the platform's central regulatory claim: a model may
not be the sole basis of an adverse determination (**45 CFR 92.210** mitigation duty, **NY PHL
§4903** clinical peer reviewer, **42 CFR 438.210(b)(3)** appropriate expertise in the enrollee's medical, behavioral health or LTSS needs). Measured: it had
**exactly one non-test caller in `src/`** — `api/ops/agents/reasoning/probeChain.ts:72`, whose own
header reads *"an OPS self-test surface, not a member-facing path"*. The claim was true of a
self-test and false of the product, and the 32-agent design asserted partner facts "cannot ground an
adverse determination, **by construction**".

**Why nothing caught it.** `tsc` saw a called function. E13 saw a tested module. E14's wiring gate
compares declared resolvers to imports, and a self-test route IS a real entry point — so the module
was legitimately "wired". Grep found the symbol. Only reading the call graph found it.

**The distinction that was missed on first reading:** `isAdverseProvenanceComplete` was already wired
on this route, and it is a **different** control — it validates the decision RECORD carries a
member-facing reason and an appeal reference (42 CFR 438.404 notice content). Nothing validated the
**facts that produced the decision**. A route could have perfect notice content resting on a
model-invented fact. The two are independent, which is why both must exist.

**Closed:** `/api/pa/decision` now runs the gate on the `rejected` branch only (a favorable
determination may lawfully be automated; gating approvals would block the lawful case and do nothing
for the unlawful one), **fails closed when an adverse decision declares no determinative facts at
all**, and audits the two refusals under separate action codes so they are countable apart.

**Gate:** `docs/build-provenance/check-adverse-gate.mjs` — E14-class, **zero tolerance**, in
`check:all` and the fast tier. Two things it got wrong first, both recorded because they are the
recurring classes:
- a bare `/'rejected'/` marker **over-matched 5 files**, three of which were not member
  determinations at all (`value-set-governance` uses `'rejected'` in a `GovernanceState` enum; the
  `recovery/**` routes approve or reject the MCO's own underpayment-recovery submission, with no
  member benefit at stake). A gate that cries wolf on a status enum gets its exempt list padded
  until it means nothing. Markers now key on the repo's own `isAdverseCoverageAction` predicate.
- the check was `src.includes('assertAdverseEligible')` and was **satisfied by the route's own
  explanatory comment** — deleting the call and the import left the gate green. **Second time in this
  programme a comment has satisfied a grep gate.** It now masks comments and literals and looks for a
  CALL (`name(`), and that was verified by deleting the call and watching the gate go red.

**Proof:** `tests/api/paDecisionAdverseGate.test.ts`, 11 cases — model origin refused and named,
propagated taint refused, absent-ancestor refused ("unprovable is not clean"), a wholly clean set
permitted (so the gate is not refusing everything), the call asserted against comment-masked source,
the adverse-branch-only placement asserted, fail-closed-on-absence asserted, and the notice-content
control asserted independently.

**RESIDUE, named:** the determinative facts arrive in the request body, so a caller could mis-declare
an origin — as is already true of `firedRule` and `ruleVersion`. The gate stops the accidental case
(a model-shaped fact flowing through an honest client), not the dishonest one. The structural fix is
a server-side determinative-fact store the route reads instead of trusts: **G-036**.

### G-036 · Determinative facts are client-declared, not server-held · High
`src/app/api/pa/decision/route.ts`. The adverse gate (G-035) reads fact provenance from the request
body. Needs a server-side determinative-fact store, written by the workflow that produced the facts
and read by the decision route, so origin is asserted by the producer rather than the decider.

---

### G-039 · An over-ceiling agent act is DISCLOSED, not PREVENTED — 218 of 251 warm-start rows · High
`src/lib/goldenThread/flowSim.ts` (`seal`, and every autonomous act site) ·
`src/lib/goldenThread/ceilingRecord.ts`

**How this was found, because the route matters.** W7.5b set out to unify four rung→label maps and
extracted the earned-ceiling logic into a module of its own. Adversarial review then attacked the
extracted design rather than the extraction, and found that the logic being tidied was wrong: the
clamp fired **after** the act. `enterSubStep` seals a payer UM determination sub-step and returns;
the sub-step runs either way. Lowering the number on the receipt lowers no authority.

**What the clamp produced.** An act stated at A2 with nothing earned was re-sealed `rung: 'A0'`,
`version: 'assist·D2'`, and — because `deriveOversight` reads the rung — `oversight: 'watch'`.
`human` stayed `false`. So the hash-sealed row for an autonomous determination step read
*advised, watched, sub-ceiling*, and three of those statements were false. `proposeOutbound` states
the governing invariant outright — *"the ledger can never show an 'A0/A1 … EXECUTED' agent act. This
binds the ENGINE, not just the UI"* — and the clamp manufactured exactly that row, at volume.

**Worse, it answered the auditor's question with silence.** The reason a state Medicaid agency wants
an earned-authority regime is to be able to ask *what did your agents do above what they had
earned?* A design that rewrites every such act down to an advisory guarantees that query returns
nothing, forever, with the rewrite sealed into the chain so it reads as fact.

**Done in W7.5b:** the rewrite is gone. The ledger records the authority EXERCISED, plus
`earnedCeiling` and `overCeiling` as hashed fields. `assessCeiling` returns no `rung` and no
`version`, so no caller can use it to rewrite a record — the structural guarantee, pinned by a test
on its return-key set.

**The measured gap this exposed:** at cold start the modelled fleet runs its whole pipeline above
what it has earned — **218 of 251** warm-start rows, across ten agent actors (`emr-launch`, `crd`,
`gold-card`, `dtr`, `payer-ops`, `status`, `claim`, `remittance`, `reconciliation`, `surveillance`).
That number was always the truth; the clamp was relabelling ~87% of the book. `earnedAuthority.test.ts`
now pins it, and pins that **every** such row carries the disclosure.

**Owed (W8):** admission control — an over-ceiling act does not execute, it seals as a human-released
PROPOSAL, on the `proposeOutbound` pattern the engine already implements at two sites. Either that,
or the domain model is wrong and these pipeline sub-steps are not fleet-autonomy-governed acts and
should not seal as `agent:` at A2. That is a design fork, not a bug fix, and it is named here rather
than resolved inside a blocker wave.

### G-040 · `clamped`/`overCeiling` is recorded and rendered nowhere · Med
`src/components/goldenThread/OpsForensicLedger.tsx` and the forensic drill-down

The disclosure is in the row and in the hash; no component reads it. For the reader who matters — a
state auditor, an OIG reviewer, the medical director — an over-ceiling act is still visually
identical to a permitted one. Add an over-ceiling column and the earned ceiling beside it. Folded
into the W10 surface sweep.

### G-041 · The recon sub-ledger hashes 13 of ~24 asserted fields, under an "intact" badge · High
`src/lib/goldenThread/flowSim.ts` (`reconHashOf`, `reconIntact`, `verifyReconEntry`) ·
`src/components/goldenThread/flow/ReconLedgerPanel.tsx`

G-038's defect verbatim, in the *other* chain, left untouched while the main ledger was fixed.
`reconHashOf` covers `seq, tick, claimId, reconClass, group, carc, rarc, billedUsd, contractedUsd,
paidUsd, deltaUsd, side, handoffRole`. The record also carries and DISPLAYS `claimRef`, `provider`,
`payer`, **`memberLiability`**, `variancePct`, `actionType`, `appealable`, `severity`,
**`humanGated`**, **`clockTicks`**, `recoveredUsd`, `mainSealSeq`, `routed` — none hashed.

Concrete: flip `memberLiability` to `'member-responsibility'` and the panel renders "member owes
(PR)" — a balance-billing assertion against a Medicaid enrollee — inches from an integrity badge that
still reads intact. Same for `humanGated` (the record's own claim that a human approved the handoff),
`clockTicks` (the appeal / report-and-return deadline), and `mainSealSeq` (the provenance link the
forensic drill-down joins on, free to repoint at a different seal).

**Fix:** `reconHashOf` takes the stored record and derives its key list from a
`Record<keyof Omit<ReconRecord,'prevHash'|'hash'>, true>` witness, the same pattern
`ledgerSeal.HASHED_LEDGER_FIELDS` now uses. Fields mutated after sealing (`recoveredUsd`, `routed`)
are not exempt — they are a second seal: append a record, never edit one.

### G-042 · A revocation at the A1 floor is silent, and the look-back it opens has no consumer · High
`src/lib/goldenThread/flowSim.ts` (`revokeAuthority`, `earnedLookback`)

Two halves of the same stub.

**(a)** `if (s.earnedCeiling <= 1) return s;` precedes every seal. A fleet at A1 that trips the §1557
fairness screen or a tamper detection produces **no earned event, no ledger row, no ticket, no
trace** — while `SimState.earnedCeiling`'s own comment says "a breach REVOKES it automatically". A
breach that leaves no audit artifact is the one an investigation cannot reconstruct. Seal the
attempted revocation at the floor even when there is no rung to drop.

**(b)** `earnedLookback` is set to `Math.max(1, round(counters.touchless * 0.1))` — a flat 10% of all
touchless completions, **not** the acts actually taken above the revoked ceiling — rendered as
"N acts queued for re-review", and zeroed by the next grant, whose reason text then claims the
look-back was "dispositioned". No act is ever identified, re-read or re-sealed. The entire
remediation story for a revocation is a number a promotion erases. `overCeiling` (G-039) now makes
the real population computable for the first time: the look-back should BE those rows.

### G-043 · The reviewer of record's NPI was check-digit invalid, in 26 files, under a green test — CLOSED (W7.5c-0)
`src/lib/authz/approvalAuthority.ts` · `src/lib/goldenThread/validate.ts` · 24 others

`DEMO_REVIEWERS['Practitioner/dev'].npi` was `'1730154783'`. Run the repo's own NPPES algorithm
(`identity/provider/npi.ts`): base `80840` + `173015478`, Luhn sum 68, check digit **2**. The NPI was
invalid and `assertValidNpi` would have thrown on it. It appeared in 26 files including both Postman
environments, the e2e spec, `cms0057fEndpoints.ts`, `policy/goldCarding.ts` and `api/evidence/[id]`.

**Why nothing caught it: TWO NPI VALIDATORS THAT DISAGREED.** `goldenThread/validate.ts.validateNpi`
was `/^\d{10}$/`, and `tests/goldenThread/hardening.test.ts:33` asserted `validateNpi('1730154783')`
was `ok` — a green test proving only that the string had ten digits, sitting on top of the weaker of
two implementations of the same rule. A single-source violation under a passing assertion.

**Found by the W7.5c adversarial-BEFORE**, which noted the consequence: anchoring reviewer
qualification on `isValidNpi` would have thrown on the demo's own reviewer, gone red on camera, and
the cheapest fix under time pressure would have been to loosen the new gate to shape-only — turning a
credentialing control into a regex. The fixture defect had to land first, separately.

**Closed:** fixture corrected to `1730154782` across all 26 files; `validateNpi` now delegates to
`isValidNpi` (the `optional` semantics stay, they belong to that input surface); the regex deleted;
`hardening.test.ts` pins `validateNpi('1730154783').ok === false` — same digits, wrong check digit —
so the exact string that hid here is now the assertion that would catch it again.

**Residue:** a check-digit-valid NPI can collide with a real provider's. The seed directory's header
already accepts this convention ("real check-digit-valid NPI … fabricated demo entities"); it is
noted here rather than silently inherited, and a pilot should draw fixtures from a reserved range if
NPPES ever publishes one.

### G-044 · "Qualified physician decider (42 CFR 438.210(b)(3))" — a demo-visible false citation — CLOSED (W7.5c-0)
`src/lib/goldenThread/e2eFlow.ts:512` · `docs/build-provenance/coalition-golden-thread-flow.md:50` ·
`docs/framework/wpco-agent-buildout-plan.md:288,458` · this register, line ~363

**Verified against the primary source** (eCFR, 42 CFR 438.210(b)(3)), quoted: a decision to deny or
to authorize less than requested must *"be made by an individual who has appropriate expertise in
addressing the enrollee's medical, behavioral health, or long-term services and supports needs."*

The regulation does **not** say "physician", and it does not say "clinical expertise" — that phrase
is **438.406(b)(2)(ii)**, which governs APPEALS and adds "as determined by the State". The tree had
drifted the appeal word and a physician requirement into the initial-determination claim.

The irony is the part that matters: the false citation sat inside an RCA about a **behavioral-health**
cohort, arguing that prior BH denials lacked a physician. The regulation names behavioral health
explicitly, and for a BH determination the appropriate decider is often a licensed BH clinician, not
an MD. The overclaim was not merely imprecise — in context it recommended the wrong remedy.

"Matched expertise" was likewise our paraphrase, not the rule's language, and it drifts toward a
specialty-similarity test the regulation does not state. Corrected in all five places.

### G-045 · `engine.signal()` resolves a human-gated proposal on ANY string — CLOSED (W7.5c)
`src/lib/agentRuntime/engine.ts:80-89` · `src/lib/agents/demo/index.ts:185` ·
`src/app/api/ops/agents/actions/route.ts`

`isQualifiedHumanDecision` is **never called on the engine's resolution path**. `signal()` reads
`signal.decidedBy` and hands it straight to `decide()`. `isAutoApprovable` correctly refuses to
auto-approve an adverse action and routes it to `'human-required'` — and then nothing validates the
human signal that replaces it. `''`, `'system'` and even `'autonomy:autonomous'` all resolve it.

**And it is reachable over HTTP.** `agents/demo/index.ts:185` signals with the literal
`decidedBy: 'demo-reviewer'`, from `runRealAgentDemo()`, which `/api/ops/agents/actions` calls
whenever `agentRuntimeMode() === 'production'`. So in production agent-runtime mode an HTTP GET
drives the real engine and resolves every adverse proposal in the batch with a hardcoded string.

This is the same shape as G-035 with the polarity flipped: there, the control existed and only a
self-test called it; here, the control exists at the routes and the ENGINE does not call it. Binding
W7.5c at `/api/pa/decision` alone would have repeated it — the adversarial-BEFORE's central finding,
and the reason that design was returned NO-GO. **The bind point is `engine.signal()`**;
`WorkflowSignal` must carry a resolved reviewer reference rather than a free string, and routes
become defence in depth. Owed in W7.5c.

### G-046 · `'session-user'` is accepted as a qualified human decider — CLOSED (W7.5c)
`src/lib/authz/principal/index.ts:85` · `src/lib/agents/governance/decisionGate.ts:95-101`

`deriveUserId` returns the literal `'session-user'` when no `fhirUser` is present, and
`/api/pa/decision:99` stamps it as `decidedBy`. It is non-empty, not `autonomy:*`, not `system` — so
`isQualifiedHumanDecision` returns **true**. `authz/approvalAuthority.isNonIdentity` blocks exactly
that string; the decision gate does not. Two reviewer-authorization mechanisms already exist in this
tree and they disagree about the placeholder identity, live, today.

Related and equally live: `deriveRole` makes **any** `fhirUser` beginning `Practitioner/` a
`pa-reviewer`. Reviewer class is currently "the string starts with Practitioner/".

Fix belongs with W7.5c and is one reason that wave extends `approvalAuthority.ts` rather than
creating a third mechanism.

### G-047 · A deemed-adverse determination has no reviewer, and the proposal parks forever · High
`src/lib/agentRuntime/engine.ts` (`scheduleEscalation`) · `src/lib/goldenThread/e2eFlow.ts`

42 CFR 438.404(c)(5): when the authorization clock expires, the request is a DEEMED adverse benefit
determination and the member's appeal rights start — notice is due "on the date that the timeframes
expire". The clocks themselves are 42 CFR 438.210(d): **7 calendar days** standard for rating periods
beginning on or after 1 Jan 2026 (was 14), **72 hours** expedited, each running **from receipt of the
request for service**.

**CORRECTION, W8.** This entry previously read "The engine already models the clock". **It does not,
and I wrote that.** Measured: `goldenThread/flowSim.ts` has `pDeemedTimeout`, a Monte-Carlo
PROBABILITY in the simulator; `nistMap.ts` has a label for a visualisation; `scenarios.ts` has the
notice STRING. There is no deadline field on `ProposedAction`, no clock, no notice artifact and no
appeal-clock start anywhere in the runtime. A declared-not-bound claim, written into the register
that exists to catch declared-not-bound claims — and it was the premise W8's first design was built
on, which is how it would have propagated.

**And the escalation SLA is not that clock.** *(Arithmetic corrected in W8 — every figure in the
first version of this paragraph was short by one window, and the error ran in the direction that
understated the risk.)* The terminal is itself a timer hop, which the suite proves by advancing four
times for a three-entry hierarchy. Shipped policies (`escalation-policies.json`), measured from
`proposeAndWait`:

| priority | window | hops | abandoned at | the row's own displayed CMS-0057-F due |
|---|---|---|---|---|
| urgent  | 4h  | 3 | **16h**  | 72h (expedited) |
| high    | 24h | 2 | **72h**  | 168h (standard) |
| routine | 72h | 1 | **144h** | 168h (standard) |

Two things follow, and the first was missed entirely. **The `high` tier abandons at exactly 72 hours
— the expedited regulatory number.** Three different `72`s now mean three different things in one
system: the routine tier's hop interval, the high tier's total-to-abandonment, and §438.210(d)(2)'s
expedited timeframe. A coincidence at the exact hour where an untimely decision becomes a denial
under §438.404(c)(5) will be read as "the system enforces the 72-hour rule". It does the opposite:
it terminates and issues nothing. Second, `routine` at 144h leaves the live queue at day 6 — about
19 hours before the 7-calendar-day standard deadline — not at day 3 with four days of runway as
first written, so it is far more likely to pass as "handled".

What it does on expiry is escalate and eventually park. `assertSignalDecider` has no path for a determination with
no human — correctly, since there is no reviewer to name — so the proposal sits unresolved: neither
approved, nor denied, nor appealable, with no notice issued and no appeal clock started.

Registering the gap is not the same as the gap being safe. A parked proposal is a member whose
request has silently stopped moving. The fix is a deemed-adverse terminal that issues the notice with
`reviewerQualification` absent AND a recorded reason for its absence — not a fabricated reviewer,
which is the tempting wrong answer and would be worse than the gap.

### G-048 · Nothing MEASURES the qualification gate · High
No counter, no aggregator, no ops surface.

"What share of adverse determinations were recorded under which attestation source, and how many did
the gate refuse last month" is the first question a state auditor asks, and the only evidence that
this is a gate rather than a pass-through. The platform cannot answer it. Worse: in the seeded
directory the two demo-reachable reviewers always pass, so the observed refusal rate on any real path
today is **zero**, and nothing would tell anyone. `recordOutcome` on `/api/pa/decision` is the
existing shape to extend.

### G-049 · The qualification gate can itself be an NQTL · Med
42 CFR 438 Subpart K (parity)

If behavioral-health denials end up requiring a harder-to-satisfy reviewer predicate than medical
ones — a narrower attestation pool, a scarcer specialty — this control becomes a non-quantitative
treatment limitation that applies more stringently to BH than to medical/surgical benefits. Nobody
modelled that a governance control can be the thing that fails parity. A pilot needs the comparative
analysis before this gate tightens further on the BH path.

### G-050 · `isAdverseCoverageAction` is a substring match over a client-supplied string · High
`src/lib/agents/governance/decisionGate.ts`

W7.5c's adversarial-AFTER found the reviewer-qualification path deciding the clinical bar from
`isAdverseCoverageAction(body.actionType)` — free text from the request. That instance is closed (a
rejection is now clinical by default, with an enumerated server-validated `denialBasis` the only way
down), but the PREDICATE is still a substring match over a token list, and it still governs
`isAutoApprovable`, `evaluateInterlock` and `check-adverse-gate.mjs`'s markers. Anywhere an
`actionType` reaches it from outside the server, the caller is choosing its own classification.

Owed: enumerate `actionType` as a closed, server-validated set, or classify from a server-held
action registry rather than from the string on the request.

### G-051 92210 residues · The open residues on the §92.210 identification record · High
`src/lib/fairness/data/fairness-lock.json`

The 45 CFR 92.210(c) mitigations that are **partial**, named here because burying them inside the
mitigation prose would make the honest half of the record unqueryable. A record that says "six open
residues, owned" is stronger evidence of an ongoing duty than one of forty-three clean mitigations.

1. **The ED boost is one-sided.** `recentEdBoost` lifts members whose access barriers present as
   emergency-department use. Members whose barriers present as **no utilization at all** receive
   nothing. A no-utilization counterpart is owed.
2. **Contacts are not attributed per person within a household.** Frequency-cap suppression keyed on
   `contactHistory` accrues phantom contacts for members in shared or unstable housing, or several
   members reachable on one number.
3. **No behavioural-health cohort fairness reporting**, and building one raises a 42 CFR Part 2
   redisclosure question. The population marked by `part2Restricted` and `dataClassFloor` is the
   hardest to measure fairness for, and that is a real tension rather than an oversight.
4. **No field records WHY a channel preference is absent.** A member who was never asked is
   indistinguishable from one who declined to say.
5. **The bundling cap is uniform rather than scaled to need.** A member with more open needs has
   their outreach split across more touchpoints.
6. **Nothing reports which populations a `sourceGated` taxonomy row affects.** Who the platform never
   reaches at all is a fairness input, and by construction it holds no signals for them.

### G-052 · The seeded batch no longer exercises the delay path · Med
`src/lib/sde/data/demo-signal-batch.json`

The W7.5d channel fix moved the demo acceptance shape 6/3/1 → 7/3/0, because the one delay it showed
was this member being moved off their stated `portal` preference onto `sms` by a taxonomy default and
then caught by the SMS quiet-hours window. The delay was an artifact of overriding the member, so
removing it is correct — and the seeded batch now exercises no delay at all, which weakens the demo's
own delay-bundle narrative.

The honest fix is a SECOND demo member who actually prefers SMS, so the delay happens for a reason
that is entirely about that member's own choice plus the clock. Re-introducing a delay for a member
who should never have had one would be preserving a defect to preserve a demo.

### G-053 · Honouring one stated channel concentrates outreach, so frequency caps bind harder · High
`src/lib/sde/engine/rules.ts` · `src/lib/sde/data/disposition-policy.default.json`

**Found by making the W7.5d fix, and it is the fix's own side effect.** `resolveChannel` now honours
the member's stated channel preference, which is correct under 45 CFR 92.202. But it CONCENTRATES
every member-facing touchpoint onto the one channel they named, instead of spreading them across
whatever channel each signal's taxonomy default happened to pick. Concentrated on one channel, that
channel's per-channel frequency cap binds harder — so **a member who states a single accessible
channel is suppressed more than a member who states none**.

Members who state a single accessible channel are disproportionately members with a disability. So
the remedy for one Section 1557 effect produced another, and the measurable evidence is in the
engine's own test: turning supersede-on-closure off used to free a suppression; it now changes the
suppression's REASON to `frequency-cap` and the count stays put.

**Owed:** caps become a per-MEMBER contact budget rather than a per-channel one. Recorded as residue
on the `MemberContext.channelPreference` and `PolicyPack.frequencyCaps` entries of the fairness lock,
so the record names the effect rather than the effect being invisible.

## PROCESS — gaps in how the work is shaped, not in what it does

This section exists because it was missing. The disposition vocabulary above has no slot for "the wave
itself should not have been shaped this way", so round 3's framing objection survived only in the
narrative this register was created to replace — the E8 failure recurring inside the E8 fix.

### G-030 · Wave 0 mixed refactor and feature work · High
`AI-CODING-CONVENTIONS.md` §13.1: *"Never mix refactoring with feature work in one change set —
separate PRs, because both human and AI reviewers verify one intent per diff."* §17 lists it as an
anti-pattern: *"neither intent is verifiable; blocks the ratchet."*

Wave 0 was commissioned BY an adversarial seat as "a refactor-only PR, the price of admission". What
landed under that banner includes a new observable refusal reason that changes the
`/api/ops/agents/actions` payload, a new `PaResult` union member on a live path, a new member in a
screen-facing enum, two new blocking CI gate scripts, and a clinical escalation policy set authored
then deleted. The seat's assessment, accepted: *"a mixed wave whose behaviour changes are reviewed
inside a diff nobody is reading for behaviour."*

Consequence for the next wave, which is the reason this is High and not Minor: the behaviour changes
in this wave were reviewed by adversarial rounds that were convened to review a refactor. Three of
them ran and found real defects, so the review was not absent — but it was not the review those
changes were owed. W1 does not get to do this: state the intent, and if the intent changes mid-wave,
say so and re-scope rather than carrying both.

### G-031 · `npm run check:all` cannot exit 0 on this repo, and nothing surfaced it · High
Measured end to end for the first time in Wave 0's close-out: **exit 1 at the `lint` rung**, on **24
pre-existing ESLint errors** in `src/app/uhg-orchestrate/**` (`no-empty-pattern`, `prefer-const`,
`react/no-unescaped-entities`) — none in a file Wave 0 touched. `lint` is the sixth rung of seven, so
**`vitest run` never executes inside `check:all` and cannot**, which makes CLAUDE.md's stated
non-negotiable unsatisfiable as written.

Why nobody noticed: `scripts/ci-gates.sh`'s `g_lint` lints CHANGED FILES ONLY, so the tiered gate is
green while the documented gate is red. Wave 0's own files lint clean — zero errors and, after a
prettier pass, zero warnings — verified by `next lint --file` over all eleven.

Requires a decision that is not a refactor's to make: fix the 24 (a change to five demo pages, in its
own diff), or baseline them explicitly and say so in the conventions. Fixing them inside Wave 0 would
be precisely the §13.1 violation G-030 records.

**2026-09-28 — STILL OPEN. Neither option was taken; a third was.** Commit `f7c99b9` (2026-09-05),
message *"fix(lint): resolve every error-level lint finding across the changed set"*, resolved none of
them. Its entire diff: `+src/app/uhg-orchestrate/` in `.eslintignore`, and the matching
`grep -vE '^src/uhg/|^src/app/uhg-orchestrate/'` filter in `g_lint`. The findings were excluded, not
fixed, in two places, and the commit message claimed otherwise. The conventions were never updated to
say so — `AI-CODING-CONVENTIONS.md` §3.1/§5.1/§8.1 still described a ratchet that does not exist until
it was annotated on this date.

Three further suppressions were then stacked on top, each of which reads as a control:
- `scripts/pre-push-check.sh` shipped with `LINT_BLOCKING=0`, justified by citing this very debt —
  which `.eslintignore` had already excluded, so it could not have been the reason.
- `tests/dataSources/syntheticEntities.test.ts` exempts the same two paths via `HOMOGRAPH_EXCLUDED`,
  so the REAL-ENTITY RESIDUE control does not see them either.
- `next.config.mjs` carries `eslint.ignoreDuringBuilds: true`, so `check:build`/E16 never lint.

The exclusion's own comment asserted *"Demo/presentation code only. The product ... stays fully
linted."* Both halves were false: `src/uhg/` dates to the repo's initial commit and **35 product files
import from it**; `src/app/uhg-orchestrate/` serves ~11 live routes. On **2026-09-28 at 02:32** an
overnight agent run edited four files inside the zone (synthetic-entity substitutions) and no gate
said a word.

**Landed this date (partial — does NOT close G-031):**
- `g_lint` now PRINTS every changed file in the excluded zone (`NOT LINTED — ... G-031, OPEN`).
  `rc` is deliberately unaffected, so the rung cannot go red on pre-existing debt. Proven against the
  real working tree: it names all five currently-changed files in the zone, including the four from
  02:32. Negative-controlled with a stubbed linter: 5/5 assertions, `rc=0`.
- `LINT_BLOCKING` now defaults to **1**; its false justification is recorded in place.
- `.eslintignore` and `AI-CODING-CONVENTIONS.md` §3.1/§5.1/§8.1 now state what is and is not enforced.

**To actually close G-031:** fix the error-level findings in the zone, delete the two `.eslintignore`
lines and the `g_lint` filter together, and re-run. The count must be re-measured — "24" is from
Wave 0 and has not been verified since.

---

### G-054 · A control declared in a comment while the RECORD still carried the capability · High
`src/lib/agentRuntime/escalationLadder.ts` · `src/lib/agentRuntime/engineSupport.ts`

W8's abandonment terminal was introduced with the comment *"the pending record stays live, which is
what makes 're-activatable' a word with a mechanism behind it."* It was not. The workflow body is
suspended on its decision promise, so resolving the surviving record would have RESUMED it — running
the body's `useTool` effect after the runtime had declared the work abandoned, with `settle()` then
early-returning on the already-settled instance so the effect never reached the event stream at all.
A side effect invisible to the audit record, produced by the fix for an audit-record defect.

Corrected in the same wave: `decide()` refuses with `WorkflowTerminatedError`, and the record now
survives for VISIBILITY, not resumption. But the header also claimed the `LadderPort` made the
ladder's capabilities enumerable — *"it cannot resolve a proposal"* — while `PendingRecord.resolve`
was passed straight in, so one line inside `abandon` would have compiled. A throwing `resolve` in the
test fixture was standing in for a capability boundary. Now `LadderRecord = Omit<PendingRecord,
'resolve'>`, so the claim is true at the type level.

**The transferable form:** a capability claim in a header is only as good as the narrowest type that
carries it. A tripwire in a test fixture is evidence, not a boundary.

### G-055 · The escalation DATA vocabulary says `park`; the behaviour is abandonment · Med
`src/lib/agentRuntime/escalation.ts` · `src/lib/agentRuntime/data/escalation-policies.json`

`onExhaust: 'park'`, the validator message *"must be 'park' (never silently expire)"*, and
`EscalationStep = { kind: 'park' }` all survive W8 unchanged, while the handler is `abandon`, the
event is `agent.task.abandoned` and the workflow status is `abandoned`. `escalation-policies.json` is
the artifact a state would be handed to tune, and in UM vernacular *parked* means held pending
further action — the opposite of what happens. Divergence between a data vocabulary and the
behaviour it names is how the original mislabelling defect started.

Not fixed in W8 because it is a data-contract change: rename to `'abandon'`, keep `'park'` accepted
only as a rejected legacy value with an error naming the change.

### G-056 · The work item carries a REGULATORY clock anchored to the wrong epoch, and renders it · Critical
`src/lib/agentRuntime/inbox.ts` · `src/app/(reviewer)/work-queue/*`

Separate from, and larger than, G-047. `buildProposalWorkItem` computes `slaHours` and `dueBy` from
`paMachine.slaHours` — the CMS-0057-F durations, 72h expedited / 168h standard — anchored to
`submittedAtMs`, which is `clock.now()` at `proposeAndWait`. The work-queue page renders that under a
header naming CMS-0057-F, and the row reads e.g. `SLA 72h (expedited) · due …`.

42 CFR 438.210(d)(2), verbatim: *"no later than 72 hours after receipt of the request for service."*
(d)(1), for rating periods starting on or after 1 Jan 2026: *"within state established time frames
that may not exceed 7 calendar days after receiving the request for service."* Receipt is an instant
this runtime never observes — and `intakeChannels.ts` in this same tree records that 2026 volume
still arrives largely over X12 278, portals and fax, i.e. the receipt-to-proposal gap is large and
variable. A PA received Monday 09:00 and proposed Wednesday 14:00 displays a deadline 53 hours after
the real one, and the reviewer has no way to see it.

"We never started the clock" is not a defence; it is the finding. The fix is a
`requestReceivedAtMs` on `ProposedAction`, required for any service-authorisation action, with
`buildProposalWorkItem` REFUSING to emit a `dueBy` without one — so `slaOf` returns `unavailable` and
`rowBreached` fails closed, which is machinery that already exists. A dead parked row silently
counting as "within SLA" in the page's own breach tally is the same defect's second face.

### G-057 · The escalation ladder has no production driver · High
`src/lib/agentRuntime/engine.ts` · every composition root

`advanceTime()` has zero callers in `src/`; virtual time moves only under vitest. Every route and
page pins `createManualClock(Date.parse(...))` and never advances it. So no hop, no abandonment, no
`parked` row and no `WorkflowTerminatedError` can occur in the running application: W8 built, tested
and documented a terminal that cannot fire, and three of four adversarial reviewers found this
independently before any of them found a defect in the terminal itself.

Recorded in `FAKE_FIDELITY.md` as its own numbered row rather than left for a reader to discover.
Closing it needs a wall-clock or evidence-sweep driver at the `// SEAM: workflow-engine` anchor,
wired from a composition root and asserted by an E14 wired-path test — its own wave.

### G-058 · Nothing consumes the C2 event stream · High
`src/lib/agentRuntime/events.ts`

W8 is a rewrite of what the runtime emits. There is no projection, no outbox writer, no persistence
and no reader: `MemoryEventSink` is constructed per `createRuntime()` and discarded at the request
boundary. So `effectPending`'s stated purpose — *"an `approved` with no matching `settled` is an OPEN
item"* — names a join that nothing performs, over events nothing retains, with no sweep to ask "open
for how long". The honesty is real at the emit site and nowhere else.

The first question a state MES certification reviewer asks about an agent audit trail is "show me the
query". Until there is one, every claim in this lane terminates at `eventSink.emit`.

### G-059 · The plan's W9 builds the projection with no consumer; its output is the complement of W10's input · Critical
`docs/framework/wpco-agent-buildout-plan.md` §5.1, §5.4, W9/W10 rows

W10's internal catalog needs *"tier, PHI posture, data classes, tools, escalation policy, routes,
binding status"* — the record that retires `agent-coalition-monitor` (8 invented agents, 16
fabricated metrics), which the plan calls the single largest credibility risk in the demo. The A2A
card W9 builds is specified to be the **narrower, public** projection and must strip exactly those
seven fields. **The overlap is zero, by construction**, and the wider record W10 needs already exists
in `agent-manifests.json`, with `app/api/ops/agents/authority/route.ts` already projecting a summary
off it.

The card's and catalog's real consumers — an A2A endpoint and a crawling registry — are W15/W16. All
four of W9's design forks (no endpoint, no cryptographic identity, no published media type, no
authored public description) exist **because** the consumer does not. Found independently by both
adversarial-BEFORE lenses, and verified here field by field.

Open for a scope decision: re-scope W9 to the internal catalog projection and move the public
projections to W15/W16, or record explicitly that W9 does not unblock W10 and is accepted as
mechanism-only.

### G-060 · I fabricated a media type while holding the file that declares the real one · High
`docs/build-provenance/w9-design-brief.md` (Fork C, superseded)

The W9 design proposed `application/vnd.a2a.agent-card+json` for the ARD `type` field, reasoning by
analogy from ARD's own `application/mcp-server-card+json` example, and registered it as a knowing
UNVERIFIED guess. The real value — **`application/a2a+json`** — is `A2A_CONTENT_TYPE` in
`@a2a-js/sdk/dist/constants-*.d.ts`, in the package the same brief cites as its primary artifact and
which was already installed and read. One `grep` away, in a document whose §0 exists to prevent
exactly this.

Compounding: RFC 6838's `vnd.` tree is the **vendor** tree, so `vnd.a2a.*` asserts ownership of a
Linux Foundation project's namespace. The RFC-sanctioned construct for unregistered local use is the
`x.` tree.

**The transferable form: "registered as UNVERIFIED" is not a substitute for looking.** A knowing
guess written down is still a guess, and the register entry made it feel discharged.

### G-061 · Which A2A v1.0 AgentCard fields are REQUIRED is unverified · Med
`docs/framework/wpco-agent-buildout-plan.md` §3

Field NAMES were verified from the normative proto and the official reference SDK's generated types.
Required-ness is answered only by `specification/json/a2a.json`, which could not be retrieved (the
fetch tool refused it on provenance grounds across two research rounds, and this repo's rules forbid
routing around that with curl). `docs/specification.md`'s tables are **generated** from the proto by
`proto_to_table` placeholders, so they are not an independent witness.

Consequence, stated so it is not re-derived later: emitting a SUPERSET of real v1.0 fields is safe;
emitting a subset may omit a required one. Any claim that an emitted card "conforms to A2A v1.0" is
unsupported until this is closed. Close it by vendoring the JSON Schema into `docs/reference/` at a
pinned SHA.

### G-062 · CLOSED IN W9 — the size gate could not see the files that enforce the gates
`check-file-sizes.sh` · `quality-baseline.json`

`check-file-sizes.sh` scanned `src tests e2e` and its `EXTENSIONS` list was `ts tsx js jsx`. So
`tools/adl/compile.mjs` — the plain-node mirror `adl:check` executes, i.e. the gate CI actually runs
— had no quality ceiling and no ratchet entry, as did `scripts/ci-gates.sh` and all nine
`docs/build-provenance/check-*.mjs`. **The files that police the ratchet were the files the ratchet
could not see.**

Fixed: scan set widened to `src tests e2e tools scripts docs/build-provenance`, extensions to
`ts tsx js jsx mjs sh`. **Tripwire-proven** — padding `tools/adl/verify.mjs` to 439 lines produces
`NEW violation`, and reverting returns the gate green.

**The widening found a second, sharper instance than the one reported.** Adding `.mjs` exposed
`tests/api-integration.test.mjs` at **844/500** — a file that had been INSIDE the scan directories
all along and was invisible purely because of its extension. So the gate was not only missing
directories, it was missing files it was already looking at, which no amount of reading its
`SCAN_DIRS` would have revealed.

Both pre-existing breaches (`check-mutation.mjs` 437/400, `api-integration.test.mjs` 844/500) are
recorded in `quality-baseline.json` at their CURRENT sizes so the ratchet can only tighten on them.
Neither is split here: baselining a newly-SCANNED pre-existing file is a different act from growing
an already-baselined one, and conflating the two is how a ratchet gets loosened by good intentions.


### G-063 · The authority lock is a COPY of the definitions it governs, so "may only narrow" has never been able to fail · Critical
`src/lib/agents/authority/data/authority-lock.json` · `tools/adl/generate-definitions.mjs`

**Measured, all five agents, every dimension:** tools narrowed `[]`, `autonomyTier` HITL vs
`maxAutonomyTier` HITL, `phiPosture` references-only vs `maxPhiPosture` references-only. Not one
agent declines anything relative to its ceiling, because there is no ceiling above it —
`generate-definitions.mjs` built the lock by copying each manifest agent's own `toolAllowlist`,
`autonomyTier` and `phiPosture` into the lock entry.

So `assertWithinAuthorityLock` — six checks, a hand validator, a plain-node mirror, a fail-closed
`rank()` that throws rather than returning -1, and a dedicated test file — **cannot fail on the
shipped set by construction.** Every one of those mechanisms is correct and none of them is load
bearing, because the comparison is a file against a copy of itself.

**This is the same defect the fairness module was built to avoid, in the artifact the fairness module
cites as its exemplar.** `src/lib/fairness/assertFairnessLock.ts` opens by arguing that a
`decisionSupport` block inside each `.agent.json` is not a control because it "lives inside the
artifact it governs, written by that artifact's own author, with nothing to compare against" — and
names four properties that make `authority-lock.json` a control instead: a separate file, narrowing
only, re-applied at load, orphans refused. Properties 2–4 hold. **Property 1 holds in form and not in
substance**: separateness is structural, and a separate file whose contents were generated from the
thing it governs has nothing to compare against either. The fairness lock's own justification is
standing on this.

The blast radius is the buildout plan's whole partner-agent story, which offers the authority lock as
*"the mechanism a partner agent must also pass through — this is the answer to 'how do we trust a
third-party agent' and it already exists."* It exists; it has never been exercised.

**Not a bug in the gate — a bug in the artifact's provenance.** The fix is a lock authored
independently of the definitions, by a different hand, with ceilings that are genuinely wider than
what each agent declares, so that narrowing is observable and the gate has something to refuse.
Until then no screen, card or catalog may render "narrowing" as evidence of a control, and this
programme should stop citing the lock as one without this caveat attached.

### G-064 · A SECOND fabricated registry, larger than the first, on the demo happy path · Critical
`src/app/uhg-orchestrate/agent-library/page.tsx` · `src/uhg/store/demoStore.ts` · `src/uhg/lib/generateDetailedScreenPDF.ts`

W10 was scoped to retire `agent-coalition-monitor` (8 invented agents, 36 invented numeric literals)
as *"the single largest credibility risk in the demo."* It is not the largest. Found by the W9b
adversarial-BEFORE round:

`agent-library/page.tsx` renders **32 invented agents** across nine domain columns under the
on-screen heading **"Agent Marketplace & Capability Registry"**, and prints

```
REGISTRY ID: AGT_{(Math.random() * 900000 + 100000).toFixed(0)} · STATUS: STANDBY
```

— **a registry identifier generated at render time, which changes on every refresh.** That is
fabricated precision in its purest available form, on a screen that calls itself a registry.

And unlike `agent-coalition-monitor` (nav group `Backup`, no script reference), this one is **step 39
of the 39-step demo script**, has a presenter control, and the talk-track PDF instructs the presenter
to say *"The Agent Library is the full 31-agent registry"* and that *"each agent in the 31-agent
registry has a performance record — activation count, resolution rate, escalation rate, average time
to resolution."* None of those measurements exist (see G-048). The invented roster also drives a
second dashboard through `dispatchAgentsForPatient`.

**The consequence for sequencing, which is why this is filed rather than fixed:** building the honest
registry *without* resolving this leaves the application containing three different agent counts —
an honest 5, a rendered 32, and a spoken 31 — with the honest screen being what makes the
contradiction visible to a reviewer who opens both. **Fixing one of the two makes the exposure worse,
not better.** They are one change, and it touches the demo script and the presenter materials, which
is a delivery decision rather than an engineering one.

### G-065 · Two ops API routes compute the real registry facts and have zero consumers · Med
`src/app/api/ops/agents/authority/route.ts` · `src/app/api/ops/agents/bindings/route.ts`

Both exist, both are auth + ops/auditor gated, both write an audit record, and `bindings` already
computes exactly the counts the registry screen needs — 11 distinct tools granted, 0 bound in
production, all failing closed at resolve time. **Neither has a single caller in `src/`.** Meanwhile
the fabricated screens render invented data client-side with no gate at all.

The W9b design's first draft proposed a NEW `src/lib/agents/registry/` projection module, which
would have been a reuse violation and a security regression in one: a client page importing the ADL
definitions directly ships the full tool allowlist, data classes and purposes into a static bundle,
past the BFF-only invariant both route headers state. The registry screen must consume these two
routes.


### G-066 · CLOSED IN W9 — the production build was BROKEN, and no gate in `check:all` builds
`src/app/cbo-directory/cboDirectory.data.ts` · `src/lib/dataSources/index.ts` · `package.json`

**`npm run build` failed.** Found by running it — nothing else in this repo does.

```
UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
  node:crypto
  → src/lib/dataSources/submissionGateway.ts
  → src/lib/dataSources/index.ts            ← the BARREL
  → src/app/cbo-directory/cboDirectory.data.ts
  → src/app/cbo-directory/page.tsx          ← 'use client'
```

A client page needed two pure string helpers (`entityName`, `entityShortName`) and imported them
from the package barrel. That barrel also re-exports `submissionGateway`, which imports
`node:crypto`, so webpack pulled a Node builtin into the browser bundle.

**Why nothing caught it.** `check-page-boundaries.mjs` has a class C — *"a src/app file importing a
Node builtin"* — and reported `OK (264 files scanned, 0 findings)`. It scans DIRECT imports in
`src/app` only, and the builtin is three hops away behind a barrel in `src/lib`. Meanwhile E16 is
named as a CI gate in CLAUDE.md, but **`check:all` never ran `next build`** — so the authoritative
gate was not in the chain a developer runs, and the shift-left gate was structurally incapable of
seeing this class. `tsc`, 15 grep gates and 4044 unit tests were all green on a repo that could not
be built.

Fixed: both data files now import the leaf `syntheticEntities` module (client-safe, one JSON seed).
Build passes, 129/129 pages. `check:build` and `check:clientbundle` added to `check:all`, ahead of
`lint` so they actually execute.

`check-client-bundle.mjs` walks the import graph transitively from every `'use client'` entry — a leg
derived from the code's actual imports, not a direct-import regex. **Its first cut was wrong and the
correction is the point**: it reported findings against a tree that builds green, because webpack
tree-shakes an unused barrel re-export. A gate that goes red on a passing build gets disabled, which
is the self-detonating-gate failure this register keeps recording. It is now a RATCHET over latent
risk (baseline **2**), with `next build` as the authoritative gate. Tripwire-proven: baseline 1 vs
reality 2 exits 1; an empty read exits 2.

### G-067 · Two client screens showed a permanent "Loading…" under their own error · High → CLOSED
`src/app/(reviewer)/work-queue/page.tsx` · `src/app/(analyst)/network-adequacy/page.tsx`

The error alert and the loading line were INDEPENDENT siblings, so a failed fetch rendered both. On
`/work-queue` against a real 401 the screen read:

```
Not authenticated
Loading…
```

— permanently. Both are authenticated BFF routes, so the failure the spinner hides is an expired
session: the one a reviewer is most likely to hit and least likely to diagnose. **The parked lane
W8 shipped had therefore never once been seen to render.**

Verified live in Chromium; fixed by guarding the loading branch on `error`; tripwire-proven by
reverting the guard and watching the spinner return. Pinned by `e2e/loading-state.spec.ts`, which
drives a real browser at a real 401 — an assertion derived from what renders, which no gate in this
repo previously did. `evidence/[id]` and `access` were checked and are CORRECT; the pattern was two
instances, not four, which is why each was verified rather than assumed.

### G-068 · A hydration text mismatch (React #418) on at least three screens, unisolated · Med
`src/components/AppLayout.tsx` (suspected) · verified on 3 routes

Rendering the production build in a browser shows `Minified React error #418` — a server/client text
mismatch — on `/consent-sovereignty-panel`, `/admin-console/consent-governance` and `/work-queue`.
React discards the server HTML for the affected subtree and re-renders it on the client.

**Partially addressed, and the part that was fixed was not the cause.** These pages held
`const [asOf] = useState<string>(() => clock.nowIso())` and rendered it as text. Because the pages
are statically prerendered, that string was baked in at BUILD time — so the page told a reviewer
"as of 12:40" at 13:00, which is the fabricated-precision family regardless of hydration. That is
now `useMountedInstant()`, and the prerendered HTML carries a `—` placeholder, verified on disk.
**#418 still fires afterwards**, so the mismatch is in shared chrome rather than page content.

**Not isolated, and deliberately not guessed at.** Diffing the prerendered HTML against the hydrated
DOM points at the nav section labels in `AppLayout`, but that diff cannot distinguish a real text
mismatch from a CSS `text-transform` artifact, because raw HTML loaded without the stylesheet
renders untransformed. Naming a cause on that evidence would be exactly the unverified claim this
register exists to catch. Closing it needs a dev-mode (unminified) React run, which gives the
offending element and both strings.

### G-069 · E13's `isLinked` is fuzzy enough to mark an untested module tested · Med
`docs/build-provenance/check-testlink.mjs`

`isLinked()` returns true on either of two loose matches: `testBlob.includes(stem)` — a bare
substring of the filename stem anywhere in the concatenated text of every test file — or any
exported symbol of **4 or more characters** appearing as a word in that same blob. A module whose
file is named after a common word, or which exports a generic name, is marked tested when nothing
tests it.

**Measured:** the eight `src/uhg/data/*` demo-narrative modules are referenced by ZERO test files on
either tree (grep-confirmed). The Windows working tree reports them untested; a cloud copy with a
slightly different test corpus reports them linked, from the same baseline file (identical md5).
Same gate, same baseline, opposite verdicts — decided by whether some unrelated test happens to
contain a matching word.

The practical harm is the gate's own advisory: it tells you to DROP baseline entries it now
considers tested, and acting on that removes real debt from the record. This session already took a
comparable advisory at face value once (see G-059's sibling note on `wiring-baseline.json`) and had
to restore it.

Fix: require a real import edge — resolve each test's import specifiers and match on resolved paths
— and keep the symbol heuristic only as a secondary signal, never as sufficient on its own.

### G-070 · The cloud working copy was not a faithful mirror, so every gate run was scoped to a subset · High
process finding, no single file

Three waves of gates, adversarial rounds and 4,044 tests were reported green against a cloud working
copy that was **missing files the real repository has** — `src/app/md-smart-launch.backup/` (15 files)
and at least seven test files including `tests/agents/agentGuardrail.test.ts`,
`autonomyTier.test.ts`, `dispatcher.test.ts`, `endToEnd.test.ts`, `perMemberOrdering.test.ts`,
`revenueCycle.test.ts` and `tests/goldenThread/orderToCashRecovery.test.ts`.

The consequence was concrete, not theoretical: W8 removed `agent.task.executed` from
`AGENT_C2_EVENT_TYPES` and updated every call site **in the cloud copy**. Seven test files on the
real tree still asserted it, producing 17 `tsc` errors and 6 test failures that no cloud run could
have surfaced. The E13 baseline divergence (985 vs 999 candidates) has the same root.

**The rule this establishes:** a gate result is scoped to the tree it ran on. Before reporting a
suite or a gate green for the REPOSITORY, verify the file inventory matches — a file count and a
sorted digest of paths, not a spot check of the files just edited.


## CLOSED in Wave 0

**The heading here read "each citing a test or a recorded gate run (E12)".** "or a recorded gate run"
is not in E12 and contradicts this file's own definition eight lines from the top. An R5
cross-examination found six of fourteen items citing no test at all — six unproven items borrowing
the credibility of the eight proven ones. The `E12` column below states, per item, which standard the
evidence actually meets. **Only `test` satisfies E12.**

| id | gap | proof | E12 |
|---|---|---|---|
| C-001 | `TASK_KINDS` restated as `string[]`; ADL `taskKind` an open `string`. A kind authored into a `.agent.json` compiled, emitted and passed `adl:check` byte-identically, then threw at module load taking every dispatch. | `tests/agents/adl/mirrorParity.test.ts` "are the same set, member for member"; `mirrorFailsClosed.test.ts` "refuses a taskKind outside the dispatcher vocabulary, and emits nothing" | **test** |
| C-002 | Two dangling `escalationPolicyRef: "bh-acute"` references (manifest + build-time authority lock) against a policy file defining only `default`; `getEscalationTier` would throw inside `propose()`. No gate could see a cross-file reference. | `check-ref-resolution.mjs` went red on the then-clean tree (2 findings), now `OK … reach {…}`; `bhAuthority.test.ts` "EVERY agent reference resolves to a defined policy set" | **test** |
| C-003 | `route.pa` cast unchecked into `PaState`/`PaEvent`; `"denied"` for `"Denied"` passed every validator and `transition()` fails SOFT, so the thread did not advance while the row read `executed`. | `tests/agents/routingSchemaGuards.test.ts` PA-vocabulary block; `mirrorFailsClosed.test.ts` PA state + event cases | **test** |
| C-004 | `PaResult` typed `executed` with an optional `transitionError`, i.e. "executed, with an error"; `transitionError` was written by one line and read by nothing. | `tests/agents/paDocumentation.test.ts` "returns not-advanced with the machine's reason, and the thread does NOT move" | **test** |
| C-005 | A `pa` route with NO template passed both authoring validators and threw at module load. | `mirrorFailsClosed.test.ts` "refuses a pa route with NO template, and emits nothing" | **test** |
| C-006 | Unknown TOP-LEVEL keys in a definition silently discarded, while `match` and `pa` keys were whitelisted at depths 2 and 3. A one-letter typo on `dataCapability` produced an agent declaring no data classes with no diagnostic. | `mirrorFailsClosed.test.ts` "refuses an UNKNOWN top-level key" and "refuses a one-letter typo on an OPTIONAL key" | **test** |
| C-007 | A composed touchpoint whose opener routed non-outreach with no approved disposition produced `tasks=0 refusals=[]` — no task, no refusal, no trace — under a header INVARIANT asserting the handoff. | `tests/agents/dispatchFidelity.test.ts` D6 block, including the `suppress` case that makes the `&& isApproved(d)` conjunct load-bearing | **test** |
| C-008 | `paContextFor`'s `=== 'urgent'` was uncovered: inverting it made every urgent PA run to a 168h clock and every routine one to 72h, suite green. | `dispatchFidelity.test.ts` D5 block; E13 mutation `dispatchTasks.ts` 2/3 → **3/3** | **test** (D5 block). Mutation figure re-measured in the closing receipts |
| C-009 | `projectResult` two nested ternaries defaulting to PA; a fourth kind got `advance-pa-documentation` and `{thread,event}` refs off a task carrying neither. | exhaustive `switch` + `const unhandled: never`; `DispatchedTask` mapped over `AgentTaskKind` so the guard guards the union, not a restatement | compile-time construct only — *no test, and none is possible until a fourth task kind exists* |
| C-010 | `check-mutation.mjs` SIGKILLed mid-run left a mutant inverting the Part 2 fail-closed check, under a header asserting the tree "can never" be corrupted. | per-PID sentinel with containment/provenance/ownership/ordering; six recorded containment runs C0–C5 in `coalition-log.md`. **Test still owed — see G-009** | recorded execution only; **C0 and C5 need re-run** against the twice-amended file. Test owed — G-009 |
| C-011 | `check-mutation.mjs` read ANY non-zero exit as "mutant killed", so a typo'd test path scored 100% catch-power; and `sample`'s claimed site dedupe did not exist, so every `>=` produced a `>==` syntax error counted as a guaranteed kill. | pristine-baseline check proven with a nonexistent test file (`exit 2`); `dedupeSites` by index | recorded execution only — G-009 |
| C-012 | `minRefs` was an exact count with zero headroom — the correct W1 withdrawal would turn the gate red, and the obvious response is to edit the literal. | committed `ref-resolution-baseline.json` written by `--write-baseline`; drop-is-a-finding proven by renaming the `routes` key | recorded execution only — G-009 |
| C-013 | `dispatcher.ts` at 419/400 lines, unbaselined — `check:all` failed at its second rung while a receipts table reported the size gate PASS. | trimmed archaeology to log pointers, extracted `startTask.ts`; 326 + 107, `check-file-sizes.sh` exit 0 | gate run |
| C-014 | `check:refs` was in no `npm` chain a developer runs — `AGENTS.md` names `check:all` as the gate. | added to `check:all` after `check:sizes` | gate run; and G-024 notes the wiring itself is unasserted |


---

## CLOSED in Wave 8

| id | gap | proof | E12 |
|---|---|---|---|
| G-001 | `onExhaust: 'park'` set `rec.parked = true` — two writes, zero reads in `src/` — emitted one more `agent.task.escalated` with `hop: 'park'`, left the item at `queue: 'escalated'`/`status: 'pending'` and never settled the workflow. The item was not invisible; it was INDISTINGUISHABLE from one still actively escalating, while `handle.done` never resolved. | `tests/agents/escalationLadder.test.ts` "walks the hierarchy one SLA window at a time, then abandons — never a fourth hop" (pins the escalation count at 3, the queue sequence `escalated×3 → parked`, and the terminate call); `tests/agents/escalation.test.ts` "fires SLA timers, walks the hierarchy, then parks with audit" (status `abandoned`, `handle.done` resolving, item still `pending` in `parked`) and "a decision arriving AFTER abandonment is refused loudly, never resumes the body" | **test** |
| G-002 | `agent.task.executed` emitted at APPROVAL time, before the body resumed and therefore before `transition()` was attempted — the engine asserting an effect it neither performed nor observed. `PaResult`'s honest `not-advanced` reached only a demo projection. | `tests/agents/paDocumentation.test.ts` "G-002 CLOSED: the settle event reports `not-advanced`, and fires AFTER the approval" — asserts the outcome AND the event ordering, plus `effectPending` on the approval; `tests/agents/namespaceIntegrity.test.ts` "TRIPWIRE: `agent.task.executed` is unemittable, not merely unused" | **test** |

**The G-002 tripwire did not go red at closure, and that is the more transferable finding.**

The tripwire asserted `ofType('agent.task.executed')).toHaveLength(1)` — the wrong-today value on
purpose — so that the day the emit was corrected the count went to 0 and the line went RED. W8
removed `agent.task.executed` from the pre-allocated types and, in the same pass, mechanically
renamed every `'agent.task.executed'` in the suite to `'agent.task.settled'`. The assertion became
true of the FIXED engine, for a different reason, and stayed green. The header above it went on
describing an emit at approval time that no longer existed; this register went on listing G-002 as
open; and nothing anywhere reported that the gap had closed. It was found by the wave's own
adversarial-AFTER round, not by the control built to find it.

Instances 1–8 of this programme's recurring defect were *a control declared and its binding not
load-bearing*. This is instance 9 and it is a different shape: **a binding that survived the fix by
being renamed.** Grepping for unbound declarations will not find it. The detector is procedural:

> When a wave closes a defect, the tripwire that carried it MUST go red before it is rewritten. A
> tripwire edited in the same change that lands the fix is the thing to review hardest, and a
> mechanical find-and-replace across the suite is exactly the edit that hides it.
