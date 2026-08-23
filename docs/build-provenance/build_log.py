import csv, os
BASE = os.path.dirname(os.path.abspath(__file__))
# ============================================================================
# PROMPT MASTER LOG - single source of truth for every build-time agent.
# One row per agent invocation, across BOTH phases:
#   Phase P  = Planning coalition (produced the D1-D7 plan, the 70-use-case
#              corpus, the ADRs/contracts). Recon fidelity - these ran before
#              E10 verbatim capture existed; metadata is exact, prompts condensed.
#   Phase B  = Build iterations 0..8A-i. Live fidelity from I1 on; I0/V recon.
# fidelity: "live"=logged as it ran (verbatim file exists from I7+); "recon"=
#   reconstructed faithfully from summaries/wave reports; "pending"=scheduled,
#   not yet executed.
# ============================================================================
COLS = ["seq","iteration","wave","phase","agent_role","agent_label","workstream_domain",
        "prompt_summary","key_inputs","output_summary","gate_result","findings","fidelity","review_note"]

R = []
def add(**k):
    row = {c: k.get(c,"") for c in COLS}
    row["seq"] = len(R)+1
    # optional explicit lineage (used by the planning phase, which has bespoke deps)
    row["depends_on"] = k.get("depends_on","")
    row["builds_on"]  = k.get("builds_on","")
    row["ts_override"] = k.get("ts_override","")  # real send-time for live rows; blank -> synthetic monotonic ts
    R.append(row)

# ===========================================================================
# PHASE P - PLANNING COALITION (genesis; produced the plan package + corpus)
# Dependencies are set EXPLICITLY here because planning is a DAG, not the
# probe->build->converge cadence of the build iterations.
# ===========================================================================
add(iteration="P",wave="0",phase="probe",agent_role="evidence",agent_label="P1-repo-gate-evidence",workstream_domain="planning/evidence",
    prompt_summary="Phase-0 probe of the sibling repos; assemble the evidence pack + use-case steps that ground the plan.",
    key_inputs="sibling repos; owner intent",output_summary="phase0_repo_gate.md, evidence.md, use_case_steps.md",gate_result="grounded",fidelity="recon",
    depends_on="",builds_on="genesis: grounds the whole plan in real repo evidence",
    review_note="P-phase agents were not captured verbatim (pre-E10); metadata exact, prompt condensed. This roster row makes them visible in the log.")
add(iteration="P",wave="spine",phase="plan",agent_role="spine",agent_label="P2-spine",workstream_domain="planning/architecture",
    prompt_summary="Author ADR-001..006, contracts C1..C10, the golden path, the 16-step trace matrix, and a per-specialist context manifest.",
    key_inputs="P1 evidence; owner constraints",output_summary="load-model, adrs, contracts, golden-path, trace-matrix, manifests",gate_result="authored",fidelity="recon",
    depends_on="1",builds_on="the architectural spine every specialist inherits",
    review_note="The spine is the shared context the 5 specialists branch from - the planning analogue of an iteration probe.")
add(iteration="P",wave="spec",phase="plan",agent_role="specialist",agent_label="P3-graph-context-G1",workstream_domain="planning/graph",
    prompt_summary="Design the graph projector, mapping specs, and lens queries (G1).",
    key_inputs="P2 spine",output_summary="g1-graph.md",gate_result="authored",fidelity="recon",depends_on="2",builds_on="feeds the iter2 graph build",
    review_note="One of 5 parallel design specialists on disjoint concerns.")
add(iteration="P",wave="spec",phase="plan",agent_role="specialist",agent_label="P4-pipeline-fhir-G3X2",workstream_domain="planning/pipeline",
    prompt_summary="Design the 5-stage pipeline, adapters, outbox, and validation (G3/X2).",
    key_inputs="P2 spine",output_summary="g3-pipelines.md",gate_result="authored",fidelity="recon",depends_on="2",builds_on="feeds the iter1 pipeline+outbox build",
    review_note="Parallel design specialist.")
add(iteration="P",wave="spec",phase="plan",agent_role="specialist",agent_label="P5-agentic-G2G4",workstream_domain="planning/agentic",
    prompt_summary="Design the SDE and the agent runtime (G2/G4).",
    key_inputs="P2 spine",output_summary="g2g4-agentic.md",gate_result="authored",fidelity="recon",depends_on="2",builds_on="feeds the iter2 SDE + iter3 runtime builds",
    review_note="Parallel design specialist.")
add(iteration="P",wave="spec",phase="plan",agent_role="specialist",agent_label="P6-careplan-G5",workstream_domain="planning/care-plan",
    prompt_summary="Design care-plan hardening + the DP-4 acceptance oracle (G5).",
    key_inputs="P2 spine",output_summary="g5-careplan.md",gate_result="authored",fidelity="recon",depends_on="2",builds_on="feeds the iter0 care-plan hardening",
    review_note="Parallel design specialist.")
add(iteration="P",wave="spec",phase="plan",agent_role="specialist",agent_label="P7-documentation-X4",workstream_domain="planning/docs",
    prompt_summary="Design the D7 doc pack + the honesty ledger (X4).",
    key_inputs="P2 spine",output_summary="x4-documentation.md",gate_result="authored",fidelity="recon",depends_on="2",builds_on="feeds the D7 doc pack",
    review_note="Parallel design specialist.")
add(iteration="P",wave="use-case",phase="plan",agent_role="use-case-expert",agent_label="P8-TCOC-70-use-case-expert",workstream_domain="planning/verification-corpus",
    prompt_summary="ACT AS TCOC SME PANEL (10 specialty lenses): devise the 70-use-case verification corpus that the platform must satisfy - families A-O, each with actor, trigger, expected orchestration, and TCOC lever. THIS IS THE 70-USE-CASE AGENT.",
    key_inputs="P1 evidence; P2 golden path; 10 SME lenses",output_summary="use_case_corpus.md - 70 cases, families A-O",gate_result="authored",fidelity="recon",
    depends_on="2",builds_on="the corpus later becomes executable scenario tests at I0 wave 3B",
    review_note="<< The 70-use-case agent you asked about. Its OUTPUT (use_case_corpus.md) is committed; its prompt lives in the transcript. Downstream: seq for I0/3B corpus-scenario turns it into runnable tests.")
add(iteration="P",wave="adversarial",phase="red-team",agent_role="red-team",agent_label="P9-adversarial-rubric-panel",workstream_domain="planning/review",
    prompt_summary="Adversarially score all 5 design specialists against a rubric; surface cross-cutting findings the specialists missed on their own.",
    key_inputs="P3-P7 specialist designs; P8 corpus",output_summary="adversarial-verdict.md - 3 cross-cutting findings (C1 orphan, ADR-006 atomicity, compliance orphans)",gate_result="findings",fidelity="recon",
    depends_on="3,4,5,6,7,8",builds_on="the FIRST adversarial pass - the ancestor of the R1-R4 red-team personas",
    review_note="The planning-phase red team. Its 3 findings triggered a DYNAMIC RE-PROMPT of the spine (next row).")
add(iteration="P",wave="amend",phase="fix",agent_role="spine",agent_label="P10-spine-amendment-REPROMPT",workstream_domain="planning/architecture",
    prompt_summary="RECONVENE the spine agent WITH CONTEXT INTACT (SendMessage): resolve the 3 adversarial findings - C1 orphan, ADR-006 atomicity, compliance orphans.",
    key_inputs="P9 findings; P2 spine (same agent, context retained)",output_summary="amendment-001.md",gate_result="resolved",fidelity="recon",
    depends_on="9",builds_on="<< DYNAMIC RE-PROMPT LINEAGE: P2 spine -> P9 adversarial findings -> P10 same-agent re-prompt -> amendment. The clearest multi-turn lineage in the whole build.",
    review_note="THIS is the lineage you asked about: an agent re-prompted with updated context (its own prior output + the red-team findings), not a one-shot. Chain: seq2 -> seq10.")
add(iteration="P",wave="data",phase="plan",agent_role="data",agent_label="P11-data-extractor-D1",workstream_domain="planning/datasets",
    prompt_summary="Build the D1 workbook datasets (5 sheets incl. the 70-case trace matrix) from the resolved plan.",
    key_inputs="P8 corpus; P10 amended spine",output_summary="sheet1-5.json -> D1_Gap_Matrix.xlsx",gate_result="authored",fidelity="recon",depends_on="8,10",builds_on="materializes the 70-case corpus as the D1 trace sheet",
    review_note="")
add(iteration="P",wave="data",phase="plan",agent_role="spec-author",agent_label="P12-spec-author-D4D5",workstream_domain="planning/specs",
    prompt_summary="Author the D4 load-test spec + the D5 deployment-config spec.",
    key_inputs="P10 amended spine",output_summary="D4_load_test_spec.md, D5_deployment_config_spec.md",gate_result="authored",fidelity="recon",depends_on="10",builds_on="the specs iterations 9-10 will execute",
    review_note="")
add(iteration="P",wave="final",phase="fix",agent_role="orchestrator",agent_label="P13-finalizer",workstream_domain="planning/assembly",
    prompt_summary="Assemble + QA the D1-D7 plan package; commit. Hand the plan to the build phase.",
    key_inputs="all P outputs",output_summary="docs/production-plan/D1-D7 committed",gate_result="committed",fidelity="recon",depends_on="10,11,12",builds_on="the plan package that the build phase (I0) inherits",
    review_note="Bridge from planning to build: I0's probe depends on this row.")

# ===========================================================================
# PHASE B - BUILD ITERATIONS
# ===========================================================================
# ---------- Iteration 0 - Hardening (cycles 1-3) ----------
add(iteration="0",wave="probe",phase="probe",agent_role="probe",agent_label="cycle1-probe",workstream_domain="harness",
    prompt_summary="Harness health probe: echo, write, edit a file; confirm tool access before fan-out.",
    key_inputs="baseline tree",output_summary="tools working",gate_result="clean->fanout",fidelity="live",
    review_note="E6 probe standard; cheap insurance before parallel build.")
add(iteration="0",wave="1A",phase="build",agent_role="specialist",agent_label="mechanical-sweeper",workstream_domain="persona/determinism/logging",
    prompt_summary="Four sweeps: purge persona-in-logic, inject clock/rng in engines, structured PHI-safe logger over console.log, silent-catch audit.",
    key_inputs="conventions v2; evidence.md",output_summary="2 logic fixes; 31 files determinism seam; logger; 0 console.log",gate_result="tsc0; ratchet ok",fidelity="recon",
    review_note="Grep-driven cleanup framed as defect classes worked; classify data-vs-logic to avoid touching legit demo data.")
add(iteration="0",wave="1B",phase="build",agent_role="specialist",agent_label="route-test-author",workstream_domain="bff-routes",
    prompt_summary="TESTING AGENT: cover all 21 API routes: 401/403/400/422/200 + PHI-safe body; skip infra-bound with reason.",
    key_inputs="route handlers; _helpers pattern",output_summary="107 route tests, 9 named skips",gate_result="green",fidelity="recon",
    review_note="<< Testing agent (route). Test-file-only (no src edits) kept it disjoint from the sweeper.")
add(iteration="0",wave="1-conv",phase="convergence",agent_role="convergence",agent_label="cycle1-convergence-x2",workstream_domain="cross-cutting",
    prompt_summary="Re-sweep determinism/console/persona; review mode-registry; converge to DRY (2 passes).",
    key_inputs="cycle1 reports",output_summary="determinism stragglers + demoDefaults; DRY on 2nd pass",gate_result="DRY",fidelity="recon",
    review_note="Two passes needed; convergence found what build waves missed.")
add(iteration="0",wave="1-2",phase="build",agent_role="specialist",agent_label="mode-registry",workstream_domain="config/dataMode",
    prompt_summary="Consolidate scattered mock toggles into one config-driven dataMode registry (mock|seeded|production per seam).",
    key_inputs="runtimeConfig; consent seam",output_summary="dataMode.ts + session override; consent+fhir wired",gate_result="green",fidelity="recon",
    review_note="This became the mock->production switch mechanism the owner later relied on.")
