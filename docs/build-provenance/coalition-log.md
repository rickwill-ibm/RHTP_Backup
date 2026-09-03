# Coalition Log

Append-only record of the architect + SWE + adversarial coalition run for each core-logic change,
per `docs/framework/coalition-protocol.md`. Enforced by `g_coalition` in `scripts/ci-gates.sh`:
a landing that touches a core-logic path with no new entry here FAILS the gate.

Newest first. One entry per qualifying change.

## 2026-09-03 — Coalition deployment: AGENTS.md roster + SESSION-START-PROMPT.md

**Scope:** docs-only change — no `src/lib/**` domain logic touched. Coalition trigger
classification: new file (`docs/build-provenance/SESSION-START-PROMPT.md`) + >40 lines
changed in `AGENTS.md`. Trigger met on "new file" and ">40 changed lines" criteria.

**Change summary:**
- `AGENTS.md`: replaced the verbose coalition-prose section with the full agent roster
  (B0–B3, R1–R5, ON-DEMAND Scale) embedded as a copyable SESSION START deployment prompt,
  keeping the file at ≤150 lines. Pre-flight trigger table, reasoning-mode rules, gate
  command, and Definition of Done preserved. Added `npm run gate:push` to the commands
  section. Added `coalition-log.md` entry requirement to the Definition of Done.
- `docs/build-provenance/SESSION-START-PROMPT.md` (NEW): standalone, fully self-contained
  session-start prompt with the complete coalition roster, per-agent mandates and must-ask
  questions, reasoning-mode rules (CoT default / ToT injection points), pre-flight
  checklist, gate commands, Definition of Done, and stop conditions. Intended to be copied
  verbatim and sent as the first message to any AI agent starting an RHTP session.

**Architect pass (B1):** docs-only; no ADR required. The prompt mirrors the canonical
persona definitions in `docs/framework/personas.md` and the trigger rules in
`docs/framework/coalition-protocol.md` verbatim — no new design decisions.

**Adversarial pass (pre-delivery):** R5 cross-examination applied to the prompt itself:
- Claim "coalition is active" — UPHELD: the prompt forces the agent to name each persona
  and confirm before proceeding; it does not merely assert activation.
- Claim "reasoning mode enforced" — UPHELD: CoT/ToT injection points are explicit and the
  prohibition on ToT for mechanical tasks is stated.
- Claim "gate enforced" — UPHELD: `npm run check:all` and `npm run gate:push` are named
  explicitly; the commit-message no-attribution rule is restated.
- Risk R3 (stub): the prompt is a doc artifact, not a seam — no stub grading applies.
- Risk R2 (negative-space): the pre-flight checklist covers all five trigger classes; the
  stop-and-report rules cover the four stop conditions from `AGENTS.md`. No absent item
  found that was present in the canonical framework docs.

**Verification:** `tsc --noEmit` 0 · `check:sizes` PASS ratchet intact · no src/ files
changed · `AGENTS.md` line count 138 (≤ 150 cap).

## 2026-09-02 — WPC Da Vinci Risk Adjustment: the CODING GAP as a first-class projected dimension

**Context:** the platform owned both ends of the risk-adjustment value chain — a RADV-defensibility /
submission-scrub module (`src/lib/finance/riskAdjustment/`) and an "HCC Suspects" clinician UI — but had NO
standards-based artifact connecting the ingested clinical evidence to them. The coding gap (the central object of
payer risk adjustment) was *dropped* on ingestion (care-gap Observations → non-projected census) and absent from
the graph (the generic `RiskAssessment` node has no HCC category, gap status, suspect type, hierarchy, or model
version). This wave implements the **Da Vinci Risk Adjustment IG** (`hl7.org/fhir/us/davinci-ra`) Coding Gap
MeasureReport as a NEW projected dimension. Record-domain count moves **22 → 23**
(`tests/pipeline/domainRecordCount.test.ts` 23/23).

**Architect + SWE.** New adapter `src/lib/pipeline/adapters/codingGapReport.ts` FLATTENS a Da Vinci-RA Coding Gap
`MeasureReport` (one per member per model version) into one record per `group` (condition category), parsing the
HCC code + code system, evidence status (open/closed/pending), suspect type (historic/suspected/net-new),
hierarchical status, evidence-status-date (date-only), model+version, and the group's supporting-evidence
references (`evaluatedResource` + `ra-groupReference`). New spec `src/lib/graph/mapping/codingGap.ts` projects a
`CodingGap` node keyed by `(measureReportId, model, version, groupId, conditionCategory)` — so concurrent
CMS-HCC **V24 and V28** gaps coexist through the blend — with `HAS_CODING_GAP` (Member→CodingGap, associative,
dated) and `SUPPORTED_BY` (CodingGap→Evidence) edges. Routing: a Da Vinci-RA `MeasureReport` PROJECTS; any other
MeasureReport is a loud by-design non-projection (`MeasureReport:non-ra`). Surfaced through the holistic lens via
`mapCodingGaps` (`CodingGapSummary`: openCount + suspectedCount), consent-filtered like every other dimension.

**The coding-intensity firewall (the P0 safety property).** A coding gap — especially a `suspected` one — is a
payer-analytics HYPOTHESIS, never a clinical assertion. Enforced three ways: (1) `coding-gap` is OUT of
`CODE_CARRYING_DOMAINS`, so it never runs the clinical semantic-binding gate; (2) both edges are ASSOCIATIVE, never
causal; (3) the adapter NEVER emits a Condition — it only CITES evidence via a neutral `Evidence` node. An
ungoverned evidence status / suspect type QUARANTINES (never guessed). 42 CFR Part 2: SUD-linked HCC gaps carry a
Part 2 label (segmentation-at-transform) and the consent lens filters them uniformly (DP-1).

**Adversarial red-team (independent agent, tree-of-thought; six findings, all closed before delivery).** An
independent red-team agent attacked the build against the platform's own safety posture:

- **FINDING 1 — HIGH (closed): the firewall was unenforced — SUPPORTED_BY minted a `Condition`.** Both graph
  stores auto-create an edge's endpoints, so a `SUPPORTED_BY` edge to `Condition/x` MINTED a `Condition` node from
  an unverified reference — a hypothesis materialized as a diagnosis, and the firewall test passed only because its
  fixture cited no evidence. Fix: `SUPPORTED_BY` now targets a NEUTRAL `Evidence` node (keyed by the reference,
  carrying `{evidenceRef, resourceType}` for join-back), never a clinical kind; the firewall test was strengthened
  to a `suspected` gap CITING `Condition/hypothesis` and asserts ZERO Condition nodes minted.
- **FINDING 2 — HIGH (closed): 42 CFR Part 2 under-restriction (SUD leak).** SUD detection matched a literal digit
  set against `coding[0]` with no leading-zero normalization, so `HCC055`, a co-listed ICD in `coding[0]`, or a
  version mismatch would leave a SUD gap unrestricted and DISCLOSED under NO_CONSENT. Fix: version-aware
  `SUD_HCC_BY_VERSION` (V24 {54,55} / V28 {135-138}, UNION fail-closed default), `hccDigits` strips leading zeros,
  and `pickConditionCategory` scans ALL codings for the HCC-system coding; a digit-less HCC code FAILS CLOSED.
- **FINDING 3 — MEDIUM (closed): PHI leak via evidenceStatusDate.** The date field fell through to a free-text
  `valueString`. Fix: `dateExtValue` reads only `valueDate`/`valueDateTime`, ISO-validated.
- **FINDING 4 — MEDIUM (closed): node-key collision.** The key omitted model+version+group, so a repeated category
  in one report (or a reused report id across versions) collapsed two gaps onto one node. Fix: the key now folds in
  model, version, and group id; a duplicate-category test asserts two distinct nodes.
- **FINDING 5 — MEDIUM (closed): evidence mis-linkage.** The report-wide evidence fallback fanned every citation to
  every group, cross-linking a co-reported (possibly SUD) gap's evidence. Fix: the fallback fires ONLY for a
  single-group report; multi-group reports without `ra-groupReference` leave evidence unlinked (never guessed).
- **FINDING 6 — LOW (closed): discriminator brittleness.** The `ra-` regex missed the canonical `davinci-ra/`
  namespace. Fix: the discriminator now matches `davinci-ra` and `ra/`.

Re-review by the same agent confirmed both HIGH blockers closed with the consent posture intact (the Evidence node
inherits the envelope's restriction; restriction only ratchets up in both stores).

**Adversarial coverage** (`tests/wpc/codingGapDimension.test.ts`, BOTH backends — pg-mem + Neo4j fake): projection
of the RA fields, V24/V28 non-collision, Evidence-node citation (no Condition minted), the suspected-gap firewall,
Part 2 SUD restriction (incl. zero-padded HCC055), duplicate-category non-collision, ungoverned-value quarantine,
non-RA MeasureReport by-design non-projection, PHI-minimal node, and version-aware fail-closed SUD detection. E14:
the adapter is reached via routing and the spec via the registry — both WIRED (not orphans).

## 2026-09-02 — WPC FHIR-Subscription streaming ingest (worked example)

**Context:** the 5-patient load path is BATCH only — a FHIR transaction bundle through `ingestBundle`
(`src/lib/runtime/ingestBundle.ts`). The platform already declares a STREAM lane (`ArrivalMode =
'batch'|'stream'|'micro-batch'`; the HL7v2 `adtEncounter` adapter is `arrivalMode:'stream'`) and an
adapter's `arrivalMode` already flows to the outbox event's lane `class` via `laneClass` in
`src/lib/pipeline/load.ts` (`toIntentInput` sets `class: laneClass(mode)`). The missing piece was a
FHIR R4 **Subscription** front door that ingests ONE resource (not a bundle) in real time. This change
builds it as additive runtime/driver work. NO `WpcDomain` and NO mapping spec were added —
`MAPPING_SPECS.length` stays **22** (`tests/pipeline/domainRecordCount.test.ts` still 22/22).

**Rides the existing transform/outbox/graph path.** The new driver `src/lib/runtime/ingestStreamEvent.ts`
routes the single resource with the SAME `route()` (`ingestRouting.ts`), builds a single-entry collection
bundle `{resourceType:'Bundle',type:'collection',entry:[{resource}]}`, and runs the owning adapter through
the REAL `runPipeline` into the SHARED outbox, then drains to the graph with `runProjectionOnce` — reusing
`defaultPipelineDeps`, `makeDevOutboxDeps`, `OutboxWriter` and the `IngestStores` shape exactly as
`ingestBundle` does. `ingestBundle`'s behavior is unchanged (the stream driver only imports its `IngestStores`
type).

**Stream lane via `arrivalMode:'stream'` → event `class:'stream'`.** The FHIR-JSON domain adapters are
shared with the batch path and declare `arrivalMode:'batch'`. A tiny helper `asStreamAdapter(adapter)`
returns a shallow copy `{ ...adapter, arrivalMode:'stream' }` (the shared adapter is NEVER mutated), so the
SAME parse/validate/normalize/segmentation logic runs but `runPipeline` reads `arrivalMode:'stream'` and
`toIntentInput` stamps the outbox event `class:'stream'`. Proven in the suite by reading the shared outbox
(`outbox.all()`): the streamed Observation's intent carries `envelope.class === 'stream'` while dorothy's
batch-loaded intents all carry `'batch'`.

**Consolidates onto the same member via the shared xref — and NEVER mints blind (identity-safety gate).**
Identity resolves through the SAME `createXrefEmpiResolver(stores.xref, src)` seam with the SAME `idScope`
(= sourceSystem) the batch driver seeds, so a streamed event for a patient already batch-loaded resolves to
the EXISTING member — no new member is minted (asserted by an unchanged `Member` node count). Because a single
streamed resource carries only a subject REFERENCE (a bare id token, no demographics), the driver adds a
PRE-RESOLUTION GATE before running the pipeline: it computes the subject token the SAME way the adapters do
(`subject`/`beneficiary`/`patient` `.reference.split('/').pop()`) and looks it up in the shared xref under
`scopeKey(scope, token)`. `linked` → consolidate; `unlinked` WITH an operator-confirmed `expectedMemberId` →
seed the xref link, then consolidate; `unlinked` without confirmation, or `ambiguous`, → HELD (never a blind
mint). Idempotency holds: streaming the same Observation twice yields exactly ONE node (deterministic
`fhirResourceId` PUT + per-member checkpoint).

**Balance-control on every path.** Every event — admitted, unrouted, or held — emits ONE PHI-safe
`LoadReconciliationRecord` (`buildLoadReconciliationRecord`, `countIn:1`, resource-granular census that always
sums to 1) and appends it when a `reconciliation` store is wired, so no stream event is silently dropped. A held
event also persists a `held-identity` dead-letter (sourceRef = token, PHI-safe) when a `deadLetter` store is
wired — the same durable audit posture the batch lane has.

**Adversarial red-team (tree-of-thought; three findings, all closed before delivery).** The panel attacked the
worked example against the batch path's own safety posture:

- **FINDING 1 — HIGH (closed): a stream event for an unknown subject silently minted a phantom member.** The
  id-only EMPI path mints for any token it has never seen; a single streamed resource carries no demographics,
  so an unknown subject would fail OPEN to a mint — exactly the blind mint the batch driver refuses (it holds a
  no-Patient / possible-match bundle). The first cut even enshrined the mint as correct in a test. Fix: the
  pre-resolution gate above HOLDS an `unlinked`/`ambiguous` subject (first-class `held:true` + `heldReason`,
  nothing minted or projected) unless the caller passes an operator-confirmed `expectedMemberId`; the test now
  asserts the unknown subject HOLDS and mints no member.
