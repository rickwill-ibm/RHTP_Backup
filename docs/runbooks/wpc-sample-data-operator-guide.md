# Operator guide — the 5-patient sample datasets: access, load, and test

A hands-on, copy-paste runbook for the whole-person (WPC) sample data. It covers, step by step:

- **§1** where the sample datasets are and what each patient contains
- **§2** prerequisites
- **§3** regenerate + validate the datasets
- **§4 — Path A: the simulator** (in-process pipeline → projected knowledge graph; no external services)
- **§5 — Path B: direct load to a FHIR R4 server** (HAPI)
- **§6 — Path C: the knowledge graph** (Postgres or Neo4j)
- **§7** how to test (and what "correct" looks like — exact expected numbers)
- **§8** the duplicate-source demonstration
- **§9** the remediation / reprocessing round trip
- **§10** batch vs. stream ingest (the FHIR-Subscription worked example)
- **§11 — running this as an AI agent** (Claude / Codex / IBM watsonx "Bob"): a precise, self-checking checklist
- **§12** Da Vinci Risk Adjustment coding gaps (the projected coding-gap dimension)

This is the operational companion to the conceptual `wpc-record-load-runbook.md`. Every command below has been run against this repo; expected outputs are the real numbers.

---

## 1. The sample datasets

Location: **`fhir/seed/patients/`**. Five FHIR R4 (4.0.1) **transaction** bundles + a manifest.

| File                          | Patient         | Entries | What it exercises                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dorothy-simmons.bundle.json` | Dorothy Simmons |      52 | full whole-person: chronic conditions, meds, labs, 4 SDOH screens (Gravity/AHC-HRSN LOINC → Z-code), PHQ-9 + AUDIT-C, closed-loop CBO referral (Task), Coverage, Encounter, RiskAssessment (RAF 3.42 / ER-risk 84%), care-gap Flags, 2 RA coding gaps (V28+V24 — model coexistence) |
| `james-wilson.bundle.json`    | James Wilson    |      44 | CHF + T2DM + depression, rural transport barrier, overdue labs as orders, RAF 2.8, 2 RA coding gaps (HF pending, diabetes net-new)                                                                                                                                                  |
| `robert-chen.bundle.json`     | Robert Chen     |      40 | HTN + CKD 3b + **AUD**; **42 CFR Part 2 Consent**; financial SDOH referral flagged for human review (SR-3); RAF 1.9, 2 RA coding gaps (SUD suspected → Part 2-restricted; CKD historic)                                                                                             |
| `lisa-thompson.bundle.json`   | Lisa Thompson   |      37 | severe asthma + obesity; SNAP-Ed nutrition referral; RAF 1.4, 1 RA coding gap (COPD suspected)                                                                                                                                                                                      |
| `alex-kirby.bundle.json`      | Alex Kirby      |      52 | the **uncoded state-export** fixture — 27 records arrive with NO codes (5 real chronic conditions + a "High" social-risk score + SDOH history), so they quarantine for remediation instead of projecting; 1 RA coding gap (suspected, no evidence → cannot close)                   |

Total across the five: **225 resources** (217 clinical/SDOH/BH/payer + 8 Da Vinci-RA Coding Gap MeasureReports, §12). `manifest.json` lists each bundle + its per-resource-type counts (the loader reads it). `README.md` documents the modeling (Gravity closed loop, Z-codes, PHQ-9 44249-1 / AUDIT-C 75626-2, 42 CFR Part 2, RA coding gaps).

Each bundle is `Bundle.type = transaction`: every entry has a `urn:uuid` `fullUrl` + `request.method = POST`, so intra-bundle references resolve on load and the server assigns real ids.

---

## 2. Prerequisites

```bash
# from the repo root
npm install                                  # once — installs node deps (pg, vitest, next, …)
python3 -m pip install 'fhir.resources<7'    # for the R4 model validator (pydantic v1 line)
```

- **Simulator + knowledge graph (Path A / C)** run fully **in-process** — no database, no Docker. pg-mem (an in-process Postgres SQL engine) and a Neo4j fake back the graph.
- **FHIR R4 server (Path B)** needs Docker (the repo ships a local HAPI backbone via `docker compose`).
- Node 18+ (global `fetch`).

---

## 3. Regenerate + validate the datasets

The bundles are committed, so you can skip regeneration and go straight to §4. To rebuild them from the patient registry:

```bash
# 3a. regenerate the 5 bundles + refresh the governed terminology delta
node tools/seed/gen-patient-bundles.mjs
node tools/seed/expand-terminology.mjs        # adds SDOH Z-codes, LOINC panels, HCPCS/SNOMED referral codes

