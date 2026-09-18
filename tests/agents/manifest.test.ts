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
import { buildRecoveryAction } from '@/lib/agents/revenueCycle';
import { isAutoApprovable } from '@/lib/agents/governance';
import type { RecoveryTask } from '@/lib/agents/revenueCycle';

describe('agent manifest registry (manifest-as-data, §10.2)', () => {
  it('registers exactly the pre-allocated agent ids', () => {
    expect(loadAgentManifests().ids().sort()).toEqual(
      [
        'outreach-agent',
        'pa-documentation-agent',
        'referral-coordination-agent',
        'revenue-cycle-agent',
      ].sort(),
    );
  });

  it('revenue-cycle agent is HITL and cannot submit WITHOUT a qualified-human decision (FIX-1 Wave-4 evolution)', () => {
    const m = getAgentManifest('revenue-cycle-agent');
    expect(m.autonomyTier).toBe('HITL');
    expect(m.phiPosture).toBe('references-only');
    // FIX-1 EVOLVED: submission is no longer structurally impossible — the allowlist
    // now carries the governed `claim.submit-appeal` tool. It is impossible WITHOUT a
    // qualified-human decision: the tool is reachable ONLY in the workflow's
    // post-approval branch (proven in revenueCycle.test.ts), and the proposal is not
    // auto-approvable at ANY tier.
    expect(m.toolAllowlist).toContain('claim.submit-appeal');
    // The proposal a recovery drafts is a submission → never auto-approvable, even at
    // the most permissive autonomy tier (no auto-submit hole at any tier).
    const task: RecoveryTask = {
      claimId: 'claim-1',
      remittanceId: 'rem-1',
      authId: 'auth-1',
      delta: 1234,
      evidenceTier: 'D3',
      priority: 'high',
    };
    expect(isAutoApprovable(buildRecoveryAction(task), 'autonomous')).toBe(false);
    expect(isAutoApprovable(buildRecoveryAction(task), 'HOTL')).toBe(false);
    expect(isAutoApprovable(buildRecoveryAction(task), 'HITL')).toBe(false);
    // The OTHER payer-facing submit-tool names stay forbidden — only the single,
    // named, governed `claim.submit-appeal` is granted (least privilege).
    const STILL_FORBIDDEN_SUBMISSION_TOOLS = [
      'claim.submit',
      'appeal.submit',
      'claim.transmit',
      'claim.draft-appeal',
      'submit-appeal',
    ];
    for (const t of STILL_FORBIDDEN_SUBMISSION_TOOLS) expect(m.toolAllowlist).not.toContain(t);
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