add(iteration="0",wave="2A",phase="build",agent_role="specialist",agent_label="property-test-author",workstream_domain="engines",
    prompt_summary="TESTING AGENT: property tests for match/policy/adequacy/goldenThread/consent engines; ~3000 generated cases via seeded PRNG.",
    key_inputs="engine source",output_summary="found REAL match bug: blank/whitespace fields -> false matches",gate_result="green (2 it.fails)",fidelity="recon",
    review_note="<< Testing agent (property). Earned its place immediately; caught a patient-safety defect.")
add(iteration="0",wave="2B",phase="build",agent_role="specialist",agent_label="careplan-hardening",workstream_domain="care-plan",
    prompt_summary="Extract 1262-line frozen generator into carePlan/ modules; DP-4 acceptance oracle (fixtures+invariants).",
    key_inputs="carePlanGenerator*; g5 design",output_summary="14 modules; frozen files 1269->66 lines; 47 tests; 9 findings",gate_result="green",fidelity="recon",
    review_note="Ratchet moved forward: legacy files shrank via extraction, not edits.")
add(iteration="0",wave="2-conv",phase="convergence",agent_role="convergence",agent_label="cycle2-convergence",workstream_domain="identity",
    prompt_summary="Fix the blank-field match bug family across deterministic + probabilistic tiers; flip it.fails.",
    key_inputs="cycle2a findings",output_summary="guard non-empty both sides; regression tests",gate_result="DRY",fidelity="recon",
    review_note="Fixed a real correctness bug found by property tests, not weakened the test.")
add(iteration="0",wave="3A",phase="red-team",agent_role="red-team",agent_label="security-lens",workstream_domain="api-security",
    prompt_summary="Attack all routes: authz bypass, consent scoping, PHI in errors, IDOR, input validation, AI-guardrail.",
    key_inputs="api routes; authz",output_summary="2 HIGH (consent-read bypass, IDOR); fixed match consent gate",gate_result="green",fidelity="recon",
    review_note="First real adversarial security pass; found the IDOR class later fully closed in I3.")
add(iteration="0",wave="3B",phase="build",agent_role="specialist",agent_label="corpus-scenario",workstream_domain="verification",
    prompt_summary="TESTING AGENT: turn the 70-case corpus (P8 output) into executable scenario tests where code exists; register the rest as pending.",
    key_inputs="use_case_corpus.md (P8)",output_summary="15 runnable, 55 pending, all 70 accounted",gate_result="green",fidelity="recon",
    depends_on="",builds_on="consumes P8's 70-use-case corpus - the planning->build link for the use cases",
    review_note="<< Testing agent (corpus). This is where P8's 70 use cases become a living regression asset.")
add(iteration="0",wave="3C",phase="build",agent_role="specialist",agent_label="e2e-a11y-specs",workstream_domain="e2e",
    prompt_summary="TESTING AGENT: author C5 demo walkthrough + dual-mode + axe specs (CI-runnable; live run sandbox-blocked).",
    key_inputs="playwright config; routes",output_summary="20 specs; found + fixed a Next illegal-export bug",gate_result="tsc0",fidelity="recon",
    review_note="<< Testing agent (e2e/a11y). Honest CI-pending labeling; build compiled but dev server would not boot in sandbox.")

# ---------- Iteration 1 - Foundation ----------
add(iteration="1",wave="probe",phase="probe",agent_role="probe",agent_label="iter1-probe",workstream_domain="harness/pg-mem",
    prompt_summary="Probe pg-mem + confirm dataMode/clock/log seams exist.",key_inputs="baseline",output_summary="pg-mem ok",gate_result="clean",fidelity="live",
    review_note="Added infra probe (pg-mem) to the harness check since this iteration needs SQL.")
add(iteration="1",wave="A",phase="build",agent_role="specialist",agent_label="pipeline+outbox",workstream_domain="pipeline/outbox",
    prompt_summary="Five-stage pipeline + 3 adapters (834/ADT/CBO); lane-agnostic transforms; ADR-006 outbox-intent propagation.",
    key_inputs="plan 4A; C2/C10; ADR-006",output_summary="17 modules; outbox intent->confirm->event; 36 tests",gate_result="green",fidelity="live",
    review_note="Adapters generic over records; identity via injected resolver seam (later found to be a stub).")
add(iteration="1",wave="B",phase="build",agent_role="specialist",agent_label="persistence+adapters",workstream_domain="evidence/dataSources",
    prompt_summary="O-1 append-only pg evidence ledger behind seam; O-2 gold-card/denial/provider loaders.",
    key_inputs="ADR-005; evidence interface",output_summary="ledger + immutability trigger; 3 adapters; 31 tests",gate_result="green",fidelity="live",
    review_note="Reused the existing EvidenceStore interface verbatim; no caller changed.")
add(iteration="1",wave="C",phase="convergence",agent_role="convergence",agent_label="security+convergence",workstream_domain="security/outbox",
    prompt_summary="Fix 2 HIGH IDOR/consent; adversarial review of A+B; DRY.",
    key_inputs="cycle3 security report",output_summary="consent-read fixed; flagged multi-writer outbox gaps for I2",gate_result="DRY",fidelity="live",
    review_note="Documented the real-Postgres outbox concurrency gap rather than hiding it (L1 in action).")

# ---------- Iteration 2 - Graph + SDE ----------
add(iteration="2",wave="A",phase="build",agent_role="specialist",agent_label="graph-projector+backends",workstream_domain="graph",
    prompt_summary="Harden outbox (UNIQUE+CAS); store-agnostic projector; Postgres + Neo4j adapters on one interface; shared contract test.",
    key_inputs="ADR-001 v12.3; C10; iter1 outbox",output_summary="projector + both backends; parity proven; 30 tests",gate_result="green",fidelity="live",
    review_note="Step-0 outbox hardening carried the I1 concurrency gap forward (L4 lesson: should have been in I1 DoD).")
add(iteration="2",wave="B1",phase="build",agent_role="specialist",agent_label="lens-suite+replay",workstream_domain="graph/lens",
    prompt_summary="5 lens queries passing on BOTH backends; Part 2 restriction; rebuild-from-replay; merge/unmerge rekey.",
    key_inputs="wave A graph; DP-1",output_summary="dual-backend parity on all 5 lenses + replay + merge",gate_result="green",fidelity="live",
    review_note="Co-equal backend guarantee proven in code, not asserted.")
add(iteration="2",wave="B2",phase="build",agent_role="specialist",agent_label="sde-disposition",workstream_domain="sde",
    prompt_summary="Disposition service: signal taxonomy, act/suppress/delay/bundle, policy-as-data, consent-gated, explainable.",
    key_inputs="DP-2; demo SDE shape",output_summary="5/3/1 shape EMERGES from policy; 26 tests; flagged seam-id collision",gate_result="green",fidelity="live",
    review_note="Agent flagged the sde seam-id collision itself (good), fixed in convergence.")
add(iteration="2",wave="C",phase="convergence",agent_role="convergence",agent_label="iter2-convergence",workstream_domain="graph/sde",
    prompt_summary="Fix seam-id collision; verify projector purity (no SQL/Cypher in core); Part 2 both backends; DRY.",
    key_inputs="B1/B2 reports",output_summary="signalDisposition seam; purity confirmed; DRY",gate_result="DRY",fidelity="live",
    review_note="Seam-id collision is the L3 lesson origin.")

# ---------- Iteration 3 - Agent runtime + IDOR ----------
add(iteration="3",wave="probe",phase="probe",agent_role="probe",agent_label="iter3-probe",workstream_domain="harness",
    prompt_summary="Probe; locate the work-queue store to reuse (no second inbox).",key_inputs="baseline",output_summary="workQueueView found",gate_result="clean",fidelity="live",review_note="Probe located the HITL surface to reuse.")
add(iteration="3",wave="A",phase="build",agent_role="specialist",agent_label="agent-runtime+registry",workstream_domain="agentRuntime/agents",
    prompt_summary="Journey-lane WorkflowEngine + in-memory fake + Temporal seam; manifest registry (data); escalation-as-data; HITL proposeAndWait via work queue.",
    key_inputs="g2g4 design; conventions s10",output_summary="runtime + manifests; FAKE_FIDELITY.md; 26 tests",gate_result="green",fidelity="live",
    review_note="L1 fake-fidelity ledger shipped as a required deliverable for the workflow fake.")
add(iteration="3",wave="A2",phase="build",agent_role="specialist",agent_label="idor-role-model",workstream_domain="authz/principal",
    prompt_summary="Session-principal role model; close evidence + financial-clearance IDOR; remove hardcoded pa-reviewer.",
    key_inputs="cycle3 security; match-route pattern",output_summary="principal model; 2 IDOR it.fails flipped; 24 tests",gate_result="green",fidelity="live",
    review_note="Ran parallel to A on a disjoint tree (authz vs runtime).")
add(iteration="3",wave="B",phase="build",agent_role="specialist",agent_label="three-agents",workstream_domain="agents",
    prompt_summary="Outreach/referral/PA-doc agent behaviors on the runtime; HITL; PA-doc never sets authoritative state.",
    key_inputs="wave A runtime; sde output",output_summary="decide->act->HITL->execute loop reproduced; PA guardrail asserted; 18 tests",gate_result="green",fidelity="live",
    review_note="The AI-guardrail (agent never sets PA state) is tested, not just claimed.")
add(iteration="3",wave="C",phase="convergence",agent_role="convergence",agent_label="iter3-convergence",workstream_domain="agents",
    prompt_summary="Cross-agent namespace integrity; confirm 1 expected-fail is legit; determinism; HITL genuinely suspends.",
    key_inputs="A/A2/B reports",output_summary="found F-C1 namespace drift across 3 surfaces; pinned by test; DRY",gate_result="DRY",fidelity="live",
    review_note="L3 refinement origin: pre-allocate AND pin names across all surfaces.")

# ---------- Iteration 4 - Template + clinical domains + stubs ----------
add(iteration="4",wave="A",phase="build",agent_role="specialist",agent_label="template+medications",workstream_domain="pipeline/medications",
    prompt_summary="Author the L7 domain template + checklist; build medications (prescribed+dispensed) through it.",
    key_inputs="existing adapters; medication FHIR",output_summary="_TEMPLATE.md + medications T1; pinning test; 14 tests",gate_result="green",fidelity="live",
    review_note="Templatize-before-mass-produce (L7); medications stress-tested the two-node shape.")
add(iteration="4",wave="EMPI",phase="build",agent_role="specialist",agent_label="empi-resolver",workstream_domain="identity",
    prompt_summary="OWNER LITMUS: wire the REAL match engine as identity resolver; possible-match 60-90 HELD not auto-linked; demographics-carrying seam.",
    key_inputs="matchEngine; owner directive",output_summary="EMPI resolver; HELD path; 14 tests",gate_result="green",fidelity="live",
    review_note="Owner caught the hash-stub. Prompt folded the fix in-iteration rather than deferring.")
add(iteration="4",wave="B",phase="build",agent_role="specialist",agent_label="labs+allergies",workstream_domain="pipeline/labs/allergies",
    prompt_summary="Build labs-vitals + allergies through the template.",key_inputs="_TEMPLATE.md",output_summary="2 domains T1; 26 tests",gate_result="green",fidelity="live",review_note="First proof the template makes domains a fill-in.")
add(iteration="4",wave="EXT",phase="build",agent_role="specialist",agent_label="external-seams",workstream_domain="identity/terminology",
    prompt_summary="OWNER DIRECTIVE: stub external EMPI (PIX/PDQ, PIXm/PDQm) + terminology/semantic-validation seam (RxNorm/LOINC/HCC) fail-closed.",
    key_inputs="owner directive; NotConfigured pattern",output_summary="external identity + terminology seams; stage-4 semantic gate; 28 tests",gate_result="green",fidelity="live",
    review_note="Stubs now, real later; honest fail-closed stubs, roadmap I8A created. << external EMPI stubs here become REAL at I8A-i wave B.")
add(iteration="4",wave="C",phase="build",agent_role="specialist",agent_label="procedures",workstream_domain="pipeline/procedures",
    prompt_summary="Build procedures through the template.",key_inputs="_TEMPLATE.md",output_summary="procedures T1; 14 tests; record 7/20",gate_result="green",fidelity="live",review_note="")
