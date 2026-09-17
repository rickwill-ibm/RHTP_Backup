# WA CIE — optimized delivery plan

**17 September 2026 · IBM Consulting · Joint Connect360 + WPCO response · Draft for pricing review**

> **FRAME** — Washington Community Information Exchange, procured by Comagine Health for Washington HCA. A statewide health-and-social-care coordination platform, delivered as a joint Connect360 + WPCO response. Connect360 is pre-existing; Washington funds configuration, integration, implementation and operations.
> **NOT THE FRAME** — This is not the payer asset build. The prior estimate was a US health-payer platform; roughly $2.35M of named scope in it has no WA CIE buyer at any phase and has been deleted rather than deferred.
> **SHAPE** — This memo plus `WA_CIE_Optimized_Delivery_Plan.xlsx`: assumptions, a line-by-line revision log, the CY2027 MVP, a five-year phase plan right-sized to the annual ceilings, six gate tests, an affordability model and an open-risk register.
> **DONE** — Every line of the original plan carries a disposition and a reason; every year fits, or the gap is stated with the lever that closes it.

---

## Recommendation

**Bid it, on the configuration case, at a thin year-one margin — and run six tests first.** Re-scoped to the CIE and priced US-only, CY2027 lands at **$3,508,472 against a $3,400,000 ceiling at a 10% margin — $108,472 over, and inside the ceiling at roughly 7%.** Across five years the plan prices at **$15.81M against a $17.3M envelope, with $1.49M of headroom.** That works. What does not work is the construction case: if the platform gaps have to be built rather than configured, CY2027 is **$4.7M over the ceiling** and no pricing structure recovers it. **Six tests, none costing more than a day, decide $2,205,000 of CY2027 scope.** Run them before Submittal Form F is priced.

---

## The two decisions that reshaped everything

**1. No offshore content.** RFP Sec. 3.6.4: *"All services under the resulting contract, by the Contractor and any Subcontractors at any tier, must be performed within the United States or its territories."* The prior estimate's 54.3% offshore blend is void for this bid. Repriced at 100% onshore premium, the prior committed figure moves from $5,093,845 to **$8,023,500**, and Position B from $6,316,265 to **$10,573,650**. This plan is priced at a blended **$36,750/FTE-month** — 55% from a US delivery centre or territory at $30,000, 45% onshore premium at $45,000. **Both rates are assumptions; no rate card has been supplied and the prior plan's rates were marked ILLUSTRATIVE.**

**2. The plan was built for a payer; the buyer is a CIE.** Zero occurrences of claims adjudication, 837/835, HCC/CDPS, DRG grouping, HEDIS, prior authorisation, CMS-0057-F or payer-to-payer exchange appear anywhere in the RFP, the Concept of Operations or the 212 requirements. X12 appears once, as one of several payload formats an adapter must transform, with *"or equivalent"* in the acceptance criterion. **That is an adapter, not a claims spine.**

---

## What moved out — deletion, not deferral

Deferral moves cost; deletion removes it. **Named deletions alone total $2,354,350**, and the unnamed payer scope inside Wave 1 is larger again.

| Deleted | Value | Why |
|---|---|---|
| Prior-Auth / Coverage / Financial Clearance bucket | $1,004,750 | Payer utilisation management |
| CMS-0057-F bucket | $545,050 | A CIE is not an impacted payer |
| Epic / Cerner SMART launch + CDS Hooks write-back | $506,250 | Not a WA CIE MVP requirement; MVP partners are CBO and HMIS systems more than EHRs |
| ADF / Databricks secondary path | $298,300 | A reusable-asset hedge for Databricks-native payer clients. One state, one deployment, SaaS preferred |
| Claims / X12 / NCPDP spine, SNIP, corrections and voids, coding verification | ~58 Gantt weeks | No claims adjudication anywhere in scope |
| HCC/CDPS+Rx, DRG/APR-DRG, episode groupers; RAF stratification and coding gaps | — | Payer risk adjustment |
| HEDIS / Stars / MIPS load to Measure / MeasureReport | — | Quality measurement is a payer function |
| Total cost of care, gain-share, braided funding, executive finance dashboard | — | Payer financial analytics |
| Dual-backend abstraction, tenant-onboarding automation, deployable-asset packaging | — | Product investment, not bid scope. One hosted deployment |

**And the largest inversion.** The payer plan schedules population-health analytics at week 18 and referrals at week 34–42. **The RFP does the opposite:** referral management is the largest MVP family at 15 requirements due 30 June 2027, while population-level and equity analytics are named in writing as Phase 2 and the client portal and event notification as Phase 3. Referral tracking, task routing, cross-team escalation, HRSN screening and the CBO directory all **move forward into CY2027**.

---

## What moved in — twelve workstreams the plan did not contain

