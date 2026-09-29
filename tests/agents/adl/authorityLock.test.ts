/**
 * The authority lock is the SECURITY control. These tests are the proof that a
 * definition cannot widen its own authority: the compiler may narrow, never grant.
 */
import { describe, expect, it } from 'vitest';
import {
  AdlError,
  CODE_PATTERN,
  assertWithinAuthorityLock,
  parseAgentDefinition,
} from '@/lib/agents/adl';
import { assertNoOrphanLockEntries, parseAuthorityLockFile } from '@/lib/agents/authority';
import type { ParseAuthorityLockOptions } from '@/lib/agents/authority';
import type { AgentDefinition, AuthorityLockFile } from '@/lib/agents/adl';

/**
 * The build-time view of the ONE lock parser. `parseAuthorityLock` (an
 * adl-local second validator that had diverged from the load-time one) is gone;
 * `loadAuthorityLock` now calls `parseAuthorityLockFile` with exactly these
 * options, so what this suite exercises is what the build gate runs.
 * The parser's own refusal branches are covered in
 * tests/agents/authority/lockSchema.test.ts.
 */
const AS_ADL: ParseAuthorityLockOptions = {
  raise: (at, detail) => new AdlError('ADL_AUTHORITY_LOCK', at, detail),
  codePattern: CODE_PATTERN,
};

const parseAsAdl = (raw: unknown, at: string): AuthorityLockFile =>
  parseAuthorityLockFile(raw, at, AS_ADL);

const LOCK: AuthorityLockFile = {
  version: '1.0.0',
  entries: [
    {
      agentId: 'demo-agent',
      tools: ['person-context.read', 'work-queue.submit'],
      maxAutonomyTier: 'HITL',
      maxPhiPosture: 'references-only',
      escalationPolicyRef: 'default',
    },
  ],
};

function def(overrides: Record<string, unknown> = {}): AgentDefinition {
  return parseAgentDefinition(
    {
      id: 'demo-agent',
      version: '1.0.0',
      purpose: 'Demo.',
      autonomyTier: 'HITL',
      escalationPolicyRef: 'default',
      phiPosture: 'references-only',
      owningModule: 'src/lib/agents/demo',
      toolAllowlist: ['person-context.read'],
      routes: [],
      body: { kind: 'module', owningModule: 'src/lib/agents/demo' },
      ...overrides,
    },
    'demo.agent.json'
  );
}

function expectLockRefusal(d: AgentDefinition): void {
  try {
    assertWithinAuthorityLock([d], LOCK);
    throw new Error('expected an authority-lock refusal');
  } catch (err) {
    expect(err).toBeInstanceOf(AdlError);
    expect((err as AdlError).code).toBe('ADL_AUTHORITY_LOCK');
  }
}

describe('assertWithinAuthorityLock', () => {
  it('permits a definition inside its locked authority', () => {
    expect(() => assertWithinAuthorityLock([def()], LOCK)).not.toThrow();
  });

  it('permits NARROWING — fewer tools than the lock allows', () => {
    expect(() => assertWithinAuthorityLock([def({ toolAllowlist: [] })], LOCK)).not.toThrow();
  });

  it('REFUSES a tool the lock does not grant', () => {
    expectLockRefusal(def({ toolAllowlist: ['person-context.read', 'claim.submit-appeal'] }));
  });

  it('REFUSES an autonomy tier above the locked maximum', () => {
    expectLockRefusal(def({ autonomyTier: 'HOTL' }));
  });

  it('REFUSES autonomous when the lock caps at HITL', () => {
    expectLockRefusal(def({ autonomyTier: 'autonomous' }));
  });

  it('REFUSES a PHI posture above the locked maximum', () => {
    expectLockRefusal(
      def({ phiPosture: 'full', phiFullOverride: { approvedBy: 'x', ticketRef: 'y' } })
    );
  });

  it('REFUSES a changed escalation policy', () => {
    expectLockRefusal(def({ escalationPolicyRef: 'lenient' }));
  });

  it('FAILS CLOSED for an agent absent from the lock — a new agent holds no authority', () => {
    expectLockRefusal(def({ id: 'brand-new-agent' }));
  });

  it('names the offending tool in the refusal', () => {
    try {
      assertWithinAuthorityLock([def({ toolAllowlist: ['pa-machine.transition'] })], LOCK);
    } catch (err) {
      expect((err as AdlError).message).toContain('pa-machine.transition');
    }
  });
});

describe('lock integrity', () => {
  it('REFUSES a lock with a duplicate agentId — last-wins would silently widen', () => {
    const wide: AuthorityLockFile = {
      version: '1.0.0',
      entries: [
        ...LOCK.entries,
        {
          agentId: 'demo-agent',
          tools: ['person-context.read', 'claim.submit-appeal'],
          maxAutonomyTier: 'autonomous',
          maxPhiPosture: 'full',
          escalationPolicyRef: 'default',
        },
      ],
    };
    try {
      assertWithinAuthorityLock([def({ autonomyTier: 'autonomous' })], wide);
      throw new Error('expected a duplicate-entry refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AdlError);
      expect((err as AdlError).code).toBe('ADL_AUTHORITY_LOCK');
      expect((err as AdlError).message).toContain('duplicate');
    }
  });

  it('parses a well-formed lock and refuses a malformed one — never a cast', () => {
    expect(parseAsAdl(LOCK, 'lock.json').entries).toHaveLength(1);
    expect(() => parseAsAdl({ version: '1', entries: {} }, 'lock.json')).toThrow(AdlError);
    expect(() =>
      parseAsAdl(
        { version: '1', entries: [{ ...LOCK.entries[0], maxAutonomyTier: 'godmode' }] },
        'lock.json'
      )
    ).toThrow(AdlError);
  });

  it('REFUSES a lock entry granting authority to an agent with no definition', () => {
    // The raiser is INJECTED, so the shared rule refuses in this domain's taxonomy.
    expect(() =>
      assertNoOrphanLockEntries(LOCK, new Set(['some-other-agent']), AS_ADL.raise)
    ).toThrow(AdlError);
    expect(() =>
      assertNoOrphanLockEntries(LOCK, new Set(['demo-agent']), AS_ADL.raise)
    ).not.toThrow();
  });
});
