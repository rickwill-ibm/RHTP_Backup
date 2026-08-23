/**
 * Legacy delegate equivalence — the five frozen src/lib/services/
 * carePlanGenerator*.ts files must expose EXACTLY the domain module's
 * implementations (thin re-exports, zero drift). Retires with the legacy
 * files (g5-careplan.md section 3.5 step 4).
 */
import { describe, it, expect } from 'vitest';
import * as domain from '@/lib/carePlan';
import * as legacyMain from '@/lib/services/carePlanGenerator';
import * as legacyHelpers from '@/lib/services/carePlanGenerator.helpers';
import * as legacyGoals from '@/lib/services/carePlanGenerator.goals';
import * as legacyHolistic from '@/lib/services/carePlanGenerator.holistic';

describe('legacy delegates re-export the domain implementations', () => {
  it('carePlanGenerator.ts entry points are the domain functions', () => {
    expect(legacyMain.generateComprehensiveCarePlan).toBe(domain.generateComprehensiveCarePlan);
    expect(legacyMain.generateHolisticCarePlan).toBe(domain.generateHolisticCarePlan);
  });

  it('carePlanGenerator.helpers.ts delegates analysis and referral helpers', () => {
    expect(legacyHelpers.analyzePatientData).toBe(domain.analyzePatientData);
    expect(legacyHelpers.assignInterventionsToGoals).toBe(domain.assignInterventionsToGoals);
    expect(legacyHelpers.createReferralsForCareGaps).toBe(domain.createReferralsForCareGaps);
    expect(legacyHelpers.detectSDoHNeeds).toBe(domain.detectSDoHNeeds);
    expect(legacyHelpers.identifySpecialties).toBe(domain.identifySpecialties);
  });

  it('carePlanGenerator.goals.ts delegates builders', () => {
    expect(legacyGoals.generateGoals).toBe(domain.generateGoals);
    expect(legacyGoals.generateInterventions).toBe(domain.generateInterventions);
    expect(legacyGoals.assembleCareTeam).toBe(domain.assembleCareTeam);
    expect(legacyGoals.determineOptimalModality).toBe(domain.determineOptimalModality);
  });

  it('carePlanGenerator.holistic.ts delegates the holistic conversion', () => {
    expect(legacyHolistic.convertHolisticToStandardPlan).toBe(domain.convertHolisticToStandardPlan);
    expect(legacyHolistic.mapModalityToType).toBe(domain.mapModalityToType);
    expect(legacyHolistic.mapStatusToStandard).toBe(domain.mapStatusToStandard);
  });
});
