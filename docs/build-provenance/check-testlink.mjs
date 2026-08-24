#!/usr/bin/env node
// E13 (part 1) - dependency-free NEW-CODE TEST-LINK guard. The cheap half of the
// test-effectiveness gate: every substantive source module must be exercised by a
// test. It does not measure depth (that is the mutation sampler + R5) - it catches
// the blunt failure of new code that ships with NO test at all.
//
// LINKAGE (v2): a module is "linked" when a test references it EITHER by filename
// stem OR by one of its EXPORTED SYMBOL NAMES. The symbol check follows barrel
// re-exports: a test that imports `evaluateDecision` from `.../governance` links
// decisionGate.ts even though the filename never appears. This removes the false
// positives the filename-only check produced.
//
// RATCHET (v2): like the quality + wiring baselines, a `testlink-baseline.json`
// freezes the CURRENT untested backlog; the gate fails only on a NEW untested
// module, so a repo with a testing backlog stays green while it is burned down.
// `--write-baseline` snapshots the current set.
//
// Usage:
//   node check-testlink.mjs [srcDir=src] [testDir=tests] [file1 file2 ...]
//                           [--baseline <path>] [--write-baseline]
// Explicit files (with a '/') => check only those (the changed-file list in CI).
// Exit 0 = no NEW untested module beyond the baseline. Exit 1 = a new one.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// Modules we do NOT require a direct test for: barrels, pure type files, data
// files, READMEs, templates. Exercised transitively; a dedicated test for an
// index.ts barrel is noise.
function exempt(file) {
  const b = basename(file);
  return (
    b === 'index.ts' || b === 'types.ts' || b.endsWith('.d.ts') ||
    b.endsWith('.json') || b.endsWith('.md') || b.endsWith('.css') ||
    b.startsWith('_') || file.includes('/data/') || b.endsWith('.data.ts') ||
    b.endsWith('.data1.ts') || b.endsWith('.data2.ts')
  );
}

// Exported symbol names from a module (function/const/class/interface/type/enum).
const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g;
function exportedSymbols(src) {
  const names = new Set();
  let m;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(src)) !== null) names.add(m[1]);
  return names;
}

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write-baseline');
const baseIdx = argv.indexOf('--baseline');
const BASELINE = baseIdx >= 0 ? argv[baseIdx + 1] : 'testlink-baseline.json';
// positional args = everything that is not a flag AND not the --baseline value
const positional = argv.filter((a, i) => !a.startsWith('--') && i !== baseIdx + 1);
const srcDir = positional[0] && !positional[0].includes('/') ? positional[0] : 'src';
const testDir = positional[1] && !positional[1].includes('/') ? positional[1] : 'tests';
const explicit = positional.filter((a) => a.includes('/'));

const testBlob = walk(testDir)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.mjs'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const candidates = (explicit.length ? explicit : walk(srcDir))
  .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts'))
  .filter((f) => !exempt(f));

function isLinked(file) {
  const stem = basename(file).replace(/\.(ts|tsx)$/, '');
  const stemRe = new RegExp(`[\\'"\\/]${stem}(\\.js|\\.ts|\\')?[\\'"/]|/${stem}['\\"]`);
  if (stemRe.test(testBlob) || testBlob.includes(stem)) return true;
  // symbol linkage: any exported symbol used by a test (follows barrel re-exports)
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { return false; }
  for (const name of exportedSymbols(src)) {
    if (name.length >= 4 && new RegExp(`\\b${name}\\b`).test(testBlob)) return true;
  }
  return false;
}

const untested = candidates.map((f) => relative('.', f).replace(/\\/g, '/')).filter((f) => !isLinked(f)).sort();

if (WRITE) {
  writeFileSync(BASELINE, JSON.stringify({ note: 'E13 test-link ratchet: known untested modules (the backlog). New modules not listed here fail the gate.', untested }, null, 2) + '\n');
  console.log(`E13 test-link: wrote ${BASELINE} with ${untested.length} known-untested modules.`);
  process.exit(0);
}

const baseSet = existsSync(BASELINE)
  ? new Set((JSON.parse(readFileSync(BASELINE, 'utf8')).untested) || [])
  : new Set();

const fresh = untested.filter((u) => !baseSet.has(u));
const nowLinked = [...baseSet].filter((b) => !untested.includes(b));

console.log('E13 test-link guard - every substantive module must be referenced by a test (symbol-aware)');
console.log(`  candidates: ${candidates.length} | untested: ${untested.length} (baseline ${baseSet.size})`);
if (nowLinked.length) console.log(`  ratchet: ${nowLinked.length} baseline module(s) are now TESTED - drop them from ${BASELINE}.`);
if (fresh.length) {
  console.log(`FAIL (E13): ${fresh.length} NEW untested module(s) - shipped with no test:`);
  for (const u of fresh) console.log(`    ${u}`);
  process.exit(1);
}
console.log('PASS (E13): no new untested module beyond the known backlog.');
process.exit(0);
