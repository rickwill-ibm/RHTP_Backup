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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { sep } from 'node:path';
import { execSync } from 'node:child_process';
// Framework v1.6 §6 crash-safe restore (on-disk sentinel + crash recovery) lives in its
// own module. It has NO import-time side effects and exposes NO recovery entry point that
// does not REQUIRE the declared target set — see its ORDERING header and register G-009.
import { createSentinelGuard } from './lib/mutation-sentinel.mjs';

// Conservative, high-signal operators. Each flips MEANING without usually
// breaking the parse. Order matters: longer tokens first so '>=' is not eaten
// by '>'. We match on the raw text and skip comment lines.
const OPERATORS = [
  ['>=', '>'],
  ['<=', '<'],
  ['===', '!=='],
  ['!==', '==='],
  ['&&', '||'],
  ['||', '&&'],
  ['>', '>='],
  ['<', '<='],
  ['\\btrue\\b', 'false'],
  ['\\bfalse\\b', 'true'],
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
          sites.push({
            absIndex: offset + m.index,
            matched: m[0],
            from,
            to,
            lineText: line.trim().slice(0, 80),
          });
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

// --- Framework v1.6 §6: crash-safe restore -----------------------------------
// MOVED to ./lib/mutation-sentinel.mjs under the size ratchet (AI-CODING-CONVENTIONS §2/§3).
// Nothing here arms it; the guard is built from the DECLARED TARGET SET at the bottom of
// this file, after loadTargets(), and only that object can run recovery.

/**
 * PROVE THE SUITE IS GREEN BEFORE MUTATING ANYTHING.
 *
 * THE VACUITY THIS CLOSES. `killed` was derived from `execSync` throwing, and ANY
 * non-zero exit was read as "killed": a typo in `mutation-targets.json`, a renamed test
 * file, a vitest config error, a module-resolution failure, a 180s timeout, an OOM. Each
 * of those made EVERY mutant "killed" and printed `PASS (E13): every sampled mutant was
 * killed - tests have real catch-power`. A gate that scores a broken command as a perfect
 * score is worse than no gate: it is a green tick over an absence.
 *
 * It is the same blind spot the sibling gate names at check-ref-resolution.mjs — "A GATE
 * MUST VERIFY ITS OWN REACH" — which was fixed there and not carried here, in the same
 * commit. `exit 2` (a wiring fault), not `exit 1` (a test-effectiveness finding), because
 * the two mean different things to whoever reads CI.
 */
function assertBaselineGreen(file, testCmd) {
  try {
    execSync(testCmd, { stdio: 'ignore', timeout: 180000 });
  } catch (err) {
    console.error(`E13: the test command for ${file} is NOT GREEN on unmutated source.`);
    console.error('     Refusing to score: every mutant would count as "killed" and the gate');
    console.error('     would report 100% catch-power over a command that never ran.');
    console.error(`     command: ${testCmd}`);
    console.error(
      `     exit:    ${String(err && err.status)}${err && err.signal ? ` signal ${err.signal}` : ''}`
    );
    process.exit(2);
  }
}

/**
 * Two operator pairs can match at the SAME index — `['>=','>']` and `['>','>=']` both
 * match a single `>=`. `sample`'s comment claimed it deduped overlapping sites and it
 * never did, so the second mutant at that index produced `>==`, a SYNTAX ERROR: tests
 * fail, and the gate counted a guaranteed false KILL. Every `>=` and `<=` in a target
 * inflated the reported catch rate. Keep the longest `matched` at each index — the
 * specific operator, not the substring of it.
 */
function dedupeSites(sites) {
  const best = new Map();
  for (const s of sites) {
    const prior = best.get(s.absIndex);
    if (prior === undefined || s.matched.length > prior.matched.length) best.set(s.absIndex, s);
  }
  return [...best.values()].sort((a, b) => a.absIndex - b.absIndex);
}

function runTarget(guard, file, testCmd, maxMutants) {
  const original = readFileSync(file, 'utf8');
  assertBaselineGreen(file, testCmd);
  // DEDUPE BEFORE SAMPLING. Sampling first and deduping after removes sites from an
  // already-drawn sample, so the denominator silently shrank below `maxMutants` by however
  // many operator collisions the draw happened to contain — and "killed ≤ tested ≤
  // maxMutants" stopped pinning anything.
  const sites = sample(dedupeSites(findSites(original)), maxMutants);
  const result = { file, tested: 0, killed: 0, survived: [], sites: sites.length };
  // ARM NOTHING until there is a mutant to protect. The first cut armed INFLIGHT_* and
  // wrote the sentinel here and then returned early on the zero-sites path, BEFORE the
  // `finally` that disarms — so `process.on('exit')` fired at normal termination and
  // wrote bytes read at function entry over a file this run never mutated, silently
  // reverting an edit made during the run. Nothing is armed and nothing is on disk until
  // a mutant is actually about to be written, below.
  if (sites.length === 0) {
    console.log(`  ${file}: no mutation sites found (nothing to sample)`);
    return result;
  }
  try {
    for (const site of sites) {
      const mutated = applyMutation(original, site);
      if (mutated === original) continue;
      // Sentinel BEFORE the write, carrying this mutant's hash — so recovery can PROVE
      // the bytes it is about to overwrite are ours and not a developer's edit.
      guard.arm(file, original, mutated);
      writeFileSync(file, mutated);
      result.tested++;
      let killed = false;
      try {
        execSync(testCmd, { stdio: 'ignore', timeout: 180000 });
        killed = false; // tests passed despite the mutation -> SURVIVED
      } catch {
        killed = true; // a test failed -> mutant KILLED (good)
      } finally {
        writeFileSync(file, original); // ALWAYS restore before the next mutant
      }
      if (killed) result.killed++;
      else
        result.survived.push({
          line: site.lineText,
          op: `${site.matched}->${site.to.replace(/\\b/g, '')}`,
        });
    }
  } finally {
    // Belt and suspenders — but provenance-guarded, so a concurrent save is never
    // clobbered by bytes captured at function entry.
    const onDisk = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (onDisk !== null && onDisk !== original) writeFileSync(file, original);
    guard.disarm(); // only after the final restore has actually been written
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
  console.error(
    'usage: node check-mutation.mjs <sourceFile> "<testCommand>" [maxMutants]  |  --config <file.json>'
  );
  process.exit(2);
}

// ORDERING (register G-009). `loadTargets()` exits 2 on a usage error, so an invocation
// that is about to refuse never reaches the filesystem. The guard is then CONSTRUCTED FROM
// those targets: `createSentinelGuard` requires the declared set, so there is no way to
// spell a call that recovers before the set exists — move either line above
// `loadTargets()` and the program throws a TypeError instead of writing a file. That is
// the invariant that used to rest on a `let DECLARED_TARGETS = null` and one line's
// position; the import cannot weaken it, because the sentinel module has no import-time
// side effects and no recovery entry point that does not take the set.
const targets = loadTargets();
const guard = createSentinelGuard(new Set(targets.map((t) => String(t.file).split(sep).join('/'))));
guard.recover();

let anySurvived = false;
console.log('E13 mutation sampling - test-effectiveness gate');
for (const t of targets) {
  const r = runTarget(guard, t.file, t.test, t.maxMutants || 6);
  const rate = r.tested ? Math.round((r.killed / r.tested) * 100) : 100;
  console.log(
    `  ${r.file}: ${r.killed}/${r.tested} mutants killed (${rate}%) ` +
      `[sampled ${r.sites} of max ${String(t.maxMutants || 6)}]`
  );
  for (const s of r.survived) {
    anySurvived = true;
    console.log(`    SURVIVED [${s.op}] near: ${s.line}`);
  }
}
if (anySurvived) {
  console.log(
    'FAIL (E13): a mutant survived - the tests do not catch that break. Strengthen the test, do not delete the mutant.'
  );
  process.exit(1);
}
console.log('PASS (E13): every sampled mutant was killed - tests have real catch-power.');
process.exit(0);
