#!/usr/bin/env node
// check-adverse-gate.mjs — E14-class WIRED-PATH gate for the adverse-determination plane.
//
// WHY THIS GATE EXISTS. `assertAdverseEligible` is the executable form of the platform's central
// regulatory claim: a model may not be the sole basis of an adverse determination (45 CFR 92.210
// mitigation, NY PHL §4903, 42 CFR 438.210(b)(3), and the "sole basis" language in every comparable
// state bill). For the whole life of that function it had exactly ONE non-test caller in `src/` —
// `app/api/ops/agents/reasoning/probeChain.ts`, whose own module header reads "an OPS self-test
// surface, not a member-facing path". The claim was true of a self-test and false of the product.
//
// Nothing caught it. Not `tsc` (the function was called, just not where it mattered). Not E13
// (probeChain has a test). Not E14's existing wiring gate (it compares declared resolvers to
// imports — a self-test route IS a real entry point, so the module was legitimately "wired"). Not
// grep (the symbol was present). It took an adversarial reviewer reading the call graph by hand.
//
// So this gate asks the only question that matters: **does every route that can RECORD an adverse
// determination also run the fact-taint gate?** A route qualifies as adverse-capable when it builds
// decision provenance or accepts a `'rejected'` decision. Each such route must call
// `assertAdverseEligible`.
//
// It is deliberately a ZERO gate with an explicit exempt list, not a ratchet. A ratchet on a
// safety claim is green while the claim is false — which is exactly the state this gate was written
// to end (cf. the Maria count ratchet sitting green at 80 while a wrong-member record was two
// clicks into the demo).
//
// Usage: node docs/build-provenance/check-adverse-gate.mjs [repoRoot]
// Exit 1 on an adverse-capable route with no gate; 2 on a wiring/config fault; 0 clean.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || process.cwd();
const API_DIR = join(ROOT, 'src/app/api');

/** The gate every adverse-capable route must run. */
const GATE = 'assertAdverseEligible';

/**
 * Strip comments and string/template literals before looking for a CALL.
 *
 * THE VACUITY THIS CLOSES, found by removing the gate and watching this script still pass. The
 * first cut asked `src.includes('assertAdverseEligible')`, and the route's own explanatory comment
 * names the function several times — so deleting the call and its import left the gate green. A
 * grep satisfied by prose about the thing is the same defect as a mutation gate that scores a
 * broken test command as a perfect score, and it is the SECOND time in this programme that a
 * comment has satisfied a grep gate. So: comments and literals are masked, and the check is for a
 * call — `name(` — not a mention.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/** Is the gate actually CALLED (not merely named) in this file's code? */
const callsGate = (src) => new RegExp(`\\b${GATE}\\s*\\(`).test(codeOnly(src));

/**
 * What makes a route adverse-capable. Both are structural, not name-based: a route that names a
 * `'rejected'` decision or assembles decision provenance is recording a determination whose
 * adverse branch exists, whatever the file is called.
 */
const ADVERSE_MARKERS = [
  {
    id: 'coverage-determination',
    re: /isAdverseCoverageAction|buildDecisionProvenance|isAdverseProvenanceComplete/,
  },
  {
    id: 'member-benefit-decision',
    re: /decision\s*[!=]==?\s*'rejected'[\s\S]{0,400}?(memberFacingReason|appealRef|coverage)/,
  },
];

// A bare /'rejected'/ was the first cut and it OVER-MATCHED, by a lot. Three of its five hits were
// not member determinations at all: `value-set-governance` uses `'rejected'` as a member of
// `GovernanceState` ('draft' | 'pending-approval' | 'approved' | 'rejected' | 'retired') for a value
// set, and the `recovery/**` routes approve or reject the MCO's own underpayment-recovery
// submission — the payer declining to pursue its own revenue claim, with no member benefit at
// stake. A gate that cries wolf on a status enum gets its exempt list padded until it means
// nothing, so the markers now key on the repo's OWN coverage-determination predicates
// (`isAdverseCoverageAction` is the single source of truth for the adverse class) rather than on a
// string that many domains happen to share.

/**
 * Routes that match a marker but are NOT adverse-capable, each with the reason. An entry here is a
 * reviewed decision; an empty reason is refused so the list cannot grow silently.
 */
const EXEMPT = {
  'src/app/api/pa/decision/qualification.ts':
    'decides WHICH reviewer requirement applies to a determination; it records none. It matches ' +
    'the coverage-determination marker only because it CALLS isAdverseCoverageAction as a ' +
    'classifier — the same over-match this gate already corrected once for value-set governance ' +
    'and the recovery routes. The determination itself is recorded by ./route.ts, which is ' +
    'adverse-capable, is NOT exempt, and does call assertAdverseEligible.',
  'src/app/api/ops/agents/reasoning/route.ts':
    'ops self-test surface — runs the gate on a recorded transcript and RETURNS the refusal as data; records no determination',
};

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

const files = walk(API_DIR);
if (files.length === 0) {
  console.error(
    `adverse-gate: no route files under ${relative(ROOT, API_DIR)} — refusing to pass.`
  );
  console.error('     A gate that scans nothing reports clean. Check the path.');
  process.exit(2);
}

const findings = [];
let adverseCapable = 0;
let gated = 0;

for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const src = readFileSync(abs, 'utf8');

  const code = codeOnly(src);
  const matched = ADVERSE_MARKERS.filter((m) => m.re.test(code)).map((m) => m.id);
  if (matched.length === 0) continue;

  if (Object.prototype.hasOwnProperty.call(EXEMPT, rel)) {
    const reason = EXEMPT[rel];
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      findings.push({
        rel,
        msg: 'is exempt with no stated reason — an unexplained exemption is a hole',
      });
    }
    continue;
  }

  adverseCapable += 1;
  if (callsGate(src)) {
    gated += 1;
  } else {
    findings.push({
      rel,
      msg:
        `is adverse-capable (${matched.join(', ')}) and does NOT call ${GATE}. ` +
        'An adverse determination recorded without a fact-taint check means a model-shaped fact ' +
        'can be its basis, which is the one thing the platform claims cannot happen.',
    });
  }
}

// REACH ASSERTION. If the markers stop matching — a rename, a refactor, a moved route — this gate
// silently checks nothing and reports clean. The same blind spot made the coalition gate vacuous.
if (adverseCapable === 0 && findings.length === 0) {
  console.error('adverse-gate: found ZERO adverse-capable routes. Either the markers no longer');
  console.error(
    '     match or the plane moved. Refusing to pass on a check that verified nothing.'
  );
  process.exit(2);
}

if (findings.length === 0) {
  console.log(
    `adverse-gate: OK — ${gated}/${adverseCapable} adverse-capable route(s) run ${GATE} ` +
      `(${Object.keys(EXEMPT).length} reviewed exemption(s))`
  );
  process.exit(0);
}

console.error(`adverse-gate: ${findings.length} finding(s):\n`);
for (const f of findings) {
  console.error(`  ${f.rel}`);
  console.error(`      ${f.msg}\n`);
}
console.error('Fix by calling assertAdverseEligible over the determinative facts, refusing when');
console.error('none are declared — or, if the route genuinely records no determination, add it to');
console.error('EXEMPT with a reason.');
process.exit(1);