# 3b. validate: FHIR R4 models + intra-bundle reference integrity
python3 tools/seed/validate-bundles.py fhir/seed/patients
```

Expected (3b): **`5 bundles · 225 resources · 0 issues`**, every `urn:uuid` reference resolves.

---

## 4. Path A — the simulator (in-process pipeline → projected graph)

The "simulator" is the platform's own pipeline run end-to-end **without any external service**: FHIR bundle → EMPI identity resolution → semantic mapping + validation → projected knowledge graph. It is driven by `ingestBundle` (`src/lib/runtime/ingestBundle.ts`) and exercised, with assertions, on **both** graph backends by the record-load suite.

### 4a. Run the simulator over all five patients

```bash
npx vitest run tests/wpc/wpcRecordLoad.test.ts
```

This loads all five bundles through the real driver into a projected graph (pg-mem **and** Neo4j fake) and asserts admission, domain routing, holistic-context population, EMPI behaviour, and 42 CFR Part 2 restriction. Expect: **all tests pass, both backends.**

### 4b. Drive it programmatically (a real feed trigger, or your own script)

The production shape — one call per bundle, passing the **source system** (the label that scopes identity):

```ts
import { ingestBundle } from '@/lib/runtime/ingestBundle';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import { makePgGraphStore } from '…/tests/graph/helpers'; // or makeNeo4jFakeStore, or your production GraphStore
import { createMemoryDeadLetterStore } from '@/lib/deadLetter';
import { createMemoryReconciliationStore } from '@/lib/runtime/reconciliation';

const graph = await makePgGraphStore(); // Postgres semantics (swap for Neo4j — §6)
const stores = {
  outbox: createMemoryOutboxStore(),
  graph,
  checkpoint: createMemoryCheckpointStore(),
  xref: createXrefIndex({ now: () => Date.now() }),
  deadLetter: createMemoryDeadLetterStore(), // durable hold ledger (§9)
  reconciliation: createMemoryReconciliationStore(), // the audit-balance-control ledger (§7)
};

const bundle = JSON.parse(
  fs.readFileSync('fhir/seed/patients/dorothy-simmons.bundle.json', 'utf8')
);
const result = await ingestBundle(bundle, { sourceSystem: 'ehr-dorothy-simmons' }, stores);

// result.memberId          → the anchored member
// result.admittedByDomain  → loaded count per domain (conditions, sdoh, coverage, encounter, risk-assessment, flag, …)
// result.quarantined       → held records (PHI-safe), e.g. uncoded resources
// result.nonProjected      → administrative census (Patient/Organization/CarePlan/Consent/care-gap)
// result.reconciliation    → the signed per-load balance record (see §7)
```

> Two bundles from **different** sources must pass **different** `sourceSystem` values — that is what keeps a reused MRN from cross-linking two different people (see §8).

---

## 5. Path B — direct load to a FHIR R4 server (HAPI)

Populate an actual FHIR R4 repository. The bundles are transactions, so the server assigns ids and resolves references atomically.

```bash
# 5a. bring up the local HAPI R4 backbone (Docker)
npm run backbone:up                 # docker compose -f install/docker-compose.backbone.yml up -d  → HAPI on :8090

# 5b. load every patient as a FHIR transaction
FHIR_BASE=http://localhost:8090/fhir node tools/seed/load-all-patients.mjs
```

`load-all-patients.mjs` reads `manifest.json` and POSTs each bundle, printing per-bundle HTTP status + created-resource count.

- Point at **any** R4 endpoint: set `FHIR_BASE=https://your-server/fhir`.
- Auth: set `BEARER=<token>`.
- Tear down: `npm run backbone:down`.
- **Coding-gap evidence refs:** the Da Vinci-RA Coding Gap MeasureReports (§12) cite evidence by **logical id** (`Condition/<id>`, `Encounter/<id>`) — the only non-`urn:uuid` references in the seed set — because that is the key the **knowledge graph** (Path A/C) joins on. The backbone compose therefore sets `allow_external_references: true` + `enforce_referential_integrity_on_write: false` so the transaction loads cleanly; on the FHIR server those refs are stored as-is (evidence linkage is materialized in the graph, not on HAPI). Point a stricter external server at the bundles only with the same two settings enabled.

