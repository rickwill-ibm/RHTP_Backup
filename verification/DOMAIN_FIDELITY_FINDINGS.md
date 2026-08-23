# Domain-Fidelity Findings — Iterations 0–4 Retroactive Audit

Adversarial healthcare-standard audit of the ACE platform as built through Iteration 4.
Scope: does the design reflect how real payer / HIE / EMPI / terminology / RCM
integrations actually work — not whether the TypeScript is correct. The owner has
already caught three gaps of this class (hash-stub identity, no terminology validation,
missing PIX/PDQ). This audit assumes more and names them.

**Method:** read the five iteration summaries + roadmap + execution plan, then the
actual code in `src/lib/pipeline` (5 stages + 7 adapters), `src/lib/identity`
(matchEngine, empiResolver, external stubs), `src/lib/terminology`, `src/lib/graph`,
`src/lib/sde`, `src/lib/consent`, `src/lib/outbox`, `src/lib/evidence`.

**Legend — severity:** Critical = silently corrupts the record, violates law, or a
core claimed capability is absent where a real deployment cannot go live without it.
High = a real payer/HIE integration would reject or mis-handle production data. Med =
narrows fidelity / correctness but has a workaround or is lower-frequency.

**Owner column:** which existing roadmap iteration should absorb it, or NEW backlog.

Total findings: **26**.

---

## Critical

### F1 — 834 maintenance-type codes ignored; a termination enrolls instead of disenrolling
- **Dimension:** Interoperability (X12 834)
- **What:** `eligibility834.ts` reads `INS-3` as `maintenanceTypeCode` (line 102) but the
  normalizer hardcodes `status: 'active'` and `eventType: 'coverage.enrolled'` (lines
  118–122) for **every** INS loop. INS-3 = `024` (cancellation/termination), `025`
  (reinstatement), `001` (change), `030` (audit) all become an active enrollment. There
  is no read of `DTP*349` (coverage END date) — only `DTP*348` (begin). A monthly full-file
  834 or a disenrollment transaction would **re-activate terminated members**.
- **Why a real deployment needs it:** 834 is the enrollment source of truth. Termination
  and reinstatement are the whole point of the transaction. Getting maintenance-type wrong
  means the platform's coverage/eligibility state is silently false — members show active
  after they've lost Medicaid, driving wrong care-gap and outreach decisions.
- **Severity:** Critical
- **Owner:** I4 (pipeline adapter owns the fix) — or NEW backlog if treated as RCM depth.

### F2 — 42 CFR Part 2 is a blunt drop, detected on the wrong basis, with no consent-directed release, re-disclosure notice, or break-glass
- **Dimension:** Privacy/consent (42 CFR Part 2)
- **What:** Part 2 handling = (a) a hint attached by one message field —
  `adtEncounter.ts:109` flags Part 2 **only** when `PV1-10 === 'CD'`; `cboSdoh.ts:61` only
  when a `program` column contains "sud"/"substance" — and (b) the SDE drops Part 2 at
  intake (Iteration 2 summary). Missing entirely: consent-**directed** disclosure (Part 2
  release requires patient consent naming *recipient* + *purpose*, and the platform models
  no such consent — it can only block, never lawfully release), the **re-disclosure
  prohibition notice** that must travel with any Part 2 data disclosed, and **break-glass**
  (emergency override with audit). Detection is also backwards: Part 2 status derives from
  whether the *source is a federally-assisted SUD program* (a facility/program property),
  not from a service code in one HL7 message — a SUD dx on a general claim is **not** Part 2,
  while any encounter at a Part 2 program **is**.
- **Why a real deployment needs it:** Part 2 is the platform's highest legal-exposure
  surface (the plan devotes Iteration 6 to it). A wrong-basis flag both over-restricts
  (drops legitimately shareable data) and under-restricts (misses real Part 2 data whose
  program never sets the one magic field). No consent-directed release means Part 2 members
  are effectively unusable rather than governed. No re-disclosure/break-glass = not
  compliant.
- **Severity:** Critical
- **Owner:** I6 (BH/SUD Part 2 end-to-end) — promote the consent-directive + re-disclosure
  + break-glass model into its DoD; today only segmentation labeling exists.

