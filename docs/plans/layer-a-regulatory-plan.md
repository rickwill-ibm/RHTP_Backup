# Layer A — CMS-0057-F Regulatory & Interoperability Frame

**Status:** DEFERRED (not being built now). This is an execution-ready plan, not active work.
**Platform:** RHTP — Next.js 15 (app router, TypeScript), pure-core / thin-shell, feature-flagged, structure-driven.
**Scope:** The regulatory and interoperability "frame" that wraps RHTP's existing prior-authorization (PA) cores so the platform can be operated as a CMS-0057-F-compliant payer stack across multiple books of business.
**Author's contract:** An engineer picking this up should be able to execute it milestone by milestone without re-deriving the design. Where a decision is genuinely open, it is called out in §12 rather than guessed.

---

## 0. How to read this document

- **§1** fixes the regulatory facts and the compliance calendar this layer is built against.
- **§2** is the honest inventory: what already exists in `src/lib/pa/` vs. what Layer A adds.
- **§3** is the load-bearing abstraction — the line-of-business (LOB) scope model that makes every rule (timeframes, denial-reason, metrics, APIs) apply per book of business, including the QHP carve-outs, without payer-specific hardcoding.
- **§4–§8** are the concrete build areas: the four FHIR APIs, timeframe/denial enforcement + metrics, Da Vinci conformance, and cross-cutting concerns.
- **§9** sequences all of it into dependency-ordered milestones, each with a named file/module list, an acceptance gate, and a definition of "done."
- **§10** is the test strategy. **§11** is the risk register. **§12** is the set of decisions to resolve before starting.

Naming conventions used throughout:
- New pure logic lives under `src/lib/regulatory/**` and `src/lib/fhir/**` (pure-core; unit-tested; no React, no I/O).
- New route handlers live under `app/api/fhir/**` (thin shells that call the cores).
- Feature flags follow the existing `flag('name')` reader over `NEXT_PUBLIC_*` env, always with a classic fallback path.

---

## 1. Regulatory frame (CMS-0057-F — verified facts)

These are the confirmed facts this layer is built to satisfy. They are transcribed into a machine-readable table in §3 (`regulatoryMatrix.ts`); the prose here is the source of truth an engineer checks the table against.

### 1.1 Impacted payers (the books of business Layer A must model)
- Medicare Advantage (MA) organizations
- State Medicaid fee-for-service (FFS)
- State CHIP FFS
- Medicaid managed care entities (MCO)
- CHIP managed care entities (MCO)
- Qualified Health Plan (QHP) issuers on the Federally-Facilitated Exchanges (FFEs)

### 1.2 Obligations and who they bind

| Obligation | Applies to | Notably excludes | Compliance date |
|---|---|---|---|
| Decision timeframes — **72h expedited / 7 calendar days standard** | All impacted payers | **QHP issuers on the FFEs (excluded)** | Jan 1, 2026 |
| **Specific denial reason** communicated on adverse PA decisions | All impacted payers | **QHP issuers on the FFEs (excluded)** | Jan 1, 2026 |
| **Public PA metrics reporting** (annual) | **All** impacted payers, incl. QHPs | — | First due **Mar 31, 2026**, annually thereafter |
| **Patient Access API** (+ PA data) | **All** impacted payers, incl. QHPs | — | Jan 1, 2027 |
| **Provider Access API** | **All** impacted payers, incl. QHPs | — | Jan 1, 2027 |
| **Payer-to-Payer API** | **All** impacted payers, incl. QHPs | — | Jan 1, 2027 |
| **Prior Authorization API (PARDD)** | **All** impacted payers, incl. QHPs | — | Jan 1, 2027 |

### 1.3 Standards posture
- **Da Vinci CRD / DTR / PAS** are the **recommended (not mandated)** implementation route for the PA API. RHTP adopts them because its existing cores already do.
- **PAS carries the X12 278** (the request/response is wrapped in the FHIR PAS `$submit` interaction).
- Base standard is **FHIR R4** with **US Core** profiles. Payer-specific data uses **Da Vinci PDex** and **HRex**; documentation discovery uses **CRD**; questionnaire packaging uses **DTR (SDC)**.

### 1.4 What this means for RHTP's design
1. The regulation is **not uniform** across books of business. The QHP carve-out from timeframes + denial-reason is the single most important structural fact — it forces the LOB scope model in §3.
2. There are **two compliance waves**: the 2026 wave (operational: timeframes, denial reason, metrics) and the 2027 wave (interoperability: the four APIs). The milestone ordering in §9 respects this — 2026-wave work is buildable and shippable independently of the API work.
3. Metrics reporting binds **everyone including QHPs**, even though QHPs are carved out of the timeframe rules. So the metrics pipeline cannot be gated on "timeframes apply"; it is its own independent obligation.

---

## 2. Inventory — what exists vs. what is net-new

### 2.1 Already delivered (build ON these; do not rewrite)

All in `src/lib/pa/`, pure cores, tested:

| Module | Responsibility | Layer A consumes it for |
|---|---|---|
| `paDecisionClock.ts` | 72h / 7-calendar-day decision-timeframe math | Timeframe enforcement (§5), metrics timing (§5.3) |
| `pasBundle.ts` | Builds a conformant Da Vinci PAS request Bundle (`Claim/$submit` shape) | PA API `$submit` (§4.4), PAS conformance (§6.3) |
| `crdDerivation.ts` + `publishedCoverage.ts` | CRD coverage-rule read + coverage determination | CRD hooks (§6.1), PA API discovery (§4.4) |
| `patientContext.ts` | Patient + plan membership + benefits (eligibility context) | LOB resolution input (§3.4), Patient/Provider Access (§4.1–4.2) |
| `dtrReadiness.ts` | DTR completion / readiness gate | DTR `$questionnaire-package` gating (§6.2), PA API (§4.4) |