Verify a load, e.g.: `curl "http://localhost:8090/fhir/Patient?name=Simmons"`.

---

## 6. Path C — the knowledge graph (Postgres or Neo4j)

The graph projection is **store-agnostic**: the same mapping specs project onto a Postgres backend and a Neo4j backend identically (the record-load suite asserts they agree). Choose the backend by swapping the `graph` store in §4b:

| Backend      | Store (today, in-process)                                     | Semantics               | Production wiring                                                                                                                                              |
| ------------ | ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres** | `makePgGraphStore()` (pg-mem — real Postgres SQL, in-process) | nodes/edges as SQL rows | provide a `GraphStore` over a live `pg` Pool; the mutation set (`UpsertNode`/`UpsertEdge`/`SetLabel`) is backend-agnostic, so no mapping-spec change is needed |
| **Neo4j**    | `makeNeo4jFakeStore()` (in-process Cypher-shaped fake)        | nodes/edges as graph    | provide a `GraphStore` over the Neo4j driver                                                                                                                   |

What lands in the graph per member: `Member` + `Condition`, `Medication`, `Observation` (labs), `SdohScreening` / `SocialNeed`, `BehavioralHealthObservation`, `Coverage`, `Encounter`, `RiskAssessment` (RAF as a number), `Flag`, `CareTeam`, referral/goal nodes — consent-scoped (42 CFR Part 2 content is hidden without a covering grant).

> Today the two in-process backends are the runnable path (they carry real Postgres SQL and real Cypher semantics). Pointing the projection at a **live** Postgres or Neo4j is a matter of supplying a production `GraphStore` behind the existing seam — the projection code does not change. Wiring those live backends is the tracked production step.

Inspect the projected graph after a load (in a script or test):

```ts
await graph.listNodes({ kind: 'RiskAssessment' }); // → [{ properties: { rafScore: 3.42, probability: 0.84, … } }]
await graph.listNodes({ kind: 'SdohScreening' });
```

---

## 7. How to test — and what "correct" looks like

### 7a. Run the full verification

```bash
rm -f /var/run/docker.sock 2>/dev/null      # so the Docker-only integration suites skip cleanly
npx tsc --noEmit                            # types: 0 errors
npx vitest run                              # full suite: green
bash scripts/ci-gates.sh push               # the authoritative commit gate (types, sizes, lint, unit, wiring, provenance, coalition)
```

### 7b. The audit-balance-control (ABC) numbers — the reconciliation

Every load emits a signed `LoadReconciliationRecord` (`result.reconciliation`) where `balanced` is a real conservation check. Across the five seed patients, loaded together, the census is:

| Bundle          |   total | admitted | quarantined | non-projected | projected → graph | balanced |
| --------------- | ------: | -------: | ----------: | ------------: | ----------------: | :------: |
| dorothy-simmons |      52 |       40 |           0 |            12 |                40 |    ✓     |
| james-wilson    |      44 |       33 |           0 |            11 |                33 |    ✓     |
| robert-chen     |      40 |       29 |           0 |            11 |                29 |    ✓     |
| lisa-thompson   |      37 |       26 |           0 |            11 |                26 |    ✓     |
| alex-kirby      |      52 |       22 |          27 |             3 |                22 |    ✓     |
| **TOTAL**       | **225** |  **150** |      **27** |        **48** |           **150** |    ✓     |

Conservation: **150 + 27 + 48 = 225** (every resource in exactly one bucket) and **projected == admitted** (nothing lost load→graph). Alex's 27 quarantines are the intentional uncoded-intake fixture (§9). The counts rose from 217/142 after the Da Vinci Risk Adjustment demo wave added **8 Coding Gap MeasureReports** across the five patients (each a single condition-category group → one projected `CodingGap`, so the balance is preserved); see §12. This table is what a correct run reproduces.

### 7c. Targeted suites (fast signal)

