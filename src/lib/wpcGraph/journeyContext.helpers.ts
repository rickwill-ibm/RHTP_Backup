// wpcGraph/journeyContext.helpers.ts — registry-derived helper functions for buildJourneyContext.
// Extracted to keep journeyContext.ts under the 400-line cap.
// Pure functions — no I/O, no DB.

import type { RegistryPatient } from '@/lib/patientRegistry';
import type {
  Channel,
  SuppressionRule,
  ConversionEntry,
  JourneyInteraction,
} from './journeyContext';

// ─── Window + suppression derivation ─────────────────────────────────────────

export function deriveWindow(p: RegistryPatient): {
  start: number;
  end: number;
  label: string;
  subtext: string;
} {
  const isWorking = /work|shift|employ/i.test(p.cohortFlag + ' ' + p.disparityFlag);
  const isCaregiverRole = (p.household?.caregiverFor?.length ?? 0) > 0;
  const isRural = /rural/i.test(p.cohortFlag + ' ' + p.location);
  if (isWorking || isCaregiverRole || isRural) {
    return { start: 17, end: 20, label: '5:00 PM – 8:00 PM', subtext: 'Evening · Weekdays' };
  }
  return { start: 9, end: 17, label: '9:00 AM – 5:00 PM', subtext: 'Business hours' };
}

export function deriveSuppression(p: RegistryPatient): {
  start: number;
  end: number;
  label: string;
  subtext: string;
} {
  const isWorking = /work|shift|employ/i.test(p.cohortFlag + ' ' + p.disparityFlag);
  if (isWorking) {
    return {
      start: 7,
      end: 17,
      label: '7:00 AM – 5:00 PM',
      subtext: 'Work Hours — Outreach Suppressed',
    };
  }
  return {
    start: 8,
    end: 12,
    label: '8:00 AM – 12:00 PM',
    subtext: 'Morning hours — lower engagement',
  };
}

// ─── Channel + preferred channel derivation ───────────────────────────────────

export function derivePreferredChannel(p: RegistryPatient): { channel: string; subtext: string } {
  const access = (p.digitalAccess || '').toLowerCase();
  if (/no broadband|no internet|divide/i.test(access))
    return { channel: 'SMS', subtext: 'Only viable channel — no broadband' };
  if (/high|portal/i.test(access))
    return { channel: 'Portal', subtext: 'Portal engaged · high digital access' };
  if (/moderate/i.test(access))
    return { channel: 'SMS', subtext: 'SMS preferred · moderate digital access' };
  return { channel: 'Phone', subtext: 'Phone preferred' };
}

export function deriveChannels(p: RegistryPatient): Channel[] {
  const access = (p.digitalAccess || '').toLowerCase();
  const noPortal = /no broadband|no internet|divide/i.test(access);
  return [
    { key: 'sms', label: 'SMS', color: '#84CC16', inactive: false, note: null },
    { key: 'phone', label: 'Phone', color: '#0EA5E9', inactive: false, note: null },
    { key: 'inperson', label: 'In-Person', color: '#8B5CF6', inactive: false, note: null },
    {
      key: 'portal',
      label: 'Portal',
      color: noPortal ? '#475569' : '#22c55e',
      inactive: noPortal,
      note: noPortal ? 'No broadband · portal access blocked' : null,
    },
    {
      key: 'mobile',
      label: 'Mobile App',
      color: '#334155',
      inactive: true,
      note: 'App not installed',
    },
    { key: 'email', label: 'Email', color: '#374151', inactive: true, note: 'Email not primary' },
  ];
}

// ─── Suppression rules derivation ────────────────────────────────────────────

