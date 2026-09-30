/**
 * THE NARROWING RATCHET, AND THE VOCABULARY IT RESTATES.
 *
 * `check-authority-narrowing.mjs` restates `AUTONOMY_ORDER` and `PHI_ORDER` because it imports no
 * TypeScript — the same reason `tools/adl/compile.mjs` restates them, and the same drift risk. The
 * ladders are ORDERED and the order IS the semantics: a mirror whose `AUTONOMY` array is
 * `['HITL','autonomous','HOTL']` scores an autonomous agent as narrower than a HOTL one and reports
 * a control that is not there. Byte comparison cannot catch that, because this gate emits no
 * artifact — so it is pinned here, member for member AND in order.
 *
 * The second half pins the finding itself (register G-063), because the gate is a RATCHET and a
 * ratchet at zero is indistinguishable from a ratchet that has never measured anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AUTONOMY_ORDER, PHI_ORDER } from '@/lib/agents/authority';

const ROOT = process.cwd();
const GATE = 'docs/build-provenance/check-authority-narrowing.mjs';
const DATA = 'src/lib/agents/adl/data';
const LOCK = 'src/lib/agents/authority/data/authority-lock.json';
const BASELINE = 'docs/build-provenance/authority-narrowing-baseline.json';

const read = (p: string): unknown => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/** Pull a restated array literal out of the gate source, so the test reads what the gate reads. */
function restated(name: string): string[] {
  const src = readFileSync(join(ROOT, GATE), 'utf8');
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  expect(m, `${name} not found in ${GATE} — the extractor is stale, not the gate`).not.toBeNull();
  return (m as RegExpExecArray)[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => s.length > 0);
}

describe('authority-narrowing gate', () => {
  it('restates the two authority ladders in the SAME ORDER as the TypeScript source', () => {
    // toEqual on arrays, not set comparison: for a ladder, order is the semantics.
    expect(restated('AUTONOMY')).toEqual([...AUTONOMY_ORDER]);
    expect(restated('PHI')).toEqual([...PHI_ORDER]);
  });

  it('the extractor itself works — otherwise the test above passes against nothing', () => {
    // The self-test the 92210 gate's masker needed: a regex that silently matches nothing turns
    // every assertion above into `[] === []`.
    expect(restated('AUTONOMY').length).toBeGreaterThan(1);
    expect(restated('PHI').length).toBeGreaterThan(1);
  });

  it('G-063: the lock narrows NOTHING, on any dimension, for any agent', () => {
    // Pinned as the FINDING, not as a desired state. The day a real ceiling is authored this goes
    // red, and that is the signal — unlike a ratchet sitting at zero, which is indistinguishable
    // from a gate that has never run.
    const lock = read(LOCK) as { entries: Array<Record<string, unknown>> };
    const byId = new Map(lock.entries.map((e) => [e.agentId as string, e]));
    const files = readdirSync(join(ROOT, DATA)).filter((f) => f.endsWith('.agent.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const def = read(join(DATA, f)) as {
        id: string;
        toolAllowlist: string[];
        autonomyTier: string;
        phiPosture: string;
        dataCapability?: { dataClasses?: string[] };
      };
      const entry = byId.get(def.id);
      expect(entry, `${def.id} has no lock entry`).toBeDefined();
      const e = entry as {
        tools: string[];
        maxAutonomyTier: string;
        maxPhiPosture: string;
        dataClasses?: string[];
      };

      const declined = e.tools.filter((t) => !def.toolAllowlist.includes(t));
      expect(declined, `${def.id} now declines tools — G-063 is closing, update this test`).toEqual(
        []
      );
      expect(e.maxAutonomyTier, `${def.id} tier ceiling`).toBe(def.autonomyTier);
      expect(e.maxPhiPosture, `${def.id} PHI ceiling`).toBe(def.phiPosture);
      const classesDeclined = (e.dataClasses ?? []).filter(
        (c) => !(def.dataCapability?.dataClasses ?? []).includes(c)
      );
      expect(classesDeclined, `${def.id} data-class ceiling`).toEqual([]);
    }
  });

  it('the baseline records zero AND carries the reason, not a bare number', () => {
    const b = read(BASELINE) as { agentsNarrowing: number; note?: string };
    expect(b.agentsNarrowing).toBe(0);
    // A bare `0` is a number nobody can read a reason out of, and `--write-baseline` carrying the
    // note forward is what stops the reason being lost on the first regeneration.
    expect(b.note).toMatch(/G-063/);
    expect(b.note).toMatch(/not an acceptable resting point/);
  });
});
