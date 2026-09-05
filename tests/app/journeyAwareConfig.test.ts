import { describe, it, expect } from 'vitest';
import {
  OUTCOME_CONFIG,
  TYPE_CONFIG,
} from '@/app/journey-aware-context/journey-aware-context.config';

describe('journey-aware-context config', () => {
  it('OUTCOME_CONFIG covers the outcome states with color/bg/label', () => {
    for (const k of [
      'engaged',
      'converted',
      'ignored',
      'suppressed',
      'no_answer',
      'consent_check',
    ]) {
      expect(OUTCOME_CONFIG[k]).toMatchObject({
        color: expect.any(String),
        bg: expect.any(String),
        label: expect.any(String),
      });
    }
  });

  it('TYPE_CONFIG covers the interaction types with a label', () => {
    for (const k of [
      'outreach',
      'response',
      'escalation',
      'session',
      'inbound',
      'outbound',
      'visit',
    ]) {
      expect(TYPE_CONFIG[k].label).toEqual(expect.any(String));
    }
  });
});
