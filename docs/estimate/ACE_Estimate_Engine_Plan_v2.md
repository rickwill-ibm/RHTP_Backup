# The ACE Estimate Engine — project plan and feasibility

**16 September 2026 · IBM Consulting · v2, post-coalition · Draft for approval, not for use**

> **FRAME** — WHPC / ACE: a reusable US health-payer whole-person care platform asset built on IBM Connect360. The engine estimates **asset build**, separates it from **per-deployment implementation**, and is tuned to the Connect360 dependency specifically.
> **SHAPE** — This document. An eight-phase architecture, a delegation table, a feasibility assessment, and a recommended first build. No components built yet.
> **DONE** — You can read the phase list and say which phase is wrong.
> **METHOD** — Drafted solo, then attacked by two seats: an adversarial reviewer in the partner's chair, and an estimating-QA lead from the systems-integrator discipline. 26 findings returned; the survivors are folded in below and the four that changed the recommendation are named.

---

## Recommendation

**Do not build this engine yet. Three of its inputs are wrong, and two of them are wrong in the estimate we issued yesterday.** The coalition found a blend asymmetry and a conversion asymmetry in the v2 position — both arithmetic, both findable by a partner in under a minute, and both worth more than the de-duplication credit the whole exercise produced. Fix the position first. Then build **Phase 0 (frame gate), Phase 6 (bound render) and the register-as-data schema they both depend on** — realistically two to three weeks, not the two days I claimed in v1. Leave Phases 1–5 as documented method. **Phase 7 (calibration against delivered actuals) is the most valuable phase in the design and the only one that would make any of this accurate rather than merely consistent.**

---

## What the coalition changed, and what it found in yesterday's numbers

Four findings survived scrutiny and materially changed this document. Three of them are defects in the **v2 estimate**, not in the engine — which is the honest answer to why the engine is worth building.

### 1. The blend asymmetry — the largest finding, and it is arithmetic

Derive the implied offshore share of each side of the bridge from the two rate cells:

| | FTE-mo | Cost | Implied rate | Implied offshore |
|---|---|---|---|---|
| Original asset build | 153.30 | $4,317,595 | $28,164 | **54.3%** |
| De-duplication credit | 11.33 | $326,330 | $28,802 | **52.3%** |
| Platform-gap additions | 35.00 | $821,700 | $23,477 | 69.4% |
| **A7 worker application** | **33.00** | **$727,050** | **$22,032** | **74.1%** |
| **All additions** | **68.00** | **$1,548,750** | **$22,776** | **71.7%** |

**The estimate sells savings at 52.3% offshore and buys scope at 71.7%.** Every FTE-month removed is worth 26% more than every FTE-month added. A7 at 74.1% sits **above the corrected 72.21% ceiling** the same memo established, and above the 80% target the same memo calls the single biggest trap in a model like this — for a regulated US health front end, which is the least plausible place in the programme for an above-ceiling offshore share.

The defence is legitimate as far as it goes: the additions are engineering-heavy, and their blends come from the plan's own per-role shares. But the defence is never stated, the implied blend is never printed, and the check that Phase 1 applies to the baseline is never applied to the registers. **Priced at the achievable 54.3%, the additions are $1,915,356 and Position B is $6,682,871 — +31.2%, not +24.0%. A $366,606 gap.**

*Engine consequence:* the blend check becomes a register-wide invariant against the **achievable** blend, not the ceiling; every register row carries an explicit `offshore_pct` with a named role mix; and a gap of more than five points between the two sides of the bridge fails the build pending written justification.

### 2. The conversion asymmetry — two different duration-to-effort rates in one bridge

Reductions convert at **0.155 FTE-mo per released week** (11.33 ÷ 73, after class weighting and 15% residual retention). A7 converts at **0.295 all-in** (33.0 ÷ 112 remaining worker-facing weeks) — straight duration ÷ 4.33 at an asserted 1.0 concurrency, with no class weight and no retention. **A 1.9× density difference, on the same Gantt, in the same bridge, running in exactly the direction that produces the 4.75:1 headline.**

The reason is real and it is more interesting than the defect: worker-facing lines are staffed at 0.63 concurrent FTE in the plan, so A7 is not pricing *new scope* — it is **correcting a defective baseline**. That is a stronger argument and it belongs in a different row.

*Engine consequence:* the bridge gains a row. **Original → baseline defect corrections → less de-duplication → plus genuine new scope → contingency → Position.** Most of A7 moves to the first of those, where it is far easier to defend. And where the two directions must use different densities, the engine prints both and states why.

