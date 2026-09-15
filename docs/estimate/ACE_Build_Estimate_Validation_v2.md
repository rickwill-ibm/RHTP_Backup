# ACE / WHPC build estimate — validation against Connect360

**Reissued 15 September 2026 · IBM Consulting · v2, general-platform frame**
Coalition: Gantt de-duplication adjudicator · delivery estimator · adversarial reviewer.
Inputs: `WHPC_Delivery_Plan_Staffing_latest_1.xlsx`, `ACE_North_Star_Vision_8.pptx`, and the
Connect360 evidence pack (live portal, service architecture, GitHub org, IG repository, and a full
introspection of the live GraphQL supergraph).

> **FRAME — corrected, and this is what v1 got wrong.**
> What is being estimated is a **general, reusable US health-payer whole-person care platform
> asset**, built on IBM Connect360, hardened and productised for deployment by other teams and for
> our own multi-tenant SaaS. It is **not** a response to any procurement and **not** a
> state-specific implementation.
>
> **v1 imported the frame from the wrong document.** It scored a payer asset against a state
> health-and-human-services CIE procurement and carried that procurement's geography into the
> estimate. The plan's own Assumptions tab said otherwise in plain words — *"a reusable product
> asset, hardened"*, *"configuration-driven and multi-tenant — a new client or state is onboarded
> in weeks, not re-implemented"*, and *"client implementation … separate per client — NOT in the
> asset totals."* The frame was in the workbook the whole time and I overrode it with a source
> document. **v2 restores it.**

---

## What is withdrawn, and what survives

**Withdrawn.**

| | v1 item | Why it is invalid for a platform asset |
|---|---|---|
| A5 | State directory corpus + certified curation operation — 9.0 FTE-mo / $285,650 | A named jurisdiction's corpus and its staffed curation run function are **per-deployment content**, not asset build |
| RT2 | "The target state already has an incumbent CIE" as a competitive finding | A single market's competitive position is not an input to a reusable asset's cost |
| — | Tribal / IHS data-sovereignty lane; programme funding-cycle argument | Geography-specific |
| — | Every requirement-coverage reference to the CIE procurement | Not the scope |

**Survives, unchanged and re-tested under the corrected frame.** The arithmetic validation of the
model. All five model defects — chiefly that **no front-end or application engineering role exists
anywhere in the plan**. The duration-versus-effort correction. The de-duplication logic for
platform-generic capabilities. The caseworker-application exposure. Additions A1–A4 and A6. The
EMPI mispricing. The rate sensitivity.

**Two items replace what was withdrawn**, because the underlying facts were real and only the
geography was wrong:

- **A5′ — a jurisdiction-neutral directory content-onboarding toolkit.** The asset must ship the
  *loader*; the *content* is per-deployment.
- **A8 — an external I&R / CIE federation adapter framework.** The incumbent-network finding was
  correct and generalises: in most US markets a commercial closed-loop platform or a 211/AIRS
  operator already holds the directory and the referral loop. That is an asset requirement, not a
  one-market negotiation.

---

## Recommendation

**The sharpened pen cuts the other way.** Connect360 removes real work — but the same evidence that
proves it exposes considerably more work the plan does not contain.

| | FTE-mo | Cost | vs original |
|---|---|---|---|
| **Original committed** | 178.30 | **$5,093,845** | — |
| less de-duplication against Connect360 | −11.33 | −$326,330 | −6.4% |
| plus seven platform-gap workstreams (A1–A6, A8) | +35.00 | +$821,700 | |
| **Position A — gaps, no worker application** | **201.97** | **$5,589,215** | **+9.7%** |
| plus the worker application (A7) | +33.00 | +$727,050 | |
| **Position B — revised committed total** | **234.97** | **$6,316,265** | **+24.0%** |

**Additions exceed reductions 4.75 to 1.** The platform credit is ~6% of the build; what it exposes
is ~30%. The re-frame moved the answer by **$14,600 — 0.2%.** That is the honest result, and it is
worth saying out loud: stripping the geography changed the *composition* of the additions
materially and the *total* almost not at all, because what drives this estimate is the platform
evidence, not the market.

