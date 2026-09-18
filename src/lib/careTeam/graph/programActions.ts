// careTeam/graph/programActions.ts — Program-level next best actions.
// Turns Social Program Outcome analytics into graph-evidenced, keystone-prioritized
// NBAs that each DRIVE A SET of actions (citizen referrals + an ops decision).
// Evidence prioritization ranks candidates; low/no-evidence candidates are SUPPRESSED.

import { getAllPatients, getVisiblePatients } from '@/lib/patientRegistry';
import { getFhirMockMode } from '@/lib/services/fhirClient';
import { citizenNeeds, type ResourceCategory } from './resources';

export interface ProgramCohortMember {
  patientId: string;
  name: string;
  category: ResourceCategory;
  label: string;
  keystone: boolean;
  blockedGaps: string[];
  cypher: string;
}

export interface ProgramNBA {
  id: string;
  type: 'expand' | 'scale' | 'reengage';
  program: string;
  title: string;
  whyNow: string;
  headline: string; // graph "Unblocks N care gaps"
  unblockedGaps: number;
  dollars?: string;
  cohort: ProgramCohortMember[];
  owner: string;
  agent: string;
  confidence: 'High' | 'Medium';
  evidence: string[];
  actions: string[];
  cypher: string;
}

export interface SuppressedNBA {
  title: string;
  reason: string;
}
export interface ProgramNBAResult {
  nbas: ProgramNBA[];
  suppressed: SuppressedNBA[];
}

export interface SocialProgram {
  program: string;
  domain: string;
  enrolled: number;
  completed: number;
  completionRate: string;
  avgDaysToEnroll: number;
  costImpact: string;
  outcome: string;
}

const PROGRAM_CATEGORIES: Record<string, ResourceCategory[]> = {
  'SNAP Enrollment': ['Food', 'Financial'],
  'Housing Navigation': ['Housing'],
  'LIHEAP Utilities': ['Financial'],
  'BH Engagement (12-week)': ['Behavioral Health'],
  'CHW Home Visit Program': ['Social Isolation'],
};

const SDOH_PER_EPISODE = 5300;

function cohortFor(categories: ResourceCategory[], keystoneOnly = false): ProgramCohortMember[] {
  const out: ProgramCohortMember[] = [];
  for (const p of getVisiblePatients(getFhirMockMode())) {
    for (const n of citizenNeeds(p.platformId)) {
      if (!categories.includes(n.category)) continue;
      if (keystoneOnly && !n.keystone) continue;
      out.push({
        patientId: p.platformId,
        name: p.name,
        category: n.category,
        label: n.label,
        keystone: !!n.keystone,
        blockedGaps: n.blockedGaps ?? [],
        cypher: n.cypher,
      });
    }
  }
  return out;
}

function distinctGaps(cohort: ProgramCohortMember[]): number {
  return new Set(cohort.flatMap((c) => c.blockedGaps)).size;
}

function dedupePatients(cohort: ProgramCohortMember[]): ProgramCohortMember[] {
  const seen = new Set<string>();
  return cohort.filter((c) => (seen.has(c.patientId) ? false : seen.add(c.patientId)));
}

