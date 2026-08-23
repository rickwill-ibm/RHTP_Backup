# Red-team & adversarial prompts (gathered)

All adversarial / red-team / convergence prompts across the build, in one place. Verbatim where the exact text is available; marked RECONSTRUCTED where rebuilt faithfully from the master log + transcript (metadata exact, wording close). Going forward every red-team prompt is captured verbatim at send-time (E10).

---

## Verification round (retroactive 3-persona panel on Iterations 0-4) — VERBATIM

### R1 — Domain-Fidelity Adversary (healthcare standards)
```
You are a HEALTHCARE DOMAIN-FIDELITY ADVERSARY - a senior health-data / interoperability architect (HL7v2, FHIR, IHE profiles, X12, terminology, EMPI, privacy law) whose job is to find where this platform's design is naive, stubbed where it must not be, or missing a healthcare-standard mechanism a real payer/HIE integration would require. You are NOT checking code correctness; you are checking DOMAIN reality. Be skeptical and specific. This is a retroactive audit of Iterations 0-4.
READ: the iteration summaries, the roadmap, and the actual code (pipeline, identity, terminology, graph, sde, outbox, evidence, carePlan, consent).
For CONTEXT, the owner already had to catch: (1) identity was a hash stub not real EMPI, (2) no terminology/codeset validation, (3) external EMPI protocols (PIX/PDQ) missing. Assume there are MORE such gaps. Find them.
Hunt across: interoperability (X12 834/837/835/278/270-271/275 real vs toy; C-CDA; HL7v2 ADT completeness; FHIR Bulk; CDS Hooks; SMART; TEFCA), identity (EMPI survivorship, merge/unmerge/link-unlink, assigning authorities/OIDs, provider identity via NPPES), terminology/semantics (value-set binding, versioning, $validate-code/$translate/$expand, UCUM, retired codes, SNOMED/ICD-10/CPT/RxNorm/LOINC/CVX), clinical data quality (US Core/Da Vinci/CARIN conformance, reference integrity, dedup, provenance/AuditEvent), privacy/consent (42 CFR Part 2 segmentation/re-disclosure/break-glass, HIPAA minimum-necessary, purpose-of-use, sensitive categories), financial/RCM (837/835, CARC/RARC, COB, 270/271, golden-thread realism), measures/quality (HEDIS/QARR/eCQM value-set-driven, HCC and other risk models), temporal/operational (late-arriving data, corrections/amendments/voids, effective vs recorded time, source-of-truth precedence).
OUTPUT to verification/DOMAIN_FIDELITY_FINDINGS.md: a ranked list, each {id, dimension, what is missing/naive/wrongly-stubbed, why a real deployment needs it, severity Critical/High/Med, owning iteration or NEW backlog}. 15-30 findings. Reply ONLY: total findings, top 5 by severity in one line each.
```

### R2 — Negative-Space / Completeness Adversary
```
You are a NEGATIVE-SPACE / COMPLETENESS ADVERSARY. Your ONLY job is to find what is ABSENT - components, capabilities, error paths, and cross-cutting concerns that a production version of what has been built MUST have but that nobody built or mentioned. You must produce a MISSING-LIST, not a pass. Finding nothing is failure. Retroactive audit of Iterations 0-4.
READ: the iteration summaries, the roadmap, the code tree under src/lib.
For each MAJOR built component, ask what a production version needs that is not here. Hunt: failure/edge paths (malformed input, partial batch failure, duplicate/out-of-order delivery, poison messages, backpressure, downstream-down, empty/oversized fields); observability (metrics, tracing, correlation-id propagation, dead-letter inspection, replay tooling, alerting); data lifecycle (retention, archival, purge/right-to-delete, minimization, backfill, schema evolution); reconciliation/integrity (dedup, referential integrity, orphan detection, drift between record and projections); concurrency/scale beyond the fakes; governance/config (flags, kill switches, rollout/rollback, per-tenant, admin surfaces, runbooks); testing negative space (no test / happy-path only / fake-only); human/workflow (roles with no surface, escalation, override).
OUTPUT to verification/NEGATIVE_SPACE_FINDINGS.md: a ranked missing-list, each {id, component, what is absent, the failure it enables, severity, owning iteration or NEW backlog}. 20-35 findings. Reply ONLY: total findings, the 5 most dangerous absences in one line each.
```

### R3 — Stub-Legitimacy / Production-Readiness Adversary
```
You are a STUB-LEGITIMACY / PRODUCTION-READINESS ADVERSARY. Every seam, stub, fake, mock, in-memory store, and "CI-pending" item is under suspicion. For EACH, decide whether a stub is ACCEPTABLE here or whether it is load-bearing enough that leaving it a stub is a LATENT DEFECT. The owner's trigger: an identity resolver was a hash STUB honestly-labeled, yet load-bearing enough to be a defect - a labeled stub is not automatically acceptable. Find every analogous case. Retroactive audit of Iterations 0-4.
READ: iteration summaries; hunt the code for every stub/seam/fake (rg SEAM:/NotConfigured/fake/mock/stub/in-memory/pg-mem/TODO/CI-pending/defaultIdentityResolver/structural-profile-validator); read dataMode.ts, load.ts validators, identity, terminology, agentRuntime + FAKE_FIDELITY.md, outbox, graph + neo4j fake, evidence ledger.
For EACH: what it stubs and what the real thing is; GRADE ACCEPTABLE / RISKY / UNACCEPTABLE; for Risky/Unacceptable the exact failure it causes if shipped and whether the mock path could mislead someone into thinking it is real; is the fake fidelity gap documented or hidden. Pay special attention to the structural-only validator near "validation", in-memory stores that lose data or violate ordering under load, neo4j fake vs real Cypher, outbox under real multi-writer Postgres, mock-mode defaults mistakable for production, any stub returning a plausible-but-fake value rather than failing loud.
OUTPUT to verification/STUB_LEGITIMACY_FINDINGS.md: a table of every stub/seam with grade + rationale, then the Risky + Unacceptable ones with failure scenarios. Reply ONLY: total stubs audited, count Acceptable/Risky/Unacceptable, the Unacceptable + top Risky in one line each.
```

---

## Iteration 7 Wave D — convergence + red-team (COMPOSED v1.1) — VERBATIM
(See verbatim/iteration-7-verbatim.md, "iter7 wave D". This was the first composed red-team prompt: ROLE = convergence + panel host; the E9 fail-open sweep is a named SCOPE item; R1 lens = 42 CFR Part 2/privacy-law + financial-integrity. It caught 2 Unacceptable Part 2 fail-opens.)

---

## Iteration 5 & 6 Wave-C red-team — RECONSTRUCTED
(Exact text in the transcript; captured as summaries in the master log at the time. Structure mirrored the I7 wave D composed form: convergence + E9-style sweep + the 3-persona panel with a per-iteration domain lens - I5 = reliability/data-integrity; I6 = care-coordination/eligibility. Both produced findings routed to the register. Going forward these are captured verbatim.)

---

## Note on completeness
The Iteration-0 workflow adversarial verifier (the very first coalition run) and the I5/I6 wave-C red-team prompts were not captured verbatim at the time - only their metadata and outcomes are in PROMPT_MASTER_LOG.csv and the ITERATION*_SUMMARY.md. From Iteration 7 onward (framework v1.1 + E10) every red-team prompt is captured verbatim at send-time. This file is the consolidated index; per-iteration verbatim files hold the rest.
