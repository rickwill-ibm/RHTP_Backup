# Runbook — Whole-Person (WPC) record load: source → EMPI → mapping/validation → FHIR repository + knowledge graph

**Audience:** platform/integration engineers loading the whole-person FHIR R4 records for the five demo
patients (Dorothy Simmons, James Wilson, Robert Chen, Lisa Thompson, Alex Kirby) into (a) a FHIR repository and
(b) the projected knowledge graph, and demonstrating that duplicate records arriving from different sources are
resolved to one member without false-merging two different people.

This runbook is the operational companion to `fhir/seed/patients/README.md` (what the bundles contain) and the
coalition log entries dated 2026-09-02 (why the ingestion code is shaped the way it is). Every command below is
runnable in the repo as it stands; nothing here is aspirational.

---

## 1. The path, end to end

A record travels through six stages. The same stages run whether the source is an EHR export, a payer feed, a
behavioral-health registry, or a state file — only the **source system** label differs, and that label is what
keeps two sources' identifiers from colliding.

```
  SOURCE            EMPI / identity          SEMANTIC MAPPING + VALIDATION        LANDING
  ┌────────┐        ┌──────────────┐         ┌───────────────────────────┐       ┌──────────────────────┐
  │ FHIR   │  ───▶  │ resolveEmpi  │  ───▶   │ domain adapter parse/     │  ───▶ │ (a) FHIR repository  │
  │ bundle │        │ (+ PIX/PDQ   │         │ validate/normalize        │       │     (HAPI R4)        │
  │ per    │        │  external    │         │ + terminology semantic    │       │ (b) knowledge graph  │
  │ source │        │  option)     │         │   gate (quarantine)       │       │     (projected)      │
  └────────┘        └──────────────┘         └───────────────────────────┘       └──────────────────────┘
                          │                              │                                  │
                    one person → one            ungoverned code →                 every resource in
                    member; cross-source        quarantined, never                exactly one census
                    duplicate consolidates;     silently dropped                  bucket (conservation)
                    two people w/ reused
                    MRN never merge
```

Stage by stage:

1. **Source.** One FHIR R4 `transaction` bundle per patient (`fhir/seed/patients/<slug>.bundle.json`). Each
   entry carries a `urn:uuid` `fullUrl` + `request.method = POST` so intra-bundle references resolve on load.
2. **EMPI / identity.** The bundle's `Patient` is resolved **once** to an enterprise member id. A global
   identifier (medicaid id) links across sources; a **source-scoped** local id (`{assigningAuthority:
   sourceSystem, value: MRN}`) links only within its own source. A near-match **holds** the whole bundle for
   review rather than auto-merging. An external MPI can answer this step over **IHE PIX/PDQ** instead (§5).
3. **Semantic mapping + validation.** Each resource is routed to the domain adapter that **owns** it, which
   parses → validates (structural pre-flight) → normalizes to a PHI-minimal record. Codes are checked against
   the governed terminology; an ungoverned code is **quarantined**, never silently accepted.
4. **Landing (a) — FHIR repository.** The transaction bundle is POSTed to a FHIR R4 server (the local HAPI
   backbone, or any R4 endpoint). This is the "simulator or directly to the FHIR repository" path.
5. **Landing (b) — knowledge graph.** The normalized records are written to a shared outbox and drained by the
   projector into the member's whole-person subgraph (conditions, meds, labs, **SDOH SocialNeed**, **BH
   observation signal**, care team), consent-scoped (42 CFR Part 2 restricted content is hidden without a grant).
6. **Reconciliation.** Every resource lands in exactly one census bucket — **admitted**, **quarantined**, or
   **non-projected-by-design** — and the three sum to the bundle's resource count. Nothing vanishes.

---

## 2. Prerequisites

```bash
npm install                                   # once
python3 -m pip install 'fhir.resources<7'     # for the R4 model validator (pydantic v1 line)
```

The knowledge-graph path runs fully in-process (pg-mem Postgres + a Neo4j fake) and needs **no** running
database. The FHIR-repository path needs a FHIR R4 server; the repo ships a local HAPI backbone via Docker.

---

## 3. Regenerate, validate, and load into the FHIR repository

