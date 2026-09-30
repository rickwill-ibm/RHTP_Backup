/**
 * The dataMode resolvers for the three WPCO agent seams.
 *
 * The governance suite (tests/governance/probers.agentSeams.ts) proves the
 * fail-closed behaviour as a registered prober. This suite covers the resolver
 * module's own public surface, plus the two properties the prober cannot express:
 *
 *   E15 PARITY  — mock and production return the SAME interface, so a deployment
 *                 flipping the seam changes behaviour, never shape. A production
 *                 implementation missing a method would otherwise surface as a
 *                 TypeError at the call site rather than a declared refusal.
 *   E9 FAIL-OPEN — an UNRECOGNISED mode must not be treated as production, and a
 *                 'seeded' mode must not be treated as production either. The
 *                 fail-open shape this repo has been bitten by is a default that
 *                 lands on mock; the inverse trap is a default that lands on
 *                 production and breaks the demo. Both directions are pinned.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { DATA_MODE_SEAMS, clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { AGENT_SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions.agents';
import { SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions';
import { SeamError, resolveBinding, type RecalledDecision } from '@/lib/agents/seams';
import {
  RECORDED_REASONING_TRANSCRIPT,
  getAgentMemoryRecall,
  getAgentReasoner,
  getAgentToolBindingTable,
} from '@/lib/agents/seams/resolve';

const AGENT = 'outreach-agent';
const GRANTED = ['person-context.read', 'comms-channel.send'];
const NOW = 1_700_000_001_000;

const REQUEST = {
  promptId: 'wpco.outreach-priority',
  promptVersion: '1.0.0',
  promptText: 'irrelevant to a recorded transcript',
  templateHash: `sha256:${'0'.repeat(64)}`,
  refs: { memberRef: 'Patient/unit-1' },
  readableTools: ['person-context.read'],
};

const SEED: readonly RecalledDecision[] = [
  {
    proposalId: 'prop-1',
    actionType: 'outreach.contact',
    decision: 'approved',
    reasonCode: 'reviewer-approved',
    decidedAtMs: 1_700_000_000_000,
    part2Sourced: false,
    owningModule: 'agents/outreach',
  },
  {
    proposalId: 'prop-2',
    actionType: 'outreach.contact',
    decision: 'rejected',
    reasonCode: 'member-declined',
    decidedAtMs: 1_700_000_000_500,
    part2Sourced: true,
    owningModule: 'agents/outreach',
  },
];

const SCOPE = {
  memberId: 'unit-1',
  consentScope: 'care-coordination',
  breadth: 'owning-module' as const,
  callerModule: 'agents/outreach',
};

beforeEach(() => clearSessionDataModes());
afterEach(() => clearSessionDataModes());

describe('getAgentReasoner', () => {
  it('mock resolves the committed recorded transcript (deterministic, replayable)', async () => {
    setSessionDataMode('agentReasoner', 'mock');
    const first = await getAgentReasoner().reason(REQUEST);
    const second = await getAgentReasoner().reason(REQUEST);
    expect(first).toEqual(second);
    expect(first.producedBy).toEqual({
      promptId: 'wpco.outreach-priority',
      promptVersion: '1.0.0',
      modelId: 'recorded-transcript',
    });
  });

  it('production refuses with SEAM_NOT_CONFIGURED and never returns the transcript', async () => {
    setSessionDataMode('agentReasoner', 'production');
    await expect(getAgentReasoner().reason(REQUEST)).rejects.toBeInstanceOf(SeamError);
    await expect(getAgentReasoner().reason(REQUEST)).rejects.toThrow(/SEAM_NOT_CONFIGURED/);
  });

  it('seeded mode is NOT production — the demo path stays available', async () => {
    setSessionDataMode('agentReasoner', 'seeded');
    await expect(getAgentReasoner().reason(REQUEST)).resolves.toBeTruthy();
  });

  it('mock refuses a prompt id the transcript does not record (no fabrication)', async () => {
    setSessionDataMode('agentReasoner', 'mock');
    await expect(
      getAgentReasoner().reason({ ...REQUEST, promptId: 'not.recorded' })
    ).rejects.toThrow(/SEAM_NOT_CONFIGURED/);
  });

  it('E15 parity: mock and production getAgentReasoner expose the same interface', () => {
    setSessionDataMode('agentReasoner', 'mock');
    const mock = getAgentReasoner();
    setSessionDataMode('agentReasoner', 'production');
    const prod = getAgentReasoner();
    expect(Object.keys(prod).sort()).toEqual(Object.keys(mock).sort());
    expect(typeof prod.reason).toBe(typeof mock.reason);
  });

  it('the committed transcript keys the prompt id the route runs', () => {
    expect(Object.keys(RECORDED_REASONING_TRANSCRIPT)).toContain('wpco.outreach-priority');
  });
});

describe('getAgentMemoryRecall', () => {
  it('mock enforces breadth and withholds Part 2 material with no verified basis', async () => {
    setSessionDataMode('agentMemoryRecall', 'mock');
    const released = await getAgentMemoryRecall(SEED).recall(SCOPE, 0, NOW);
    expect(released.map((d) => d.proposalId)).toEqual(['prop-1']);
    expect(released.every((d) => d.part2Disclosed === false)).toBe(true);
  });

  it('mock releases Part 2 material against a verified basis, MARKED as disclosed', async () => {
    setSessionDataMode('agentMemoryRecall', 'mock');
    const released = await getAgentMemoryRecall(SEED).recall(
      {
        ...SCOPE,
        part2Basis: {
          consentId: 'consent-1',
          memberId: 'unit-1',
          purpose: 'care-coordination',
          expiresAtMs: NOW + 1_000,
        },
      },
      0,
      NOW
    );
    expect(released.map((d) => d.proposalId)).toEqual(['prop-1', 'prop-2']);
    expect(released.find((d) => d.proposalId === 'prop-2')?.part2Disclosed).toBe(true);
  });

  it('production refuses — there is no configured read-model and no fallback', async () => {
    setSessionDataMode('agentMemoryRecall', 'production');
    await expect(getAgentMemoryRecall(SEED).recall(SCOPE, 0, NOW)).rejects.toThrow(
      /SEAM_NOT_CONFIGURED/
    );
  });

  it('E15 parity: mock and production getAgentMemoryRecall expose the same interface', () => {
    setSessionDataMode('agentMemoryRecall', 'mock');
    const mock = getAgentMemoryRecall(SEED);
    setSessionDataMode('agentMemoryRecall', 'production');
    const prod = getAgentMemoryRecall(SEED);
    expect(Object.keys(prod).sort()).toEqual(Object.keys(mock).sort());
    expect(typeof prod.recall).toBe(typeof mock.recall);
  });
});

describe('getAgentToolBindingTable', () => {
  it('mock resolves a granted tool to its in-process handler', () => {
    setSessionDataMode('agentToolBinding', 'mock');
    const bound = getAgentToolBindingTable(AGENT, GRANTED);
    expect(resolveBinding(bound, 'person-context.read').kind).toBe('in-process');
  });

  it('production ships zero bindings, so a granted tool fails CLOSED', () => {
    setSessionDataMode('agentToolBinding', 'production');
    const bound = getAgentToolBindingTable(AGENT, GRANTED);
    expect(() => resolveBinding(bound, 'person-context.read')).toThrow(SeamError);
    expect(() => resolveBinding(bound, 'person-context.read')).toThrow(/SEAM_NOT_CONFIGURED/);
  });

  it('an UNGRANTED tool is refused in either mode — a table cannot widen authority', () => {
    for (const mode of ['mock', 'production'] as const) {
      setSessionDataMode('agentToolBinding', mode);
      const bound = getAgentToolBindingTable(AGENT, ['person-context.read']);
      expect(() => resolveBinding(bound, 'comms-channel.send')).toThrow(/SEAM_TOOL_NOT_GRANTED/);
    }
  });

  it('E15 parity: both getAgentToolBindingTable modes return the same agent-narrowed table', () => {
    setSessionDataMode('agentToolBinding', 'mock');
    const mock = getAgentToolBindingTable(AGENT, GRANTED);
    setSessionDataMode('agentToolBinding', 'production');
    const prod = getAgentToolBindingTable(AGENT, GRANTED);
    expect(Object.keys(prod).sort()).toEqual(Object.keys(mock).sort());
    expect(prod.table.mode).toBe('production');
    expect(mock.table.mode).toBe('mock');
    expect(prod.table.bindings).toEqual([]);
  });
});

describe('AGENT_SEAM_DISPOSITIONS — the manifest entries match the module that implements them', () => {
  const ids = ['agentReasoner', 'agentMemoryRecall', 'agentToolBinding'] as const;

  it('all three are registered seams and reach the combined manifest via the spread', () => {
    for (const id of ids) {
      expect(DATA_MODE_SEAMS as readonly string[]).toContain(id);
      // The split file is the source; the combined manifest must serve the SAME
      // object, so a reader of SEAM_DISPOSITIONS cannot see a stale copy.
      expect(SEAM_DISPOSITIONS[id]).toBe(AGENT_SEAM_DISPOSITIONS[id]);
    }
  });

  it('each entry is a fail-closed-stub that names its resolver and its error', () => {
    for (const id of ids) {
      const e = AGENT_SEAM_DISPOSITIONS[id];
      expect(e.seamId).toBe(id);
      expect(e.disposition).toBe('fail-closed-stub');
      // The declared resolver must be the module this suite actually drives — a
      // note pointing at a file nobody calls is how a manifest starts lying.
      expect(e.productionResolverRef).toMatch(/lib\/agents\/seams\/resolve\.ts/);
      expect(e.notConfiguredError).toMatch(/SEAM_NOT_CONFIGURED/);
      expect(e.note.length).toBeGreaterThan(0);
    }
  });

  it('the recall entry records that the ABSENCE of a consumer is deliberate', () => {
    expect(AGENT_SEAM_DISPOSITIONS.agentMemoryRecall.note).toMatch(/NO WPCO PRODUCTION CONSUMER/);
  });

  /**
   * E15 PARITY IS DATA, NOT PROSE.
   *
   * `SeamDispositionEntry` had no parity-test field, so the three seams' parity
   * claims lived in a sentence: deleting the three `E15 parity:` blocks below
   * turned nothing red. Each entry now NAMES its proof, and this block resolves
   * the name against the file — so the test and the claim cannot part company.
   */
  it('every entry names an E15 parity test that exists, by exact title', () => {
    const suite = readFileSync(
      join(process.cwd(), 'tests/agents/seams/resolveSeams.test.ts'),
      'utf8'
    );
    for (const id of ids) {
      const ref = AGENT_SEAM_DISPOSITIONS[id].parityTest;
      const parsed = /^(\S+) → "(.+)"$/.exec(ref);
      expect(parsed, `${id}: parityTest must read '<file> → "<title>"'`).toBeTruthy();
      const file = parsed === null ? '' : parsed[1];
      const title = parsed === null ? '' : parsed[2];
      expect(file, `${id}: unparsed parityTest`).toBeTruthy();
      expect(title, `${id}: unparsed parityTest`).toBeTruthy();
      expect(existsSync(join(process.cwd(), file)), `${id}: ${file} does not exist`).toBe(true);
      const occurrences = suite.split(`it('${title}'`).length - 1;
      expect(occurrences, `${id}: no unique it('${title}') in ${file}`).toBe(1);
    }
  });

  /**
   * DEFECT 5 — the declared absence is still only string-matched.
   *
   * Registering the seam proves the REFUSAL. It does not detect a consumer being
   * added, and the note must not imply otherwise.
   */
  it('the recall entry states the limit of what registration actually buys', () => {
    const note = AGENT_SEAM_DISPOSITIONS.agentMemoryRecall.note;
    expect(note).toMatch(/HONEST LIMIT/);
    // The note must name what is NOT detected, not just what is declared.
    expect(note).toMatch(/nothing detects a consumer being added/i);
  });
});