**Do not take "73 weeks released" to a partner as a saving.** It is 73 weeks of *schedule duration*
across parallel rows inside a fixed ~70-week envelope. Converted honestly to effort it is
**11.33 FTE-months — 7.4% of the asset build — and it moves no milestone.** Foundation Asset GA
still lands at wk 24 and the programme still ends at wk 70, because neither critical path was
touched. Present this as a **risk-discovery pass that happens to carry a modest credit**, or the
first question in the room will dismantle it.

---

## The model itself is sound. Validate that first, because it earns the right to the rest.

Every bucket, subtotal and per-role split recomputes **to the dollar** against the rate card. The
seventeen staffing roles at their stated offshore shares reproduce the asset-build subtotal exactly:
**$4,317,595**, at a blended **54.3%** offshore.

| Bucket | FTE-mo | Recomputed | Stated |
|---|---|---|---|
| 1) WPC / Connect360 — primary asset | 139.3 | $4,019,295 | ✓ |
| 2) ADF / Databricks delta | 14.0 | $298,300 | ✓ |
| **Asset build** | **153.3** | **$4,317,595** | ✓ |
| 3) EHR / SMART & compliance | 25.0 | $776,250 | ✓ |
| **Committed** | **178.3** | **$5,093,845** | ✓ |

**It is costed at the achievable 54.3% offshore blend, not the 80% target.** That is the single
biggest trap in a model like this and the plan avoids it — costing at target would have understated
committed scope by **$1,492,185 (29.3%)**.

**Five defects worth fixing:**

1. **No front-end or application engineering role exists anywhere in the plan.** Not under-sized —
   absent. There is 4.3 FTE-months of *UX design* across 72 weeks and **zero build**, against
   roughly sixteen worker-facing surfaces the Gantt budgets. This is the largest defect in the
   model and it is the root of Position B. For a product asset it is also the most commercially
   dangerous: a platform sold as deployable cannot ship with its screens unbuilt.
2. **The onshore floor omits solution consulting** — an onshore-located role carrying 3.6 onshore
   FTE-months. Corrected floor 27.79%, ceiling 72.21%; **$111,600 of claimed offshore headroom is
   not there.**
3. **Bucket 2's role detail names a "Databricks / compute engineer" that does not exist** in the 17
   staffing roles, so 5 of its 14 FTE-months are carved out of nothing. Totals still close because
   bucket 1 is a residual.
4. **Waves 2–5 are staffed at 0.63 concurrent FTE per line** — 54% of the schedule and 35% of the
   effort across 33 lines and 243 duration weeks.
5. **Bucket 3 overlaps the Gantt at the SMART launch** (Wave 3, 9 weeks already inside bucket 1).
   Either a double count or an under-scope; unquantified.

**Rate sensitivity — validate the onshore leg first.** Offshore ±20% moves the committed total
±$264,614 (±5.2%). **Onshore ±20% moves it ±$754,155 (±14.8%)** — 2.85× more sensitive, because 74%
of the cost sits on 47% of the effort. Both rates are marked *ILLUSTRATIVE — replace with rate
card*, and that caveat is still live on a $5.09M number.

**Deck-versus-workbook reconciliation.** The workbook is the pre-re-cut baseline; the v8 deck is
current. The deck's split is exactly the workbook's role detail regrouped — SMART engineer 14
($413,000) + SMART QA 5 ($93,250) = 19 FTE-mo / $506,250; HIPAA lead 6 = $270,000. Agentic is
already costed continuously (the AI/agent engineer runs 64 weeks with agent lines in every wave).
**Both v8 changes are presentational; effort and cost move zero.** One consequence: once agentic is
continuous it becomes a fifth non-reducible lane, so no further agentic duration reduction can be
banked.

---

## What Connect360 genuinely removes

