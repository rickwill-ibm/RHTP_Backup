// ─── ReferralTask → ReferralRecord adapter (single source of truth) ───────────
// Turns in-app, origination-time ReferralTasks (created by a Run-play / manual
// enrollment and held in appContext) into the ReferralRecord shape the existing
// referral screens already render. This is an ADAPTER, not a new engine: the
// closed-loop tracking, stage pipeline and outcomes UI already live in
// /referral-tracking and /referral-journey-tracker. We only reshape + merge the
// live tasks so they flow into those screens contextually — no seed data, no
// duplicated closed-loop logic, and (see below) no duplicate rows.

import type { ReferralTask } from '@/lib/appContext';
import type { ReferralRecord } from '@/app/referral-tracking/page';
import type { ReferralJourneyRecord, JourneyStatus } from '@/app/referral-journey-tracker/page';

/**
 * Map a live (in-memory) ReferralTask into a ReferralRecord at the
 * just-submitted / awaiting-acceptance stage. The receiving CBO/org is carried
 * as the assigned provider; the requested action becomes the clinical note.
 */
export function referralTaskToRecord(t: ReferralTask): ReferralRecord {
  const date = (t.createdAt ?? new Date().toISOString()).slice(0, 10);
  return {
    id: t.id,
    patientName: t.citizenName,
    patientId: t.patientId,
    referralDate: date,
    specialty: t.category,
    urgency: 'Routine',
    status: 'Pending',
    assignedProvider: t.cboName ?? null,
    providerId: null,
    providerTier: null,
    icdCode: '—',
    icdDescription: t.action,
    submissionChannel: 'RHTP Run Play',
    submittedDate: date,
    appointmentDate: null,
    closedDate: null,
    outcome: 'Pending',
    coordinatorName: 'RHTP Program',
    notes: t.action,
    daysOpen: 0,
  };
}

/**
 * Select manual (Run-play / operator-originated) tasks and map to records,
 * de-duplicated so the same referral never appears twice. Two guards:
 *   1. by task id (a task object seen more than once), and
 *   2. by intent key patientId|action|category (hitting Run play repeatedly for
 *      the same cohort/play must not spawn duplicate referral rows).
 * First occurrence wins.
 */
export function liveManualReferrals(tasks: ReferralTask[]): ReferralRecord[] {
  const seenId = new Set<string>();
  const seenIntent = new Set<string>();
  const out: ReferralRecord[] = [];
  for (const t of tasks) {
    if (t.source !== 'manual') continue;
    const intent = `${t.patientId}::${t.action}::${t.category}`;
    if (seenId.has(t.id) || seenIntent.has(intent)) continue;
    seenId.add(t.id);
    seenIntent.add(intent);
    out.push(referralTaskToRecord(t));
  }
  return out;
}

/**
 * Merge live records ahead of a base (authored/mock) list, de-duplicated by id
 * so a live referral never collides with an authored demo row — live wins.
 */
export function mergeReferralsById<T extends ReferralRecord>(live: T[], base: T[]): T[] {
  const ids = new Set(live.map((r) => r.id));
  return [...live, ...base.filter((r) => !ids.has(r.id))];
}

/**
 * Build live manual referrals as ReferralJourneyRecords pinned at the Submitted
 * stage (they were just originated). Keeps the journey-record shaping in one
 * place so the page only makes a thin call.
 */
export function buildLiveJourneyReferrals(tasks: ReferralTask[]): ReferralJourneyRecord[] {
  return liveManualReferrals(tasks).map((r) => ({
    ...r,
    journeyStatus: 'pending' as JourneyStatus,
    providerResponse: null,
    providerResponseDate: null,
    scheduledDate: null,
    appointmentConfirmedDate: null,
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  }));
}
