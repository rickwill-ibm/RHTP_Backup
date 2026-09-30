#!/usr/bin/env node
// check-ref-resolution.mjs — the DATA CROSS-REFERENCE gate.
//
// WHY THIS GATE EXISTS. The repo has a hand validator for every data file, and each
// one refuses loudly on a malformed BLOB. Not one of them can see across two files.
// So a reference that names a key no file defines is well-formed everywhere it is
// written and resolves nowhere, and every gate passes:
//
//   tsc --noEmit    -> `escalationPolicyRef: string`, and "bh-acute" is a string.
//   adl:check       -> the definition, the lock and the manifest all AGREE on the
//                      spelling, so byte-identity holds. Agreement is not existence.
//   vitest          -> no test proposed an action as that agent.
//   seams / wiring  -> a JSON key is not an import.
//
// This is not hypothetical. `bh-screening-triage-agent` shipped with
// `escalationPolicyRef: "bh-acute"` in its definition AND in the build-time authority
// lock, while `escalation-policies.json` defined only "default". `getEscalationTier`
// (src/lib/agentRuntime/escalation.ts) calls `req(set, ...)` and THROWS
// EscalationPolicyError — at runtime, inside `propose()`, i.e. the first time that
// agent tried to put anything in front of a human. A governed agent whose escalation
// path throws is strictly worse than one with no escalation policy at all: the
// manifest asserts an SLA and a hierarchy that cannot be loaded.
//
// The general shape: a REFERENCE field in one data file must resolve to a DEFINED key
// in another. Add a rule below whenever a new ref field is introduced; the cost of a
// rule is four lines and the cost of omitting one is a runtime throw in a governed
// path that no gate sees.
//
// Usage: node docs/build-provenance/check-ref-resolution.mjs [repoRoot]
// Exit 1 with a report on any unresolved reference; 0 if clean.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Positional args only — a `--flag` must never be read as the repo root. It was, and the
// gate tried to write its baseline to `--write-baseline/docs/...`.
const POSITIONAL = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ROOT = POSITIONAL[0] || process.cwd();

/**
 * A document is USABLE only if it parses to a plain non-null object. Absent, unparseable
 * and "parses to something that is not an object" are all findings.
 *
 * WHY THE LAST ONE IS EXPLICIT. The first cut returned `{ value: <whatever parsed> }` and
 * the rule loop then did `if (!refDoc.value || !defDoc.value) continue`. A file whose
 * entire content is `null` (or `0`, `false`, `""`) parses cleanly — it is neither missing
 * nor unparseable — so both escalation rules CONTINUED with zero findings and the gate
 * printed `ref-resolution: OK` and exited 0. A truncated policy file was a pass.
 */
const read = (rel) => {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return { missing: true, rel };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { unparseable: String(err && err.message), rel };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      unparseable: `parsed to ${Array.isArray(parsed) ? 'an array' : String(parsed)}, not an object`,
      rel,
    };
  }
  return { value: parsed, rel };
};

/**
 * Each rule names WHERE the references are authored, WHERE the definitions live, and
 * what throws when one does not resolve. `refs` and `defines` return arrays/sets from
 * an already-parsed document, so a rule cannot silently skip a file that is missing:
 * an absent or unparseable file is itself a finding.
 */
const RULES = [
  {
    id: 'escalation-policy-ref',
    refFile: 'src/lib/agents/manifest/data/agent-manifests.json',
    defFile: 'src/lib/agentRuntime/data/escalation-policies.json',
    consequence:
      'getEscalationTier() throws EscalationPolicyError inside AgentEngine.propose() — ' +
      'the agent cannot escalate anything to a human',
    refs: (doc) =>
      (doc.agents ?? []).map((a) => ({ at: `agents[${a.id}]`, ref: a.escalationPolicyRef })),
    defines: (doc) => Object.keys(doc.policies ?? {}),
  },
  {
    id: 'escalation-policy-ref-lock',
    refFile: 'src/lib/agents/authority/data/authority-lock.json',
    defFile: 'src/lib/agentRuntime/data/escalation-policies.json',
    consequence:
      'the BUILD-TIME authority ceiling names an escalation policy that does not exist, ' +
      'so the lock asserts a control it cannot bound',
    refs: (doc) =>
      (doc.entries ?? []).map((e) => ({
        at: `entries[${e.agentId}]`,
        ref: e.escalationPolicyRef,
      })),
    defines: (doc) => Object.keys(doc.policies ?? {}),
  },
  {
    id: 'routing-agent-ref',
    refFile: 'src/lib/agents/dispatch/data/agent-routing.json',
    defFile: 'src/lib/agents/manifest/data/agent-manifests.json',
    consequence:
      'getAgentManifest() throws on dispatch — the route names an agent with no manifest, ' +
      'so the task is built and then cannot be authorised',
    refs: (doc) => (doc.routes ?? []).map((r) => ({ at: `routes[${r.id}]`, ref: r.agentId })),
    defines: (doc) => (doc.agents ?? []).map((a) => a.id),
  },
];