94 phased Gantt rows adjudicated: **4 C360_WINS · 30 SPLIT · 59 RETAIN · 1 ALREADY_CREDITED.**
73 duration weeks released in committed scope. Converted to effort at a defensible intensity —
roles apportioned across concurrent lines, weighted by line class, with 15% retained for residual
integration — that is **11.33 FTE-months**. The estimator's own 10% cap did not bind, which is the
best evidence the number is not inflated.

**The five largest, by effort released:**

| Line | Plan wks | Released | Why Connect360 wins |
|---|---|---|---|
| Multi-tenant isolation & tenant onboarding | 13 | 1.20 | `/{tenantId}/{resourceType}`, proxy-enforced token/URL match, tenant-scoped HSDS schema |
| Consent & sensitivity labelling at conform | 9 | 0.61 | Full R4 `ConsentProvision{securityLabel, purpose, actor, period, data}` |
| Consent policy governance | 11 | 0.61 | `ConsentPolicy`, `ConsentVerification`, `balp_ig_1.1.2` |
| Integrated data-spine design | 3 | 0.61 | `ibmch` v1.3, `us_core_5.0.1`, `sdoh_ig_2.0.0` fix the target shape |
| Referral tracking + journey tracker | 9 | 0.58 | `serviceRequestsForOrganization`, `Task{status, statusReason, businessStatus}` |

**What was deliberately not reduced:** every client-implementation row, security authorisation and
pen test, programme governance, CMS conformance testing, every dashboard line (the proxy blocks
`_total=accurate` and `_summary=count`, so reporting is architecturally thin rather than
incidentally missing), every real-time line (one subscription field against 22 change-payload
types), the whole agent and knowledge-graph stack, the claims spine, and the four continuous lanes —
releasing duration from a lane whose span *is* the programme envelope is meaningless.

**The credit is held at 11.33 FTE-mo, and the general frame argues against it, not for it.** Every
retained residual in the register is now a *configurability* residual rather than a one-jurisdiction
residual: a value-set binding layer for N deployments is not the same size as one state's value
sets, and neither is a per-deployment consent-policy authoring surface. Holding the credit constant
while the residuals grow is the unfavourable direction for this memo, and it is left there
deliberately. **Sizing the configurability delta is an open item, not a claimed saving.**

---

## What the same evidence exposes — and this is the finding

| | Workstream | FTE-mo | Cost | Why the plan has no line for it |
|---|---|---|---|---|
| **A7** | **Worker / caseworker application** | **33.0** | **$727,050** | **No worker UI exists in Connect360 — only API surface.** The plan has no front-end engineer. |
| A2 | Read-side reporting projection (CQRS) | 10.0 | $195,800 | No aggregate is answerable from the FHIR path; Waves 2–5 are full of dashboards |
| A1 | Connect360 tenancy & upstream-dependency lane | 6.0 | $204,900 | Three things this build needs sit in another IBM org's backlog |
| **A8** | **External I&R / CIE federation adapter framework** | **6.0** | **$142,900** | **The asset must plug into an incumbent network it does not own** |
| **A5′** | **Directory content-onboarding toolkit** | **5.5** | **$128,150** | **The asset must ship the loader; the corpus is per-deployment** |
| A3 | Domain-verb mutation workstream (Task) | 3.0 | $63,700 | No accept/decline/redirect verbs — the state machine would live in every client |
| A4 | Consent-enforcement verification + `deleteConsent` fix | 2.5 | $48,950 | Deleting a consent destroys the Part 2 disclosure-accounting trail |
| A6 | Profile-binding verification | 2.0 | $37,300 | Packages in a repo are not profiles bound in a running server |

### A5′ — what changed, and why the reduction is not a concession

The v1 line bought **a jurisdiction's corpus and a certified curation operation** at 9.0 FTE-mo.
That is content and a run function; it belongs to a deployment, not to the asset. What the **asset**
owes is the machinery: a connector framework for HSDS / Open Referral and CSV sources, an
AIRS-taxonomy crosswalk, de-duplication and merge, population of the capacity and wait-time fields
the HSDS model already carries, the assurance workflow behind `assured_date` / `assurer_email`, and
a curation console. **5.5 FTE-mo / $128,150** — 1.5 SME to author the curation standard once, 3.0
engineering for the loader, 1.0 UX for the console.