add(iteration="4",wave="VSM",phase="build",agent_role="specialist",agent_label="value-set-registry",workstream_domain="terminology/registry",
    prompt_summary="OWNER DIRECTIVE: value-set/ontology lifecycle registry across 6 classification families (HCC is one of several).",
    key_inputs="owner directive; terminology seam",output_summary="registry facility; 26 assets/6 families; 16 tests",gate_result="green",fidelity="live",
    review_note="Owner: HCC is only one; behavioral+social families added. Governance-console scoped to I8A.")
add(iteration="4",wave="C-conv",phase="convergence",agent_role="convergence",agent_label="iter4-convergence",workstream_domain="pipeline/identity/terminology",
    prompt_summary="Cross-agent: namespace pin all 4 domains; double gate order; seed covers all demo codes; DRY.",
    key_inputs="6 wave reports",output_summary="1 doc-only finding; DRY; record 7/20",gate_result="DRY",fidelity="live",review_note="Six parallel agents; convergence reconciled cleanly.")

# ---------- Verification round (standing red-team, retroactive on I0-4) ----------
add(iteration="V",wave="panel",phase="red-team",agent_role="red-team",agent_label="domain-fidelity-adversary",workstream_domain="healthcare-standards",
    prompt_summary="[verbatim: verbatim/red-team-and-adversarial-prompts.md R1] Audit I0-4 for naive/stubbed/missing healthcare-standard mechanisms (X12, EMPI survivorship, terminology, Part2, FHIR conformance).",
    key_inputs="summaries + code",output_summary="26 findings (4 Critical incl 834-term, Part2, EMPI survivorship, $validate stub)",gate_result="registered",fidelity="live",
    review_note="R1 persona. Found what conformance review missed; validates L9. Prompt now captured verbatim.")
add(iteration="V",wave="panel",phase="red-team",agent_role="red-team",agent_label="negative-space-adversary",workstream_domain="operability",
    prompt_summary="[verbatim: red-team-and-adversarial-prompts.md R2] Find what is ABSENT that production needs; must produce a missing-list not a pass.",
    key_inputs="summaries + code",output_summary="31 findings (dead-letter drop, right-to-delete, observability, idempotency)",gate_result="registered",fidelity="live",
    review_note="R2 persona. NS-01 (records vanish) drove Iteration 5. Prompt now captured verbatim.")
add(iteration="V",wave="panel",phase="red-team",agent_role="red-team",agent_label="stub-legitimacy-adversary",workstream_domain="stubs",
    prompt_summary="[verbatim: red-team-and-adversarial-prompts.md R3] Grade every seam/stub Acceptable/Risky/Unacceptable; find fail-open/masquerade/dead-wiring.",
    key_inputs="seam code",output_summary="26 graded; 4 Unacceptable (dev-auth fail-open, validator fail-open, EMPI mock-in-prod, evidence dead-wiring)",gate_result="registered",fidelity="live",
    review_note="R3 persona. The 4 Unacceptable were worse than what the owner caught (they mislead). Prompt now captured verbatim.")
add(iteration="V",wave="fix",phase="fix",agent_role="specialist",agent_label="unacceptable-fixes",workstream_domain="seams",
    prompt_summary="Fix the 4 Unacceptable: make each fail CLOSED in production, demo green.",
    key_inputs="stub findings; NotConfigured pattern",output_summary="U1-U4 fixed fail-closed; 22 tests",gate_result="green",fidelity="live",review_note="High-integrity: spotted AND fixed the worst, not just logged.")
add(iteration="V",wave="gate",phase="fix",agent_role="specialist",agent_label="governance-seam-gate",workstream_domain="config/governance",
    prompt_summary="Build mechanical fail-closed gate: seam-disposition manifest + test forcing every seam to declare + prove fail-closed.",
    key_inputs="seam registry",output_summary="17 seams declared; 29 governance tests; new seam with no disposition fails CI",gate_result="green",fidelity="live",
    review_note="E1 enforcement: the durable prevention (gate over prose).")

# ---------- Iteration 5 - Reliability ----------
add(iteration="5",wave="probe",phase="probe",agent_role="probe",agent_label="iter5-probe",workstream_domain="harness",
    prompt_summary="Probe pg-mem; locate quarantine/held-identity producers.",key_inputs="baseline",output_summary="heldIdentity.ts found",gate_result="clean",fidelity="live",review_note="")
add(iteration="5",wave="A",phase="build",agent_role="specialist",agent_label="dead-letter-subsystem",workstream_domain="deadLetter",
    prompt_summary="Durable dead-letter/held-review store (quarantine|held-identity|failed-outbox); wire at call sites so nothing vanishes; ops reviewer surface.",
    key_inputs="NS-01; producers",output_summary="store + ops routes; producers persist; 44 tests; seam declared",gate_result="green",fidelity="live",
    review_note="Closed the Critical operability gap; ops surface distinct from clinical work queue.")
add(iteration="5",wave="B",phase="build",agent_role="specialist",agent_label="idempotency+session-secret",workstream_domain="idempotency/authz",
    prompt_summary="Durable idempotency store (per-consumer CAS); wire SDE+agents; R5 session-secret fail-closed.",
    key_inputs="NS-04; R5",output_summary="idempotency store; SDE+agents dedupe on republish; secret fails closed; 29 tests",gate_result="green",fidelity="live",review_note="")
add(iteration="5",wave="C",phase="red-team",agent_role="convergence+red-team",agent_label="iter5-convergence+panel",workstream_domain="deadLetter/idempotency",
    prompt_summary="[RECONSTRUCTED in red-team-and-adversarial-prompts.md] Converge; then mandatory red-team panel (R1 reliability/data-integrity, R2 negative-space, R3 stub-legitimacy).",
    key_inputs="A/B reports; register",output_summary="found+fixed a re-introduced fail-open drop-path; R1 5/R2 10/R3 3 findings; DRY",gate_result="DRY",fidelity="live",
    findings="R1:5 R2:10 R3:3",
    review_note="Panel caught a re-introduced NS-01 fail-open the build missed. I5 lens=reliability. Prompt reconstructed (pre-E10).")

# ---------- Iteration 6 - Care-team + workflow domains ----------
add(iteration="6",wave="probe",phase="probe",agent_role="probe",agent_label="iter6-probe",workstream_domain="harness",
    prompt_summary="Probe; enumerate current C9 domains; find 834 adapter.",key_inputs="baseline",output_summary="8 domains found (care-team already a graph node)",gate_result="clean",fidelity="live",
    review_note="Probe+scope-enum prevented a duplicate-domain assumption.")
add(iteration="6",wave="A",phase="build",agent_role="specialist",agent_label="careteam+goalstasks",workstream_domain="pipeline/care-team/goals-tasks",
    prompt_summary="Build care-team + goals-tasks through template; EXTEND existing careteam mapping without breaking the I2 lens.",
    key_inputs="_TEMPLATE.md; careteam.ts",output_summary="2 domains T1; lens preserved; 28 tests; namespace split to companion file",gate_result="green",fidelity="live",
    review_note="Shared-file (namespace test) split improvised mid-run; future briefs should pre-declare the partition (L3 refinement).")
add(iteration="6",wave="B",phase="build",agent_role="specialist",agent_label="referrals+immunizations",workstream_domain="pipeline/referrals/immunizations",
    prompt_summary="Build referrals + immunizations through template; keep provider refs RAW + flag deferred-I8A (no invented NPI).",
    key_inputs="_TEMPLATE.md",output_summary="2 domains T1; provider deferred-I8A; 27 tests",gate_result="green",fidelity="live",
    review_note="Keep-unresolved-entity-raw-and-flagged is the durable anti-masquerade clause. << the deferred-I8A provider refs get resolved at I8A-i wave C.")
add(iteration="6",wave="C",phase="red-team",agent_role="convergence+red-team",agent_label="iter6-foldins+panel",workstream_domain="pipeline/deadLetter/834",
    prompt_summary="[RECONSTRUCTED] Fold-ins: idempotency reuse in dead-letter; 834 INS-3 termination fix. Then converge + mandatory red-team panel.",
    key_inputs="register F1+HIGH; wave reports",output_summary="both fold-ins fixed; found+fixed latent 834 fail-open; R1 5/R2 7/R3 3; DRY; record 11/20",gate_result="DRY",fidelity="live",
    findings="R1:5 R2:7 R3:3",
    review_note="Red-team caught a fail-open AGAIN (834 default-to-active). Fail-open is the recurring top class -> candidate mechanical lint E9. I6 lens=care-coordination.")

# ---------- Iteration 7 - Behavioral health + F2 Part 2 + claims/pa + assessments ----------
add(iteration="7",wave="probe",phase="probe",agent_role="probe",agent_label="iter7-probe",workstream_domain="harness",
    prompt_summary="[verbatim: verbatim/iteration-7-verbatim.md] probe; locate Part2 handling + PA state machine.",
    key_inputs="baseline",output_summary="Part2 thin; paMachine found",gate_result="clean",fidelity="live",
    review_note="Probe confirmed Part 2 handling thin (F2).")
add(iteration="7",wave="A",phase="build",agent_role="specialist",agent_label="behavioralHealth+part2",workstream_domain="pipeline/behavioral-health",
    prompt_summary="[verbatim: iteration-7-verbatim.md waveA] BH+SUD domain + real Part2 segmentation (basis, consent-directed, re-disclosure, break-glass).",
    key_inputs="iteration7_context F2 spec",output_summary="BH T1; SUD restricted; break-glass audited; 21 tests",gate_result="green",fidelity="live",
    review_note="HIGH CARE wave; two-factor Part2 basis + over-restriction guard.")
add(iteration="7",wave="B",phase="build",agent_role="specialist",agent_label="claims+paLifecycle",workstream_domain="pipeline/claims/pa-lifecycle",
    prompt_summary="[verbatim: iteration-7-verbatim.md waveB] claims-financial (Claim/ClaimResponse/EOB chain, CARC/RARC) + pa-lifecycle (status lifecycle, non-authoritative).",
    key_inputs="paMachine",output_summary="2 domains T1; PA capture non-authoritative asserted; 34 tests",gate_result="green",fidelity="live",
    review_note="pa-lifecycle references but never drives paMachine (guardrail).")
add(iteration="7",wave="C",phase="build",agent_role="specialist",agent_label="assessments+caregiver+documents",workstream_domain="pipeline/assessments/caregiver/documents",
    prompt_summary="[verbatim: iteration-7-verbatim.md waveC] assessments (QuestionnaireResponse T1) + caregiver (RelatedPerson T1) + documents (DocumentReference T2, honest).",
    key_inputs="_TEMPLATE.md",output_summary="3 domains; documents honestly T2; 39 tests",gate_result="green",fidelity="live",
    review_note="documents T2 not a hidden T1 claim.")
add(iteration="7",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter7-convergence+panel",workstream_domain="pipeline/part2/claims",
    prompt_summary="[verbatim: iteration-7-verbatim.md waveD - FIRST COMPOSED v1.1 PROMPT] convergence + E9 fail-open sweep + red-team (R1=Part2/privacy+financial, R2 negative-space, R3 stub-legitimacy).",
    key_inputs="wave reports; register; framework v1.1",output_summary="E9 found+fixed 2 Unacceptable Part2 fail-opens; R1 8/R2 9/R3 findings; F2 advanced; DRY; record 17/20",gate_result="DRY",fidelity="live",
    findings="R1:8 R2:9 R3:fixed2",
    review_note="First composed-prompt agent (v1.1). E9 standing sweep caught top-severity class on top-stakes surface.")

# ---------- Iteration 8A-i - External identity + EMPI (F3, F5; PIX/PDQ real) ----------
add(iteration="8A-i",wave="probe",phase="probe",agent_role="probe",agent_label="iter8ai-probe",workstream_domain="harness/identity",
    prompt_summary="[verbatim: verbatim/iteration-8ai-verbatim.md] probe pg-mem; locate I4 external-EMPI stubs + deferred-I8A provider refs.",
    key_inputs="baseline",output_summary="pgmem ok; external stubs found; deferred-I8A refs present",gate_result="clean",fidelity="live",
    review_note="Probe confirmed the I4 stubs to make real + the deferred provider refs to resolve.")
