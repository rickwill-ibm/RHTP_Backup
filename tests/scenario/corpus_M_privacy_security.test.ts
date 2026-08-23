/**
 * Corpus family M — Privacy & security. Executable scenario for UC-63 (BFF
 * invariant): the half of the acceptance that is a concrete, runnable check —
 * "a repo scan finds zero secret-bearing NEXT_PUBLIC variables."
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so any
 * secret named that way is a real leak. This scans the entire src tree and
 * asserts none exist. (The route-level 401/403/400/422/200 suite is the
 * separate tests/api/* body; the full k6/route plan is registered pending.)
 *
 * Other M cases (61/62/64) need section-level purpose projection, an access-
 * trail query store, or break-glass read-time evaluation → registered pending.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

// A NEXT_PUBLIC_* identifier whose name advertises a secret. "KEY" alone is not
// listed — a publishable key is legitimate — but SECRET/PASSWORD/PRIVATE/etc are
// never safe to expose to the client bundle.
const SECRET_NEXT_PUBLIC =
  /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE_KEY|PRIVATEKEY|CREDENTIAL|ACCESS_TOKEN|CLIENT_SECRET|API_SECRET)/i;

// Any NEXT_PUBLIC_* reference at all — used to prove the scan is meaningful
// (the codebase really does use NEXT_PUBLIC vars, e.g. feature flags).
const ANY_NEXT_PUBLIC = /NEXT_PUBLIC_[A-Z0-9_]+/;

describe('UC-63 | BFF invariant — no secret-bearing NEXT_PUBLIC variables', () => {
  const files = walk(SRC);

  it('scans a non-trivial src tree (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds at least one NEXT_PUBLIC_* var (the scan actually exercises the pattern)', () => {
    const anyHit = files.some((f) => ANY_NEXT_PUBLIC.test(readFileSync(f, 'utf8')));
    expect(anyHit).toBe(true);
  });

  it('finds ZERO secret-bearing NEXT_PUBLIC variables anywhere in src', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const m = text.match(SECRET_NEXT_PUBLIC);
      if (m) offenders.push(`${f.replace(process.cwd(), '.')}: ${m[0]}`);
    }
    expect(offenders, `secret-bearing NEXT_PUBLIC vars must not exist`).toEqual([]);
  });
});