- **FINDING 2 — MEDIUM (closed): the stream lane left no reconciliation trace.** The batch lane emits an ABC
  record per load; the stream lane emitted none, and unrouted/held events left no durable trace. Fix: every path
  emits and (when wired) appends a balanced `LoadReconciliationRecord`, and a held event also persists a
  `held-identity` dead-letter; both are asserted on both backends.
- **FINDING 3 — LOW (closed): held was not a first-class result and the `HeldIdentityError` catch was dead
  code.** `StreamEventResult` had no `held` flag and the post-pipeline `HeldIdentityError` catch could not fire
  (id-only resolution never throws). Fix: `held`/`heldReason`/`reconciliation` are first-class result fields; the
  gate is the primary hold mechanism and the pipeline catch is retained, honestly documented, as a defense-in-depth
  backstop for a future demographics-based adapter hold.

**Adversarial coverage** (`tests/wpc/streamEvent.test.ts`, BOTH backends — pg-mem + Neo4j fake): same-member
consolidation, real stream-lane `class`, labs-vitals projection, unroutable `Basic` (unrouted + balanced ABC
record, nothing projected, no crash), unknown subject HELD (no blind mint), operator-confirmed `expectedMemberId`
consolidation, wired-store durable trace (held-identity dead-letter + balanced reconciliation), and double-stream
idempotency. E14: the driver is an unwired module like the other runtime drivers and is listed in
`wiring-baseline.json`'s `orphans`.

## 2026-09-02 — WPC remediation/reprocessing + audit-balance-control (ABC) ledger

**Context:** the fan-out ingest driver (`src/lib/runtime/ingestBundle.ts`) surfaced quarantines and identity
holds in its result object but (a) did not persist them to the durable append-only dead-letter ledger by default,
(b) emitted no consolidated per-load reconciliation record, and (c) had no path to bring a held/quarantined record
back into the graph once coded. This change builds all three as runtime/driver work. NO `WpcDomain` and NO mapping
spec were added — `MAPPING_SPECS.length` stays **22** (`tests/pipeline/domainRecordCount.test.ts` still 22/22).

**Durable hold persistence wired into the driver.** `IngestStores` gained two OPTIONAL durable stores —
`deadLetter?: DeadLetterStore` and `reconciliation?: ReconciliationStore` (optional so every existing caller/test
keeps working). When `deadLetter` is present the driver passes it into every `runPipeline` call (replacing the old
`options.deadLetterStore ?? null`), so quarantines + held-identity records persist immutably; and the WHOLE-BUNDLE
identity hold (the possible-match early-return path) is now itself persisted as a `held-identity` dead-letter record
(memberRef = source handle, reasonCode = `pre.reasonCode`, sourceRef = patient token, payloadRef = `bundle:${scope}`)
so a held bundle never vanishes from the audit trail.

**The ABC artifact — `LoadReconciliationRecord`.** A new leaf module `src/lib/runtime/reconciliation.ts` defines the
PHI-safe per-load record (counts, refs, ids only — never names/narrative), an in-memory append-only
`ReconciliationStore` (`append`/`list`/`get`, filter by memberRef/kind), and the deterministic-loadId record builder
(reusing the exported `stableHash` from `deadLetter/types.ts`, no new hash). The driver returns the record on
`IngestBundleResult.reconciliation` and appends it when a store is wired. `balanced` is the balance-control proof:
for a non-held load `admitted + quarantined + nonProjected === countIn`; a held bundle is trivially balanced.

**The remediation round trip (coded → reprocess → resolve hold).** New `src/lib/runtime/remediation.ts` exports
`remediateAndReprocess(correctedBundle, opts, stores)`: it runs a steward-staged corrected mini-bundle (member's
Patient + the now-coded resource) back through `ingestBundle` into the SAME graph+xref (M3 consolidation → same
member, no duplicate), and on CONSERVATIVE success (admitted > 0, ZERO residual quarantine, not held) resolves the
hold via `deadLetter.resolve(holdId, 'retry', actor)` (immutable resolved version) and emits a `remediation`
reconciliation record reflecting the delta. A partially-successful remediation (any residual quarantine) does NOT
resolve the hold — it stays open. `registerWpcReprocessLane(stores, provider)` binds the `quarantine` retry lane;
FAIL-CLOSED: if the provider has no staged correction the lane returns `no-remediation-staged` and the record stays
open. Idempotent: re-running re-projects the same node (deterministic idempotent PUT) and re-resolving a terminal
hold is a no-op.

**PHI-safe posture.** The ledgers are refs + codes + counts only; the corrected raw resource is supplied
transiently by the caller (the steward) and is NEVER written to the PHI-safe ledger — honest by construction. The
Alex Kirby end-to-end test (`tests/wpc/remediationReprocess.test.ts`, BOTH backends) asserts the ledgers contain no
`Kirby`/`Alex`/`Diabetes`.

**Adversarial red-team (tree-of-thought; five findings, all closed before delivery).** The panel attacked what the
green suite structurally could not prove:

- **FINDING 1 — HIGH (closed): false / wrong-hold closure.** Hold resolution keyed on a COARSE aggregate
  (`admittedTotal > 0 && quarantined === 0`) and never checked that the SPECIFIC held record was the thing fixed — so
  a valid-but-unrelated correction, or a wrong `holdId`, would stamp a hold `retried` though its resource was never
  remediated. Fix: `remediateAndReprocess` now looks the hold up, takes its `sourceRef` as the target, and resolves
  ONLY when that exact resource is present in the correction AND admitted (not re-quarantined).
- **FINDING 2 — HIGH (closed): silent identity split.** For an identifier-poor member (alex-kirby: MRN + NHS only, no
  medicaidId) the anchor is a MINTED id derived from source+token, so a steward whose corrected bundle drifted on
  `sourceSystem`/`fullUrl` would mint a NEW member, fragment the record, and falsely close the hold. Fix:
  `RemediationOptions.expectedMemberId` is now REQUIRED (the hold's owning member, from the load); remediation REFUSES
  to resolve unless the correction consolidates onto that exact member (`reason: 'member-mismatch'`).
- **FINDING 3 — MEDIUM (closed): loadId collision.** A `load` record and a `remediation` record for the same
  (source, patient, time) shared a deterministic `loadId`, so `get(loadId)` returned the wrong kind. Fix: `kind` is
  folded into the id (prefix + hash), and the remediation record carries its own `remed-${holdId}-…` id.
- **FINDING 4 — MEDIUM (closed): held-bundle balance fiat.** A held bundle set `balanced = true` by fiat while its
  routed resources were unaccounted. Fix: a held bundle now counts ALL resources as non-projected, so `balanced` is
  ALWAYS a genuine conservation check (`admitted + quarantined + nonProjected === countIn`), never a waiver.
- **FINDING 5 — LOW (noted + partially hardened):** the PHI guard checks keys not values and the test was
  case-sensitive; ledger `sourceRef` can embed a lowercased resource-id slug (a PRE-EXISTING dead-letter behavior).
  The reconciliation `loadId` hashes the patient token rather than embedding it; the resource-id-slug hardening (hash
  ids in the dead-letter store) is logged for the backlog as it spans all dead-letter callers.

Findings 1 & 2 are pinned by new regression tests (`member-mismatch` and `target-not-in-correction` both refuse to
resolve, hold stays open). Scope: `ingestBundle.ts` (durable stores + ABC record + held-balance fix), new
`reconciliation.ts` + `remediation.ts`, `remediationReprocess.test.ts`. No invariant/domain changed. Verification
after fixes: `tsc` 0; full suite **2357 passed** / 1 expected-fail / 74 skipped / 0 failed; `check:sizes` pass; 22/22.

## 2026-09-02 — WPC payer dimensions: Coverage/Encounter FHIR adapters + RiskAssessment/Flag projection + referral/goal coding

**Context:** four payer FHIR resource types that had been parked in the non-projected census had to become
first-class PROJECTED knowledge-graph dimensions, and the quarantined referrals/goals had to clear by gaining
governed codes. Coverage and Encounter were HALF-BUILT — `WpcDomain` already carried `'coverage'`/`'encounter'`
and `coverageSpec` (HAS_COVERAGE) / `encounterSpec` (HAD_ENCOUNTER) were already registered, but wired only to the
X12-834 / HL7v2-ADT adapters. RiskAssessment and Flag were genuinely new. Scope of change:
`src/lib/pipeline/adapters/{coverageFhir,encounterFhir,riskAssessment,flag}.ts` (new FHIR-JSON adapters),
`src/lib/graph/mapping/{riskAssessment,flag}.ts` (new specs) + `src/lib/graph/mapping/index.ts`,
`src/lib/pipeline/types.ts` (WpcDomain +2), `src/lib/runtime/ingestRouting.ts` (route() + discriminators EXTRACTED
from `ingestBundle.ts` to stay under the 400-line prod cap), the referral adapter+spec (review-routing flag), the
seed generator + terminology delta, `src/lib/wpc/projectedAggregator*` (four optional sections), and the tests
(`domainRecordCount`, `wpcRecordLoad`, new `payerDimensionsR4`).

**The 20 → 22 invariant.** RiskAssessment and Flag are each a NEW `WpcDomain` + a NEW mapping spec + node kind
(`RiskAssessment`/`Flag`) + edge (`HAS_RISK_ASSESSMENT`/`HAS_FLAG`), so `MAPPING_SPECS.length` and the WpcDomain set
both move 20 → **22** (asserted 22/22 from both ends by `tests/pipeline/domainRecordCount.test.ts`). Coverage and
Encounter add NO spec and NO domain — their new adapters emit `coverage.recorded` / `encounter.recorded` onto the
EXISTING specs — so the count is 22, not 24. This is the tripwire the architect flagged: reusing the half-built
specs is what keeps the count honest.

**42 CFR Part 2 handling.** The Encounter and Flag adapters mirror `behavioralHealth.ts`: when any
Encounter.type/reasonCode or Flag.category/code coding is an ICD-10 SUD code (F10–F19, via the shared
`isSudDiagnosis`), they evaluate `evaluatePart2Basis` and — failing safe on absent program context — attach the
PHI-safe `part2-sud` segmentation hint while leaving `consent.part2Restricted=false` at normalize. The shared
transform maps the hint to the durable `42-CFR-Part-2` label the projector reads off the ENVELOPE, so a SUD-coded
Encounter/Flag projects as a RESTRICTED node — HIDDEN under NO_CONSENT, VISIBLE only under a Part 2 grant, on both
backends (`payerDimensionsR4.test.ts`). RiskAssessment is non-restricted by default and is intentionally kept OUT
of `CODE_CARRYING_DOMAINS` (seed RAF carries no governed HCC coding; requiring governed codes would re-quarantine it).

**PHI-minimal projection.** Coverage projects plan code + status + period only (NEVER subscriberId/memberId — the
beneficiary ref anchors identity and is never persisted). Encounter projects class + trigger code + point-of-care
ref only, never narrative. RiskAssessment projects the predicted-outcome code/text, probability decimal, and the RAF
score parsed to a bare NUMBER by regex (the rationale sentence never reaches the graph), plus the method code. Flag
projects the category coding code + status + period only — NEVER Flag.code.text, which is free-text PHI narrative.
None of these payloads emit a governed `{system,code}` object, so the load-stage semantic gate does not touch them.

**SR-3 review routing.** Every parked referral gained a governed serviceCode (CPT-HCPCS + SNOMED-CT), each of which
was ALSO added to `terminology-seed.json` in the same change so the load-stage semantic gate admits rather than
trading `missing-service-code` for `semantic-unrecognized-code`. Robert's SR-3 (medication-cost / financial-navigation
referral) is deliberately coded with a generic Patient-referral SNOMED code AND flagged for human review: a
`needs-coding-review` FHIR extension (`gravity-sdoh-financial-navigation-code-TBD`) surfaces as
`reviewRequired`/`reviewReason` on the normalized ReferralPayload and the projected ServiceRequest node — visibly
tagged, not silently coded. Goals gained `Goal.description.coding` (they bypass the semantic gate but are coded
honestly). Result: the coded cohort now admits with ZERO quarantine; alex-kirby's genuinely uncoded resources remain
the honest quarantine exception.

**Coalition (architect design → SWE build → adversarial red-team):** first build landed green — `tsc --noEmit` 0;
`vitest run` 2328 passed / 1 expected-fail / 74 skipped, 0 failed; `check-file-sizes.sh` passes (route() extracted
to `ingestRouting.ts`; payer mappers extracted to `projectedAggregator.payerMappers.ts` to hold both source files
under the 400-line cap); 22/22 invariant holds; both graph backends agree.

**Adversarial red-team (tree-of-thought; three findings, all closed):**