export function deriveSuppRules(
  p: RegistryPatient,
  suppStart: number,
  suppEnd: number,
  activeEnd: number
): SuppressionRule[] {
  const rules: SuppressionRule[] = [
    {
      id: 'sr-1',
      icon: '🚫',
      label: `No outreach ${suppStart}:00 AM – ${suppStart + (suppEnd - suppStart)}:00 (low engagement window)`,
      color: '#EF4444',
      bg: '#EF444422',
    },
    {
      id: 'sr-2',
      icon: '🚫',
      label: `No outreach after ${activeEnd}:00 PM (evening / rest hours)`,
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
  ];
  const access = (p.digitalAccess || '').toLowerCase();
  if (/no broadband|no internet|divide/i.test(access)) {
    rules.push({
      id: 'sr-3',
      icon: '🚫',
      label: 'No portal / email outreach (digital divide)',
      color: '#F59E0B',
      bg: '#F59E0B22',
    });
  }
  const hasCg = (p.household?.caregiverFor?.length ?? 0) > 0;
  if (hasCg) {
    const cgName = p.household!.caregiverFor![0].name.split(' ')[0];
    rules.push({
      id: 'sr-5',
      icon: '✓',
      label: `Caregiver (${cgName}): SMS only · clinical summary scope · no BH`,
      color: '#84CC16',
      bg: '#84CC1622',
    });
  }
  if (p.bhRisk !== 'Low') {
    rules.push({
      id: 'sr-6',
      icon: '⚠',
      label: 'BH outreach: consent verification required before any BH content',
      color: '#a78bfa',
      bg: '#a78bfa22',
    });
  }
  return rules;
}

// ─── Interactions + conversion derivation ────────────────────────────────────

export function deriveInteractions(p: RegistryPatient, activeStart: number): JourneyInteraction[] {
  const interactions: JourneyInteraction[] = [];
  const cm = p.careManager || 'Care Manager';
  const topGap = (p.careGaps ?? []).find((g) => g.status !== 'Closed');
  const lastContactDays = /week/i.test(p.lastContact)
    ? parseInt(p.lastContact) * 7 || 7
    : /day/i.test(p.lastContact)
      ? parseInt(p.lastContact) || 3
      : 14;

  interactions.push({
    id: 'sms-1',
    channel: 'sms',
    dayOffset: Math.max(1, lastContactDays),
    hourOfDay: activeStart + 1,
    type: 'outreach',
    outcome: 'engaged',
    agent: cm,
    note: topGap ? `${topGap.name.replace(/ \(.*\)/, '')} — outreach` : 'Care plan check-in',
    timestamp: `Day ${Math.max(1, lastContactDays)} · ${activeStart + 1}:00 PM`,
  });
  interactions.push({
    id: 'sms-2',
    channel: 'sms',
    dayOffset: Math.max(1, lastContactDays) + 7,
    hourOfDay: activeStart,
    type: 'outreach',
    outcome: 'ignored',
    agent: cm,
    note: 'Follow-up — no response',
    timestamp: `Day ${Math.max(1, lastContactDays) + 7} · ${activeStart}:00 PM`,
  });
  interactions.push({
    id: 'sms-3',
    channel: 'sms',
    dayOffset: Math.max(1, lastContactDays) + 14,
    hourOfDay: 8,
    type: 'outreach',
    outcome: 'suppressed',
    agent: 'Consent Agent',
    note: 'Sent outside active window — blocked',
    timestamp: `Day ${Math.max(1, lastContactDays) + 14} · 8:00 AM`,
  });

  if (p.careManager) {
    interactions.push({
      id: 'ph-1',
      channel: 'phone',
      dayOffset: Math.max(1, lastContactDays) + 3,
      hourOfDay: activeStart + 2,
      type: 'inbound',
      outcome: 'engaged',
      agent: cm,
      note: 'Patient-initiated call — care plan question',
      timestamp: `Day ${Math.max(1, lastContactDays) + 3} · ${activeStart + 2}:00 PM`,
    });
  }
  return interactions;
}

export function deriveConversion(p: RegistryPatient): ConversionEntry[] {
  const access = (p.digitalAccess || '').toLowerCase();
  const noPortal = /no broadband|no internet|divide/i.test(access);
  return [
    { label: 'SMS In-Window', rate: 65, color: '#84CC16', note: 'suppression active' },
    { label: 'SMS Out-Window', rate: 12, color: '#EF4444', note: 'suppression working' },
    { label: 'Phone Inbound', rate: 60, color: '#0EA5E9', note: '' },
    { label: 'In-Person CHW', rate: 90, color: '#8B5CF6', note: 'highest value' },
    {
      label: 'Portal',
      rate: noPortal ? 0 : 40,
      color: noPortal ? '#475569' : '#22c55e',
      note: noPortal ? 'access barrier' : '',
    },
  ];
}