### 3. About a quarter of the credit is contingent and is reported as banked

The register flags its three least-confident reductions — multi-tenancy (6 wks), the two consent lines (6 wks), projection scaffolding (3 wks) — **15 of the 73 released weeks**, roughly $85,000, all of which the register itself says should be tested before banking. None of the tests was run. The headline reports one unqualified number, $326,330, and every downstream artifact inherits it. The register carried the honesty; the bridge threw it away.

*Engine consequence:* every register row carries `status ∈ {BANKED, CONTINGENT}` and a `retiring_test_id`. The headline reports **banked credit and credit-at-risk separately**, and the engine hard-fails issue if any BANKED row has an unretired test.

### 4. Phase 0, as I designed it, could not have caught the failure it was built for

Two independent seats reached the same conclusion from different directions, which is the strongest signal in the pack. The gate as written **asks the operator to declare the frame** — but the v1 estimator, asked to name the authority, would have named the procurement document, because that is exactly what he did. A declaration gate ratifies the estimator's prior. It has a zero detection rate on the failure it exists to catch.

Worse, the scrub acts on **deliverables**, and the contamination is in the **input**. The Connect360 evidence pack was assembled by scoring capabilities against a procurement's requirement families. Delete every mention of that procurement and the selection bias survives perfectly intact: the pack tells you what that procurement asked about and is silent on what a payer asset needs that it never mentioned. **Absence has no string to grep for.** And v1's closing paragraph proposed promoting that pack to a permanent standing asset — which would have institutionalised one procurement's lens over every future estimate. That recommendation is withdrawn.

*Engine consequence:* Phase 0 becomes **forced disconfirmation** rather than declaration, and Phase 2 gains a blind-spot diff. Both are specified below.

**And the frame error that still slips through, named so it is not forgotten: a unit error with no proper noun attached.** The v1 failure was caught because it wore a geography. The same error without a place name — per-deployment content, first-deployment hardening, or a payer-specific artifact booked into the *asset* number — passes the gate, the header restatement and the scrub, because there is nothing to match on. **A7 is the live instance:** nothing in the pack establishes whether a worker application is asset scope or deployment-one scope, and the entire Position A → B delta turns on that unexamined call.

---

## Project Vision

A repeatable engine that converts a **delivery plan** plus a **platform evidence pack** into a **defensible cost position** and a **partner-ready presentation**, where every credit is auditable to a row, every exposure is auditable to a probe, and the presentation is generated from the model rather than transcribed from it.

The revision the coalition forced is worth stating plainly. **v1 optimised for repeatability — running the same judgement cheaply. The target is defensibility — making judgement contestable.** Those are different engines. A repeatability engine has receipts for steps; a defensibility engine has receipts for decisions, and can say which $85,000 of a credit is riding on an untested assumption, which figure a named human owns, and what the number becomes if the central assumption is wrong. Everything below follows from that correction.

The discipline that makes it worth building is that it runs in **both directions**. Most estimate re-cuts are asked to find savings and find savings, because that is what they were pointed at. This one spends equal budget on what the evidence exposes. In the cycle that produced it the de-duplication was worth $326,330 and the exposures were worth $1,548,750 — and the exposures only surfaced under challenge.

---

## Architecture: eight phases

### Phase 0 — Frame Lock · **human gate, mandatory, mechanical**

Not a declaration. A **conflict table the engine builds and refuses to proceed past**:

For every artifact in the room — the verbatim quoted scope sentence, its date, and the UNIT it implies. Rows whose implied UNIT disagrees are flagged mechanically, and each conflict requires a written adjudication naming who decided and why. *Conflict detection works without knowing the answer. Declaration does not.*

Fields the card carries, each one because it changes the number and none of them derivable from "US health-payer":