| Added | Why the plan had no line for it |
|---|---|
| **Participant portal, worker-facing** | No worker UI exists in Connect360 — only API surface — and the prior staffing model contained **no front-end engineering role at all**. The RFP makes the portal a mandated participation option for organisations without connected systems |
| **RBAC and delegated organisation administration** | No role or permission type appears in the 553 introspected types. Identity and access management is a named MVP capability area with 10 MVP requirements |
| **Event publication contract** | The keystone. Stable type vocabulary, idempotency, ordering, 3–5 subscriptions exposed |
| **Owned, versioned integration façade** | Do not make another vendor's internal schema the State of Washington's public integration contract |
| **Domain-verb mutations + statewide reason codes** | Task mutations are generic CRUD. Across a federation of independent organisations that guarantees drift and makes the standardised-reason requirement unenforceable |
| **Read-side reporting projection** | The proxy blocks `_total=accurate` and `_summary=count`, so no aggregate is answerable from the FHIR path. Reporting is a named MVP capability |
| **`citizenEverything` composite resolver** | Nine resolvers fan out N+1 on the most-loaded screen |
| **Certification lane** | HITRUST r2, SOC 2 Type II, penetration test, WaTech SDR and Privacy Threshold Analysis. Excluded from the prior estimate; here it is a contractual pre-condition of launch |
| **Accessibility — 508 / WCAG 2.1 AA, VPAT / ACR** | Absent from the entire prior pack |
| **Section 1557 language access** | Absent from the entire prior pack |
| **Tribal and IHS data sovereignty** | **Restored.** Withdrawn from the prior estimate as "geography-specific". Washington has 29 federally recognised tribes and the RFP requires compliance with applicable Tribal requirements |
| **Directory federation adapter + loading toolkit** | **Restored in changed form.** Withdrawn from the prior estimate as "per-deployment content"; the resource directory is a named MVP capability |

---

## The sequencing rule, and why the engines survive

You said the knowledge graph, the longitudinal record, the core engines and the agents will all be needed. They are all in the plan. The rule that lets them arrive later without becoming rebuilds:

> **A capability is safely deferrable if and only if it can be reconstructed from what MVP wrote down.**

Everything on the **write path** is irreversible — a fact not captured cannot be recovered. Everything on the **read path** is a function of history and can be computed at any future date, provided the history exists in replayable form. **The graph, the WPC intelligence engine, the journey engine, signal dispositioning, care-plan intelligence and the agents are all read-path.** That is precisely why they are deferrable.

So CY2027 buys the write path and the seams, not the engines:

| At MVP | Deferred, and to when |
|---|---|
| The **edge set** recorded as dated, provenance-bearing facts | The graph as a running projection — CY2029, hydrated by replaying the MVP event log |
| The **event log** — stable types, idempotency, ordering | The engines that consume it — CY2029–31 |
| The **temporal spine** recorded on every state change | The journey engine over it — CY2029 |
| The **`citizenEverything` seam** | WPC context ranking behind it — CY2029, with no partner-facing change |
| A **stable event-type vocabulary** | Signal dispositioning — CY2030 |
| **Domain verbs with recorded actor and reason**, and a non-human actor representation in the audit model | Governed agents — CY2031 |

**The sharper version of your own position:** the graph is foundational in Phase 2, and the only way to have it in Phase 2 is to record its edges and publish its events in MVP. That is 3–4 weeks of architect and FHIR-engineer time against 45 duration weeks in the original plan — and it is a far better thing to put in front of a state procurement.

---

## The numbers

**CY2027 MVP, configuration case — 71.5 FTE-months, $3,157,625 delivered cost**

| Tier | FTE-mo | Cost |
|---|---|---|
| Tier 1 — irreversible (identity, consent, provenance, RBAC, event log) | 9.5 | $349,125 |
| Tier 2 — contract surfaces (façade, domain verbs) | 6.0 | $220,500 |
| Tier 3 — the MVP product (portal, projection, conform, resolver, directory, referral, screening) | 24.5 | $900,375 |
| Tier 4 — compliance engineering (accessibility, Tribal) | 4.5 | $165,375 |
| Non-build (certification, onboarding factory, PM, operations) | 27.0 | $992,250 |
| **Total** | **71.5** | **$2,627,625** + $530,000 non-labour |

Tier 1 and Tier 2 start week 1 and must complete before partner onboarding begins — once 6–8 organisations hold production integrations against a surface, it cannot be taken away. The certification lane runs in parallel from week 1.

**Five-year plan, right-sized to the ceilings**

| CY | FTE-mo | Cost | Price @10% GM | Ceiling | Headroom |
|---|---|---|---|---|---|
| 2027 | 71.5 | $3,157,625 | $3,508,472 | $3,400,000 | **−$108,472** |
| 2028 | 65.0 | $2,868,750 | $3,187,500 | $3,400,000 | $212,500 |
| 2029 | 66.0 | $2,905,500 | $3,228,333 | $3,500,000 | $271,667 |
| 2030 | 60.0 | $2,685,000 | $2,983,333 | $3,500,000 | $516,667 |
| 2031 | 58.0 | $2,611,500 | $2,901,667 | $3,500,000 | $598,333 |
| **Total** | **320.5** | **$14,228,375** | **$15,809,306** | **$17,300,000** | **$1,490,694** |

