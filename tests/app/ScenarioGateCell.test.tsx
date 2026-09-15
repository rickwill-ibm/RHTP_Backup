// @vitest-environment jsdom
/**
 * ScenarioGateCell — render tests (Wave-13.1 HIGH-3, E13 test-link).
 *
 * The badge that lets a viewer SEE the interlock GATE hold an adverse / submission action
 * in the recovery-simulation table: `resolved` (green) vs BLOCKED (red, with the reason).
 * PHI-safe: renders a status word only.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ScenarioGateCell } from '@/components/goldenThread/ScenarioGateCell';

afterEach(cleanup);

describe('ScenarioGateCell', () => {
  it('shows "resolved" when the action may proceed autonomously', () => {
    render(
      <ScenarioGateCell resolved requiresHuman={false} adverse={false} submission={false} />
    );
    expect(screen.getByText('resolved')).toBeTruthy();
  });

  it('shows BLOCKED with an adverse reason when the gate holds an adverse action', () => {
    render(
      <ScenarioGateCell resolved={false} requiresHuman adverse submission={false} />
    );
    expect(screen.getByText('BLOCKED')).toBeTruthy();
    expect(screen.getByText(/adverse/i)).toBeTruthy();
  });

  it('shows BLOCKED with a submission reason for a payer-facing submission', () => {
    render(
      <ScenarioGateCell resolved={false} requiresHuman adverse={false} submission />
    );
    expect(screen.getByText('BLOCKED')).toBeTruthy();
    expect(screen.getByText(/submission/i)).toBeTruthy();
  });
});
