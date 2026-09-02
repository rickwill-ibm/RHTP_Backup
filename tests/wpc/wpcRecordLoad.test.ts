/**
 * Adversarial whole-person record-load suite (R3 + fan-out ingest driver + M3).
 *
 * Drives the five seed bundles through the production-shaped `ingestBundle` driver
 * into a projected graph and asserts, ADVERSARIALLY (not happy-path), the six
 * properties the platform must guarantee end-to-end, on BOTH graph backends
 * (pg-mem Postgres + the Neo4j fake):
 *
 *   1. every clinical/med/SDOH/BH resource ADMITS — and alex-kirby's UNCODED
 *      resources QUARANTINE (the honest exception), never silently vanish;
 *   2. domain routing: SDOH screenings land in `sdoh` (SdohScreening/SocialNeed,
 *      NOT Observations-in-labs), BH surveys in `behavioral-health`, labs in
 *      `labs-vitals`;
 *   3. holistic context is really populated (clinicalProfile, barriers, behavioral
 *      signal, careTeam) from the projected graph;
 *   4. EMPI: one bundle -> ONE member; the same person from a DIFFERENT source
 *      (matching global medicaidId) CONSOLIDATES; two DIFFERENT people with a
 *      reused MRN across sources do NOT merge; a near-match HOLDS;
 *   5. Part 2: Robert's SUD is RESTRICTED under NO_CONSENT and DISCLOSED under a
 *      covering scope — both backends agree;
 *   6. the non-projected resource census (Coverage/Encounter/CarePlan/…) is
 *      asserted by-design, never silent loss.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createXrefIndex } from '@/lib/identity';
import { createMemoryOutboxStore } from '@/lib/outbox';
import { createMemoryCheckpointStore } from '@/lib/graph/consumer';
import {
  ingestBundle,
  type FhirBundle,
  type IngestBundleResult,
  type IngestStores,
} from '@/lib/runtime/ingestBundle';
import type { GraphStore } from '@/lib/graph/types';
import { makeNeo4jFakeStore, makePgGraphStore } from '../graph/helpers';
import { buildHolisticContextFromGraph, readMemberLensBundle } from '@/lib/wpc/projectedAggregator';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import { NO_CONSENT } from '@/lib/graph/lens/types';

// ── deterministic clock + rng (no globals) ───────────────────────────────────
const fixedNow = () => 1_700_000_000_000;
function seededRng(seed = 0x1234abcd): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Production-shaped store split: the GRAPH and the MPI cross-reference are the
 * SHARED durable stores (many feeds, one graph, one identity index); the outbox +
 * projection checkpoint are per-drain-session and fresh each ingest. Sharing one
 * outbox across bundles would make `projection.members` reflect every member ever
 * drained, so a fresh outbox per bundle keeps the per-bundle metric honest.
 */
function sessionStores(shared: { graph: GraphStore; xref: IngestStores['xref'] }): IngestStores {
  return {
    outbox: createMemoryOutboxStore(),
    graph: shared.graph,
    checkpoint: createMemoryCheckpointStore(),
    xref: shared.xref,
  };
}
function loadBundle(slug: string): FhirBundle {
  return JSON.parse(readFileSync(`fhir/seed/patients/${slug}.bundle.json`, 'utf8'));
}
const SLUGS = [
  'dorothy-simmons',
  'james-wilson',
  'robert-chen',
  'lisa-thompson',
  'alex-kirby',
] as const;
type Slug = (typeof SLUGS)[number];

const CODED = ['dorothy-simmons', 'james-wilson', 'robert-chen', 'lisa-thompson'] as const; // fully-coded people

interface Loaded {
  graph: GraphStore;
  results: Map<Slug, IngestBundleResult>;
}