- **FINDING 1 — HIGH (closed, 42 CFR Part 2 leak).** Encounter/Flag SUD detection used the ICD-only `isSudDiagnosis`
  (F10–F19), so a SUD encounter/flag coded in **SNOMED CT** (the norm for `Encounter.type`/`reasonCode`/`Flag.code`
  — e.g. SNOMED 191816009 opioid dependence, 7200002 alcoholism) was NOT recognized and projected UNRESTRICTED,
  disclosed under NO_CONSENT. This was the exact residual risk the first build flagged. Fix: a new
  `isSudCoding(code, system)` in `part2Basis.ts` (ICD-10 F10–F19 OR a governed SNOMED SUD concept set), and
  `evaluatePart2Basis` now evaluates SUD content through `isSudCoding` — so the leak is closed centrally (also
  hardening the Condition/behavioral-health path). The Encounter/Flag adapters detect via `isSudCoding`. Pinned by
  `tests/pipeline/payerDimensionsRedteam.test.ts` (SNOMED-SUD encounter/flag → part2 hint; non-SUD SNOMED → none).
- **FINDING 2 — MEDIUM (closed, silent RAF corruption).** The RAF regex required the literal `RAF score <digit>`,
  so common phrasings ("RAF score of 3.42", "RAF: 3.42", locale "3,42") silently yielded `0` or a truncated integer —
  a fabricated low risk score with no quarantine. Fix: a phrasing-tolerant parser (score/weight/of/:/=, comma or dot
  decimal) that returns **`null` (not 0)** when no RAF is present; the spec omits the `rafScore` property on null so
  a phantom 0 never reaches the graph. Pinned with seven phrasing cases + the null-absent cases.
- **FINDING 3 — MEDIUM (closed, silent node collision).** The four payer adapters keyed the node on `resource.id`
  with no fallback while `validate()` never required it, so two id-less resources (a legal transaction-bundle shape
  that references by `fullUrl`) would upsert onto ONE node — silent loss, while reconciliation still balanced. Fix:
  each adapter's `validate()` now requires `resource.id` (`missing-{coverage,encounter,flag,risk-assessment}-id`), so
  an unkeyable resource QUARANTINES (accounted) instead of merging. Pinned for all four kinds.
- **FINDING 4 — LOW (closed).** Stale `ingestBundle.ts` routing docstring still listed Coverage/Encounter/Flag/
  RiskAssessment as non-projected; corrected to match `ingestRouting.ts`.

**Verification after fixes:** `tsc --noEmit` 0; `vitest run` **2348 passed** / 1 expected-fail / 74 skipped, 0 failed;
`check:sizes` passes; 22/22 invariant intact; both backends agree. Remaining documented limitation (backlog, not a
blocker): SUD content coded ONLY in `Flag.code.text` free-text is deliberately not read (PHI-minimal — the narrative
never reaches the node), and the SNOMED SUD set is a curated starter list to be bound to a governed SNOMED SUD refset
in production; the same SNOMED-SUD hardening now also benefits the Condition path via the shared `isSudCoding`.

## 2026-09-02 — WPC record-load: SDOH/BH observation routing · fan-out ingest driver · M3 identity (R3)

**Context:** the whole-person load path had to route ONE FHIR bundle (labs + SDOH screenings + BH surveys +
conditions + meds + referrals + care-team) into the projected graph, giving the social and behavioral data
**their own semantics** (Gravity/AHC-HRSN LOINC panels → SDOH domain + ICD-10 Z-code; PHQ-9/AUDIT-C surveys as
SIGNALS, not diagnoses) without inventing a new mapping spec or `WpcDomain` (the `domainRecordCount` tripwire:
`MAPPING_SPECS.length === 20`). Scope of change: `src/lib/pipeline/adapters/{lab,sdohObservation,bhObservation}.ts`,
`src/lib/graph/mapping/behavioralHealth.ts`, `src/lib/runtime/ingestBundle.ts` (new fan-out driver), the seed
bundles + terminology delta, and `tests/wpc/wpcRecordLoad.test.ts` (adversarial, both graph backends) +
`tests/pipeline/sdohClassifierR3.test.ts`.

**Coalition (architect design → SWE build → adversarial red-team):**

- **R3 — one Observation stream, three owners (by category, not guesswork).** The lab adapter now owns
  `laboratory` + `vital-signs` only; a NEW `sdohObservation` adapter owns `social-history` and emits
  `sdoh.screening.recorded` (claimed by the EXISTING `sdohSpec`, `sdoh.` prefix → SdohScreening/SocialNeed +
  Z-code); a NEW `bhObservation` adapter owns `survey` and emits `behavioral-health.observation-recorded`
  (claimed by `behavioralHealthSpec` → a `BehavioralHealthObservation` node via `HAS_BH_OBSERVATION`, DISTINCT
  from the Condition/diagnosis path — a score is never a diagnosis). No new spec, no new domain: 20/20 holds.
- **Fan-out ingest driver (`ingestBundle`).** Routes each bundle entry to its owning adapter, runs every group
  through the REAL five-stage `runPipeline` into a shared outbox, then drains to the projected graph. Every
  resource lands in exactly one census bucket (admitted / quarantined / non-projected) — conservation asserted.
- **M3 identity wiring.** The bundle's Patient is pre-resolved ONCE (name/dob + a GLOBAL medicaidId + a
  SOURCE-SCOPED `localId` = {assigningAuthority: sourceSystem, value: MRN}); a possible-match band HOLDS the
  whole bundle (no wrong-person auto-link). One person's records consolidate to one member; a raw subject id or
  MRN reused across DIFFERENT sources cannot cross-link (id namespaced by source; localId is same-source-exact).
  This is the end-to-end population of the R2-B source-scoping that the prior wave left unexercised (its M3 note).

**Adversarial red-team (tree-of-thought; three findings, all closed):**

