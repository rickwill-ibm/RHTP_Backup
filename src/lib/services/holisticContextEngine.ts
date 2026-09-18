import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
// ─── holisticContextEngine.ts ────────────────────────────────────────────────
// Class + singleton. Types live in holisticContextEngine.types.ts.

export type {
  HolisticPatientContext,
  PatientBasicInfo,
  ClinicalProfile,
  ChronicCondition,
  CareGap,
  Medication,
  BarrierProfile,
  BarrierDetail,
  CaregiverStatus,
  Dependent,
  CareRequirements,
  TimeAvailability,
  SupportSystem,
  FinancialProfile,
  InsuranceCoverage,
  AccessProfile,
  DigitalProfile,
  PsychosocialProfile,
  PHQ9Score,
  GAD7Score,
} from './holisticContextEngine.types';

import type {
  HolisticPatientContext,
  ClinicalProfile,
  BarrierProfile,
  CaregiverStatus,
  FinancialProfile,
  AccessProfile,
  DigitalProfile,
  PsychosocialProfile,
} from './holisticContextEngine.types';

export class HolisticContextEngine {
  /**
   * Build complete holistic context for a patient
   */
  buildContext(patientId: string): HolisticPatientContext {
    // In production, this would aggregate from multiple data sources
    // For now, return Maria's context as the demo patient

    if (patientId === 'patient-001' || patientId === 'maria-redhawk') {
      return this.getMariaContext();
    }

    // Default context for other patients
    return this.getDefaultContext(patientId);
  }

