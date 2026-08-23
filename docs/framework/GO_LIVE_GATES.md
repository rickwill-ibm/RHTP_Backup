# Go-live gates (HW5 / I20) — the non-code gates the code cannot close

The hardening program closes the CODE blockers. These gates are PROCESS, not code:
they have long lead times, need external parties, and must be named now so they are
scheduled, not discovered at go-live. This is the honest NS-05 ceiling, enumerated.

## Named process gates (owner + lead time)

| Gate | What it is | Why code can't close it | Typical lead time |
|------|-----------|-------------------------|-------------------|
| **Third-party penetration test** | An external firm attacks the deployed system | Must be independent + against live infra | 4–8 weeks |
| **SOC 2 Type II** | Audited controls over a 3–12 month observation window | Requires an observation PERIOD + an auditor | 6–12 months |
| **HITRUST / ISO 27001** (if required) | Certified security framework | External certifying body | 6–12 months |
| **Tested DR drill** | An actual restore-from-backup exercise meeting RTO/RPO | Must be executed against real infra, not asserted | 2–4 weeks |
| **Threat model + PIA** | STRIDE threat model + Privacy Impact Assessment | Human-led risk analysis + privacy sign-off | 2–4 weeks |
| **FHIR conformance accreditation** | Inferno / Touchstone / IHE Connectathon | External test harness + certification | 4–12 weeks |
| **CMS-0057-F attestation** | Regulatory attestation for the API mandates | Legal/compliance sign-off | per CMS calendar |
| **Load / soak certification** | D4 load + soak run at production scale | Needs production-scale infra to be meaningful | 1–2 weeks once infra exists |

## Code-side readiness (what the program DID deliver so these can RUN the moment infra exists)
- Contract/conformance suites are wired (Newman CMS-0057-F; the Inferno/Touchstone hooks are named).
- The load/soak harness (D4/DP-5) is authored; it executes against real infra when provisioned.
- The DR path (backup + restore) has a runbook; the drill executes it.
- Tenant isolation, audit tamper-evidence, and the AI-decision invariant (Phases 1–2) are the
  controls SOC 2 / pen-test will assess — built and gated, ready to be attested.

## The rule
No iteration marks any of these "closed". HW5 NAMES them and wires the code side so each is a
scheduling + execution task, not a build task. The program's "production-ready" claim is scoped to
the code; these gates are the remaining, honestly-stated path to live.
