import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Enforces the invariant the README + types.ts claim: nothing in the engine
// (pipeline / identity / runtime) may import cdp-intake. Dependencies point one way
// only (new → existing), which is what makes the layer deletable with zero residue.
// The first back-import will fail this test loudly instead of landing silently.

const ENGINE_ROOTS = ['src/lib/pipeline', 'src/lib/identity', 'src/lib/runtime'];
const BACK_IMPORT = /from\s+['"](?:@\/lib\/cdp-intake|(?:\.\.\/)+cdp-intake)/;

function tsFiles(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) tsFiles(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
}

describe('cdp-intake isolation — one-way dependency', () => {
  it('no pipeline/identity/runtime module imports cdp-intake', () => {
    const offenders: string[] = [];
    for (const root of ENGINE_ROOTS) {
      const files: string[] = [];
      tsFiles(join(process.cwd(), root), files);
      for (const f of files) {
        if (BACK_IMPORT.test(readFileSync(f, 'utf8'))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
