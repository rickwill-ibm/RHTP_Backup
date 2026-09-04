// tests/wpcGraph/parity.fingerprint.test.ts
// WAVE 0 — all-member parity fingerprint ("nothing is lost").
//
// Complements demoPreservation: that harness fingerprints Maria's AUTHORED SOURCE;
// this one fingerprints the DERIVED output of buildWholePersonGraph for EVERY member
// (Maria + PAT-0042/0087/0103/0156), so refactors like routing the builder through
// the FHIR seam can't silently drift any member's graph, lenses, story or signals.
//
// Reuses demoPreservation's fingerprintPanel (count + sorted ids + volatile-normalised
// hash) — one fingerprint mechanism across the codebase, not two. Adds the red-team's
// referential-integrity and determinism guards. First run writes the golden; commit it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fingerprintPanel } from '@/lib/demoPreservation/fingerprint';
import { buildWholePersonGraph } from '@/lib/wpcGraph/builder';
import { buildLensRegistry } from '@/lib/wpcGraph/lensUtils';
import { buildStorySteps } from '@/lib/wpcGraph/storySteps';
import { buildMemberSignals } from '@/lib/wpcGraph/memberSignals';

const MEMBERS = ['MARIA_SD_001', 'PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'];
const GOLDEN_DIR = path.join(process.cwd(), 'tests/wpcGraph/__parity__');

function memberFingerprint(id: string) {
  const { nodes, edges, isEmpty } = buildWholePersonGraph(id);
  return {
    id,
    isEmpty,
    panels: [
      fingerprintPanel('graph.nodes', nodes),
      fingerprintPanel('graph.edges', edges),
      fingerprintPanel('graph.lenses', buildLensRegistry(nodes, edges)),
      fingerprintPanel('graph.story', buildStorySteps(nodes, edges)),
      fingerprintPanel('graph.signals', buildMemberSignals(nodes, edges)),
    ],
  };
}

describe('WPC per-member parity fingerprint — Wave 0 baseline', () => {
  it('referential integrity: every edge references a present node', () => {
    for (const id of MEMBERS) {
      const { nodes, edges } = buildWholePersonGraph(id);
      const ids = new Set(nodes.map((n) => n.id));
      for (const e of edges) {
        expect(ids.has(e.source), `${id}: edge ${e.id} → missing source ${e.source}`).toBe(true);
        expect(ids.has(e.target), `${id}: edge ${e.id} → missing target ${e.target}`).toBe(true);
      }
    }
  });

  it('determinism: repeated derivation is byte-identical', () => {
    for (const id of MEMBERS) {
      expect(JSON.stringify(memberFingerprint(id))).toBe(JSON.stringify(memberFingerprint(id)));
    }
  });

  for (const id of MEMBERS) {
    it(`parity: ${id} matches frozen golden`, () => {
      const fp = memberFingerprint(id);
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      const file = path.join(GOLDEN_DIR, `${id}.json`);
      const serialized = JSON.stringify(fp, null, 2) + '\n';
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, serialized);
        console.warn(`[parity] froze golden for ${id}`);
        return;
      }
      expect(serialized).toBe(fs.readFileSync(file, 'utf-8'));
    });
  }
});