```bash
npx vitest run tests/wpc/wpcRecordLoad.test.ts          # load + routing + EMPI + Part 2, both backends
npx vitest run tests/wpc/remediationReprocess.test.ts   # the remediation round trip (§9)
npx vitest run tests/pipeline/domainRecordCount.test.ts # the 23/23 domain invariant (no silent domain drift)
```

---

## 8. The duplicate-source demonstration

The safety property "the same person from two sources consolidates; two different people who share an MRN do NOT merge; a near-match holds" is proven in section 4 of `tests/wpc/wpcRecordLoad.test.ts`. To see it directly:

- **Same person, two sources** — ingest two bundles carrying the same global medicaid id under **different** `sourceSystem` values → they resolve to the **same** member (clinical picture consolidates).
- **Different people, reused MRN** — two bundles whose patients share an MRN but come from different sources do **not** merge (an MRN is source-local; `localId` matches only when assigning authority _and_ value are equal).
- **Ambiguous near-match** — same name + DOB, no strong identifier → the whole bundle is **held** for review, never auto-merged (comingling is treated as worse than holding).

Run: `npx vitest run tests/wpc/wpcRecordLoad.test.ts -t "EMPI"`.

---

## 9. The remediation / reprocessing round trip

Alex Kirby's 27 uncoded records model the universal case of data arriving **without codes** (state exports, legacy EHR, HIE feeds, free-text). They quarantine to the durable, append-only dead-letter ledger — never dropped, never fabricated a code. Once a steward codes a held record, it is reprocessed back onto the **same** member and its hold is resolved.

```bash
npx vitest run tests/wpc/remediationReprocess.test.ts
```

This proves, on both backends: the uncoded Type 2 Diabetes Condition quarantines and persists to the ledger (balanced reconciliation); a steward's corrected (E11.9-coded) copy reprocesses onto Alex's same member; the E11.9 node projects; the hold is marked `retried`; and the guards refuse to close a hold on the wrong member or the wrong resource. Programmatic API: `remediateAndReprocess(correctedBundle, { holdId, actor, sourceSystem, expectedMemberId }, stores)` in `src/lib/runtime/remediation.ts`.

---

## 10. Batch vs. stream ingest

**Both are supported, over the SAME transform → outbox → graph path.** The difference is only the _shape of arrival_ and which front-door driver you call — the parse/validate/normalize/segmentation logic, the outbox, and the projected graph are identical.

|                                  | **Batch**                                                                | **Stream**                                                                           |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Arrival shape                    | a FHIR **transaction/collection bundle** (a whole record)                | **one** FHIR resource at a time (a FHIR R4 **Subscription** notification)            |
| Front-door driver                | `ingestBundle(bundle, opts, stores)` (`src/lib/runtime/ingestBundle.ts`) | `ingestStreamEvent(resource, opts, stores)` (`src/lib/runtime/ingestStreamEvent.ts`) |
| Lane `class` on the outbox event | `batch`                                                                  | `stream`                                                                             |
| Identity anchor                  | the bundle's **Patient demographics** (name/DOB/sex + medicaid/MRN)      | the resource's **subject reference** only (a bare id token)                          |
| Unknown subject                  | refuses to mint blind → **holds** (no Patient / possible-match)          | refuses to mint blind → **holds** (see the safety gate below)                        |

**Micro-batch** is the third declared mode (`ArrivalMode = 'batch' | 'stream' | 'micro-batch'`) — a small time/size window of resources — and rides the same path; `laneClass` treats anything other than `'stream'` as a batch lane.

**The lane is real, not cosmetic.** Every outbox event is stamped `class` from the owning adapter's `arrivalMode` (`toIntentInput` → `laneClass(mode)` in `src/lib/pipeline/load.ts`). The shared FHIR-JSON adapters declare `arrivalMode:'batch'`; the stream driver wraps the owning adapter with `asStreamAdapter` (a shallow copy with `arrivalMode:'stream'` — the shared adapter is never mutated) so the same logic runs but the event is stamped `class:'stream'`. You can see both classes side by side in one shared outbox: after a batch load + a streamed event, `outbox.all()` shows the streamed intent carries `class:'stream'` and every batch intent carries `'batch'`.