- **FINDING 1 — HIGH (closed).** The SDOH free-text positive classifier trailed a `\b` on the stems
  `insecur` / `instab` / `homeless`, so every INFLECTED form ("food insecurity", "housing instability",
  "homelessness") failed to match and silently classified NEGATIVE — hiding a real unmet need (fail-UNsafe: the
  dangerous direction). Since the seed screenings carry no coded interpretation, the classifier was load-bearing.
  Fix: a deterministic, PHI-safe, negation-AWARE classifier with a fail-safe precedence — negated-problem
  ("no food insecurity") → negative; negated-resource ("no stable housing") → positive; affirmative barrier stem
  (prefix-matched, so inflections match) → positive; else clear-screen → negative. Verified against ALL 30 real
  seed strings + adversarial inflections and negation traps (incl. multi-clause "unstable housing, otherwise
  stable mood" → positive: a barrier stem is never silenced by a stray later clear-word). Pinned by
  `tests/pipeline/sdohClassifierR3.test.ts`.
- **FINDING 2 — MEDIUM (closed).** An Observation matching none of lab/vital/social-history/survey was dropped
  into a generic `Observation` non-projection count — so a real clinical Observation that failed to route was
  indistinguishable from an intended care-gap overlay and could vanish into the "by design" census. Fix: the
  driver now recognizes care-gap Observations explicitly (`isCareGap`) and counts them under `Observation:care-gap`,
  while ANY other unroutable Observation lands under a loud, distinct `Observation:unrouted` bucket a monitor
  asserts is zero for well-formed input. No clinical routing changed; the census is now honest.
- **FINDING 3 — LOW (closed).** The SDOH coded-interpretation reader treated lab range flags `H` / `HH` as a
  SDOH-positive finding. Removed: `H`/`HH` are laboratory flags, not a social-need signal; SDOH positives are
  `POS` / `A` / `AA` only.

**Verification / DoD:** `tsc --noEmit` 0; full suite **2317 passing** (+1 expected-fail, 74 skipped — the only
skips are the Docker testcontainer integration files); **20/20 C9 domain count intact** (`domainRecordCount`);
both graph backends (pg-mem + Neo4j fake) agree on routing, holistic context, EMPI consolidation/no-merge, and
Part 2 restriction. Every red-team finding is closed and pinned by an adversarial assertion.

## 2026-09-02 — WPC FHIR→knowledge-graph ingestion hardening (R1 Part 2 segmentation · R2-B source-scoped identity + PIX/PDQ)

**Context:** loading whole-person FHIR R4 records through the existing ingestion pipeline into the knowledge
graph surfaced two core-safety defects (found by the coalition's spike + red-team, not by the green suite).
Scope of change: `src/lib/pipeline/adapters/{conditions,behavioralHealth}.ts`, `src/lib/identity/{mpiTypes,
matchEngine,empiResolver}.ts`, `src/lib/identity/external/*` (PIX/PDQ), `src/lib/pipeline/types.ts`, and the
associated identity/pipeline tests (incl. retargeted `tests/scenario/corpus_A_identity.test.ts`,
`tests/property/matchEngine.property.test.ts`).

**Coalition (architect design → SWE build → two adversarial red-team rounds):**

- **R1 — 42 CFR Part 2 segmentation integrity.** The `conditions` and `behavioralHealth` adapters both claimed
  `Condition`, so an F-coded (SUD/BH) Condition was double-owned and its `restricted` flag was projection-order
  dependent — a last-writer clear could disclose Part 2 data. Fix: both adapters now resolve the ICD-10 F-code
  **by system in ANY coding position** (`icd10FCoding`) and partition ownership exactly-one-owner (conditions
  skips F-coded; behavioralHealth skips coded-but-non-F; both keep coding-less → quarantined by both).
  - **Red-team R1-1 (closed):** a SNOMED-first / F-second dual-coded SUD Condition was silently dropped by BOTH
    (behavioralHealth read `coding[0]`). Fixed by by-system resolution + an adversarial fixture.
  - **Red-team H1 (closed, CRITICAL):** a dual-diagnosis with a NON-SUD F-code first + a SUD F-code second ran
    the Part 2 basis on the non-SUD code → disclosed. Fixed: the basis is evaluated over the SUD coding in ANY
    position (`icd10SudCoding`), never the display code. Fixture added (`conditionOwnershipR1.test.ts`).

- **R2-B — source-scoped enterprise identity (PHI-comingling fix) + PIX/PDQ external EMPI.** An MRN (source-
  LOCAL) was being used as a global deterministic key → two different people sharing an MRN across sources could
  false-merge. Fix (owner chose Option B): added `ScopedIdentifier`/`localId`; a new deterministic rule
  `localId-same-source-exact` (equal value AND equal assigning authority only); **demoted `name+dob-exact` out
  of the deterministic set** (identical name+dob now HOLDS for review, never auto-merges); `canonicalPersonKey`
  precedence global-id → same-authority local-id → name → record, with the assigning authority embedded in the
  anchor key. The IHE **PIX/PDQ** external-EMPI seam was completed on the existing `external/*` machinery
  (`setProductionPixPdqConfig`, `assigningAuthorityToScope`, gated by dataMode=production + external-pixpdq +
  config+transport; **fail-closed when unconfigured, zero network in tests**).
  - **Red-team L1 (closed):** naive `:`-delimited keys allowed a URI/OID authority to collide two distinct
    component-pairs → false merge. Fixed by escaping the delimiter inside every key component (`escKey`).
  - **Documented trades (accepted, not defects):** M1 — HCC risk-adjustment relevance is not carried on the
    behavioral-health path (no HCC codings in the seed; follow-up if BH HCC is needed). M2 — demoting name+dob
    HELDs demographics-thin EMR-only feeds; this is the deliberate Option-B safety trade (comingling > holding)
    and must be a conscious rollout decision. M3 — the source-scoping is exercised by unit tests but not yet
    populated by production adapters (`idScope`/`localId`); it is wired end-to-end in the fan-out ingest driver
    (subsequent WPC wave), which pre-resolves demographics and seeds the per-authority xref.

**Verification / DoD:** `tsc --noEmit` 0; full suite **2263 passing** (+1 expected-fail, 74 skipped; the only
skips are the Docker testcontainer integration files); **20/20 C9 domain count intact**; `empiResolver.ts`
309 < 400 line ceiling. Every red-team CRITICAL/HIGH finding (R1-1, H1, R2-1 MRN-as-global, L1) is closed and
pinned by an adversarial assertion.

## 2026-08-30 — Review-screen UX redesign (layout · research drawer · submit affordance)

**Owner feedback (from live browser use):** the Policy Encoding Review screen had three connected problems
— (1) rows rendered the full CPT descriptor inline with the controls pinned right, so the PAGE scrolled
sideways and the code + controls couldn't be seen together; (2) no way to RESEARCH a code ("just listed with
a bunch of others"); (3) the Submit button looked stuck (disabled until a small checkbox below ~45 rows).
Plus a doubled-code display ("43644 — 43644 —").

**Coalition (UI-architect design → SWE build → adversarial red-team):**
- **Root-caused the horizontal scroll** to a missing `min-w-0` on the workbench's `1fr` grid column
  (`PolicyDtrWorkbench.tsx`): a grid item defaults to `min-width:auto` and won't shrink below its content,
  so a truncating descriptor forced the page wider. Added `min-w-0`; controls are now `shrink-0`; the AI row
  uses `flex-wrap` so on the narrowest widths controls wrap under the descriptor instead of overflowing.
- **Per-code research drawer** (`EncodingReviewCodeDrawer.tsx`, NEW): the descriptor is an accessible
  disclosure (`aria-expanded`/`aria-controls`, `role=region`) that opens the full descriptor, the byte-anchored
  source excerpt (provenance), the plain-English section-of-origin (WHY it defaulted to Covered·PA — payer-
  agnostic), system/code/confidence, and an "Explain <code> in the assistant" button that seeds the Encoding
  Assistant (unidirectional prop + nonce, latest-`ask` ref → no re-fire loop). Threaded `source` (from
  `review.provenance`) + `sourceSection` (from `GuidelineCode`) into the procedure `ReviewElement`
  (`fromPolicyReview.ts`, `encodingReview.ts`). The AI-decided row is extracted to `EncodingReviewAiRow.tsx`.
- **Sticky action bar**: the footer is now `sticky bottom-0` with the acknowledgement checkbox moved in beside
  the real blocker ("1 step left: …") and the submit button — always visible. The gate logic
  (`submitReadiness`/`canSubmit`/fail-closed disable) is UNCHANGED; only the affordance moved.
- **Doubled-code fix** + shared pure helpers (`reviewRowText.ts`, NEW: `codeDescriptor` prints the code once,
  `ORIGIN_TEXT`) — DRY across the AI row, drawer, and needs-review row.

**Red-team cleared:** disposition `<select>` moved verbatim (value/onChange/aria/classes identical) — CRD
wiring intact; submit gate behavior unchanged (drawer is read-only, can't satisfy it); overflow fix is at the
shared grid item (all breakpoints) with no `overflow-x-clip` band-aid; disclosure is a real `<button>`, never
a row wrapping the interactive controls (no nested-interactive a11y break); assistant-seed effect depends only
on the nonce with an `askRef`, so message updates can't re-enter it; every file < 400 (panel 304, row 232,
new files 124/86/20, workbench 388, assistant 291). Note: the src components use `jsx:preserve`, which the
vitest transform can't import, so the row LOGIC is unit-tested (`reviewRowText.test.ts`: dedup, origin, the
provenance+section data threading) and the two render shells are E13-baselined; render behavior is verified in
the browser. Full suite green (2153, 0 fail); tsc/lint/sizes/E13/E14 clean.

## 2026-08-30 — PAS authoring bridge (the third artifact: CRD → DTR → PAS)

**Gap (owner close-out map, Tier 3):** the engine authored CRD + DTR but had NO PAS output — the third leg
of the chain the owner named. Architect trace found a RUNTIME PAS builder already exists
(`src/lib/pa/pasBundle.ts`, driven by a live PatientContext, using a loose `Record<string,unknown>` shape);
the authoring side needs its own preview/assembly that SHARES the FHIR types, not a third parallel shape.

**Change (architect design → SWE build → adversarial red-team-in-design):**
- New shared FHIR types `src/lib/fhir/pasTypes.ts` (`FhirClaim`, `FhirOrganization`, supporting) re-exported
  from `types.ts` (the `dtrPackageTypes` precedent), so authoring + runtime PAS can converge on one shape.
- New `src/lib/policy/pas/{types,specimenResponse,pasRequest}.ts` — the pure, deterministic builder
  `buildPasRequest(input)` over a discriminated union: `mode:'response'` (a real completed
  QuestionnaireResponse + patientRef) or `mode:'specimen'` (authored items → a SPECIMEN response via the
  real `buildQuestionnaireResponse` with EMPTY answers, so nothing clinical is fabricated and
  `missingForSubmission` lists what a real 278 would need). Assembles a self-contained Claim
  (use=preauthorization) + Patient + Coverage + Organization + Practitioner + QuestionnaireResponse Bundle;
  only PRIOR-AUTH-REQUIRED codes become `Claim.item` (never request preauth for a not-covered code); the
  davinci-pas profile is stamped ONLY in response mode (a specimen is `synthesized`/`conformanceAsserted:false`).
- New `PasPreviewPanel.tsx` + a third "Prior auth" tab in `GenerateArtifactsStage` (CRD | DTR | PAS), with an
  honest "specimen preview — not a conformance-tested submission" banner and a collapsible FHIR JSON view.

**Scope boundary (stated honestly):** authoring PREVIEW/assembly only — NO live X12-278 EDI transmission to a
clearinghouse (needs infra the payer controls). Shares TYPES with the runtime submission builder, not its code path.

**Verification:** pure/deterministic (injected `now`, derived ids — byte-identical output test); no fabricated
clinical data (specimen answers all unset; specimen Patient carries a `urn:rhtp:pas:specimen` identifier, never
a member id); not-covered/investigational codes excluded from the Claim. Full suite green (2140, 0 fail);
tsc/lint/sizes/E13/E14 clean; all files < cap (pasRequest 130, PasPreviewPanel 128, types.ts 366). New tests
`pasRequest.test.ts` (builder + specimen + response + determinism).

## 2026-08-30 — Code-table (Requirements By Product) path CRD parity

**Gap (owner close-out map, Tier 2):** the code-table path (product → procedure → code, e.g. Horizon)
emitted NO CRD coverage rules — its Generate stage was empty of coverage, and it had no coverage
disposition, so it was second-class vs the criteria path. (The related "NMN → not-covered rule" item was
already satisfied for the criteria path by the section-disposition work.)

**Change:** new `crd/codeTableCoverage.ts` builds CRD coverage rules for a code-table policy — every
enumerated code IS, by the table's own construction, a prior-authorization-REQUIRED covered procedure, so
each becomes a `covered · PA` rule (deduped across products) with a `covered-pa` default disposition. Wired
into the `code-table` branch of `processPolicyDocument`, which now returns `coverageRules` +
`questionnaireCanonical` + `dispositions` just like the criteria branch — so the maker's overrides reach
the published CRD via the SAME `projectCoverageRules` path (no parallel pipeline). Payer-agnostic (keys off
table structure); pure/deterministic. Horizon now yields 15 covered·PA rules (was 0).

**Verification:** full suite green (2135, 0 fail); tsc/lint/sizes/E13/E14 clean; `codeTableCoverage.ts` 44
lines, `policyReview.ts` 282 (< cap). New test `codeTableCoverage.test.ts` (unit dedup + real-Horizon
end-to-end). Note: the per-code disposition-OVERRIDE control in the code-table review UI
(`CodeTableReviewStage`) is a smaller follow-on — the confidence-flag review already covers code
correctness, and `covered · PA` is the correct default for a PA-requirements table.

## 2026-08-30 — Discrete documentation items + recover the silently-dropped BMI-band threshold

**Defect (owner, from the live workbench):** (1) all documentation evidence drained into ONE catch-all
"Attach clinical documentation" upload — the low-value pattern DTR exists to replace; (2) architect trace
found the comorbidity band ("BMI ≥ 35 WITH a qualifying comorbidity") had its `kind` overwritten
measure→choice in `encodeNode`, SILENTLY DROPPING the BMI ≥ 35 threshold from both the questionnaire and
evaluation — so "BMI 36 + a comorbidity" could not be distinguished from "BMI 36 alone".

**Coalition (architect design → SWE build → adversarial pass, tree-of-thought at each fork):**
1. **Discrete documentation items (payer-agnostic).** New `encode/documentation.ts` classifies a RESIDUAL
   attestation leaf that asks for evidence of a completed activity (generic cues: documentation/evaluation/
   clearance/education/treatment plan/attestation/… + a documentation-heading context), strictly AFTER
   measure/choice classification so an eligibility threshold or enumeration is never softened. Such a
   criterion (`kind:'documentation'`, new) emits a discrete item set via `fhir.ts docItems`: an attestation
   boolean (which STILL gates — it stays a BoolExpr leaf), its OWN targeted attachment gated on the
   attestation, and an optional typed datum — a completion `date`, an evaluating-provider `string`, or a
   named-complication `open-choice` built from the criterion's own tokens (obstruction/stricture/GERD/other).
   The generic catch-all in `engineQuestionnaireItems.ts` is now appended ONLY as a fallback (no discrete
   attachment present), so a policy with documentation criteria no longer forces a manual-review PDF dump; a
   policy without them is unchanged. Elevance CG-SURG-83 now yields 8 discrete evidence attachments, catch-all
   suppressed.
2. **Recover the BMI-band threshold.** `encodeNode`'s choice branch, when the node ALSO carries a measure,
   now KEEPS the measure and attaches the enumeration as a distinct CHILD choice (`${id}.comorbidity`) instead
   of overwriting kind. `fhir.ts critItems` renders a measure node's children (so BMI ≥ 35 AND the comorbidity
   choice both surface — distinct linkIds), and `evaluate.ts evalCriterion` requires them together (three-
   valued AND: BMI 36 + comorbidity → met; BMI 36 alone / comorbidity unanswered → unknown; comorbidity
   answered none → not-met; BMI 34 → not-met). Elevance now surfaces BOTH BMI thresholds (was 1).

**Scope boundary (stated honestly):** the fuller "BMI≥40 OR (BMI≥35 AND comorbidity)" *pathway-level* OR
auto-adjudication (leaf-replacement `crit.logic` + `groupExpr` expansion) was DESIGNED but deferred — it
depends on fragile one-of-N heading detection and would broaden the evaluation blast radius across every
nested-parent policy; deferred to its own batch rather than destabilize the heavily-tested engine now. The
shipped fix recovers the dropped threshold as a real, evaluable item (the visible defect), which is the safe,
contained correction.

**Red-team / verification:** documentation classification runs only on the residual-attestation case
(threshold/enumeration never reclassified); attestation booleans remain gating leaves (made more evaluable,
never dropped); measure-with-children is a NEW eval case (no existing measure node has children), so no
existing policy's evaluation changes; distinct linkIds avoid FHIR collisions; payer-agnostic (generic cues +
structure only). Full suite green (2125 tests, 0 fail); tsc + lint clean; sizes/E13/E14/E11 green; encode.ts
342, fhir.ts 342, evaluate.ts 362 (< cap). New tests: `documentationItems`, `comorbidityBmiGate`.

## 2026-08-30 — Reconnect review decisions into the generated CRD + section-inferred coverage defaults

**Defect (owner, from the live workbench):** at the Generate stage every harvested code showed CRD
`pending-review`, no matter what the human decided. Root cause (architect trace): `engineCoverageRulesForReview`
built each `ProcedureRule` with the coverage code OMITTED (honest "don't fabricate covered"), so every code fell
to role `referenced` → `pending-review`; and the two-list review + sign-off collected decisions that NEVER
re-flowed into the rules `GenerateArtifactsStage` renders (`review.coverageRules`, frozen at ingest). The
review was cosmetic w.r.t. published output.

**Coalition (architect design → SWE build → adversarial red-team, tree-of-thought at each fork):**
1. **Section-inferred defaults (payer-agnostic).** Codes are now tagged at harvest with the STRUCTURE they came
   from — `criteria.ts`/`criteriaCodes.ts` set `GuidelineCode.sourceSection` (`coding-appendix` |
   `requirements-table` | `inline-prose`, stronger-signal-wins on dedupe). `review/codeDisposition.ts`
   (`defaultDispositions`) infers a DEFAULT coverage disposition from the section + the not-medically-necessary
   statements (reusing `codeRouting.excludingStatement` + `classifyBasis`, now exported): a code in the policy's
   own code table → `covered-pa`; named in an investigational/NMN statement → `investigational`/`not-covered`;
   a bare prose mention → `pending`. NEVER `covered-pa` without a code-table tag. Keys off structure, never a
   payer name.
2. **One shared disposition truth table.** `crd/coverageDisposition.ts` (NEW) maps a `CodeDisposition` onto (a)
   the engine's ProcedureRule input (`dispositionToInput` — the engine stays the single coverage brain), and (b)
   the client projection (`applyDisposition`, idempotent). `coverageInfoFor` MOVED here (verbatim) so ingest and
   the client cannot drift. `engineCoverageRulesForReview` now accepts `dispositions` and seeds them from the
   defaults at ingest (`policyReview.ts`), so the 27-code Elevance case now arrives `covered · PA` instead of 27
   uniform pending-review. A not-covered/investigational code no longer re-attaches the DTR canonical the engine
   withheld (`wantsPathway` fix).
3. **Human overrides reach Generate.** `EncodingReviewPanel` renders a per-code coverage-disposition select
   (both the needs-review and AI-decided lists); `PolicyDtrWorkbench` holds the `dispositions` map (seeded from
   `review.dispositions`) and projects `review.coverageRules` through `workbench/generateInputs.projectCoverageRules`
   at the Generate stage — so the published CRD reflects the maker's decisions, not the frozen snapshot. The
   assistant dock was extracted to `workbench/AssistantDock.tsx` to keep the workbench under the size cap.

**Red-team cleared:** double-application (applyDisposition idempotent — fixed-point test); payer-agnostic
(defaults key only on structural section + generic negation matcher; test asserts no `covered-pa` without a
table tag); tsc narrowing (coverageInfoFor moved verbatim; disposition switches exhaustive with `never`;
sourceSection/props additive-optional so all call sites compile); size caps (new logic in new files; workbench
391→377 via extraction, panel 326, both < 400); fail-closed sign-off gate untouched (dispositions change WHAT
generates, never WHETHER). Projecting with the defaults reproduces the ingest rules byte-for-byte (consistency
verified). Full suite green (2119 tests, 0 fail); tsc + lint clean; E13/E14/E11/sizes green. New tests:
`coverageDisposition`, `codeDisposition`, `generateInputs`.

---

## 2026-08-29 — CRD honest coverage (general): no fake "Covered" + coded coverage-info

