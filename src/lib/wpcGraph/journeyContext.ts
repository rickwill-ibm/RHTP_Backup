// wpcGraph/journeyContext.ts — builds the journey-aware engagement context for any citizen.
// MARIA_SD_001 → authored constants verbatim (D4: no fabricated windows for other patients).
// Any other id  → derives window times, channels, suppression rules from the registry.
// Pure function — no I/O, no DB.

import { getPatientById } from '@/lib/patientRegistry';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import {
  MARIA_INTERACTIONS,
  MARIA_SUPPRESSION_RULES,
  MARIA_CHANNELS,
  MARIA_CONVERSION_DATA,
} from './mariaJourneyData';
import {
  deriveWindow,
  deriveSuppression,
  derivePreferredChannel,
  deriveChannels,
  deriveSuppRules,
  deriveInteractions,
  deriveConversion,
} from './journeyContext.helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuppressionRule {
  id: string;
  icon: string;
  label: string;
  color: string;
  bg: string;
}

export interface Channel {
  key: string;
  label: string;
  color: string;
  inactive: boolean;
  note: string | null;
}

export interface ConversionEntry {
  label: string;
  rate: number;
  color: string;
  note: string;
}

export interface JourneyInteraction {
  id: string;
  channel: string;
  dayOffset: number;
  hourOfDay: number;
  type: string;
  outcome: string;
  agent: string;
  note: string;
  timestamp: string;
}

export interface JourneyContext {
  memberName: string;
  memberId: string;
  memberLocation: string;
  memberProgram: string;
  preferredChannel: string;
  preferredChannelSubtext: string;
  activeWindowStart: number;
  activeWindowEnd: number;
  activeWindowLabel: string;
  activeWindowSubtext: string;
  suppressionStart: number;
  suppressionEnd: number;
  suppressionLabel: string;
  suppressionSubtext: string;
  /** E.g. "2x / week" */
  sessionFrequency: string;
  sessionFrequencySubtext: string;
  /** Days since last touchpoint (derived from lastContact registry field) */
  lastTouchpointDays: number;
  lastTouchpointChannel: string;
  lastTouchpointSubtext: string;
  /** Label for the Active Window stat card (same as activeWindowLabel) */
  activeWindowStat: string;
  activeWindowStatSubtext: string;
  suppressionRules: SuppressionRule[];
  channels: Channel[];
  interactions: JourneyInteraction[];
  conversionData: ConversionEntry[];
}

// ─── Unknown-patient safe defaults ───────────────────────────────────────────