**Consolidation — a streamed event lands on the batch-loaded member.** Both drivers resolve identity through the SAME shared cross-reference (`stores.xref`) under the SAME `idScope` (= `sourceSystem`). So if you batch-load a patient and then stream a new resource for them with the **same `sourceSystem`**, the streamed resource projects onto the **existing** member — no duplicate. Use a **different** `sourceSystem` to namespace a token apart.

**Identity-safety gate (why a stream event never mints blind).** A single streamed resource has no demographics, so the id-only path would otherwise mint a phantom member for any unknown token. The stream driver refuses that fail-open: the subject token must already resolve in the shared xref (`linked` — a prior batch load anchored it), **or** you pass an operator-confirmed `expectedMemberId` (which seeds the link). An unknown (`unlinked`) token with no `expectedMemberId`, or an `ambiguous` token, is **held for identity review** — a first-class `held:true` result + a PHI-safe `held-identity` dead-letter — and nothing is minted or projected. Resolve the identity, then re-stream with `expectedMemberId`.

**Balance-control parity.** Like the batch lane, every stream event emits one PHI-safe `LoadReconciliationRecord` (`countIn:1`, `balanced` proving the one resource landed in exactly one census bucket) — admitted, unrouted, or held — so nothing is silently dropped.

Run the worked example (both graph backends):

```bash
npx vitest run tests/wpc/streamEvent.test.ts
```

It proves: same-member consolidation, the real `class:'stream'` lane, labs-vitals projection, an unroutable `Basic` (unrouted + balanced record), an unknown subject **held** (no blind mint), operator-confirmed `expectedMemberId` consolidation, the wired-store durable trace (held-identity dead-letter + balanced reconciliation), and idempotency (streaming the same Observation twice → exactly one node). Programmatic API: `ingestStreamEvent(resource, { sourceSystem, expectedMemberId?, now?, rng? }, stores)`.

---

## 11. Running this as an AI agent (Claude / Codex / IBM watsonx "Bob")

Hand the agent the block below verbatim. It is self-checking — each step names the exact expected output, so the agent can verify rather than assume.

```
GOAL: Load the 5 WPC sample patients through the platform and prove it worked, three ways
(simulator, FHIR R4 server, knowledge graph), with an audited reconciliation.

CONTEXT: repo root has fhir/seed/patients/ (5 transaction bundles + manifest.json),
tools/seed/ (generator, validator, loader), and tests/wpc/ (the driver-backed suites).
The pipeline is: FHIR bundle -> EMPI identity -> semantic mapping/validation -> projected graph.

STEP 1 — prerequisites. Run `npm install` and `python3 -m pip install 'fhir.resources<7'`.
  VERIFY: both exit 0.

STEP 2 — validate the datasets.
  RUN: python3 tools/seed/validate-bundles.py fhir/seed/patients
  VERIFY: output contains "5 bundles" and "0 issues".

STEP 3 — simulator (in-process pipeline -> graph, both backends).
  RUN: rm -f /var/run/docker.sock 2>/dev/null; npx vitest run tests/wpc/wpcRecordLoad.test.ts
  VERIFY: all tests pass. This is the end-to-end load + routing + EMPI + Part 2 proof.

STEP 4 — reconciliation / balance-control.
  RUN: npx vitest run tests/wpc/remediationReprocess.test.ts
  VERIFY: all tests pass. Confirms the per-load reconciliation is balanced and the
          uncoded->coded->reprocessed->hold-resolved round trip works.
  EXPECTED census when the 5 load together: total 225 = admitted 150 + quarantined 27
          + non-projected 48; projected == admitted (150). Alex's 27 are uncoded-by-design.
          (225 = 217 clinical/SDOH/BH/payer + 8 Da Vinci-RA Coding Gap MeasureReports.)

STEP 5 — FHIR R4 server (only if Docker is available).
  RUN: npm run backbone:up
       FHIR_BASE=http://localhost:8090/fhir node tools/seed/load-all-patients.mjs
  VERIFY: each bundle returns HTTP 200/201 with a created-resource count.
  If Docker is NOT available: skip this step and say so — it is not required for steps 3/4/6.

STEP 6 — knowledge graph backend choice.
  The projection is store-agnostic. Postgres = makePgGraphStore() (pg-mem, real SQL);
  Neo4j = makeNeo4jFakeStore(). Both are asserted to agree in step 3. To target a LIVE
  Postgres/Neo4j, supply a production GraphStore behind the existing seam — no mapping change.

STEP 7 — full gate (before any commit).
  RUN: npx tsc --noEmit && npx vitest run && bash scripts/ci-gates.sh push
  VERIFY: tsc 0 errors; suite green; gate prints "ALL GATES PASS (push)".

RULES:
- Do NOT fabricate codes for uncoded records — quarantine is correct; remediation (step 4) is the path back in.
- Do NOT commit or push unless a human explicitly approves it.
- If a step's VERIFY does not match, STOP and report the actual output — do not proceed.
```