  /**
   * Get Maria Redhawk's complete holistic context
   */
  private getMariaContext(): HolisticPatientContext {
    return {
      patient: {
        id: 'patient-001',
        name: 'Maria Redhawk',
        age: 34,
        gender: 'Female',
        mrn: 'MRN-001',
      },

      clinicalProfile: {
        chronicConditions: [
          {
            name: 'Type 2 Diabetes Mellitus',
            icdCode: 'E11.9',
            severity: 'moderate',
            controlled: false,
            diagnosisDate: '2020-03-15',
          },
          {
            name: 'Chronic Kidney Disease Stage 3b',
            icdCode: 'N18.3',
            severity: 'high',
            controlled: true,
            diagnosisDate: '2021-06-20',
          },
          {
            name: 'Hypertension',
            icdCode: 'I10',
            severity: 'high',
            controlled: false,
            diagnosisDate: '2019-08-10',
          },
          {
            name: 'Heart Failure with Preserved Ejection Fraction (HFpEF)',
            icdCode: 'I50.32',
            severity: 'moderate',
            controlled: true,
            diagnosisDate: '2022-11-05',
          },
          {
            name: 'Atrial Fibrillation',
            icdCode: 'I48.91',
            severity: 'moderate',
            controlled: true,
            diagnosisDate: '2022-09-18',
          },
        ],
        conditionCount: 5,
        complexityScore: 78,
        riskLevel: 'high',
        openCareGaps: [
          {
            id: 'CG_MARIA_001',
            type: 'HEDIS_CDC',
            description: 'HbA1c test overdue',
            hedisCode: 'CDC',
            dueDate: '2026-06-01',
            priority: 'high',
          },
          {
            id: 'CG_MARIA_002',
            type: 'HEDIS_CBP',
            description: 'Blood pressure control',
            hedisCode: 'CBP',
            priority: 'high',
          },
          // REMOVED: Diabetic eye exam - Maria is PRE-diabetic, not diabetic
          // Eye exams are not indicated for pre-diabetic patients per clinical guidelines
        ],
        medications: [
          { name: 'Metformin', dosage: '1000mg', frequency: 'BID', class: 'Antidiabetic' },
          { name: 'Lisinopril', dosage: '20mg', frequency: 'Daily', class: 'ACE Inhibitor' },
          {
            name: 'Amlodipine',
            dosage: '10mg',
            frequency: 'Daily',
            class: 'Calcium Channel Blocker',
          },
          { name: 'Furosemide', dosage: '40mg', frequency: 'Daily', class: 'Diuretic' },
          { name: 'Apixaban', dosage: '5mg', frequency: 'BID', class: 'Anticoagulant' },
          { name: 'Atorvastatin', dosage: '40mg', frequency: 'Daily', class: 'Statin' },
          { name: 'Aspirin', dosage: '81mg', frequency: 'Daily', class: 'Antiplatelet' },
          { name: 'Carvedilol', dosage: '12.5mg', frequency: 'BID', class: 'Beta Blocker' },
          {
            name: 'Spironolactone',
            dosage: '25mg',
            frequency: 'Daily',
            class: 'Aldosterone Antagonist',
          },
          { name: 'Pantoprazole', dosage: '40mg', frequency: 'Daily', class: 'PPI' },
          { name: 'Vitamin D3', dosage: '2000 IU', frequency: 'Daily', class: 'Supplement' },
          { name: 'Multivitamin', dosage: '1 tablet', frequency: 'Daily', class: 'Supplement' },
        ],
        recentHospitalizations: 0,
        erVisits: 1,
      },

      barriers: {
        transportation: {
          severity: 'high',
          status: 'intervention-active',
          description: 'No reliable transportation, lives 45 miles from provider',
          interventionProvider: 'Unite Us',
          screeningDate: '2026-05-15',
        },
        financial: {
          severity: 'moderate',
          status: 'identified',
          description: 'Single income household, medical expenses for 3 people',
          screeningDate: '2026-05-15',
        },
        housing: {
          severity: 'low',
          status: 'resolved',
          description: 'Stable housing',
          screeningDate: '2026-05-15',
        },
        food: {
          severity: 'low',
          status: 'resolved',
          description: 'Food secure',
          screeningDate: '2026-05-15',
        },
        technology: {
          severity: 'low',
          status: 'resolved',
          description: 'Has smartphone and internet access',
          screeningDate: '2026-05-15',
        },
        language: {
          severity: 'none',
          status: 'not-screened',
          description: 'English speaking',
        },
      },

      caregiverStatus: {
        isCaregiverForOthers: true,
        dependents: [
          {
            name: 'Sophia',
            relationship: 'child',
            age: 2, // 24 months old
            healthStatus: 'healthy', // NO autism, NO special needs
            careRequirements: {
              dailyCareHours: 8, // Toddler requires full-time care
              medicalAppointments: 1, // Well-child visit needed
              specialNeeds: [], // NO special needs
              canBeLeftAlone: false, // Toddler cannot be left alone
            },
          },
          {
            name: 'Elena',
            relationship: 'child', // INFANT daughter, NOT elderly parent
            age: 0, // Infant (less than 1 year old)
            healthStatus: 'healthy', // Healthy infant
            careRequirements: {
              dailyCareHours: 12, // Infant requires constant care
              medicalAppointments: 0, // No overdue appointments
              specialNeeds: [], // NO special needs
              canBeLeftAlone: false, // Infant cannot be left alone
            },
          },
        ],
        caregiverBurdenScore: 85,
        timeAvailability: {
          weekdayMorning: 'limited',
          weekdayAfternoon: 'none',
          weekdayEvening: 'limited',
          weekend: 'none',
        },
        respiteCareAvailable: false,
        supportSystem: {
          familyNearby: false,
          friendSupport: false,
          communityResources: ['Unite Us transportation referral'],
        },
      },

      financialProfile: {
        householdIncome: 'low',
        insuranceCoverage: {
          type: 'Medicaid',
          copays: true,
          deductible: 0,
          hasSupplemental: false,
        },
        outOfPocketBurden: 250,
        employmentStatus: 'caregiver',
        financialStressScore: 72,
      },

      accessProfile: {
        ruralStatus: 'rural',
        distanceToProvider: 45,
        publicTransitAvailable: false,
        broadbandAccess: true,
        cellularCoverage: 'good',
        nearestPharmacy: 12,
        nearestER: 35,
        distanceToNearestFacility: 45, // LabCorp in Rapid City
        nearestLabLocation: 'Rapid City',
      },

      digitalProfile: {
        hasSmartphone: true,
        hasComputer: false,
        hasInternet: true,
        videoCapable: true,
        digitalLiteracy: 'moderate',
        preferredContactMethod: 'text',
      },

      psychosocialProfile: {
        healthLiteracy: 'moderate',
        motivationLevel: 'high',
        depressionScreening: {
          score: 8,
          severity: 'mild',
          screeningDate: '2026-05-15',
        },
        anxietyScreening: {
          score: 12,
          severity: 'moderate',
          screeningDate: '2026-05-15',
        },
        socialIsolation: true,
        stressLevel: 'severe',
      },

      contextGeneratedAt: clock.nowIso(),
    };
  }

