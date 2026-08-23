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

// Build the search regex for an operator. Operators are LITERAL text (e.g. '||',
// '>=') and MUST be regex-escaped — otherwise '||' is read as an empty regex
// alternation that matches zero-width at every position (a real bug this tool hit
// when dogfooded). The two `\b...\b` word-boundary operators (true/false) are the
// deliberate exception and are used as-is.
function opRegex(from) {
  if (from.includes('\\b')) return new RegExp(from, 'g');
  return new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
}

// Replace string-literal interiors and TS generic parameter lists with spaces,
// preserving length, so operator matching only sees executable code. Handles
// single-line '...' / "..." / `...` strings and `Name<...>` type arguments.
function maskNonCode(line) {
  const chars = line.split('');
  let quote = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quote) {
      if (c === quote && chars[i - 1] !== '\\') quote = null;
      else chars[i] = ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    }
  }
  let masked = chars.join('');
  // Blank out the inside of TS generic argument lists (angle brackets) so a
  // comparison operator is never confused with a type bracket.
  masked = masked.replace(/<[^<>]*>/g, (g) => ' '.repeat(g.length));
  return masked;
}

// Find every (index, from, to) mutation site in the source, skipping comment lines.
function findSites(src) {
  const lines = src.split('\n');
  const sites = [];
  let offset = 0;
  for (const line of lines) {
    // A line marked `mut-equiv:` carries a PROVABLY-EQUIVALENT mutant (a mutation
    // that cannot change observable behavior — e.g. `x > 9` vs `x >= 9` where x is
    // always even). Equivalent mutants are unkillable by definition; the marker
    // (with a justification) excludes the line, the standard way real mutation
    // tools handle them. Use sparingly and only with a written reason.
    if (!isCommentLine(line) && !line.includes('mut-equiv')) {
      // Mask string-literal interiors (and TS generic angle-brackets) so operator-
      // like text INSIDE a string ('partial-approval') or a type (Pick<A,'b'>) is
      // never a mutation site. Masking preserves length, so indices stay aligned
      // with the original line — the mutation is still applied to real code only.
      const scan = maskNonCode(line);
      for (const [from, to] of OPERATORS) {
        const re = opRegex(from);
        let m;
        while ((m = re.exec(scan)) !== null) {
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
