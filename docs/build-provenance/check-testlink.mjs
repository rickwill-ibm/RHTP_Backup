#!/usr/bin/env node
// E13 (part 1) - dependency-free NEW-CODE TEST-LINK guard. The cheap half of the
// test-effectiveness gate: every substantive source module must be referenced by
// at least one test file. It does not measure depth (that is the mutation sampler
// and R5's job) - it catches the blunt failure of new code that ships with NO
// test at all. Zero dependencies: just fs + a filename/import scan.
//
// Usage:
//   node check-testlink.mjs [srcGlobDir=src] [testGlobDir=tests] [file1 file2 ...]
// If explicit files are passed, only those are checked (use at an iteration close
// with the changed-file list). Otherwise it scans all of srcGlobDir.
// Exit 0 = every checked module is referenced by a test. Exit 1 = an untested
// module was found.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// Modules we do NOT require a direct test for: barrels, pure type files, data
// files, READMEs, templates. These are exercised transitively; requiring a
// dedicated test for an index.ts barrel is noise.
function exempt(file) {
  const b = basename(file);
  return (
    b === 'index.ts' || b === 'types.ts' || b.endsWith('.d.ts') ||
    b.endsWith('.json') || b.endsWith('.md') || b.endsWith('.css') ||
    b.startsWith('_') || file.includes('/data/') || b.endsWith('.data.ts') ||
    b.endsWith('.data1.ts') || b.endsWith('.data2.ts')
  );
}

const argv = process.argv.slice(2);
const srcDir = argv[0] && !argv[0].includes('/') ? argv[0] : 'src';
const testDir = argv[1] && !argv[1].includes('/') ? argv[1] : 'tests';
const explicit = argv.filter((a) => a.includes('/'));

const testBlob = walk(testDir)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.mjs'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const candidates = (explicit.length ? explicit : walk(srcDir))
  .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts'))
  .filter((f) => !exempt(f));

const untested = [];
for (const f of candidates) {
  const stem = basename(f).replace(/\.(ts|tsx)$/, '');
  // referenced if a test imports the module by path stem or basename
  const re = new RegExp(`[\\'"\\/]${stem}(\\.js|\\.ts|\\')?[\\'"/]|/${stem}['\\"]`);
  if (!re.test(testBlob) && !testBlob.includes(stem)) untested.push(relative('.', f));
}

console.log('E13 test-link guard - every substantive module must be referenced by a test');
if (untested.length) {
  console.log(`FAIL (E13): ${untested.length} module(s) referenced by no test:`);
  for (const u of untested) console.log(`    ${u}`);
  process.exit(1);
}
console.log(`PASS (E13): all ${candidates.length} checked modules are referenced by at least one test.`);
process.exit(0);
