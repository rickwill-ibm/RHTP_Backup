/**
 * Gap Closure Service
 *
 * Handles the complete closed-loop workflow for care gap closure:
 * 1. Specialist completes service
 * 2. Updates referral status to "completed"
 * 3. Marks care gap as "Closed"
 * 4. Updates quality metrics (increments numerator)
 * 5. Calculates and attributes gainshare (60/40 split)
 * 6. Notifies all listeners for real-time UI updates
 *
 * Author: Richard Hennessy — TCOC Total Cost of Care Clinical Platform
 */

import { referralStore } from '@/lib/mockData';
import type { Referral } from '@/lib/mockData';

export interface GapClosureRequest {
  referralId: string;
  specialistId: string;
  specialistName: string;
  serviceDate: string;
  serviceNotes?: string;
  clinicalEvidence?: {
    labResults?: Array<{ test: string; value: string; date: string }>;
    procedures?: Array<{ code: string; description: string; date: string }>;
    observations?: Array<{ type: string; value: string; date: string }>;
  };
}

export interface GapClosureResult {
  success: boolean;
  referral: Referral;
  gapClosed: boolean;
  qualityMetricUpdated: boolean;
  gainshareCalculated: boolean;
  providerGainshare: number;
  specialistGainshare: number;
  totalGainshare: number;
  message: string;
}

/**
 * Complete the gap closure workflow
 * This is called when a specialist marks a referral as complete
 */
export async function completeGapClosure(request: GapClosureRequest): Promise<GapClosureResult> {
  try {
    const referral = referralStore.getReferralById(request.referralId);

    if (!referral) {
      return {
        success: false,
        referral: null as any,
        gapClosed: false,
        qualityMetricUpdated: false,
        gainshareCalculated: false,
        providerGainshare: 0,
        specialistGainshare: 0,
        totalGainshare: 0,
        message: 'Referral not found',
      };
    }

    if (!referral.careGap) {
      return {
        success: false,
        referral,
        gapClosed: false,
        qualityMetricUpdated: false,
        gainshareCalculated: false,
        providerGainshare: 0,
        specialistGainshare: 0,
        totalGainshare: 0,
        message: 'No care gap associated with this referral',
      };
    }

    // Execute the complete workflow
    referralStore.closeGap(request.referralId, request.specialistId, request.specialistName);

    // Calculate gainshare amounts
    const totalGainshare = referral.careGap.gainshareAmount;
    const providerGainshare = Math.round(totalGainshare * 0.6);
    const specialistGainshare = Math.round(totalGainshare * 0.4);

    // Get updated referral
    const updatedReferral = referralStore.getReferralById(request.referralId)!;

    return {
      success: true,
      referral: updatedReferral,
      gapClosed: true,
      qualityMetricUpdated: true,
      gainshareCalculated: true,
      providerGainshare,
      specialistGainshare,
      totalGainshare,
      message: `Successfully closed gap: ${referral.careGap.description}. Gainshare attributed: Provider $${providerGainshare}, Specialist $${specialistGainshare}`,
    };
  } catch (error) {
    console.error('Error completing gap closure:', error);
    return {
      success: false,
      referral: null as any,
      gapClosed: false,
      qualityMetricUpdated: false,
      gainshareCalculated: false,
      providerGainshare: 0,
      specialistGainshare: 0,
      totalGainshare: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get all closed gaps for a patient
 */
export function getClosedGapsForPatient(patientId: string): Referral[] {
  return referralStore
    .getAllReferrals()
    .filter((r) => r.patientId === patientId && r.status === 'completed');
}

/**
 * Get quality metrics summary
 */
export function getQualityMetricsSummary() {
  const metrics = referralStore.getQualityMetrics();

  return {
    totalMeasures: metrics.length,
    averageRate: metrics.reduce((sum, m) => sum + m.rate, 0) / metrics.length,
    totalGapsClosed: metrics.reduce((sum, m) => sum + m.gapsClosed, 0),
    totalGapsOpen: metrics.reduce((sum, m) => sum + m.gapsOpen, 0),
    measuresAboveTarget: metrics.filter((m) => m.rate >= m.target).length,
    measuresBelowTarget: metrics.filter((m) => m.rate < m.target).length,
    metrics,
  };
}

/**
 * Get gainshare summary for a provider
 */
export function getProviderGainshareSummary(providerId: string) {
  const records = referralStore.getGainshareRecords();
  const providerRecords = records.filter((r) => r.providerId === providerId);

  return {
    totalEarned: providerRecords.reduce((sum, r) => sum + r.providerShare, 0),
    gapsClosed: providerRecords.length,
    byProgram: {
      HEDIS: providerRecords
        .filter((r) => r.measureId.startsWith('HEDIS'))
        .reduce((sum, r) => sum + r.providerShare, 0),
      STARS: providerRecords
        .filter((r) => r.measureId.startsWith('STARS'))
        .reduce((sum, r) => sum + r.providerShare, 0),
      MIPS: providerRecords
        .filter((r) => r.measureId.startsWith('MIPS'))
        .reduce((sum, r) => sum + r.providerShare, 0),
    },
    records: providerRecords,
  };
}

/**
 * Get gainshare summary for a specialist
 */
export function getSpecialistGainshareSummary(specialistId: string) {
  const records = referralStore.getGainshareRecords();
  const specialistRecords = records.filter((r) => r.specialistId === specialistId);

  return {
    totalEarned: specialistRecords.reduce((sum, r) => sum + r.specialistShare, 0),
    gapsClosed: specialistRecords.length,
    byProgram: {
      HEDIS: specialistRecords
        .filter((r) => r.measureId.startsWith('HEDIS'))
        .reduce((sum, r) => sum + r.specialistShare, 0),
      STARS: specialistRecords
        .filter((r) => r.measureId.startsWith('STARS'))
        .reduce((sum, r) => sum + r.specialistShare, 0),
      MIPS: specialistRecords
        .filter((r) => r.measureId.startsWith('MIPS'))
        .reduce((sum, r) => sum + r.specialistShare, 0),
    },
    records: specialistRecords,
  };
}

// Export service object
export const gapClosureService = {
  completeGapClosure,
  getClosedGapsForPatient,
  getQualityMetricsSummary,
  getProviderGainshareSummary,
  getSpecialistGainshareSummary,
};

// Made with Bob