  /**
   * Get default context for other patients
   */
  private getDefaultContext(patientId: string): HolisticPatientContext {
    return {
      patient: {
        id: patientId,
        name: 'Unknown Patient',
        age: 0,
        gender: 'Unknown',
      },
      clinicalProfile: {
        chronicConditions: [],
        conditionCount: 0,
        complexityScore: 0,
        riskLevel: 'low',
        openCareGaps: [],
        medications: [],
        recentHospitalizations: 0,
        erVisits: 0,
      },
      barriers: {
        transportation: { severity: 'none', status: 'not-screened' },
        financial: { severity: 'none', status: 'not-screened' },
        housing: { severity: 'none', status: 'not-screened' },
        food: { severity: 'none', status: 'not-screened' },
        technology: { severity: 'none', status: 'not-screened' },
        language: { severity: 'none', status: 'not-screened' },
      },
      caregiverStatus: {
        isCaregiverForOthers: false,
        dependents: [],
        caregiverBurdenScore: 0,
        timeAvailability: {
          weekdayMorning: 'available',
          weekdayAfternoon: 'available',
          weekdayEvening: 'available',
          weekend: 'available',
        },
        respiteCareAvailable: false,
        supportSystem: {
          familyNearby: false,
          friendSupport: false,
          communityResources: [],
        },
      },
      financialProfile: {
        householdIncome: 'moderate',
        insuranceCoverage: {
          type: 'Commercial',
          copays: true,
          deductible: 0,
        },
        outOfPocketBurden: 0,
        employmentStatus: 'employed',
        financialStressScore: 0,
      },
      accessProfile: {
        ruralStatus: 'suburban',
        distanceToProvider: 0,
        publicTransitAvailable: true,
        broadbandAccess: true,
        cellularCoverage: 'excellent',
        nearestPharmacy: 0,
        nearestER: 0,
      },
      digitalProfile: {
        hasSmartphone: true,
        hasComputer: true,
        hasInternet: true,
        videoCapable: true,
        digitalLiteracy: 'high',
        preferredContactMethod: 'portal',
      },
      psychosocialProfile: {
        healthLiteracy: 'high',
        motivationLevel: 'high',
        socialIsolation: false,
        stressLevel: 'low',
      },
      contextGeneratedAt: clock.nowIso(),
    };
  }

  /**
   * Calculate total caregiver hours per day
   */
  getTotalCaregiverHours(context: HolisticPatientContext): number {
    return context.caregiverStatus.dependents.reduce(
      (sum, dep) => sum + dep.careRequirements.dailyCareHours,
      0
    );
  }

  /**
   * Check if patient can leave home for appointments
   */
  canLeaveHomeForAppointments(context: HolisticPatientContext): boolean {
    if (!context.caregiverStatus.isCaregiverForOthers) {
      return true;
    }

    // Check if any dependent cannot be left alone
    const hasUnattendableDependent = context.caregiverStatus.dependents.some(
      (dep) => !dep.careRequirements.canBeLeftAlone
    );

    return !hasUnattendableDependent || context.caregiverStatus.respiteCareAvailable;
  }

  /**
   * Get available time windows for appointments
   */
  getAvailableTimeWindows(context: HolisticPatientContext): string[] {
    const windows: string[] = [];
    const availability = context.caregiverStatus.timeAvailability;

    if (availability.weekdayMorning === 'available') windows.push('Weekday mornings');
    if (availability.weekdayAfternoon === 'available') windows.push('Weekday afternoons');
    if (availability.weekdayEvening === 'available') windows.push('Weekday evenings');
    if (availability.weekend === 'available') windows.push('Weekends');

    if (windows.length === 0) {
      windows.push('Very limited - respite care needed');
    }

    return windows;
  }
}

// Export singleton instance
export const holisticContextEngine = new HolisticContextEngine();

// Made with Bob
