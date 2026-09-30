#!/usr/bin/env node
// check-reviewer-qualification.mjs — E14-class WIRED-PATH gate for the reviewer-qualification plane.
//
// WHY THIS GATE EXISTS. `assertReviewerQualified` is the executable form of 42 CFR 438.210(b)(3):
// a decision to deny a service authorization request, or to authorize less than requested, must
// "be made by an individual who has appropriate expertise in addressing the enrollee's medical,
// behavioral health, or long-term services and supports needs." Before W7.5c the platform's entire
// check was `isQualifiedHumanDecision`, which returned true for any non-empty string that did not
// begin `autonomy:` — so `'human:bob'` passed, `'session-user'` passed, and the engine's own
// resolution path did not call even that.
//
// FOUR WEAKNESSES OF check-adverse-gate.mjs, FIXED HERE RATHER THAN INHERITED. That gate is this
// one's direct ancestor and its shape is sound, but an adversarial read found four ways it can rot:
//
//   1. ITS REACH ASSERTION DETECTS COLLAPSE, NOT EROSION. It exits 2 only when ZERO capable files
//      match. If the plane grows to six and a rename breaks the markers on five, it prints "OK —
//      1/1". A gate that survives a 6→1 drop reporting green is the ratchet-shaped failure its own
//      header disavows. So this gate carries EXPECTED_MIN_SITES as reviewed data and fails below it.
//   2. IT ONLY WALKS src/app/api. The qualification plane is NOT route-only — the binding that
//      matters is `agentRuntime/engine.signal`, and `agents/demo/index.ts` reaches a resolution
//      without being a route at all. A gate scoped to routes would have printed green while the
//      engine resolved adverse proposals on a hardcoded string. This walks all of src/.
//   3. ITS COMMENT MASKER IS ASSERTED, NOT TESTED. Masking too little reopens the
//      comment-satisfies-grep hole, SILENTLY. This programme has shipped that failure twice. So the
//      masker self-tests against a fixture on every run and exits 2 if it misclassifies.
//   4. A STALE EXEMPT ENTRY SITS FOREVER. Delete the file and the key remains, quietly
//      pre-authorising a future file at that path. An EXEMPT key naming a non-existent file fails.
//
// Usage: node docs/build-provenance/check-reviewer-qualification.mjs [repoRoot]
// Exit 1 on an unbound site; 2 on a wiring/config/self-test fault; 0 clean.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || process.cwd();
const SRC = join(ROOT, 'src');

/**
 * The calls that bind this plane. Any one of them qualifies a site.
 *
 * `qualifyReviewer` is `/api/pa/decision`'s route-local wrapper — it exists so the choice of WHICH
 * requirement applies to WHICH determination has one home, and it calls `assertReviewerQualified`
 * itself. Listing it here is not a loophole: the wrapper is a site of this plane and is covered by
 * the same walk, so if it ever stopped calling the real assert, the gate would flag IT.
 */
const BINDERS = [
  'assertReviewerQualified',
  'assertSignalDecider',
  'qualifyReviewer', // /api/pa/decision's route-local wrapper
  'qualifyRecoveryDecider', // the two recovery routes' shared wrapper
];

/**
 * How many sites must bind. REVIEWED DATA, not a floor discovered at runtime.
 *
 * Today: `agentRuntime/engine.ts` (the resolution path), `agents/demo/index.ts` (the demo driver
 * that reaches it), `api/pa/decision/qualification.ts` (the member determination) and
 * `api/recovery/[id]/decisionSupport.ts` (the recovery submission). Lowering this number is a
 * reviewed edit with the same weight as adding an EXEMPT entry — it is how the plane shrinks
 * legitimately, and how erosion would have to announce itself.
 */
const EXPECTED_MIN_SITES = 4;

/**
 * NAMED sites that must each still be a site AND still be bound.
 *
 * A COUNT CANNOT DETECT SUBSTITUTION, only shrinkage — adversarial review demonstrated the escape:
 * refactor `engine.signal` so `signal.decidedBy` is destructured and the `assertSignalDecider(` call
 * is deleted, and `engine.ts` stops matching any marker at all. Sites drop 5→4, `EXPECTED_MIN_SITES`
 * is 4, and the gate prints `OK — 4/4` with the engine bind — the entire justification for this wave
 * — gone. Naming the files closes that: the engine is checked BY NAME, not by arithmetic.
 */
const REQUIRED_SITES = [
  'src/lib/agentRuntime/engine.ts',
  'src/app/api/pa/decision/route.ts',
  'src/app/api/recovery/[id]/action/route.ts',
  'src/lib/agents/demo/index.ts',
];