add(iteration="8A-i",wave="A",phase="build",agent_role="specialist",agent_label="survivorship+crossReference",workstream_domain="identity/survivorship/crossReference",
    prompt_summary="[verbatim: iteration-8ai-verbatim.md waveA - COMPOSED v1.1] F3: member<->source xref (link/unlink/merge/unmerge, replay-rekey) + source-ranked survivorship rules-as-data, golden record as PROJECTION. Fix fragmentation.",
    key_inputs="iteration8ai_context F3; DP-7",output_summary="xref+survivorship built; two feeds->one member; golden-record projection; seam declared; tests green",gate_result="green",fidelity="live",
    findings="",
    review_note="F3 core fix: id-only second-feed record LINKS to existing member, not a new mint.")
add(iteration="8A-i",wave="B",phase="build",agent_role="specialist",agent_label="external-empi-real",workstream_domain="identity/external",
    prompt_summary="[verbatim: iteration-8ai-verbatim.md waveB - COMPOSED v1.1] Make PIX/PDQ (HL7v2 QBP^Q23/Q22) + PIXm/PDQm (FHIR $ihe-pix / Patient search) REAL query+parse vs a fake MPI; fail-closed without live endpoint; external results respect HELD.",
    key_inputs="iteration8ai_context; I4 external stubs",output_summary="PIX/PDQ + PIXm/PDQm real logic; fail-closed w/o MPI; HELD on low-confidence; tests green",gate_result="green",fidelity="live",
    review_note="Advances the I4 labeled-stubs to real adapter logic; live endpoint CI-pending.")
add(iteration="8A-i",wave="C",phase="build",agent_role="specialist",agent_label="provider-identity-npi",workstream_domain="identity/provider",
    prompt_summary="[verbatim: iteration-8ai-verbatim.md waveC - COMPOSED v1.1] F5: NPI Luhn validation + provider resolver (seeded dir for tests, NPPES fail-closed in prod); ProviderIdentity graph node; deferred-I8A refs now resolve; no invented NPI.",
    key_inputs="iteration8ai_context F5; deferred-I8A refs",output_summary="NPI validation; provider resolves to node; fail-closed w/o NPPES; deferred refs resolved; tests green",gate_result="green",fidelity="live",
    review_note="F5 fix. Anti-masquerade: unresolvable provider stays raw+flagged, never a fabricated NPI.")
add(iteration="8A-i",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter8ai-convergence+panel",workstream_domain="identity/interoperability",
    prompt_summary="[verbatim: verbatim/iteration-8ai-verbatim.md waveD - COMPOSED v1.2] convergence to DRY + E9 fail-open sweep (identity: ambiguous match -> HELD not wrong link) + red-team panel (R1=IHE PIX/PDQ+EMPI survivorship+NPPES lens, R2 negative-space, R3 stub-legitimacy on new external seams) + register update (close F3/F5).",
    key_inputs="wave A/B/C reports; register F3/F5; framework v1.2",
    output_summary="convergence DRY (dataMode/seamDispositions reconciled, identity/index barrel completed); E9 fixed-1 Unacceptable (PDQ/PDQm fabricated enterprise anchor via ?? ids[0] -> empty-anchor HELD, +2 regression tests); R1 4 (1 Unacceptable-fixed, 2 MED, 1 LOW); R2 7-item missing-list; R3 3 Acceptable/0 open; F3 CLOSED; F5 CLOSED; orchestrator gate: tsc0, 1198 pass +1 expected-fail, size+E1(33) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-22T21:19:00Z",
    findings="R1:4 R2:7 R3:0open E9:fixed1",
    review_note="E9 standing sweep caught the wrong-person-link class AGAIN (fabricated enterprise anchor from a peer id) on the highest-stakes surface - identity - exactly as it caught the Part 2 fail-opens in I7. F3 residual: live-pg cutover -> NS-05. F5 residual: F5-b HIGH (claims/care-team/medication provider refs still to resolve) -> backlog. Orchestrator re-ran the authoritative gate independently (E5).")

# ---------- Iteration 8A-ii - Real terminology + classification validation ----------
add(iteration="8A-ii",wave="probe",phase="probe",agent_role="probe",agent_label="iter8aii-probe",workstream_domain="harness/terminology",
    prompt_summary="Orchestrator inline probe of the I4 terminology surface: semanticValidator, seed/production services, valueSetRegistry + 6 families, the declared terminology seam.",
    key_inputs="baseline src/lib/terminology",output_summary="seed allowlist + fail-closed prod stub confirmed; scoped 3 disjoint waves",gate_result="clean",fidelity="live",ts_override="2026-08-23T01:30:00Z",
    review_note="Probe done by the orchestrator (not a subagent); logged for E11 completeness.")
add(iteration="8A-ii",wave="A",phase="build",agent_role="specialist",agent_label="terminology-validate+expand",workstream_domain="terminology/validateCode/expand",
    prompt_summary="[verbatim: verbatim/iteration-8aii-verbatim.md waveA - COMPOSED v1.2] make validateCode real (member-of-bound-value-set-version) + $expand + version/retired awareness + UCUM on LOINC quantities; production fail-closed.",
    key_inputs="iteration8aii_context WaveA; terminology seed+registry",output_summary="validateCode real; $expand; retired-code rejected with version; UCUM; 29 tests; prod fail-closed",gate_result="green",fidelity="live",ts_override="2026-08-23T01:45:00Z",
    review_note="Member-of-version validity replaces the flat allowlist; retired-code path wired into the stage-4 gate.")
add(iteration="8A-ii",wave="B",phase="build",agent_role="specialist",agent_label="terminology-translate+classify",workstream_domain="terminology/translate/classify",
    prompt_summary="[verbatim: iteration-8aii-verbatim.md waveB - COMPOSED v1.2] $translate over seeded crosswalks (ICD-10<->CMS-HCC, SNOMED<->ICD-10) + HCC classification data-driven; risk families (CMS-HCC/RxHCC/HHS-HCC/CDPS) as data; untranslatable->no-map.",
    key_inputs="iteration8aii_context WaveB",output_summary="translate real w/ asset+version; no fabricated maps; HCC classify data-driven; risk families enumerated; 16 tests; live crosswalk fail-closed",gate_result="green",fidelity="live",ts_override="2026-08-23T01:46:00Z",
    review_note="HCC is one family of several (owner directive honored). Seed labeled synthetic, not the full licensed map.")
add(iteration="8A-ii",wave="C",phase="build",agent_role="specialist",agent_label="terminology-pipeline-binding+currency",workstream_domain="terminology/registry/pipeline",
    prompt_summary="[verbatim: iteration-8aii-verbatim.md waveC - COMPOSED v1.2] bind the stage-4 semantic gate for code-carrying domains (quarantine bad/retired codes via existing dead-letter path, no new store) + value-set currency enforcement (stale/expired binding quarantines).",
    key_inputs="iteration8aii_context WaveC; semanticValidator; deadLetter",output_summary="pipeline binding quarantines bad code; currency enforced on stale versions; reuse-not-duplicate; 24 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T01:47:00Z",
    review_note="Reused the semanticValidator + dead-letter quarantine; no duplicated validation logic and no new store.")
add(iteration="8A-ii",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter8aii-convergence+panel",workstream_domain="terminology/semantic",
    prompt_summary="[verbatim: iteration-8aii-verbatim.md waveD - COMPOSED v1.2] convergence to DRY + E9 fail-open sweep (terminology: unverifiable/retired->quarantine, untranslatable->no-map, stale version not silently valid) + red-team panel (R1 terminology/semantic-interoperability lens, R2 negative-space, R3 stub-legitimacy on seed/crosswalk data) + register.",
    key_inputs="wave A/B/C reports; register; framework v1.2",output_summary="convergence DRY (consolidated a drifted duplicate ICD-10->HCC map); E9 clean (8 shapes justified); R1 7/R2 8/R3 6 all Acceptable (1 Risky fixed); register 8A-ii section; orchestrator gate tsc0, 1267 pass +1 expected-fail, size+E1(33) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-23T02:05:00Z",
    findings="R1:7 R2:8 R3:6 E9:clean",
    review_note="Convergence caught a drifted DUPLICATE crosswalk map (DRY defect the build waves missed) and consolidated it - the convergence pass earning its place. Residuals: live terminology server + full licensed maps -> backlog.")

# ---------- Iteration 8A-iii - Value-set governance console (closes the I8A block) ----------
add(iteration="8A-iii",wave="probe",phase="probe",agent_role="probe",agent_label="iter8aiii-probe",workstream_domain="harness/governance",
    prompt_summary="Orchestrator inline probe: admin-console sibling pages, valueSetRegistry API, authz principal/role model, append-only evidence ledger to reuse; scoped 3 disjoint waves + shared-file partitions.",
    key_inputs="baseline src/app/admin-console, terminology/registry, authz, evidence",output_summary="reuse surfaces confirmed; namespace pre-allocated",gate_result="clean",fidelity="live",ts_override="2026-08-23T02:30:00Z",
    review_note="Probe by orchestrator; logged for E11 completeness.")
add(iteration="8A-iii",wave="A",phase="build",agent_role="specialist",agent_label="governance-backend-lifecycle",workstream_domain="terminology/governance",
    prompt_summary="[verbatim: verbatim/iteration-8aiii-verbatim.md waveA - COMPOSED v1.2] value-set version lifecycle state machine + ENFORCED maker-checker (config single-approver) + immutable evidence-ledger audit + chosen-version replay; valueSetGovernanceStore seam fail-closed.",
    key_inputs="iteration8aiii_context WaveA; registry; evidence ledger; validateCode",output_summary="lifecycle guarded; maker-checker enforced (MakerCheckerViolationError); single-approver configurable; immutable audit + history; chosen-version replay (no fallback); one-active invariant; 19 tests; seam-gate 27",gate_result="green",fidelity="live",ts_override="2026-08-23T02:47:00Z",
    review_note="Separation-of-duties enforced in code, not advice. Reused the evidence ledger as the immutable audit trail (no new store).")
add(iteration="8A-iii",wave="B",phase="build",agent_role="specialist",agent_label="governance-console-ui",workstream_domain="admin-console/value-set-governance",
    prompt_summary="[verbatim: iteration-8aiii-verbatim.md waveB - COMPOSED v1.2] dual-mode admin/UI governance console: version list+states, diff, approval gates (maker-checker disable), audit timeline, replay panel; nav entry; no browser storage.",
    key_inputs="iteration8aiii_context WaveB; admin-console patterns",output_summary="console renders; gates by role/mode; maker-checker approve disabled for maker; replay panel; dual-mode; 5 render tests (new React test infra scoped in-partition)",gate_result="green",fidelity="live",ts_override="2026-08-23T02:48:00Z",
    review_note="Bound to a local read-model adapter mid-flight (waves parallel); Wave D collapsed it to real delegation.")
add(iteration="8A-iii",wave="C",phase="build",agent_role="specialist",agent_label="governance-bff-routes",workstream_domain="api/value-set-governance",
    prompt_summary="[verbatim: iteration-8aiii-verbatim.md waveC - COMPOSED v1.2] BFF routes submit/approve/reject/retire/replay/history, role-gated (steward vs reviewer), maker-checker enforced at the route boundary (defense in depth), PHI-safe, CALL the backend not duplicate.",
    key_inputs="iteration8aiii_context WaveC; authz guard; _helpers",output_summary="routes role-gated; maker-checker at boundary (403 self-approve); call-not-duplicate; PHI-safe; 20 route tests",gate_result="green",fidelity="live",ts_override="2026-08-23T02:49:00Z",
    review_note="Defense-in-depth: maker-checker enforced at both backend and route boundary.")
add(iteration="8A-iii",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter8aiii-convergence+panel",workstream_domain="governance/workflow-integrity",
    prompt_summary="[verbatim: iteration-8aiii-verbatim.md waveD - COMPOSED v1.2] convergence (extract single maker-checker predicate; collapse console adapter to real delegation) + E9 fail-open sweep (unapproved->not active; no self-approve; replay binds chosen version; unauth fails closed) + red-team (governance/workflow-integrity + auditability lens) + register; CLOSES the I8A block.",
    key_inputs="wave A/B/C reports; register; framework v1.2",output_summary="convergence DRY (single makerChecker.ts predicate; adapter collapsed to real delegation); E9 fixed-1 Unacceptable (resolveGovernanceBackend bound ?? integrationDouble served in-memory as production - now fails closed); R1 4/R2 7/R3 3; register 8A-iii section; I8A CLOSED; orchestrator gate tsc0, 1314 pass +1 expected-fail, size+E1(34) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-23T03:10:00Z",
    findings="R1:4 R2:7 R3:3 E9:fixed1",
    review_note="E9 caught a MASQUERADE fail-open (an in-memory double served as durable production governance) - the stub-legitimacy class the owner's original identity-stub concern was about, now caught by the standing sweep. I8A block (identity+terminology+governance) closed.")

