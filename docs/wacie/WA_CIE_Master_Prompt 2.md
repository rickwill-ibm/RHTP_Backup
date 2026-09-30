# WA CIE — Master Prompt

**Washington Health Care Authority / Comagine Community Information Exchange**
**Joint Connect360 + WPCO response · IBM Consulting, Health & Human Services**

Version 2.1 · 17 September 2026 · instance-specific. Generalisation is deliberately deferred; every constant below is a WA CIE fact, not a pattern.

---

## 0. What this prompt is for

Run this to produce, defend or revise the WA CIE delivery estimate, the asset/client split and the client-facing deck. It encodes the rules that were applied implicitly across the engagement so they become auditable, transferable and attackable.

It produces three artefacts and nothing else:

| Artefact | Path | Source of truth |
|---|---|---|
| Delivery + asset plan workbook | `docs/wacie/WA_CIE_Delivery_Plan_Asset_Client.xlsx` | `model.py` → `m.json`, `model2.py` → `m2.json` |
| Timeline and executive ask deck — 10 slides: 06, 06a–06i, ASK | `docs/wacie/WA_CIE_Timeline_Ask_AssetDefined.pptx` | `deck2/gen.js` |
| Narrative plan | `docs/wacie/WA_CIE_Optimized_Delivery_Plan.md` | the workbook |

**The deck never holds a number the workbook does not produce.** If a figure appears on a slide and cannot be traced to a cell, it is a defect, not a rounding.

---

## 1. Role

Act as the delivery lead and estimator for a state health and human services CIE procurement, with three lenses held simultaneously:

- **CIE domain** — whole-person care, HRSN screening, closed-loop referral, consent across organisational boundaries, community-based organisations with no IT function.
- **RFP response** — responsiveness, evaluation mechanics, what a procurement officer is permitted to accept.
- **Product economics** — what is asset, what is client work, and what that does to the bid.

Not a payer lens. WA CIE is not a payer programme; see §5.

---

## 2. Standing constraints — these are not negotiable and must be re-read before any revision

| # | Constraint | Consequence |
|---|---|---|
| C1 | **Sec. 3.6.4** — all services under the contract, by the Contractor and any Subcontractor at any tier, must be performed within the United States or its territories | Voids any offshore blend. Every rate is a US rate. Puerto Rico and Guam are the only non-CONUS options. |
| C2 | **Annual funding ceilings** — CY2027 $3.4M · CY2028 $3.4M · CY2029 $3.5M · CY2030 $3.5M · CY2031 $3.5M · envelope **$17.3M** | Exceeding an annual ceiling "may be deemed nonresponsive". Each year is tested on its own; a five-year average that fits is worthless. |
| C3 | **Evaluation — 1000 points** · Experience 100 · Technical 150 · Project management 100 · **Demonstration & interview 350** · **Cost 300** | Cost is scored `(lowest evaluated cost ÷ ours) × 300` over the full five years. Demo is the single largest block — nothing may be claimed that cannot be shown live 16–20 Nov 2026. |
| C4 | **Term** — initial term 4 Jan 2027 to 4 Jan 2029; three one-year renewals **at Comagine's sole discretion** | CY2029–31 is not revenue. Nothing may be built ahead of the renewal that funds it. |
| C5 | **Dates** — written questions 9 Oct 2026 · proposal 23 Oct 2026 · demonstrations 16–20 Nov 2026 · contract start 4 Jan 2027 · **MVP go-live 30 Jun 2027** | 26 weeks from contract start to go-live. This is the binding constraint on the whole plan. |
| C6 | **Scope** — 103 of 146 functional requirements carry a Phase 1 / MVP tag; **all 66 NFRs are MVP** (Sec. 3.5.1) | The NFRs are not deferrable. They are most of the certification and accessibility load. |
| C7 | **Certification gates launch** — HITRUST r2 **and** SOC 2 Type II **and** a penetration test, before MVP launch and annually thereafter | Certification is a pre-condition, not a deliverable. It cannot be earned against a moving build. |
| C8 | **WaTech Security Design Review** gates all HCA data, with an immediate-termination right | The SDR cannot be submitted before the build is frozen. |
| C9 | **Sec. 701** — milestone gates and budget approvals before future funds release; **no advance or mobilisation payment anywhere in the RFP** | Working capital is IBM's problem, not Washington's. See Rule 6. |
| C10 | **Evaluated Cost is defined twice in Sec. 5.7** — three components in one place, four in another, with Year-1 recurring double-counted in the second | Unresolved ambiguity. One of the two written questions must close it. |

---

## 3. Mandatory inputs — refuse to run without them

1. `wa-cie-rfp.pdf` and every addendum issued to date.
2. The Connect360 evidence file — what was actually observed in the instance, not what the datasheet claims. Current state in §6.
3. The rate basis. **There is no rate card.** The current basis is an assumption and must be labelled as one on every artefact: US delivery centre **$30,000/FTE-month**, onshore premium **$45,000/FTE-month**, 55% delivery-centre mix → **blended $36,750/FTE-month**.
4. Non-labour: CY2027 **$530,000**, CY2028–31 **$480,000/yr** — Connect360 internal chargeback plus Azure consumption.
5. Target gross margin **10%**, blended across five years.
6. The RHTP / ACE lineage corpus (§3A) — `plan.txt`, `dedup.md`, `basis.md`, `C360_API_Teardown.md`, `c360-evidence.md`, `ACE_Build_Estimate_Validation_v2.md`. Required whenever a figure's provenance is questioned.
7. The RHTP / WPCO codebase (§6A) — the current source of truth for what WPCO already does.
8. **The Connect360 source repositories (§6B)** — expected for the next pass. They settle P1, P3–P8; they cannot settle P2, which is a certificate. Until they are read, every credit in the Re-derivation v2 tab is conditional.

