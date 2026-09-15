import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
// tieredInterventionGenerator.helpers.ts — Tier-specific intervention builder functions

import type { HolisticPatientContext } from './holisticContextEngine';
import type { TieredIntervention, InterventionAction } from './tieredInterventionGenerator.types';

/** Calculate specific date from days offset — returns e.g. "Thursday, March 17, 2026" */
export function calculateSpecificDate(daysFromNow: number): string {
  const date = clock.nowDate();
  date.setDate(date.getDate() + daysFromNow);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** TIER 1: Caregiver support intervention */
export function buildCaregiverSupportIntervention(
  context: HolisticPatientContext
): TieredIntervention {
  const dependentNames = context.caregiverStatus.dependents
    .map((d) => `${d.name} (${d.age})`)
    .join(' and ');

  const actions: InterventionAction[] = [
    {
      action: 'Refer to South Dakota Lifespan Respite Care Program',
      provider: 'SD Department of Social Services',
      timeline: 'Immediate',
      expectedOutcome: '4-8 hours/week respite care',
      modality: 'in-person',
      status: 'pending',
    },
  ];

  if (
    context.caregiverStatus.dependents.some(
      (d) => d.relationship === 'child' && d.healthStatus === 'special-needs'
    )
  ) {
    actions.push({
      action: 'Connect with Autism Family Support Services',
      provider: 'Autism Speaks South Dakota',
      timeline: 'Week 1',
      expectedOutcome: 'In-home support 2x/week',
      modality: 'home-visit',
      status: 'pending',
    });
  }
  if (
    context.caregiverStatus.dependents.some(
      (d) => d.relationship === 'parent' && d.healthStatus === 'frail'
    )
  ) {
    actions.push({
      action: 'Arrange adult day care program',
      provider: 'Senior Services of South Dakota',
      timeline: 'Week 2',
      expectedOutcome: '3 days/week adult day care',
      modality: 'in-person',
      status: 'pending',
    });
  }
  actions.push({
    action: 'Enroll in caregiver support group',
    provider: 'Family Caregiver Alliance',
    timeline: 'Week 1',
    expectedOutcome: 'Peer support + resources',
    modality: 'telehealth',
    status: 'pending',
  });

  return {
    tier: 1,
    priority: 'critical',
    category: 'caregiver-support',
    title: 'Establish Respite Care and Caregiver Support',
    description: `Connect ${context.patient.name} with respite care services for ${dependentNames} to enable attendance at medical appointments`,
    rationale: `ROOT CAUSE: ${context.patient.name} cannot attend appointments because dependents cannot be left alone. Respite care must come first.`,
    actions,
    successMetrics: [
      `${context.patient.name} has 8+ hours/week without caregiving responsibilities`,
      `${context.patient.name} can attend medical appointments`,
      'Caregiver burden score decreases to < 60',
    ],
    blockerAddressed: 'caregiver-burden',
    enablesOtherInterventions: true,
    estimatedTimeframe: 'Weeks 1-2',
    estimatedCost: 0,
    burdenScore: 20,
  };
}

/** TIER 1: Transportation intervention (if root cause) */
export function buildTransportationIntervention(
  context: HolisticPatientContext
): TieredIntervention {
  return {
    tier: 1,
    priority: 'critical',
    category: 'transportation',
    title: 'Establish Reliable Transportation',
    description: 'Connect with transportation services and maximize alternative care delivery',
    rationale: `ROOT CAUSE: ${context.patient.name} cannot access healthcare due to transportation barrier`,
    actions: [
      {
        action: 'Activate Unite Us transportation services',
        provider: 'Unite Us',
        timeline: 'Immediate',
        expectedOutcome: 'Scheduled rides to appointments',
        modality: 'in-person',
      },
      {
        action: 'Enroll in Medicaid non-emergency medical transportation',
        provider: 'SD Medicaid',
        timeline: 'Week 1',
        expectedOutcome: 'Covered transportation to medical appointments',
        modality: 'in-person',
      },
    ],
    successMetrics: [
      'Reliable transportation available for all appointments',
      'Zero missed appointments due to transportation',
    ],
    blockerAddressed: 'transportation',
    enablesOtherInterventions: true,
    estimatedTimeframe: 'Weeks 1-2',
    estimatedCost: 0,
    burdenScore: 30,
  };
}

/** TIER 2: Caregiver-friendly transportation */
export function buildCaregiverFriendlyTransportation(
  context: HolisticPatientContext
): TieredIntervention {
  const distanceToLabCorp = context.accessProfile.distanceToNearestFacility || 45;
  const travelTime = Math.round((distanceToLabCorp / 45) * 60);
  const labLocation = context.accessProfile.nearestLabLocation || 'Rapid City';
  const labDate = calculateSpecificDate(14);

  return {
    tier: 2,
    priority: 'high',
    category: 'transportation',
    title: 'Coordinate Transportation for Clinical Care',
    description: `Arrange transportation to LabCorp (${distanceToLabCorp} miles) during respite care windows`,
    rationale: `Rural distance (${distanceToLabCorp} miles) requires careful coordination with respite care schedule. Batch appointments to minimize trips.`,
    actions: [
      {
        action: 'Activate Unite Us transportation services',
        provider: 'Unite Us - (800) 555-RIDE',
        timeline: 'Immediate (within 48 hours)',
        expectedOutcome: 'Transportation account activated, rides can be scheduled',
        modality: 'phone',
        status: 'pending',
      },
      {
        action: `Schedule LabCorp appointment for HbA1c + Comprehensive Metabolic Panel`,
        provider: `LabCorp - 1234 Medical Plaza Dr, ${labLocation}, SD 57701`,
        timeline: `${labDate} at 10:00 AM`,
        expectedOutcome: `A1C gap closed, diabetes control assessed. Fasting required (8 hours). Results in 48 hours.`,
        modality: 'in-person',
        status: 'pending',
      },
      {
        action: `Arrange Unite Us transportation pickup and return`,
        provider: 'Unite Us + Care Coordinator',
        timeline: `${labDate}: Pickup 9:15 AM, Return 11:30 AM`,
        expectedOutcome: `Round-trip from home to LabCorp ${labLocation} (${distanceToLabCorp} miles, ${travelTime * 2} min total). Medicaid NEMT covered.`,
        modality: 'in-person',
        status: 'pending',
      },
      {
        action: 'Confirm respite care coverage during lab visit',
        provider: 'Care Coordinator',
        timeline: `${labDate} 9:00 AM - 12:00 PM`,
        expectedOutcome:
          'Sophia with Autism support worker, Elena at adult day care. Backup contact confirmed.',
        modality: 'in-person',
        status: 'pending',
      },
    ],
    successMetrics: [
      'Transportation scheduled for lab appointment',
      'Respite care active during travel time',
      'All in-person care batched on same day',
      'Zero missed appointments due to transportation',
    ],
    blockerAddressed: 'transportation',
    dependsOn: ['Tier 1: Respite care established'],
    estimatedTimeframe: 'Weeks 2-3',
    estimatedCost: 0,
    burdenScore: 35,
  };
}

/** TIER 3: Care delivery optimization */
export function buildCareDeliveryOptimization(context: HolisticPatientContext): TieredIntervention {
  const actions: InterventionAction[] = [
    {
      action: 'Schedule consolidated care days',
      provider: 'Care Coordination Team',
      timeline: 'Ongoing',
      expectedOutcome: 'All in-person appointments on same day',
      modality: 'in-person',
    },
    {
      action: 'Convert eligible appointments to telehealth',
      provider: 'Multiple specialists',
      timeline: 'Immediate',
      expectedOutcome: '60% reduction in travel needs',
      modality: 'telehealth',
    },
    {
      action: 'Arrange home-based lab services',
      provider: 'Mobile Lab Services',
      timeline: 'Week 1',
      expectedOutcome: 'Zero trips for routine labs',
      modality: 'home-visit',
    },
    {
      action: 'Set up mail-order pharmacy',
      provider: 'Pharmacy',
      timeline: 'Week 1',
      expectedOutcome: 'Medications delivered to home',
      modality: 'home-visit',
    },
  ];
  if (context.caregiverStatus.isCaregiverForOthers) {
    actions.push({
      action: 'Coordinate family care days',
      provider: 'Care Coordination Team',
      timeline: 'Ongoing',
      expectedOutcome: 'All family members seen same day/location when possible',
      modality: 'in-person',
    });
  }
  return {
    tier: 3,
    priority: 'high',
    category: 'care-delivery-optimization',
    title: 'Minimize Appointment Burden Through Smart Scheduling',
    description:
      'Consolidate appointments and maximize telehealth to reduce time away from caregiving',
    rationale: `Even with respite care, minimize time burden on ${context.patient.name}`,
    actions,
    successMetrics: [
      'Maximum 1 in-person visit per month',
      '80% of care delivered via telehealth or home visits',
      'Family appointments consolidated when applicable',
    ],
    blockerAddressed: 'time-scarcity',
    dependsOn: ['Tier 1: Root cause addressed', 'Tier 2: Transportation'],
    estimatedTimeframe: 'Weeks 3-4',
    estimatedCost: 0,
    burdenScore: 15,
  };
}

/** TIER 4: Clinical care intervention */
export function buildClinicalCareIntervention(context: HolisticPatientContext): TieredIntervention {
  const actions: InterventionAction[] = [];
  const labLocation = context.accessProfile.nearestLabLocation || 'Rapid City';
  const labDate = calculateSpecificDate(21);
  const pndDate = calculateSpecificDate(28);
  const pcpFollowupDate = calculateSpecificDate(35);
  const cardioDate = calculateSpecificDate(35);
  const eyeExamDate = calculateSpecificDate(42);

  if (context.clinicalProfile.openCareGaps.some((g) => g.type === 'HEDIS_CDC')) {
    actions.push({
      action: `Complete HbA1c + Comprehensive Metabolic Panel at LabCorp`,
      provider: `LabCorp - 1234 Medical Plaza Dr, ${labLocation}, SD 57701`,
      timeline: `${labDate} at 10:00 AM`,
      expectedOutcome:
        'A1C gap closed, diabetes control assessed. Fasting required (8 hours). Results available in 48 hours for PCP review.',
      modality: 'in-person',
      status: 'pending',
    });
    actions.push({
      action: 'Schedule telehealth follow-up to review A1C results',
      provider: 'Dr. James Whitfield, Primary Care - MyChart video visit',
      timeline: `${pcpFollowupDate} at 2:00 PM`,
      expectedOutcome:
        'Review A1C results, adjust diabetes medications if needed (target A1C < 8.0%). Discuss diet and exercise plan.',
      modality: 'telehealth',
      status: 'pending',
    });
  }

  context.clinicalProfile.openCareGaps.forEach((gap) => {
    if (gap.type === 'HEDIS_CBP') {
      actions.push({
        action: 'Schedule telehealth cardiology consultation for hypertension',
        provider: 'Dr. Michael Chen, Cardiology - MyChart video visit',
        timeline: `${cardioDate} at 3:00 PM`,
        expectedOutcome:
          'BP medication review and adjustment. Bring 7-day BP log (3x daily readings). Target BP < 130/80.',
        modality: 'telehealth',
        status: 'pending',
      });
    } else if (gap.type === 'HEDIS_EED') {
      actions.push({
        action: 'Schedule diabetic eye exam (batch with quarterly labs)',
        provider: `Dr. Lisa Park, Ophthalmology - Same building as LabCorp ${labLocation}`,
        timeline: `${eyeExamDate} at 11:00 AM`,
        expectedOutcome:
          'Dilated eye exam for diabetic retinopathy screening. Bring sunglasses. Same transportation as lab visit.',
        modality: 'in-person',
        status: 'pending',
      });
    } else if (gap.type === 'Depression_Screening') {
      actions.push({
        action: 'Schedule telehealth Edinburgh Postnatal Depression screening',
        provider: 'Dr. Sarah Johnson, Behavioral Health - Zoom video visit',
        timeline: `${pndDate} at 2:00 PM`,
        expectedOutcome:
          'Complete Edinburgh PND Scale (10 questions, 30 min). Support plan if score > 10. Referral to therapy if needed.',
        modality: 'telehealth',
        status: 'pending',
      });
    }
  });

  if (context.clinicalProfile.chronicConditions.some((c) => c.name.includes('Diabetes'))) {
    actions.push({
      action: 'Enroll in virtual Diabetes Self-Management Education (DSME) program',
      provider: 'Sarah Martinez, Certified Diabetes Educator - Weekly Zoom sessions',
      timeline: `Starting ${pcpFollowupDate}, 8-week program`,
      expectedOutcome:
        'Complete 8-week DSME course. Topics: nutrition, medication, monitoring, foot care. Certificate upon completion.',
      modality: 'telehealth',
      status: 'pending',
    });
  }

  return {
    tier: 4,
    priority: 'high',
    category: 'clinical-care',
    title: 'Close Clinical Care Gaps (A1C, Depression, Eye Exam)',
    description: `Address primary A1C gap and other clinical needs using rural-appropriate care delivery`,
    rationale: `With respite care (Tier 1) and transportation (Tier 2) in place, ${context.patient.name} can now complete essential clinical care. Prioritize A1C testing to assess diabetes control.`,
    actions,
    successMetrics: [
      'A1C gap closed within 3 weeks',
      'All HEDIS care gaps closed within 90 days',
      'HbA1c < 8.0% (target)',
      'BP < 130/80',
      'Depression screening completed',
      'Diabetic eye exam completed',
    ],
    blockerAddressed: 'clinical-complexity',
    dependsOn: ['Tier 1-3: Barriers addressed'],
    estimatedTimeframe: 'Weeks 4-12',
    estimatedCost: 0,
    burdenScore: 10,
  };
}

/** TIER 5: Sustainability intervention */
export function buildSustainabilityIntervention(
  context: HolisticPatientContext
): TieredIntervention {
  const actions: InterventionAction[] = [
    {
      action: 'Enroll in care management program',
      provider: 'RHTP Care Management',
      timeline: 'Immediate',
      expectedOutcome: 'Dedicated care manager',
      modality: 'phone',
    },
  ];
  if (context.financialProfile.financialStressScore > 60) {
    actions.push({
      action: 'Connect with caregiver financial assistance programs',
      provider: 'SD Medicaid Waiver Programs',
      timeline: 'Week 2',
      expectedOutcome: 'Financial support for caregiving',
      modality: 'phone',
    });
  }
  if (context.psychosocialProfile.socialIsolation) {
    actions.push({
      action: 'Establish peer support network',
      provider: 'Caregiver Support Group',
      timeline: 'Ongoing',
      expectedOutcome: 'Social connection + shared resources',
      modality: 'telehealth',
    });
  }
  return {
    tier: 5,
    priority: 'moderate',
    category: 'sustainability',
    title: 'Build Long-term Support System',
    description: 'Ensure patient has ongoing support to maintain health',
    rationale: 'Prevent future crises by building sustainable support',
    actions,
    successMetrics: [
      'Ongoing care management support',
      'Financial burden reduced by 30%',
      'Social isolation score improved',
    ],
    blockerAddressed: 'sustainability',
    dependsOn: ['Tier 1-4: Foundation established'],
    estimatedTimeframe: 'Ongoing',
    estimatedCost: 0,
    burdenScore: 5,
  };
}