**CY2027 is the only year that does not fit**, and the gap is closeable: three FTE-months of scope, or a year-one margin of about 7% recovered in CY2028–31 where there is headroom. Structure the margin that way rather than trimming MVP scope — the MVP date is contractual and the integration count is not a variable.

**What does not fit even across five years: 51 FTE-months, $1,874,250** — the client-facing portal, the agentic marketplace, the household and family thread, and agent ROI reporting. Stated plainly: **the full WPCO vision does not fit inside the WA CIE envelope.** The engines and the graph arrive; the marketplace and the client portal do not. If they matter, they need a second funding source — which is an argument for a pipeline, not for loading them into this bid.

---

## Six tests decide $2,205,000 of CY2027 scope

| Gate | Question | Cost | Swing |
|---|---|---|---|
| **G3** | Can the existing Connect360 portal be extended to worker roles, or is a new worker application required? | Repo review + staff-scoped demo | **27.0 FTE-mo · $992,250** |
| **G5** | Is the resource directory carved out to the statewide directory partner? | Written question to Comagine by 9 Oct | 10.0 FTE-mo · $367,500 |
| **G2** | Does Connect360 hold current HITRUST r2 and SOC 2 Type II? | One call | 8.0 FTE-mo · $294,000 |
| **G4** | Does a role / permission model with delegated org admin exist? | Schema review | 5.5 FTE-mo · $202,125 |
| **G6** | Does `matchPerson` / `resolveIdentity` exist, and can it be fronted? | One call | 5.0 FTE-mo · $183,750 |
| **G1** | Is `provision.securityLabel` enforced at **query** time, not just stored? | One hour | 4.5 FTE-mo · $165,375 |

**G2 is the one that decides whether this is deliverable at all.** Certification is a pre-condition of MVP launch with an immediate-termination trigger, and HITRUST r2 from a standing start is 9–18 months against a 25-week runway. If the answer is no, this bid needs a certified partner — and that changes Submittal Form A, which is due in 36 days.

---

## Assumptions, all of them

Numbered A1–A20 on the workbook's Assumptions sheet. The ones that carry the most weight:

- **A3 / A4 — both rates are assumptions.** $30,000 US delivery centre, $45,000 onshore premium. No rate card has been supplied. This caveat has now been live across three document versions and it sits on a $15.8M number.
- **A5 — 55% of effort from a US delivery centre or territory.** Puerto Rico and Guam are US territories and are the only legitimate low-cost lever under Sec. 3.6.4. Key personnel, SMEs, architects and client-facing roles are onshore premium.
- **A7 — 10% blended gross margin**, with CY2027 carrying less and CY2028–31 more.
- **A8 / A9 — non-labour** at $530,000 in CY2027 and $480,000 thereafter: Connect360 internal chargeback, Azure consumption, third-party assessor fees and travel. Travel is inside the firm-fixed price per Sec. 3.6.4 and is not separately payable. **Terminology licensing, HISP fees and AIRS membership are not yet modelled.**
- **A11 — Connect360 is pre-existing at contract signature.** This is both the commercial position and the only posture under which an offshore-built platform is lawful alongside Sec. 3.6.4.
- **A12 — the configuration case.** The whole plan assumes the six gate tests pass.
- **A14 — all 66 non-functional requirements are MVP.** Security, consent segmentation, access control, audit, accessibility and 99.5% API availability apply from day one with no ramp.
- **A16 — two-year term.** CY2029–31 are renewals at Comagine's sole discretion, with no right or expectation of renewal. **Build the investment case on CY2027–28 alone.**

---

## Two things to put in writing before 9 October

**Is the resource directory in scope?** Sec. 3.1 says Comagine is in discussions with a statewide directory partner. The answer moves 10 FTE-months and it changes the demonstration.

**Which Evaluated Cost definition governs?** Sec. 5.7 defines it twice — once with three components and once with four, and in the four-component version Year-1 M&O and subscription are counted separately *and* inside the full five-year recurring total. Recurring dollars appear to be scored roughly twice, which penalises amortising a platform into subscription at about 2× relative to loading it into implementation milestones. It reads as drafting overlap. Asking is free and it moves the cost score.

---

*Estimate class: this is a Class 4 estimate on Class 4 inputs — illustrative rates, no rate card, no bench artifact, six unretired gate tests. Expected accuracy is roughly −20%/+30%. Headline figures should be read to the nearest $100,000 and the precision in the workbook treated as internal consistency, not accuracy.*

*Arithmetic verified programmatically: every cost cell derives from the two rate cells on the Assumptions sheet; the workbook recalculates with 132 formulas and zero errors; the CY2027 MVP total, the phase plan and the affordability model reconcile.*