**Scope (core-logic paths):** `src/lib/policy/encode/ir.ts` (`ProcedureRule.coverageCode` now OPTIONAL — omitted = undetermined), `src/lib/policy/crd/engineCoverageRules.ts` (drop fabricated pre-review `coverageCode:'covered'`; add `coverageInfoFor`), `src/lib/policy/crd/coverageRule.ts` (`CoverageRule.coverageInfo` field). UI: `src/components/policy/workbench/GenerateArtifactsStage.tsx` (render `referenced` honestly + coverage-info pills). Test: `engineCoverageRules.test.ts` (re-pinned to the honest behavior).

**Problem:** the CRD table labelled EVERY code green "Covered" — a fabricated pre-review default (`coverageCode:'covered'`) indistinguishable from a real determination. Asserting coverage the policy/coding-map has not made.

**Design (GENERAL — not per-policy):** coverage is UNDETERMINED pre-review, so the code carries no `coverageCode`; the engine yields an honest `referenced` role with PA-required, and a Da Vinci `coverage-information` coding of `pending-review` (never `covered`). Real determinations (covered / not-covered / investigational / conditional) map to their proper coverage-info codings. Applies to every policy in the corpus; Horizon shows honest "Referenced — pending review", a policy with real determinations shows them. INVARIANT: never fabricate `covered`.

**Adversarial:** making `coverageCode` optional is safe — every use is a `===`/`!==` compare (undefined-safe) and the only `switch` has a `default → referenced`; full suite confirms. Per the payer's steer, this is a corpus-general fix, not a Horizon curation — to be validated on a cleaner (non-OCR) corpus policy next.

**Result:** mirror gate green — 377 tests, prettier + size ratchet clean. Delivered to device.

---

## 2026-08-29 — Production increment: LOINC-coded DTR items end-to-end

