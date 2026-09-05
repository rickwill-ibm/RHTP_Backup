// ─── Authored journey demo data (relocated from the page per size doctrine) ──
// Verbatim authored enrichment + derived journeys for the demo cohort. Values
// are unchanged — this is a location move only, keeping the page under cap and
// referral demo data in the referrals domain lib.

import { mockReferrals } from '@/app/referral-tracking/components/ActiveReferralsTable';
import type { ReferralRecord } from '@/app/referral-tracking/page';
import type { ReferralJourneyRecord, JourneyStatus } from '@/app/referral-journey-tracker/page';

// ─── Enrich mock referrals with journey data ──────────────────────────────────

export function deriveJourneyStatus(r: ReferralRecord): JourneyStatus {
  if (r.status === 'Cancelled') return 'cancelled';
  if (r.outcome === 'Seen') return 'completed';
  if (r.appointmentDate) return 'scheduled';
  if (r.assignedProvider) return 'accepted';
  return 'pending';
}

const JOURNEY_ENRICHMENT: Record<string, Partial<ReferralJourneyRecord>> = {
  'ref-001': {
    providerResponse: 'Accepted — Dr. Osei confirmed availability for urgent cardiac eval.',
    providerResponseDate: '2026-04-12',
    scheduledDate: '2026-04-18',
    appointmentConfirmedDate: '2026-04-12',
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: true,
    followUpDate: '2026-04-25',
  },
  'ref-002': {
    providerResponse: 'Accepted — appointment slot confirmed for late April.',
    providerResponseDate: '2026-04-10',
    scheduledDate: '2026-04-22',
    appointmentConfirmedDate: '2026-04-10',
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  },
  'ref-003': {
    providerResponse: null,
    providerResponseDate: null,
    scheduledDate: null,
    appointmentConfirmedDate: null,
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  },
  'ref-004': {
    providerResponse: 'Accepted — routine hypertension follow-up confirmed.',
    providerResponseDate: '2026-04-07',
    scheduledDate: '2026-04-13',
    appointmentConfirmedDate: '2026-04-07',
    outcomeNotes: 'BP well-controlled. Medication adjusted. Follow-up in 3 months with PCP.',
    outcomeDate: '2026-04-13',
    followUpRequired: true,
    followUpDate: '2026-07-13',
  },
  'ref-005': {
    providerResponse: null,
    providerResponseDate: null,
    scheduledDate: null,
    appointmentConfirmedDate: null,
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  },
  'ref-006': {
    providerResponse: 'Accepted — colonoscopy prep instructions sent to patient.',
    providerResponseDate: '2026-04-11',
    scheduledDate: '2026-04-25',
    appointmentConfirmedDate: '2026-04-11',
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  },
  'ref-007': {
    providerResponse: 'Accepted — OCT imaging slot available.',
    providerResponseDate: '2026-04-03',
    scheduledDate: '2026-04-08',
    appointmentConfirmedDate: '2026-04-03',
    outcomeNotes: 'OCT completed. Mild drusen noted. Annual monitoring recommended.',
    outcomeDate: '2026-04-08',
    followUpRequired: true,
    followUpDate: '2026-04-08',
  },
  'ref-008': {
    providerResponse: 'Accepted STAT — Holter monitor ordered, appointment same-day.',
    providerResponseDate: '2026-04-13',
    scheduledDate: '2026-04-15',
    appointmentConfirmedDate: '2026-04-13',
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: true,
    followUpDate: '2026-04-22',
  },
  'ref-009': {
    providerResponse: 'Accepted — X-ray review and PT referral discussed.',
    providerResponseDate: '2026-04-09',
    scheduledDate: '2026-04-14',
    appointmentConfirmedDate: '2026-04-09',
    outcomeNotes: 'X-ray reviewed. Moderate OA confirmed. PT referral placed. Surgery deferred.',
    outcomeDate: '2026-04-14',
    followUpRequired: true,
    followUpDate: '2026-07-14',
  },
  'ref-010': {
    providerResponse: 'Accepted — out-of-network auth obtained, urgent slot confirmed.',
    providerResponseDate: '2026-04-05',
    scheduledDate: '2026-04-10',
    appointmentConfirmedDate: '2026-04-05',
    outcomeNotes: 'Insulin regimen adjusted. CGM initiated. A1c recheck in 90 days.',
    outcomeDate: '2026-04-10',
    followUpRequired: true,
    followUpDate: '2026-07-10',
  },
  'ref-011': {
    providerResponse: null,
    providerResponseDate: null,
    scheduledDate: null,
    appointmentConfirmedDate: null,
    outcomeNotes: null,
    outcomeDate: null,
    followUpRequired: false,
    followUpDate: null,
  },
  'ref-012': {
    providerResponse: 'Accepted — stress test ordered, urgent cardiac slot confirmed.',
    providerResponseDate: '2026-03-30',
    scheduledDate: '2026-04-04',
    appointmentConfirmedDate: '2026-03-30',
    outcomeNotes: 'Stress test completed. Mild ischemia noted. Cath lab referral placed.',
    outcomeDate: '2026-04-04',
    followUpRequired: true,
    followUpDate: '2026-04-18',
  },
};

// Static journey enrichment applied to both mock and FHIR-sourced referrals
export const journeyReferrals: ReferralJourneyRecord[] = mockReferrals.map((r) => ({
  ...r,
  journeyStatus: deriveJourneyStatus(r),
  providerResponse: null,
  providerResponseDate: null,
  scheduledDate: null,
  appointmentConfirmedDate: null,
  outcomeNotes: null,
  outcomeDate: null,
  followUpRequired: false,
  followUpDate: null,
  ...JOURNEY_ENRICHMENT[r.id],
}));