```bash
# 3a. (optional) regenerate the bundles + refresh the governed terminology delta
node tools/seed/gen-patient-bundles.mjs
node tools/seed/expand-terminology.mjs          # adds the SDOH Z-codes, LOINC panels, RxNorm ingredients

# 3b. validate: FHIR R4 models + intra-bundle reference integrity
python3 tools/seed/validate-bundles.py fhir/seed/patients
#   expect: 5 bundles · 0 issues · every urn:uuid reference resolves

# 3c. bring up the FHIR repository and load every patient as a transaction
npm run backbone:up
FHIR_BASE=http://localhost:8090/fhir node tools/seed/load-all-patients.mjs
#   POSTs each bundle as a FHIR `transaction`; prints per-bundle HTTP status + created-resource count
```

`load-all-patients.mjs` reads `fhir/seed/patients/manifest.json` and loads each bundle in turn. Point
`FHIR_BASE` at any R4 endpoint to load into a different repository; set `BEARER=<token>` if the endpoint
requires auth. Because each bundle is a `transaction`, the server assigns real ids and resolves the
`urn:uuid` references atomically — a partial load never leaves dangling references.

---

## 4. Populate the knowledge graph (and prove duplicate-source handling)

The knowledge-graph population runs through the **fan-out ingest driver** `ingestBundle`
(`src/lib/runtime/ingestBundle.ts`) — the same wiring a production feed trigger uses. It routes each bundle
entry to its owning adapter, runs every group through the real five-stage pipeline into a shared outbox, then
drains the outbox to the projected graph.

The end-to-end population **and** the duplicate-source demonstration are exercised, with assertions, by the
adversarial record-load suite on **both** graph backends:

```bash
npx vitest run tests/wpc/wpcRecordLoad.test.ts
```

What each section of that suite proves — read it as the executable runbook for landing (b):

| Section | What it demonstrates |
|--------|----------------------|
| 1 | Every coded clinical / med / **SDOH** / **BH** record ADMITS; Alex Kirby's uncoded resources QUARANTINE (the honest exception), never silently vanish. |
| 2 | Domain routing: SDOH screenings project as **SdohScreening / SocialNeed** (not labs); BH surveys project as **BehavioralHealthObservation** (a signal, never a Condition); labs land in labs-vitals. |
| 3 | Holistic context is really populated from the graph — clinical profile, **barriers reach the aggregator** (a positive transport screen shows `identified`), behavioral signal, care team. |
| **4** | **EMPI: one bundle → one member; the same person from a DIFFERENT source (matching global medicaid id) CONSOLIDATES; two DIFFERENT people with a reused MRN across sources do NOT merge; a near-match HOLDS.** |
| 5 | 42 CFR Part 2: Robert's SUD condition is RESTRICTED under no consent and DISCLOSED under a covering scope — both backends agree. |
| 6 | The non-projected census (Coverage / Encounter / CarePlan / …) is accounted for by design; care-gap Observations are counted distinctly and **no clinical Observation is silently unrouted**. |

### The production call

A production feed populates the graph with one call per bundle, passing the **source system** — the label that
scopes identity:

```ts
import { ingestBundle } from '@/lib/runtime/ingestBundle';

const result = await ingestBundle(
  bundle,                                   // the parsed FHIR bundle
  { sourceSystem: 'ehr-dorothy-simmons' },  // ← different per source; namespaces MRNs
  { outbox, graph, checkpoint, xref },      // shared graph + MPI xref; per-session outbox + checkpoint
);
// result.memberId          → the anchored member (or '' when held)
// result.held / heldReason → true on a possible-match band (whole bundle held, nothing projected)
// result.admittedByDomain  → loaded count per WpcDomain
// result.quarantined       → structural + semantic + identity holds (PHI-safe)
// result.nonProjected      → by-design census, incl. 'Observation:care-gap' vs 'Observation:unrouted'
```

### The duplicate-source scenario, in words

The safety property demonstrated in section 4 is the answer to "duplicate records coming in from different
sources":

- **Same person, two sources.** Two bundles carrying the **same global medicaid id** but arriving under
  different `sourceSystem` labels resolve to the **same** member — the clinical picture consolidates.
