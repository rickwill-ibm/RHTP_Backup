/**
 * THE LOCK PARSER THAT ACTUALLY GOVERNS THE PROCESS.
 *
 * `parseAuthorityLockFile` is the LOAD-time parser: `manifest/authorityGate.ts`
 * calls it at module init to build `SHIPPED_LOCK`, the process-wide singleton the
 * registry gate and the preset clamp both read. It was, until this suite, the
 * only one of the two lock validators in the repo with no test naming it — and
 * the more permissive of the two. Every `it` below is a REFUSAL branch: the
 * proof that a malformed or stale lock cannot reach a running process.
 *
 * The duplicate-filename blind spot that hid it: E13 links a module by basename
 * STEM, and both validators were called `lockSchema.ts`, so a test naming the
 * build-time one satisfied the gate for both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoOrphanLockEntries,
  AuthorityLockShapeError,
  LOCK_CODE_PATTERN,
  authorityLockData,
  parseAuthorityLockFile,
} from '@/lib/agents/authority';
import { AdlError, CODE_PATTERN } from '@/lib/agents/adl';
import type { AuthorityLockFile } from '@/lib/agents/authority';

const GOOD_ENTRY: Record<string, unknown> = {
  agentId: 'demo-agent',
  tools: ['person-context.read', 'work-queue.submit'],
  dataClasses: ['demographic'],
  maxAutonomyTier: 'HITL',
  maxPhiPosture: 'references-only',
  escalationPolicyRef: 'default',
};

/** A lock whose single entry carries the given field overrides. */
function lockWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { version: '1.0.0', entries: [{ ...GOOD_ENTRY, ...overrides }] };
}

/** Assert a refusal, and that it names the JSON path that caused it. */
function expectRefusal(raw: unknown, pathFragment: string): void {
  try {
    parseAuthorityLockFile(raw, 'lock.json');
    throw new Error(`expected a refusal mentioning "${pathFragment}"`);
  } catch (err) {
    expect(err).toBeInstanceOf(AuthorityLockShapeError);
    expect((err as AuthorityLockShapeError).message).toContain(pathFragment);
  }
}

describe('parseAuthorityLockFile — the load-time lock parser accepts a well-formed lock', () => {
  it('parses the SHIPPED lock, so strict-by-default does not throw at module init', () => {
    const lock = parseAuthorityLockFile(authorityLockData, 'authority-lock.json');
    expect(lock.entries.length).toBeGreaterThan(0);
    expect(lock.version).toBe('1.0.0');
  });

  it('carries dataClasses through rather than dropping the field the gate then checks', () => {
    const lock = parseAuthorityLockFile(lockWith({}), 'lock.json');
    expect(lock.entries[0]?.dataClasses).toEqual(['demographic']);
  });

  it('treats an omitted dataClasses as absent, not as an empty grant', () => {
    const entry = { ...GOOD_ENTRY };
    delete entry.dataClasses;
    const lock = parseAuthorityLockFile({ version: '1.0.0', entries: [entry] }, 'lock.json');
    expect(lock.entries[0] && 'dataClasses' in lock.entries[0]).toBe(false);
  });
});