**The $157,500 that came out has not disappeared; it moved to the per-deployment unit below.**
Presenting the reduction as a saving would be a second version of the same error.

### A8 — the incumbent-network adapter, which the general frame makes bigger, not smaller

In most US markets the closed-loop referral network is already held by a commercial platform or a
211/AIRS operator, syncing on the Human Service Data API. An asset that can only talk to its own
directory is not deployable into those markets. **6.0 FTE-mo / $142,900** buys a pluggable adapter
framework plus two reference adapters — an HSDA / Open Referral pull and a 360X / Direct referral
exchange with status round-trip.

**Anti-double-count, stated:** the `v2 CBO directory` residual already retains the 360X federation
contract, and `v1 Referral tracking` already retains the status round-trip from non-C360 receivers.
A8 is sized only for what sits *above* those — making the adapters a **product surface** with a
plug-in contract, rather than one integration per client.

---

## Two costs the asset frame makes visible, both excluded from the net

**1. There is no priced per-deployment unit.** The plan is right that client implementation is
separate from the asset totals — but a product needs a repeatable "cost to stand up deployment N",
and the plan gives it a memo line. The Gantt's own client rows imply it: liaisons wk 10–40, R1
deploy, consent/PHI real-data enablement, EMPI match tuning, security authorisation and pen test,
and the pilot→production glide path, at 2–3 concurrent liaisons across ~28 weeks. **Indicative
16–20 FTE-mo, $596k–$745k per deployment** at a 25%-offshore liaison mix. Excluded from
the net, consistent with the plan's own treatment — but it is the number a buyer will ask for, and
A5′'s withdrawn $157,500 lands here.

**2. Certification.** No HITRUST, SOC 2, FedRAMP or StateRAMP is evidenced anywhere, and Azure's
certifications do not transfer to a solution running on Azure. For a one-off project that is a
conditional. **For a reusable asset it is structural:** the first buyer asks, and the answer travels
to every subsequent one. **Indicative 10–14 FTE-mo internal / $400k–$560k, plus third-party
assessor fees that sit outside this rate card entirely.** Excluded from the net. It must not be
discovered after signature.

---

## The red team's four corrections — take these seriously

**1. The EMPI line is the largest mispriced item in the pack.** The plan budgets 11 weeks to
*integrate* Connect360's EMPI over PIX/PDQ and names it as what keeps identity off the critical
path. But there is no `$match`, no PIX, no PDQ at the gateway, and the EMPI's existence rests on a
verbal statement rather than anything observed. If it is absent, single-tenant-bound or
unfrontable, identity resolution with survivorship and a stewardship queue is **25–35 FTE-months
(~$715k–$1.0M) landing *on* the critical path.** Mark it RED-UNVERIFIED, not ALREADY_CREDITED. One
call settles it.

**2. The asset will usually be a layer above an incumbent network, not a replacement for it.**
This is the generalised form of a finding v1 stated as a single market's competitive problem. It is
not a bid risk; it is a **product-positioning fact with an engineering consequence** (A8) and a
go-to-market consequence: the pitch that survives contact is *"we sit above your existing referral
network and make it whole-person"*, not *"replace it"*. Every deployment inherits a different
incumbent, which is why the adapter has to be a framework rather than an integration.

**3. Three reductions are booked against another IBM org's unscheduled backlog.** A composite
`citizenEverything` resolver, 21 of 22 unexposed change subscriptions, and
`matchPerson`/`resolveIdentity` do not exist at the gateway. The fallback if that team declines is
worse than the schedule risk: polling is blocked by the proxy's count restrictions, and consuming
NATS directly **bypasses `c360-fhir-mp-proxy`, the sole enforcer of tenant isolation.** No written
commitment from the `connect360-saas` org means no credit. **Under the asset frame this is sharper
still:** Foundation Asset GA at wk 24 is a promise made to *client implementation teams*, and it
cannot be made conditional on another P&L's backlog.