**Key observation:** RHTP already has the *transactional* PA pipeline (CRD→DTR→PAS). Layer A does **not** rebuild it. Layer A adds (a) the regulatory *scope* around it, (b) the *read* APIs (Patient/Provider/Payer-to-Payer) that expose data at rest, and (c) the *reporting* and *conformance* surfaces.

### 2.2 Net-new in Layer A

| Area | New location | Nature |
|---|---|---|
| LOB scope model + regulatory matrix | `src/lib/regulatory/**` | Pure core |
| Timeframe + denial-reason enforcement wiring | `src/lib/regulatory/enforcement/**` | Pure core (wraps `paDecisionClock`) |
| Metrics aggregation + report builder | `src/lib/regulatory/metrics/**` | Pure core |
| FHIR read-models + resource builders | `src/lib/fhir/**` | Pure core |
| Four FHIR APIs (route handlers) | `app/api/fhir/**` | Thin shell |
| Bulk export engine (`$export`, `_since`) | `src/lib/fhir/bulk/**` + `app/api/fhir/**/$export` | Pure core + thin shell |
| CapabilityStatements + conformance fixtures | `src/lib/fhir/conformance/**` + `app/api/fhir/metadata` | Pure core + thin shell |
| Auth (SMART/UDAP/mTLS) adapters | `src/lib/fhir/auth/**` | Pure core + edge/middleware |
| Persistence / read-model store contracts | `src/lib/fhir/store/**` (interfaces only in this plan) | Interface + adapter |

Everything net-new is structure-driven: **no payer name, no plan ID, no LOB string appears as a literal in enforcement logic.** All variation flows through the `RegulatoryProfile` derived in §3.

---

## 3. Scope model — line-of-business (the load-bearing abstraction)

The whole layer hinges on being able to answer, for any given member/plan/transaction: *which rule set applies?* That is a function of the **book of business**, not the payer. This section defines the type shape and the module that owns it.

### 3.1 Module layout

```
src/lib/regulatory/
  lineOfBusiness.ts      # the LOB type + guards
  regulatoryMatrix.ts    # the CMS-0057-F obligation table (data, not code branches)
  regulatoryProfile.ts   # deriveRegulatoryProfile(lob, asOf) -> RegulatoryProfile
  resolveLob.ts          # map a plan/membership (from patientContext) -> LineOfBusiness
  index.ts
  __tests__/
    regulatoryProfile.test.ts
    resolveLob.test.ts
    matrix.parity.test.ts   # asserts table matches §1.2 prose
```

### 3.2 The LOB type (`lineOfBusiness.ts`)

```ts
/** The six CMS-0057-F books of business RHTP can operate. */
export type LineOfBusiness =
  | 'MA'            // Medicare Advantage org
  | 'MEDICAID_FFS'  // State Medicaid fee-for-service
  | 'MEDICAID_MCO'  // Medicaid managed care entity
  | 'CHIP_FFS'      // State CHIP fee-for-service
  | 'CHIP_MCO'      // CHIP managed care entity
  | 'QHP_FFE';      // QHP issuer on a Federally-Facilitated Exchange

export const ALL_LOBS: readonly LineOfBusiness[] = [
  'MA', 'MEDICAID_FFS', 'MEDICAID_MCO', 'CHIP_FFS', 'CHIP_MCO', 'QHP_FFE',
] as const;

export function isLineOfBusiness(x: unknown): x is LineOfBusiness {
  return typeof x === 'string' && (ALL_LOBS as readonly string[]).includes(x);
}
```

### 3.3 The obligation matrix + derived profile

`regulatoryMatrix.ts` encodes §1.2 as **data** — one row per LOB, no `if (lob === 'QHP_FFE')` branches in downstream logic. The QHP carve-out lives here and only here.

```ts
export interface Obligation {
  /** 72h/7-day decision-timeframe math applies. QHP_FFE = false. */
  readonly decisionTimeframes: boolean;
  /** Adverse decisions must carry a specific denial reason. QHP_FFE = false. */
  readonly specificDenialReason: boolean;
  /** Annual public PA metrics reporting. All LOBs = true. */
  readonly metricsReporting: boolean;
  /** The four interoperability APIs. All LOBs = true. */
  readonly api: {
    readonly patientAccess: boolean;
    readonly providerAccess: boolean;
    readonly payerToPayer: boolean;
    readonly priorAuth: boolean;
  };
}

/** CMS-0057-F obligation matrix. The single source of the QHP carve-out. */
export const REGULATORY_MATRIX: Record<LineOfBusiness, Obligation> = {
  MA:           { decisionTimeframes: true,  specificDenialReason: true,  metricsReporting: true, api: allApis() },
  MEDICAID_FFS: { decisionTimeframes: true,  specificDenialReason: true,  metricsReporting: true, api: allApis() },
  MEDICAID_MCO: { decisionTimeframes: true,  specificDenialReason: true,  metricsReporting: true, api: allApis() },
  CHIP_FFS:     { decisionTimeframes: true,  specificDenialReason: true,  metricsReporting: true, api: allApis() },
  CHIP_MCO:     { decisionTimeframes: true,  specificDenialReason: true,  metricsReporting: true, api: allApis() },
  QHP_FFE:      { decisionTimeframes: false, specificDenialReason: false, metricsReporting: true, api: allApis() },
};

function allApis() {
  return { patientAccess: true, providerAccess: true, payerToPayer: true, priorAuth: true } as const;
}
```

Compliance dates are date-sensitive, so `regulatoryProfile.ts` derives an *effective* profile as of a given date. Before a compliance date the obligation is "not yet in force" (used to drive flag defaults and to keep pre-2026/2027 test fixtures honest).