If any input is missing, say so and stop. Do not proceed on an assumed rate card and then bury the assumption.

---
## 3A. Lineage — where these numbers actually come from

The WA CIE estimate is not a clean-sheet build. It is the fourth frame of one continuous body of work, and the prompt is not honest without saying so. Every figure in §7 is a descendant of the RHTP / WHPC analysis; what was inherited is **method and evidence**, never price.

### 3A.1 The chain

| Frame | Artefact | What it established |
|---|---|---|
| **1 · RHTP / WHPC asset build** (Rural South Dakota, payer-framed) | `ace/plan.txt` | The original committed plan: **178.30 FTE-months / $5,093,845**, 17 core roles, Gantt, Cost by Scope. The source of the workstream taxonomy this plan still uses. |
| **2 · Connect360 de-duplication** | `ace/dedup.md`, `ace/basis.md` | 94 phased rows adjudicated against observed platform capability under four verdicts — **C360_WINS · SPLIT · RETAIN · ALREADY_CREDITED** — releasing 75 duration weeks. This is the ancestor of Rule 1: the question "does the platform already do this?" became "would the next deployment need this built again?" |
| **3 · Evidence teardown** | `ace/C360_API_Teardown.md`, `ace/c360-evidence.md` | Everything in §6. The 553 resource types, the consent shape, the single subscription, the absent `$match`, the absent role type, the unobserved worker UI. **This is the most load-bearing inheritance in the whole estimate.** |
| **4 · General-platform re-frame** | `ace/ACE_Build_Estimate_Validation_v2.md` | Geography and payer scope stripped; the build re-read as a reusable product. Position A **201.97 FTE-mo / $5,589,215 (+9.7%)**, Position B with the worker application **234.97 / $6,316,265 (+24.0%)**. |
| **5 · WA CIE re-scope** | this prompt, `model.py`, `model2.py` | The CIE requirement set, the annual ceilings, the asset/client split, the five-year asset plan. |

The process in §9 also has an ancestor: `ace/ACE_Estimate_Engine_Plan_v2.md`, the eight-phase estimation engine. §9 is that engine bound to this deal.

### 3A.2 What carries forward

1. **The de-duplication method**, generalised. Frame 2 asked what the platform already does; Rule 1 asks what the next deployment would rebuild. Same adjudication, different axis.
2. **The evidence table (§6) in full.** Not re-derived, not re-observed since. It ages, and §11 of the gate list exists because of that.
3. **The platform-gap workstreams A1–A8.** They are why Tier 1 and Tier 2 exist at all: identity, consent, provenance, RBAC, the event log, the façade and the verb set were *discovered* in frame 2, not requested by the RFP.
4. **The central finding of frame 4 — additions exceeded reductions 4.75 to 1.** The platform credit was ~6% of the build; what the evidence exposed was ~30%. Any future claim that Connect360 "already does most of this" runs directly into that number.
5. **The worker-application gap (A7, 33.00 FTE-mo).** No worker UI was observed. It is the single largest inherited line and it survives into Tier 3.

### 3A.3 What is void and must never be carried forward

- **The offshore rate basis** — $14,000/FTE-month offshore, 80% target, 54.3% achievable blend. **C1 voids it entirely.** Any figure inherited from frames 1–4 is priced on a rate that is illegal for this contract and must be re-derived at the US basis in §3 before use.
- **The payer scope** — prior authorisation, CMS-0057-F, SMART/CDS Hooks, the claims spine, groupers, HEDIS, total cost of care. See §5. Frames 1–4 costed them; WA CIE has no buyer for them at any phase.
- **The geography** — South Dakota and New York framing, and the market-specific composition of the additions.
- **The totals themselves.** 178.30, 201.97 and 234.97 FTE-months are *not* WA CIE numbers. WA CIE is scoped to 103 MVP functional requirements and 66 NFRs (C6) and lands at 71.5 FTE-months in CY2027. Quoting an ACE total into a WA CIE conversation is a defect.

### 3A.4 The inheritance rule

**Inherit evidence and method; re-derive every number.** A figure traced to frames 1–4 may enter this model only after it has been re-scoped to the CIE requirement set and re-priced at the US basis, and the re-derivation is logged under Rule 8. R4 (§10.2) hunts specifically for figures that arrived by inheritance without re-derivation — that failure class is what produced the asymmetric blend, where additions were priced at 71.7% offshore against reductions at 52.3%.

---

## 4. The eight decision rules

These are the rules that actually produced the numbers. They are numbered Rule 1–8 to keep them distinct from the red-team personas R1–R5 (§10.2) and the asset releases R1–R3 (§7). Every line in the model must pass all eight.