const UNKNOWN_DEFAULTS: Omit<JourneyContext, 'memberName' | 'memberId'> = {
  memberLocation: '—',
  memberProgram: '—',
  preferredChannel: 'SMS',
  preferredChannelSubtext: 'Default channel',
  activeWindowStart: 9,
  activeWindowEnd: 17,
  activeWindowLabel: '9:00 AM – 5:00 PM',
  activeWindowSubtext: 'Business hours',
  suppressionStart: 20,
  suppressionEnd: 8,
  suppressionLabel: '8:00 PM – 8:00 AM',
  suppressionSubtext: 'Evening / overnight — suppressed',
  sessionFrequency: '—',
  sessionFrequencySubtext: 'No contact history',
  lastTouchpointDays: 0,
  lastTouchpointChannel: '—',
  lastTouchpointSubtext: 'No recent contact',
  activeWindowStat: '9:00 AM – 5:00 PM',
  activeWindowStatSubtext: 'Business hours',
  suppressionRules: [
    {
      id: 'sr-1',
      icon: '🚫',
      label: 'No outreach overnight (8 PM – 8 AM)',
      color: '#EF4444',
      bg: '#EF444422',
    },
    {
      id: 'sr-4',
      icon: '🚫',
      label: 'No duplicate SMS within 4 hours',
      color: '#F59E0B',
      bg: '#F59E0B22',
    },
  ],
  channels: [
    { key: 'sms', label: 'SMS', color: '#84CC16', inactive: false, note: null },
    { key: 'phone', label: 'Phone', color: '#0EA5E9', inactive: false, note: null },
    { key: 'inperson', label: 'In-Person', color: '#8B5CF6', inactive: false, note: null },
    { key: 'portal', label: 'Portal', color: '#334155', inactive: true, note: 'Status unknown' },
    {
      key: 'mobile',
      label: 'Mobile App',
      color: '#334155',
      inactive: true,
      note: 'App not installed',
    },
    { key: 'email', label: 'Email', color: '#374151', inactive: true, note: 'Email not primary' },
  ],
  interactions: [],
  conversionData: [],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the journey-aware engagement context for a citizen.
 *
 * MARIA_SD_001 → authored constants verbatim (15 interactions, exact windows, exact rules).
 * Any other id  → derived from registry (honest skeleton, no fabricated 90-day history).
 * Unknown id    → returns safe defaults named for an unknown patient.
 *
 * Pure function — no I/O, no DB.
 */
export function buildJourneyContext(citizenId: string): JourneyContext {
  // ── Maria branch: authored constants, returned verbatim ──────────────────
  if (citizenId === DEMO_MEMBER_ID) {
    return {
      memberName: 'Maria Redhawk',
      memberId: 'MARIA_SD_001',
      memberLocation: 'Martin, SD 57551 · Bennett County',
      memberProgram: 'SD RHTP Track 3 · Medicaid',
      preferredChannel: 'SMS',
      preferredChannelSubtext: 'Only viable channel — no broadband',
      activeWindowStart: 15,
      activeWindowEnd: 19,
      activeWindowLabel: '3:00 PM – 7:00 PM',
      activeWindowSubtext: 'Post-shift · Weekdays only',
      suppressionStart: 6,
      suppressionEnd: 14,
      suppressionLabel: '6:00 AM – 2:00 PM',
      suppressionSubtext: 'Work Hours — Outreach Suppressed',
      sessionFrequency: '2x / week',
      sessionFrequencySubtext: 'Avg outreach cadence (90d)',
      lastTouchpointDays: 3,
      lastTouchpointChannel: 'SMS',
      lastTouchpointSubtext: 'Engaged — HbA1c coordination',
      activeWindowStat: '3:00 PM – 7:00 PM',
      activeWindowStatSubtext: 'Post-shift · Weekdays only',
      suppressionRules: MARIA_SUPPRESSION_RULES,
      channels: MARIA_CHANNELS,
      interactions: MARIA_INTERACTIONS,
      conversionData: MARIA_CONVERSION_DATA,
    };
  }

  // ── Unknown id — safe defaults ────────────────────────────────────────────
  const p = getPatientById(citizenId);
  if (!p) {
    return { memberName: 'Unknown Patient', memberId: citizenId, ...UNKNOWN_DEFAULTS };
  }

  // ── Registry-derived branch ───────────────────────────────────────────────
  const win = deriveWindow(p);
  const supp = deriveSuppression(p);
  const { channel: prefChannel, subtext: prefSubtext } = derivePreferredChannel(p);
  const lastContactDays = /week/i.test(p.lastContact)
    ? (parseInt(p.lastContact) || 1) * 7
    : /day/i.test(p.lastContact)
      ? parseInt(p.lastContact) || 3
      : 14;
  const topGap = (p.careGaps ?? []).find((g) => g.status !== 'Closed');

  return {
    memberName: p.name,
    memberId: p.platformId,
    memberLocation: p.location,
    memberProgram: `${p.contract} · ${p.organization}`,
    preferredChannel: prefChannel,
    preferredChannelSubtext: prefSubtext,
    activeWindowStart: win.start,
    activeWindowEnd: win.end,
    activeWindowLabel: win.label,
    activeWindowSubtext: win.subtext,
    suppressionStart: supp.start,
    suppressionEnd: supp.end,
    suppressionLabel: supp.label,
    suppressionSubtext: supp.subtext,
    sessionFrequency: '1–2x / week',
    sessionFrequencySubtext: 'Estimated from care gaps',
    lastTouchpointDays: lastContactDays,
    lastTouchpointChannel: prefChannel,
    lastTouchpointSubtext: topGap
      ? topGap.name.replace(/ \(.*\)/, '').slice(0, 35)
      : 'Care plan follow-up',
    activeWindowStat: win.label,
    activeWindowStatSubtext: win.subtext,
    suppressionRules: deriveSuppRules(p, supp.start, supp.end, win.end),
    channels: deriveChannels(p),
    interactions: deriveInteractions(p, win.start),
    conversionData: deriveConversion(p),
  };
}