```ts
export const COMPLIANCE_DATES = {
  timeframesAndDenial: '2026-01-01',
  metricsFirstDue:     '2026-03-31',
  fhirApis:            '2027-01-01',
} as const;

export interface RegulatoryProfile {
  readonly lob: LineOfBusiness;
  readonly asOf: string;                 // ISO date the profile was derived for
  readonly obligation: Obligation;       // static matrix row
  readonly inForce: {                    // date-gated view of the same obligations
    readonly decisionTimeframes: boolean;
    readonly specificDenialReason: boolean;
    readonly metricsReporting: boolean;
    readonly api: Obligation['api'];
  };
}

export function deriveRegulatoryProfile(
  lob: LineOfBusiness,
  asOf: string = todayIso(),
): RegulatoryProfile;
```

`inForce` = `obligation` AND (`asOf` >= the relevant compliance date). Every downstream consumer reads `inForce`, never re-checks dates or LOBs itself.

### 3.4 Resolving LOB from membership (`resolveLob.ts`)

`patientContext.ts` already produces plan membership + benefits. `resolveLob` maps that structure to a `LineOfBusiness` **structurally** — from the plan's program/market attributes (e.g. `program: 'MEDICAID' | 'CHIP' | 'MEDICARE_ADVANTAGE' | 'QHP'`, `deliverySystem: 'FFS' | 'MCO'`, `exchange: 'FFE' | null`) — not from a payer-ID lookup table. If the membership cannot be classified, it returns a typed `UnresolvedLob` error rather than defaulting to a permissive LOB.

```ts
export type LobResolution =
  | { ok: true;  lob: LineOfBusiness }
  | { ok: false; reason: 'AMBIGUOUS' | 'UNKNOWN_PROGRAM' | 'MISSING_MARKET' };

export function resolveLob(context: PatientContext): LobResolution;
```

**Structure-driven guarantee:** the only place LOBs are enumerated is `lineOfBusiness.ts`; the only place obligations vary is `regulatoryMatrix.ts`; the only place membership→LOB mapping lives is `resolveLob.ts`. Adding a payer is a data operation, never a code change.

### 3.5 Feature-flag surface for the scope model
- `flag('regulatory_scope_model')` — master switch; when off, the platform behaves as pre-Layer-A (classic fallback: legacy timeframe behavior, no API surface).
- `flag('regulatory_enforce_asof_dates')` — when off, `inForce` mirrors `obligation` (useful in lower environments to exercise obligations before their compliance date).

---

## 4. The four FHIR APIs (each is its own milestone)

All four share: base **FHIR R4 + US Core**, a common façade under `app/api/fhir/**`, a shared read-model (`src/lib/fhir/store/**`), shared `OperationOutcome` handling (§8.2), and a per-API `CapabilityStatement` (§6.4). Each API is gated by `inForce.api.<name>` for the member's LOB **and** a feature flag. Compliance date for all four: **Jan 1, 2027**.

### 4.0 Shared FHIR foundation (prerequisite for §4.1–4.4)

```
src/lib/fhir/
  resources/            # pure builders returning typed FHIR R4 JSON
    patient.ts          # US Core Patient
    coverage.ts         # US Core / PDex Coverage
    claim.ts            # PAS Claim / ClaimResponse
    questionnaire.ts    # DTR / SDC Questionnaire(Response)
    operationOutcome.ts # error envelope (§8.2)
    bundle.ts           # searchset / collection / transaction bundles
  profiles/             # profile URLs + validation metadata (US Core, PDex, HRex, PAS, CRD, DTR)
  store/                # READ-MODEL CONTRACTS (interfaces only in this plan)
    FhirReadStore.ts    # interface: read/search resources by patient, _since, _type
    PaEventStore.ts     # interface: PA lifecycle events feeding metrics + PA API
  search/               # FHIR search param parsing (_id, patient, _since, _type, status)
  paginate.ts           # searchset pagination (link.next continuation tokens)
```

`FhirReadStore` and `PaEventStore` are **interfaces** here by design — the persistence choice is an open decision (§12). Route handlers depend only on these interfaces; a concrete adapter is wired at the composition root.

```ts
export interface FhirReadStore {
  read(type: string, id: string): Promise<FhirResource | null>;
  searchByPatient(type: string, patientId: string, opts: SearchOpts): Promise<Bundle>;
  /** Bulk export cursor honoring _type and _since. */
  export(group: GroupSelector, since: string | null, types: string[]): AsyncIterable<FhirResource>;
}
```

### 4.1 Milestone API-1 — Patient Access API (+ PA data)

**Purpose:** a member-authorized app reads the member's own clinical/coverage/claims data **and PA information** (the CMS-0057-F addition to the pre-existing Patient Access mandate).

- **Profiles served:** US Core R4 (Patient, Coverage, Condition, MedicationRequest, etc.), Da Vinci **PDex** for payer data, **CARIN BB**-shaped Claim/ExplanationOfBenefit where RHTP already holds claims, and **PA resources** (the Claim/ClaimResponse + supporting Task/Questionnaire from the PAS pipeline).
- **Route surface:**
  - `app/api/fhir/patient-access/metadata/route.ts` → CapabilityStatement
  - `app/api/fhir/patient-access/[type]/route.ts` → search (GET) with `patient=<self>`, `_since`, `_lastUpdated`
  - `app/api/fhir/patient-access/[type]/[id]/route.ts` → read
  - `app/api/fhir/patient-access/PriorAuthorization/route.ts` (or `Claim?use=preauthorization`) → PA list for the member
- **Persistence/read-model:** `FhirReadStore` scoped to the authenticated member. PA data is projected from `PaEventStore` into FHIR Claim/ClaimResponse.
- **`$` operations:** none required beyond REST read/search.
- **Bulk / `_since`:** individual-scope only; supports `_since` on search for incremental sync but **no** `$export`.
- **Auth:** **SMART on FHIR** (patient-facing, member authorization, OAuth2 with `launch/patient` + granular scopes). See §7.1.

