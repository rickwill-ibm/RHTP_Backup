import { describe, it, expect } from 'vitest';
import { CONTRACT_MOD, BASE } from '@/app/executive-outcomes-dashboard/executiveOutcomesData';

describe('executiveOutcomesData contract modifiers', () => {
  it('defines a rescaling modifier for every selectable contract', () => {
    for (const id of ['contract-001', 'contract-002', 'contract-003', 'contract-004']) {
      expect(CONTRACT_MOD[id]).toBeDefined();
      expect(CONTRACT_MOD[id].livesMod).toBeGreaterThan(0);
    }
    expect(CONTRACT_MOD['contract-001'].livesMod).toBe(1); // baseline contract = unscaled
    expect(BASE.totalLives).toBeGreaterThan(0);
  });
});
