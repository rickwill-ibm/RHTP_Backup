import {
  getPatientById,
  getPatientByFhirId,
  resolveFhirToPlatformId,
  type RegistryPatient,
} from '../patientRegistry';
import type { AttributablePatient, PrimaryDomain, Specialty } from './attribution';

const WORKLIST_TO_PLATFORM_ID: Record<string, string> = {
  'pt-maria': 'MARIA_SD_001',
  'pt-001': 'PAT-0042',
  'pt-002': 'PAT-0087',
  'pt-003': 'PAT-0042',
  'pt-004': 'PAT-0156',
  'pt-005': 'PAT-0103',
  'pt-006': 'PAT-0087',
};

export function toPlatformId(anyId: string): string | undefined {
  if (!anyId) return undefined;
  if (getPatientById(anyId)) return anyId;
  if (WORKLIST_TO_PLATFORM_ID[anyId]) return WORKLIST_TO_PLATFORM_ID[anyId];
  const viaFhir = resolveFhirToPlatformId(anyId);
  if (viaFhir) return viaFhir;
  return undefined;
}

export function resolvePatient(anyId: string): RegistryPatient | undefined {
  const direct = getPatientById(anyId);
  if (direct) return direct;
  const viaFhir = getPatientByFhirId(anyId);
  if (viaFhir) return viaFhir;
  const pid = WORKLIST_TO_PLATFORM_ID[anyId];
  if (pid) return getPatientById(pid);
  return undefined;
}

function dominantDomain(p: RegistryPatient): PrimaryDomain {
  const counts: Record<PrimaryDomain, number> = { Clinical: 0, BH: 0, Social: 0 };
  for (const g of p.careGaps) {
    if (g.status === 'Closed' || g.status === 'Waived') continue;
    if (g.domain === 'Clinical') counts.Clinical++;
    else if (g.domain === 'BH') counts.BH++;
    else if (g.domain === 'Social') counts.Social++;
  }
  if (p.bhRisk === 'Crisis') return 'BH';
  let best: PrimaryDomain = 'Clinical';
  (['Clinical', 'BH', 'Social'] as PrimaryDomain[]).forEach((d) => {
    if (counts[d] > counts[best]) best = d;
  });
  return best;
}

function specialtyFromEpisode(p: RegistryPatient, domain: PrimaryDomain): Specialty {
  if (domain === 'BH') return 'Behavioral Health';
  if (domain === 'Social') return 'Social/SDOH';
  const e = `${p.episodeType} ${p.riskLabel}`.toLowerCase();
  if (e.includes('postpartum') || e.includes('maternal')) return 'Maternal/Postpartum';
  if (e.includes('copd') || e.includes('asthma') || e.includes('respir')) return 'Respiratory';
  if (e.includes('ckd') || e.includes('renal') || e.includes('nephro')) return 'Renal';
  if (e.includes('diabet') || e.includes('a1c') || e.includes('pre-diab')) return 'Diabetes';
  if (
    e.includes('chf') ||
    e.includes('hypertension') ||
    e.includes('blood pressure') ||
    e.includes('cardi')
  )
    return 'Cardiometabolic';
  if (p.age >= 70) return 'Complex/Geriatric';
  return 'Diabetes';
}

const NAME_TO_MEMBER_ID: Record<string, string> = {
  'Sarah Johnson': 'cm-sarah-johnson',
  'Angela Torres': 'chw-angela-torres',
  'Lisa Fontaine, LCSW': 'cm-lisa-fontaine',
  'James Holloway': 'chw-james-holloway',
};

export function existingMemberIdFor(p: RegistryPatient): string | undefined {
  return NAME_TO_MEMBER_ID[p.careManager];
}

export function effectiveMemberId(
  patientId: string,
  assignments: Record<string, { memberId: string }>
): string | undefined {
  if (assignments[patientId]) return assignments[patientId].memberId;
  const pid = toPlatformId(patientId);
  if (pid && assignments[pid]) return assignments[pid].memberId;
  const p = (pid && resolvePatient(pid)) || resolvePatient(patientId);
  if (p) return existingMemberIdFor(p);
  return undefined;
}

export function toAttributable(p: RegistryPatient): AttributablePatient {
  const domain = dominantDomain(p);
  const tribal = /lakota|sioux|tribal|pine ridge|bennett/i.test(
    `${p.language} ${p.location} ${p.organization} ${p.cohortFlag}`
  );
  const region = /bennett|martin/i.test(p.location)
    ? 'Bennett County'
    : /pine ridge/i.test(p.location)
      ? 'Pine Ridge'
      : /rapid city/i.test(p.location)
        ? 'Rapid City'
        : /winner/i.test(p.location)
          ? 'Winner'
          : 'Rural SD';
  return {
    platformId: p.platformId,
    name: p.name,
    riskTier: p.riskTier,
    rafScore: p.rafScore,
    primaryDomain: domain,
    specialtyNeed: specialtyFromEpisode(p, domain),
    pcpOrganization: p.organization,
    existingMemberId: existingMemberIdFor(p),
    language: p.language?.split(' /')[0]?.trim() || 'English',
    region,
    tribal,
    contract: p.contract,
    synthetic: false,
  };
}