### 4.2 Milestone API-2 — Provider Access API

**Purpose:** an in-network provider (with a treatment relationship / attribution) pulls a member's data **without** the member first authorizing the specific app; member **opt-out** is honored.

- **Profiles served:** same US Core + PDex clinical/coverage set as API-1, **plus PA data**. No member-authored consent flow, but an **attribution + opt-out** gate.
- **Route surface:**
  - `app/api/fhir/provider-access/metadata/route.ts`
  - `app/api/fhir/provider-access/[type]/route.ts` (individual query by attributed patient)
  - `app/api/fhir/provider-access/Group/[id]/$export/route.ts` (**bulk** for a provider's attributed panel)
  - `app/api/fhir/provider-access/$export-status/[job]/route.ts` (async status)
- **Persistence/read-model:** `FhirReadStore.export(...)` over the provider's **attribution group**; an **opt-out list** filter applied at query time. Attribution and opt-out are new read-model concerns (`AttributionStore`, `OptOutStore` interfaces added under `store/`).
- **`$` operations:** **`$export`** (FHIR Bulk Data / "Flat FHIR").
- **Bulk / `_since`:** **required.** Group-level `$export` with `_type` and **`_since`** for incremental pulls; async job pattern (`202 Accepted` + polling + `application/fhir+ndjson` output).
- **Auth:** **SMART Backend Services** (client-credentials, system scopes) and/or **UDAP** per §12 decision; provider org identity, not member identity. See §7.2.

### 4.3 Milestone API-3 — Payer-to-Payer API

**Purpose:** when a member moves plans, the new payer pulls up to 5 years of the member's data (clinical, coverage, and **PA**) from the prior payer; RHTP must act as **both** the requesting and the responding payer.

- **Profiles served:** US Core + PDex clinical/coverage + PA data; **HRex** for the member-match / consent envelope.
- **Route surface:**
  - `app/api/fhir/payer-to-payer/metadata/route.ts`
  - `app/api/fhir/payer-to-payer/$member-match/route.ts` (HRex `$member-match` to identify the member at the responding payer)
  - `app/api/fhir/payer-to-payer/Group/[id]/$export/route.ts` (bulk pull of the matched member)
  - Requesting-side client: `src/lib/fhir/p2p/requestClient.ts` (pure orchestration; calls the other payer's endpoints)
- **Persistence/read-model:** responding side reuses `FhirReadStore.export`; requesting side needs an **ingest projection** (`P2pIngestStore` interface) to land another payer's data. Member consent to the exchange is captured via `ConsentStore`.
- **`$` operations:** **`$member-match`** (HRex) + **`$export`**.
- **Bulk / `_since`:** **required** — `$export` with **`_since`** (subsequent syncs), constrained to the ≤5-year window.
- **Auth:** payer-to-payer trust — **UDAP** dynamic client registration / mTLS between payers (§7.3). Member consent gates the data release.

### 4.4 Milestone API-4 — Prior Authorization API (PARDD)

**Purpose:** the end-to-end PA transaction API — **P**A requirements discovery, **A**ppropriate documentation, **R**equest, **D**ecision, **D**isposition — implemented via Da Vinci **CRD / DTR / PAS**. This is where RHTP's existing cores are exposed as an API.

- **Profiles/IGs served:** **CRD** (coverage requirements discovery), **DTR** (questionnaire packaging, SDC), **PAS** (submission carrying the **X12 278**), US Core for the clinical payload.
- **Route surface:**
  - `app/api/fhir/prior-auth/metadata/route.ts`
  - `app/api/fhir/prior-auth/Claim/$submit/route.ts` → wraps `pasBundle.ts` output; returns ClaimResponse with disposition (see §6.3)
  - `app/api/fhir/prior-auth/Claim/$inquire/route.ts` → PAS inquiry (status of an existing PA)
  - `app/api/fhir/prior-auth/Questionnaire/$questionnaire-package/route.ts` → DTR package (see §6.2)
  - CRD is surfaced as **CDS Hooks** endpoints (§6.1), not REST — `app/api/cds-services/route.ts` + hook handlers.
- **Persistence/read-model:** `PaEventStore` is the write side (records submit/decision/disposition events); those same events feed §5 enforcement and §5.3 metrics, and are projected into API-1/2/3 as Claim/ClaimResponse.
- **`$` operations:** **`$submit`**, **`$inquire`** (PAS); **`$questionnaire-package`** (DTR).
- **Bulk / `_since`:** not applicable (transactional).
- **Auth:** provider-facing **SMART on FHIR** (EHR launch) for CRD/DTR; system-to-system for `$submit`. See §7.

**Reuse note:** `$submit` is a thin shell over `pasBundle.ts`; `$questionnaire-package` is a thin shell over `dtrReadiness.ts` + a Questionnaire builder; CRD hooks are a thin shell over `crdDerivation.ts` + `publishedCoverage.ts`. Layer A adds the *API skin and conformance*, not new PA logic.

---

## 5. Decision timeframes, specific denial reason, and metrics

### 5.1 Timeframe enforcement (wired to `paDecisionClock.ts`)

New pure core: `src/lib/regulatory/enforcement/timeframe.ts`.

- On PA intake, classify the request as **expedited** or **standard** (input already present in the PA flow; classification rule lives in `classifyUrgency.ts`).
- Call `paDecisionClock.ts` to compute the **due-by** instant: 72 hours (expedited) or 7 calendar days (standard) from the receipt timestamp.
- **Gate on the LOB profile:** enforcement is active only when `deriveRegulatoryProfile(lob, asOf).inForce.decisionTimeframes === true`. For `QHP_FFE`, this is `false` — the clock still *computes* (for internal SLA/telemetry) but the **regulatory** deadline and the compliance state are marked "not applicable," so QHP is never reported as non-compliant against a rule that does not bind it.

```ts
export interface TimeframeDecision {
  readonly applicable: boolean;   // false for QHP_FFE (carve-out)
  readonly urgency: 'EXPEDITED' | 'STANDARD';
  readonly receivedAt: string;
  readonly dueBy: string | null;  // null when !applicable
  readonly status: 'PENDING' | 'MET' | 'BREACHED' | 'NOT_APPLICABLE';
}

export function evaluateTimeframe(
  input: { lob: LineOfBusiness; urgency: 'EXPEDITED'|'STANDARD'; receivedAt: string; decidedAt?: string; asOf?: string },
): TimeframeDecision;
```

`status` is derived by comparing `decidedAt` to `dueBy` via `paDecisionClock`. A background check (or on-read derivation) flips `PENDING`→`BREACHED` when now > `dueBy` and no decision exists.

### 5.2 Specific-denial-reason enforcement

New pure core: `src/lib/regulatory/enforcement/denialReason.ts`.

- **Rule:** for LOBs where `inForce.specificDenialReason === true` (all except QHP_FFE), any adverse determination **must** carry a specific reason. The reason must be **extracted, never invented** — sourced from the coverage rule / published criteria the determination was made against (via `publishedCoverage.ts` / `crdDerivation.ts`), not synthesized prose.
- Emits a typed guard: a denial event without a `specificDenialReason` (code + human-readable text traceable to a published rule) is **rejected at write time** into `PaEventStore` for binding LOBs. For QHP_FFE the field is optional.

```ts
export interface DenialReason {
  readonly code: string;          // coding from the coverage rule set
  readonly system: string;        // the rule/criteria system it came from
  readonly text: string;          // extracted human-readable reason (not invented)
  readonly sourceRuleRef: string; // pointer to the publishedCoverage rule
}

export function validateAdverseDetermination(
  input: { lob: LineOfBusiness; outcome: 'DENIED'|'PARTIAL'; reason?: DenialReason; asOf?: string },
): { ok: true } | { ok: false; error: 'DENIAL_REASON_REQUIRED' };
```

This reason is what surfaces in the PAS ClaimResponse (`$submit` result, §6.3) and in the Patient/Provider Access projections.

### 5.3 Metrics reporting pipeline (all LOBs incl. QHP)

Metrics binding is **independent** of the timeframe carve-out — QHPs report even though they are exempt from the timeframes. So the metrics pipeline is gated on `inForce.metricsReporting` (true for all), **not** on `decisionTimeframes`.

```
src/lib/regulatory/metrics/
  measures.ts        # the metric definitions (what to count)
  aggregate.ts       # PaEventStore events -> annual aggregates, grouped by LOB + item/service category
  reportBuilder.ts   # aggregates -> the published report structure (+ machine-readable export)
  __tests__/
```

**What to count** (per the CMS PA metrics reporting requirement, computed per LOB and, where required, per item/service category):
- Total PA requests received; number approved; number denied; number approved after appeal.
- Number of denials that were subsequently overturned/approved.
- Average and median **time** between submission and decision (fed by `paDecisionClock` timestamps on `PaEventStore` events).
- Expedited vs standard breakdown.
- (Extract-only: RHTP counts events it recorded; it never fabricates category buckets that do not exist in the data.)

**How to publish:**
- `aggregate.ts` runs over the reporting year's `PaEventStore` events.
- `reportBuilder.ts` produces (a) a human-readable report and (b) a machine-readable export for public posting.
- Cadence: **first due Mar 31, 2026**, annually thereafter. Wired to a scheduled job (out of scope for the pure core; the core is pure and callable, the schedule is an ops concern — see §9 M6 and §12).
- Route to expose the current published report: `app/api/regulatory/metrics/[year]/route.ts` (read-only, public per the mandate).

**Feature flag:** `flag('regulatory_metrics_pipeline')`. Classic fallback: no report endpoint, manual export path retained.

---

## 6. Da Vinci conformance

RHTP already implements the *logic* of CRD/DTR/PAS. This section is about exposing them as **conformant** Da Vinci interactions and publishing the capability statements.

### 6.1 CRD — CDS Hooks (order-sign, coverage-information)

- Serve a **CDS Services** discovery document at `app/api/cds-services/route.ts` listing at least the `order-sign` and `order-select` hooks.
- Hook handlers (`app/api/cds-services/[hook]/route.ts`) call `crdDerivation.ts` + `publishedCoverage.ts` and return **CDS Hooks cards** carrying **`coverage-information`** system actions (PA required? documentation needed? DTR launch link?).
- Pure core: `src/lib/fhir/crd/cards.ts` maps a coverage determination → CDS card + coverage-information extension. Extract-only: card text comes from the published coverage rule.

### 6.2 DTR — `$questionnaire-package` (SDC)

- `app/api/fhir/prior-auth/Questionnaire/$questionnaire-package/route.ts` returns an **SDC** Questionnaire package (Questionnaire + referenced value sets + any pre-population `Library`/CQL references) for the item/service.
- Pure core: `src/lib/fhir/dtr/questionnairePackage.ts` builds the package; gates on `dtrReadiness.ts` for completion state. Questions/criteria are **extracted** from published coverage content, never invented.
- Pre-population uses US Core data pulled through the same read-model.

### 6.3 PAS — `$submit` wrapping the X12 278

- `app/api/fhir/prior-auth/Claim/$submit/route.ts` accepts a PAS request Bundle, validates it against the PAS profile, hands the `pasBundle.ts`-shaped payload to the 278 boundary, and returns a **ClaimResponse** with the disposition.
- The **X12 278** mapping lives at the boundary: `src/lib/fhir/pas/x12_278.ts` (FHIR PAS ⇄ 278 request/response translation). This is the one genuinely new, complex piece — see risk R-3.
- The ClaimResponse carries the §5.2 specific denial reason for adverse decisions (binding LOBs).
- `$inquire` (`.../Claim/$inquire`) returns current status of a prior submission.

### 6.4 CapabilityStatements

- One `CapabilityStatement` per API façade, served at each `.../metadata` route, generated by `src/lib/fhir/conformance/capabilityStatement.ts` from a **declarative capability spec** (resources, profiles, interactions, `$` operations, search params, security). Structure-driven: the spec is data; the builder is generic.
- Da Vinci/US Core IG version pins live in `src/lib/fhir/profiles/versions.ts` (single source; see risk R-6 on version drift).

---

## 7. Cross-cutting concerns

### 7.1 Auth matrix (per API)

| API | Actor | Auth model | Notes |
|---|---|---|---|
| Patient Access (API-1) | Member's app | **SMART on FHIR** patient-scope OAuth2 | Member authorizes; granular scopes; app registration |
| Provider Access (API-2) | Provider org | **SMART Backend Services** (client-credentials, system scopes) + **UDAP** (per §12) | No member auth; attribution + opt-out gate |
| Payer-to-Payer (API-3) | Peer payer | **UDAP** dynamic reg / **mTLS** trust | Member consent gates release; `$member-match` first |
| Prior Auth (API-4) | Provider/EHR | **SMART on FHIR** (EHR launch) for CRD/DTR; system-to-system for `$submit` | CDS Hooks may run unauthenticated-discovery + authenticated fetch |

- Pure cores under `src/lib/fhir/auth/`: `scopes.ts` (scope parsing/enforcement), `smart.ts` (token introspection contract), `udap.ts` (trust-community metadata), `mtls.ts` (client-cert assertion interface). Actual token issuance is an **external IdP** concern (open decision §12) — RHTP validates, it does not necessarily issue.
- Enforced in a thin middleware layer (`app/api/fhir/_middleware` or per-route guards) that resolves the caller, the target member, and the member's LOB, then checks `inForce.api.<name>`.

### 7.2 Feature flags
Every API and pipeline is independently flaggable, each with a classic fallback:
- `flag('fhir_patient_access')`, `flag('fhir_provider_access')`, `flag('fhir_payer_to_payer')`, `flag('fhir_prior_auth_api')`
- `flag('regulatory_scope_model')`, `flag('regulatory_timeframe_enforcement')`, `flag('regulatory_denial_reason')`, `flag('regulatory_metrics_pipeline')`
- `flag('davinci_crd_hooks')`, `flag('davinci_dtr_package')`, `flag('davinci_pas_submit')`
All read `NEXT_PUBLIC_*` via the existing `flag('name')` reader. Off ⇒ pre-Layer-A behavior; the platform must remain shippable with all Layer A flags off.

### 7.3 Error handling — OperationOutcome
- `src/lib/fhir/resources/operationOutcome.ts` is the single error envelope. Every FHIR route returns a conformant `OperationOutcome` with correct HTTP status (`400/401/403/404/422/500`) and `issue.severity/code/details`.
- A shared route wrapper (`withFhirErrors`) catches thrown domain errors and maps them to OperationOutcome; never leaks stack traces.

### 7.4 Audit
- Every API access (read, search, `$export`, `$submit`, `$member-match`) writes a **FHIR AuditEvent** (or Provenance where a data-lineage claim is needed) via `AuditStore` (interface under `store/`). Required for the access APIs (who accessed whose data) and for PA decisions (who decided, against which rule).
- `src/lib/fhir/audit/auditEvent.ts` builds the AuditEvent; the route wrapper emits it. Opt-out and consent decisions are themselves audited.

---

## 8. (Consolidated) shared contracts recap

The interfaces every milestone depends on, so they can be stubbed first:
- `FhirReadStore`, `PaEventStore`, `AttributionStore`, `OptOutStore`, `ConsentStore`, `P2pIngestStore`, `AuditStore` — all under `src/lib/fhir/store/**`, **interfaces only** in this plan; concrete adapters chosen in §12.
- `RegulatoryProfile` / `Obligation` — `src/lib/regulatory/**`.
- `withFhirErrors`, `capabilityStatement(spec)`, `operationOutcome(...)` — shared route/conformance helpers.

---

## 9. Phased milestones (dependency-ordered)

Each milestone lists new modules, the acceptance/test gate, and "done." Milestones M0–M3 are the **2026 wave** (operational; shippable before the API work). M4–M8 are the **2027 wave** (interoperability). Dependencies are noted.

### M0 — Scope model foundation *(no external dependency; everything depends on it)*
- **New:** `src/lib/regulatory/lineOfBusiness.ts`, `regulatoryMatrix.ts`, `regulatoryProfile.ts`, `resolveLob.ts`, `index.ts`.
- **Gate:** unit tests for all six LOBs; `matrix.parity.test.ts` asserts the table matches §1.2 (QHP carve-out proven); `resolveLob` tested against `patientContext` fixtures incl. the unresolved cases.
- **Done:** `deriveRegulatoryProfile(lob, asOf)` returns correct `inForce` for every LOB across pre/post each compliance date; no LOB literal exists outside these modules.

### M1 — Timeframe enforcement *(depends: M0, `paDecisionClock.ts`)*
- **New:** `src/lib/regulatory/enforcement/timeframe.ts`, `classifyUrgency.ts`, tests.
- **Gate:** unit tests proving 72h/7-day math delegates to `paDecisionClock`; QHP_FFE yields `applicable:false / NOT_APPLICABLE`; breach detection correct at boundary instants.
- **Done:** every PA determination carries a `TimeframeDecision`; QHP never flagged non-compliant on timeframes.

### M2 — Specific denial reason *(depends: M0, `publishedCoverage.ts`/`crdDerivation.ts`)*
- **New:** `src/lib/regulatory/enforcement/denialReason.ts`, tests.
- **Gate:** adverse determination without a reason is rejected for binding LOBs, allowed for QHP_FFE; reason is traceable to a published rule (extract-only) — a synthesized reason fails validation because it lacks `sourceRuleRef`.
- **Done:** no binding-LOB denial can be written without a specific, sourced reason.

### M3 — Metrics pipeline *(depends: M0, `PaEventStore` interface; can proceed with a stub store)*
- **New:** `src/lib/regulatory/metrics/measures.ts`, `aggregate.ts`, `reportBuilder.ts`; `app/api/regulatory/metrics/[year]/route.ts`; tests.
- **Gate:** aggregation over a fixture event set produces correct counts/timings per LOB incl. QHP; report builder emits both human- and machine-readable outputs; Mar-31 cadence job is callable.
- **Done:** a full annual report can be generated for any year from the event store; QHP is included.
- **Milestone marker:** M0–M3 satisfy the **2026 wave** (timeframes + denial + metrics). Shippable independently.

### M4 — Shared FHIR foundation *(depends: M0; gates all API milestones)*
- **New:** `src/lib/fhir/resources/**`, `profiles/**`, `store/**` (interfaces), `search/**`, `paginate.ts`, `conformance/capabilityStatement.ts`, `resources/operationOutcome.ts`, `auth/**` (contracts), `audit/auditEvent.ts`, `withFhirErrors`.
- **Gate:** resource builders emit US-Core/PDex-valid JSON (validated against profile fixtures); OperationOutcome + pagination unit-tested; a generic CapabilityStatement builds from a declarative spec.
- **Done:** any route handler can be built purely by composing these cores; no store adapter chosen yet (interfaces stubbed).

### M5 — Prior Authorization API (PARDD) + Da Vinci conformance *(depends: M4; reuses `pasBundle`, `dtrReadiness`, `crdDerivation`)*
- **New:** `app/api/cds-services/**` (CRD), `app/api/fhir/prior-auth/**` (`$submit`, `$inquire`, `$questionnaire-package`, `metadata`); `src/lib/fhir/crd/cards.ts`, `dtr/questionnairePackage.ts`, `pas/x12_278.ts`.
- **Gate:** CRD returns coverage-information cards; DTR returns an SDC package; `$submit` returns a ClaimResponse carrying the §5.2 denial reason; **X12 278** round-trip tested; CapabilityStatement served at `/metadata`.
- **Done:** the existing PA cores are reachable as conformant CRD/DTR/PAS interactions.

### M6 — Metrics ↔ PA API wiring *(depends: M3, M5)*
- **New:** `PaEventStore` concrete projection from `$submit`/decision/disposition events; wiring so M3 aggregates from real PA events; scheduled report job.
- **Gate:** an end-to-end PA transaction produces events that flow into an annual report; timeframe + denial-reason states are captured on the events.
- **Done:** metrics are computed from live PA activity, not fixtures.

### M7 — Patient Access API *(depends: M4)*
- **New:** `app/api/fhir/patient-access/**`; SMART-on-FHIR guard; PA projection into Claim/ClaimResponse; `_since` search.
- **Gate:** member-scoped read/search returns US Core + PDex + PA data; SMART scopes enforced; another member's data is unreachable; AuditEvent emitted.
- **Done:** a member app can read the member's data incl. PA, member-authorized.

### M8 — Provider Access + Payer-to-Payer APIs *(depends: M4, M7 patterns; these share bulk export)*
- **New:** `src/lib/fhir/bulk/**` (async `$export` engine, ndjson, `_since`, job status); `app/api/fhir/provider-access/**`; `app/api/fhir/payer-to-payer/**` (`$member-match`, `$export`); `AttributionStore`, `OptOutStore`, `ConsentStore`, `P2pIngestStore` adapters; requesting-side `p2p/requestClient.ts`.
- **Gate:** Group `$export` produces ndjson honoring `_type` + `_since`; opt-out members excluded from Provider Access; `$member-match` identifies a member; P2P export constrained to the ≤5-year window and gated on consent; UDAP/mTLS trust enforced.
- **Done:** all four APIs live behind flags with conformant CapabilityStatements — the **2027 wave** is buildable.

**Critical path:** M0 → M4 → {M5, M7} → M8. M1/M2/M3 (2026 wave) run in parallel off M0 and ship first. M6 joins M3 and M5.

---

## 10. Test strategy

### 10.1 Unit gates (pure cores — the primary safety net)
- Every module in `src/lib/regulatory/**` and `src/lib/fhir/**` is pure and unit-tested; coverage gate enforced in CI. Cores must be testable without a running server (pure-core discipline).
- **Property/parity tests:** `matrix.parity.test.ts` (matrix ⇄ §1.2 prose), boundary tests on `paDecisionClock` delegation, extract-only assertions (denial reason must carry `sourceRuleRef`).
- Resource builders validated against **profile fixtures** (US Core, PDex, HRex, PAS, CRD, DTR) using a FHIR validator in test (`hl7.fhir.validator` or `fhir.js`-style structural checks) — a decision in §12 on validator tooling.

### 10.2 Conformance suites (Inferno / Touchstone-style)
- **Inferno** (ONC's FHIR test kit) test suites run against a deployed test instance for: US Core, **SMART App Launch**, **Bulk Data**, and the Da Vinci PA test kits (CRD/DTR/PAS) where available. Wire an **Inferno** run into CI (containerized) per API façade; store the expected-pass manifest in `src/lib/fhir/conformance/inferno/`.
- **Touchstone** (AEGIS) TestScripts for FHIR interaction-level conformance (search params, `$` operations, CapabilityStatement assertions) where Inferno coverage is thin.
- Each API milestone's "done" includes a **green conformance manifest** for its façade, not just green unit tests.

### 10.3 Integration + contract tests
- Route handlers tested against the store **interfaces** with in-memory adapters (contract tests the real adapter must also pass).
- Auth: token/scope enforcement tested with mock SMART/UDAP assertions; opt-out and consent gates tested as first-class cases.
- X12 278 round-trip: golden-file tests (FHIR PAS in → 278 out → 278 response in → ClaimResponse out).

### 10.4 CI gate summary
A milestone is mergeable only when: unit gates green + relevant conformance manifest green + feature-flag-off path proven (platform still boots and behaves pre-Layer-A with all flags off).

---

## 11. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **QHP carve-out mis-applied** — QHP flagged non-compliant on timeframes, or a binding LOB wrongly exempted | Med | High (regulatory) | Carve-out isolated to `regulatoryMatrix.ts`; `matrix.parity.test.ts` guards it; enforcement reads `inForce` only |
| R-2 | **Metrics/timeframe coupling bug** — metrics gated on timeframe applicability, dropping QHP from reports | Med | High | Metrics gated on `inForce.metricsReporting` (all true), explicitly decoupled; test asserts QHP appears in report |
| R-3 | **X12 278 ⇄ FHIR PAS mapping** is genuinely hard and under-specified in fixtures | High | High | Isolate at `pas/x12_278.ts` boundary; golden-file tests; consider a certified 278 clearinghouse (see §12 D-4); build behind `flag('davinci_pas_submit')` |
| R-4 | **Persistence choice deferred too long** — store interfaces exist but no adapter, blocking M6/M7/M8 | Med | Med | Interfaces first (M4) with in-memory adapters; force the §12 D-1 decision before M6 |
| R-5 | **Bulk export scale / async job semantics** ($export ndjson, polling, `_since`) | Med | Med | Dedicated `fhir/bulk/**` engine; conformance-tested via Inferno Bulk Data suite |
| R-6 | **IG version drift** — US Core / Da Vinci IG versions move; profiles/capability statements go stale | Med | Med | Single version pin (`profiles/versions.ts`); conformance suite catches drift; pin reviewed each release |
| R-7 | **Auth model spread** (SMART vs UDAP vs mTLS across four APIs) — inconsistent enforcement | Med | High | Central auth cores + one middleware; per-API auth matrix (§7.1) is the spec; opt-out/consent tested as first-class |
| R-8 | **Consent/opt-out data model incomplete** for Provider/P2P access | Med | High | `ConsentStore`/`OptOutStore` interfaces defined in M4; gates tested in M8; member-facing opt-out UX flagged as dependency |
| R-9 | **Extract-only violated** — denial reasons or DTR questions synthesized rather than sourced | Low | High | `sourceRuleRef` required on `DenialReason`; DTR questions built only from published coverage content; tests reject unsourced content |
| R-10 | **2027 deadline compression** if API work starts late | Med | High | 2026 wave (M0–M3) ships independently; M4 foundation can start immediately in parallel |

---

## 12. Open decisions to resolve before starting

An engineer must settle these before/at the noted milestone. None should be guessed silently.

- **D-1 (before M6/M7) — Persistence & read-model technology.** `FhirReadStore`, `PaEventStore`, and friends are interfaces. Decide the concrete store: a FHIR-native server (e.g. HAPI/Aidbox) fronted by RHTP, a relational read-model with FHIR projection, or an event-sourced log. Affects bulk `$export` feasibility (R-5) and P2P ingest.
- **D-2 (before M7/M8) — Identity provider / authorization server.** Does RHTP issue SMART/UDAP tokens or validate tokens from an external IdP? Which UDAP trust community for payer-to-payer? mTLS CA/cert management.
- **D-3 (before M8) — Attribution & consent sources.** Where do provider-member attribution and member opt-out / P2P consent originate (payer enrollment system, a new UX, an external feed)? This is a data-availability question, not just a schema one (R-8).
- **D-4 (before M5) — X12 278 path.** Build the FHIR-PAS⇄278 mapping in-house (`pas/x12_278.ts`) or route through a certified clearinghouse? Determines the boundary contract and the risk profile of R-3.
- **D-5 (before M4) — FHIR validation tooling.** Which validator runs in CI for profile conformance (official HL7 Java validator containerized, vs. a JS structural validator)? Determines the M4 test harness.
- **D-6 (before M8) — Inferno/Touchstone hosting.** Self-host Inferno in CI vs. use hosted test kits; which Da Vinci PA test kits are current at execution time (R-6). Confirm against the then-current ONC/HL7 kits.
- **D-7 (before M3) — Metrics publication surface.** The mandate requires public posting; decide the public channel (a public route, a static export to the payer's public site, or both) and the machine-readable format expected at execution time.
- **D-8 (cross-cutting) — Multi-tenant LOB operation.** Confirm whether a single RHTP deployment serves multiple LOBs simultaneously (multi-tenant) or one LOB per deployment. Affects how `resolveLob` is invoked (per-request vs per-deployment config) and the metrics grouping.

---

## 13. Definition of done for Layer A

Layer A is complete when:
1. Every PA determination is scoped to a `RegulatoryProfile`, with the QHP carve-outs provably correct (M0–M2).
2. Timeframe and specific-denial-reason enforcement are wired to `paDecisionClock` and the determination flow for all binding LOBs (M1–M2).
3. An annual public PA metrics report can be generated for all LOBs incl. QHP, from live PA events (M3, M6).
4. All four FHIR APIs are served behind feature flags with conformant CapabilityStatements, passing their Inferno/Touchstone manifests (M5, M7, M8).
5. CRD/DTR/PAS are exposed as conformant Da Vinci interactions over the existing cores (M5).
6. Auth, OperationOutcome, and AuditEvent are enforced uniformly across all API surfaces (M4, cross-cutting).
7. With all Layer A flags off, the platform boots and behaves exactly as pre-Layer-A (classic fallback proven in CI).