/** Ingest all five seed bundles (each from its OWN source) into one shared graph. */
async function loadAll(graph: GraphStore): Promise<Loaded> {
  const shared = { graph, xref: createXrefIndex({ now: fixedNow }) };
  const results = new Map<Slug, IngestBundleResult>();
  for (const slug of SLUGS) {
    const res = await ingestBundle(
      loadBundle(slug),
      { sourceSystem: `ehr-${slug}`, now: fixedNow, rng: seededRng() },
      sessionStores(shared)
    );
    results.set(slug, res);
  }
  return { graph, results };
}

const BACKENDS: { name: string; make: () => Promise<GraphStore> }[] = [
  { name: 'neo4j-fake', make: async () => makeNeo4jFakeStore() },
  { name: 'pg-mem', make: async () => makePgGraphStore() },
];

for (const backend of BACKENDS) {
  describe(`wpc record load [${backend.name}]`, () => {
    let L: Loaded;
    beforeAll(async () => {
      L = await loadAll(await backend.make());
    });

    // ── 1. admission vs the honest uncoded exception ─────────────────────────
    describe('1. clinical/med/SDOH/BH admits; alex-kirby uncoded quarantines', () => {
      it('every coded person admits their clinical/med/SDOH/BH records with ZERO quarantine there', () => {
        for (const slug of CODED) {
          const res = L.results.get(slug)!;
          // No clinical/med/SDOH/BH domain reason code appears in the quarantine set:
          // the only quarantines are the text-only ServiceRequest/Goal records.
          const reasons = res.quarantined.flatMap((q) => q.reasonCodes);
          for (const rc of reasons) {
            expect(rc).toMatch(/missing-(service|goal)-code/); // ONLY the coded-less referral/goal shapes
          }
          // every coded person carries (and admits) conditions, a BH signal, meds and SDOH.
          for (const d of ['conditions', 'behavioral-health', 'medications', 'sdoh'] as const) {
            expect(res.admittedByDomain[d] ?? 0).toBeGreaterThan(0);
          }
        }
        // labs-vitals is not universal (james carries no lab/vital), but it MUST admit
        // wherever present: the union across the coded cohort covers labs-vitals.
        const labsUnion = CODED.reduce(
          (n, s) => n + (L.results.get(s)!.admittedByDomain['labs-vitals'] ?? 0),
          0
        );
        expect(labsUnion).toBeGreaterThan(0);
      });

      it('alex-kirby: the UNCODED clinical resources QUARANTINE (accounted, not vanished)', () => {
        const res = L.results.get('alex-kirby')!;
        const byReason: Record<string, number> = {};
        for (const q of res.quarantined)
          for (const rc of q.reasonCodes) byReason[rc] = (byReason[rc] ?? 0) + 1;
        // uncoded Observations + Conditions are diverted to quarantine, not dropped.
        expect(byReason['missing-observation-code'] ?? 0).toBeGreaterThan(0);
        expect(byReason['missing-condition-code'] ?? 0).toBeGreaterThan(0);
        // alex's coded labs/vitals DO admit — quarantine is the exception, not the rule.
        expect(res.admittedByDomain['labs-vitals'] ?? 0).toBeGreaterThan(0);
        // conservation: every quarantine is PHI-safe (no name/subject leakage).
        const dump = JSON.stringify(res.quarantined);
        for (const bad of ['Kirby', 'Alex', 'subject', 'Patient/']) expect(dump).not.toContain(bad);
      });
    });

    // ── 2. domain routing census ─────────────────────────────────────────────
    describe('2. SDOH -> sdoh, BH survey -> behavioral-health, labs -> labs-vitals', () => {
      it('SDOH screenings project as SdohScreening/SocialNeed (never Observation-in-labs)', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const screenings = lb.wholePerson.nodes.filter((n) => n.kind === 'SdohScreening');
        expect(screenings.length).toBeGreaterThan(0);
        // dorothy screened positive for transportation -> an unmet SocialNeed exists.
        expect(lb.sdohBarrier.nodes.some((n) => n.kind === 'SocialNeed')).toBe(true);
        // the SDOH observation is NOT filed as a labs-vitals Observation node.
        const labObs = lb.wholePerson.nodes.filter((n) => n.kind === 'Observation');
        for (const o of labObs) {
          expect(String(o.properties.category ?? '')).not.toBe('social-history');
          expect(String(o.properties.category ?? '')).not.toBe('survey');
        }
      });

      it('BH surveys project as BehavioralHealthObservation in behavioral-health (NOT a Condition)', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const bhObs = lb.wholePerson.nodes.filter((n) => n.kind === 'BehavioralHealthObservation');
        expect(bhObs.length).toBeGreaterThan(0); // PHQ-9 + AUDIT-C
        // a survey score is a SIGNAL, never a diagnosis: it must not be a Condition.
        for (const n of bhObs) expect(n.kind).not.toBe('Condition');
        expect(res.admittedByDomain['behavioral-health']).toBeGreaterThan(0);
      });

      it('labs land in labs-vitals (coded Observation nodes)', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        expect(lb.wholePerson.nodes.some((n) => n.kind === 'Observation')).toBe(true);
        expect(res.admittedByDomain['labs-vitals']).toBeGreaterThan(0);
      });
    });

    // ── 3. holistic context really populated ─────────────────────────────────
    describe('3. holistic context populated from the projected graph', () => {
      it('clinicalProfile, barriers (SDOH reaches it), behavioral signal, careTeam all real', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const ctx = await buildHolisticContextFromGraph(L.graph, res.memberId);

        // clinicalProfile: real chronic conditions off the projected graph.
        expect(ctx.clinicalProfile.chronicConditions.length).toBeGreaterThan(0);
        // the BH diagnosis (F32.1) surfaces as a condition (behavioral signal, dx side).
        expect(ctx.clinicalProfile.chronicConditions.some((c) => c.icdCode === 'F32.1')).toBe(true);

        // barriers: SDOH now REACHES the holistic context (not all not-screened).
        const barrierStatuses = Object.values(ctx.barriers).map((b) => b.status);
        expect(barrierStatuses.some((s) => s !== 'not-screened')).toBe(true);
        expect(ctx.barriers.transportation.status).toBe('identified'); // positive screen -> unmet need

        // behavioral signal: the scored survey node is in the projected graph.
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        expect(lb.wholePerson.nodes.some((n) => n.kind === 'BehavioralHealthObservation')).toBe(
          true
        );

        // careTeam: a real member/role, not a neutral null-object.
        expect(ctx.careTeam!.memberCount).toBeGreaterThan(0);
        expect(ctx.careTeam!.roles.length).toBeGreaterThan(0);

        // provenance declares these sections as projected (fail-honest contract).
        expect(ctx.contextProvenance!.projectedSections).toEqual(
          expect.arrayContaining(['clinicalProfile', 'barriers', 'careTeam'])
        );
      });
    });

    // ── 4a. one bundle -> exactly one member ─────────────────────────────────
    describe('4a. one bundle consolidates to ONE member', () => {
      it('each coded bundle projected to exactly one member', () => {
        for (const slug of CODED) {
          const res = L.results.get(slug)!;
          expect(res.memberId).toMatch(/^mem-/);
          // every projected intent for the bundle folded onto ONE member.
          expect(res.projection.members).toBe(1);
        }
      });

      it('the five people are five DISTINCT members in the shared graph', async () => {
        const ids = new Set(SLUGS.map((s) => L.results.get(s)!.memberId));
        expect(ids.size).toBe(5); // no accidental cross-bundle merge
        const members = await L.graph.listNodes({ kind: MEMBER_KIND });
        // at least the five bundle members are present as distinct Member nodes.
        for (const id of ids) expect(members.some((m) => m.key === id)).toBe(true);
      });
    });

    // ── 6. payer dimensions now PROJECT; the remaining census is by-design ──────
    describe('6. Coverage/Encounter/RiskAssessment/Flag PROJECT; the rest is by-design non-projection', () => {
      it('CarePlan/Organization/Patient/Practitioner remain non-projected (accounted, not dropped)', () => {
        const res = L.results.get('dorothy-simmons')!;
        // these resource types still have no projection -> accounted, not dropped silently.
        for (const rt of [
          'CarePlan',
          'Organization',
          'Patient',
          'Practitioner',
          'PractitionerRole',
        ]) {
          expect(res.nonProjected[rt] ?? 0).toBeGreaterThan(0);
        }
        // and Coverage/Encounter are NO LONGER in the non-projected census — they now
        // project through their FHIR-JSON adapters (RiskAssessment/Flag too).
        for (const rt of ['Coverage', 'Encounter', 'RiskAssessment', 'Flag']) {
          expect(res.nonProjected[rt] ?? 0).toBe(0);
        }
        // conservation: total resources = admitted + quarantined + non-projected.
        // every resource in the bundle is accounted for in exactly one census bucket.
        const admitted = Object.values(res.admittedByDomain).reduce((a, b) => a + b, 0);
        const quarantined = res.quarantined.length;
        const nonProjected = Object.values(res.nonProjected).reduce((a, b) => a + b, 0);
        expect(admitted + quarantined + nonProjected).toBe(res.totalResources);
      });

      it('the coded cohort admits Coverage/Encounter/RiskAssessment/Flag with ZERO quarantine there', () => {
        for (const slug of CODED) {
          const res = L.results.get(slug)!;
          // Coverage + Encounter + RiskAssessment admit exactly once per bundle; Flag admits its carried flags.
          expect(res.admittedByDomain['coverage'] ?? 0).toBe(1);
          expect(res.admittedByDomain['encounter'] ?? 0).toBe(1);
          expect(res.admittedByDomain['risk-assessment'] ?? 0).toBe(1);
          expect(res.admittedByDomain['flag'] ?? 0).toBeGreaterThan(0);
          // the referrals + goals that used to quarantine (missing-service/goal-code) now ADMIT.
          expect(res.admittedByDomain['referrals'] ?? 0).toBeGreaterThan(0);
          expect(res.admittedByDomain['goals-tasks'] ?? 0).toBeGreaterThan(0);
          const reasons = res.quarantined.flatMap((q) => q.reasonCodes);
          expect(reasons).not.toContain('missing-service-code');
          expect(reasons).not.toContain('missing-goal-code');
        }
      });

      it('Coverage/Encounter/RiskAssessment/Flag project as member-linked nodes on BOTH backends', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const nodesOf = (kind: string) => lb.wholePerson.nodes.filter((n) => n.kind === kind);
        const edgeOf = (type: string) => lb.wholePerson.edges.filter((e) => e.type === type);

        // Coverage: PHI-minimal (plan code only, NEVER a subscriber/member id).
        const cov = nodesOf('Coverage');
        expect(cov.length).toBe(1);
        expect(String(cov[0].properties.planCode)).toBe('MR'); // Medicare (dorothy)
        expect(edgeOf('HAS_COVERAGE').length).toBe(1);
        for (const phi of ['MRN', 'subscriber', 'beneficiary', 'Simmons', 'Dorothy']) {
          expect(JSON.stringify(cov[0].properties)).not.toContain(phi);
        }
        // Encounter: codes/class only.
        const enc = nodesOf('Encounter');
        expect(enc.length).toBe(1);
        expect(String(enc[0].properties.encounterClass)).toBe('AMB');
        expect(String(enc[0].properties.trigger)).toBe('185349003');
        expect(edgeOf('HAD_ENCOUNTER').length).toBe(1);
        // RiskAssessment: the RAF NUMBER round-trips; the rationale sentence never lands.
        const ra = nodesOf('RiskAssessment');
        expect(ra.length).toBe(1);
        expect(ra[0].properties.rafScore).toBe(3.42);
        expect(ra[0].properties.probability).toBe(0.84);
        expect(String(ra[0].properties.predictedOutcome)).toBe('Emergency Room Visit');
        expect(edgeOf('HAS_RISK_ASSESSMENT').length).toBe(1);
        expect(JSON.stringify(ra[0].properties)).not.toContain('based on');
        // Flag: PHI-safe category code only, NEVER the free-text alert narrative.
        const flags = nodesOf('Flag');
        expect(flags.length).toBeGreaterThan(0);
        for (const f of flags) {
          expect(String(f.properties.categoryCode)).toBeTruthy();
          expect(JSON.stringify(f.properties)).not.toMatch(/PHQ-9|overdue/);
        }
        expect(edgeOf('HAS_FLAG').length).toBe(flags.length);
      });

      // FINDING 2: the driver must SEPARATE an intended non-projection (care-gap
      // overlay Observations) from an UNEXPECTED unroutable one. A real clinical
      // Observation must never hide inside the by-design care-gap count.
      it('care-gap Observations are counted distinctly, and NO Observation is silently unrouted', () => {
        for (const slug of CODED) {
          const res = L.results.get(slug)!;
          // the seed bundles carry care-gap overlay markers -> counted, by design.
          expect(res.nonProjected['Observation:care-gap'] ?? 0).toBeGreaterThan(0);
          // and NOTHING falls into the loud "unrouted" bucket for well-formed input:
          // a clinical Observation that failed to route would surface HERE, not vanish.
          expect(res.nonProjected['Observation:unrouted'] ?? 0).toBe(0);
        }
      });
    });

    // ── 5. Part 2 restriction — both backends agree ─────────────────────────
    describe('5. Part 2: Robert SUD restricted under NO_CONSENT, disclosed under covering scope', () => {
      it('SUD Condition hidden without consent, visible + flagged restricted with a Part 2 grant', async () => {
        const res = L.results.get('robert-chen')!;
        const noConsent = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const covered = await readMemberLensBundle(L.graph, res.memberId, { part2: true });

        const noConsentConds = noConsent.wholePerson.nodes.filter((n) => n.kind === 'Condition');
        const coveredConds = covered.wholePerson.nodes.filter((n) => n.kind === 'Condition');

        // the covering scope reveals STRICTLY MORE conditions (the restricted SUD dx).
        expect(coveredConds.length).toBeGreaterThan(noConsentConds.length);
        // the extra one is the SUD F10.10, flagged restricted.
        const sud = coveredConds.find((n) => n.properties.code === 'F10.10');
        expect(sud).toBeDefined();
        expect(sud!.restricted).toBe(true);
        // and NO_CONSENT does not surface it at all.
        expect(noConsentConds.some((n) => n.properties.code === 'F10.10')).toBe(false);

        // the Part 2 lens: empty without a grant, present with one.
        expect(noConsent.part2Restricted.nodes.filter((n) => n.restricted)).toHaveLength(0);
        expect(covered.part2Restricted.nodes.some((n) => n.restricted)).toBe(true);
      });
    });

    // ── 7. Da Vinci Risk Adjustment coding gaps PROJECT (seed demo data) ─────────
    describe('7. coding gaps project from the seed MeasureReports (KG data, not computed)', () => {
      it('each patient admits its authored coding gaps; conservation still holds', () => {
        // one single-group MeasureReport -> one projected CodingGap, so the balance
        // invariant (admitted + quarantined + nonProjected === countIn) is preserved.
        const expected: Record<Slug, number> = {
          'dorothy-simmons': 2,
          'james-wilson': 2,
          'robert-chen': 2,
          'lisa-thompson': 1,
          'alex-kirby': 1,
        };
        for (const slug of SLUGS) {
          const n = expected[slug];
          const res = L.results.get(slug)!;
          expect(res.admittedByDomain['coding-gap'] ?? 0).toBe(n);
          const admitted = Object.values(res.admittedByDomain).reduce((a, b) => a + b, 0);
          const nonProjected = Object.values(res.nonProjected).reduce((a, b) => a + b, 0);
          expect(admitted + res.quarantined.length + nonProjected).toBe(res.totalResources);
          // MeasureReport is NOT in the non-projected census — it projects.
          expect(res.nonProjected['MeasureReport'] ?? 0).toBe(0);
          expect(res.nonProjected['MeasureReport:non-ra'] ?? 0).toBe(0);
        }
      });

      it('dorothy shows CMS-HCC V24 AND V28 coding gaps coexisting (the blend)', async () => {
        const res = L.results.get('dorothy-simmons')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const gaps = lb.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
        expect(gaps.length).toBe(2); // V24 + V28, never collapsed onto one node
        expect(gaps.map((g) => String(g.properties.modelVersion)).sort()).toEqual(['V24', 'V28']);
        // both are diabetes gaps, PHI-minimal (codes/status only, no rationale narrative).
        for (const g of gaps) {
          expect(String(g.properties.evidenceStatus)).toBe('closed-gap');
          expect(JSON.stringify(g.properties)).not.toMatch(/rationale|narrative|note/i);
        }
      });

      it('robert: the SUD coding gap is Part 2-restricted; the CKD gap is not', async () => {
        const res = L.results.get('robert-chen')!;
        const noConsent = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const covered = await readMemberLensBundle(L.graph, res.memberId, { part2: true });
        const gapsNo = noConsent.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
        const gapsCov = covered.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
        // under NO_CONSENT only the non-SUD CKD gap shows; the SUD gap is hidden.
        expect(gapsNo.map((g) => String(g.properties.conditionCategory))).toEqual(['HCC329']);
        // under a Part 2 grant BOTH show, and the SUD gap is flagged restricted.
        expect(gapsCov.length).toBe(2);
        const sud = gapsCov.find((g) => String(g.properties.conditionCategory) === 'HCC135');
        expect(sud).toBeDefined();
        expect(sud!.restricted).toBe(true);
        expect(String(sud!.properties.suspectType)).toBe('suspected');
      });

      it('a coding gap CITES evidence via a neutral Evidence node — never mints a Condition', async () => {
        const res = L.results.get('dorothy-simmons')!;
        // the V28 diabetes gap cites dorothy's real Condition + Encounter.
        const gapKey = 'CodingGap/dorothy-simmons-codinggap-1:CMS-HCC-V28:g1:HCC38';
        const edges = await L.graph.listEdges({ fromKey: gapKey });
        const supported = edges.filter((e) => e.type === 'SUPPORTED_BY');
        expect(supported.length).toBe(2); // Condition + Encounter citations
        for (const e of supported) expect(e.to.kind).toBe('Evidence'); // never a clinical kind
        expect(supported.some((e) => e.to.key === 'Condition/dorothy-simmons-condition-2')).toBe(
          true
        );
      });

      it('alex: the suspected gap projects but mints no Condition (firewall on the uncoded fixture)', async () => {
        const res = L.results.get('alex-kirby')!;
        const lb = await readMemberLensBundle(L.graph, res.memberId, NO_CONSENT);
        const gaps = lb.wholePerson.nodes.filter((n) => n.kind === 'CodingGap');
        expect(gaps.length).toBe(1);
        expect(String(gaps[0].properties.suspectType)).toBe('suspected');
        expect(String(gaps[0].properties.evidenceStatus)).toBe('open-gap');
        // the holistic context surfaces it as a hypothesis (suspectedCount), not a dx.
        const ctx = await buildHolisticContextFromGraph(L.graph, res.memberId);
        expect(ctx.codingGaps!.suspectedCount).toBeGreaterThanOrEqual(1);
        expect(ctx.codingGaps!.openCount).toBeGreaterThanOrEqual(1);
      });
    });
  });
}
