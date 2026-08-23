/**
 * ACE Use-Case Corpus — coverage registry (Cycle 3, Iteration 0).
 *
 * Turns the 70-case SME breadth instrument
 * (`/home/claude/coalition/inputs/use_case_corpus.md`) into a LIVING regression
 * asset: every UC is accounted for exactly once here.
 *
 *  - status: 'runnable'  → its acceptance check is exercisable against real
 *    engineering that exists TODAY (identity/match, policy engine, network
 *    adequacy, golden-thread state machine + evidence ledger, consent + authz,
 *    care-plan generator/validator, dataMode/backbone registry). The executable
 *    scenario lives in the named `file` under tests/scenario/ and drives the
 *    real engine(s) end-to-end. This registry asserts the family file exists.
 *  - status: 'pending'   → the acceptance check needs a capability not built
 *    yet (graph store, SDE runtime, agent runtime, live backbone, pipelines,
 *    read-time record projection). Registered as `it.skip` with a one-line
 *    reason NAMING the missing capability, so nothing silently vanishes.
 *
 * This file never lets a case go unaccounted: the meta-tests assert the manifest
 * covers UC-01..UC-70 with no gaps, no dupes, and that every runnable entry
 * points at a real family file.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

type Status = 'runnable' | 'pending';
type Family =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O';

interface CoverageEntry {
  uc: number;
  family: Family;
  title: string;
  status: Status;
  /** runnable: the family scenario file that drives the engine(s). */
  file?: string;
  /** pending: the missing capability the acceptance check requires. */
  missing?: string;
}

const SCENARIO_DIR = join(process.cwd(), 'tests', 'scenario');

