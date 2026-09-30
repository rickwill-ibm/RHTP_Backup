/**
 * THE CONSTRAINT IS CHECKED, NOT ASSERTED IN A COMMENT.
 *
 * `parseRegistryUnderLock` accepts an explicit authority lock. That is a
 * legitimate need — a test modelling a widened ceiling must widen the LOCK
 * rather than step around the gate — and it is also, unguarded, a public bypass
 * of the authority ceiling for any application code that discovers it.
 *
 * An earlier version of this design defended the equivalent parameter with a
 * comment claiming the live path never passed one. That was false:
 * `presetRegistry.ts` calls `parseRegistry` directly and hands the result to the
 * decision engine. A safety property held only by the call sites that happened
 * to exist is not a safety property. This test makes it one.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
/** The one file allowed to name it: the module that defines it. */
const ALLOWED = new Set([join('lib', 'agents', 'manifest', 'registry.ts')]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('no application code parses a registry under its own lock', () => {
  const files = walk(SRC);

  it('found source files to check (the walk itself is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('only the defining module names parseRegistryUnderLock', () => {
    const offenders = files
      .filter((f) => readFileSync(f, 'utf8').includes('parseRegistryUnderLock'))
      .map((f) => f.slice(SRC.length + 1))
      .filter((rel) => !ALLOWED.has(rel));
    expect(offenders).toEqual([]);
  });

  it('the authority lock is not exported from the manifest barrel as a mutable value', () => {
    const barrel = readFileSync(join(SRC, 'lib/agents/manifest/index.ts'), 'utf8');
    expect(barrel).not.toContain('ParseRegistryOptions');
  });
});

describe('the shipped lock cannot be edited through the accessor', () => {
  it('is deep-frozen, so widening it needs a reviewed file change', async () => {
    const { shippedAuthorityLock } = await import('@/lib/agents/manifest');
    const lock = shippedAuthorityLock();
    expect(Object.isFrozen(lock)).toBe(true);
    expect(Object.isFrozen(lock.entries)).toBe(true);
    const entry = lock.entries[0]!;
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.tools)).toBe(true);
    // A silent no-op under sloppy mode would be as bad as a successful write,
    // so assert the value is unchanged rather than trusting the throw.
    const before = entry.maxAutonomyTier;
    try {
      (entry as { maxAutonomyTier: string }).maxAutonomyTier = 'autonomous';
    } catch {
      /* strict mode throws; either way the value must not move */
    }
    expect(entry.maxAutonomyTier).toBe(before);
  });
});