---

## 12. Da Vinci Risk Adjustment coding gaps

The platform projects the **Da Vinci Risk Adjustment (RA) Coding Gap** as a first-class knowledge-graph dimension (`hl7.org/fhir/us/davinci-ra`). A payer's RA engine produces Coding Gap `MeasureReport`s per member **per risk-model version** (the seed data uses one condition-category group per report so each maps to exactly one projected node) — where each `group` is a condition category (HCC) carrying an evidence status (`open-gap`/`closed-gap`/`pending`), a suspect type (`historic`/`suspected`/`net-new`), a hierarchical status, and links to the supporting evidence it cites. Ingest one like any other resource (in a bundle with the member's Patient); it projects to a `CodingGap` node with `HAS_CODING_GAP` and `SUPPORTED_BY` edges.

What "correct" looks like, and the safety properties this dimension guarantees:

- **Model-version aware.** A member legitimately has several gap reports at once (CMS-HCC V24 and V28 through the PY2026 blend). Nodes are keyed by `(measureReportId, model, version, group, condition category)`, so V24 and V28 gaps coexist and never collapse.
- **Coding-intensity firewall (the central compliance rule).** A coding gap — especially a `suspected` one — is a payer HYPOTHESIS, never an asserted diagnosis. The dimension is NOT code-carrying (it never runs the clinical semantic-binding gate), its edges are associative (never causal), and it NEVER mints a `Condition`: a cited `Condition/x` reference is recorded on a neutral `Evidence` node (join back via `evidenceRef`), so a hypothesis can never materialize as a diagnosis.
- **RADV-defensibility gate (now wired — P1a enrichment).** The loop evidence → gap → RADV-defensible submission is closed by the **coding-gap → RADV bridge** (`materializeCandidateCaptures`, `src/lib/finance/riskAdjustment/codingGapBridge.ts`). It is a consent-safe **two-hop** read — `Member → CodingGap → SUPPORTED_BY → Evidence ⇒ Condition/Encounter` — that turns a member's **closed** gaps into candidate `HccCapture`s and scores each with the existing `assessRadvDefensibility` (MEAT + face-to-face DOS + rendering-provider NPI + source-document linkage). To make that possible the seed now **enriches** the cited evidence: a closed-gap `Condition` carries an `ra-meat` extension (the four MEAT booleans) and its cited `Encounter` carries `ra-renderingProviderNpi`, `ra-sourceDocument`, and a period start (the DOS) — all PHI-safe, projected onto the graph nodes. Three invariants hold: **only `closed-gap` gaps are eligible** (a `suspected`/`open` hypothesis is never materialized as a submittable capture — the firewall again); **consent is re-checked on every hop** including the joined clinical node (a restricted Part 2 diagnosis is dropped unless the scope covers it); and a **membership guard** rejects any cited node not linked to this member. A closed gap with a diagnosis but no valid F2F encounter still surfaces — flagged with its RADV deficiencies — so a reviewer sees the remediation rather than a silent drop. Nothing here submits; it only scores.
- **42 CFR Part 2.** A SUD-linked HCC gap (V24 HCC54/55; V28 HCC135-138) projects as a RESTRICTED node and is filtered by the consent lens exactly like a Part 2 Condition/Flag — excluded under `NO_CONSENT`, disclosed under a covering scope.
- **Honest census.** A Da Vinci-RA MeasureReport PROJECTS; any other MeasureReport is a loud by-design non-projection (`MeasureReport:non-ra`), never silently absorbed. An ungoverned status/suspect QUARANTINES (never guessed).

Run the worked example (both graph backends):