**4. The consent assumption's exposure is the asset's own security representation.** If Medplum
does not filter `provision.securityLabel` at query time, the conform pipeline writes labels nothing
enforces — *worse than no labelling*, because the asset's security documentation will then claim a
segmentation it does not deliver, and that claim is carried into **every** client ATO the asset is
handed into. One deployment can discover it; a product propagates it.

**Also unpriced:** internal chargeback for consuming another IBM P&L's platform — zero dollars in a
$5.09M estimate; version coupling to a `develop` branch **149 commits ahead of `main`**; and no
costed exit if the Connect360 dependency fails at month nine.

**And one the re-frame surfaces on its own: configurability is asserted, never tested.** The
Assumptions tab promises *"a new client or state is onboarded in weeks, not re-implemented"*, and
every variable that promise depends on — consent regime, minor-consent age, Part 2 posture, value
sets, program eligibility, benefit rules, directory taxonomy, attribution — is a configuration
surface with no line, no test and no second reference configuration in the plan. **An asset that has
only ever been configured once has not been proven configurable.** A second reference configuration
is the cheapest possible proof and it is not budgeted.

---

## Seven tests. Six of them under a day. None was run before the 73 weeks was claimed.

1. **`securityLabel` enforcement** — write a Consent, query as an out-of-provision principal. One hour. Retires the largest two-sided risk in the pack.
2. **Does the EMPI exist, is it multi-tenant, can it be fronted?** One call. Worth up to $1.0M.
3. **Written commitment from the C360 team** on `citizenEverything`, the 21 subscriptions and `matchPerson`, with dates. Ask in writing.
4. **Is a worker application anywhere in the 36 repos?** Get the repo list. Worth $727k.
5. **Are the SDOHCC profiles bound, not just packaged?** Fetch the `CapabilityStatement`, run one validation.
6. **Name the two reference external networks the asset ships adapters for, and get their API terms in writing.** Decides whether A8 is 6.0 FTE-mo or a partnership dependency.
7. **Has the v8 deck already spent the screening credit?** Slide 06a says social/behavioural screening is "a Connect360 capability we integrate — not built here," which risks crediting the same scope twice.

**An eighth, which only the asset frame asks for:** stand up a **second reference configuration** —
a different payer shape, a different value-set pack, a different consent posture — and time it. That
is the only honest test of "onboarded in weeks."

---

## Confidence

**High on sign, medium-low on magnitude.** Additions exceed reductions 4.75× and no plausible
parameter reverses that. The swings that matter: worker-app concurrency ±$303k · consent test
failure +$400–600k · certification +$400–560k · EMPI absent +$715k–$1.0M · onshore rate ±20%
±$754k.

**The one-line version for the partner:** the de-duplication is real and worth $326,330; the same
evidence exposes $1,548,750 the plan does not contain. Connect360 makes this asset far more
credible and the estimate rather less comfortable, and those are the same fact.

---

*Method note on the re-frame. v1 and v2 differ by $14,600 on a $6.3M number. That is not an
argument that the frame did not matter — it is evidence that the estimate was driven by platform
evidence rather than by market context, and that v1's error was one of **composition and
defensibility** rather than of total. A geography-specific line in a reusable asset's estimate is
indefensible in front of a product review whatever it sums to.*

*Reconciliation notes. The de-duplication credit is stated as $326,330 — recomputed cleanly from the
two rate cells at 11.33 FTE-mo (5.92 offshore / 5.41 onshore); the coalition's per-line figure was
$326,221 and the $109 difference is per-line rounding. The revised per-role table sums to
$5,540,092 against a bucket-derived asset build of $5,540,015, a $77 spread from the same per-role
rounding. Arithmetic verified programmatically: the seventeen original roles at their stated
offshore shares reproduce $4,317,595 and 54.3% offshore exactly; both net positions reconcile.*
