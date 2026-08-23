/**
 * Care Plan care-team assembly (Cycle 2 extraction from
 * carePlanGenerator.goals.ts and carePlanGenerator.holistic.ts).
 *
 * KNOWN DEFECT, PRESERVED (FINDINGS F5 in CYCLE2B_REPORT): contact emails
 * are synthesized from provider names and NPI is placeholder text —
 * presentation-tier fabrication inside a service. Kept verbatim this pass;
 * the G5 target sources care-team contact data from the record.
 */
import type { HolisticCarePlan } from '@/lib/services/tieredInterventionGenerator';
import type { CareTeamMember, Patient, PatientAnalysis } from './types';

function readCareManager(patient: Patient): string | undefined {
  const value = (patient as unknown as Record<string, unknown>)['careManager'];
  return typeof value === 'string' ? value : undefined;
}

function primaryCareMember(patient: Patient, id: string): CareTeamMember {
  return {
    id,
    name: patient.primaryCareProvider || 'Primary Care Provider (to be assigned)',
    role: 'Primary Care Physician',
    relationship: 'Primary',
    phone: patient.phone || 'See patient record',
    email: `contact@${(patient.primaryCareProvider || 'provider').toLowerCase().replace(/\s+/g, '')}.health`,
    networkTier: 'Preferred',
    npi: 'See patient record',
  };
}

function careManagerMember(careManager: string, id: string): CareTeamMember {
  return {
    id,
    name: careManager,
    role: 'Care Manager',
    relationship: 'Care Manager',
    phone: 'See care team assignment',
    email: `${careManager.toLowerCase().replace(/\s+/g, '')}@careteam.health`,
    networkTier: 'Preferred',
    npi: 'See care team assignment',
  };
}

export function assembleCareTeam(analysis: PatientAnalysis, patient: Patient): CareTeamMember[] {
  const team: CareTeamMember[] = [];
  let teamCounter = 1;

  team.push(primaryCareMember(patient, `team-${teamCounter++}`));

  const careManager = readCareManager(patient);
  if (careManager) team.push(careManagerMember(careManager, `team-${teamCounter++}`));

  analysis.specialtiesNeeded.forEach((specialty) => {
    if (specialty === 'Care Management' || specialty === 'Social Work') {
      const roleName = specialty === 'Care Management' ? 'Care Manager' : 'Social Worker';
      team.push({
        id: `team-${teamCounter++}`,
        name: `${specialty} (to be assigned)`,
        role: roleName,
        relationship: specialty === 'Care Management' ? 'Care Manager' : 'Consultant',
        phone: 'See care team assignment',
        email: `${specialty.toLowerCase().replace(/\s+/g, '')}@careteam.health`,
        networkTier: 'Preferred',
        npi: 'Pending assignment',
      });
    } else {
      team.push({
        id: `team-${teamCounter++}`,
        name: `${specialty} Specialist (referral pending)`,
        role: `${specialty} Specialist`,
        specialty: specialty,
        relationship: 'Consultant',
        phone: 'Pending referral',
        email: 'Pending referral',
        networkTier: 'In-Network',
        npi: 'Pending referral',
      });
    }
  });

  return team;
}

/** Build care team from a holistic plan (verbatim legacy behavior). */
export function buildCareTeamFromHolisticPlan(
  holisticPlan: HolisticCarePlan,
  patient: Patient
): CareTeamMember[] {
  const team: CareTeamMember[] = [];
  let teamCounter = 1;

  team.push(primaryCareMember(patient, `team-${teamCounter++}`));

  const careManager = readCareManager(patient);
  if (careManager) team.push(careManagerMember(careManager, `team-${teamCounter++}`));

  if (holisticPlan.rootCauseAnalysis.primaryBlocker.type === 'caregiver-burden') {
    team.push({
      id: `team-${teamCounter++}`,
      name: 'Social Worker (to be assigned)',
      role: 'Social Worker',
      relationship: 'Consultant',
      phone: 'Pending assignment',
      email: 'Pending assignment',
      networkTier: 'Preferred',
      npi: 'Pending assignment',
    });
  }

  const specialistProviders = new Set<string>();
  holisticPlan.interventions.forEach((intervention) => {
    intervention.actions.forEach((action) => {
      if (
        action.provider &&
        !action.provider.includes('Team') &&
        !action.provider.includes('Services') &&
        !action.provider.includes('Program')
      ) {
        specialistProviders.add(action.provider);
      }
    });
  });

  specialistProviders.forEach((provider) => {
    const specialty = provider.includes('Cardio')
      ? 'Cardiology'
      : provider.includes('Endo')
        ? 'Endocrinology'
        : provider.includes('Nephro')
          ? 'Nephrology'
          : provider.includes('Pulmo')
            ? 'Pulmonology'
            : provider;

    team.push({
      id: `team-${teamCounter++}`,
      name: `${specialty} Specialist (referral pending)`,
      role: `${specialty} Specialist`,
      specialty: specialty,
      relationship: 'Consultant',
      phone: 'Pending referral',
      email: 'Pending referral',
      networkTier: 'In-Network',
      npi: 'Pending referral',
    });
  });

  return team;
}
