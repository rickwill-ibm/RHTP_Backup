import { describe, it, expect, afterEach } from 'vitest';
import { getAgentDemoActions, authoredAgentActions } from '@/lib/agents/demo';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

afterEach(() => clearSessionDataModes());

describe('agentRuntime demo seam (mock authored actions vs real runtime)', () => {
  it('mock mode returns the authored agent actions (the demo stays green)', async () => {
    setSessionDataMode('agentRuntime', 'mock');
    const { actions, mode } = await getAgentDemoActions();
    expect(mode).toBe('mock');
    expect(actions).toEqual(authoredAgentActions());
    expect(actions.map((a) => a.agentId)).toEqual([
      'outreach-agent',
      'referral-coordination-agent',
      'pa-documentation-agent',
    ]);
  });

  it('production mode runs the real agents; the emergent actions match the authored parity', async () => {
    setSessionDataMode('agentRuntime', 'production');
    const { actions, mode } = await getAgentDemoActions();
    expect(mode).toBe('production');
    // Emergent from SDE -> dispatcher -> agents -> HITL approve -> executed.
    expect(actions.every((a) => a.outcome === 'executed')).toBe(true);
    expect(actions).toEqual(authoredAgentActions()); // authored == emergent (parity)
  });
});