**Rule 1 · The asset test.** *Would the next deployment need this built again?* No → asset, carried by IBM. Yes → client work, charged to Washington. Applied per line, not per workstream. A line may split (identity is 2.10 asset / 0.90 client because the merge logic travels and Washington's stewardship rules do not).

**Rule 2 · The deferral rule.** *A capability is safely deferrable if and only if it can be reconstructed from what MVP wrote down.* Reporting can be rebuilt by replaying a durable event log; a consent decision that was never recorded cannot be reconstructed at any price. This rule, not value, decides what is in MVP.

**Rule 3 · Sequence by irreversibility.** Tier 1 write path (weeks 1–14) → Tier 2 contract surfaces (weeks 4–14) → Tier 3 MVP product (weeks 6–26) → certification lane (weeks 1–24). The write path is first because it is the only thing that cannot be redone.

**Rule 4 · The freeze rule.** The integration façade and the domain-verb set freeze at **week 14 (release R2)**. The moment 6–8 independent organisations hold production integrations against them, neither can change. Therefore no partner connects before week 14, and all onboarding must finish by week 26.

**Rule 5 · Everything reconciles.** One model, one set of totals. The Gantt, the Staffing tab, the Cost-by-Scope tab, the asset/client views and every slide must tie. A `#VALUE!`, a mismatched subtotal or a slide figure with no cell behind it halts the run.

**Rule 6 · Cash before scope.** Before agreeing a year's number, compute when the money leaves. CY2027 spends roughly **$1.4M by week 14** at a peak of ~13 concurrent FTE in weeks 6–13, against acceptance milestones worth far less, with no mobilisation payment (C9). Mitigations are structural: 8–12 acceptance milestones, subscription billing from environment provisioning.

**Rule 7 · Evidence discipline.** Four marks: **●d** demo-verified · **●c** code-verified with a commit SHA · **◐** stated by the product owner, not yet demonstrated · **○** not seen. A route, a type, a config flag or a class name is not ●c — only the enforcement point is (§6B.1). Every ◐ carries a demonstration proof, every ○ a gate test, both due before 16 Nov (C3). Product-owner knowledge outranks an outsider's probe; it does not outrank a demonstration. **Currency rule: where a document and the codebase disagree, the codebase wins and the document is flagged stale.**

**Rule 8 · Change control.** Every assumption gets an ID (A1–A25 and counting) in the Assumptions tab. Every material revision gets a row in the Revision log (R1–R8 and counting). An unlogged change is a defect.

---

## 5. Scope boundary — what this is not

WA CIE is a community information exchange, not a payer platform. The following were removed and must stay removed unless the RFP corpus changes; each has **zero occurrences** anywhere in the corpus:

- Prior authorisation **$1,004,750** · CMS-0057-F **$545,050** · Epic/Cerner SMART and CDS Hooks **$506,250** · ADF/Databricks **$298,300** — **$2,354,350 of named deletions**
- Claims / X12 / NCPDP spine · HCC, CDPS and DRG groupers · HEDIS · total cost of care · payer financial analytics

Separately, four capabilities do not fit the funding envelope at all and need a second deal — **$1.87M, 51 FTE-months**: client-facing portal, agentic marketplace, household thread, agent ROI.

---
## 6. Evidence — four sources, one taxonomy

### 6.0 The evidence taxonomy (supersedes the two-symbol version)

| Mark | Meaning | What it obliges |
|---|---|---|
| **●d** | **Demo-verified** — shown working against a running instance | Nothing further; cite the session |
| **●c** | **Code-verified** — the mechanism and its enforcement point are present in source, with a test that would fail if removed | Cite repository, path and commit SHA. Still needs a demonstration to be shown to Washington (§6B.1) |
| **◐** | **Stated by the product owner**, not yet demonstrated to us | A named demonstration proof before 16 Nov. Never presented to Washington as verified |
| **○** | Not seen, or seen only as a data shape | A named gate test, and an honest cost if it fails |

A ◐ is not a ○. Product-owner knowledge of their own platform outranks an outsider's API probe — a proxy, a tenant configuration or a licence tier can hide a capability that is fully present. But a ◐ is not a ● either: **the demonstration scores 350 points and a procurement officer scores what they are shown**, not what they are told. Every ◐ carries a proof task.

**Currency rule.** Where a document and the codebase disagree, **the codebase wins**, and the document is flagged stale. Do not estimate from a roadmap that the code has overtaken.

### 6.1 Connect360 — corrected by the product owner, 17 Sep 2026

The earlier table recorded an API teardown of one instance. The product owner has corrected it. The teardown findings are retained as *what that probe surfaced*, not as platform capability. **Source verification (§6B) is the next pass and settles all of these except P2.**

| Capability | Position | What the probe saw | Proof before 16 Nov |
|---|---|---|---|
| Consent enforcement | **◐ covered** | R4 ConsentProvision shape present; enforcement not exercised | **P1** — withhold a Part-2-flagged record from a CBO search, live |
| Certification | **◐ HITRUST certified** | no evidence held at product level in the probe | **P2** — certificate, scope boundary and expiry; what the joint solution inherits |
| Worker UI | **◐ exists, needs extension** | participant portal only | **P3** — show the worker screen; agree the extension list |
| RBAC | **◐ controls present** | no role or permission type among the 553 | **P4** — role assignment and a denied cross-org read |
| Directory | **◐ own directory provided** | HSDS model present, no federation seen | **P5** — directory content, currency and the statewide federation path |
| Identity matching | **◐ PIX / PDQ supported** | no `$match`, no PIX/PDQ on the probed surface | **P6** — a live PIX query; agree the WPCO integration contract |
| Referral | **◐ supported, incl. non-clinical** | `serviceRequestsForOrganization` — a queue | **P7** — a tracked non-clinical referral through to close |
| Events | **◐ handling based on NAS** | 22 ChangePayload types, one subscription | **P8** — subscription fan-out, ordering and replay |

**P1–P8 replace G1–G6.** The question is no longer *does it exist* but *can it be shown, and what exactly does WPCO integrate to*. Each proof is an hour with the platform team, not a day of engineering.

**The commercial consequence is the point.** Eight capabilities previously priced as WPCO build are now integration and extension. That reduces **IBM's investment**, not Washington's price — under position A Washington was never charged for asset construction. See §7A.

### 6A. The RHTP / WPCO codebase — the current source of truth

`C:\GBS\Clients\State of NY\Finalrhtpdemo` — 322,238 lines of TS/TSX, 481 test files, 105 Java files, a HAPI FHIR server, a quality ratchet, and eleven build iterations each closed by a five-persona red-team panel. `src/lib/config/seamDispositions.ts` (15 Sep) declares **29 seams — 4 real-impl, 22 fail-closed-stub, 3 mock-only** and is the freshest statement of what is real.

**Stale documents, named.** `verification/GAP_AND_STUB_RISK_REGISTER.md` (23 Aug) closes Iteration 11 at "record 20/20". `docs/production-plan/REMAINING_WORK_ROADMAP.md` (30 Aug) still says "7/20 domains, Iterations 0–4 complete". Under the currency rule the seam manifest and the code govern; the roadmap is stale and must not be estimated from.

#### 6A.1 MVP components

| # | Component | Repo evidence | Grade |
|---|---|---|---|
| 1 | One record per person | `lib/identity` 3,466 LOC — empiResolver, matchEngine, survivorship, crossReference; `/api/match` | Demo-grade; C360 PIX/PDQ is the production source (◐) |
| 2 | Consent | `lib/consent` 418 LOC incl. `part2Consent`; register F2 says segmentation is "a blunt drop on a wrong basis" | Thin — C360 enforcement is the production path (◐) |
| 3 | Referrals | `lib/referrals` 524 LOC, one file is `mockReferrals.ts` | Demo-grade; C360 referral is the production path (◐) |
| 4 | Directory | `cbo-directory` UI 1,614 LOC; providerDirectory seam stubbed | UI real, data from C360 (◐) |
| 5 | Worker screen | ~7,600 LOC of worker screens + admin-console 5,386 | Real UI at demo grade; extends the C360 worker UI (◐) |
| 6 | One way in | `fhirStore` = **real-impl**, wired to HAPI; 57 API routes | **Real** |
| 7 | Complete history | outbox 959 · idempotency 392 · deadLetter 1,190 · evidence 2,269, ledger integrity, signing key | Architected, fail-closed; C360 NAS is the event source (◐) |
| 8 | Certification | `lib/certification` is a capability-statement and readiness matrix | Not HITRUST evidence; C360 holds the certificate (◐) |

#### 6A.2 Engines and agents — the Phase 2/3 layer

| Engine | Repo evidence | Seam | Grade |
|---|---|---|---|
| Knowledge graph | `graph` 4,780 / 51 + `wpcGraph` 3,064 / 16 — projector, replay, lens, mapping, Cypher generation; **101 graph tests** | fail-closed-stub | **Substantial** — harden and wire, not build |
| Journey engine | `journeyContext`, `storySteps`, `lifecycle` 1,012 LOC; 7 tests | — | Partial |
| Signal dispositioning | `sde` 1,775 / 16 — consentGate, taxonomy, policy, intake, touchpoint, audit; 27 tests | mock-only | Real shape, no production consumer |
| Whole-person ranking | `wpc` 786 + attention, memberSignals; 3 tests | — | Thin |
| Care plan intelligence | `carePlan` 2,188 / 14 + `careTeam` 1,916 / 11; 19 tests | mock-only | Partial — and server-side generation (WPC-CD1) is **de-scoped by owner directive** |
| Agent runtime | `agentRuntime` 1,354 / 11 — engine, escalation, events, inbox, `FAKE_FIDELITY.md` | **real-impl** | **Real** |
| Agent governance | `agents/governance` 517 LOC — decisionGate, decisionProvenance, fairness, interlock | — | **Real shape** |
| Governed agents | **2 registered manifests** — outreach-agent, referral-coordination-agent; both `autonomyTier: HITL`, `phiPosture: references-only`, tool allowlists, escalation policy refs | real-impl (manifests) | Pattern proven, population small |
| Dispatch | `agents/dispatch` 378 LOC + routing data | — | Skeleton |
| Care gap / measures | `measures` 254 LOC + `care-gap-closure-verification` route; DEQM ingest; 21 tests | fail-closed-stub | Thin |
| Policy substrate | `policy` **26,639 LOC / 95 files**; 117 policy tests | — | **Large head start for the configuration studio** |
| Golden thread | `goldenThread` 10,251 / 44 — escalation router, ledger analytics, medical necessity, NIST map | — | Substantial, payer-shaped: check CIE relevance before crediting |
| Terminology | `terminology` 3,914 / 37 — the stage-4 semantic gate; 33 tests | fail-closed-stub | Real shape |
| Network adequacy | `networkAdequacy` 2,768 / 6 | mock-only | Demo-grade |

**The finding that changes the bid narrative.** The agent layer's hard part is built: a real runtime, a governance module with a decision gate, provenance, fairness and interlock, and manifests that declare `HITL` autonomy, a tool allowlist and a references-only PHI posture. What is small is the *population* — two agents. That is the right way round, and it is defensible in an interview in a way that "we have twelve agents" is not.

**The programme layer, previously unread.** `docs/` holds 242 markdown files including a 40-file `production-plan/` (gap execution plan, remaining-work roadmap, D1 gap matrix, ADRs, contracts, load-test spec, deployment config spec, executive brief, care-plan and prior-auth hardening, coalition-run). `verification/` holds ~83 adversarial findings under a live register. **This is Technical-block (150 pt) and Experience-block (100 pt) evidence the response does not currently use.**

**Register items that are WA CIE risks, already named and owned:** F2 42 CFR Part 2 segmentation · NS-02 zero metrics or tracing, "runs blind in production" · NS-03 no right-to-delete across the append-only stores · **NS-05 live-integration-executed count is 0 — every concurrency and durability guarantee proven only against fakes.** NS-05 is the one a state security reviewer will find.

---

### 6B. Connect360 source verification — the next pass

Access to the current Connect360 GitHub repositories is expected. That pass settles the ◐ items in §6.1 and confirms or reverses the credits in the Re-derivation v2 tab. It is run under the rules below and nowhere near a client conversation until it is finished.

#### 6B.1 What source can and cannot settle

Reading the product's source is stronger evidence than any probe, and weaker than a demonstration. Three marks, kept distinct:

| Mark | Reached by | Example |
|---|---|---|
| **●c** | **Code-verified** — the mechanism is present in source, with its enforcement point and a test that would fail if it were removed | a consent filter applied on the read path, with a test asserting a withheld resource is absent from the response |
| **●d** | **Demo-verified** — shown working against a running instance | the same withholding, live, in a CBO worker session |
| **◐** | Stated, neither of the above | "consent enforcement is covered" |

**A route, a type, a config flag or a class name is not ●c.** Presence of `Consent` in a schema proves a shape; only the enforcement point proves the behaviour. The standing test, borrowed from R5: *would this code path change the answer if it were deleted?* If not, it is decoration and the mark stays ◐.

**●c is not ●d.** Source proves the capability exists in the product. It does not prove it is enabled in the tenant Washington would receive, licensed at the tier we are bidding, or demonstrable on 16–20 November. Only ●d earns the demonstration's 350 points, and only ●d may be presented to Washington as a capability.

**P2 can never be settled by source.** HITRUST r2 and SOC 2 Type II are certificates, not code. P2 closes on a certificate with its scope boundary and expiry, and on a written answer to what the joint Connect360 + WPCO solution inherits versus what must be certified afresh. Nothing in a repository closes it.

#### 6B.2 What to read, per proof

| Proof | Read for | Settles when |
|---|---|---|
| **P1** consent | the read-path interception point; how a directive is evaluated against requesting entity, purpose-of-use and validity window; revoke propagation; `securityLabel` handling | a withheld resource is provably absent from a response, under test |
| **P3** worker UI | the worker-facing application, its role gating, and its extension points | the extension list for CIE worker tasks is agreed against real components, not screenshots |
| **P4** RBAC | the role and permission model, the enforcement point, cross-organisation denial | a denied cross-org read is provable, and delegated CBO admin is located or named as absent |
| **P5** directory | the directory model, its update path, and any federation or sync mechanism | currency and the statewide federation path are established |
| **P6** identity | the PIX / PDQ (and PIXm / PDQm) actor implementations, match and merge semantics, un-merge and link history | the integration contract WPCO codes against is fixed, and survivorship ownership is settled |
| **P7** referral | the referral lifecycle, status model, reason vocabulary, and whether non-clinical referrals share it | a tracked non-clinical referral reaches a closed state with a reason |
| **P8** events | the NAS subscription model, fan-out, ordering guarantees, replay and delivery semantics | subscription limits are known and the ordering guarantee is stated |

#### 6B.3 The verification ledger — mandatory output

One row per proof, written before any number moves:

`proof · claim · repository and path · commit SHA · what the code proves · mark after (●c / ●d / ◐ / ○) · credit confirmed or reversed (FTE-months) · residual work named`

The commit SHA matters: the credit is evidence against a point in time, and a later refactor can remove what it rested on. A credit with no SHA is not a credit; it is an opinion with a decimal point.

#### 6B.4 Commercial consequences to settle in the same pass

Reading the source raises three questions the estimate currently answers by assumption:

1. **Integrate against, or extend inside?** Extending Connect360's own code is cheaper in effort and dearer in everything else — release coupling, IP ownership, who maintains the fork, and whether the next deployment inherits it. The Re-derivation credits assume *integrate against a stable surface*. If the real answer is *extend inside*, the effort falls further and the asset story weakens, because work inside the vendor's product is not obviously ours to reuse.
2. **Licence tier and tenant configuration.** A capability present in `main` and absent from the tier Washington buys is worth nothing to this bid.
3. **Release cadence and version pinning.** The façade freeze at week 14 (Rule 4) assumes the platform beneath it is stable for the MVP window. The repository's release history answers that; assumption A11 does not.

#### 6B.5 Reversal rule

The Re-derivation v2 credits are **conditional**. If source verification shows a capability is absent, thinner than stated, or unavailable at our tier, the affected line reverts to its pre-derivation figure and the reversal is logged under Rule 8. This is why the deck body still carries the verified 151.35 / 31.35 baseline: the number to revert *to* must remain visible and unedited until the proofs land.

**Order of operations.** Source pass → verification ledger → confirm or reverse credits → re-number the deck body → then, and only then, the demonstration script. Never re-number on the strength of a repository alone.

---

## 7. The model

**CY2027** — 71.5 FTE-months, **31.35 asset / 40.15 client** (44% asset). Line-level list is the audited MVP list; it is the only year traced to requirements.

**Five years** — 320.5 FTE-months, **151.35 asset / 169.15 client** (47% asset). Asset **$5,562,112**; client labour **$6,216,262**.

| CY | Phase | Asset | Client | Asset releases |
|---|---|---|---|---|
| 2027 | Phase 1 · MVP | 31.35 | 40.15 | v1.0 |
| 2028 | Phase 2 · care coordination | 23.00 | 42.00 | v2.0 · v2.1 |
| 2029 | Phase 3a · intelligence | 40.00 | 26.00 | v3.0 · v3.1 |
| 2030 | Phase 3b · agentic | 27.00 | 33.00 | v4.0 · v4.1 |
| 2031 | Phase 3c · orchestration | 30.00 | 28.00 | v5.0 · v5.1 |

Asset effort by source family: WPCO engines 63.00 (42%) · Connect360 extensions 29.15 (19%) · agentic runtime, agents and assurance 27.00 (18%) · platform 16.70 (11%) · worker experience 15.50 (10%).

**The release ladder** — client work on a stream cannot start until its asset release exists:

| Release | Week | Content | Unblocks |
|---|---|---|---|
| R1 | 8 | write path — identity, consent, provenance, RBAC, event log | WA consent policy, org hierarchy, retention config |
| R2 | 14 | contract surfaces — façade, domain verbs, reason codes | partner onboarding may begin; surface then frozen (Rule 4) |
| R3 | 20 | MVP product — worker screen, projection, resolver, directory adapter | WA configuration, directory content, UAT |
| GA | 24 | certified build — HITRUST, SOC 2, pen test, accessibility | WaTech SDR submission (C8) |
| GO | 26 | — | production cutover, 6–8 partners live |

**CY2028–31 lines are a planning construct** built to the year totals above, not requirement-traced — no Phase 2/3 requirement list exists in the RFP (A21). Say so every time they are shown.

---

## 8. Funding position

**Decision, 16 Sep 2026 (A25): the asset is developed and absorbed from a base-asset perspective.** All 151.35 asset FTE-months sit on the IBM product P&L in every year. Washington is charged for its own deployment only.

| Position | IBM product investment | WA five-year price | Every year clears? |
|---|---|---|---|
| **A — base: absorbed, all years** | **$5,562,112** | **$9,629,181** | yes · $7.67M headroom |
| B — fallback: absorbed in the committed years, half thereafter | $3,779,738 | $11,609,597 | yes |
| C — floor: committed years only | $1,997,362 | $13,590,014 | yes |
| Boundary — no absorption | $0 | $15,809,306 | **NO — CY2027 over by $108,472** |

The boundary case is the argument: without absorption the bid breaches an annual ceiling and may be deemed nonresponsive (C2). Absorption is not generosity, it is responsiveness.

Washington's price by year under A: 2027 $2,228,347 · 2028 $2,248,333 · 2029 $1,595,000 · 2030 $1,880,833 · 2031 $1,676,667.

**The downside is the same in all three positions.** If no renewal is ever exercised, IBM has spent **$1,997,362** — the committed-year asset work — under A, B or C alike, because the renewal-year asset work simply never happens. $5,562,112 is the full-programme investment, not the exposure. Quoting it as the downside overstates the risk by a factor of nearly three.

Price advantage is always measured against the **$15,809,306** fully-loaded bid: A $6,180,125 · B $4,199,709 · C $2,219,292. State the comparator whenever the advantage is quoted, or the number cannot be checked.

---

## 9. Phase sequence

Each phase has an exit gate. Do not proceed past a failed gate.

| Phase | Work · owning persona | Exit gate |
|---|---|---|
| 0 | E2a · Re-read C1–C10 against the current corpus; mechanical conflict detection across the RFP, the plan and the model | No unresolved conflict, or each one logged with an ID |
| 0b | E2c · **Connect360 source verification (§6B)** when access exists | A verification ledger exists with a commit SHA per proof; credits confirmed or reversed |
| 1 | E2b · Requirement set → MVP tag → tier assignment by Rule 2 and Rule 3 | Every MVP requirement lands in exactly one tier |
| 2 | E1 · Line-level effort, each split asset/client by Rule 1 | Splits sum to the tier totals; each split has a stated reason |
| 3 | E1 + E2d · Sequence and staffing; compute the cash curve (Rule 6) | Concurrency peak named; the week-14 spend stated |
| 4 | E2d · Price each year; test each ceiling independently (C2) | Every year clears, or the scope moves |
| 5 | E3 · Build the workbook; recalculate | Zero formula errors; all views tie (Rule 5) |
| 6 | E3 · Build the deck from the workbook | No figure without a cell; every slide rendered and inspected |
| 7 | **Coalition red-team pass — §10, §12** | A written finding list exists; Unacceptable items fixed; R5 verdicts recorded |
| 8 | E0 · Deliver, log revisions, commit | Revision row written; commit made |

---

## 10. The coalition — who does the work

Mapped onto the persona families in `rhtp-delivery-framework:agentic-build-framework`. The build B-family becomes an estimating **E-family**; the red-team panel R1–R5 is reused with bid-side targets; the shipped payer domain set D1–D8 is **replaced**, not extended, because WA CIE is not a payer programme (§5) and a lens set shaped for another domain guarantees blind spots.

### 10.1 Estimating coalition — E-family

| ID | Role | Owns | May not |
|---|---|---|---|
| **E0** | Bid orchestrator | Sequencing, gate decisions, what ships | Estimate a line itself |
| **E1** | Estimator / architect — one decisive run before fan-out | Tiering, line-level effort, every asset/client split | Review its own splits |
| **E2a** | RFP mechanics specialist | C1–C10, evaluated cost, responsiveness, submittal forms | Touch effort figures |
| **E2b** | CIE domain specialist | Requirement → tier assignment; what a practitioner would reject | Touch pricing |
| **E2c** | Evidence specialist | The ● / ○ table, gate tests G1–G6, the Connect360 teardown | Promote a ○ to ● without a run |
| **E2d** | Commercial specialist | Ceilings, margin, funding position, the cash curve (Rule 6) | Change scope to make a year fit |
| **E3** | Reconciler (convergence) | Tie-out across workbook, deck and narrative | Ship on a mismatch |

E2a–E2d run in parallel on disjoint surfaces. E1's output is frozen before they start, in the same way a spine is frozen before specialist fan-out: they attack and annotate it, they do not edit it in flight.

### 10.2 Red-team panel — R1–R5, retargeted from code to a bid

Mandatory after E3 convergence. **Every persona must produce findings; "looks fine" is a failed review.** The reviewer may not also be the builder.

- **R1 · Domain-fidelity adversary** — a senior CIE authority. Not checking arithmetic; checking whether the *plan* is naive. What would a state HHS practitioner or a CBO director reject? Which standard, lifecycle or mechanism is absent or toy?
- **R2 · Negative-space adversary** — finds what is ABSENT, by category: failure paths, operability, data lifecycle, reconciliation, governance, workforce and training, escalation and override, the roles that touch the system but have no surface in the plan.
- **R3 · Evidence-legitimacy adversary** — the stub-legitimacy persona, transposed. **Every ○ is a stub.** Grade each Acceptable / Risky / Unacceptable. A datasheet claim presented as capability is *Unacceptable* and is fixed in the same pass. Ask of each: does it fail open (a plausible-looking claim) or closed (an explicit gap with a gate test)?
- **R4 · Estimate adversary** — arithmetic, symmetry and ties. Are additions and reductions priced on the same basis? Does every view reconcile (Rule 5)? Is any figure carried from a superseded frame? This is the class that caught the 71.7%-vs-52.3% blend asymmetry.
- **R5 · Cross-examiner** — attacks the review's own claims. For every *supported / closed / cleared / ties* claim, UPHOLD or DEMOTE with a rationale. Its test transposes from code to numbers: **would this figure change if the assumption behind it were deleted or inverted?** If not, the assumption is decorative and the claim resting on it is an overclaim.

### 10.3 Derived CIE lens set — W1–W7

Per the lens-completeness doctrine: derive the lenses from this domain's non-functional and regulatory surface, and prove every risk dimension has an owner. Each is a persona card of the same shape — role, mandate, tree-of-thought hypothesis generation, ranked findings.

| Lens | Owns the risk that… |
|---|---|
| **W1 · Cross-boundary consent** | consent is recorded but not enforced at read; revoke does not propagate; 42 CFR Part 2 and minimum-necessary are asserted rather than mechanised; purpose-of-use is absent |
| **W2 · Identity and false-match harm** | a wrong merge exposes one person's record to another's worker; un-merge is lossy; there is no stewardship path; matching is tuned for recall in a population where a false positive is a privacy breach |
| **W3 · Tribal and IHS data sovereignty** | 29 federally recognised tribes are treated as ordinary organisations; sovereignty is a configuration flag rather than a data-handling regime |
| **W4 · CBO operational reality** | the plan assumes an IT function the CBO does not have — onboarding, credentials, training, support, low-bandwidth and shared-device use, staff turnover |
| **W5 · Accessibility and language access** | WCAG 2.1 AA and the VPAT are treated as a test pass rather than a design constraint; LEP and assistive-technology users are absent from the workflow |
| **W6 · State security gate** | HITRUST, SOC 2, the penetration test and the WaTech SDR are planned as deliverables rather than pre-conditions against a frozen build (C7, C8) |
| **W7 · Cost defensibility** | the asset/client split reads as cost-shifting to a procurement officer; the rate basis is an assumption; the price is low enough to invite a credibility challenge |

On-demand, not standing: **procurement counsel** (protest exposure, submittal conformance) and **agentic governance** (from CY2030 — human-in-the-loop invariants, where an agent must never be the decider, evaluation and drift).

### 10.4 Coverage map — every dimension has an owner

| Risk dimension | Owning lens |
|---|---|
| Responsiveness and evaluation mechanics | E2a + R1 |
| Privacy and consent | W1 |
| Identity integrity | W2 |
| Sovereignty | W3 |
| Adoption and workforce | W4 |
| Accessibility and language | W5 |
| Security certification and state gate | W6 |
| Cost integrity and defensibility | W7 + R4 |
| Absence of anything above | R2 |
| Evidence quality | R3 + E2c |
| The review's own claims | R5 |

A dimension with no owning lens is a gap to fill before the run, not a thing to discover after submission.

---

## 11. Reasoning protocol — chain by default, tree at the forks

Chain of thought is the default. Tree of thought is injected only where a single wrong path is expensive: design forks, red-team hypothesis generation, and genuine ambiguity. Both are recorded, not just performed.

### 11.1 Chain of thought — the default mode

Applies to: line-level effort, every asset/client split, tier assignment, reconciliation. The chain must be short, and it must end in a test.

> *Worked example — the identity split.* Identity is 3.00 FTE-months. Does the merge and un-merge logic travel to the next deployment? Yes, it is product → asset. Does the stewardship queue travel? The queue does; the escalation rules are Washington's policy → split. Does the matching threshold travel? No, every state tunes it → client. The code is the bulk, the configuration is the tail → **2.10 asset / 0.90 client**. Test: would the next deployment rebuild the merge engine? No. Would it retune thresholds? Yes. ✓

Every split in the model carries a chain of this shape. A split with no chain behind it is a guess wearing a decimal point.

### 11.2 Tree of thought — at the forks only

Triggered at four forks and nowhere else: **the funding position · the scope boundary (what is deferrable) · the sequencing of irreversible work · red-team hypothesis generation.** Also triggered by any C10-class ambiguity where the clause could resolve either way.

Rules: enumerate at least three branches before evaluating any; evaluate each against the constraints (C1–C10) before preference; prune explicitly with a stated reason; **keep the pruned branches**.

> *Worked example — the funding position.*
> ```
> Who absorbs asset development?
> ├─ Washington funds all → CY2027 $3,508,472 vs $3.4M → −$108,472
> │   └─ PRUNED: breaches C2. Not a position.
> ├─ IBM absorbs committed years only → WA $13.59M · IBM $2.00M
> │   └─ viable floor; weakest cost score
> ├─ 50% every year → WA $12.72M · IBM $2.78M
> │   └─ PRUNED as a presented option: puts less IBM money into the
> │      committed years than the branches either side of it — not a
> │      middle case, and it reads as incoherent
> ├─ 100/100/50/50/50 → WA $11.61M · IBM $3.78M → viable fallback
> └─ IBM absorbs all years → WA $9.63M · IBM $5.56M
>     └─ SELECTED: strongest cost score, cleanest product story
>        Surviving risk: $3.56M falls in years Comagine may never fund (C4)
> ```

The pruned branches are retained in the Funding scenarios tab. **A tree that discards its dead branches is a chain with extra steps** — the $108,472 branch is the most persuasive item on the funding slide precisely because it failed.

### 11.3 Tree of thought in the red team

R1–R5 and W1–W7 generate hypotheses as a tree, not a list: from each risk dimension, branch into failure modes, then into the mechanism that would prevent each, then check whether the plan contains that mechanism. The finding is the missing mechanism, not the feeling.

### 11.4 What gets recorded

- Every **tree** → the Funding scenarios tab or a decision note, branches and pruning reasons intact.
- Every **chain** → the reason column beside its line in the model.
- Every **finding** → the register, with severity and an owner.
- Every **demotion by R5** → straight back to its true status; a demoted claim may not be re-asserted without new evidence.

---

## 12. Adversarial pass — mandatory, not optional

This step exists because it was skipped, and because the last time it ran it caught the two most expensive errors in the engagement: an asymmetric offshore blend (additions priced at 71.7% offshore against reductions at 52.3%) and the fact that **nobody, across four review cycles, had read C1**.

Run the full panel — R1–R5 plus the W-lenses the coverage map (§10.4) requires. Five standing questions the panel must answer, whatever else it finds:

- **Responsiveness.** Does any year breach a ceiling? Is anything claimed that cannot be demonstrated live in November? Does the response survive the Sec. 5.7 ambiguity (C10) resolving the *other* way?
- **The split.** Take the position of a state procurement officer who suspects cost-shifting: is the asset/client line drawn by the asset test, or to flatter the bid? Name three lines a hostile reviewer would move, and what moving them costs.
- **Evidence.** Every ● — would it survive being demonstrated? Every ○ — is the gate test specified, and is the plan honest about the cost if it fails?
- **Deliverability.** 13 concurrent US-located people by week 6, with no mobilisation payment. 6–8 partners onboarded in twelve weeks. Certification against a build frozen at week 24 with two weeks of float. Which breaks first?
- **The investment.** $5.56M of product investment, $3.56M of it in years Comagine may never fund (C4). Does the absorption argument survive an IBM investment board? Is a $9.63M bid against a $17.3M envelope *too* low to be credible?

**Phase 8 may not ship without a written finding list from this pass.** Zero findings is not a pass; it is a failed review, and it is reported as one.

---


## 13. Stop conditions

Halt and report rather than work around:

- A rate card arrives that contradicts §3 → every figure is re-derived, nothing is patched.
- A gate test G1–G6 fails → the configuration case becomes a construction case; the affordability tab governs.
- An addendum changes a ceiling, a date or the evaluation weighting → return to Phase 0.
- Any artefact would ship with a number that has no cell behind it.
- Source verification shows a capability is absent, thinner than stated, or unavailable at the tier Washington buys → the affected line reverts to its pre-derivation figure and the reversal is logged (§6B.5). Never re-number the deck body on the strength of a repository alone.

---

## 14. Open items

1. Run G1–G6 against the live instance.
2. Settle the teaming structure on HITRUST and SOC 2 — it changes Submittal Form A.
3. Submit two written questions to Comagine by **9 October 2026**: the Sec. 5.7 Evaluated Cost definition (C10), and the statewide directory carve-out (Sec. 3.1, A20).
4. Obtain the real US rate card (§3).
5. Product investment board decision on the asset investment (§8) — $5,562,112 at the verified baseline, $4,386,112 if the Re-derivation credits survive source verification.
6. Obtain Connect360 repository access and run the §6B pass; produce the verification ledger before any deck re-number.
7. Settle integrate-against versus extend-inside, the licence tier, and the release cadence (§6B.4) — three assumptions the estimate currently carries without evidence.

---

*IBM Consulting · Health & Human Services · estimate class 4 · rates are assumptions pending the rate card · US-only delivery per RFP Sec. 3.6.4*