| Field | What it fixes |
|---|---|
| **UNIT** | Asset build · first deployment · Nth deployment · bid response. Four different numbers, routinely conflated. |
| **BUYER CLASS** | Commercial payer · state Medicaid agency · MCO · internal IBM P&L. Determines the entire compliance surface. |
| **FUNDING MECHANISM** | Commercial · federal FFP (APD/IAPD, 90/10) · internal investment. Changes architectural constraints and IP posture, not just paperwork. |
| **SCOPE AUTHORITY** | Which artifact defines scope — *and it is a hypothesis, not a specification, including the Assumptions tab.* |
| **CURRENCY AUTHORITY** | Which artifact is most recent, separately. For WHPC these disagree: the workbook is the pre-re-cut baseline; the v8 deck is current. |
| **RATE PROVENANCE** | Real card, with a vintage — or a machine-enforced ILLUSTRATIVE watermark on every page of every output. |
| **ESTIMATE CLASS** | With its expected accuracy band. See the feasibility section; WHPC's inputs are Class 4 at best. |
| **EVIDENCE AS-OF** | The pack's date. Connect360's `develop` branch is 149 commits ahead of `main`; an evidence pack has a shelf life measured in weeks. |

**The rule that survives unchanged:** *never infer FRAME from a source document.* A plan handed to you carries a hypothesis about its own scope, not a specification of yours. **The rule that is new:** the Assumptions tab is not exempt. It is written by the bidding team, it is promotional, and in WHPC's case it makes a claim the register falsifies — *"measures, rules, benefits, attribution and terminology are configuration, not code"*, against a register that records no Measure resource exists.

### Phase 1 — Baseline Reconstruction

**Seat:** delivery estimator. Recompute from first principles. Never validate a stated total against itself.

Standing checks, in order of yield:

