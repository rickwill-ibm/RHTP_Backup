import { describe, it, expect } from 'vitest';
import { CONTRACTS, contractName } from '@/lib/contracts';

describe('contracts registry (population scope selector options)', () => {
  it('exposes the selectable value-based contracts', () => {
    expect(CONTRACTS.length).toBeGreaterThan(0);
    expect(CONTRACTS.find((c) => c.id === 'contract-001')).toBeDefined();
    expect(CONTRACTS.every((c) => c.id && c.name && c.program)).toBe(true);
  });
  it('contractName resolves known ids and falls back for null/unknown', () => {
    expect(contractName('contract-001')).toBe('SD RHTP — Track 3');
    expect(contractName(null)).toBe('All contracts');
    expect(contractName('does-not-exist')).toBe('All contracts');
  });
});