```bash
npx vitest run tests/wpc/codingGapDimension.test.ts
```

Read a member's gaps from the projected graph via the holistic context: `codingGaps` (a `CodingGapSummary` with `openCount` = actionable recapture backlog and `suspectedCount` = hypotheses needing clinical confirmation). Programmatic API: the `codingGapReportAdapter` (`src/lib/pipeline/adapters/codingGapReport.ts`) + `codingGapSpec` (`src/lib/graph/mapping/codingGap.ts`).

Read the RADV **candidate captures** (the P1a enrichment) via `GET /api/risk-adjustment/hcc?memberId=<id>` — a reviewer/ops-only route that decides the consent scope **server-side** from the member's Part 2 directives × recipient × purpose (never a caller-supplied scope), reads the shared projected graph, and returns each member's closed gaps as `{ capture, defensibility }` pairs plus a `defensible` count; it fails **closed** (503) if the graph read is unavailable. The worked example, on both graph backends:

```bash
npx vitest run tests/finance/codingGapBridge.test.ts tests/wpc/wpcRecordLoadRadv.test.ts
```

Dorothy's closed V28 diabetes gap resolves to a RADV-defensible candidate (MEAT + a 10-digit NPI + a DOS + a source document); Robert's CKD gap does too, while his SUD gap never yields a candidate (firewall + Part 2 consent), even under a covering scope.

**Report gaps back out (Da Vinci-RA `$report`).** `GET /api/risk-adjustment/coding-gap-report?memberId=<id>` returns a FHIR searchset `Bundle` of Da Vinci-RA Coding Gap `MeasureReport`s reconstructed from the member's projected `CodingGap` subgraph — the inverse of ingest, for a payer RA engine or a data-exchange partner. Same server-side consent decision as above (a Part 2 SUD gap is redacted from the report unless the requester is entitled to it, and each cited evidence node is re-checked), same fail-closed. It is round-trip faithful: an emitted report re-ingests to the same nodes (`assembleCodingGapReports`, `src/lib/finance/riskAdjustment/codingGapReportOut.ts`; `npx vitest run tests/finance/codingGapReportOut.test.ts`).

**Hierarchy-aware RAF (Wave D).** The member's `riskProfile` now carries a `hierarchicalRaf` computed from the member's ASSERTED (source-coded) HCCs with CMS-HCC **disease-hierarchy suppression** applied — a less-severe HCC is dropped when a superseding one in the same family is present, so the member is never double-counted (`computeHierarchicalRaf`, `src/lib/finance/riskAdjustment/raf.ts`). A separate, clearly-labeled `suggestedRaf` is an **advisory** uplift the ICD→HCC crosswalk proposes for conditions coded with an ICD but no HCC — for human review, never an asserted diagnosis (`resolveIcdToHcc`, `hccCrosswalk.ts`). The weight table, disease hierarchy, and ICD→HCC map are **illustrative bundled stubs** (`src/lib/finance/riskAdjustment/data/*.json`) — placeholders for demo/graph rendering, NOT the licensed CMS model — swapped for the real, version-correct tables via `setRafModelData()` / `setHccCrosswalkProvider()` with no code change. Worked example: `npx vitest run tests/finance/raf.test.ts`.

---

## 13. Troubleshooting

| Symptom                                              | Cause                                      | Fix                                                                                              |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `validate-bundles.py` import error                   | `fhir.resources` 7.x needs pydantic v2     | `pip install 'fhir.resources<7' --break-system-packages` (a venv at `/tmp/fv` may already exist) |
| integration/testcontainer suites try to run and fail | a Docker socket is present                 | `rm -f /var/run/docker.sock` so they skip cleanly (they are a separate lane)                     |
| `load-all-patients.mjs` non-2xx                      | FHIR endpoint down or auth                 | `npm run backbone:up`; set `BEARER`; check `FHIR_BASE`                                           |
| a bundle is HELD (`result.held`)                     | identity landed in the possible-match band | expected for an ambiguous demographics-only match; resolve the member, then re-ingest            |
| a record quarantines with `missing-*-code`           | no governed code on the resource           | code it, then remediate (§9) — never fabricate a code                                            |
| `domainRecordCount` fails                            | a change added a mapping spec/domain       | reuse an existing spec by event-type prefix instead of adding one                                |
