// @vitest-environment jsdom
/**
 * TwinLadderInterlock — render tests (Wave-5 UI, E13 test-link).
 *
 * Proves the visualization consumes the REAL governance model (permittedRung /
 * AUTONOMY_RUNG / TIER_RUNG_CEILING) rather than a local mapping, states the
 * weakest-link constraint honestly, and asserts the two honest invariants
 * (submission human-gated; seal ≠ tier). PHI-safe (renders no member reference).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TwinLadderInterlock } from '@/components/goldenThread/TwinLadderInterlock';
import { permittedRung } from '@/lib/agents/governance/interlock';

afterEach(cleanup);

describe('TwinLadderInterlock', () => {
  it('renders both ladders and the imported permitted rung (evidence-capped case)', () => {
    // HITL grants A1; D2 caps at A2 → permitted = A1 (autonomy is the binding constraint).
    const permitted = permittedRung('HITL', 'D2');
    expect(permitted).toBe('A1');
    render(
      <TwinLadderInterlock
        evidenceTier="D2"
        manifestTier="HITL"
        grantedRung={permitted}
        requiresHumanForSubmission
      />
    );
    expect(screen.getByLabelText(/twin-ladder governance interlock/i)).toBeTruthy();
    // Both ladders present.
    expect(screen.getByLabelText('Evidence tier')).toBeTruthy();
    expect(screen.getByLabelText('Authority rung')).toBeTruthy();
    // The permitted rung and the honest human-gate invariant are stated.
    expect(screen.getAllByText(/A1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/human-gated regardless of rung/i)).toBeTruthy();
    expect(screen.getByText(/does not change the tier/i)).toBeTruthy();
  });

  it('shows evidence as the binding constraint when the tier caps below the autonomy grant', () => {
    // autonomous grants A3; D1 caps at A1 → permitted A1, capped BY EVIDENCE.
    const permitted = permittedRung('autonomous', 'D1');
    expect(permitted).toBe('A1');
    render(
      <TwinLadderInterlock
        evidenceTier="D1"
        manifestTier="autonomous"
        grantedRung={permitted}
        requiresHumanForSubmission
      />
    );
    expect(screen.getByText(/evidence is the binding constraint/i)).toBeTruthy();
  });
});
