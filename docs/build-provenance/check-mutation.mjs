#!/usr/bin/env node
// E13 (part 2) - dependency-free MUTATION SAMPLER. Measures test EFFECTIVENESS,
// not just presence: it injects small, meaning-changing mutations into a source
// file one at a time and re-runs that module's tests. A mutant the tests still
// pass through ("survived") is a hole - the tests do not actually catch that
// break. A mutant that makes a test fail ("killed") is the tests doing their job.
//
// No Stryker, no new dependencies - just Node's fs + child_process. Sampled
// (bounded mutants per file, scoped test command) so it is cheap enough to run
// at every iteration close on the critical modules.
//
// Usage:
//   node check-mutation.mjs <sourceFile> "<testCommand>" [maxMutants=6]
//   node check-mutation.mjs --config mutation-targets.json
// A config file is [{ "file": "...", "test": "npx vitest run ..." }, ...].
// Exit 0 = every sampled mutant was killed (or no sites found). Exit 1 = a
// mutant survived (a test-effectiveness gap) or a target file/command failed.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Conservative, high-signal operators. Each flips MEANING without usually
// breaking the parse. Order matters: longer tokens first so '>=' is not eaten
// by '>'. We match on the raw text and skip comment lines.
const OPERATORS = [
  ['>=', '>'], ['<=', '<'], ['===', '!=='], ['!==', '==='],
  ['&&', '||'], ['||', '&&'], ['>', '>='], ['<', '<='],
  ['\\btrue\\b', 'false'], ['\\bfalse\\b', 'true'],
];

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// Find every (index, from, to) mutation site in the source, skipping comment lines.
function findSites(src) {
  const lines = src.split('\n');
  const sites = [];
  let offset = 0;
  for (const line of lines) {
    if (!isCommentLine(line)) {
      for (const [from, to] of OPERATORS) {
        const re = new RegExp(from, 'g');
        let m;
        while ((m = re.exec(line)) !== null) {
          sites.push({ absIndex: offset + m.index, matched: m[0], from, to,
            lineText: line.trim().slice(0, 80) });
          if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
        }
      }
    }
    offset += line.length + 1; // +1 for the '\n'
  }
  // stable order by position, dedupe overlapping sites at the same index
  sites.sort((a, b) => a.absIndex - b.absIndex);
  return sites;
}

// Deterministic even sampling (no RNG - RNG is non-deterministic and discouraged).
function sample(sites, n) {
  if (sites.length <= n) return sites;
  const out = [];
  const step = sites.length / n;
  for (let i = 0; i < n; i++) out.push(sites[Math.floor(i * step)]);
  return out;
}

function applyMutation(src, site) {
  // replace the single occurrence at site.absIndex
  const head = src.slice(0, site.absIndex);
  const tail = src.slice(site.absIndex + site.matched.length);
  const replacement = site.to.replace(/\\b/g, ''); // '\\btrue\\b' -> 'true' pattern text; to is literal
  return head + replacement + tail;
}

function runTarget(file, testCmd, maxMutants) {
  const original = readFileSync(file, 'utf8');
  const sites = sample(findSites(original), maxMutants);
  const result = { file, tested: 0, killed: 0, survived: [], sites: sites.length };
  if (sites.length === 0) {
    console.log(`  ${file}: no mutation sites found (nothing to sample)`);
    return result;
  }
  try {
    for (const site of sites) {
      const mutated = applyMutation(original, site);
      if (mutated === original) continue;
      writeFileSync(file, mutated);
      result.tested++;
      let killed = false;
      try {
        execSync(testCmd, { stdio: 'ignore', timeout: 180000 });
        killed = false; // tests passed despite the mutation -> SURVIVED
      } catch {
        killed = true;  // a test failed -> mutant KILLED (good)
      } finally {
        writeFileSync(file, original); // ALWAYS restore before the next mutant
      }
      if (killed) result.killed++;
      else result.survived.push({ line: site.lineText, op: `${site.matched}->${site.to.replace(/\\b/g,'')}` });
    }
  } finally {
    writeFileSync(file, original); // belt and suspenders
  }
  return result;
}

function loadTargets() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--config') {
    return JSON.parse(readFileSync(argv[1], 'utf8'));
  }
  if (argv.length >= 2) {
    return [{ file: argv[0], test: argv[1], maxMutants: Number(argv[2] || 6) }];
  }
  console.error('usage: node check-mutation.mjs <sourceFile> "<testCommand>" [maxMutants]  |  --config <file.json>');
  process.exit(2);
}

const targets = loadTargets();
let anySurvived = false;
console.log('E13 mutation sampling - test-effectiveness gate');
for (const t of targets) {
  const r = runTarget(t.file, t.test, t.maxMutants || 6);
  const rate = r.tested ? Math.round((r.killed / r.tested) * 100) : 100;
  console.log(`  ${r.file}: ${r.killed}/${r.tested} mutants killed (${rate}%)`);
  for (const s of r.survived) {
    anySurvived = true;
    console.log(`    SURVIVED [${s.op}] near: ${s.line}`);
  }
}
if (anySurvived) {
  console.log('FAIL (E13): a mutant survived - the tests do not catch that break. Strengthen the test, do not delete the mutant.');
  process.exit(1);
}
console.log('PASS (E13): every sampled mutant was killed - tests have real catch-power.');
process.exit(0);