- **Does a role exist in the staffing model that could build each thing the Gantt budgets?** Highest-yield question in the phase. It is how the missing front-end engineer was found: 4.3 FTE-months of UX design, zero application build, against sixteen worker-facing surfaces.
- Does every bucket and per-role split tie to the rate card **to the dollar**? (WHPC: yes — the seventeen roles reproduce $4,317,595 and 54.3% exactly. That result earns the model the right to the rest of the analysis.)
- **Achievable blend or target blend?** Costing WHPC at its 80% target rather than its achievable 54.3% would have understated committed scope by $1,492,185 (29.3%).
- **Blend integrity — five parameters, each stated even when set to 1.0 or zero:** productivity differential by work class (a 3.2× rate ratio carried against an implied 1.0× productivity ratio is an assumption, not a fact); attrition and replacement ramp over a 16-month programme; wave onboarding loss; grade mix and pyramid dilution behind the single offshore rate; rate escalation with an index and a base date.
- Does the onshore floor account for every onshore-located role? (WHPC's omitted solution consulting: $111,600 of headroom that was not there.)
- Which artifact is current — workbook or deck — and is the difference presentational or material?

**Output:** validated baseline, defect register with each defect quantified or explicitly marked unquantified, and the estimate class with its accuracy band.

### Phase 2 — Platform Evidence Sweep

**Seat:** Connect360 platform SME, dispatched as a budget-capped researcher with no write tools.

**Two axes on every evidence row, not one.** Existence is not entitlement:

| CLASS — does it exist? | | ENTITLEMENT — may we use it, on our dates? |
|---|---|---|
| **Observed** — live introspection, running system, code on disk | | **Contracted** |
| **Published** — product page, docs, package manifest | | **Committed in writing, with a date** |
| **Inferred** — architecture diagram, service naming, analogy | | **Roadmapped** |
| **Asserted** — someone said so | | **Unowned** |

**Ceiling rule:** a NATIVE credit requires Observed **and** Contracted-or-Committed. Anything **Unowned cannot exceed CONFIGURE however well observed it is** — which makes Phase 3's rule 3 a machine check rather than a rule an adjudicator has to remember. Asserted never exceeds CONFIGURE under any circumstances; in the last cycle, five evidence drops in a row each corrected scores in the same direction, and absence of evidence was repeatedly scored as evidence of absence.

**Blind-spot diff, new and mandatory.** The probe set is derived from **the asset's own capability model**, then diffed against what the existing pack covers. The delta is reported as a named list: *capabilities with no evidence because nobody asked.* Every evidence record carries `elicited_by` — the question that caused it to be collected — and records elicited by a withdrawn frame are quarantined, not inherited.

**Receipt schema**, since v1 asserted receipts and never defined them: `{id, class, entitlement, source_uri, commit_sha, observed_at, observer, expires_at, supports[], elicited_by}`. Without commit pinning against a fast-moving `develop` branch, "Observed" has a half-life of days and every ceiling it supports decays silently.

**Standing Connect360 probe set:** GraphQL introspection counts, consent provision model, HSDS service and capacity fields, referral queue and Task verbs, tenancy enforcement point, audit and notification surfaces, IG packages and branch state, EMPI reachability at the gateway, aggregate reachability through the proxy.

**And a control v1 had no line for:** this phase points a researcher at live systems. It needs a data-handling classification, a rule against probing production tenants, and a policy for PHI encountered. "No write tools" is not "no read of PHI."

### Phase 3 — Adjudication

**Seat:** de-duplication adjudicator. Row by row: **C360_WINS · SPLIT · RETAIN · ALREADY_CREDITED.**

Four rules, each now with a machine form, because a rule an adjudicator remembers is a rule the register violates:

1. **A reduction's residual is sized in FTE-months, not named in prose.** v1's rule caught "we forgot there was a residual." It does not catch "the residual is the whole job" — and the register contains rows whose named residual *is the deliverable the line was named for*: "the worklist application itself," "the routing rules engine and the inbox," "the graph model and all 30 mappings." **Conservation check: released effort + residual effort ≥ original line effort.** Any row that fails is auto-RETAIN pending re-adjudication. **Lexical trip-wire:** if the residual text contains the line's own principal deliverable noun, the verdict cannot be C360_WINS without an explicit adjudicator override and a reason.
2. **Duration released is not effort saved**, and the conversion basis is symmetric with Phase 4's or the difference is printed and justified. WHPC's 73 weeks are 11.33 FTE-months, 7.4% of the asset build, moving neither critical path.
3. **Unowned entitlement cannot be credited** — now enforced at Phase 2 rather than remembered here.
4. **Split the credit into removable and reallocated capacity.** A credit is only a saving if the role leaves the programme or is redeployed to other billable work. WHPC's released mix is architect- and FHIR-heavy, spread in fractions across 33 lines over 70 weeks — *0.068 FTE-months of an ML engineer is two and a half days of one person, eleven weeks from now.* That is not headcount you can remove; it is rounding on someone's utilisation. Only removable capacity nets against the total; reallocated capacity is a **risk buffer**. My expectation is that well under half of the 11.33 is removable, which takes the headline credit under $150k — **and makes the story stronger, not weaker.**

**Mandatory output: the Basis of Estimate.** v1's Phase 3 output spec was "the register, with counts by verdict and released duration by wave," which discards the only thing that makes 11.33 defensible. The BOE carries the full **role × line × concurrent-FTE assignment matrix** as a data artifact, the class weight table with each weight's source and owner, the retention parameter, the cap and its derivation, and the apportionment validation. A partner asks four questions in order — show me the line-level assignment, show me the weights, show me the sensitivity on them, show me these five rows — and without the BOE the estimator reconstructs method live in the room.

### Phase 4 — Exposure Discovery · **equal budget to Phase 3**

The question is not *what does the platform remove* but *what does its existence reveal that the plan has no line for.*

**A standing exposure taxonomy**, replacing v1's four probes — which were a post-hoc list of what one cycle happened to find:

| Probe | Found in the last cycle |
|---|---|
| API-without-application | A7, the worker application — $727,050, no role in the model to build it |
| Aggregate reachability | A2 — the proxy blocks `_total=accurate`; every Wave 2–5 dashboard needs a read-side projection |
| Upstream ownership | A1 — the tenancy and upstream-dependency lane |
| Content versus code | A5′ — the asset ships the loader; the corpus belongs to a deployment |
| **Non-functional-without-line** | *not run* — accessibility/508/VPAT, 1557 language access, DR/RPO/RTO, localisation |
| **Regulatory-deadline-inside-envelope** | *not run* — see the compliance note below |
| **Run-and-maintain-after-GA** | *not run* — post-GA product run cost sits nowhere |
| **Second-configuration proof** | *not run* — the proof of the asset's central commercial claim |
| Identity and matching · data quality at source | partially — the EMPI finding |

Each probe returns **FOUND · NOT-FOUND (citing the evidence examined) · NOT-RUN (with a reason)**. NOT-FOUND is a first-class acceptable result. Coverage is measured: percentage of Gantt rows touched by at least one probe, percentage of evidence-pack capabilities mapped to a Gantt row in either direction.

**The ratio check is withdrawn as a gate and demoted to a disclosure.** Both seats attacked it independently and both were right. "If the result lands near 1:1 the probes were not run hard enough" admits only one conclusion, so it measures nothing; its unit was never specified (this cycle is 4.75:1 on dollars and 6.0:1 on FTE-months, and the gap between them *is* the blend asymmetry, which means the check rewards pricing additions cheap); and its failure mode is manufactured scope, which loses deals faster than missed scope does. A generative system told to find more exposures will find them. **The ratio is reported to the reader with its unit stated, alongside prior cycles. It is never targeted.** The asymmetric budget stays — that is the right structural answer to search asymmetry. Only the target goes.

### Phase 5 — Coalition Review

**Six seats, named to the institution in scope.**

- **Connect360 platform SME** — is the class *and the entitlement* right on every row?
- **IBM delivery estimator** — does a role exist that can do each thing credited and each thing added, at the blend claimed, with the actual bench? *This seat requires a bench artifact as input; v1 asked it a question and gave it no data.*
- **US health-payer domain SME** — claims spine and X12, HCC/CDPS and DRG grouping, HEDIS, CMS-0057-F, prior authorisation, attribution.
- **Regulatory and contracting counsel — new seat.** Buyer-class compliance surface, IP and cost allocation, third-party redistribution terms, and liability for security representations the asset carries into every client authorisation.
- **Adversarial reviewer** — the partner's chair: which number would I refuse to sign?
- **Red team** — the buyer's and the competitor's chair.

Every finding returns with the claim, the recommended action, and **a named test that retires it with its cost in hours.** A finding without a retiring test is an opinion.

**Escalation is on magnitude OR conflict OR novelty, whichever fires first.** v1's rule escalated only on disagreement, which is a fail-open: the EMPI finding — 25–35 FTE-months, $715k–$1.0M — is single-seat and uncontradicted, so under v1's rule it auto-applied and moved the headline by up to a million dollars without a human touching it. **Any finding moving more than 2% of the committed total or $100k goes to a human regardless of consensus.**

**Double-count detection is a step, not a hope.** Every finding declares which register rows it touches; any row touched by more than one finding is a mandatory human adjudication. The v2 memo had to hand-write an anti-double-count paragraph for A8 because a human happened to notice, and its own test 7 — *has the deck already spent the screening credit?* — is an open, unresolved double-count on a C360_WINS row worth five released weeks.

**And a limit worth stating rather than hiding:** six instances of one model are not six independent seats. Diversify by *evidence access* — give the platform SME the repository and deny the estimator the memo — or accept that correlated failure is the default and price it.

### Phase 6 — Position and Presentation · **generated, not linked**

Four outputs, all rendered from one canonical `position.json` emitted by the model recompute.

**a) The workbook** — model of record. Every cost cell a formula over the rate cells; no computed constants. Plus two sheets v1 had no line for:

