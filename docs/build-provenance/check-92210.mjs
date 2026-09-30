#!/usr/bin/env node
// check-92210.mjs — 45 CFR 92.210(b) IDENTIFICATION, enforced structurally.
//
// THE RULE, verbatim from eCFR: "A covered entity has an ongoing duty to make reasonable efforts to
// identify uses of patient care decision support tools in its health programs or activities that
// employ INPUT VARIABLES OR FACTORS THAT MEASURE race, color, national origin, sex, age, or
// disability." And (c): a mitigation for each tool so identified.
//
// WHY THIS GATE ENUMERATES RATHER THAN VALIDATES, which is the whole design.
//
// The first cut of this wave put a `decisionSupport: { protectedInputs: [...] }` block on each agent
// definition and had this script check it was well-formed. That is identification BY ASSERTION: it
// asks an author "which of your inputs measure a protected characteristic", and the answer is `[]`
// unless the author happens to think of `channelPreference` as a disability proxy. Nobody does —
// which is exactly why all five proxies in this codebase were invisible until someone went looking:
//
//   channelPreference (disability/age/LEP, and it SELECTS the channel, which then delays the
//   touchpoint) · recentEdWithinHours (the canonical utilization proxy) · Signal.measure (quality
//   measure ids are sex- and age-defined BY CONSTRUCTION, hiding behind a field its own comment
//   calls PHI-safe) · contactHistory (housing stability) · the behavioural-health consent scope.
//
// So this gate inverts it. It holds three things together and fails when any two disagree:
//
//   1. the FIELDS declared on `MemberContext` / `PolicyPack` in `src/lib/sde/types.ts`,
//   2. the fields `src/lib/fairness/engineFields.ts` says the engine reads,
//   3. the reviewed entries in `src/lib/fairness/data/fairness-lock.json`.
//
// UNLISTED FIELD = REFUSE. A new input variable cannot reach a member decision until someone has
// written down what it measures — even if the honest answer is "nothing, and here is why", which
// costs the same review as a mitigation. That is what makes the artifact an identification EFFORT
// rather than a form somebody filled in, and it is the property OCR's own reasonable-efforts factor
// ("whether the covered entity has a methodology or process in place") is asking about.
//
// WHAT THIS GATE DOES NOT CLAIM. OCR declined to mandate documentation. The lock is EVIDENCE of
// reasonable efforts, not a thing the rule requires, and a green gate is not a compliance finding.
//
// Usage: node docs/build-provenance/check-92210.mjs [repoRoot]
// Exit 1 on an unidentified or unmitigated field; 2 on a self-test/wiring fault; 0 clean.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || process.cwd();
const SDE_TYPES = join(ROOT, 'src/lib/sde/types.ts');
const ENGINE_FIELDS = join(ROOT, 'src/lib/fairness/engineFields.ts');
const LOCK = join(ROOT, 'src/lib/fairness/data/fairness-lock.json');

for (const [label, p] of [
  ['sde types', SDE_TYPES],
  ['engine fields', ENGINE_FIELDS],
  ['fairness lock', LOCK],
]) {
  if (!existsSync(p)) {
    console.error(
      `92210: ${label} not found at ${p} — refusing to pass on a check that read nothing.`
    );
    process.exit(2);
  }
}

/** Extract the declared property names of one interface from a .ts source. */
function interfaceFields(src, name) {
  const start = src.indexOf(`export interface ${name} {`);
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open + 1, end);
  // Strip comments, then take top-level `name?:` / `name:` at nesting depth 0.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const fields = [];
  let d = 0;
  for (const line of stripped.split('\n')) {
    const trimmed = line.trim();
    const m = d === 0 ? trimmed.match(/^([A-Za-z_]\w*)\??\s*:/) : null;
    if (m) fields.push(m[1]);
    for (const ch of line) {
      if (ch === '{' || ch === '[') d += 1;
      else if (ch === '}' || ch === ']') d -= 1;
    }
  }
  return fields;
}

// SELF-TEST the extractor, because a parser that silently returns [] makes this gate report clean
// over a file it could not read — the "gate that scans nothing" failure its siblings both guard.
{
  const fixture = [
    'export interface Probe {',
    '  /** a doc comment with name: in it */',
    '  alpha: string;',
    '  beta?: number; // trailing',
    '  nested: { inner: string };',
    '}',
  ].join('\n');
  const got = interfaceFields(fixture, 'Probe');
  const want = ['alpha', 'beta', 'nested'];
  if (!got || got.join(',') !== want.join(',')) {
    console.error(`92210: EXTRACTOR SELF-TEST FAILED — expected [${want}], got [${got}].`);
    console.error('     A parser that mis-reads the types would let this gate pass over nothing.');
    process.exit(2);
  }
}

