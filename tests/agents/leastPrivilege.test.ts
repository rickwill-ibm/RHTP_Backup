import { describe, it, expect } from 'vitest';
import { createRuntime, type WorkflowDefinition } from '@/lib/agentRuntime';
import { ToolNotAllowedError } from '@/lib/agents/manifest';

/** A workflow that tries to use a named tool and reports success/failure. */
function toolWorkflow(agentId: string, tool: string): WorkflowDefinition<void, string> {
  return {
    name: `use-${tool}`,
    agentId,
    async run(ctx) {
      return ctx.useTool(tool, () => 'ran');
    },
  };
}

describe('least-privilege tool broker (§10.3)', () => {
  it('a call to a tool NOT in the manifest allowlist throws ToolNotAllowedError', async () => {
    const { engine } = createRuntime();
    // outreach-agent has NO pa-machine.transition in its allowlist.
    const handle = engine.start(toolWorkflow('outreach-agent', 'pa-machine.transition'), {
      memberId: 'm1',
      input: undefined,
    });
    await expect(handle.done).rejects.toBeInstanceOf(ToolNotAllowedError);
    expect(engine.query(handle.workflowId)?.status).toBe('failed');
  });

  it('a call to an allowed tool runs the effect', async () => {
    const { engine } = createRuntime();
    const handle = engine.start(toolWorkflow('outreach-agent', 'comms-channel.send'), {
      memberId: 'm2',
      input: undefined,
    });
    expect(await handle.done).toBe('ran');
  });
});