/**
 * Files that DECLARE a binder rather than call one. A function declaration matches `name(`, so the
 * module defining `assertSignalDecider` counted as both a site and as bound — the
 * "grep gate satisfied by a comment" failure with the comment replaced by a function signature.
 */
const DEFINERS = new Set(['src/lib/agentRuntime/engineSupport.ts']);

/**
 * Files that resolve a human decision but are NOT qualification sites, each with the reason.
 * An entry with no reason, or naming a file that no longer exists, is a finding.
 */
const EXEMPT = {
  'src/app/api/recovery/[id]/decision/route.ts':
    'builds the HumanDecision but DELEGATES the resolution to ../decisionSupport.ts ' +
    '(runReconstructAndSignal), which is itself a site of this plane and binds it. Exempting the ' +
    'caller rather than the delegate is deliberate: the qualification must happen where the signal ' +
    'is sent, and that is where the gate checks for it.',
  'src/lib/agentRuntime/types.ts':
    'DECLARES WorkflowSignal (including the `reviewer` proof field); it is the interface, not a ' +
    'resolution site. Nothing here can resolve anything.',
  'src/lib/terminology/governance/service.ts':
    'value-set version governance (maker-checker on a CODE SYSTEM, not a member benefit). 42 CFR ' +
    '438.210(b)(3) attaches to a service-authorization decision about an enrollee; approving a ' +
    'value-set version is not one, and requiring a credentialed clinical reviewer there would be ' +
    'the gate crying wolf — which is how an exempt list grows until it means nothing.',
};

/** Strip comments and string/template literals before looking for a CALL. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/**
 * SELF-TEST THE MASKER. Weakness 3 above: masking too little reopens the hole silently, and this
 * programme has shipped a gate satisfied by a code comment twice. So the masker is EXECUTED against
 * a fixture that contains the binder name in every position that must NOT count, plus one that must.
 */
