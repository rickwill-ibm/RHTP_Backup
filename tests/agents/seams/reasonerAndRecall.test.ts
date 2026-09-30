/**
 * The reasoner and recall seams.
 *
 * Reasoning is an EFFECT, recorded and replayable. Recall is consent-scoped,
 * breadth-enforced, returns codes only, and releases 42 CFR Part 2 material only
 * against a VERIFIED basis — a non-empty string is not a legal basis.
 */
import { describe, expect, it } from 'vitest';
import {
  SeamError,
  applyPart2Filter,
  createRecordedReasoner,
  createSeededRecall,
  createUnconfiguredReasoner,
  createUnconfiguredRecall,
  isPart2BasisValid,
  type Part2Basis,
  type RecallScope,
  type RecalledDecision,
  type ReasoningOutput,
} from '@/lib/agents/seams';

const OUT: ReasoningOutput = {
  suggestedRefs: { gapCode: 'hba1c-overdue' },
  toolRequests: ['person-context.read'],
  producedBy: { promptId: 'p1', promptVersion: '1.0.0', modelId: 'recorded' },
};
// The request carries the prompt TEXT, not just its id: a provider that looked
// the prompt up by id would make the recorded digest a claim about a different
// artifact than the one that produced the output.
const REQ = {
  promptId: 'p1',
  promptVersion: '1.0.0',
  promptText: 'Summarise open care gaps as codes.',
  templateHash: `sha256:${'a'.repeat(64)}`,
  refs: {},
  readableTools: ['person-context.read'],
};

describe('reasoner seam', () => {
  it('replays a recorded output deterministically', async () => {
    const r = createRecordedReasoner({ p1: OUT });
    expect(await r.reason(REQ)).toEqual(await r.reason(REQ));
  });

  it('fails closed when no transcript exists for the prompt', async () => {
    await expect(createRecordedReasoner({}).reason(REQ)).rejects.toBeInstanceOf(SeamError);
  });

  it('production reasoner refuses until configured — never falls back to the mock', async () => {
    await expect(createUnconfiguredReasoner().reason(REQ)).rejects.toMatchObject({
      code: 'SEAM_NOT_CONFIGURED',
    });
  });
});

const NOW = 1_700_000_000_000;

const entry = (
  id: string,
  at: number,
  part2: boolean,
  owningModule = 'src/lib/agents/outreach'
): RecalledDecision => ({
  proposalId: id,
  actionType: 'send-outreach',
  decision: 'rejected',
  reasonCode: 'member-declined',
  decidedAtMs: at,
  part2Sourced: part2,
  owningModule,
});

const SEED: RecalledDecision[] = [
  entry('a', 1_000, false),
  entry('b', 2_000, true),
  entry('c', 3_000, false, 'src/lib/agents/referral'),
];

const basis = (over: Partial<Part2Basis> = {}): Part2Basis => ({
  consentId: 'consent-1',
  memberId: 'M1',
  purpose: 'care-coordination',
  expiresAtMs: NOW + 1,
  ...over,
});

const scope = (over: Partial<RecallScope> = {}): RecallScope => ({
  memberId: 'M1',
  consentScope: 'care-team',
  breadth: 'self',
  callerModule: 'src/lib/agents/outreach',
  ...over,
});

describe('recall seam', () => {
  it('returns prior decisions at or after the absolute bound', async () => {
    const got = await createSeededRecall(SEED).recall(scope(), 3_000, NOW);
    expect(got.map((e) => e.proposalId)).toEqual(['c']);
  });

  it('EXCLUDES Part 2 entries when no basis is declared', async () => {
    const got = await createSeededRecall(SEED).recall(scope(), 0, NOW);
    expect(got.map((e) => e.proposalId)).toEqual(['a', 'c']);
  });

  it('releases Part 2 entries against a verified basis, and MARKS them as disclosed', async () => {
    const got = await createSeededRecall(SEED).recall(scope({ part2Basis: basis() }), 0, NOW);
    expect(got.map((e) => e.proposalId)).toEqual(['a', 'b', 'c']);
    expect(got.find((e) => e.proposalId === 'b')?.part2Disclosed).toBe(true);
    expect(got.find((e) => e.proposalId === 'a')?.part2Disclosed).toBe(false);
  });

  it('REFUSES a Part 2 basis belonging to a different member', async () => {
    const got = await createSeededRecall(SEED).recall(
      scope({ part2Basis: basis({ memberId: 'OTHER' }) }),
      0,
      NOW
    );
    expect(got.map((e) => e.proposalId)).toEqual(['a', 'c']);
  });

  it('REFUSES an expired Part 2 basis', async () => {
    const got = await createSeededRecall(SEED).recall(
      scope({ part2Basis: basis({ expiresAtMs: NOW - 1 }) }),
      0,
      NOW
    );
    expect(got.map((e) => e.proposalId)).toEqual(['a', 'c']);
  });

  it('REFUSES a basis with an empty consent id or purpose — truthiness is not a basis', () => {
    expect(isPart2BasisValid(scope({ part2Basis: basis({ consentId: '' }) }), NOW)).toBe(false);
    expect(isPart2BasisValid(scope({ part2Basis: basis({ purpose: '' }) }), NOW)).toBe(false);
    expect(isPart2BasisValid(scope({ part2Basis: basis() }), NOW)).toBe(true);
  });

  it('ENFORCES breadth — owning-module recall cannot read another module', async () => {
    const got = await createSeededRecall(SEED).recall(scope({ breadth: 'owning-module' }), 0, NOW);
    expect(got.map((e) => e.proposalId)).toEqual(['a']);
  });

  it('refuses a recall with no consent scope', async () => {
    await expect(
      createSeededRecall(SEED).recall(scope({ consentScope: '' }), 0, NOW)
    ).rejects.toBeInstanceOf(SeamError);
  });

  it('returns reason CODES only — no reviewer prose is carried', async () => {
    const got = await createSeededRecall(SEED).recall(scope(), 0, NOW);
    for (const e of got) expect(e.reasonCode).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('production recall refuses until configured', async () => {
    await expect(createUnconfiguredRecall().recall(scope(), 0, NOW)).rejects.toMatchObject({
      code: 'SEAM_NOT_CONFIGURED',
    });
  });

  it('the Part 2 filter is a pure function of entries, scope and clock', () => {
    expect(applyPart2Filter(SEED, scope(), NOW).length).toBe(2);
    expect(applyPart2Filter(SEED, scope({ part2Basis: basis() }), NOW).length).toBe(3);
  });
});