- **Different people, reused local id.** Two bundles whose patients happen to share an **MRN** but come from
  different sources do **not** merge: an MRN is source-local, so `localId` matches only when the assigning
  authority *and* the value are equal. A reused MRN across sources is two different people, kept apart.
- **Ambiguous near-match.** A demographics-only near-match (same name + DOB, no strong identifier) does not
  auto-merge; it lands in the possible-match band and the **whole bundle is held** for human review. Comingling
  is treated as worse than holding — the deliberate Option-B safety trade recorded in the coalition log.

---

## 5. External EMPI over IHE PIX/PDQ (optional)

By default the EMPI runs in-process against the platform's own identity source. To resolve identity against an
**external** Master Patient Index using **IHE PIX/PDQ** (Patient Identifier Cross-referencing / Patient
Demographics Query), configure the external seam (`src/lib/identity/external/*`):

- `setProductionPixPdqConfig(...)` supplies the endpoint + transport (HL7 v2 `QBP^Q23`/`Q22`, or FHIR PIXm).
- `assigningAuthorityToScope(...)` maps the responding authority to the source scope used above.
- The seam is **gated**: it activates only under `dataMode = production` with the `external-pixpdq` capability
  **and** a configured transport. Unconfigured, it **fails closed** (never mints a blind identity, never
  reaches the network in tests). This keeps the demo/off-line path hermetic while allowing a real MPI in
  production without touching the ingestion adapters.

---

## 6. Verify the load

```bash
npx tsc --noEmit                              # types clean
npx vitest run tests/wpc/wpcRecordLoad.test.ts \
              tests/pipeline/sdohClassifierR3.test.ts \
              tests/pipeline/conditionOwnershipR1.test.ts \
              tests/pipeline/domainRecordCount.test.ts
#   record load (both backends) · SDOH classifier · Part 2 ownership · 20/20 domain-count tripwire
bash scripts/ci-gates.sh push                 # the authoritative commit gate
```

The `domainRecordCount` invariant (`MAPPING_SPECS.length === 20`) is the tripwire that keeps the SDOH and BH
routing from silently introducing a new mapping spec or domain: the new observation adapters **reuse** the
existing `sdohSpec` (`sdoh.` prefix) and `behavioralHealthSpec` (`behavioral-health.` prefix), so the count
stays at 20. If that test fails, a change added a spec that must instead extend an existing one.

---

## 7. What is *not* projected — by design, not by accident

Not every FHIR resource becomes a graph node. Coverage, Encounter, CarePlan, Organization, Practitioner, Flag,
RiskAssessment, Consent, Patient, and TCOC **care-gap** Observations are recorded in the non-projected census
rather than projected. This is deliberate: they are either identity/administrative context or a separate
analytic overlay. The driver separates an **intended** non-projection (`Observation:care-gap`) from an
**unexpected** one (`Observation:unrouted`), and section 6 of the suite asserts the unrouted bucket is **zero**
for the seed bundles — so a real clinical Observation that failed to route would surface loudly instead of
disappearing into a "by design" count.

---

## 8. Troubleshooting

| Symptom | Cause | Action |
|--------|-------|--------|
| `load-all-patients.mjs` prints non-2xx | FHIR endpoint down or auth required | `npm run backbone:up`; set `BEARER`; check `FHIR_BASE`. |
| A bundle is HELD (`result.held`) | identity landed in the possible-match band | Expected for an ambiguous demographics-only match; resolve the member manually, then re-ingest. |
| A record is quarantined with `unmapped-*-code` | code not in the governed terminology | Add the code to `terminology-seed.json` via `tools/seed/expand-terminology.mjs` under the right family, then re-run. |
| `Observation:unrouted > 0` | an Observation matched no category owner | Inspect its `category`; add the owning category to the driver's routing or fix the source category. |
| `domainRecordCount` fails | a change added a mapping spec/domain | Reuse an existing spec by event-type prefix instead of adding one. |
| PIX/PDQ resolver returns nothing | external seam unconfigured | Expected fail-closed behavior off-line; configure `setProductionPixPdqConfig` in production only. |