# ---------- Iteration 9 - Substrate + deployment ----------
add(iteration="9",wave="probe",phase="probe",agent_role="probe",agent_label="iter9-probe",workstream_domain="harness/substrate",
    prompt_summary="Orchestrator inline probe: per-store pg adapters + SQL migrations already exist (evidence/idempotency/outbox/graph); memory-only crossReference+governance; env.ts fail-closed pattern; 23 seams. Scoped substrate/deploy/lifecycle waves.",
    key_inputs="baseline persistence + config surface",output_summary="pg adapters exist; no unified migration runner/preflight; scoped 3 waves",gate_result="clean",fidelity="live",ts_override="2026-08-23T03:15:00Z",
    review_note="Probe by orchestrator; live infra CI-pending in sandbox - deliver real logic verified vs pg-mem, fail-closed live.")
add(iteration="9",wave="A",phase="build",agent_role="specialist",agent_label="substrate-migration+bootstrap",workstream_domain="substrate",
    prompt_summary="[verbatim: verbatim/iteration-9-verbatim.md waveA - COMPOSED v1.2] unified migration runner (idempotent, schema_migrations ledger, checksum-guard) + substrate bootstrap (one DATABASE_URL, fail-closed unconfigured); pg adapter/disposition for crossReference+governance.",
    key_inputs="iteration9_context WaveA; pg adapters; pg-mem",output_summary="migration runner idempotent + checksum-guarded; bootstrap fail-closed (SubstrateNotConfiguredError); 11 tests; live pg CI-pending",gate_result="green",fidelity="live",ts_override="2026-08-23T03:32:00Z",
    review_note="Consolidated per-store pg adapters under one runner+bootstrap; verified vs pg-mem.")
add(iteration="9",wave="B",phase="build",agent_role="specialist",agent_label="deploy-preflight+health",workstream_domain="deploy/health",
    prompt_summary="[verbatim: iteration-9-verbatim.md waveB - COMPOSED v1.2] deployment config schema + fail-closed startup preflight (names the unmet required prod seam/env) + readiness (503 not-ready) / liveness routes.",
    key_inputs="iteration9_context WaveB; seamDispositions; env.ts",output_summary="preflight fails closed naming unmet seam/key; readiness reflects it; liveness; 22 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T03:33:00Z",
    review_note="Startup preflight makes the E1 seam postures enforceable at boot, not just per-call.")
add(iteration="9",wave="C",phase="build",agent_role="specialist",agent_label="data-lifecycle+runbook",workstream_domain="lifecycle",
    prompt_summary="[verbatim: iteration-9-verbatim.md waveC - COMPOSED v1.2] policy-driven retention/purge over mutable stores + immutability-preserving right-to-delete on the evidence ledger (governed tombstone, never silent row delete) + legal-hold + deployment runbook.",
    key_inputs="iteration9_context WaveC; evidence ledger; consent/Part2",output_summary="retention by policy; right-to-delete preserves ledger immutability; legal-hold blocks purge; runbook; 25 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T03:34:00Z",
    review_note="Right-to-delete done correctly: audited tombstone, not a row delete that would break the immutable ledger.")
add(iteration="9",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter9-convergence+panel",workstream_domain="deployment/operability",
    prompt_summary="[verbatim: iteration-9-verbatim.md waveD - COMPOSED v1.2] convergence to DRY + E9 fail-open sweep (deployment: missing prod config fails closed at startup; migrations idempotent+non-destructive; readiness not default-ready; purge preserves immutability + legal hold) + red-team (deployment/operability/data-integrity lens) + register.",
    key_inputs="wave A/B/C reports; register; framework v1.2",output_summary="convergence DRY (preflight consults substrate disposition; single config schema); E9 fixed-2 Unacceptable (preflight phantom-key fail-open; blank-DATABASE_URL fail-open); R1 7/R2 8/R3 6; register Iteration 9 section; orchestrator gate tsc0, 1371 pass +1 expected-fail, size+E1(34) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-23T03:55:00Z",
    findings="R1:7 R2:8 R3:6 E9:fixed2",
    review_note="E9 caught TWO deployment fail-opens (a phantom-key that read as satisfied; a blank DATABASE_URL that would boot serving a mock) - the fail-closed-at-startup class, exactly where a prod misconfig is most dangerous. Live pg/neo4j/external remain CI-pending residuals -> Iteration 10 certification.")

# ---------- Iteration 10 - Certification (honest conformance evidence + readiness) ----------
add(iteration="10",wave="probe",phase="probe",agent_role="probe",agent_label="iter10-probe",workstream_domain="harness/certification",
    prompt_summary="Orchestrator inline probe: enumerated the claimed standards + their code/test evidence surface (routes, validators, adapters, seams) to scope the conformance matrix / capability statement / readiness waves.",
    key_inputs="baseline standards surface + register",output_summary="standards + evidence surface mapped; scoped 3 waves",gate_result="clean",fidelity="live",ts_override="2026-08-23T03:58:00Z",
    review_note="Probe by orchestrator. Capstone iteration: honesty rule (no standard supported on a stub); red-team = overclaim detection.")
add(iteration="10",wave="A",phase="build",agent_role="specialist",agent_label="conformance-matrix",workstream_domain="certification/matrix",
    prompt_summary="[verbatim: verbatim/iteration-10-verbatim.md waveA - COMPOSED v1.2] conformance MATRIX as data: standard -> capability -> evidence {codePath, testId, status}; every supported row points to a real test; a stub is ci-pending/partial, never supported.",
    key_inputs="iteration10_context WaveA; routes/validators/adapters/tests",output_summary="matrix covers all claimed standards; supported rows point to real tests; counts 17 supported/20 partial/3 ci-pending/2 absent; 17 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T04:12:00Z",
    review_note="Honest distribution - only 17 of the claimed capabilities are fully supported+evidenced; the rest are truthfully partial/pending/absent.")
add(iteration="10",wave="B",phase="build",agent_role="specialist",agent_label="capability-statement",workstream_domain="certification/capabilityStatement",
    prompt_summary="[verbatim: iteration-10-verbatim.md waveB - COMPOSED v1.2] FHIR R4 CapabilityStatement generated from the ACTUAL implemented surface (routes, operations, validator profiles, SMART security); must not list an unimplemented resource/operation.",
    key_inputs="iteration10_context WaveB; api routes; profileValidator",output_summary="CapabilityStatement from real surface; only-implemented ops; profiles reflect validator; 17 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T04:13:00Z",
    review_note="The statement is derived from code, not hand-asserted, so it cannot claim an operation the platform does not serve.")
add(iteration="10",wave="C",phase="build",agent_role="specialist",agent_label="certification-readiness",workstream_domain="certification/readiness",
    prompt_summary="[verbatim: iteration-10-verbatim.md waveC - COMPOSED v1.2] CERTIFICATION_READINESS.md per-standard status + residuals + path-to-certification + machine-readable summary; a test asserts the summary matches the matrix (no doc-vs-evidence drift).",
    key_inputs="iteration10_context WaveC; register; seams",output_summary="readiness doc all 13 standards; nothing marked ready; NS-05 ceiling + per-standard residuals named; summary matches matrix; 22 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T04:14:00Z",
    review_note="Certification-READINESS, not an assertion of certification. Doc-vs-evidence drift gated by test.")
add(iteration="10",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter10-convergence+overclaim-panel",workstream_domain="certification/overclaim",
    prompt_summary="[verbatim: iteration-10-verbatim.md waveD - COMPOSED v1.2] convergence (matrix single source; readiness comparator wired to real matrix; capability statement subset of matrix) + E9 (no default-supported; readiness not ready for ci-pending) + CAPSTONE red-team OVERCLAIM detection (audit each supported row's test depth) + register FINAL rollup.",
    key_inputs="wave A/B/C reports; register; framework v1.2",output_summary="convergence DRY (matrix single source); E9 clean; R1 demoted 3 OVERCLAIMS (shallow tests behind supported rows); R2 1; R3 11 seams graded 0 faked-green; 4 Unacceptable fixed; register final rollup; orchestrator gate tsc0, 1435 pass +1 expected-fail, size+E1(34) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-23T04:35:00Z",
    findings="R1:3-demoted R2:1 R3:0-faked E9:clean",
    review_note="CAPSTONE. The overclaim red-team demoted 3 conformance overclaims (a supported row whose test did not actually exercise the standard's requirement) - the exact 'stub dressed as conformance' failure the whole framework exists to catch, applied to the platform's own certification claims. Build plan I0->I10 reaches an honest, evidenced certification-readiness state.")

# ---------- Iteration 11 - Closeout (F5-b, record 20/20, buildable HIGH findings, R5+E12 framework) ----------
add(iteration="11",wave="probe",phase="probe",agent_role="probe",agent_label="iter11-probe",workstream_domain="harness/closeout",
    prompt_summary="Orchestrator inline probe: WpcDomain=17 (3 USCDI gaps: conditions/diagnostic-reports/family-history); open buildable register HIGHs (F5-b, R1-I7-5/6, R1-I6-1/2, R1-8Ai-2). Scoped 4 disjoint waves + framework wave.",
    key_inputs="baseline domains + register open findings",output_summary="3 missing domains + 5 buildable findings + framework enhancement scoped",gate_result="clean",fidelity="live",ts_override="2026-08-23T04:40:00Z",
    review_note="Probe by orchestrator. Final buildable closeout; the rest is live-infra/licensing/accreditation, not code.")
add(iteration="11",wave="A",phase="build",agent_role="specialist",agent_label="f5b-claims-integrity-carc",workstream_domain="pipeline/claims/provider",
    prompt_summary="[verbatim: verbatim/iteration-11-verbatim.md waveA - COMPOSED] F5-b resolve claims/care-team/medication provider refs to ProviderIdentity (no invented NPI) + claims golden-thread integrity (orphan ClaimResponse HOLDs, no dangling edge) + CARC X12 group code (CO/PR/OA/PI) via terminology gate.",
    key_inputs="iteration11_context WaveA; provider resolver; terminology gate",output_summary="F5-b resolved (raw+flagged when no NPI); orphan claim holds not dangles; CARC group captured; 22 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T05:00:00Z",
    review_note="Closes F5-b (HIGH) + R1-I7-5 (HIGH claims integrity) + R1-I7-6 (HIGH CARC member-liability).")
add(iteration="11",wave="B",phase="build",agent_role="specialist",agent_label="three-new-domains-20of20",workstream_domain="pipeline/conditions/diagnostic/family",
    prompt_summary="[verbatim: iteration-11-verbatim.md waveB - COMPOSED] conditions (Condition problem list, HCC-relevant) + diagnostic-reports (DiagnosticReport incl imaging) + family-history (FamilyMemberHistory) through the template; WpcDomain 17->20; semantic-gated.",
    key_inputs="iteration11_context WaveB; _TEMPLATE.md",output_summary="3 domains registered; record 20/20 (typed union + runtime spec); conditions semantic-gated; 29 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T05:01:00Z",
    review_note="Completes the C9 record model to 20/20 with real USCDI data classes (problems, diagnostics, family history), not padding.")
add(iteration="11",wave="C",phase="build",agent_role="specialist",agent_label="referral-goal-lifecycle-tiebreak",workstream_domain="graph/referral/goal/survivorship",
    prompt_summary="[verbatim: iteration-11-verbatim.md waveC - COMPOSED] referral loop-closure (ServiceRequest.status lifecycle + closed-loop signal) + Goal lifecycleStatus/achievementStatus/target + survivorship source-order tiebreak honored.",
    key_inputs="iteration11_context WaveC; referral/goalTask mappings; survivorship rules",output_summary="referral loop-closure; goal can be MET; source-order tiebreak honored; 23 tests",gate_result="green",fidelity="live",ts_override="2026-08-23T05:02:00Z",
    review_note="Closes R1-I6-1 (referral loop-closure), R1-I6-2 (goal status), R1-8Ai-2 (tiebreak). Care-coordination closed-loop rate now computable.")