describe('parseAuthorityLockFile — structural refusals', () => {
  it('REFUSES a non-object lock', () => {
    expectRefusal('not-a-lock', 'lock.json');
    expectRefusal(null, 'lock.json');
    expectRefusal([GOOD_ENTRY], 'lock.json');
  });

  it('REFUSES a non-array entries', () => {
    expectRefusal({ version: '1.0.0', entries: {} }, 'lock.json.entries');
  });

  it('REFUSES a non-object entry — an entry is never a bare string or number', () => {
    expectRefusal({ version: '1.0.0', entries: ['demo-agent'] }, 'lock.json.entries[0]');
    expectRefusal({ version: '1.0.0', entries: [null] }, 'lock.json.entries[0]');
  });

  it('REFUSES tools as a bare STRING — it would be iterated character by character', () => {
    expectRefusal(lockWith({ tools: 'person-context.read' }), 'lock.json.entries[0].tools');
  });

  it('REFUSES a non-string element inside tools', () => {
    expectRefusal(lockWith({ tools: ['person-context.read', 7] }), 'entries[0].tools[1]');
  });

  it('REFUSES a non-array dataClasses', () => {
    expectRefusal(lockWith({ dataClasses: 'demographic' }), 'entries[0].dataClasses');
  });

  it('REFUSES an unknown autonomy tier — a ceiling must be a known rung', () => {
    expectRefusal(lockWith({ maxAutonomyTier: 'godmode' }), 'entries[0].maxAutonomyTier');
  });

  it('REFUSES an unknown PHI posture', () => {
    expectRefusal(lockWith({ maxPhiPosture: 'everything' }), 'entries[0].maxPhiPosture');
  });

  it('REFUSES an empty escalationPolicyRef — an unescalatable agent is not a safe agent', () => {
    expectRefusal(lockWith({ escalationPolicyRef: '' }), 'entries[0].escalationPolicyRef');
  });

  it('REFUSES a missing agentId and an empty version', () => {
    const entry = { ...GOOD_ENTRY };
    delete entry.agentId;
    expectRefusal({ version: '1.0.0', entries: [entry] }, 'entries[0].agentId');
    expectRefusal({ version: '', entries: [GOOD_ENTRY] }, 'lock.json.version');
  });

  it('REFUSES a duplicate agentId inside the parse — last-wins would silently widen', () => {
    try {
      parseAuthorityLockFile(
        {
          version: '1.0.0',
          entries: [GOOD_ENTRY, { ...GOOD_ENTRY, maxAutonomyTier: 'autonomous' }],
        },
        'lock.json'
      );
      throw new Error('expected a duplicate-entry refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorityLockShapeError);
      expect((err as AuthorityLockShapeError).message).toContain('duplicate');
    }
  });
});

describe('parseAuthorityLockFile — CODE_PATTERN refusals (free text never reaches a ceiling)', () => {
  it('REFUSES an UPPERCASE tool code — the subset check is case-sensitive, so it fails open', () => {
    expectRefusal(lockWith({ tools: ['Person-Context.READ'] }), 'entries[0].tools[0]');
  });

  it('REFUSES a tool code carrying free text (spaces, prose)', () => {
    expectRefusal(lockWith({ tools: ['read the whole member record'] }), 'entries[0].tools[0]');
    expectRefusal(lockWith({ tools: ['person-context.read '] }), 'entries[0].tools[0]');
  });

  it('REFUSES a tool code with a wildcard or path separator', () => {
    expectRefusal(lockWith({ tools: ['person-context.*'] }), 'entries[0].tools[0]');
    expectRefusal(lockWith({ tools: ['person-context/read'] }), 'entries[0].tools[0]');
  });

  it('REFUSES a non-conforming dataClass code', () => {
    expectRefusal(lockWith({ dataClasses: ['Mental Health'] }), 'entries[0].dataClasses[0]');
  });

  it('accepts a dotted, dashed, lowercase code — the shape the shipped lock uses', () => {
    expect(() =>
      parseAuthorityLockFile(lockWith({ tools: ['claim.submit-appeal'] }), 'lock.json')
    ).not.toThrow();
  });

  it('the default pattern is the SAME RULE the ADL definition language uses', () => {
    // One lock JSON, two gates. If these two regexes ever diverge, the build-time
    // gate and the load-time gate disagree about what a legal code is — which is
    // the class of defect this merge removed. Pinned, not hoped for.
    expect(LOCK_CODE_PATTERN.source).toBe(CODE_PATTERN.source);
    expect(LOCK_CODE_PATTERN.flags).toBe(CODE_PATTERN.flags);
  });

  it('accepts an INJECTED pattern, so a caller may pin its own code rule', () => {
    expect(() =>
      parseAuthorityLockFile(lockWith({ tools: ['Person-Context.READ'] }), 'lock.json', {
        codePattern: /^[A-Za-z][A-Za-z0-9.-]*$/,
      })
    ).not.toThrow();
  });
});

describe('parseAuthorityLockFile — the parsed lock is DEEP-FROZEN', () => {
  const lock = parseAuthorityLockFile(lockWith({}), 'lock.json');

  it('freezes the file, the entries array, each entry and its arrays', () => {
    expect(Object.isFrozen(lock)).toBe(true);
    expect(Object.isFrozen(lock.entries)).toBe(true);
    const entry = lock.entries[0];
    expect(entry).toBeDefined();
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.tools)).toBe(true);
    expect(Object.isFrozen(entry?.dataClasses)).toBe(true);
  });

  it('refuses a ceiling raise through the handed-out reference', () => {
    const entry = lock.entries[0];
    expect(entry).toBeDefined();
    const before = entry?.maxAutonomyTier;
    try {
      (entry as unknown as { maxAutonomyTier: string }).maxAutonomyTier = 'autonomous';
    } catch {
      /* strict mode throws; sloppy mode no-ops. Either way the value must not move. */
    }
    expect(entry?.maxAutonomyTier).toBe(before);
  });

  it('refuses a tool appended through the handed-out reference', () => {
    const tools = lock.entries[0]?.tools;
    expect(tools).toBeDefined();
    const before = tools?.length;
    try {
      (tools as unknown as string[]).push('claim.submit-appeal');
    } catch {
      /* frozen array; the length must not move either way. */
    }
    expect(tools?.length).toBe(before);
  });
});

