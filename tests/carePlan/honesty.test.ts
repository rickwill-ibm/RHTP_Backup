/** Care-plan honesty & observability (F5 care-team labelling, F7 observable fallback). */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setClock } from '@/lib/clock';
import { generateHolisticCarePlan, generateComprehensiveCarePlan } from '@/lib/carePlan';
import type { ComprehensivePlanInput } from '@/lib/carePlan';
import { checkCareTeamContactHonesty } from '@/lib/carePlan/validator';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { setProductionHolisticAggregator } from '@/lib/wpc/holisticContext';
import diabetesTransportation from './fixtures/diabetes-transportation.json';

const input = (diabetesTransportation as { input: ComprehensivePlanInput }).input;

beforeAll(() => setClock(() => Date.parse('2026-08-22T12:00:00Z')));
afterAll(() => setClock(null));
afterEach(() => {
  clearSessionDataModes();
  setProductionHolisticAggregator(null);
});

describe('care-plan honesty & observability', () => {
  it('holistic fallback is observable when the holistic path fails over', () => {
    setSessionDataMode('wpcRecord', 'production'); // sync resolver fails closed -> fallback
    const plan = generateHolisticCarePlan(input);
    expect(plan.holisticPlan).toBeUndefined();
    expect(plan.fallback?.used).toBe(true);
    expect(typeof plan.fallback?.reason).toBe('string');
  });

  it('mock holistic path sets no fallback marker (demo intact)', () => {
    setSessionDataMode('wpcRecord', 'mock');
    const plan = generateHolisticCarePlan({
      ...input,
      patient: { ...input.patient, id: 'patient-001' },
    });
    expect(plan.fallback).toBeUndefined();
    expect(plan.holisticPlan).toBeDefined();
  });

  it('comprehensive care-team contacts are labelled synthesized, not passed off as real', () => {
    const plan = generateComprehensiveCarePlan(input);
    expect(plan.careTeam.length).toBeGreaterThan(0);
    expect(plan.careTeam.every((m) => m.contactProvenance === 'synthesized-placeholder')).toBe(
      true
    );
    expect(checkCareTeamContactHonesty(plan).length).toBe(plan.careTeam.length);
  });
});
