// uhg/data/persona.ts — display persona for RHTP-Orchestrate screens, sourced from the
// RHTP patient registry. Works for ANY citizen; default = Maria Redhawk (MARIA_SD_001).
import { getPatientById, getAllPatients, getVisiblePatients, type RegistryPatient } from '@/lib/patientRegistry';
import { getFhirMockMode } from '@/lib/services/fhirClient';

export const DEFAULT_CITIZEN = 'MARIA_SD_001';

export interface UhgPersona {
  id: string; name: string; age: number; gender: string; initials: string;
  riskLabel: string; riskColor: string;
  bhStatus: string; careGap: string; episode: string;
  clinicalAlert: string | null; sdoh: string; population: string;
  careManager: string; organization: string; location: string;
}

function toInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}
function riskColor(tier: string) {
  return /crit|high/i.test(tier) ? '#fa4d56' : /mod/i.test(tier) ? '#f1c21b' : '#42be65';
}
function topClinicalGap(p: RegistryPatient) {
  const g = p.careGaps?.find((c) => c.domain === 'Clinical' && c.status !== 'Closed') || p.careGaps?.[0];
  return g ? `${g.name.replace(/ \(.*\)/, '')} ${g.daysOpen}d` : 'No open gap';
}

// Fail-closed placeholder. An unknown or empty citizenId must NEVER resolve to
// another member's record — the previous `|| DEFAULT_CITIZEN` fallback leaked
// Maria Redhawk's identity/PII onto out-of-scope members. Screens gate real
// member detail via MemberScopeNotice; this keeps the non-null contract safe.
function placeholderPersona(citizenId?: string): UhgPersona {
  return {
    id: citizenId || 'UNKNOWN', name: 'Member', age: 0, gender: '', initials: '\u2014',
    riskLabel: 'Scope pending', riskColor: '#64748b',
    bhStatus: 'No BH screen', careGap: 'No open gap', episode: '\u2014',
    clinicalAlert: null, sdoh: 'SDOH \u00b7 screening', population: '\u2014',
    careManager: '\u2014', organization: '\u2014', location: '\u2014',
  };
}

export function personaFor(citizenId?: string): UhgPersona {
  const p = getPatientById(citizenId ?? '');
  if (!p) return placeholderPersona(citizenId);
  const tier = p.riskTier || 'Moderate';
  const social = p.careGaps?.filter((c) => c.domain === 'Social').length || 0;
  return {
    id: p.platformId, name: p.name, age: p.age, gender: p.gender, initials: toInitials(p.name),
    riskLabel: `${tier.toUpperCase()} · RAF ${p.rafScore}`, riskColor: riskColor(tier),
    bhStatus: p.bhScoreLabel || p.bhScreeningLabel || 'No BH screen',
    careGap: topClinicalGap(p),
    episode: `${p.episodeType} · ${p.episodeStatus}`,
    clinicalAlert: /pre-?diab/i.test(p.riskLabel || '') ? 'Pre-diabetic · A1C' : null,
    sdoh: social > 0 ? `SDOH · ${social} barriers` : 'SDOH · screening',
    population: `${p.contract} · ${p.organization}`,
    careManager: p.careManager, organization: p.organization, location: p.location,
  };
}

export function citizenRoster(): { id: string; name: string }[] {
  return getVisiblePatients(getFhirMockMode()).map((p) => ({ id: p.platformId, name: p.name }));
}
