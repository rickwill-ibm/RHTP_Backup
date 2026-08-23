# The Maria use case — 16 steps (RECONSTRUCTED, REPRESENTATIVE)

FRAMING RULE (owner directive, binding): these steps are a REPRESENTATIVE use case — one member's path through the platform, used to verify that capabilities compose end to end. They are NOT the specification. Design GENERAL capabilities (any member, any condition mix, any barrier set, any journey shape); never hardcode this journey, its ordering, its conditions, or its barriers into any engine, pipeline, graph mapping, disposition policy, care plan template, or agent. The trace matrix proves coverage BY this case; the design must support the CLASS of cases it represents. A design element that only works for Maria-shaped journeys is a defect.

STATUS: the original `ACE_UseCase_Dependencies.xlsx` did not survive session compaction. This reconstruction derives from the verified demo narrative (12-scene arc, four acts: Fragmented → Coordinated → Provable → Connected) and the goldenThread stage model. Build the trace matrix against these steps and mark every row RECONSTRUCTED; exact step names reconcile when the owner re-supplies the workbook.

1. Member surfaces across fragmented systems (claims, clinical, social touchpoints disconnected).
2. Identity resolution: sources matched to one anchored member identity (match engine; deterministic + probabilistic).
3. Whole-person record assembly: clinical, coverage, claims, SDOH data land on the anchored record (pipelines → FHIR store).
4. Consent established and scoped (opt-in state, Part 2 segmentation where applicable).
5. Care gaps detected against measures (HEDIS GSD/EED-class) from the assembled record.
6. SDOH screening captured (AHC HRSN-class instrument) → barriers on the record as coded data.
7. Whole-person context related: the knowledge graph relates conditions, gaps, barriers, events; keystone barrier legible.
8. Signals raised from record changes and gaps; Signal Disposition Engine coordinates: act / suppress / delay / bundle into one touchpoint.
9. Intelligent care plan generated from the whole-person context (goals, interventions, barrier remediation), clinician-reviewed.
10. Referral initiated to the right service (clinical specialty or community/social service), network adequacy consulted.
11. Barrier remediation arranged (transportation NEMT-class, or equivalent social intervention) so care can be attended.
12. Prior authorization cleared through the golden thread: necessity evidenced, DTR/PAS flow, gold-card path where earned.
13. Care delivered; encounter and results flow back to the record (labs, ADT); loop-closure evidence captured.
14. Agent coalition executes coordinated follow-up under HITL governance (outreach, referral follow-through, documentation).
15. Outcomes measured: gap closed, measure improved (the demo's A1c beat), attribution and milestone evidence assembled.
16. Financial reconciliation: claim clean through payment; the golden thread ties intent → authorization → delivery → payment; program reporting (QARR-class) produced.

Four-act mapping: Acts I–II ≈ steps 1–8 (Fragmented → Coordinated); Act III ≈ steps 9–13 (Provable); Act IV ≈ steps 14–16 (Connected).