describe('assertNoOrphanLockEntries — a stale grant is refused, not accumulated', () => {
  const lock: AuthorityLockFile = parseAuthorityLockFile(lockWith({}), 'lock.json');

  it('REFUSES a lock entry for an agent id that no longer exists', () => {
    try {
      assertNoOrphanLockEntries(lock, new Set(['some-other-agent']));
      throw new Error('expected an orphan-grant refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorityLockShapeError);
      expect((err as AuthorityLockShapeError).message).toContain('demo-agent');
    }
  });

  it('permits a lock whose every entry has a live definition', () => {
    expect(() => assertNoOrphanLockEntries(lock, new Set(['demo-agent']))).not.toThrow();
  });

  it('REFUSES an empty known-agent set rather than passing vacuously', () => {
    expect(() => assertNoOrphanLockEntries(lock, new Set<string>())).toThrow(
      AuthorityLockShapeError
    );
  });
});

/**
 * THE HEADER'S ENFORCEMENT CLAIM IS A GATE, NOT PROSE.
 *
 * This module's header said "the stricter rule won the merge" while
 * `assertNoOrphanLockEntries` had ZERO callers in `src/` — a barrel re-export and
 * two test files were the whole of it. The rule was asserted and unenforced, and
 * the header is what the next engineer reads instead of grepping. So the header
 * now NAMES its enforcement point, and this test proves the named file calls it.
 * Move the call and this goes red; delete the call and this goes red.
 */
describe("the header's enforcement claim is true", () => {
  const SRC = 'src/lib/agents';
  const header = readFileSync(join(process.cwd(), SRC, 'authority/lockSchema.ts'), 'utf8');

  it('names adl/adlEngine.ts compile() as the stale-grant enforcement point', () => {
    expect(header).toMatch(/adl\/adlEngine\.ts[\s\S]*compile\(\)/);
  });

  it('and that file really calls it — the claim is not prose', () => {
    const engine = readFileSync(join(process.cwd(), SRC, 'adl/adlEngine.ts'), 'utf8');
    expect(engine).toMatch(/assertNoOrphanLockEntries\(\s*lock,/);
  });

  it('states why the load-time manifest gate deliberately does NOT get this rule', () => {
    // A partial manifest set is legitimate, so the same rule there would refuse a
    // CORRECT lock. Recording the reason stops a later wave "completing" the wiring.
    expect(header).toMatch(/subset/);
    expect(header).toMatch(/FULL ADL definition roster/);
  });

  it('the load-time gate has no orphan check, matching the header', () => {
    const gate = readFileSync(join(process.cwd(), SRC, 'manifest/authorityGate.ts'), 'utf8');
    expect(gate).not.toMatch(/assertNoOrphanLockEntries\(/);
  });
});

describe('the injected error taxonomy — one rule set, each caller keeps its own errors', () => {
  const raise = (path: string, detail: string): Error =>
    new AdlError('ADL_AUTHORITY_LOCK', path, detail);

  it('raises AdlError from the parse when the ADL compiler injects its own raiser', () => {
    try {
      parseAuthorityLockFile(lockWith({ maxAutonomyTier: 'godmode' }), 'lock.json', { raise });
      throw new Error('expected an AdlError refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AdlError);
      expect((err as AdlError).code).toBe('ADL_AUTHORITY_LOCK');
    }
  });

  it('raises AdlError from the CODE_PATTERN branch too', () => {
    try {
      parseAuthorityLockFile(lockWith({ tools: ['Person-Context.READ'] }), 'lock.json', { raise });
      throw new Error('expected an AdlError refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AdlError);
      expect((err as AdlError).code).toBe('ADL_AUTHORITY_LOCK');
    }
  });

  it('raises AdlError from the orphan-grant branch too', () => {
    const lock = parseAuthorityLockFile(lockWith({}), 'lock.json');
    expect(() => assertNoOrphanLockEntries(lock, new Set(['other']), raise)).toThrow(AdlError);
  });

  it('defaults to AuthorityLockShapeError when nothing is injected', () => {
    expect(() => parseAuthorityLockFile(lockWith({ tools: 'oops' }), 'lock.json')).toThrow(
      AuthorityLockShapeError
    );
  });
});