add(iteration="11",wave="F",phase="build",agent_role="spine",agent_label="framework-R5-E12-v1.3",workstream_domain="framework",
    prompt_summary="[verbatim: iteration-11-verbatim.md waveF - COMPOSED] add R5 Verification/Cross-Examiner persona + E12 claim-vs-evidence gate to the framework; SKILL.md v1.3; five-persona panel + E12 in the DoD. (Orchestrator finalized into the canonical framework copy.)",
    key_inputs="iteration11_context WaveF; docs/framework",output_summary="R5 persona + E12 gate + v1.3; DoD updated; canonical framework repackaged",gate_result="green",fidelity="live",ts_override="2026-08-23T05:03:00Z",
    review_note="The framework self-improvement the whole build fed: R5 institutionalizes the owner's instinct that catching load-bearing gaps needs a reviewer whose job is to distrust the green; E12 mechanizes claim-vs-evidence.")
add(iteration="11",wave="D",phase="red-team",agent_role="convergence+red-team",agent_label="iter11-convergence+5persona-panel",workstream_domain="closeout/cross-examination",
    prompt_summary="[verbatim: iteration-11-verbatim.md waveD - COMPOSED v1.3] convergence + E9 sweep + FIVE-persona red-team incl the NEW R5 cross-examiner on this iteration's own claims + E12 claim-vs-evidence + register FINAL closeout.",
    key_inputs="wave A/B/C/F reports; register; framework v1.3",output_summary="convergence DRY; E9 clean; R1 4/R2 7/R3 6/R4 2; R5 10 upheld / 0 demoted; E12 satisfied; 6 findings CLOSED (F5-b, R1-I7-5, R1-I7-6, R1-I6-1, R1-I6-2, R1-8Ai-2); record 20/20; orchestrator gate tsc0, 1509 pass +1 expected-fail, size+E1(34) PASS",
    gate_result="DRY",fidelity="live",ts_override="2026-08-23T05:25:00Z",
    findings="R1:4 R2:7 R3:6 R4:2 R5:10up/0dem E9:clean E12:ok",
    review_note="FINAL BUILDABLE CLOSEOUT. The new R5 cross-examiner re-read all 10 of this iteration's claims against their E12 evidence and upheld each - the standing verification agent doing exactly what it was designed for. All in-sandbox-buildable register findings closed; remaining residuals are live-infra/licensing/accreditation only. Build plan I0->I11 at buildable-completion.")

# ---------- Framework v1.4 - process self-improvement (post-build reflection) ----------
add(iteration="FW1.4",wave="reflect",phase="fix",agent_role="spine",agent_label="framework-v1.4-reflection",workstream_domain="framework",
    prompt_summary="Owner-requested pause+reflect (chain AND tree of thought) on efficiency/quality/rework/testing/adversarial/personas after the 11-iteration build. Orchestrator-authored v1.4: reasoning-mode doctrine (CoT default, ToT at forks), E13 test-effectiveness gate, E9 shift-left, spine interface-freeze, tighter adversarial loop + N-skeptic, on-demand Performance persona, L10-L12.",
    key_inputs="whole build's cost centers (fail-open recurrence, cross-wave transients, coordination-gap rework, presence-not-effectiveness testing)",
    output_summary="framework docs v1.4 (SKILL/personas/enforcement-kit/operating-model); E13 tooling BUILT + DOGFOODED (check-mutation.mjs killed 6/6 on npi.ts + 8/8 on goldenRecord.ts; check-testlink.mjs passed on the 3 new domains); repackaged skill + agentic-build-framework-v1.4.zip",
    gate_result="green",fidelity="live",ts_override="2026-08-23T15:00:00Z",depends_on="93",builds_on="the framework self-improvement the whole build fed - the ToT injection the owner flagged",
    review_note="Tree-of-thought used in the reflection itself (the new-persona decision was branch-evaluate-prune: resist proliferation - net add one on-demand persona, the rest are mandates/gates/doctrines). E13 is dependency-free (no Stryker) and proven against real modules, not prose.")

# ---------- Framework v1.5 - deployment-hardening self-improvement (post-hardening-review reflection) ----------
add(iteration="FW1.5",wave="reflect",phase="fix",agent_role="spine",agent_label="framework-v1.5-reflection",workstream_domain="framework",
    prompt_summary="Owner-requested tree-of-thought reflection on how to further harden the framework so iterations are truly optimized, after the 10-lens adversarial hardening review of I0->I11. Orchestrator-authored v1.5: E14 wired-path/integration gate (import-graph reachability ratchet), E15 seam mock<->production parity gate, lens-completeness doctrine (derive lens set from NFR+regulatory surface), two-tier done (Definition of Ready + Production-Readiness gate), program spine (interface-freeze across iterations), critical-finding protocol (N-skeptic + mutation-tested regression + red-team re-attack).",
    key_inputs="the 10-lens hardening review's 162 findings (dominant theme: 'unwired realness' - production-shaped modules reached only by tests); framework v1.4 baseline",
    output_summary="framework docs v1.5 (SKILL/personas/enforcement-kit/operating-model); E14 tooling BUILT + DOGFOODED (check-wiring.mjs found 134 unwired lib modules; ratchet passes at baseline, fails on a new orphan) + wiring-baseline.json; repackaged skill + framework_bundle.tgz + agentic-build-framework-v1.5.zip (README updated)",
    gate_result="green",fidelity="live",depends_on="94",builds_on="the framework v1.4 reflection + the hardening review that mechanically exposed 'unwired realness' as E14",
    ts_override="2026-08-23T17:05:00Z",
    review_note="Tree-of-thought used in the reflection itself: enumerated candidate hardenings (more personas vs mechanical gates vs process doctrine), scored against blast-radius/reversibility/dogfoolability, pruned to the set that is mechanically enforceable now. E14 is dependency-free and proven against the real repo (134 orphans found), not prose. E15/lens-completeness/program-spine/critical-finding are doctrine+DoD until their first hardening iteration exercises them.")

# ---------- Iteration 12 / HW0 - demo-preservation harness + parity gate (hardening program, Phase 1) ----------
add(iteration="12",wave="HW0",phase="build",agent_role="spine",agent_label="I12-HW0-demo-preservation",workstream_domain="hardening/safety-net",
    prompt_summary="[framework v1.5] HW0 safety net BEFORE any wiring: build the demo-preservation golden-snapshot harness + gate (constraint #2), the E15 seam mock<->production parity registry, the installer frontend-only+mock lock (constraint #3), and the program spine (I12-I21 dependency graph + interface registry + phase gates). External measures preserved as authored mock (constraint #4).",
    key_inputs="HARDENING_PLAN.md HW0; dataMode seam registry; authored demo surfaces (wholePersonGraphData, smartFhirMockData, mockData, describeDataModes)",
    output_summary="src/lib/demoPreservation/{fingerprint,capture,shape,parity,index}.ts + tests/demoPreservation/{demo-preservation,seam-parity}.test.ts + goldens; docs/framework/{PROGRAM_SPINE,INSTALL_PROFILES}.md; package.json check:demo; check-wiring.mjs harness exemption. Gates: tsc 0, 26 tests pass (deterministic x2), E14 134/134, mock-default lock green.",
    gate_result="green",fidelity="live",depends_on="95",builds_on="framework v1.5 (E14/E15 + program spine + two-tier done) applied to the first hardening iteration",
    ts_override="2026-08-23T17:25:00Z",
    review_note="Freezes contract C-DEMO for the whole program. Volatile demo timestamps normalized so the golden regenerates byte-identically. demoPreservation is a CI gate harness -> a first-class E14 exemption, not unwired production. Production-readiness = the gate is real+deterministic+CI-wired; it now guards HW1-HW6.")

# ---------- Iteration 13 / HW-SEC - security & multi-tenancy (C-TEN keystone, Phase 1) ----------
add(iteration="13",wave="HW-SEC",phase="build",agent_role="spine",agent_label="I13-HWSEC-tenant-boundary",workstream_domain="hardening/security",
    prompt_summary="[framework v1.5, DoR->DoD] Publish the tenant/plan/LOB boundary (program-spine keystone C-TEN) and enforce it: even an org-scoped reviewer is bounded to their tenant/LOB. Close the documented BOLA on clinical FHIR reads. Seam-gated (tenancy): mock=single demo tenant (demo intact), production=per-record tenant + IdP-claim actor scope, fail-closed. Lens set: security(owning)+domain-fidelity+stub-legitimacy+negative-space.",
    key_inputs="security.md (20 findings, 2 Crit: no tenant/LOB isolation, BOLA clinical reads); existing Principal/MemberScope model; dataMode seam registry; patient payer/contract fields",
    output_summary="src/lib/security/tenant/{types,resolve,authz,index}.ts; FHIR route BOLA gate wired (canAccessMemberTenantAware); tenancy seam in dataMode+seamDispositions(real-impl)+governance prober; tests/security/tenant.test.ts. Gates: tsc 0, 34 tests pass, E14 134/134 (WIRED reachable 535->539), demo golden diff = +tenancy only (demo preserved), FHIR route tests 7 pass.",
    gate_result="green",fidelity="live",depends_on="96",builds_on="HW0 demo-preservation gate; the pre-existing Principal member-scope model (tenant dimension added ABOVE org scope)",
    ts_override="2026-08-23T17:40:00Z",
    review_note="Freezes C-TEN for HW1/HW2/HW3/HW-FIN/HW4 (stores built tenant-scoped, no retrofit). Genuinely wired (E14 reachable +4), not unit-tested-only. Production fails closed on absent claim (safe). Residual HW-SEC items (secrets rotation, rate-limit, CSP/CSRF, SBOM, IAL2) are follow-on; live IdP claim emission is the NS-05 ceiling.")

# ---------- Iteration 14 / HW1 - durable state + HA foundation, core REC-01 (Phase 1) ----------
add(iteration="14",wave="HW1",phase="build",agent_role="spine",agent_label="I14-HW1-projection-consumer",workstream_domain="hardening/reliability",
    prompt_summary="[framework v1.5] HW1 core: close REC-01 (the #1 'unwired realness' finding) - wire the outbox->projector consumer to a REAL entry point with a resumable per-member checkpoint, idempotent, per-member FIFO. Seam-gated store resolution (mock in-memory vs production durable/fail-closed). Freezes C-STORE consumer half. Right-sized (L12) to the dominant finding; remaining HW1 breadth scheduled.",
    key_inputs="reconciliation.md REC-01/03; ha-scale.md HS-02; existing outbox (store/envelope/sequencing) + graph projector (project/projectEvent) that were unit-tested but uncalled from any real path",
    output_summary="src/lib/graph/consumer/{projectionConsumer,checkpoint,provider,index}.ts + src/app/api/ops/projection/run/route.ts (ops-authz, audited) + tests/graph/projectionConsumer.test.ts. Gates: tsc 0, 3 tests pass, E14 134/134 with entries 225->226 + reachable 539->544 (WIRED, proven not test-only), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="97",builds_on="HW0 gate + HW-SEC C-TEN; wires the pre-existing-but-orphaned projector+outbox (the exact defect E14 was built to catch)",
    ts_override="2026-08-23T17:55:00Z",
    review_note="REC-01 was THE canonical 'unwired realness' example in the hardening plan; E14 now proves it wired (reachable +5). Production checkpoint/outbox/graph factories are fail-closed hooks (NS-05 live-infra ceiling). Remaining HW1 (store migration, scheduler, circuit-breakers, readiness=liveness, migration-lock, observability, DR) is scheduled follow-on; demo untouched.")