/** The full 70-case ledger. Order = UC number. */
const COVERAGE: CoverageEntry[] = [
  // ── A. Identity resolution ────────────────────────────────────────────────
  { uc: 1, family: 'A', title: 'Cross-source anchor at enrollment', status: 'runnable', file: 'corpus_A_identity.test.ts' },
  { uc: 2, family: 'A', title: 'Possible-match steward resolution then merge', status: 'pending', missing: 'projector rekey across graph + SDE state + care plans after identity.member.merged (graph store + SDE runtime)' },
  { uc: 3, family: 'A', title: 'Wrong merge unmerged (twins)', status: 'runnable', file: 'corpus_A_identity.test.ts' },
  { uc: 4, family: 'A', title: 'Survivorship field conflict', status: 'pending', missing: 'source-ranked survivorship / golden-record reprojection engine (config-driven field survivorship not implemented)' },
  { uc: 5, family: 'A', title: 'Provider identity resolution', status: 'pending', missing: 'NPI-anchored provider identity resolution feeding the G7 shared provider model (match engine is member-only)' },
  { uc: 6, family: 'A', title: 'Re-entry identity continuity', status: 'runnable', file: 'corpus_A_identity.test.ts' },

  // ── B. Record assembly across C9 domains ──────────────────────────────────
  { uc: 7, family: 'B', title: 'Dual-eligible elder assembly', status: 'pending', missing: 'record-assembly + T1/T3 tier registry across C9 domains (record store)' },
  { uc: 8, family: 'B', title: 'CCD tier honesty', status: 'pending', missing: 'CCD/document ingestion with per-section tier extraction (pipeline + record store)' },
  { uc: 9, family: 'B', title: 'HMIS flat file for a homeless member', status: 'pending', missing: 'flat-file ingestion + quarantine pipeline + SDOHCC projection (pipeline runtime)' },
  { uc: 10, family: 'B', title: 'ADT within the latency budget', status: 'pending', missing: 'HL7v2 stream lane with receipt-to-signal latency budget (stream runtime)' },
  { uc: 11, family: 'B', title: 'Member-reported data lands with provenance', status: 'pending', missing: 'PGD stream + provenance-preserving projection (record store)' },
  { uc: 12, family: 'B', title: 'Claims-shadow honesty in the read API', status: 'pending', missing: 'C1 person-context read with per-section tier labels (read API + record tier registry)' },

  // ── C. Consent and 42 CFR Part 2 ──────────────────────────────────────────
  { uc: 13, family: 'C', title: 'Part 2 opt-in absent', status: 'pending', missing: 'segmentation-at-transform: envelope-only projector drop of SUD events (pipeline + projector runtime)' },
  { uc: 14, family: 'C', title: 'Consent revoked mid-journey', status: 'pending', missing: 'consent-event propagation into SDE touchpoint re-evaluation + scoped reads (SDE runtime)' },
  { uc: 15, family: 'C', title: 'Segmented data legitimately requested', status: 'pending', missing: 'read-time per-requestor segment-consent evaluation (record projection; store is binary member-level opt-out only)' },
  { uc: 16, family: 'C', title: 'Provider-access opt-out', status: 'runnable', file: 'corpus_C_consent.test.ts' },
  { uc: 17, family: 'C', title: 'Re-disclosure blocked in reporting', status: 'pending', missing: 'reporting pipeline with automated Part 2 label-scan exclusion (reporting runtime)' },

  // ── D. Graph context and keystone-barrier reasoning ───────────────────────
  { uc: 18, family: 'D', title: 'Keystone barrier legibility', status: 'pending', missing: 'whole-person graph store + keystone lens queries (graph store)' },
  { uc: 19, family: 'D', title: 'Temporal journey reconstruction', status: 'pending', missing: 'dated-edge graph + around-event temporal query (graph store)' },
  { uc: 20, family: 'D', title: 'Graph rebuild after merge', status: 'pending', missing: 'graph projector rebuild-from-replay (graph store + event replay)' },
  { uc: 21, family: 'D', title: 'Hypothesis edge governance', status: 'pending', missing: 'agent-asserted hypothesis edges + HITL confirmation in graph (graph store + agent runtime)' },

  // ── E. Signal disposition ─────────────────────────────────────────────────
  { uc: 22, family: 'E', title: 'Coordinated bundle for a BH-primary member', status: 'pending', missing: 'G2 signal-disposition engine (SDE runtime — no disposition lib exists)' },
  { uc: 23, family: 'E', title: 'Fatigue suppression', status: 'pending', missing: 'SDE frequency-cap policy-as-data suppression (SDE runtime)' },
  { uc: 24, family: 'E', title: 'Conflicting signals resolved by priority', status: 'pending', missing: 'SDE priority scoring + coordination-window timers (SDE runtime)' },
  { uc: 25, family: 'E', title: 'Disposition policy tuned without deploy', status: 'pending', missing: 'versioned SDE disposition-policy config applied per batch (SDE runtime)' },
  { uc: 26, family: 'E', title: 'Out-of-order redelivery handled', status: 'pending', missing: 'partitioned stream consumers + eventId dedupe (stream runtime)' },

  // ── F. Care planning ──────────────────────────────────────────────────────
  { uc: 27, family: 'F', title: 'Contraindication blocks an intervention', status: 'pending', missing: 'coded allergy/medication input to the care-plan generator — ComprehensivePlanInput carries none (F1); DP-4 P2 gating unimplementable' },
  { uc: 28, family: 'F', title: 'Polypharmacy in a dual-eligible elder', status: 'runnable', file: 'corpus_F_careplanning.test.ts' },
  { uc: 29, family: 'F', title: 'Pregnancy plan with barriers addressed', status: 'runnable', file: 'corpus_F_careplanning.test.ts' },
  { uc: 30, family: 'F', title: 'Caregiver-involved pediatric plan', status: 'pending', missing: 'RelatedPerson/Task caregiver-performer assignment + link-removal rerouting (care-plan input has no RelatedPerson/Task model)' },
  { uc: 31, family: 'F', title: 'Data-limitation honesty flag', status: 'runnable', file: 'corpus_F_careplanning.test.ts' },

  // ── G. Referrals and network adequacy ─────────────────────────────────────
  { uc: 32, family: 'G', title: 'Specialist desert with telehealth fallback', status: 'runnable', file: 'corpus_G_referrals_adequacy.test.ts' },
  { uc: 33, family: 'G', title: 'Closed-loop referral failure escalates', status: 'pending', missing: 'referral state machine + stall event → SDE signal → HITL queue (referral runtime + SDE)' },
  { uc: 34, family: 'G', title: 'Remediation booking boundary (F2)', status: 'pending', missing: 'closed-loop platform integration + tracked human-coordinator task (referral platform + task runtime)' },
  { uc: 35, family: 'G', title: 'Provider-context join in one call', status: 'pending', missing: 'C1 provider-context read endpoint joining gap + adequacy + PA posture (read API)' },
  { uc: 36, family: 'G', title: 'Language-concordant referral for an LEP member', status: 'pending', missing: 'provider-directory language-concordance data — Provider model carries no language field' },
  { uc: 37, family: 'G', title: 'CBO housing referral closes the loop', status: 'pending', missing: 'closed-loop webhook → sdoh.barrier.resolved → graph edge close + SDE recompute (graph store + SDE)' },

  // ── H. Prior authorization and gold carding ───────────────────────────────
  { uc: 38, family: 'H', title: 'Standard PA through the golden thread', status: 'runnable', file: 'corpus_H_priorauth.test.ts' },
  { uc: 39, family: 'H', title: 'Gold card earned from real feeds', status: 'runnable', file: 'corpus_H_priorauth.test.ts' },
  { uc: 40, family: 'H', title: 'Denial then successful appeal', status: 'runnable', file: 'corpus_H_priorauth.test.ts' },
  { uc: 41, family: 'H', title: 'Agent-driven stage-3 PA', status: 'pending', missing: 'PA/documentation agent driving the flow through the work queue (agent runtime)' },

  // ── I. Golden thread financial reconciliation ─────────────────────────────
  { uc: 42, family: 'I', title: 'Intent-to-payment chain complete', status: 'pending', missing: 'cross-stage financial ledger (care-plan→auth→encounter→claim→payment) reconstruction (record store; evidence ledger covers PA stages only)' },
  { uc: 43, family: 'I', title: 'Payment contradicts authorization', status: 'pending', missing: '835 remittance reconciliation engine flagging approved-then-denied discrepancies (reconciliation runtime)' },
  { uc: 44, family: 'I', title: 'Appeal outcome re-reconciled', status: 'runnable', file: 'corpus_I_financial.test.ts' },
  { uc: 45, family: 'I', title: 'Duplicate claim detection', status: 'pending', missing: 'claims pipeline idempotency-key dedupe + 837 resubmission handling (claims pipeline)' },
  { uc: 46, family: 'I', title: 'Outcome attribution evidence', status: 'pending', missing: 'graph temporality + ledger milestone assembly (graph store + record ledger)' },

  // ── J. Agents and HITL ────────────────────────────────────────────────────
  { uc: 47, family: 'J', title: 'Outreach agent proposes, human disposes', status: 'pending', missing: 'outreach agent drafting into + executing from the work queue (agent runtime)' },
  { uc: 48, family: 'J', title: 'HITL escalation ladder', status: 'pending', missing: 'agent-runtime SLA escalation up the care-team hierarchy with parked terminal state (agent runtime)' },
  { uc: 49, family: 'J', title: 'Autonomy promotion by configuration', status: 'pending', missing: 'per-deployment autonomy-dial manifest gating agent action classes (agent runtime)' },
  { uc: 50, family: 'J', title: 'PHI-safe model calls', status: 'pending', missing: 'captured model-call payload harness for the assertion (agent narration runtime)' },
  { uc: 51, family: 'J', title: 'Graceful degradation without the LLM', status: 'runnable', file: 'corpus_J_agents_hitl.test.ts' },

  // ── K. Dashboards and measures ────────────────────────────────────────────
  { uc: 52, family: 'K', title: 'Gap derivation as a named projector (F1)', status: 'pending', missing: 'measure/gap projector emitting care-gap events, distinct from the SDE (measure-projector runtime — F1)' },
  { uc: 53, family: 'K', title: 'Gap closure to dashboard within budget', status: 'pending', missing: 'metric projections → shared view-models with a read budget (view-model runtime)' },
  { uc: 54, family: 'K', title: 'QARR-class report generated (F3)', status: 'pending', missing: 'report generation from shared dashboard view-models (reporting runtime — F3)' },
  { uc: 55, family: 'K', title: 'County drill-down for a rural program officer', status: 'pending', missing: 'geospatial choropleth off shared view-models + axe-core render checks (view-model runtime + UI)' },

  // ── L. Operational: pipelines, replay, surge ──────────────────────────────
  { uc: 56, family: 'L', title: 'Quarantine and remediation', status: 'pending', missing: '837 envelope-validation quarantine + remediation + TTL alarm (pipeline runtime)' },
  { uc: 57, family: 'L', title: 'Reconciliation gate blocks a bad load', status: 'pending', missing: 'batch reconciliation gate + replay-from-landing-zone (pipeline runtime)' },
  { uc: 58, family: 'L', title: 'DLQ replay after a poison event', status: 'pending', missing: 'DLQ with mirrored keying + idempotent projector replay (stream runtime)' },
  { uc: 59, family: 'L', title: 'Annual enrollment surge', status: 'pending', missing: 'batch+stream traffic-class budgets under load (k6 load harness + runtime)' },
  { uc: 60, family: 'L', title: 'Projector store rebuilt from offset zero', status: 'pending', missing: 'full-topic replay projector rebuild + lens verification (projector store + event log)' },

  // ── M. Privacy and security ───────────────────────────────────────────────
  { uc: 61, family: 'M', title: 'Purpose-scoped projection', status: 'pending', missing: 'server-side section-level purpose projection (read API; authz guard is record-level allow/deny only)' },
  { uc: 62, family: 'M', title: 'Full access-trail reconstruction', status: 'pending', missing: 'queryable access-trail ledger across BFF + agents + reports (audit store + query)' },
  { uc: 63, family: 'M', title: 'BFF invariant holds', status: 'runnable', file: 'corpus_M_privacy_security.test.ts' },
  { uc: 64, family: 'M', title: 'Part 2 emergency access', status: 'pending', missing: 'time-boxed break-glass read-time evaluation with dedicated audit class (read API break-glass runtime)' },

  // ── N. Multi-member household and pediatric-adjacent ──────────────────────
  { uc: 65, family: 'N', title: 'Household keystone resolved once', status: 'pending', missing: 'household links in the graph relating one barrier across members (graph store)' },
  { uc: 66, family: 'N', title: 'Caregiver-reported screening', status: 'pending', missing: 'record provenance (caregiver-reported) + RelatedPerson link on person-context (record store)' },
  { uc: 67, family: 'N', title: 'Adolescent confidential services shielded', status: 'pending', missing: 'read-time segmentation across three requestor contexts (record projection)' },
  { uc: 68, family: 'N', title: 'Newborn onto the household record', status: 'runnable', file: 'corpus_N_household_pediatric.test.ts' },

  // ── O. Rural-specific barriers ────────────────────────────────────────────
  { uc: 69, family: 'O', title: 'Winter distance barrier reshapes the plan', status: 'pending', missing: 'SDE disposition delay + adequacy substitution + NEMT arrangement composite (SDE runtime)' },
  { uc: 70, family: 'O', title: 'Broadband-poor engagement path', status: 'pending', missing: 'SDE channel-preference fallback ladder as policy-as-data with audited attempts (SDE runtime)' },
];

