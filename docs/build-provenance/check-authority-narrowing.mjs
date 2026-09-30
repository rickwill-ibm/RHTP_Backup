#!/usr/bin/env node
/**
 * THE NARROWING RATCHET — does the authority lock actually sit ABOVE the definitions it governs?
 *
 * WHY THIS GATE EXISTS. `assertWithinAuthorityLock` is six checks, a hand validator, a plain-node
 * mirror, a fail-closed `rank()` that throws rather than returning -1, and a dedicated test file. It
 * is correct. It is also, today, incapable of failing on the shipped set — because
 * `tools/adl/generate-definitions.mjs` bootstrapped `authority-lock.json` by copying each agent's own
 * `toolAllowlist`, `autonomyTier` and `phiPosture` into its lock entry. The gate compares a file
 * against a copy of itself. Register G-063.
 *
 * That took an adversarial review round to find, and it should not have. Nothing in the repository
 * measured the one property that makes the lock a control rather than a form: that SOMETHING is
 * narrower than SOMETHING ELSE. `assertWithinAuthorityLock` answers "is the definition within the
 * ceiling" — which a copy satisfies perfectly. This gate answers the question underneath it: **is
 * there a ceiling at all, or is the ceiling the floor?**
 *
 * WHY IT IS A RATCHET AND NOT A HARD FAILURE. Authoring real ceilings is a governance act — deciding
 * what each agent MAY have been permitted, above what it declares — and inventing them here would be
 * exactly the fabrication this programme keeps retracting. So the current state (zero agents narrow
 * on any dimension) is recorded as a baseline and does not block. What the ratchet buys:
 *
 *   1. The measurement is PRINTED on every run, so the tautology is visible in CI output rather than
 *      discoverable only by someone diffing two JSON files by hand.
 *   2. The number may only improve. A new agent whose ceiling is another copy cannot lower it
 *      silently, and a change that removes a real narrowing goes red.
 *
 * WHY THE BASELINE IS NOT A TRIPWIRE. W8 closed a defect whose tripwire had been mechanically
 * renamed and stayed green (see the register's CLOSED (W8) section). A tripwire asserting the
 * wrong-today value is one find-and-replace from becoming an assertion of the right-tomorrow value
 * with nobody noticing. A ratchet cannot be satisfied by renaming: the number either goes up or it
 * does not.
 *
 * WHAT IT DOES NOT CLAIM. A non-zero narrowing count does not prove the ceilings were authored
 * independently or thoughtfully — it proves only that the lock and the definitions are no longer the
 * same statement. That is a floor, not a finding of adequacy, and it is the most a mechanical check
 * can honestly assert about this.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DATA = 'src/lib/agents/adl/data';
const LOCK = 'src/lib/agents/authority/data/authority-lock.json';
const BASELINE = 'docs/build-provenance/authority-narrowing-baseline.json';
const BASELINE_NOTE =
  'May only rise. Zero is the CURRENT state and a registered defect, not an acceptable resting point: authority-lock.json was bootstrapped from the definitions it governs, so no agent sits below its ceiling on any dimension and assertWithinAuthorityLock cannot fail on this set. See register G-063.';

/** Ordered, widest last. Mirrors AUTONOMY_ORDER / PHI_ORDER; parity is asserted by the test. */
const AUTONOMY = ['HITL', 'HOTL', 'autonomous'];
const PHI = ['none', 'references-only', 'full'];

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/**
 * How far below its ceiling one agent sits, per dimension.
 *
 * `rank` returns null for an unrecognised value and the caller treats null as NOT-narrowing rather
 * than as a gap — the same fail-closed discipline `compile.mjs` learned the hard way, in the same
 * direction: an unknown value must never be scored as evidence of a control.
 */