- **A non-labour cost register.** The two-rate-cell binding is elegant and it is *structurally incapable of representing a cost that is not labour.* Terminology and grouper licensing (named as a retained residual and never priced), Azure consumption and run cost, third-party assessor fees, internal chargeback for consuming another IBM P&L's platform — **zero dollars in a $5.09M estimate, flagged and left at zero** — HISP fees, AIRS membership. Fixed category list, each stated even when zero, **with a named reason for the zero.** Silence is not an acceptable entry.
- **A parameters sheet.** Every judgement value as a named cell, so sensitivity runs on the parameter set rather than on two rates. v1's sensitivity moved the 15% retention across its full range for ±$57,000 while leaving the class weights, the assignment matrix, the cap and A7's concurrency floor untested — and the memo's headline "onshore ±20% = ±$754k" is computed against the *original* base and quoted under a Position B for which the correct figure is ±$1.0M.

**b) The memo** — fixed section order, with a new section 0: **Basis of Estimate and estimate class.** Then: frame card · recommendation (first 100 words, always) · withdrawn and surviving · the bridge · model validation and defects · what the platform removes · what the same evidence exposes · excluded from the net · coalition findings · tests that retire the risk · confidence, contingency and sensitivity · reconciliation.

**c) The deck — six slides, generated from templates, never OLE-linked.** The realistic failure mode of a linked deck is specific and silent: links break on file move, on rename, on opening without the workbook mounted, on a copy sent to a colleague, and on export to PDF — and **PowerPoint renders the last cached value and looks completely normal while doing it.** The binding stops working at exactly the moment the deck reaches the partner. Render with python-pptx from `position.json`. Stamp the **model hash and as-of date visibly** on the workbook cover, the memo header and every slide footer, so a stale deck is identifiable across a room.