function selfTestMasker() {
  const fixture = [
    '/* assertReviewerQualified in a block comment */',
    '// assertReviewerQualified in a line comment',
    "const a = 'assertReviewerQualified in a single-quoted literal';",
    'const b = "assertReviewerQualified in a double-quoted literal";',
    'const c = `assertReviewerQualified in a template literal`;',
    'const real = assertReviewerQualified(ref, requirement, asOfMs);',
  ].join('\n');
  const masked = codeOnly(fixture);
  const hits = (masked.match(/assertReviewerQualified/g) || []).length;
  if (hits !== 1) {
    console.error(`reviewer-qualification: MASKER SELF-TEST FAILED — expected exactly 1 surviving`);
    console.error(`     occurrence (the real call), got ${hits}. The comment/literal masker is`);
    console.error(`     wrong, so a mention in prose could satisfy this gate. Refusing to run.`);
    process.exit(2);
  }
  if (!/\bassertReviewerQualified\s*\(/.test(masked)) {
    console.error(
      'reviewer-qualification: MASKER SELF-TEST FAILED — the real call did not survive.'
    );
    process.exit(2);
  }
  // AND THE SITE MARKERS, which are the half that decides what gets checked at all. A prose mention
  // that made a file look like a site would be loud; one that made a real site invisible would not.
  const proseOnly = [
    '// this file mentions assertSignalDecider( and signal.decidedBy in a comment',
    "const s = 'HumanDecision = { decidedBy: principal.userId }';",
  ].join('\n');
  if (SITE_MARKERS.some((m) => m.re.test(codeOnly(proseOnly)))) {
    console.error('reviewer-qualification: SITE-MARKER SELF-TEST FAILED — prose matched a marker.');
    process.exit(2);
  }
  // A DECLARATION must not count as a call, or the definer binds itself.
  if (callsBinder(codeOnly('export function assertSignalDecider(rec, signal) { return; }'))) {
    console.error(
      'reviewer-qualification: DECLARATION SELF-TEST FAILED — a definition counted as a bind.'
    );
    process.exit(2);
  }
}

/** Does this file CALL one of the binders (not merely name or DECLARE one)? */
function callsBinder(code) {
  // A declaration is not a call. `export function assertSignalDecider(` matches `name(` too.
  const withoutDecls = code.replace(/\b(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/g, ' DECL(');
  return BINDERS.some((b) => new RegExp(`\\b${b}\\s*\\(`).test(withoutDecls));
}

/**
 * What makes a file a resolution site: it signals a workflow decision, or it records a coverage
 * determination. Structural, not name-based.
 */
const SITE_MARKERS = [
  // A workflow resolution: the signal that turns a pending proposal into a decision.
  {
    id: 'workflow-resolution',
    re: /name:\s*''\s*,?[\s\S]{0,120}?proposalId|assertSignalDecider\s*\(|signal\.decidedBy/,
  },
  // A determination record: somewhere a `HumanDecision` is CONSTRUCTED and stamped with a decider.
  { id: 'determination-record', re: /HumanDecision\s*=\s*\{|decidedBy:\s*principal\./ },
];

// THE MARKER THAT WAS WRONG, recorded because the reasoning matters. The first cut keyed on
// `isAdverseCoverageAction|buildDecisionProvenance`, copied from check-adverse-gate.mjs. It flagged
// seven files and only one of them was a resolution site: `isAdverseCoverageAction` is a CLASSIFIER
// used all over the engine (e2eFlow, recoverySimulation, interlock) to ask "is this action class
// adverse", and `decisionProvenance.ts` is where `buildDecisionProvenance` is DEFINED. None of them
// resolves a human decision. The adverse-taint plane and the qualification plane are different
// planes, and copying the former's markers imported the wrong question. Padding EXEMPT with six
// entries would have hidden that — and an exempt list grown to silence a bad marker is how a gate
// stops meaning anything.

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

selfTestMasker();

const files = walk(SRC);
if (files.length === 0) {
  console.error(`reviewer-qualification: no source files under ${relative(ROOT, SRC)} — refusing.`);
  process.exit(2);
}

const findings = [];

// Weakness 4: a stale exemption pre-authorises a future file at that path.
for (const [rel, reason] of Object.entries(EXEMPT)) {
  if (!existsSync(join(ROOT, rel)))
    findings.push({
      rel,
      msg: 'is EXEMPT but no longer exists — a stale exemption silently pre-authorises whatever lands at that path',
    });
  else if (typeof reason !== 'string' || reason.trim().length === 0)
    findings.push({
      rel,
      msg: 'is EXEMPT with no stated reason — an unexplained exemption is a hole',
    });
}

let sites = 0;
let bound = 0;
const seen = new Set();
const boundFiles = new Set();

for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const code = codeOnly(readFileSync(abs, 'utf8'));
  if (!SITE_MARKERS.some((m) => m.re.test(code))) continue;
  if (Object.prototype.hasOwnProperty.call(EXEMPT, rel)) continue;
  if (DEFINERS.has(rel)) continue; // declares a binder; does not resolve anything
  sites += 1;
  seen.add(rel);
  if (callsBinder(code)) {
    bound += 1;
    boundFiles.add(rel);
  } else
    findings.push({
      rel,
      msg:
        `resolves or records a determination and calls NEITHER ${BINDERS.join(' NOR ')}. ` +
        'A decision resolved without a qualified reviewer means an adverse determination can be ' +
        'made by someone the platform cannot name — which is the one thing 42 CFR 438.210(b)(3) ' +
        'forbids, and which this plane exists to make impossible.',
    });
}

// Weakness 1a: SUBSTITUTION. Each named site must still be present and bound.
for (const req of REQUIRED_SITES) {
  if (!seen.has(req))
    findings.push({
      rel: req,
      msg:
        'is a REQUIRED site and no longer matches any marker. Either its resolution path moved — ' +
        'in which case this list moves with it, as a reviewed edit — or the binding was refactored ' +
        'away, which is the escape a bare count cannot see.',
    });
  else if (!boundFiles.has(req))
    findings.push({
      rel: req,
      msg: 'is a REQUIRED site and no longer binds the qualification plane.',
    });
}

// Weakness 1b: erosion, not just collapse.
if (sites < EXPECTED_MIN_SITES) {
  console.error(
    `reviewer-qualification: found ${sites} site(s), expected at least ${EXPECTED_MIN_SITES}.`
  );
  console.error('     Either the markers stopped matching (a rename, a refactor, a moved file) or');
  console.error(
    '     the plane genuinely shrank. Both need a reviewed edit to EXPECTED_MIN_SITES —'
  );
  console.error('     a gate that quietly checks fewer things each release is not a gate.');
  process.exit(2);
}

if (findings.length === 0) {
  console.log(
    `reviewer-qualification: OK — ${bound}/${sites} resolution site(s) bind the qualification plane ` +
      `(min ${EXPECTED_MIN_SITES}, ${Object.keys(EXEMPT).length} reviewed exemption(s))`
  );
  process.exit(0);
}

console.error(`reviewer-qualification: ${findings.length} finding(s):\n`);
for (const f of findings) {
  console.error(`  ${f.rel}`);
  console.error(`      ${f.msg}\n`);
}
console.error('Fix by resolving the reviewer through assertReviewerQualified (or, for a workflow');
console.error('signal, by letting assertSignalDecider run) — or, if the file genuinely records no');
console.error('determination, add it to EXEMPT with a reason.');
process.exit(1);
