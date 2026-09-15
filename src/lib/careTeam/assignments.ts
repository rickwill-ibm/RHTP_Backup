import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
// careTeam/assignments.ts — Assignment + audit types and caseload math.
// The live state lives in appContext; these are the shapes + pure reducers.

import { CARE_TEAM_MEMBERS, getMember, type CareTeamMember } from './members';
import { RISK_WEIGHT, type RiskTier } from './attribution';
import type { Cohort } from './cohorts';

export interface Assignment {
  patientId: string;
  memberId: string;
  source: 'auto' | 'manual';
  rationale: string;
  riskTier: RiskTier;
  cohortId?: string;
  assignedAt: string;
  assignedBy: string;
}

export interface AuditEntry {
  id: string;
  patientId: string;
  fromMemberId?: string;
  toMemberId: string;
  reason: string;
  actor: string;
  at: string;
}

export interface MemberCaseload {
  member: CareTeamMember;
  uniquePatients: number; // each patient counted once across all cohorts
  acuityWeightedLoad: number;
  totalWithBase: number; // baseCaseload + uniquePatients
  utilizationPct: number; // totalWithBase / maxCaseload
  overCapacity: boolean;
}

/**
 * Flatten cohort attributions into one assignment per UNIQUE patient.
 * If a patient appears in multiple cohorts, the first attribution wins (stable),
 * unless a manual override exists in `overrides`.
 */
export function deriveAssignments(
  cohorts: Cohort[],
  overrides: Record<string, Assignment> = {},
  assignedBy = 'system'
): Record<string, Assignment> {
  const out: Record<string, Assignment> = {};
  for (const c of cohorts) {
    for (const pid of c.patientIds) {
      if (out[pid]) continue; // unique: keep first
      const res = c.assignments[pid];
      if (!res) continue;
      const tier = c.patients.find((p) => p.platformId === pid)?.riskTier ?? 'Moderate';
      out[pid] = {
        patientId: pid,
        memberId: res.memberId,
        source: 'auto',
        rationale: res.rationale,
        riskTier: tier,
        cohortId: c.id,
        assignedAt: c.createdAt,
        assignedBy,
      };
    }
  }
  // manual overrides take precedence
  return { ...out, ...overrides };
}

/** Per-member caseload, counting each patient once (the reconciliation rule). */
export function computeCaseloads(
  assignments: Record<string, Assignment>,
  members: CareTeamMember[] = CARE_TEAM_MEMBERS
): MemberCaseload[] {
  const unique: Record<string, { count: number; acuity: number }> = {};
  for (const a of Object.values(assignments)) {
    const slot = (unique[a.memberId] ??= { count: 0, acuity: 0 });
    slot.count += 1;
    slot.acuity += RISK_WEIGHT[a.riskTier];
  }
  return members.map((m) => {
    const u = unique[m.id] ?? { count: 0, acuity: 0 };
    const totalWithBase = m.baseCaseload + u.count;
    return {
      member: m,
      uniquePatients: u.count,
      acuityWeightedLoad: u.acuity,
      totalWithBase,
      utilizationPct: Math.round((totalWithBase / m.maxCaseload) * 100),
      overCapacity: totalWithBase > m.maxCaseload,
    };
  });
}

export function makeAuditEntry(
  patientId: string,
  toMemberId: string,
  reason: string,
  actor: string,
  fromMemberId?: string
): AuditEntry {
  return {
    id: `audit-${patientId}-${clock.now()}`,
    patientId,
    fromMemberId,
    toMemberId,
    reason,
    actor,
    at: clock.nowIso(),
  };
}

export function memberDisplay(memberId: string): string {
  return getMember(memberId)?.name ?? memberId;
}