const sdeSrc = readFileSync(SDE_TYPES, 'utf8');
/**
 * THE TYPES THE ENGINE READS. Four, not two.
 *
 * The first cut walked `MemberContext` and `PolicyPack` only — and the input that actually selects a
 * member's channel is `TaxonomyEntry.defaultChannel`, in a JSON data file, reached through
 * `Signal.channel`. Fourteen of `Signal`'s fifteen fields were invisible to this gate while the lock
 * claimed coverage, so a new `Signal.riskTier` could have been read by `priorityScore` and the gate
 * would still have printed OK. Coverage the gate does not enforce is coverage the lock should not
 * claim.
 */
const READ_TYPES = ['MemberContext', 'PolicyPack', 'Signal', 'TaxonomyEntry'];

const declared = [];
for (const t of READ_TYPES) {
  const fields = interfaceFields(sdeSrc, t);
  // An EMPTY read is the dangerous direction and it used to pass: `[]` is truthy, so a parser that
  // found the interface and no fields would have skipped the whole check and printed OK.
  if (!fields || fields.length === 0) {
    console.error(`92210: read ZERO fields from interface ${t} in src/lib/sde/types.ts.`);
    console.error(
      '     It moved, was renamed, or the extractor mis-parsed it. Refusing to pass on'
    );
    console.error('     a check that found no inputs — an empty read is not a clean one.');
    process.exit(2);
  }
  for (const f of fields) declared.push(`${t}.${f}`);
}

const enumerated = [
  ...readFileSync(ENGINE_FIELDS, 'utf8').matchAll(/'([A-Za-z]+\.[A-Za-z_]\w*)'/g),
].map((m) => m[1]);
/**
 * THE LEG DERIVED FROM CODE, which the first cut did not have — and its absence was the frame defect.
 *
 * All three of the original legs were DECLARATIONS: a type declaration, a hand-written enumeration,
 * and a reviewed JSON record. Three declarations can agree perfectly with each other while agreeing
 * with no line of executing code. The proof: deleting `ctx.channelPreference` from `rules.ts`
 * entirely left the gate, the lock and every test green, because nothing anywhere asked what the
 * engine actually reads.
 *
 * So this leg greps the engine for the property access itself. It is coarse — a property name, not a
 * resolved type — and it is deliberately only a WARNING when a listed field has no visible read,
 * because a field can be read through a destructure or a spread this cannot see. It is an ERROR in
 * the other direction, which is the one that matters: a field the code reads and nobody enumerated.
 */