const RUNNABLE = COVERAGE.filter((c) => c.status === 'runnable');
const PENDING = COVERAGE.filter((c) => c.status === 'pending');

describe('Corpus coverage registry — every one of the 70 cases is accounted for', () => {
  it('covers exactly UC-01..UC-70 with no gaps and no duplicates', () => {
    const ids = COVERAGE.map((c) => c.uc).sort((a, b) => a - b);
    expect(ids.length).toBe(70);
    expect(new Set(ids).size).toBe(70);
    expect(ids[0]).toBe(1);
    expect(ids[69]).toBe(70);
    for (let n = 1; n <= 70; n += 1) expect(ids).toContain(n);
  });

  it('partitions cleanly into runnable-now vs pending (sum = 70)', () => {
    expect(RUNNABLE.length + PENDING.length).toBe(70);
    // Snapshot of the Cycle-3 disposition — a change here is a deliberate coverage move.
    expect(RUNNABLE.length).toBe(15);
    expect(PENDING.length).toBe(55);
  });

  it('every runnable entry names a family scenario file that exists on disk', () => {
    for (const entry of RUNNABLE) {
      expect(entry.file, `UC-${entry.uc} must name a file`).toBeTruthy();
      expect(
        existsSync(join(SCENARIO_DIR, entry.file as string)),
        `UC-${entry.uc}: expected ${entry.file} to exist`
      ).toBe(true);
    }
  });

  it('every pending entry names the missing capability (no silent gaps)', () => {
    for (const entry of PENDING) {
      expect(entry.missing, `UC-${entry.uc} must name a missing capability`).toBeTruthy();
      expect((entry.missing as string).length).toBeGreaterThan(15);
    }
  });
});

// Per-case ledger: runnable → a passing marker (driven end-to-end in its family
// file); pending → an explicit it.skip whose title names the missing capability.
describe('Corpus coverage — per-case ledger (UC-01..UC-70)', () => {
  for (const entry of COVERAGE) {
    const label = `UC-${String(entry.uc).padStart(2, '0')} [${entry.family}] ${entry.title}`;
    if (entry.status === 'runnable') {
      it(`${label} — runnable-now (see ${entry.file})`, () => {
        expect(existsSync(join(SCENARIO_DIR, entry.file as string))).toBe(true);
      });
    } else {
      it.skip(`${label} — PENDING: ${entry.missing}`, () => {
        /* intentionally deferred until the named capability exists */
      });
    }
  }
});