function narrowingFor(def, entry) {
  const rank = (order, v) => {
    const i = order.indexOf(v);
    return i === -1 ? null : i;
  };
  const declared = new Set(def.toolAllowlist ?? []);
  const toolsDeclined = (entry.tools ?? []).filter((t) => !declared.has(t));

  const dTier = rank(AUTONOMY, def.autonomyTier);
  const cTier = rank(AUTONOMY, entry.maxAutonomyTier);
  const tierNarrower = dTier !== null && cTier !== null && dTier < cTier;

  const dPhi = rank(PHI, def.phiPosture);
  const cPhi = rank(PHI, entry.maxPhiPosture);
  const phiNarrower = dPhi !== null && cPhi !== null && dPhi < cPhi;

  const declaredClasses = new Set(def.dataCapability?.dataClasses ?? []);
  const classesDeclined = (entry.dataClasses ?? []).filter((c) => !declaredClasses.has(c));

  return {
    toolsDeclined,
    tierNarrower,
    phiNarrower,
    classesDeclined,
    any: toolsDeclined.length > 0 || tierNarrower || phiNarrower || classesDeclined.length > 0,
  };
}

function main() {
  const lockFile = read(LOCK);
  const byId = new Map((lockFile.entries ?? []).map((e) => [e.agentId, e]));
  const files = readdirSync(join(ROOT, DATA))
    .filter((f) => f.endsWith('.agent.json'))
    .sort();

  if (files.length === 0) {
    console.error('authority-narrowing: no agent definitions found — refusing to report a count.');
    process.exit(2); // an empty read is a failure, never a green zero
  }

  const rows = [];
  for (const f of files) {
    const def = read(join(DATA, f));
    const entry = byId.get(def.id);
    if (!entry) {
      console.error(
        `authority-narrowing: ${def.id} has no lock entry — adl:check should have caught this.`
      );
      process.exit(2);
    }
    rows.push({ id: def.id, ...narrowingFor(def, entry) });
  }

  const narrowing = rows.filter((r) => r.any);
  const count = narrowing.length;

  console.log('authority-narrowing — is the ceiling above the floor, or the same statement?');
  for (const r of rows) {
    const bits = [];
    if (r.toolsDeclined.length) bits.push(`declines ${r.toolsDeclined.length} tool(s)`);
    if (r.tierNarrower) bits.push('tier below ceiling');
    if (r.phiNarrower) bits.push('PHI posture below ceiling');
    if (r.classesDeclined.length) bits.push(`declines ${r.classesDeclined.length} data class(es)`);
    console.log(`  ${r.id.padEnd(32)} ${bits.length ? bits.join(' · ') : 'NARROWS NOTHING'}`);
  }
  console.log(
    `  measured: ${count}/${rows.length} agent(s) sit below their ceiling on any dimension.`
  );

  const base = existsSync(join(ROOT, BASELINE)) ? read(BASELINE) : { agentsNarrowing: 0 };
  const baseline = Number(base.agentsNarrowing ?? 0);

  if (count < baseline) {
    console.error(
      `\nFAIL: narrowing fell (${baseline} -> ${count}). A ceiling that stopped being wider than ` +
        'what the agent declares is a control that stopped existing.'
    );
    process.exit(1);
  }
  if (count > baseline) {
    console.log(
      `\nPROGRESS: narrowing rose (${baseline} -> ${count}). Lock the gain:\n` +
        `  node docs/build-provenance/check-authority-narrowing.mjs --write-baseline`
    );
  }
  if (count === 0) {
    console.log(
      '\nOK (baseline held) — but NOTE, and this is the point of the gate: NOT ONE agent narrows on\n' +
        'any dimension. The lock was bootstrapped from the definitions it governs\n' +
        '(tools/adl/generate-definitions.mjs), so `assertWithinAuthorityLock` cannot fail on this set\n' +
        'by construction. See register G-063. This is reported, not enforced, because authoring real\n' +
        'ceilings is a governance act and inventing them here would be the fabrication the register\n' +
        'exists to catch.'
    );
  } else {
    console.log('\nOK — baseline held or improved.');
  }

  if (process.argv.includes('--write-baseline')) {
    // The note is carried forward, not regenerated. It is the only thing in this file that says
    // WHY zero is not an acceptable resting point, and a `--write-baseline` that dropped it would
    // leave a bare number nobody can read a reason out of.
    writeFileSync(
      join(ROOT, BASELINE),
      `${JSON.stringify({ agentsNarrowing: count, note: base.note ?? BASELINE_NOTE }, null, 2)}\n`
    );
    console.log(`baseline written: ${count}`);
  }
}

main();