# ---------- Iteration 15 / HW2 - audit + disclosure integrity, core AUD-01/AUD-02 (Phase 1) ----------
add(iteration="15",wave="HW2",phase="build",agent_role="spine",agent_label="I15-HW2-tamper-evident-audit",workstream_domain="hardening/audit",
    prompt_summary="[framework v1.5] HW2 core: make the audit trail tamper-evident (AUD-01) - a SHA-256 hash-chain over the PHI-safe events, verifiable + break-locating, in-memory demo default + fail-closed durable factory; wire it into audit() and an ops verify route; fix real actor identity (AUD-02) replacing hardcoded 'session-user'. Freezes C-AUD. Right-sized to the compliance blocker.",
    key_inputs="audit.md (AUD-01 tamper-evidence, AUD-02 actor identity); existing JSONL audit sink; evidence-ledger immutability pattern",
    output_summary="src/lib/server/auditLedger.ts (hash-chain + verifyChain + fail-closed factory) + audit() integration + src/app/api/ops/audit/verify/route.ts (ops/auditor authz) + AUD-02 fix in FHIR route (4 actors) + tests/server/auditLedger.test.ts. Gates: tsc 0, 4 ledger tests + 35 audit-suite pass, E14 134/134 (entries 226->227, reachable 544->546 WIRED), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="98",builds_on="HW1 (audit hangs off request + projection paths); the existing PHI-safe audit event shape",
    ts_override="2026-08-23T18:10:00Z",
    review_note="Tamper-evidence is production-real (node:crypto SHA-256 chain, detection+location tested). Durable pg ledger (append-only + immutability trigger) is the NS-05 live-infra step. Remaining HW2 breadth (Part2/break-glass persistence, before-after on all mutations, accounting-of-disclosures/RADV-OCR export, retention) scheduled. Demo untouched.")

# ---------- Iteration 16 / HW-AI - AI governance, tier-independent human-decision invariant (Phase 1 close) ----------
add(iteration="16",wave="HW-AI",phase="build",agent_role="spine",agent_label="I16-HWAI-decision-invariant",workstream_domain="hardening/ai-governance",
    prompt_summary="[framework v1.5] HW-AI core (3-Crit finding): a TIER-INDEPENDENT invariant at the propose/decide seam - no adverse coverage-affecting action (denial/termination/reduction) auto-resolves under HITL/HOTL/autonomous; resolves ONLY on a qualified human decision with complete provenance (fired rule+version+member-facing reason+appeal). Kills the HOTL SLA-timeout auto-approve + autonomous-tier flip. Wire into the runtime auto-approve branch + a real decision route. Freezes C-DEC.",
    key_inputs="ai-governance.md (16 findings, 3 Crit: SLA-timeout auto-approve, autonomy-tier flip on coverage, no decision provenance); agentRuntime engine auto-approve path; AutonomyTier HITL/HOTL/autonomous",
    output_summary="src/lib/agents/governance/{decisionGate,decisionProvenance,index}.ts + engine.ts auto-approve gated on isAutoApprovable + src/app/api/pa/decision/route.ts (reviewer authz, invariant enforced: 403 no-human, 422 incomplete-provenance) + tests. Gates: tsc 0, 6 governance + 54 agent/runtime tests pass, E14 orphans 134->130 (ratchet SHRANK: route wired governance + 4 agentRuntime modules; baseline re-frozen 130), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="99",builds_on="HW2 audit (decisions recorded to the tamper-evident spine); the existing agent autonomy-tier model (invariant added ABOVE it)",
    ts_override="2026-08-23T18:30:00Z",
    review_note="PHASE 1 (safe-to-pilot) CLOSE: HW0+HW-SEC+HW1core+HW2core+HW-AI. The invariant is genuinely wired (E14 ratchet shrank 4) - the decision route pulled orphaned agentRuntime modules into a real path. Favorable auto-approvals unaffected (54 runtime tests green) - demo preserved. Remaining HW-AI breadth (eval gate, fairness/disparate-impact monitoring, model/prompt versioning+drift) scheduled.")

# ---------- Iteration 17 / HW3 - CRUD lifecycle + correction/void + reprocessing, core RP-01 (Phase 2) ----------
add(iteration="17",wave="HW3",phase="build",agent_role="spine",agent_label="I17-HW3-record-lifecycle",workstream_domain="hardening/reprocessing",
    prompt_summary="[framework v1.5] HW3 core: content-hash record lifecycle (RP-01) - a true resend dedupes but a CORRECTION (same key, changed content) RE-projects; entered-in-error voids/retracts, never hard-delete (CRUD-02). Tenant-scoped + audited CRUD route (PUT correction / DELETE void). Freezes C-LIFE for HW-FIN + HW4.",
    key_inputs="crud.md/reprocessing.md (RP-01 correction-reprojection, CRUD-02 void); existing key-only idempotency store (drops corrections); lifecycle purge/right-to-delete infra",
    output_summary="src/lib/lifecycle/recordLifecycle.ts (content-hash classify: new/unchanged/correction/void/revoid + fail-closed store) + src/app/api/records/[type]/[id]/route.ts (PUT/DELETE, tenant+audit) + lifecycle index exports + tests. Gates: tsc 0, 6 tests pass, E14 orphans 130->122 (ratchet SHRANK 8: CRUD route wired recordLifecycle + purge/right-to-delete/legal-hold/policy/audit; baseline re-frozen 122; reachable 554->564), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="100",builds_on="HW1 C-STORE (corrections re-project through the consumer); HW2 audit; HW-SEC tenant scope on writes",
    ts_override="2026-08-23T18:55:00Z",
    review_note="RP-01 keystone: content-hash idempotency is the fix for the key-only store silently dropping corrections. Genuinely wired - the CRUD route pulled 8 orphaned lifecycle modules into a real path (backlog 134->122 across the program). Remaining HW3 breadth (consent CRUD, care-plan versioning, EMPI merge/unmerge, raw-payload retention, bitemporal projection, replay wiring, 834 recon) scheduled. Demo untouched.")

# ---------- Iteration 18 / HW-FIN - financial/actuarial integrity, core RADV-defensibility (Phase 2 close) ----------
add(iteration="18",wave="HW-FIN",phase="build",agent_role="spine",agent_label="I18-HWFIN-radv-integrity",workstream_domain="hardening/financial-integrity",
    prompt_summary="[framework v1.5] HW-FIN core (6-Crit lens): make every captured HCC RADV-defensible - require MEAT (monitored/evaluated/assessed/treated) + source-document linkage + valid F2F DOS + provider NPI; a pre-submission SCRUB withholds anything non-defensible; an unsupported diagnosis can be RETRACTED before submission (ties to C-LIFE void). Freezes C-SUB submission gate.",
    key_inputs="financial-integrity.md (6 Crit: no MEAT/source linkage=every HCC a RADV takeback, no encounter-submission pipeline, unsupported HCC cannot be retracted pre-submission); existing HCC classifier + encounter mapping",
    output_summary="src/lib/finance/riskAdjustment/{meat,submission,index}.ts (assessRadvDefensibility + evaluateSubmission + retractDiagnosis + scrubForSubmission) + src/app/api/risk-adjustment/hcc/route.ts (POST scrub / DELETE retract, tenant+audit) + tests. Gates: tsc 0, 5 tests pass, E14 122/122 (reachable 564->568 WIRED), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="101",builds_on="HW3 C-LIFE (retract = a void lifecycle); HW-SEC tenant scope; HW2 audit",
    ts_override="2026-08-23T19:15:00Z",
    review_note="PHASE 2 CLOSE (HW3+HW-FIN). Addresses the highest-severity financial Crit: no diagnosis earns risk revenue unless it survives a RADV audit, and an unsupported one is retracted BEFORE submission (not clawed back after). Remaining HW-FIN breadth (full EDPS/RAPS submission + 999/277CA/MAO-002 recon + resubmission, COB, FWA/overpayment, TCOC/PMPM/MLR from adjudicated dollars) scheduled. Demo untouched.")

# ---------- Iteration 19 / HW4 - whole-person depth core: external DEQM measures ingestion (Phase 3) ----------
add(iteration="19",wave="HW4",phase="build",agent_role="spine",agent_label="I19-HW4-deqm-measures",workstream_domain="hardening/whole-person-care",
    prompt_summary="[framework v1.5, constraint #4] HW4 core: external HEDIS/Stars/MIPS measures are INGESTED not computed - a Da Vinci DEQM MeasureReport ingestion adapter behind a `measures` seam. mock=today's authored demo gaps (preserved EXACTLY), production=external feed (fail-closed). Normalized MeasureGap; E15 parity between dispositions. Freezes C-MEAS.",
    key_inputs="HW4 constraint (measures external, ingested to FHIR Measure/MeasureReport/Gaps, demo preserved at all costs); authored mockHEDIS/STARS/MIPS arrays; DEQM population semantics",
    output_summary="src/lib/measures/{types,deqmIngest,mockMeasures,index}.ts + measures seam (dataMode+seamDispositions fail-closed-stub+prober) + RECLASSIFIED graph+wpcRecord mock-only->fail-closed-stub (governance gate caught HW1/HW3 added real consumers; probers added) + src/app/api/measures/gaps/route.ts + tests. Gates: tsc 0, 7 measures + 12 governance tests pass, E14 122/122 (reachable 568->573 WIRED), demo golden = +measures seam only, authored measure panels BYTE-IDENTICAL.",
    gate_result="green",fidelity="live",depends_on="102",builds_on="HW0 golden (pins the authored gaps); HW2 audit; HW-SEC authz. The governance gate self-corrected the graph/wpcRecord classification.",
    ts_override="2026-08-23T19:45:00Z",
    review_note="Constraint #4 honored mechanically: mock reproduces the authored HEDIS/STARS/MIPS gaps byte-identically (read-only normalization), production ingests DEQM and derives gap=denom-numer (never computes the measure). The E14+governance gates BOTH did their job - E14 proved wiring, governance forced the honest graph/wpcRecord reclassification. Remaining HW4 breadth (holistic-context seam, barrier/keystone analytics, living care plan, SDOH, agent orchestration) scheduled - each the same mock=demo/production=real seam. Demo untouched.")

# ---------- Iteration 20 / HW5 - test-hardening + E13 tool fix + named go-live gates (Phase 3) ----------
add(iteration="20",wave="HW5",phase="build",agent_role="spine",agent_label="I20-HW5-test-hardening",workstream_domain="hardening/test-effectiveness",
    prompt_summary="[framework v1.5] HW5: expand E13 mutation to the hardening-critical modules (T-03) and prove real catch-power; NAME the non-code go-live gates. Dogfooding surfaced a real bug in check-mutation.mjs (|| as regex = zero-width match everywhere). Fixed the tool (regex-escape + string-mask + mut-equiv markers), then closed every REAL gap the fixed tool found by STRENGTHENING tests.",
    key_inputs="testing.md T-03 (mutation on critical set); the 6 new hardening modules + 3 original targets; the check-mutation.mjs regex bug",
    output_summary="Fixed check-mutation.mjs (opRegex escape + maskNonCode + mut-equiv) + mutation-targets.json expanded to 9 modules + strengthened tests (decisionGate 75->100, auditLedger 83->100, recordLifecycle 67->100, meat 33->100, membership 67->100) + tests/terminology/membersForVersion.test.ts + 4 documented equivalent-mutant markers + docs/framework/GO_LIVE_GATES.md. Gates: tsc 0, E13 mutation PASSES all 9 targets, 50 tests pass, E14 122/122, demo 26.",
    gate_result="green",fidelity="live",depends_on="103",builds_on="every prior hardening module (now under mutation test); the E13 tool from framework v1.4 (bug found + fixed by dogfooding it)",
    ts_override="2026-08-23T20:30:00Z",
    review_note="The framework's own gate improved the framework: dogfooding E13 on the new modules exposed a zero-width-regex bug in check-mutation.mjs; fixing it then surfaced 5 real test gaps (all closed by strengthening tests, never deleting mutants) + 4 provably-equivalent mutants (documented). Every hardening-critical module now has PROVEN catch-power. Remaining HW5 breadth (contract/Inferno in CI, testcontainer concurrency, D4 load/soak, property/fuzz, chaos) needs live infra - named in GO_LIVE_GATES.md.")

