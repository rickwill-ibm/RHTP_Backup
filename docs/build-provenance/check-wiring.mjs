#!/usr/bin/env node
// E14 - dependency-free WIRED-PATH (integration) gate. Detects the "unwired
// realness" defect: a production-shaped module that no real entry point reaches,
// so it is built + unit-tested against fakes but never actually called. It builds
// the static import graph, marks everything reachable from the app ENTRY POINTS
// (src/app routes/pages + middleware), and flags src/lib modules reachable by
// NOTHING but tests.
//
// It is a RATCHET, like the quality-baseline: a `wiring-baseline.json` freezes the
// CURRENT known-orphan set, and the gate fails only on a NEW orphan - so a codebase
// with a wiring backlog stays green while it is burned down, but new unwired code
// is caught. `--write-baseline` snapshots the current orphans.
//
// No dependencies: fs + regex import parsing + @/ alias resolution (tsconfig paths).
//
// Usage:
//   node check-wiring.mjs [srcDir=src] [--write-baseline] [--baseline <path>]
// Exit 0 = no NEW orphan beyond the baseline. Exit 1 = a new unwired module.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const argv = process.argv.slice(2);
const SRC = argv.find((a) => !a.startsWith('--')) || 'src';
const WRITE = argv.includes('--write-baseline');
const BASELINE = (() => { const i = argv.indexOf('--baseline'); return i >= 0 ? argv[i + 1] : 'wiring-baseline.json'; })();

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e); const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mjs)$/.test(p) && !/\.d\.ts$/.test(p)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

// resolve an import specifier from `fromFile` to an actual source file path (or null)
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = resolve(SRC, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else return null; // bare (node_modules) - ignore
  const cands = [base + '.ts', base + '.tsx', base + '.mjs',
    join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const c of cands) { const n = c.replace(/\\/g, '/'); if (existsSync(n)) return relative('.', n).replace(/\\/g, '/'); }
  return null;
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

const files = walk(SRC);
const graph = new Map();          // file -> Set(imported files)
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const deps = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const r = resolveSpec(spec, f);
    if (r && r !== f) deps.add(r);
  }
  graph.set(f, deps);
}

// entry points: everything under src/app + middleware/instrumentation
const isEntry = (f) => f.startsWith(`${SRC}/app/`) || /\/(middleware|instrumentation)\.(ts|tsx)$/.test(f);
const reachable = new Set();
const queue = files.filter(isEntry);
for (const e of queue) reachable.add(e);
while (queue.length) {
  const cur = queue.shift();
  for (const dep of graph.get(cur) || []) if (!reachable.has(dep)) { reachable.add(dep); queue.push(dep); }
}

// candidate orphans: src/lib modules not reachable from any entry (exempt data/types-only barrels lightly)
// demoPreservation/ is a CI GATE HARNESS (E14/E15 + demo golden) — reached only by tests
// and the gate BY DESIGN, not unwired production code; it is a first-class exemption.
const exempt = (f) => /\/data\//.test(f) || /\/_TEMPLATE|\.d\.ts$/.test(f) || /\/demoPreservation\//.test(f);
const orphans = files
  .filter((f) => f.startsWith(`${SRC}/lib/`) && !reachable.has(f) && !exempt(f))
  .sort();

if (WRITE) {
  writeFileSync(BASELINE, JSON.stringify({ note: 'E14 wired-path ratchet: known unwired modules (the backlog). New orphans not listed here fail the gate.', orphans }, null, 2) + '\n');
  console.log(`E14: wrote ${BASELINE} with ${orphans.length} known-orphan modules.`);
  process.exit(0);
}

const baseSet = existsSync(BASELINE)
  ? new Set((JSON.parse(readFileSync(BASELINE, 'utf8')).orphans) || [])
  : new Set();

const fresh = orphans.filter((o) => !baseSet.has(o));
const nowWired = [...baseSet].filter((b) => !orphans.includes(b)); // baseline entries that got wired (ratchet can shrink)

console.log('E14 wired-path gate - is every module reached by a real entry point?');
console.log(`  entries: ${files.filter(isEntry).length} | reachable: ${reachable.size} | lib orphans: ${orphans.length} (baseline ${baseSet.size})`);
if (nowWired.length) console.log(`  ratchet: ${nowWired.length} baseline module(s) are now WIRED - drop them from ${BASELINE}.`);
if (fresh.length) {
  console.log(`FAIL (E14): ${fresh.length} NEW unwired module(s) - built but reached by no real entry point:`);
  for (const o of fresh) console.log(`    ${o}`);
  console.log('  Wire it to a production caller (route/job/consumer), or register it as an owned seam. Do not just unit-test it.');
  process.exit(1);
}
console.log('PASS (E14): no new unwired module beyond the known backlog.');
process.exit(0);
