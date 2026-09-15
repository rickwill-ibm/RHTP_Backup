// @vitest-environment jsdom
/**
 * SimulationConsole + ScenarioTable — render tests (Wave-13.1 HIGH-3, E13 test-link).
 *
 * Proves the console renders the recovery-policy simulator and that the batch table's
 * Gate column surfaces the interlock GATE outcome (resolved / BLOCKED) — including a
 * BLOCKED row for the fail-closed governance cohort. PHI-safe (codes/rungs/amounts only).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SimulationConsole } from '@/components/goldenThread/SimulationConsole';
import { ScenarioTable } from '@/components/goldenThread/ScenarioTable';
import {
  simulateCohort,
  batchById,
  DEFAULT_POLICY,
} from '@/lib/goldenThread/recoverySimulation';

afterEach(cleanup);

describe('SimulationConsole', () => {
  it('renders the recovery-policy simulator header and levers', () => {
    render(<SimulationConsole />);
    expect(screen.getByText('Recovery policy simulator')).toBeTruthy();
    expect(screen.getByText(/Agent autonomy tier/i)).toBeTruthy();
  });
});

describe('ScenarioTable — interlock Gate column', () => {
  it('shows a Gate column and holds the fail-closed cohort BLOCKED', () => {
    const cohort = simulateCohort(batchById('gov-failclosed').scenarios, {
      ...DEFAULT_POLICY,
      autonomyCeiling: 'autonomous',
    });
    render(<ScenarioTable current={cohort} />);
    expect(screen.getByText('Gate')).toBeTruthy();
    // The adverse / submission / thin-evidence probes cannot auto-resolve → BLOCKED.
    expect(screen.getAllByText('BLOCKED').length).toBeGreaterThan(0);
  });
});