# ---------- Iteration 21 / HW6 - policy-fidelity backlog register + HW6-2 (Phase 3 / PROGRAM close) ----------
add(iteration="21",wave="HW6",phase="build",agent_role="spine",agent_label="I21-HW6-backlog-register",workstream_domain="hardening/policy-fidelity",
    prompt_summary="[framework v1.5] HW6 (non-blocker close): produce the E8 living-risk register for the 9 remaining policy-fidelity items (honest status/owner) rather than forcing a build of non-blockers; land the one self-contained READY item (HW6-2 ICD-10 category rollup) genuinely wired into the existing risk-adjustment route.",
    key_inputs="HARDENING_PLAN.md HW6 (terminology residuals, min-necessary Part 2, consent-revocation propagation, survivorship tiebreak - MED/policy-fidelity, not blockers)",
    output_summary="docs/framework/HW6_BACKLOG_REGISTER.md (9 items, status+owner) + src/lib/finance/riskAdjustment/icdRollup.ts (icdCategory/rollupWithheldByCategory) wired into /api/risk-adjustment/hcc response + tests/finance/icdRollup.test.ts. Gates: tsc 0, 3 tests pass, E14 122/122 (reachable +1 WIRED), demo 26 pass.",
    gate_result="green",fidelity="live",depends_on="104",builds_on="HW-FIN risk-adjustment (the rollup extends the existing scrub surface)",
    ts_override="2026-08-23T20:50:00Z",
    review_note="PROGRAM CLOSE (I12-I21, 10 iterations, Phases 1-3). HW6 scoped honestly as non-blocker: the register (E8 discipline) schedules the content-gated items (NS-05 ceiling) and the bounded refinements; one ready item built + wired. Whole program: demo preserved at every step (golden changed only by additive seam entries), unwired-realness backlog burned down 134->122, provenance 105 rows E11-clean.")

# ===========================================================================
# WRITE CSV (pass 1: base columns) then compute the longitudinal chain
# ===========================================================================
with open(os.path.join(BASE,"PROMPT_MASTER_LOG.csv"),"w",newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLS, quoting=csv.QUOTE_ALL, extrasaction="ignore")
    w.writeheader()
    for r in R: w.writerow(r)
print("rows:", len(R))

# ---- Longitudinal chain: compute depends_on for BUILD iterations ----
# Planning-phase (iteration "P") rows carry EXPLICIT depends_on set at add() time; skip them here.
# Rule: probe depends on the PRIOR iteration's closer (spine of the build);
# build waves depend on their iteration's probe; closers depend on that iteration's build waves.
by_iter = {}
for r in R:
    by_iter.setdefault(r["iteration"], []).append(r)

# seed prev_iter_last with the planning finalizer (P13) so I0 chains back to the plan
p13 = next((r for r in R if r["agent_label"]=="P13-finalizer"), None)
prev_iter_last = p13["seq"] if p13 else None

for it in ["0","1","2","3","4","V","5","6","7","8A-i","8A-ii","8A-iii","9","10","11"]:
    rows = [r for r in R if r["iteration"]==it]
    if not rows: continue
    probe = next((r for r in rows if r["phase"]=="probe"), None)
    builds = [r for r in rows if r["phase"]=="build"]
    closers = [r for r in rows if r["phase"] in ("convergence","red-team","fix")]
    if probe and prev_iter_last and probe["depends_on"]=="":
        probe["depends_on"] = str(prev_iter_last)
    anchor = probe["seq"] if probe else (prev_iter_last or "")
    for b in builds:
        if b is not probe and b["depends_on"]=="":
            b["depends_on"] = str(anchor)
    build_seqs = ",".join(str(b["seq"]) for b in builds)
    for c in closers:
        if c["depends_on"]=="":
            c["depends_on"] = build_seqs if build_seqs else str(anchor)
    last = closers[-1] if closers else rows[-1]
    prev_iter_last = last["seq"]

# ---- cross-iteration builds_on notes (do NOT clobber rows that already have one) ----
cross = {
 "graph-projector+backends":"builds on iter1 outbox (event source)",
 "sde-disposition":"consumes graph/pipeline signals",
 "three-agents":"consumes SDE dispositions via iter3 runtime",
 "template+medications":"establishes template reused by all later domains",
 "labs+allergies":"fills the iter4 template","procedures":"fills the iter4 template",
 "careteam+goalstasks":"fills the template; extends iter2 careteam lens",
 "referrals+immunizations":"fills the template",
 "dead-letter-subsystem":"persists records the pipeline/EMPI/outbox previously dropped",
 "idempotency+session-secret":"guards iter2 SDE + iter3 agents against outbox republish",
 "empi-resolver":"replaces the iter1 identity stub",
 "iter6-foldins+panel":"reuses iter5 idempotency; fixes iter1 834 adapter",
 "behavioralHealth+part2":"closes F2 (Part 2 segmentation)",
 "iter7-convergence+panel":"advances F2; first composed prompt; E9 standing sweep",
 "survivorship+crossReference":"closes F3; uses DP-7 replay-rekey from iter2 graph",
 "external-empi-real":"makes the iter4 external-EMPI stubs real",
 "provider-identity-npi":"closes F5; resolves the iter6 deferred-I8A provider refs",
 "iter8ai-convergence+panel":"closes/advances F3+F5; identity/interoperability red-team lens",
 "terminology-validate+expand":"makes the I4 terminology stub real (validate/expand/version/UCUM)",
 "terminology-translate+classify":"adds $translate crosswalks + HCC/risk classification on the I4 seam",
 "terminology-pipeline-binding+currency":"binds the stage-4 semantic gate; reuses the dead-letter quarantine",
 "iter8aii-convergence+panel":"advances the terminology stub to real logic; terminology/semantic red-team lens",
 "governance-backend-lifecycle":"governs the terminology value-set versions (lifecycle+approval+audit+replay)",
 "governance-console-ui":"admin/UI over the governance backend; reuses admin-console patterns",
 "governance-bff-routes":"role-gated BFF over the governance backend; maker-checker at the boundary",
 "iter8aiii-convergence+panel":"collapses the console adapter to real delegation; closes the I8A block",
 "substrate-migration+bootstrap":"unifies the per-store pg adapters under one migration runner + bootstrap",
 "deploy-preflight+health":"makes the E1 seam postures enforceable at startup; readiness/liveness",
 "data-lifecycle+runbook":"adds retention/purge/right-to-delete preserving evidence-ledger immutability",
 "iter9-convergence+panel":"deployment fail-closed-at-startup; deployment/operability red-team lens",
 "conformance-matrix":"binds every claimed standard to real evidence or an honest residual",
 "capability-statement":"derives a FHIR CapabilityStatement from the real implemented surface",
 "certification-readiness":"per-standard readiness + residuals; no drift vs the matrix",
 "iter10-convergence+overclaim-panel":"capstone overclaim detection; final register rollup",
 "f5b-claims-integrity-carc":"closes F5-b + claims integrity + CARC member-liability",
 "three-new-domains-20of20":"completes C9 record model to 20/20 (USCDI problems/diagnostics/family)",
 "referral-goal-lifecycle-tiebreak":"closes referral loop-closure + goal status + survivorship tiebreak",
 "framework-R5-E12-v1.3":"adds the R5 cross-examiner + E12 claim-vs-evidence gate to the framework",
 "iter11-convergence+5persona-panel":"five-persona closeout incl R5; final buildable completion",
}
for r in R:
    if r["agent_label"] in cross:
        r["builds_on"] = cross[r["agent_label"]]

# ---- tracking + linkage ids: trace_id, step_id, timestamp ----
# DETERMINISTIC by design so regeneration is byte-identical (E11.1 diff stays green).
# - step_id : global monotonic step-in-sequence key (zero-padded), sortable, stable.
# - trace_id: unique, self-describing agent-invocation handle (encodes iter+wave+seq)
#             for cross-system linkage; depends_on references step_id/seq, so the two align.
# - ts      : ISO-8601. HISTORICAL rows carry a SYNTHETIC monotonic timestamp anchored to a
#             FIXED base (never now()) - it encodes ORDER, not wall-clock. From this point on,
#             capture each agent's REAL send-time into ts_override at invocation and it wins.
import re as _re
from datetime import datetime, timedelta
BASE_TS = datetime(2026,1,5,9,0,0)   # fixed synthetic anchor - do NOT use now() (keeps E11 diff stable)
TS_STEP = timedelta(minutes=7)
for r in R:
    s = int(r["seq"])
    r["step_id"]  = f"{s:04d}"
    it = _re.sub(r"[^A-Za-z0-9]+","-",str(r["iteration"])).strip("-")
    wv = _re.sub(r"[^A-Za-z0-9]+","-",str(r["wave"])).strip("-")
    r["trace_id"] = f"TRC-{it}-{wv}-{s:04d}"
    r["ts"] = r.get("ts_override") or (BASE_TS + TS_STEP*s).isoformat()+"Z"

# ===========================================================================
# WRITE CSV (pass 2: full columns incl. chain + tracking ids)
# ===========================================================================
COLS2 = ["seq","step_id","trace_id","ts","iteration","wave","phase","depends_on","builds_on",
         "agent_role","agent_label","workstream_domain","prompt_summary","key_inputs",
         "output_summary","gate_result","findings","fidelity","review_note"]
with open(os.path.join(BASE,"PROMPT_MASTER_LOG.csv"),"w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=COLS2,quoting=csv.QUOTE_ALL,extrasaction="ignore")
    w.writeheader()
    for r in R:
        w.writerow({c:r.get(c,"") for c in COLS2})
print("rewrote CSV with chain; cols:",len(COLS2),"rows:",len(R))

# ===========================================================================
# XLSX view (readable + analyzable): phase-colored, frozen header, auto-filter,
# plus a second sheet that is a compact agent roster index.
# ===========================================================================
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    wb=Workbook(); ws=wb.active; ws.title="Prompt Chain"
    hdr=Font(bold=True,color="FFFFFF",size=10,name="Arial"); hf=PatternFill("solid",fgColor="0B5C53")
    cell=Font(size=9,name="Arial"); wrap=Alignment(wrap_text=True,vertical="top")
    thin=Border(*[Side(style="thin",color="D7E3E0")]*4)
    widths={"seq":5,"step_id":7,"trace_id":22,"ts":22,"iteration":8,"wave":9,"phase":11,"depends_on":11,"builds_on":32,"agent_role":16,
            "agent_label":26,"workstream_domain":24,"prompt_summary":54,"key_inputs":20,"output_summary":34,
            "gate_result":12,"findings":11,"fidelity":9,"review_note":48}
    ws.append(COLS2)
    for i,c in enumerate(COLS2,1):
        cl=ws.cell(1,i); cl.font=hdr; cl.fill=hf; cl.border=thin; cl.alignment=wrap
        ws.column_dimensions[get_column_letter(i)].width=widths.get(c,16)
    # phase colors; planning phase gets its own tint; pending gets a warn tint
    fills={"red-team":"FBF6EA","convergence":"EEF4F3","fix":"FBEAEA","probe":"F2F7F6","plan":"EAF3FB"}
    for r in R:
        ws.append([r.get(c,"") for c in COLS2])
        rr=ws.max_row; ph=r["phase"]
        base = fills.get(ph)
        if r.get("fidelity")=="pending": base="FFF3D6"
        for i in range(1,len(COLS2)+1):
            c=ws.cell(rr,i); c.font=cell; c.border=thin; c.alignment=wrap
            if base: c.fill=PatternFill("solid",fgColor=base)
    ws.freeze_panes="A2"; ws.auto_filter.ref=f"A1:{get_column_letter(len(COLS2))}{ws.max_row}"

    # ---- Sheet 2: Agent roster index (one line per agent, quick "where is X") ----
    ws2=wb.create_sheet("Roster Index")
    r2cols=["step_id","trace_id","phase-group","agent_label","what it is / where its output lives"]
    ws2.append(r2cols)
    for i,c in enumerate(r2cols,1):
        cl=ws2.cell(1,i); cl.font=hdr; cl.fill=hf; cl.border=thin; cl.alignment=wrap
    ws2.column_dimensions["A"].width=8; ws2.column_dimensions["B"].width=22
    ws2.column_dimensions["C"].width=14; ws2.column_dimensions["D"].width=28; ws2.column_dimensions["E"].width=78
    group = lambda it: "PLANNING" if it=="P" else ("VERIFY" if it=="V" else f"BUILD I{it}")
    for r in R:
        note = r["output_summary"] or r["review_note"]
        ws2.append([r["step_id"], r["trace_id"], group(r["iteration"]), r["agent_label"], note])
        for i in range(1,6):
            c=ws2.cell(ws2.max_row,i); c.font=cell; c.border=thin; c.alignment=wrap
    ws2.freeze_panes="A2"

    wb.save(os.path.join(BASE,"PROMPT_MASTER_LOG.xlsx"))
    print("xlsx written (2 sheets)")
except Exception as e:
    print("xlsx skipped:",e)
