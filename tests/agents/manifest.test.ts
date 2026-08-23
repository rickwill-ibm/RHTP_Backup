import { describe, it, expect } from 'vitest';
import {
  getAgentManifest,
  loadAgentManifests,
  parseRegistry,
  defaultRegistry,
  AgentManifestError,
  UnknownAgentError,
  ToolNotAllowedError,
} from '@/lib/agents/manifest';

describe('agent manifest registry (manifest-as-data, §10.2)', () => {
  it('registers exactly the pre-allocated agent ids', () => {
    expect(loadAgentManifests().ids().sort()).toEqual(
      ['outreach-agent', 'pa-documentation-agent', 'referral-coordination-agent'].sort(),
    );
  });

  it('getAgentManifest reads authority from data', () => {
    const m = getAgentManifest('outreach-agent');
    expect(m.autonomyTier).toBe('HITL');
    expect(m.phiPosture).toBe('references-only');
    expect(m.escalationPolicyRef).toBe('default');
    expect(m.toolAllowlist).toContain('comms-channel.send');
  });

  it('unknown agent id throws UnknownAgentError', () => {
    expect(() => getAgentManifest('no-such-agent')).toThrow(UnknownAgentError);
  });

  it('least privilege: allowlist is enforced, not implicit', () => {
    const reg = defaultRegistry();
    // outreach agent may NOT touch the PA machine; PA agent may NOT send comms.
    expect(reg.isToolAllowed('outreach-agent', 'pa-machine.transition')).toBe(false);
    expect(reg.isToolAllowed('pa-documentation-agent', 'comms-channel.send')).toBe(false);
    expect(reg.isToolAllowed('pa-documentation-agent', 'pa-machine.transition')).toBe(true);
    expect(() => reg.assertToolAllowed('outreach-agent', 'pa-machine.transition')).toThrow(
      ToolNotAllowedError,
    );
    expect(() => reg.assertToolAllowed('outreach-agent', 'comms-channel.send')).not.toThrow();
  });

  it('a malformed manifest refuses LOUDLY (house pattern, no silent default)', () => {
    expect(() => parseRegistry({ version: '1', agents: [{ id: 'x' }] })).toThrow(AgentManifestError);
    expect(() =>
      parseRegistry({ version: '1', agents: [{ ...good(), autonomyTier: 'bogus' }] }),
    ).toThrow(/autonomyTier/);
    expect(() =>
      parseRegistry({ version: '1', agents: [good(), { ...good() }] }),
    ).toThrow(/duplicate agent id/);
  });
});

function good(): Record<string, unknown> {
  return {
    id: 'a1',
    version: '1.0.0',
    purpose: 'p',
    toolAllowlist: ['t'],
    autonomyTier: 'HITL',
    escalationPolicyRef: 'default',
    phiPosture: 'none',
    owningModule: 'm',
  };
}