**Scope (core-logic paths):** `src/lib/policy/encode/fhir.ts` (MEASURE_LOINC map + `FhirItem.code`; attach coding in `measureItem`/`measureItemsMulti`), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (`fhirItemsToDefs` carries `code` + `answerOption` coding). Model: `src/lib/dtr/questionnaireResponse.ts` (`QuestionnaireItemDef.code` + `answerValueSet`; `QuestionnaireAnswerOption.coding`). UI: `src/components/dtr/QuestionnaireRenderer.tsx` (renders code + answerValueSet badges). Test: `tests/policy/measureCoding.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change adding terminology bindings to generated FHIR. Coalition required.

**Design (first production increment of the conformance work):** the engine's typed measures now carry their standard LOINC concept (BMI 39156-5, age 30525-0, systolic/diastolic BP, weight, height, HbA1c, glucose, eGFR, lipids, LVEF); the translation stops dropping `valueCoding.system`; the item model gained `code`/`answerValueSet`; the renderer shows the codes. INVARIANT: a field is coded only when a well-established LOINC concept exists — unmapped fields stay uncoded (never fabricated). Reuses the whole existing pipeline (engine → fhirItemsToDefs → renderer), no parallel generator.

**Adversarial:** LOINC map is a curated, well-known concept set (not runtime-invented). Choice `answerValueSet` binding + CRD `coverage-info` per code remain follow-ups; the OCR criteria-quality problem (run-on/duplicated criteria in the scanned bariatric doc) is a separate extraction concern not addressed here — coding a garbled criterion still leaves garbled text, so extraction cleanup is tracked as the next dependency.

**Result:** mirror gate green — 377 tests (374 + 3), prettier + size ratchet clean. Delivered to device. Proven target: `/policy-engine/conformance-demo` (the fully-conformant slice).

---

## 2026-08-29 — Da Vinci CONFORMANCE SLICE (CPT 43775): coded CRD + value-set-bound DTR

**Scope (core-logic paths):** `src/lib/policy/dtr/conformance/valueSets.ts` (new — curated FHIR terminology), `src/lib/policy/dtr/conformance/bariatricSlice.ts` (new — CRD coverage-info card + DTR R4 Questionnaire builder). UI: `src/app/(reviewer)/policy-engine/conformance-demo/page.tsx` (browser-testable demo route). Test: `tests/policy/bariatricConformanceSlice.test.ts`.

**Trigger:** new modules under `src/lib/policy/**` producing a coverage/medical-necessity artifact. Coalition required.

**Why:** the running engine produces prose, not coded FHIR — no `answerValueSet`, no ICD-10/LOINC/SNOMED/CPT `Coding`, no CRD `coverage-info`. User (correctly, per the Da Vinci CRD/DTR IG examples) required coded, value-set-bound artifacts. This is the agreed ONE-code vertical to prove the process before scaling.

**Design:** a payer authors the terminology (curated value sets: yes/no/unknown, obesity ICD-10/SNOMED, comorbidity, LOINC BMI, CPT) — the deterministic engine never fabricates codes. The builder binds to it: CRD card (cardType `coverage-info`, indicator `warning`, coded coverage classification, SMART link with `appContext.questionnaire`) and a DTR R4 Questionnaire (grouped, `item.code` LOINC/SNOMED, choices bound to `answerValueSet`, SDC `initialExpression` pre-population, `enableWhen` conditional). INVARIANTS: CRD link canonical === DTR Questionnaire.url; every coded concept carries a real system.

**Adversarial:** the codes are AUTHORED/curated, not extracted — honest (a payer maintains its coding map) and does not claim the extractor invented them. Slice is self-contained (not yet wired into the live GenerateArtifactsStage pipeline) — deliberately, so the target is proven and measurable before integration. Follow-up (the "enhance & complete" phase): extend the production models (`QuestionnaireItemDef`, `CoverageRule`) to carry these bindings, map all 21 codes + the full criteria set, wire the renderer.

**Result:** 374 tests (365 + 9 conformance assertions), prettier + size ratchet clean; demo route renders live at `/policy-engine/conformance-demo` (browser-verified: coverage-info card, answerValueSet, LOINC/ICD codings, enableWhen).

---

## 2026-08-29 — DTR questionnaire omits coverage EXCLUSIONS (no "check an exclusion" items)

**Scope (core-logic path):** `src/lib/policy/encode/fhir.ts` (`toQuestionnaire` — skip exclusion criteria when emitting Questionnaire items). Test: `tests/policy/questionnaireExclusions.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change touching a medical-necessity/coverage surface (what a DTR asks the provider to attest). Coalition required.

**Problem (found by investigation, tree-of-thought + adversarial):** the authoring Generate stage rendered exclusion/investigational statements ("…is considered investigational", "…does not meet …criteria for coverage") as attestation checkboxes. Root cause: criteria classification is heading-based (`extract/criteria.ts`), so inline exclusion sentences under a medically-necessary region leak into `cp.medicallyNecessary`; the engine then emits a Questionnaire item for every leaf criterion, exclusions included. A provider cannot meaningfully "check" an exclusion — it asserts the opposite of coverage.

**Design (leverage, not duplicate):** filter at the ONE questionnaire seam (`toQuestionnaire`) rather than re-classifying at extraction (which would ripple into evaluate/CRD/tests). Reuse the existing negation signals — `EncodedCriterion.negate`, `Measure.negatedLocally`, and `isNegationHeading` — broadened by a few exclusion phrases ("does not meet", "not eligible", "is/are excluded", "considered cosmetic"). INVARIANT: an exclusion criterion is never emitted as a Questionnaire item; it STAYS in the criteria registry so evaluation + CRD still see it — only the DTR questionnaire omits it.

**Adversarial:** false-positive risk on positively-phrased negation ("has not undergone prior surgery") — mitigated because the detectors are coverage-specific ("not medically necessary / investigational / does not meet criteria"), not general negation. Positive concurrent-procedure statements ("concurrent cholecystectomy is considered medically necessary") are NOT filtered — they are legitimately answerable DTR questions. Empty pathway (all-exclusion) degrades to population-only, no crash.

**Result:** mirror gate green — 365 tests (363 + 2 new), prettier clean, size ratchet ok (fhir.ts 247 lines). Delivered to device. Follow-ups (separate): value-set/coding binding on `QuestionnaireItemDef` (carry `valueCoding.system`, add `answerValueSet`); clinical grouping + EHR pre-population in the renderer; CRD|DTR tabs in `GenerateArtifactsStage`.

---

## 2026-08-29 — Encoding-review code ROUTING (honest per-code signal, no fabricated disposition)

**Scope (core-logic paths):** `src/lib/policy/review/codeRouting.ts` (new), `src/lib/policy/review/encodingReview.ts` (additive `routing?` field on `ReviewElementInput`), `src/lib/policy/review/fromPolicyReview.ts` (wire `routing` through the procedure elements + `CodingMapContribution`). UI consumer: `src/components/policy/EncodingReviewPanel.tsx` (grouping only).

**Trigger:** core `src/lib/policy/review/**` change + new module + a coverage/medical-necessity-adjacent surface (procedure-code disposition). Coalition mandatory.

**Problem:** the review screen showed every procedure code with the identical generic "Assign coverage role (covered / not-covered / investigational)" line — no signal. Root cause: `deterministicCodingMap` deliberately proposes no role (it "cannot invent coverage decisions"); the AI coding-map path is unconfigured in the demo.

**Architect design pass:** rather than propose a disposition, derive a *routing hint* — WHERE each code's evidence sits — from the one honest, provenance-anchored structural signal (`review.notMedicallyNecessary[]`). Codes named (word-boundary) in an exclusion/investigational statement route `excluded` with the statement as provenance + a `classifyBasis` basis; all others route `assign`. Additive model field; `deterministicCodingMap` left byte-identical (its defect pins stay green); UI groups the queue by routing so it isn't a wall of identical rows, stating the "assign role" instruction once per group.

**Adversarial BEFORE coding (payer-UM SME + encoding specialist — NO-GO on the first design, then revised):**
- The ORIGINAL proposal (auto-label each code "Covered · PA required" from code-in-guideline membership) was **NO-GO**: the extractor's `guidelineCodes` is a flat, context-free harvest, so "member of the covered set" does not exist as data; asserting coverage would be a fabricated determination, would anchor the maker (automation bias), and — by replacing the blocking `verify` flag — would let codes silently leave review via `bulkAcceptCleanExplicit` / the 60% `canSubmit`. "PA applies ⇐ policy has criteria" was also rejected (gold-carding, statutory carve-outs, site-of-service, benefit exclusion).
- Design revised to meet the adversarial's conditional-GO: routing NEVER sets `role`; every routed code `requiresAssignment: true` and keeps its blocking flag (cannot be bulk-accepted); fail-safe to `assign` on any missing/ambiguous signal; no PA assertion; `excluded` only from an explicit negation/exclusion statement, carrying that statement as provenance.

**Adversarial AFTER coding (INVARIANTs pinned as tests):** `tests/policy/codeRouting.test.ts` (8 tests) pins: excluded routing carries provenance + basis and never a `role`; word-boundary matching (43644 ≠ 436440/143644); a non-negation prose mention does NOT route excluded; benefit-exclusion vs investigational basis; empty inputs → `{}`; every routed code `requiresAssignment`. INVARIANT comments in `codeRouting.ts` mark the fail-safe and no-coverage-decision rules.

**Result:** mirror gate green — 363 tests pass (355 prior + 8 new), prettier + size ratchet clean, app compiles (`next dev`). Delivered to device.

**Honest limit:** for a policy whose codes are all in the coding list with no per-code exclusion statements, all codes route `assign` (one group) — differentiation appears only where the policy itself distinguishes codes. Richer per-code dispositions require the AI coding-map path (endpoint + key), which stays out of scope here. Full `PROMPT_MASTER_LOG.csv` provenance rows to be appended in the provenance close-out.

---

## 2026-08-28 — Clinical measure encoder: enterprise hardening

**Scope (core-logic paths):** `src/lib/policy/encode/{measure,measureScan,dimensions,dimensionResolve,encode,evaluate,fhir,time,ir,index}.ts`, `src/lib/policy/review/{fromPolicyReview,encodingReview}.ts`.

**Trigger:** core `src/lib/policy/**` change + new modules + new capability + touches fail-closed
defaults and a medical-necessity/eligibility decision. Coalition mandatory.

**Architect design pass:** field↔unit↔range dimension registry; clause-scoped field resolution
(field noun resolved at sentence scope, operator/value/unit in a tight local window); band-aware
parsing (ranges never shattered); fail-safe range gate (flag, never silent-drop); local polarity
detection; multi-measure per criterion wired through evaluate + FHIR + review.

**SWE implementation plan:** modular layout to keep every file ≤ 400 lines (`dimensions.ts`
registry split from `measure.ts`); back-compat shims (`parseScalarMeasure`/`encodeMeasure`) so the
existing suite stays green; explicit preserved-test list; per-defect regression pins.

**Adversarial BEFORE coding (two lenses — NO-GO):**
- Engineering/regression: silent range-drops flip eval outcomes; `measures[0]` reordering breaks the
  range tests; compound-BP regresses to scalar; threshold-variant attaches to the wrong field;
  half-wired multi-measure = false coverage. → design revised (bands-first, compound-BP preserved,
  flag-not-drop range gate, variant-by-field, multi-measure fully wired).
- Clinical/extraction: comma-clamped windows drop the modal "BMI, …, of at least 40 kg/m²"; the "or"
  clamp kills "40 or greater"; per-comparator scan shatters "35 to 39.9"; polarity inversion on
  "not medically necessary". → clause-scoped field resolution + postfix-atomic + bands-first + polarity flag.

**Adversarial AFTER coding (post-implementation — NO-GO, then fixed + pinned):**
- CRITICAL: `negatedLocally` was a dead flag → an exclusion evaluated as a positive eligibility gate
  (false approval). Fixed: encode raises a reviewFlag so it can never auto-approve. Pinned.
- HIGH: phantom same-field measure → duplicate FHIR linkId. Fixed: unit-owner precedence + same-field
  dedupe + index-based linkIds. Pinned.
- MEDIUM: compound BP bypassed the range gate. Fixed: routed through the gate. Pinned.
- LOW: word-numerals > twenty dropped silently. Fixed: extended + flag on unresolved. Pinned.

**Result:** mirror gate green — tsc clean, 355 tests, prettier + eslint clean. Delivered to device;
size ratchet passes. Tests: `tests/encode/measure.{registry,hardened,defects}.test.ts`,
`tests/policy/encodingReview.test.ts`.

**Note:** this entry is retroactive — the coalition was run before this protocol existed; logging it
here both records it and seeds the log the `g_coalition` gate now requires.

---

## Entry: DTR terminology-resolution layer — Phase 1 (inline/offline)

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — DTR choice items must bind to authoritative FHIR ValueSets ("propose the concept; the terminology infra establishes the code/value-set binding"); build a resolution layer, general across the payer corpus (Horizon, Elevance/Anthem, Aetna, UHC, state Medicaid), not a per-policy lookup.

**Architect verdict:** Proceed — additive, low-to-medium risk. Four corrections folded in:
1. Engine value-set `concept` is SYNTHETIC (`"<id> options"`, encode.ts:150) → the registry resolves off item heading text + option displays, not `concept`, and returns `undefined` unless confident (fail to "unset" = the prior behaviour = safe no-op).
2. `codingMap.ts` lives at `src/lib/policy/review/` — provider/selector/config pattern mirrored (`select* + *ConfigFromEnv + NotConfiguredError`).
3. Carrier fields (`QuestionnaireItemDef.code/.answerValueSet`, `answerOption.coding`) already existed — nothing thrown away.
4. Only the hydrate pass may be async; the sync generators stay pure.

**Deviation from the literal plan (architect-flagged concern, risk-reducing):** resolver placed in the DTR adapter layer (`engineQuestionnaireItems.fhirItemsToDefs`) rather than `encode/choiceItem`, so the `encode/` engine (`fhir.ts`) is UNTOUCHED — avoids the `encode → dtr` import the architect flagged as an engine-cleanliness risk. Same user-visible result (renderer already shows the `answerValueSet` pill). Registry decoupled from `encode` via a plain `ConceptSignal` (text + option displays), so `terminology/**` imports no engine types.

**Files:** new — `src/lib/policy/dtr/terminology/{registry,expansion,vsac}.ts`, `tests/policy/terminologyGolden.test.ts`; edited — `src/lib/policy/dtr/conformance/valueSets.ts` (+`ALL_VALUE_SETS`/`VS_BY_URL` inline corpus), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (resolve → `answerValueSet`; opt-in async `hydrateExpansions`).

**Invariants asserted (golden corpus, 18 tests):** unconfident/ambiguous → `undefined` (exactly-one-match rule; negative cases); CPT + `urn:rhtp:*` never leave the inline provider even when VSAC is "configured"; VSAC gated (`VsacNotConfiguredError`, no network offline); hydrate is fail-safe (never blanks options on miss/throw); sync generators stay non-Promise; NO payer-specific branch in `terminology/**` (keys on clinical concepts + code systems only).

**Gate (mirror, green):** vitest 395/395; tsc clean on all changed `.ts`; prettier clean; eslint clean (tests/policy). Sizes: all prod < 400, test < 500. Testlink: all three new modules imported by `terminologyGolden.test.ts` (real coverage incl. the VSAC gated-throw branch) — no testlink-baseline row needed; the VSAC network-success branch does not exist yet (Phase 2).

**Delivery:** written to working tree on `main` (uncommitted, staged for review). Device pre-commit (prettier + sizes + testlink) to confirm on commit.

---

## Entry: DTR terminology-resolution — Phase 3 (corpus expansion + generality proof); Phase 2 → roadmap

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — complete Phase 3, prove generality across payers/domains; stay inline (record live VSAC as roadmap).

**What changed:**
- `valueSets.ts` corpus 3 → 6, spanning TWO payers and THREE clinical domains: added `VS_CARDIAC_ARRHYTHMIA` (ICD-10 I47/I48 + SNOMED) and `VS_ABLATION_CPT` (CPT 93650/93653/93654/93656) grounded in **Aetna CPB 0165 (Cardiac Catheter Ablation & Radioablation)** — a different payer and specialty from the Horizon bariatric seed — plus a cross-cutting `VS_TOBACCO_STATUS` (SNOMED status codes).
- `registry.ts` +2 conservative rules (arrhythmia, tobacco). The ablation **procedure** (CPT) set is deliberately rule-less — a procedure is a coverage code, not a DTR answer, and an "ablation" rule would collide with real arrhythmia headings ("catheter ablation for the following arrhythmias …"). It stays corpus-only (expandable + inline-routed).

**Generality proven (golden corpus now 25 tests):** the SAME engine + resolver bind a cardiac arrhythmia choice end-to-end with zero payer/domain-specific code (`engineQuestionnaireItems` on a clean cardiac policy shape → `answerValueSet = …/cardiac-arrhythmia`, and NOT a metabolic set); cardiac ↔ metabolic never cross-bind; the CPT-bearing cardiac set stays inline even with VSAC "configured"; corpus spans ICD-10 + SNOMED + CPT; exactly-one-match safety holds across all 5 rules (procedure-shaped options → unset). No Horizon or payer name anywhere in `terminology/**` or the engine.

**Gate (mirror, green):** vitest **402/402**; tsc clean on all changed `.ts`; prettier + eslint clean; sizes — valueSets 180, registry 137 (prod < 400), golden test 302 (< 500).

**Roadmap (deferred, not built):** **Phase 2 — live VSAC `$expand`.** Committed posture is INLINE-ONLY: the `vsac.ts` provider + `selectExpansionProvider` routing seam are in place but inert (throws `VsacNotConfiguredError`; never selected unless `VSAC_ENDPOINT` + `VSAC_API_KEY` are set). Activating it is a future item — wire the UMLS/VSAC `$expand`, keep CPT + `urn:rhtp:*` inline. No code change needed elsewhere to turn it on.

**Delivery:** written to working tree on `main` (uncommitted, staged for review).

---

## Entry: Choice-detection fix — one-of-N + open enumerations become bound value-set choices

**Change class:** core `src/lib/policy/encode/**` + terminology (additive/behavioral). **Trigger:** on the real Elevance CG-SURG-83 policy the workbench Generate step produced 23 items with `choices=0, bound=0` — every "one of the following …" list flattened into booleans with dangling "; or", and the terminology layer was starved (no choice items to bind).

**Root causes (found by reproducing the pipeline on the real fixture, not the screen):**
1. `detectChoiceMin` only matched "one or more of / at least one of / any of the following" — it MISSED "one of the following" (the most common payer phrasing) and open enumerations ("including but not limited to"). So B (5 procedures) and the comorbidity lists never became choices.
2. Once they were choices, the resolver still returned `undefined` on the comorbidity list: the diagnosis rule fired on `obes`+`morbid` where "morbid" came from "co-**morbid**", and the comorbidity rule looked for "comorbid" (closed) while Elevance writes "co-morbid" (hyphenated) → two rules matched → ambiguous → unbound.
3. Option labels bypassed `clean()`, so "; or" litter stayed on the answer options.

**Fixes:**
- `encode/valueset.ts` `detectChoiceMin`: recognize "one of the following"; check "all/each of the following" FIRST so an AND list is never mis-read as one-of-N.
- `encode/encode.ts`: build a choice for a FLAT option list that is a one-of-N OR an open enumeration (`isOpenSet`); a node whose options themselves have children RECURSES (nested content preserved → inner comorbidity choice forms instead of being dropped).
- `dtr/terminology/registry.ts`: diagnosis rule anchored on the PHRASE "morbid obes…" (never bare "morbid"); comorbidity rule matches "co-?morbid" (both spellings).
- `encode/fhir.ts` `choiceItem`: run option displays through `clean()` (trailing "; or"/"; and"/";"/":" trimmed) — display only; sourceText stays verbatim for provenance.

**Proof (Elevance CG-SURG-83, reproduced end-to-end):** items 23→16, `choices 0→3`, `bound 0→2` — the 5 procedures collapse into one choice; BOTH comorbidity lists resolve to `answerValueSet=obesity-comorbidity`; option labels de-littered.

**Gate (mirror, green):** vitest **404/404** (added 2 regression tests pinning "one of the following" → choice and hyphenated "co-morbid" → obesity-comorbidity); tsc/prettier/eslint clean; sizes valueset 64, encode 285, fhir 298, registry 141 (all < 400). No legacy-path regressions (`detectChoiceMin` is engine-only).

**Known residue (separate seam, extraction boundary — NOT this fix):** a couple of section headings still bleed into an item ("…Reoperation", "…* Revision/…") and one revision run-on remains; deferred to the extraction-quality seam.

**Delivery:** working tree on `main` (uncommitted, staged for review).

---

## Entry: Authoring workflow UX — sign-off gating + honest submit footer (browser-diagnosed end-to-end)

**Change class:** core `src/lib/policy/workflow/**` + `review/**` + two workbench components. **Trigger:** driving the authoring flow end-to-end in the browser on the Elevance preset surfaced two defects the unit tests didn't (they proved the lifecycle is correct in isolation).

**Defect 1 — illegal-transition on approve.** `isStageUnlocked('signoff')` required only `hasPromotableDoc`, so the stepper let you jump to the checker-approve stage before the maker submitted; `checkerApprove` then hit `in-review → approved` ("✕ illegal transition"). The lifecycle itself was already fail-closed (a wrapper test pins it) — the gap was stage-gating.
- Fix: `isStageUnlocked('signoff') = hasPromotableDoc && submitted`, mirroring the existing generate/promote-until-approved lock. Reuses the lock pattern; no new machinery. Tests updated to pin the corrected gating (signoff locked until submitted; furthestUnlocked/resolveActiveStage follow).

**Defect 2 — footer label lied.** The review footer showed "Ready for maker sign-off" whenever `openDefects===0`, but the Submit button is disabled until `decided ≥ 60%` — so at 40% decided the label and the gate disagreed.
- Fix: expose the canonical threshold as `ReviewProgress.minDecided` (single source of truth, reused from the same `Math.ceil(total*fraction)` that drives `canSubmit`) and make the footer show `Decide N more to submit · decided/total` until `canSubmit`. No duplicated constant.

**Verified live (browser, Elevance CG-SURG-83):** Ingest → Review (45/45 decided) → Submit → Sign-off → **Approve with no illegal-transition** → Generate: 27 CRD coverage rules + 16 DTR items, comorbidity choices carry the `answerValueSet` pill. Full authoring chain green end-to-end.

**Gate (mirror):** vitest 404/404; tsc/prettier/eslint clean; sizes under cap.

**Known residual (extraction seam, deferred to hardening — NOT this fix):** two section headings still bleed into DTR items ("…surgery. Reoperation"; "…GERD). * Revision/ conversion indications…") because a criterion region isn't terminated at an unmarked following heading/note — same defect class as the tested evidence-appendix boundary.

**Delivery:** working tree on `main` (uncommitted, staged for review). Components (IngestStage preset, EncodingReviewPanel footer) delivered directly — outside the mirror's vitest scope, verified in the browser.

---

## Entry: Extraction boundary — criterion no longer absorbs a following heading or footnote (authoring complete)

**Change class:** core `src/lib/policy/extract/criteriaParse.ts` (the marker/nesting parser). **Trigger:** the two DTR heading-bleeds seen live on Elevance CG-SURG-83 ("…undergoing bariatric surgery. **Reoperation**" and "…documented GERD). **\* Revision/ conversion indications apply…**").

**Root cause:** `parseCriteria`'s continuation branch folds ANY non-marker line into the deepest open criterion. So a standalone section heading ("Reoperation", the label of the next determination) and a footnote line ("* Revision/…") were appended to the preceding criterion.

**Fix (two tight, general boundaries; reuses the existing group-start predicate):**
- A footnote line (`^[*†‡§]␠`) is a policy note, never criterion text — not folded.
- A SHORT standalone heading (≤40 chars, ≤3 words, title-case, no sentence-ending punctuation) whose NEXT meaningful line opens a determination (`isGroupStartLine`, factored out and shared with the region opener) is a section label — skipped, so it doesn't bleed onto the last item. Guarded tightly so a genuinely wrapped fragment is never dropped; the two determinations still split into two groups (heading skipped, not lost).

**Adversarial/red-team:** the lookahead skip fires only when the line looks like a heading AND the next line opens a determination — a lowercase sentence-fragment continuation (e.g. "documented within 6 months") is never dropped; a footnote skip can only remove a note, never criterion content.

**Gate (mirror):** vitest **405→407** (added `criteriaBoundary.test.ts`, 2 cases); the whole 400+ extraction suite (criteria/extract.*) stays green — no regression. tsc/prettier/eslint clean; file 162 lines (< 400).

**Verified live (browser, Elevance):** full chain reload → review → submit → approve → Generate; both DTR items clean, `bleedsRemaining {reoperation:false, revisionNote:false}`.

**Authoring status: COMPLETE.** Choice binding, Elevance preset, sign-off gating, honest submit footer, and extraction boundary all delivered + gated + browser-verified end-to-end. Next phase: CRD → DTR → PAS runtime.

**Delivery:** working tree on `main` (uncommitted, staged for review).

## 2026-08-29 — Comorbidity/documentation boundary: investigation + regression lock

**Trigger:** live browser showed the obesity-comorbidity DTR choice carrying 9 options — 4 true
conditions (diabetes, cardiovascular disease, hypertension, cardio-pulmonary) plus 5 DOCUMENTATION
criteria (weight-loss-program history, inadequate weight loss, pre-op evaluations, pre-op education,
treatment plan). Directive: bind only true conditions, but ensure the documentation criteria are still
captured as their own items, and ensure the fix generalizes.

**Finding (reproduction-driven, adversarial):** the CURRENT source is already correct. Running the real
pipeline (pdfIntake → extractCriteriaPolicy → engineQuestionnaireItems) on Elevance CG-SURG-83 in a
clean environment emits the comorbidity choice with EXACTLY 4 condition options bound to
`urn:rhtp:dtr/ValueSet/obesity-comorbidity`, and the 5 documentation criteria each as their own separate
boolean items. `criteria.test.ts` corroborates the extraction tree (C.2 = 4 comorbidities, D = 5
documentation items as a distinct top-level criterion). The "9 merged options" observed in the browser
was a STALE dev bundle (same class as the WorkQueuePage `slice`-of-undefined phantom seen earlier this
session, whose guard is already committed). No code defect; the encode `flatOptions` recursion fix from
earlier this session is what keeps C.2's value set to its own 4 children.

**Locked:** added `tests/policy/comorbidityDocumentationBoundary.test.ts` — a payer-agnostic synthetic
case (open-set comorbidity sub-list + a separate documentation branch) AND the real Elevance golden,
each asserting (a) the comorbidity value set contains only conditions (no documentation phrase leaks
into any choice option) and (b) each documentation criterion surfaces as its own non-value-set-bound
item. Full policy+dtr suite green in a clean run (269 tests + 3 new). Test-only change: E13 (changed
src empty), sizes (131 < 500 test cap), types clean.

**Generality probe (tip-of-the-iceberg):** ran the same probe over the other fixtures. `horizon.pdf` and
`sample-pa.pdf` are NOT medical-necessity criteria policies — they are PA-requirement / code-list
documents ("All items below require prior authorization" + CPT tables), so 0 criteria is CORRECT. BUT
both yielded 0 harvested CODES from their CPT tables — a real, separate gap on the CRD/code-extraction
side (not the comorbidity class). Logged for prioritization; not fixed in this pass.

## 2026-08-29 — Demo hardening: assistant BYO-key, graceful promote, requirement-table code harvest

**1) Encoding Assistant "bring your own key" (session-only).** Added a first-step config in the
assistant rail: the demonstrator enters `AI_CODING_ENDPOINT` + `ANTHROPIC_API_KEY` to switch from the
deterministic offline path to the live LLM. Key handling is SESSION-ONLY — held in React state, sent
per-request to our own BFF, never written to storage, never logged, cleared on refresh/disconnect. The
BFF route (`/api/policy/assistant`) now prefers request config over the env gate and still fails safe to
the deterministic answer. Files: `EncodingAssistantPanel.tsx`, `api/policy/assistant/route.ts`.

**2) Graceful promote — "queue for next release".** Replaced the unrealistic "✓ Promoted — live for the
tenant" with an operational release conclusion: a new pure module `workflow/release.ts` stamps a
calendar version, queues the next monthly release window, sets an effective date = window + provider-
notice period (default 60d), files a deterministic change-record id, carries the maker/checker sign-off,
and lists the stakeholder queues the change WOULD notify (modeled, labelled "queued" — never faked as
sent). The workbench renders a release-summary card with a rollback affordance (honest copy: a published
version is immutable; rollback opens a new change). Unit-tested (`release.test.ts`, 5 cases, clock-injected
deterministic). Files: `workflow/release.ts`, `PolicyDtrWorkbench.tsx`.

**3) Requirement-table code harvest (generality).** Closed the gap where PA-requirement/code-list policies
(horizon.pdf, sample-pa.pdf) harvested 0 codes. Added a requirements-table pass to `criteriaCodes.ts`:
inside a PA-requirements / CPT-HCPCS-table context it harvests EVERY valid code per line — handling leading
row indices ("1 43770 …"), many codes per line ("93451, 93452, 93453"), and wide table headers — with
CPT-range / HCPCS-format validation. Fail-closed: no context ⇒ no harvest, so prose 5-digit numbers are
never fabricated into codes; context closes at References/Rationale. Result: horizon 0→15 codes, sample-pa
0→7 (incl. E-series DME HCPCS), Elevance unchanged at 27. Payer-agnostic test `requirementTableCodes.test.ts`
(4 cases incl. the false-positive guard). Full policy+dtr suite green (278 tests) in a clean run.

All changes verified in a clean cloud reproduction (device vitest can't run — node_modules carries Windows
native bindings, device shell is Linux). gate:push + commit are user-side on Windows.

## 2026-08-29 — DTR determination sections (fix: two pathways read as duplicates)

**Defect (UX, confirmed in browser):** a policy with 2+ medical-necessity determinations (Elevance
CG-SURG-83: initial surgery + revision/reoperation) generated a DTR questionnaire that FLATTENED both
pathways into one undifferentiated list — so the second pathway's BMI/comorbidity/documentation items
looked like duplicated questions and undermined reviewer trust.

**Fix:** the pathway now carries the determination heading (`Pathway.label`, set in `encode.ts` from the
group heading; surfaced as the group text in `fhir.ts`). `fhirItemsToDefs` emits one non-answerable
`display` section header per top-level pathway group — but ONLY when the policy has 2+ determinations, so
single-determination policies are unchanged. A new `display` QuestionnaireItemType renders as a titled
section divider (`QuestionnaireRenderer`) and is excluded from the QuestionnaireResponse and from
required/valid accounting (`questionnaireResponse.ts`). The Generate-stage DTR tab count counts only
answerable items (so "Questionnaire 16" is unchanged though 2 headers were added → 18 total).

**Result:** Elevance now renders two titled sections — "Gastric bypass … medically necessary when all of
the following are met" and "Surgical repair/correction or reversal …" — each with its own items. New
regression test `dtrPathwaySections.test.ts` pins: 2+ determinations ⇒ one titled header each (colon
trimmed, non-answerable); a single determination ⇒ no header. Full policy+dtr suite green (280 tests) in a
clean run; types clean.

## 2026-08-29 — Review split into two lists (human exceptions vs AI-decided)

**Change (UX + model):** the Encoding Review stage no longer dumps all 45 items in one queue. `encodingReview.ts`
adds `reviewBucket()` (needs-review vs ai-decided), `acceptAiDecided()` (pre-accepts AI-decided items), and
`submitReadiness()` (gate = no open defects AND every exception decided). "Needs your review" holds genuine
exceptions — defect/ambiguous flags, codes named in a not-medically-necessary/investigational statement
(`routing.bucket==='excluded'`), and human-gated documentation. "AI-decided" holds everything the AI resolved
(clean explicit + AI-mapped codes, per product decision), pre-accepted and collapsed for sample-check; any row
reopens. The panel adds an explicit "I've reviewed the AI-decided items" acknowledgement; the editor submits the
WHOLE policy for maker→checker sign-off — nothing generates CRD/DTR on the AI's say-so alone. Existing
`reviewProgress`/`needsReview`/tests unchanged (new functions added alongside). New test `reviewTwoList.test.ts`;
full policy+dtr suite green (283). Types + lint clean. Panel 280 lines (< cap).

## 2026-08-29 — General-purpose hardening (architect + SWE + red-team coalition)

**Question (owner):** the engine must be general-purpose for ANY payer/state policy — a payer name should have no meaning in the code beyond the sample, unless we deliberately want per-payer adapters. Architect review VERIFIED the live authoring path (route → processPolicyDocument → extractCriteriaPolicy/extractStructuredPolicy → encode → review → DTR/CRD) is payer-agnostic: the only fork is structural (`/Requirements By Product/` → code-table, `/Medical(ly) Necess/` → criteria); zero payer-name branching in encode/dtr/crd/review. Payer names survive only as (a) provenance comments grounding reference value-sets, (b) the demo sample-loader.

**Changes (coalition: architect design → SWE build → adversarial red-team → fix):**
1. **PolicyProfile seam** (`profile/policyProfile.ts`, NEW) — the sanctioned optional per-payer/state extension: `detect` + `normalizeText` (INPUT pre-normalization only), a generic identity default, registry + selector, mirroring the terminology-expansion and coding-map provider seams. Wired as the first step of `processPolicyDocument` (identity by default ⇒ general path byte-for-byte unchanged). Test `policyProfile.test.ts`.
2. **Silent under-extraction guard** (`policyReview.ts`) — a substantial document (bodyChars>6000 or ≥3 necessity cues) that yields ≤2 TOTAL (nested) criteria now pushes a warning, surfaced as an amber "⚠ warnings" chip on the doc card + the review warnings box — a thin/prose extraction can no longer masquerade as fully authored.
3. **Legacy payer-classifier quarantined** — `extract/{index,fields,segment}.ts` (aetna-cpb vs pa-list classifier, off the authoring path, still test-covered) carry LEGACY/do-not-wire banners; `ingest/{aetnaCpb,uhcPaList}.ts` relabeled as mock-corpus seed adapters. Physical deletion deferred to a dedicated refactor-only change (mass test/baseline churn would otherwise risk the push gate).
4. **Assistant floating dock** (`PolicyDtrWorkbench.tsx`) — narrow screens (<lg) get a toggleable bottom-LEFT dock (clears the global Demo Navigator) instead of a buried bottom-stacked panel; sticky right rail retained on lg+.
5. **tsc fix** (`dtrPackageTypes.ts`) — added `display` to `FhirQuestionnaireItemType`, repairing a latent `check:types` break introduced by fix #1's `display` item type (caught by red-team). 

Red-team also cleared: param-reassign (no rule), guard false-positives (now counts nested criteria), fragment balance (removed the fragment entirely — dock nested in grid; 0 prettier warnings), two assistant instances (independent state, one visible per breakpoint). 287 policy+dtr tests green; tsc + lint clean; workbench 391<400.

## 2026-08-30 — Research-drawer source excerpt widened to a usable context window

**Question (owner):** on the redesigned Encoding Review, the per-code research drawer's "Source excerpt
(from the policy)" showed only ~three words either side of the code (`"…ux limb 150 cm or less) 43645
Laparoscopy, surgical, …"`) — too little for a reviewer to verify the code in context, and it sliced words
in half ("roux" → "ux").

**Change (coalition: architect → SWE → adversarial lens; ceremony scaled to a display-only pure fn):**
`extract/provenance.ts` — `SNIPPET_PAD` 24 → 100 (a full line of context each side; the same `snippet`
feeds both the drawer and the assistant's inline citation, so both improve consistently). `snippetAround`
now snaps a cut that lands INSIDE a word back to the nearest whole-word boundary (decided from the raw
neighbour chars before whitespace-collapse), so the excerpt never begins/ends on a fragment. The code sits
centred in the window, so snapping can never touch it.

**Adversarial lens (R4 engineering):** verification is span-based (`verifyAnchor` compares `text[span]` to
the recorded value) and is provably UNAFFECTED by any display-window change — the snippet is decoration, the
span is the evidence. No test asserts snippet content/length (`extract.provenance.test.ts` checks spans;
`encodingAssistant.test.ts` supplies its own snippet strings), so widening is non-breaking. Edge cases
cleared: a code at the text edge gets no ellipsis and no snap on that side; a code-only text yields the bare
code (no fragment, no ellipsis); snapping only fires when both the neighbour and boundary chars are
non-space, so it cannot eat a whole word or empty the body.

**Result:** new `extract.provenance.test.ts` cases pin the wide window (>120 chars), whole-word edges, and
the no-ellipsis-at-edge rule. Types + lint clean; full gate green (push tier).

## 2026-08-30 — Human-in-the-loop gating: AI recommends, human decides every item, checker can't rubber-stamp

**Owner intent:** AI may recommend, but every recommendation must be reviewed and passed by a human
(accept / modify+accept / reject) before the policy can gate for approval; the approver must do real
spot/sanity checks, not rubber-stamp; AI confidence + policy conflict should aid where to focus first.

**Architect → SWE (changes):**
1. **No auto-accept.** AI-decided elements are RECOMMENDATIONS (start `open`), not pre-accepted.
   `EncodingReviewPanel` no longer calls `acceptAiDecided`; the submit gate is `submitReadiness.everyItemDecided`
   (no open element anywhere, no open defect) — the single-ack checkbox is gone. `EncodingReviewAiRow`
   shows Accept / Reject (+ the coverage select as "modify") when open, state + Reopen once decided.
2. **Explicit safe bulk-accept.** `bulkAcceptRecommended` accepts ONLY clean (explicit, unflagged,
   non-`excluded`, ai-decided-bucket) codes; AI-mapped (low-confidence) and policy-conflicting codes are
   left open for individual decisions. Reopen now re-blocks the gate automatically (tracked, not a no-op).
3. **Conflict detector.** A code whose OWN descriptor reads not-medically-necessary / investigational
   (`descriptorFlagsExclusion`) — the signal the prose-only `excludingStatement` missed on CG-SURG-83's
   44238 — now routes `excluded` (→ needs-review) and defaults not-covered/investigational, not covered.
   One shared wording set; descriptor path uses adjectival cues only (no loose `investigation`/`exclud`
   stems that appear benignly in CPT text like "intestine, except rectum").
4. **Confidence + conflict triage** (`reviewTriage.ts`, split out for the size cap): `reviewAttention`
   flags AI-mapped + policy-conflicting codes "⚠ verify"; the AI-recommended list sorts them to the top.
   Confidence-to-extract ≠ safe: an explicit code the policy calls NMN is the top-priority review.
5. **Checker can't rubber-stamp** (`SignoffStage`): a decision summary (counts by disposition) shows
   what is being approved; every off-coverage code AND every code the maker pulled ONTO coverage against
   the policy default (`summarizeDispositions` with `overrideFrom`) must be individually spot-checked
   before Approve unlocks; Approve is disabled (not silently no-opped) for an empty / same-as-maker reviewer.

**Adversarial red-team (findings fixed before gate):**
- Size: `encodingReview.ts` hit 407/400 → triage helpers extracted to `reviewTriage.ts` (373).
- `everyItemDecided` failed OPEN on an empty review set → added `total>0` guard (mirrors `reviewProgress`).
- Spot-check was one-directional (denied codes only) → now also flags investigational→covered overrides.
- Descriptor regex used loose stems → tightened to explicit adjectival determinations; statement path
  broadened with common payer phrasings ("not reasonable and necessary", "does not meet … criteria").
- `DispositionSelect` rendered on diagnosis rows (phantom spot-check) → restricted to procedure codes.

**Known follow-up (documented, not in this batch):** the new maker/checker completeness gates are
enforced in the React shell; the pure lifecycle (`makerSubmit`/`checkerApprove`) still enforces only
maker≠checker. Threading review-completeness + spot-check into `applyTransition` as a fail-closed
precondition is a separate lifecycle change. Accepting a procedure row affirms its shown coverage
disposition (the select is on the row); bulk-accept is limited to clean, non-conflicting codes.

**Result:** 46 targeted + full policy suite green; tsc + lint clean; all changed files under the size cap.

## 2026-08-30 — DTR patient evaluation: the authored policy prepopulates from a real FHIR record

**Owner intent:** the CRD/DTR/PAS analysis proved the patient side was a disconnected fixture —
`/api/dtr/evaluate` returned a hardcoded lumbar-MRI scenario for ANY code and the evidence was baked-in
literals. Connect the AUTHORED policy to a patient: derive its computable criteria, run them against a
patient's FHIR record, and show what prepopulates vs what stays a documentation gap.

**Architect → SWE (new `src/lib/policy/dtr/evaluate/`):**
1. `patientData.ts` — minimal FHIR bundle types + pure query helpers (`ageInYears` from Patient.birthDate,
   `latestObservation` for LOINC 39156-5 BMI, `findCondition` for ICD-10 comorbidities) that return the
   matching resource WITH provenance, plus a bariatric patient fixture (Maria: BMI 42.3, active E11.9).
2. `patientEvaluation.ts` — `evaluateDtr(criteria, bundle, asOf)`: every computable group's status +
   evidence is READ FROM THE RECORD (age/BMI/comorbidity); documentation criteria stay `gap` (never
   auto-satisfied). Deterministic (`asOf` injected).
3. `dtrCriteriaFromPolicy.ts` — `dtrCriteriaFromReview` encodes the reviewed criteria (REUSE of the same
   engine the questionnaire/CQL use) and lifts the typed age/BMI thresholds + documentation, so the
   evaluation is driven by the authored policy. Comorbidity uses a documented standard obesity set.
4. `bariatricCriteria.ts` — the CG-SURG-83 computable-criteria fixture + CPT set for the server path.
5. Wiring: `devStubs.dtr.ts` routes bariatric CPTs through `evaluateDtr` (no longer the lumbar default);
   `PatientPrepopPanel.tsx` (Generate stage) evaluates the LIVE authored review against the sample patient.

**Adversarial red-team (findings fixed before gate):**
- Size: `devStubs.dtr.ts` was blown to 538 by a stray reformat → restored to the compact 240-line form
  (prettier rule is warn-level; scenario objects kept single-line under the cap).
- Comorbidity was marked `required` even when BMI ≥ 40 qualified alone → now required only when the band
  is the patient's actual qualifying path (`band && !bmiClearsThreshold`); a BMI-45 patient no longer
  reads a false comorbidity gap.
- `findCondition` excluded clinically-active `recurrence`/`relapse` → now included; `evaluateDtr` guarded
  against malformed/empty bundles (no `entry`, missing `code.coding`).
- Honesty: the server path is a FIXED fixture + fixed patient (the stateless endpoint can't reach the live
  review); comments corrected to say so, and the panel reports "N/M computable criteria auto-prepopulated
  · K gaps to resolve" rather than an absolute "all met".

**Result:** new `dtrPatientEvaluation.test.ts` + `dtrCriteriaFromPolicy.test.ts` (12 tests) pin age/BMI/band/
comorbidity/documentation status, provenance, the required-logic fix, and the derivation. tsc + lint clean;
full suite green; all files under the size cap; `PatientPrepopPanel.tsx` baselined in testlink.

## 2026-08-31 — CRD single-source: one coverage-card producer + a spec-shaped hosted service

**Owner intent:** the CRD/DTR/PAS review found CRD had TWO look-alike surfaces. Confirmed by
tracing: `/api/cds` (client → external gateway, mock = `devCrdCards`) does real coverage cards;
`/api/cds-hooks/order-sign` does drug-drug-interaction + STAT-note safety, NOT coverage — yet the
certification matrix attributed CRD to it. Two asks: (A) relabel so CRD ≠ DDI and fix the matrix;
(B) give CRD a spec-conventional hosted CDS Hooks service that shares ONE card producer with the
client mock, so all CRD coverage-card logic finally has a single source.

**Architect → SWE:**
1. `src/lib/policy/crd/coverageRequirementCards.ts` (NEW) — the single producer: `buildCrdCards`
   (pure, deterministic id seam), `crdIndeterminateCards` (fail-closed), `crdInputFromOrder`
   (structured-coding-only extraction). CrdCoverageCard carries uuid + source so both surfaces
   emit an identical shape.
2. `devStubs.cds.ts` — `devCrdCards` now delegates to `buildCrdCards` (demo default scenario stays
   confined to the client mock).
3. `src/app/api/cds-hooks/order-select/route.ts` (NEW) — hosted CRD service; resolves the SELECTED
   orders, builds cards via the producer, registered in discovery.
4. `cds-hooks/route.ts` — registers `order-select`; order-sign description corrected to DDI/safety.
5. `certification/matrix.data1.ts` — `crd-order-sign` (id kept for the R1-10-2 history) repointed to
   the producer + order-select with an honest "card production, not adjudication / no coverage-
   information system-actions" note; `cdshooks-order-sign` corrected to medication-safety (demoted to
   partial, live-DDI ci-pending); `cdshooks-order-select` added as a distinct transport claim (no
   coverage double-count).

**Adversarial red-team (pre-build, findings folded in):**
- R2 BLOCKER (fail-open): returning `{cards:[]}` on error would read to an EHR as "no PA needed".
  Fixed: every error / unknown-patient / no-CPT path emits the fail-closed indeterminate warning card;
  never an empty list.
- R2 BLOCKER (wrong-patient/PHI): the hosted service must not fall back to the demo (Maria) scenario.
  Fixed: it resolves via the production registry only; a miss → fail-closed card. Demo default stays
  in `devCrdCards`, structurally unreachable from the hosted route.
- R1/R2 (parity E15 + determinism): the producer owns uuid + source and uses a deterministic id seam,
  so mock and hosted outputs are shape-identical and byte-assertable.
- R1/R2 (PHI/injection): procedureName is derived from structured coding display only, never from
  `code.text`/notes; a free-text-only order fails closed rather than echoing clinician text.
- R1 (indicator): PA-required demoted `critical`→`warning` (administrative condition, not patient harm).
- R1 (selections): order-select keys off `context.selections`, not the whole draft bundle.
- R4 (governance): id `crd-order-sign` KEPT (referenced by risk-register R1-10-2); Partial status held;
  no silent upgrade; coverage-semantics vs transport claims kept disjoint.
- Verified against source: R4's "crdService.ts is dead / always returns a mock" was a MISREAD — the
  file feeds `parseCrdCards(r.data.cards)` into `deriveCrdResult`; not treated as a finding.

**Scope not taken (documented, not silently dropped):** hosting CRD on `order-sign` too (sign-time
determination) and emitting Da Vinci `coverage-information` system-actions remain gaps; the note says so.
order-sign's own `[]`-on-error DDI behaviour is unchanged (out of this change's scope) and logged as a
follow-up risk rather than altered here.

**Tests:** `tests/policy/crd/coverageRequirementCards.test.ts` (producer contract, fail-closed,
structured-coding-only, parity) + `tests/api/routes-cds.test.ts` extended (order-select happy path,
every fail-closed branch, malformed→400, discovery registration). vitest to be run natively on Windows
(rolldown native binding blocks vitest under the Linux device bridge); tsc/lint/testlink/wiring run here.

**Post-build red-team (verification on the shipped diff):** B1 fail-open, B2 wrong-patient, B3
parity, and PHI-echo all re-confirmed CLOSED by tracing every return path. One MAJOR new defect
found and FIXED: two selected orders sharing a CPT produced colliding card uuids (CDS Hooks
correlates feedback by uuid) — the order-select route now folds each order's id/index into a
deterministic id seam, so uuids are unique per order while card SHAPE parity with the mock holds.
Verified `getPatientById('')`/`getPatientByFhirId(<unknown>)` both return undefined (no demo
fallback — B2 fully closed). Residual minor (documented, not blocking): a non-CPT coding fallback in
`crdInputFromOrder` labels any coded order "(CPT <code>)" — over-warns in the fail-closed direction.

## 2026-08-31 — WPC core hardening (batch 1): startup wiring + lens surfacing

**Owner intent:** close the tractable, correctness-critical items from the WPC intelligence-core
hardening assessment as one gate-green batch: (P0) the production cold-start, (P1) the two lenses
computed-then-dropped, (P2) catalog accuracy. Feature-scale items (durable serverless projection,
5-dimension projection from FHIR feeds, hosted-CRD parity, sweep wiring) deferred to later batches.

**Changes:**
1. `src/instrumentation.ts` — the existing nodejs-guarded `register()` now also dynamic-imports and
   calls `bootstrapReliability()` at process start, so the projected-graph aggregator is registered
   and the projection drain scheduled without waiting for a first `/api/ops/health` hit. Closes the
   production 503 cold-start. (Guard + dynamic import keep Node-only reliability code off the edge bundle.)
2. `HolisticPatientContext` gains optional `careTeam` + `part2Restricted`; `mapCareTeam` / `mapPart2`
   (new pure mappers) surface the two previously-dropped lenses; the aggregator populates them and
   declares them in `contextProvenance.projectedSections`. Optional so the authored engine is untouched.
3. `dataMode.ts` — `wpcRecord` and `signalDisposition` seam labels corrected `registered`→`wired`
   (both have real production switch points). `reliability/bootstrap.ts` recon-placeholder comment made
   honest (the sweep is reserved, not yet wired — it needs the outbox apply/publish deps).

**Adversarial red-team (post-build, on the diff) — two MAJOR semantic defects found and FIXED:**
- `mapCareTeam` filtered on a single node kind (`CareTeamMember`), which DROPS the NPI-converged
  treating physician (a `ProviderIdentity` node) and `Practitioner` participants — the care-team lens
  returns all three via `HAS_CARE_TEAM`. Fixed to count every non-Member participant; role travels as a
  node property on all kinds. Test now seeds Practitioner + ProviderIdentity to pin it.
- `mapPart2` derived `restrictedNodeCount` from the consent-FILTERED lens output, so a no-consent read
  returned `0` even when restricted Part 2 data existed and was being WITHHELD — reading as "no Part 2
  data" on a 42 CFR Part 2 surface. Fixed: count is `null` (UNKNOWN) unless the scope actually disclosed
  Part 2; never asserted as zero. Type widened to `number | null`.
- Verified premises the reviewer raised that did NOT hold: edge-bundling is safe (guard + dynamic import,
  same pattern as the file's evidence-store import); the scheduler starts no background timer (jobs run
  only on an authenticated ops tick) so there is no timer leak in mock/build/serverless; running bootstrap
  in all modes is harmless (the aggregator is read only under `wpcRecord=production`).

**Tests:** `projectedAggregator.mappers.test.ts` (+ mapCareTeam multi-kind counting/dedupe, mapPart2
enforced-vs-disclosed + null-when-withheld, provenance) and `projectedAggregator.test.ts` (+ context
surfaces careTeam/part2Restricted with provenance). Node gates green on device (sizes, testlink E13,
wiring E14, page-boundaries, skill-mirror, provenance E11); tsc/lint/vitest to run natively on Windows.
