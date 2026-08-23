/**
 * Demo-preservation gate (HW0 / I12) — governing constraint #2.
 *
 * Compares the live demo surface to a committed golden. A change to any authored
 * demo panel (graph, SMART cards, rosters, the authored HEDIS/STARS/MIPS gaps, or
 * the seam-mode defaults) fails this test like a broken build. To intentionally
 * change the demo, regenerate the golden: DEMO_GOLDEN_WRITE=1 vitest run tests/demoPreservation
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { captureDemoSurface, demoPanelIds } from '../../src/lib/demoPreservation';

const GOLDEN = join(__dirname, 'demo-golden.json');

function loadGolden() {
  return JSON.parse(readFileSync(GOLDEN, 'utf8'));
}

describe('demo-preservation golden (constraint #2)', () => {
  const live = captureDemoSurface();

  if (process.env.DEMO_GOLDEN_WRITE === '1' || !existsSync(GOLDEN)) {
    it('writes the golden (generation mode)', () => {
      mkdirSync(dirname(GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, JSON.stringify(live, null, 2) + '\n');
      expect(existsSync(GOLDEN)).toBe(true);
    });
    return;
  }

  const golden = loadGolden();

  it('capture version matches the golden', () => {
    expect(live.version).toBe(golden.version);
  });

  it('preserves the exact set of demo panels (no panel added or dropped silently)', () => {
    expect(demoPanelIds().sort()).toEqual(golden.panels.map((p: any) => p.panel).sort());
  });

  // one assertion per panel: count, ids, and hash must all match the golden
  const goldenByPanel = new Map<string, any>(golden.panels.map((p: any) => [p.panel, p]));
  for (const panel of live.panels) {
    it(`panel "${panel.panel}" is unchanged (count/ids/hash)`, () => {
      const g = goldenByPanel.get(panel.panel);
      expect(g, `golden missing panel ${panel.panel}`).toBeTruthy();
      expect(panel.count).toBe(g.count);
      expect(panel.ids).toEqual(g.ids);
      expect(panel.hash).toBe(g.hash);
    });
  }
});