/**
 * A GATE MUST VERIFY ITS OWN REACH — and the number it verifies against must not be a
 * literal the person who wants it green edits in the same commit.
 *
 * The first cut declared `minRefs` per rule as an exact count with zero headroom (5/5/3,
 * total 13, against a tree holding exactly 5 agents, 5 lock entries and 3 routes). Two
 * consequences: withdrawing one agent — a CORRECT change already decided for the next wave
 * — takes two rules to 4 and turns the gate RED on a change it should be indifferent to;
 * and the obvious response is to decrement the literal, at which point the reach check is
 * maintained by hand by whoever wants it to pass. That is the vacuity the mechanism exists
 * to prevent.
 *
 * So reach is a COMMITTED BASELINE, the mechanism `check-file-sizes.sh`,
 * `check-wiring.mjs` and `check-testlink.mjs` already use: a DROP is a finding, a RISE is
 * fine, and changing the expectation is a visible diff in a separate artifact written by an
 * explicit `--write-baseline` — never a silent edit inside the gate.
 */
const BASELINE_PATH = join(ROOT, 'docs/build-provenance/ref-resolution-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
let BASELINE = {};
if (existsSync(BASELINE_PATH)) {
  try {
    BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).reach ?? {};
  } catch {
    console.error(`ref-resolution: ${BASELINE_PATH} is unreadable — refusing to run unbaselined.`);
    process.exit(2);
  }
} else if (!WRITE_BASELINE) {
  console.error(`ref-resolution: no baseline at ${BASELINE_PATH}. Run with --write-baseline once.`);
  process.exit(2);
}

const reach = {};
const findings = [];
let checked = 0;

for (const rule of RULES) {
  const refDoc = read(rule.refFile);
  const defDoc = read(rule.defFile);

  for (const [role, doc] of [
    ['reference', refDoc],
    ['definition', defDoc],
  ]) {
    if (doc.missing) {
      findings.push({ rule: rule.id, at: doc.rel, msg: `${role} file does not exist` });
    } else if (doc.unparseable) {
      findings.push({
        rule: rule.id,
        at: doc.rel,
        msg: `${role} file is not parseable JSON: ${doc.unparseable}`,
      });
    }
  }
  if (!refDoc.value || !defDoc.value) continue;

  /**
   * A GATE MUST VERIFY ITS OWN REACH. Without the `minRefs` check below, renaming
   * `"routes"` to `"route"` in the routing file made `refs()` iterate nothing: `checked`
   * dropped from 13 to 10, `findings` stayed empty, and the gate exited 0 while checking
   * a third less than it claimed. `checked` was printed and never asserted — the same
   * blind spot that made the coalition gate vacuous, in a gate wired in beside it.
   */
  let defined;
  let refs;
  try {
    defined = new Set(rule.defines(defDoc.value));
    refs = rule.refs(refDoc.value);
  } catch (err) {
    // A rule whose accessor throws (a key holding a string where an array belongs) used
    // to exit with a raw stack trace instead of the report this gate exists to produce.
    findings.push({
      rule: rule.id,
      at: rule.refFile,
      msg: `rule accessor threw — the document shape is not what the rule expects: ${String(err && err.message)}`,
      consequence: rule.consequence,
    });
    continue;
  }
  reach[rule.id] = refs.length;
  const expected = BASELINE[rule.id];
  if (expected !== undefined && refs.length < expected) {
    findings.push({
      rule: rule.id,
      at: rule.refFile,
      msg:
        `resolves ${String(refs.length)} reference(s), down from a baselined ${String(expected)}. ` +
        'A DROP means the collection key was renamed or the accessor stopped matching, so this ' +
        `rule now checks less than it did. If the drop is intended, re-run with --write-baseline.`,
      consequence: 'the rule silently stops checking and the gate still reports OK',
    });
  }
  for (const { at, ref } of refs) {
    checked += 1;
    if (typeof ref !== 'string' || ref.length === 0) {
      findings.push({
        rule: rule.id,
        at: `${rule.refFile} ${at}`,
        msg: 'reference is absent or not a non-empty string',
        consequence: rule.consequence,
      });
      continue;
    }
    if (!defined.has(ref)) {
      findings.push({
        rule: rule.id,
        at: `${rule.refFile} ${at}`,
        msg:
          `"${ref}" is not defined in ${rule.defFile} ` +
          `(defined: ${[...defined].sort().join(', ') || 'none'})`,
        consequence: rule.consequence,
      });
    }
  }
}

if (WRITE_BASELINE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ reach }, null, 2)}\n`);
  console.log(`ref-resolution: wrote baseline reach to ${BASELINE_PATH}`);
  console.log(`  ${JSON.stringify(reach)}`);
  process.exit(findings.length === 0 ? 0 : 1);
}
if (findings.length === 0) {
  console.log(
    `ref-resolution: OK (${RULES.length} rule(s), ${checked} reference(s) resolved; ` +
      `reach ${JSON.stringify(reach)}) - no dangling data refs`
  );
  process.exit(0);
}
console.error(`ref-resolution: ${findings.length} unresolved reference(s):\n`);
for (const f of findings) {
  console.error(`  [${f.rule}] ${f.at}`);
  console.error(`      ${f.msg}`);
  if (f.consequence) console.error(`      consequence: ${f.consequence}`);
  console.error('');
}
process.exit(1);