function parseMonthly(costImpact: string): number {
  const m = costImpact.match(/\$([\d,]+)\/mo/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

export function buildProgramNBAs(programs: SocialProgram[]): ProgramNBAResult {
  const candidates: ProgramNBA[] = [];
  const suppressed: SuppressedNBA[] = [];

  // ── Expand — proven program (100% completion) with monetary benefit ──
  for (const pr of programs) {
    const cats = PROGRAM_CATEGORIES[pr.program] ?? [];
    const monthly = parseMonthly(pr.costImpact);
    if (pr.completionRate === '100%' && monthly > 0 && cats.length) {
      const cohort = dedupePatients(cohortFor(cats));
      const ug = distinctGaps(cohort);
      candidates.push({
        id: `expand-${pr.program}`,
        type: 'expand',
        program: pr.program,
        title: `Expand ${pr.program}`,
        whyNow: `${pr.completionRate} completion · $${monthly}/mo benefit · only ${pr.enrolled} enrolled`,
        headline:
          ug > 0 ? `Unblocks ${ug} care gap${ug !== 1 ? 's' : ''}` : `${cohort.length} eligible`,
        unblockedGaps: ug,
        dollars: cohort.length
          ? `~$${(monthly * 12 * cohort.length).toLocaleString()}/yr benefit`
          : undefined,
        cohort,
        owner: 'Program Lead',
        agent: 'Enrollment Optimizer',
        confidence: ug >= 2 ? 'High' : 'Medium',
        evidence: [
          `${pr.completionRate} historical completion`,
          `${cohort.length} graph-eligible not enrolled`,
          ug ? `${ug} downstream care gaps blocked by this need` : 'no blocked gaps',
        ],
        actions: [
          `Build outreach list (${cohort.length} eligible citizens)`,
          `Create ${cohort.length} enrollment referral${cohort.length !== 1 ? 's' : ''} on the CHW Social queue`,
          'Log program decision to ops',
        ],
        cypher: `MATCH (c:Member)-[:HAS_SDOH]->(n:SDOHNode) WHERE n.category IN [${cats.map((x) => `'${x}'`).join(', ')}] RETURN c`,
      });
    }
  }

  // ── Scale — the whole SDOH intervention to keystone-eligible not yet covered ──
  {
    const cohort = dedupePatients(
      cohortFor(
        ['Housing', 'Food', 'Financial', 'Transportation', 'Behavioral Health', 'Social Isolation'],
        true
      )
    );
    const ug = distinctGaps(cohort);
    candidates.push({
      id: 'scale-sdoh',
      type: 'scale',
      program: 'SDOH Intervention',
      title: 'Scale SDOH intervention to all eligible',
      whyNow: `$${SDOH_PER_EPISODE.toLocaleString()}/episode avoided · ${cohort.length} keystone-eligible not yet covered`,
      headline: ug > 0 ? `Unblocks ${ug} care gaps` : `${cohort.length} eligible`,
      unblockedGaps: ug,
      dollars: cohort.length
        ? `~$${(SDOH_PER_EPISODE * cohort.length).toLocaleString()} projected avoidance`
        : undefined,
      cohort,
      owner: 'SDOH Navigator',
      agent: 'Outcomes Analytics Agent',
      confidence: ug >= 3 ? 'High' : 'Medium',
      evidence: [
        `$${SDOH_PER_EPISODE.toLocaleString()}/episode measured reduction`,
        `${cohort.length} citizens with active keystone barriers`,
        `${ug} care gaps currently blocked`,
      ],
      actions: [
        `Enroll ${cohort.length} keystone-eligible citizen${cohort.length !== 1 ? 's' : ''}`,
        `Create ${cohort.length} SDOH referral${cohort.length !== 1 ? 's' : ''} on the CHW Social queue`,
        'Log scale decision + refresh avoidance projection',
      ],
      cypher: `MATCH (c:Member)-[:HAS_SDOH]->(b:SDOHNode)-[:BLOCKS]->(g:CareGap) RETURN c, count(g)`,
    });
  }

  // ── Re-engage — stalled episodes, keystone-weighted (suppressed if non-keystone) ──
  for (const pr of programs) {
    const stalled = pr.enrolled - pr.completed;
    if (stalled <= 0) continue;
    const cats = PROGRAM_CATEGORIES[pr.program] ?? [];
    const cohort = dedupePatients(cohortFor(cats, true));
    const ug = distinctGaps(cohort);
    const cand: ProgramNBA = {
      id: `reengage-${pr.program}`,
      type: 'reengage',
      program: pr.program,
      title: `Re-engage stalled ${pr.program}`,
      whyNow: `${pr.completionRate} completion · ${stalled} stalled past ${pr.avgDaysToEnroll}d`,
      headline: ug > 0 ? `Unblocks ${ug} care gap${ug !== 1 ? 's' : ''}` : `${stalled} stalled`,
      unblockedGaps: ug,
      cohort,
      owner: 'Program Lead',
      agent: 'Engagement Sentinel',
      confidence: ug >= 1 ? 'High' : 'Medium',
      evidence: [
        `${stalled} enrolled-not-completed`,
        cohort.length
          ? `${cohort.length} keystone citizen(s) in this domain`
          : 'no keystone citizens',
        ug ? `${ug} blocked care gaps` : 'non-keystone',
      ],
      actions: [
        'Flag the stalled episode',
        `Create ${cohort.length} re-engagement referral${cohort.length !== 1 ? 's' : ''} on the CHW Social queue`,
        'Notify Program Lead',
      ],
      cypher: `MATCH (c:Member)-[:HAS_SDOH]->(b:SDOHNode)-[:BLOCKS]->(g:CareGap) WHERE b.category IN [${cats.map((x) => `'${x}'`).join(', ')}] RETURN c`,
    };
    if (cohort.length === 0 || ug === 0) {
      suppressed.push({
        title: cand.title,
        reason:
          cohort.length === 0
            ? 'stalled but no keystone citizen in domain — low leverage'
            : 'no downstream care gaps blocked',
      });
    } else {
      candidates.push(cand);
    }
  }

  // ── Lag — operational-only signal, generated then suppressed (no graph evidence) ──
  const laggard = [...programs]
    .filter((p) => p.avgDaysToEnroll >= 18)
    .sort((a, b) => b.avgDaysToEnroll - a.avgDaysToEnroll)[0];
  if (laggard)
    suppressed.push({
      title: `Reduce ${laggard.program} enrollment lag (${laggard.avgDaysToEnroll}d)`,
      reason:
        'operational-only signal — no graph/clinical evidence of downstream gap impact (below action threshold)',
    });

  // ── Evidence prioritization + suppression ──
  const scored = candidates
    .filter((c) => {
      if (c.cohort.length === 0 && !c.dollars) {
        suppressed.push({ title: c.title, reason: 'no graph-eligible cohort' });
        return false;
      }
      return true;
    })
    .map((c) => ({ c, score: c.unblockedGaps * 10 + c.cohort.length * 3 + (c.dollars ? 2 : 0) }))
    .sort((a, b) => b.score - a.score);

  const nbas = scored.slice(0, 3).map((s) => s.c);
  scored
    .slice(3)
    .forEach((s) =>
      suppressed.push({ title: s.c.title, reason: 'lower evidence rank — capped at top 3' })
    );

  return { nbas, suppressed };
}