### F3 — EMPI has no golden-record survivorship, no cross-reference/link-unlink table, and splits one person across feeds when demographics are absent
- **Dimension:** Identity (EMPI beyond match)
- **What:** `empiResolver.ts` produces an anchored id per call and stops. (a) **No golden
  record / survivorship** — `anchoredIdFor` (line 83) just hashes a canonical key; there is
  no merged demographic record with field-level survivorship (most-recent / most-trusted
  source wins per field). The DP-7 comment (lines around 15) defers survivorship to I8A. (b)
  **No persistent cross-reference (xref) table** mapping source-id ↔ enterprise-id ↔ links,
  so there is no link/unlink or later merge-of-two-enterprise-ids operation — Iteration 2's
  "merge/unmerge by replay" rekeys the *graph*, but the EMPI itself keeps no xref to decide
  *what* merges. (c) **Id-only records mint a brand-new member** — `resolveEmpi` lines
  116–127: a record with no demographics (extremely common for ADT/834 that carry only a
  local id) is minted per `(feed, sourceId)`. The **same person seen through two feeds with
  only ids never links**, and nothing reconciles them when demographics later arrive.
- **Why a real deployment needs it:** The WPC record is the product's center and identity is
  its spine. Without survivorship there is no single demographic truth; without an xref
  there is no link/unlink/merge governance; id-only minting fragments one member into many
  across ADT/834/pharmacy feeds — the exact failure real EMPIs exist to prevent.
- **Severity:** Critical
- **Owner:** I8A pillar 1 (DP-7 survivorship + external reconciliation) — but the id-only
  fragmentation is a NEW backlog item that bites before I8A (every id-only feed today).