const engineSrc = ['rules.ts', 'dispositionEngine.ts', 'explain.ts']
  .map((f) => join(ROOT, 'src/lib/sde/engine', f))
  .filter((f) => existsSync(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
if (engineSrc.length === 0) {
  console.error('92210: read no engine source under src/lib/sde/engine — refusing to pass.');
  process.exit(2);
}

const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
const lockFields = new Set(lock.entries.map((e) => e.field));

/**
 * Does an `evidenceRef` of the form `path` or `path#anchor` actually resolve?
 *
 * Added after adversarial review followed the trail: seven of the first thirteen entries cited
 * `#g-051` and `#w7-5d`, neither of which existed anywhere in the tree, and the remaining six cited
 * the code being mitigated. Thirteen assertions, zero of them checkable. `check-ref-resolution.mjs`
 * already does this for data refs; there was no reason for a REGULATORY record to be held to less.
 */
function evidenceResolves(ref) {
  if (!ref) return false;
  const [file, anchor] = ref.split('#');
  const abs = join(ROOT, file);
  if (!existsSync(abs)) return false;
  if (!anchor) return true;
  // A markdown anchor: a heading that slugifies to it, or the literal anchor text.
  const body = readFileSync(abs, 'utf8').toLowerCase();
  if (body.includes(`#${anchor.toLowerCase()}`)) return true;
  return body
    .split('\n')
    .filter((l) => l.trim().startsWith('#'))
    .some((h) =>
      h
        .replace(/[^a-z0-9 -]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .includes(anchor.toLowerCase())
    );
}

const findings = [];

// (1) Every DECLARED field of a type the engine reads must be enumerated. A field added to
//     MemberContext and quietly consumed is the exact drift a declaration-based design misses.
for (const f of declared) {
  if (!enumerated.includes(f))
    findings.push(
      `${f} is declared on a type the disposition engine reads, and engineFields.ts does not list it. ` +
        'A new input variable reached the engine without anyone saying what it measures.'
    );
}

// (2) Every enumerated field must have a REVIEWED lock entry. Unlisted = refuse.
for (const f of enumerated) {
  if (!lockFields.has(f))
    findings.push(
      `${f} is read by the engine and has NO entry in fairness-lock.json. 92.210(b) is an ongoing ` +
        'duty to identify inputs that measure a protected characteristic; an input nobody has looked ' +
        'at is unidentified by definition.'
    );
}

// (2b) DERIVED FROM CODE: a field the engine demonstrably reads must be enumerated. This is the leg
//      that is not a declaration, and it is why deleting a read no longer leaves everything green.
for (const f of declared) {
  const prop = f.split('.')[1];
  const readsIt = new RegExp(`\\.${prop}\\b`).test(engineSrc);
  if (readsIt && !enumerated.includes(f))
    findings.push(
      `${f} is READ by src/lib/sde/engine (a \`.${prop}\` access appears there) and is not in ` +
        'ENGINE_READ_FIELDS. This is the leg derived from code rather than from a declaration: three ' +
        'declarations can agree with each other while agreeing with nothing that executes.'
    );
}

// (3) No orphans. An entry for a field nothing reads is a review nobody is doing, in a file that
//     looks complete — the same rot `authority-lock.json` refuses.
for (const f of lockFields) {
  if (!enumerated.includes(f))
    findings.push(`${f} has a reviewed fairness entry but nothing reads it — an orphan review.`);
}

// (4) Shape: in-scope entries carry a mitigation; excluded entries carry a stated basis and measure
//     nothing. Mirrors assertEntryComplete so the gate and the runtime agree.
for (const e of lock.entries) {
  if (e.toolScope === 'administrative-excluded') {
    if (!e.exclusionBasis || e.exclusionBasis.trim().length < 20)
      findings.push(`${e.field} is administrative-excluded with no stated basis (45 CFR 92.4).`);
    if ((e.measures ?? []).length > 0)
      findings.push(
        `${e.field} is excluded AND declares it measures a protected basis — pick one.`
      );
  } else {
    if ((e.measures ?? []).length === 0)
      findings.push(`${e.field} is in scope but measures nothing — the row asserts no duty.`);
    if (!e.mitigation)
      findings.push(`${e.field}: 92.210(c) requires a mitigation for each identified input.`);
    else if (/^src\//.test(e.mitigation.evidenceRef ?? ''))
      findings.push(
        `${e.field}'s evidenceRef points into src/. The code is the SUBJECT of the mitigation, not ` +
          'evidence that a review happened — a self-reference is not a record.'
      );
    else if (!evidenceResolves(e.mitigation.evidenceRef ?? ''))
      findings.push(
        `${e.field}'s evidenceRef "${e.mitigation.evidenceRef}" does not resolve: the file is ` +
          'missing, or the #anchor is not present in it. Seven of the first thirteen entries cited ' +
          'anchors that existed nowhere, so an OCR reviewer following the trail would have found ' +
          'dead links — a record whose evidence cannot be reached is a record of intentions.'
      );
    else if (/flowSim|runFairnessScreen/i.test(e.mitigation.evidenceRef ?? ''))
      findings.push(
        `${e.field} cites the SIMULATED fairness screen as evidence. That ratio is synthesised from a ` +
          'formula plus a seeded variance term — citing it would make a modelled number the evidence ' +
          'for a regulatory claim.'
      );
  }
}

if (findings.length === 0) {
  console.log(
    `92210: OK — ${enumerated.length} engine input(s) identified, ${lock.entries.length} reviewed ` +
      `entr(ies), 0 unidentified, 0 orphans. (Evidence of reasonable efforts; not a compliance finding.)`
  );
  process.exit(0);
}

console.error(`92210: ${findings.length} finding(s):\n`);
for (const f of findings) console.error(`  - ${f}\n`);
console.error(
  'Fix by adding a REVIEWED entry to src/lib/fairness/data/fairness-lock.json saying what'
);
console.error(
  'the field measures — or that it measures nothing, with the basis for saying so. Both'
);
console.error('cost the same review, which is what stops the artifact from being an empty form.');
process.exit(1);