| # | Slide | Carries |
|---|---|---|
| 1 | **Position** | The revised bridge, as a range with P50/P80. Recommendation on the slide. |
| 2 | **What the platform removes** | Verdict counts, largest reductions *with their intensity column*, banked versus at-risk credit, duration-is-not-effort stated on the slide. |
| 3 | **Baseline corrections and new scope** | Separated, because they are different arguments. |
| 4 | **Excluded from the net, and why** | Each item with an approver's name against it. |
| 5 | **Tests that retire the risk** | Each test, its cost in hours, the dollars it moves. |
| 6 | **Confidence, contingency and sensitivity** | Class, band, reserve, the five swings. |

**d) A figure registry.** Every number carries an ID; prose uses `{{net_position_b}}`, never a typed literal; a pre-issue scan **fails the build on any bare numeral in a template**. The reconciliation diff is a build gate, not a step: extract every numeric token from the rendered memo and deck, diff against `position.json`, non-zero exit blocks issue.

**The honest scope of the binding claim, corrected.** All *figures* re-render. A defined subset of prose is templated. **The recommendation, the withdrawn-and-surviving narrative, the coalition findings and the residual text are authored and are re-read by a human on every re-cut** — the engine marks them dirty when an input changes. v1 claimed prose would never be rewritten; that is achievable for a workbook, partly for a memo, and not at all for the argument. Overclaiming it guarantees a second cycle that ships a memo whose numbers are current and whose argument is one verdict stale — internally inconsistent in exactly the way a reviewer finds.

### Phase 7 — Calibration · **new, and the most valuable phase in the design**

Every issued estimate is logged with its class, its drivers and its parameters. Every delivered programme logs actuals against the same drivers. Parameters are re-fitted on a stated cadence.

Without this, the class weights, the 15% retention, the 10% cap and the 1.0 concurrency floor are permanently unfalsifiable — they are the estimator's taste, encoded and made repeatable, which is not the same as made right. **An estimating engine that never sees an outturn is a consistency machine, not an accuracy machine.** It is also the only thing that would make the recommended first build a real test rather than a regression test.

It requires one thing the practice may not have: a completed comparable programme with actuals. **If that artifact does not exist, its absence is a bigger finding than anything in this document.**

---

## Task breakdown and delegation decisions

| Task | AI-led | Human-led | Collaborative, named owner |
|---|---|---|---|
| Frame conflict table (mechanical) | ✓ | | |
| **Frame adjudication of each conflict** | | **✓** | |
| Baseline recomputation from the rate card | ✓ | | |
| Blend integrity parameters | | | ✓ delivery lead |
| Platform evidence sweep, classing, entitlement | ✓ | | Entitlement confirmation |
| Blind-spot diff | ✓ | | |
| Row-by-row adjudication | ✓ | | Verdict sign-off |
| **Residual sizing** | | | **✓ adjudicator — this is the reduction's entire defence** |
| **Role × line apportionment matrix** | ✓ drafts | | **✓ delivery lead signs the matrix, not an abstract intensity dial** |
| Exposure probes | ✓ | | |
| **Exposure sizing and concurrency** | ✓ drafts | | **✓ delivery lead** |
| Coalition seats 1–3 | ✓ | | |
| **Adversarial and red-team seats** | ✓ rehearses | | **✓ — a machine simulating a partner's refusal is not evidence the partner will not refuse** |
| Regulatory and contracting seat | ✓ drafts | | ✓ counsel |
| Synthesis and conflict flagging | ✓ | | Conflicts, and anything >$100k |
| Workbook, memo, deck render | ✓ | | |
| **Rate card, bench mix, grade pyramid** | | **✓** | |
| **Contingency, reserve and price** | | **✓** | |
| **Commercial posture and competitive intelligence** | | **✓** | |
| **Final position approval** | | **✓** | |

**Every register row and every finding carries an `owner` — a name, not a role.**

Two boundary violations from the last cycle, recorded because the table's credibility depends on admitting them: the machine priced 68 FTE-months at a 71.7% offshore blend, which is the single largest bench assumption in the pack and no human supplied it; and the incumbent-network finding — withdrawn in v1, generalised into A8's $142,900 in v2 — is competitive intelligence, marked human-led, machine-produced both times.

**And one the engine must not be allowed to commit.** The rate-provenance refusal is real or it is decoration: v1's recommended first build replayed the whole cycle over rates marked ILLUSTRATIVE, which is the engine's first authorised act violating its own rule. One documented override path only — a signed *ILLUSTRATIVE — NOT FOR COMMITMENT* watermark rendered on every page of every output.

---