### F4 — Stage-4 "US Core / $validate" profile gate is a 4-field structural stub; no profile conformance is enforced
- **Dimension:** Clinical data quality (FHIR profile conformance)
- **What:** `load.ts:29-40` — `defaultProfileValidator` (commented "US Core / profile
  $validate gate") only checks that `memberId`, `resourceType`, `fhirResourceId`, and a
  non-empty payload are present. No US Core profile selection, no cardinality, no
  must-support elements, no required-binding checks, no Da Vinci / CARIN profile
  conformance. Nothing validates that a US Core `Observation` carries category/code/subject
  per the profile, or that a `Coverage` meets CARIN.
- **Why a real deployment needs it:** "US Core conformant" is a certification claim (Inferno,
  ONC (g)(10)). Admitting resources that pass a 4-field presence check as "profile valid"
  means the FHIR store fills with non-conformant resources that a real US Core / Da Vinci /
  CARIN consumer will reject — and the conformance gate (I10) will fail.
- **Severity:** Critical
- **Owner:** NEW backlog (stage-4 real profile validator, HAPI `$validate` / US Core
  StructureDefinitions) — the plan assigns "real `$validate`" to I10/GB-4 but the *stub
  passing as the gate* should be flagged now, not at cert.

---

## High

### F5 — No provider identity resolution (NPI / NPPES); performers are raw location/text
- **Dimension:** Identity (provider identity)
- **What:** No NPI validation, no NPPES lookup, no provider matching anywhere in
  `lib/pipeline` or `lib/identity` (grep: zero hits). `adtEncounter.ts` keeps `pointOfCare`
  as a raw location code (line 106) and drops PV1-7/8/9 attending/referring providers
  entirely; procedure/med adapters never resolve the performer/prescriber to an NPI. The
  plan's stage-3 promises "provider NPI resolution"; it does not exist.
- **Why a real deployment needs it:** Attribution, network-adequacy (O-6), referral routing,
  and gold-carding all key off provider identity. Un-resolved providers mean the care-team
  lens and adequacy joins run on strings, and the same physician across two feeds is two
  nodes. NPI check-digit (Luhn) validation is table stakes.
- **Severity:** High
- **Owner:** NEW backlog / I8A pillar 1 (extend external identity to provider directory +
  NPPES).

### F6 — Terminology validation is code-existence only: no value-set binding-strength check, no display validation, no version-aware or retired-code handling
- **Dimension:** Terminology/semantics
- **What:** `semanticValidator.ts` extracts `{system, code}` (lines 41–58, **display
  discarded**) and calls `seedTerminologyService.validateCode` (`seedTerminologyService.ts`
  :60), which only answers "is this code present in the system's seed list." Missing: (a)
  **value-set binding** — US Core binds elements to specific value sets with a *strength*
  (required / extensible / preferred / example); the gate never checks membership in the
  bound value set at the bound strength (the registry has `resolveBinding` but the validator
  never calls it). (b) **display validation** — the incoming coding's `display` is never
  checked against the code's canonical display. (c) **version-aware validation** — ICD-10-CM
  / CPT are annual; a code valid in FY2024 may be retired FY2025, but `validateCode` is
  version-agnostic (the asset *binding* carries a version, the *code check* does not). (d)
  **retired/deprecated code status** — a code is `valid` or `unknown-code`; there is no
  "valid-but-retired / do-not-use-going-forward" state.
- **Why a real deployment needs it:** "Semantic validation" that only checks code existence
  admits codes used against the wrong element, with wrong displays, from retired code-system
  versions — precisely the data-quality failures terminology services exist to catch.
  Binding-strength is the core of US Core conformance.
- **Severity:** High
- **Owner:** I8A pillar 2 (real terminology server: `$validate-code` against value sets,
  `$expand`, display + version handling).

### F7 — No C-CDA / CCD ingestion path exists (the primary HIE / QE exchange format)
- **Dimension:** Interoperability (C-CDA/CCD)
- **What:** Zero C-CDA/CCD/schematron handling anywhere (grep: no hits). The execution plan
  §4A stage 1 lists "C-CDA/CCD XML from QEs" as a **first-class** landing format; the ADT
  adapter's source is even named `hixny-qe` (a NY QE that exchanges primarily via C-CDA).
  No adapter parses a CCD document, sections (problems, meds, allergies, results), or its
  entries.
- **Why a real deployment needs it:** In NY (and most HIEs), the QE's richest clinical
  payload arrives as a C-CDA document, not discrete FHIR. Without CCD ingestion the platform
  gets ADT demographics/encounters but none of the document-borne clinical depth QEs
  actually push. This is a whole missing arrival path, not a thin adapter.
- **Severity:** High
- **Owner:** NEW backlog (a CCD ingestion adapter family; plan §4A already scopes it — it was
  simply never built). Best placed I5/I6 alongside clinical domains.

### F8 — Financial/RCM: only 834 exists — no 837 (claims), 835 (remittance/CARC-RARC), 278 (PA), or 270/271 (eligibility)
- **Dimension:** Financial/RCM (X12)
- **What:** The only real X12 adapter is 834. `837`/`835`/`278`/`270`/`271` appear only in
  mock/policy/config seed data (`grep` → `mockData`, `policy-library.seed.json`,
  `backbone/config.ts`), never in the pipeline. No 835 remittance parsing → no CARC/RARC
  adjustment-reason handling, no coordination-of-benefits, no 270/271 eligibility
  request/response, no 278 PA transaction. The "golden-thread" claim lifecycle is FHIR
  Claim/ClaimResponse mock objects, not the X12 chain a payer actually runs.
- **Why a real deployment needs it:** For a payer/HIE platform, claims (837) and remittance
  (835 with CARC/RARC) *are* the financial record; 270/271 is how eligibility is checked in
  real time. Their absence means the RCM golden thread is demonstrated, not real.
- **Severity:** High
- **Owner:** NEW backlog / I6 (claims/financial domain) — 835 CARC/RARC + COB + 270/271 as
  their own adapter family.

### F9 — HCC is a flat ICD-10→group crosswalk: no RAF scoring, no hierarchies, no model version applied, no RxHCC/HHS-HCC/CDPS
- **Dimension:** Measures/quality (risk adjustment)
- **What:** `seedTerminologyService.classify` (line 87) returns a single HCC group from a
  seed map. There is **no risk-adjustment computation**: no RAF score, no demographic/
  disability factors, no disease-interaction terms, and crucially **no hierarchy** — the "H"
  in HCC means a more-severe HCC in a family trumps a lesser one, which a flat lookup cannot
  do. The registry lists RxHCC, HHS-HCC, CDPS, and V24/V28 model versions as governed assets
  but no engine scores them; model-version currency is *flagged* (I4) but never *applied* to
  scoring.
- **Why a real deployment needs it:** HCC drives risk-adjusted revenue and the platform's TCOC
  value story. A crosswalk that names a group but computes no RAF, ignores hierarchies, and
  can't switch V24→V28 is not risk adjustment — it's a code lookup mislabeled as one.
- **Severity:** High
- **Owner:** I8A pillar 3 (real classifiers/crosswalks: CMS-HCC + RxHCC + HHS-HCC + CDPS with
  hierarchies and RAF).

### F10 — No FHIR Provenance or AuditEvent resources emitted on load
- **Dimension:** Clinical data quality (provenance)
- **What:** Plan §4A stage 4: "upsert with **Provenance resources per load**." `load.ts`
  commits outbox intents but creates no `Provenance` resource; `provenance` is a bare string
  on the record (`'payer-authoritative'`, `'pharmacy-dispense'`) never a FHIR Provenance with
  `agent`/`target`/`recorded`/`entity`. No FHIR `AuditEvent` is produced either (audit is a
  PHI-safe log line, not the resource). Grep for `Provenance`/`AuditEvent` in
  `lib/pipeline`/`lib/graph` → only the graph spec's edge-provenance, nothing resource-level.
- **Why a real deployment needs it:** US Core requires Provenance for many resources;
  data-source attribution, "who asserted this," and reconciliation-of-conflicting-sources all
  depend on real Provenance. A string is not queryable provenance.
- **Severity:** High
- **Owner:** NEW backlog / I4 stage-4 depth (emit Provenance + optionally AuditEvent per load).

### F11 — No reference integrity checking; dangling references are admitted
- **Dimension:** Clinical data quality (reference integrity)
- **What:** No stage validates that a referenced resource exists. `medication.ts` links a
  `MedicationDispense` to `authorizingPrescription` (validates the ref *string* is present,
  line 103, but not that the MedicationRequest exists); `procedure.ts` carries an
  `encounterRef` (line 107) with no check the Encounter was loaded. The graph mapping will
  create edges to nodes that may never materialize.
- **Why a real deployment needs it:** Referential integrity is a FHIR store invariant.
  Dangling references produce broken graph edges, orphaned dispenses, and lenses that
  silently under-report. Real loaders resolve-or-reject / hold-for-arrival.
- **Severity:** High
- **Owner:** NEW backlog / I5 (cross-domain reference resolution + hold-for-late-arrival).

### F12 — No cross-source semantic deduplication; the same clinical fact from two feeds becomes two records
- **Dimension:** Clinical data quality (deduplication)
- **What:** Dedup is idempotency-key only, and the key is source-scoped
  (`rx:med:${requestId}`, `lab:obs:${obsId}`, `procedure:${procId}`). The same medication
  arriving from both a pharmacy feed and a CCD, or the same problem from claims + clinical,
  produces two records with different keys → duplicates on the whole-person record. No
  semantic match (same code + same date + same subject → one fact) anywhere in
  `transform.ts` (grep for dedup/duplicate → none).
- **Why a real deployment needs it:** The whole-person record aggregates *many* sources by
  design. Without cross-source dedup, every multi-source member's record double-counts meds,
  labs, problems — inflating gaps, med lists, and risk.
- **Severity:** High
- **Owner:** NEW backlog (a match/merge dedup stage keyed on clinical identity, not source id).

### F13 — ADT adapter: only A01–A04, no A05–A08/A11/A13, no A40 merge; repeating segments dropped; no ACK/NACK
- **Dimension:** Interoperability (HL7v2 ADT completeness)
- **What:** `adtEncounter.ts` `TRIGGER_TO_EVENT` (lines 20–25) maps only A01, A02, A03, A04.
  Missing the common **A08 (update patient info)**, A05 (pre-admit), A11/A13 (cancel
  admit/discharge), and **A40 (merge patient)** — which is an *identity* event an EMPI must
  consume. The parser keeps only the **first occurrence** of each segment (`parse`, line 34:
  `!(fields[0] in segments)`), so repeating `DG1` (diagnoses), `IN1/IN2` (insurance), and
  `NK1` are silently dropped; only one PID/PV1 survives. No `MSA` acknowledgment (ACK/NACK)
  is generated — a real v2 interface *requires* application acks. HL7 timestamps are forced
  to `Z` (line 132) ignoring the offset v2 carries.
- **Why a real deployment needs it:** ADT feeds are dominated by A08 updates and carry
  merges (A40) that must reach the EMPI. Dropping repeating segments loses diagnoses and
  coverage. No ACK means the sending system considers messages unacknowledged/failed.
- **Severity:** High
- **Owner:** I4 (adapter depth) + I8A (A40 → EMPI merge wiring).

### F14 — No corrections / amendments / voids / entered-in-error retraction; no bitemporal (effective vs recorded) model
- **Dimension:** Temporal/operational
- **What:** All event types are positive (`*.prescribed`, `*.dispensed`, `*.performed`,
  `*.recorded`); there is no retraction path. A resource re-sent with
  `status: 'entered-in-error'` (or an ADT cancel, or an 834 term) upserts the node with that
  status in the payload but the graph still projects it as an active node — nothing
  tombstones/retracts (grep `entered-in-error` → none in pipeline/graph). The
  `NormalizedRecord` carries a single `occurredAt` (`types.ts:141`) — **no separate recorded/
  transaction time**, so there is no bitemporal model (the graph has validity intervals for
  *effective* asOf, but not "what did we know and when").
- **Why a real deployment needs it:** Clinical and enrollment data is constantly corrected,
  amended, and voided. Without retraction, an erroneous result or a cancelled admit lives
  forever on the record; without bitemporality, "as-of-a-past-date" reproduction and audit of
  "when did we learn X" are impossible.
- **Severity:** High
- **Owner:** NEW backlog (a retraction/amendment event class + bitemporal recorded-time) —
  natural fit alongside I7 or as its own temporal-integrity item.

### F15 — Consent model has no purpose-of-use, no minimum-necessary, no category granularity; sensitive labels are attached but unenforced
- **Dimension:** Privacy/consent (HIPAA + sensitive categories)
- **What:** Consent = a boolean Provider-Access opt-out (`providerAccessOptOut.ts`) plus a
  flat `consentScopesGranted` string list (`sde/consentGate.ts:18-23`). No **purpose-of-use**
  (treatment / payment / operations / research), no **HIPAA minimum-necessary** scoping (the
  record is all-or-nothing per member; nothing narrows the disclosed set to the purpose), no
  granularity by data category. `segmentation.ts:23-28` attaches `hiv-related`,
  `reproductive-health`, `behavioral-health` labels — but **nothing downstream enforces
  differential access on them** (only Part 2 is acted on, by dropping). Genetic (GINA) and
  adolescent/minor-consent categories are absent entirely.
- **Why a real deployment needs it:** HIPAA minimum-necessary and purpose-of-use are baseline
  disclosure controls; state sensitive-data laws (HIV, reproductive, minor consent, genetic)
  require category-level segmentation with enforcement. Labels that don't gate access are
  documentation, not protection.
- **Severity:** High
- **Owner:** I6 (sensitive domains) — extend the consent model to purpose-of-use +
  minimum-necessary + per-category enforcement; NEW backlog for minor/genetic categories.

### F16 — Quality measures are not value-set-driven eCQM/HEDIS; gap "closure" just increments a counter
- **Dimension:** Measures/quality (HEDIS/eCQM)
- **What:** `gapClosureService.ts` "updates quality metrics (increments numerator)" on a mock
  store and computes a hardcoded 60/40 gainshare. There is **no measure engine**: no
  denominator / numerator / exclusion / exception logic evaluated against measure value sets,
  no eCQM/HEDIS spec ingestion, no measurement period. The registry lists "quality" family
  assets (HEDIS MY2025, eCQM) as governed, but nothing computes a measure from them.
- **Why a real deployment needs it:** Gaps-in-care and quality reporting must be
  value-set-driven and spec-conformant (HEDIS/QARR/eCQM) or the numbers are indefensible to
  a plan or the state. Incrementing a counter on "referral completed" is not measure
  computation and cannot handle exclusions/exceptions.
- **Severity:** High
- **Owner:** NEW backlog / I7 (a value-set-driven measure engine feeding the adequacy/quality
  dashboards).

---

## Med

### F17 — No X12 interchange envelope parsing (ISA/GS/ST/SE/GE/IEA), control numbers, or 999/TA1 acknowledgment
- **Dimension:** Interoperability (X12 structural)
- **What:** `eligibility834.ts:20-41` splits on `~`/newline and scans for `INS` loops. It
  never parses the interchange/functional-group/transaction-set envelope
  (ISA/GS/ST…SE/GE/IEA), validates control numbers, checks segment counts (SE01), or emits a
  **TA1 / 999** acknowledgment. Delimiters are assumed (`*`), not read from ISA.
- **Why a real deployment needs it:** Every real X12 partner exchanges envelopes and expects a
  999/TA1 ack; control-number tracking is how duplicates and gaps are detected. A parser that
  ignores the envelope cannot participate in a real trading-partner exchange.
- **Severity:** Med (High for a production trading-partner go-live)
- **Owner:** NEW backlog (shared X12 envelope/ack layer under all X12 adapters).

### F18 — UCUM units never validated; lab values are free-string units with no reference range or interpretation
- **Dimension:** Terminology/semantics (UCUM) + clinical data quality
- **What:** `lab.ts:105` copies `valueQuantity.unit` through as a raw string; UCUM is not a
  governed system in the TerminologyService (`terminology/types.ts` governs only 6 systems,
  UCUM absent though listed as a registry asset). No reference range, no
  interpretation/abnormal flag (H/L/critical), no LOINC-expected-unit check.
- **Why a real deployment needs it:** A lab value without a validated UCUM unit and reference
  range is clinically ambiguous (mg/dL vs mmol/L). US Core Vital Signs / Lab profiles require
  UCUM. Interpretation flags drive care gaps.
- **Severity:** Med
- **Owner:** I8A pillar 2 (UCUM validation) + I4 lab-adapter depth (range/interpretation).

### F19 — CVX and NDC absent from terminology; immunizations and pharmacy-dispense NDC codes cannot be validated
- **Dimension:** Terminology/semantics (code-system coverage)
- **What:** Governed systems are RxNorm/LOINC/SNOMED/ICD-10-CM/CPT-HCPCS/HCC
  (`terminology/types.ts:14-19`). **CVX** (immunizations) and **NDC** (the code pharmacy
  dispenses actually carry) are listed as registry lifecycle assets but have no content and
  no validation. The medication dispense adapter assumes RxNorm and has no NDC path.
- **Why a real deployment needs it:** Immunization feeds are CVX-coded; pharmacy claims/
  dispenses are NDC-coded (NDC↔RxNorm crosswalk needed). Without these, immunization and real
  pharmacy data fail the semantic gate or pass unvalidated.
- **Severity:** Med
- **Owner:** I8A pillar 2 (add CVX + NDC + NDC↔RxNorm) / I5 (immunizations domain).

### F20 — Medication adapter drops dosage/sig, ignores medicationReference, no NDC/refills/DAW, no adherence
- **Dimension:** Clinical data quality (domain depth)
- **What:** `medication.ts` handles only `medicationCodeableConcept` (line 61) — a
  `medicationReference` to a contained Medication is ignored. No `dosageInstruction` (sig,
  route, frequency) is parsed; no refills, no DAW, no NDC on dispense. Adherence (PDC/MPR from
  the dispense pattern) is not computed though both request and dispense are captured.
- **Why a real deployment needs it:** Sig/route/frequency and refills are needed for any real
  medication reconciliation or adherence measure; `medicationReference` is common in real
  bundles. Capturing request+dispense but computing no adherence leaves the richest signal on
  the floor.
- **Severity:** Med
- **Owner:** I4 med-adapter depth / NEW backlog (adherence).

### F21 — Lab adapter only handles numeric valueQuantity; no coded/string results, no DiagnosticReport panel grouping
- **Dimension:** Clinical data quality (domain depth)
- **What:** `lab.ts:104-105` reads only `valueQuantity`; `valueCodeableConcept` (positive/
  negative, ordinal), `valueString`, and `valueRatio` results become `null`. No
  `DiagnosticReport` grouping — labs arrive as panels (CBC, BMP) and the report-to-result
  grouping is lost. (Also: `occurredAt` appends `T00:00:00Z` unconditionally, line 127, which
  malforms an already-full effective datetime.)
- **Why a real deployment needs it:** A large share of lab results are qualitative/coded (micro,
  serology). Dropping them to null loses the result. Panel grouping is how clinicians read
  labs.
- **Severity:** Med
- **Owner:** I4 lab-adapter depth.

### F22 — SDOH ingestion is not Gravity/PRAPARE/AHC-HRSN instrument-driven; domain is a free string, no QuestionnaireResponse
- **Dimension:** Terminology/semantics + Clinical data quality (SDOH)
- **What:** `cboSdoh.ts` validates only that `zcode` matches `Z\d\d` (line 41) and carries a
  free-text `domain` string. No Gravity SDOH value sets, no LOINC screening-instrument codes
  (PRAPARE, AHC-HRSN), no instrument scoring, and no `QuestionnaireResponse` → derived
  `Observation` per the Gravity IG. The plan explicitly names Gravity value sets + PRAPARE +
  AHC-HRSN.
- **Why a real deployment needs it:** SDOH interoperability *is* the Gravity IG; a free-string
  domain + bare Z-code is not conformant and can't be measured or exchanged. Instrument scoring
  (PRAPARE) is how social risk is quantified.
- **Severity:** Med
- **Owner:** I6 (social domains) / I8A pillar 3 (Gravity + PRAPARE scoring).

### F23 — No FHIR Bulk Data ingestion ($import / NDJSON landing); only outbound P2P $export exists
- **Dimension:** Interoperability (FHIR Bulk Data)
- **What:** `bulkClient.ts` is an **outbound** Payer-to-Payer PDex `$export` *request* client.
  The plan §4A stage 1 lists FHIR Bulk `$export` NDJSON as an **ingestion landing** format —
  there is no path to *land and process* NDJSON received from another payer/EHR (the
  consume-a-bulk-export side).
- **Why a real deployment needs it:** Payer-to-payer and EHR bulk transfer is how bulk clinical
  history arrives (CMS-0057-F P2P, provider-directory bulk). Requesting an export without
  ingesting the returned NDJSON is half the loop.
- **Severity:** Med
- **Owner:** NEW backlog (bulk NDJSON ingestion adapter).

### F24 — CDS Hooks and SMART on FHIR are mock/launch scaffolding, not real decision-support integration
- **Dimension:** Interoperability (CDS Hooks / SMART on FHIR)
- **What:** SMART exists as `fhir/smartLaunch.ts` + `smartFhirMockData.ts` (mock launch
  context) and there is a `server/cdsClient.ts`, but there is no CDS Hooks **service**
  (discovery endpoint, `order-select`/`patient-view` hook handlers returning cards) and SMART
  is launch-context mock data, not a real authorization-code/scope-enforced SMART app
  boundary.
- **Why a real deployment needs it:** CDS Hooks is how the platform's decision support reaches
  an EHR at the point of care; SMART is the auth model for app launch. Mock launch data
  demonstrates the surface without the standard's substance.
- **Severity:** Med
- **Owner:** GB-1 / NEW backlog (real CDS Hooks service + SMART scope enforcement).

### F25 — No TEFCA / QHIN / Carequality / CommonWell participation model
- **Dimension:** Interoperability (TEFCA/QHIN)
- **What:** Zero references to TEFCA, QHIN, Carequality, or CommonWell (grep: none). Identity
  exchange is IHE PIX/PDQ stubs (I4); there is no framework-level participation (QHIN
  connectivity, TEFCA purposes-of-use, RCE flow-down, facilitated FHIR under TEFCA).
- **Why a real deployment needs it:** TEFCA is the national exchange framework payers/HIEs are
  moving to; participation carries its own identity, consent (purpose-of-use), and
  trust-flow-down requirements distinct from point-to-point IHE.
- **Severity:** Med
- **Owner:** NEW backlog (future national-exchange track; depends on external RCE onboarding).

### F26 — Assigning authorities / OIDs are not modeled; source ids are bare strings, so cross-system id collisions are possible
- **Dimension:** Identity (assigning authorities / OIDs)
- **What:** Source member ids flow as bare strings (`subscriberId`, PID-3 first component,
  `member_source_id`); `mintedIdFor(sourceMemberId, feed)` qualifies by a loose `feed` label,
  not an assigning-authority **OID**. Two different source systems using the same local id
  `12345` are only distinguished by the free-text feed name, and PID-3's assigning-authority /
  identifier-type-code components are discarded (`adtEncounter.ts:63` takes only `split('^')[0]`).
- **Why a real deployment needs it:** IHE/PIX identity is defined by (id, assigning authority
  OID). Without the authority namespace, cross-system id collisions silently merge or split
  identities, and PIX/PDQ (I8A) cannot be wired correctly on top of an id model that threw the
  authority away.
- **Severity:** Med
- **Owner:** I8A pillar 1 (assigning-authority OIDs as first-class identifier qualifiers) —
  but the *discarding* of PID-3 authority components is a NEW backlog fix in the ADT adapter now.

---

## Cross-cutting note

The recurring pattern across F4/F6/F9/F10/F16 is **a real seam wrapped around a stub, named as
though it were the real mechanism** ("US Core $validate gate," "semantic validation," "HCC
classification," "quality metrics," "Provenance per load"). Each is honest at the code-comment
level but the *capability label* overstates the *behavior*. The highest-value follow-up is not
more seams — those exist — but promoting these five from label to mechanism, since the
domain-coverage iterations (I5/I6) and the certification pass (I10) all assume they are real.