## Feasibility assessment

**Token profile** — one full re-cut of a ~94-row Gantt with a 17-role model: Phase 0 ~8K · Phase 1 ~50K · Phase 2 ~130K · Phase 3 ~110K · Phase 4 ~110K · Phase 5 (six seats) ~300–420K · Phase 6 ~70K. **Full cycle ~780–900K.** A light re-cut — frame unchanged, evidence unchanged, one verdict flipped — re-enters at Phase 6 at **under 60K**, which is the entire point of the binding.

**But the light re-cut is fiction until the registers are data.** v1 listed a canonical schema for the Gantt *input* and said nothing about the register *output*, which today is a hand-authored markdown table. Flip a verdict against that and you are hand-editing markdown, recomputing a wave roll-up, re-deriving the top five and re-checking the least-confident list — precisely the manual transcription Phase 6 exists to abolish. **This is dependency zero, not dependency four.**

**Build cost, corrected.** v1 said "perhaps two days" for Phases 0 and 6. Three renderers, a figure registry, a diff harness, a register schema and an input-and-output scrub is **two to three weeks**. A five-to-tenfold estimating error inside a document about estimating discipline is itself the finding, and it is left visible here for that reason.

**Estimate class, and what it does to the outputs.** The inputs are rates marked illustrative, a Gantt with no WBS dictionary, a staffing tab that is descriptive rather than generative, 54% of the schedule staffed at 0.63 FTE per line, and four unretired material tests. That is **AACE Class 4, arguably Class 5** — expected accuracy roughly −20%/+30% at best. The outputs were $5,589,215 and $6,316,265, with reconciliation notes resolving a $77 spread and a $109 rounding difference. **Precision exceeding accuracy by four orders of magnitude reads as concealment, not care.** Phase 6 rounds headline figures to the estimate class and keeps full precision in the workbook where it belongs.

**Risks:**

**Frame inheritance** stays highest and the mitigation is now four-layered: mechanical conflict detection at Phase 0, the blind-spot diff at Phase 2, the frame card in every header, and a scrub that runs on **inputs at ingest** as well as deliverables at issue — and that **reports its false positives**, because a Medicaid asset legitimately needs state-level words (per-state minor consent, Part 2 posture) and a high-false-positive scrub gets waived by cycle three.

**Search asymmetry in both directions.** Equal budget for Phases 3 and 4, probe coverage measured, and the ratio reported rather than targeted. The honest limit: none of this guarantees the exposures are found, only that they are hunted — and the ratio's withdrawal removes the pressure to over-hunt.

**Correlated seat failure.** Six instances of one model. Diversify by evidence access or price the correlation.

**Presentation divergence.** Generated outputs, a figure registry, a numeric-token diff as a build gate, and a visible model hash.

**Dependencies before building, in order:**

0. **The registers as versioned machine-readable data** — `row_id, activity, wave, class, plan_wks, verdict, wks_released, roles[], concurrent_fte, fte_released, offshore_pct, residual_text, residual_fte, status, retiring_test_id, evidence_ids[], owner`. Markdown and the workbook become renders of it. **Nothing else works without this.**
1. **The real rate card**, with vintage, grade mix and a bench artifact behind it.
2. **A canonical Gantt export schema.**
3. **A versioned, dated, re-scoped evidence pack** — re-scoped, because the current one was elicited by a withdrawn frame.
4. **The constraint set, written once**: Phase 0 fields, class × entitlement ceilings, the four adjudication rules with their machine forms, the exposure taxonomy, the fixed section orders, and the non-labour category list.

---

## The compliance surface the engine had no phase for

Raised by the regulatory seat, carried here as a finding requiring counsel's confirmation rather than as settled fact — but the dates are close enough that it cannot wait for the next cycle.

- **CMS-0057-F** is carried in WHPC as *optional bucket 4, $545,050*. Impacted payers include Medicare Advantage organisations, state Medicaid and CHIP FFS, Medicaid and CHIP managed care, and FFE QHP issuers. Prior-authorisation decision timeframes were compliance-mandatory **1 January 2026**; the four APIs are mandatory **1 January 2027 — about fifteen weeks from today, and inside the 70-week envelope.** For a payer asset this is not an optional uplift; the first buyer will assume it is in the base.
- **42 CFR Part 2**'s restructured consent construct had a compliance date of **16 February 2026**. A4 prices consent-enforcement verification at 2.5 FTE-mo as a bug fix. Supporting the post-2024 construct as a configurable per-deployment posture across N deployments is a workstream, and the register already concedes the shape of it.
- **If any deployment is a state Medicaid agency** — and the programme this plan originated in is state-administered — then APD/IAPD prior approval, the Conditions for Enhanced Funding, and **Streamlined Modular Certification** apply. SMC is outcomes-and-metrics based: **the asset must emit the certification metrics**, which makes A2's read-side projection an engineering requirement rather than a reporting nicety. The reuse condition also cuts commercially: work funded at 90/10 is expected to be available for reuse, which is an IP and cost-allocation question nobody in this corpus has looked at.
- **Accessibility and language access are absent entirely** — zero mentions of 508, WCAG, VPAT, ACR or 1557 across the pack, against $727,050 of worker-facing application for a public-sector health buyer. Indicative: conformance testing, remediation and ACR production across sixteen surfaces is 3–5 FTE-mo plus recurring re-test per release.
- **AI governance is unpriced** in an estimate whose fifth wave is "Agentic at scale" and whose register names HITL governance as a retained residual twice. A whole-person-care model that ranks members for care management is a textbook algorithmic-equity exposure in Medicaid.

*Engine consequence:* the certification lane becomes a **regulatory conformance register keyed to buyer class**, and BUYER CLASS and FUNDING MECHANISM become Phase 0 fields because everything above follows from them.

---

## One contradiction the engine should have caught and did not

The frame's own Assumptions tab promises *"a new client or state is onboarded in weeks, not re-implemented."* The same pack prices the per-deployment unit at **16–20 FTE-months and $596k–$745k across roughly 28 weeks.** Twenty-eight weeks and $700,000 is a re-implementation. **The estimate falsifies the product claim it was built to price, and no phase surfaces the contradiction.**

*Engine consequence:* a **coherence check** in Phase 5 between the deployment unit and the frame's own configurability claim; a **boundary conservation check** in Phase 6, so scope crossing the asset/deployment line appears in both bridges with a matching reference and a combined total is shown — A5′ moved $157,500 across that boundary in a single cycle, and only a hand-written paragraph stopped it being presented as a saving; and a **deployment learning curve with a break-even count** as a Phase 6 output. *Price the asset with a payback, or you have priced a project and called it a product.*

---

## Recommended first build

**1. Fix the position before building anything.** Reprice the additions with the implied blend printed on every row and A7 tested against the achievable blend; restructure the bridge to separate baseline defect corrections from new scope; split banked from contingent credit; run the three tests that retire the contingent portion. **Cost: hours. It changes the headline by roughly $366,606 and it removes the two findings a partner reaches first.**

2. **Build dependency zero** — the registers as data — then Phase 0 and Phase 6 on top of it. Two to three weeks.

3. **Then a blinded replay, with a rejection criterion stated in writing beforehand.** v1 proposed replaying v1→v2 and checking the engine lands on $5,589,215. Both seats called that circular, and they are right: the expected result is asserted by the same judgement being validated, three days ago, with no external referent; the replaying agent can read the answer; and when it disagrees, the engine gets adjusted until it agrees — which promotes v2's defects, including the two found above, from mistakes into acceptance criteria. **The replaying agent gets the v1 inputs and the frame card and no access to v2 or the working papers. The acceptance criterion is not agreement — it is that every material disagreement is individually adjudicable, and that adjudication favours the engine at least as often as it favours v2.** Disagreement is the signal.

4. **Then validate against a completed programme with known actuals**, and stand up Phase 7. If no such artifact exists in the practice, say so — that is the real finding.

**Phases 1–5 stay documented method rather than automation.** They are judgement that mostly works. Phases 0, 6 and 7 are discipline that does not yet exist, and between them they hold every failure of the last cycle: the wrong frame, the manual re-typing, and the two asymmetries that nobody would have caught without being asked to look.

---

*Two things the review left standing, so they survive the rewrite. The **duration-is-not-effort** discipline — and the refusal to carry "73 weeks released" to a partner as a saving — is the best judgement in the pack; most re-cuts do exactly the thing this one refuses to do. And **equal budget for Phase 4** is the right structural answer to search asymmetry. The problem was only the target attached to it.*

*Withdrawn from v1: the proposal to promote the Connect360 evidence pack to a permanent standing asset. It was elicited by a frame that has since been withdrawn, and institutionalising it would make one procurement's lens permanent. Re-scope it first, then version it.*
