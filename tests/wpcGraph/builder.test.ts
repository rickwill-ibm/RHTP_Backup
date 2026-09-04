// tests/wpcGraph/builder.test.ts
// Unit tests for buildWholePersonGraph.
// Covers: Maria golden-return, per-patient derivation, unknown-id safety, graph shape.

import { describe, it, expect } from 'vitest';
import { buildWholePersonGraph } from '@/lib/wpcGraph/builder';
import { graphNodes as GOLDEN_NODES, graphEdges as GOLDEN_EDGES } from '@/lib/wholePersonGraphData';

const MARIA_ID = 'MARIA_SD_001';
const KNOWN_IDS = ['PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'];

// ── Maria golden-return (fidelity gate) ──────────────────────────────────────

describe('buildWholePersonGraph — Maria branch', () => {
  it('returns the authored golden nodes verbatim for MARIA_SD_001', () => {
    const result = buildWholePersonGraph(MARIA_ID);
    expect(result.nodes).toBe(GOLDEN_NODES); // same reference — not a copy
    expect(result.isEmpty).toBe(false);
  });

  it('returns the authored golden edges verbatim for MARIA_SD_001', () => {
    const result = buildWholePersonGraph(MARIA_ID);
    expect(result.edges).toBe(GOLDEN_EDGES); // same reference — not a copy
  });

  it('Maria result has same node count as the golden export', () => {
    const result = buildWholePersonGraph(MARIA_ID);
    expect(result.nodes).toHaveLength(GOLDEN_NODES.length);
  });

  it('Maria result has same edge count as the golden export', () => {
    const result = buildWholePersonGraph(MARIA_ID);
    expect(result.edges).toHaveLength(GOLDEN_EDGES.length);
  });
});

// ── Per-patient derivation (non-Maria) ───────────────────────────────────────

describe('buildWholePersonGraph — registry-derived branch', () => {
  it.each(KNOWN_IDS)('returns non-empty graph for known patient %s', (id) => {
    const result = buildWholePersonGraph(id);
    expect(result.isEmpty).toBe(false);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_IDS)('first node is Member type for %s', (id) => {
    const { nodes } = buildWholePersonGraph(id);
    expect(nodes[0].type).toBe('Member');
    expect(nodes[0].id).toBe('n01');
  });

  it.each(KNOWN_IDS)('Member node label does NOT equal Maria Redhawk for %s', (id) => {
    const { nodes } = buildWholePersonGraph(id);
    expect(nodes[0].label).not.toBe('Maria Redhawk');
  });

  it.each(KNOWN_IDS)('does NOT return the golden object references for %s', (id) => {
    const result = buildWholePersonGraph(id);
    // Must be a freshly derived array, not the golden dataset
    expect(result.nodes).not.toBe(GOLDEN_NODES);
    expect(result.edges).not.toBe(GOLDEN_EDGES);
  });

  it('all nodes have required shape fields', () => {
    const { nodes } = buildWholePersonGraph(KNOWN_IDS[0]);
    nodes.forEach((n) => {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('type');
      expect(n).toHaveProperty('label');
      expect(Array.isArray(n.lens)).toBe(true);
      expect(n.lens.length).toBeGreaterThan(0);
    });
  });

  it('all edges reference node ids that exist in the nodes array', () => {
    const { nodes, edges } = buildWholePersonGraph(KNOWN_IDS[0]);
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges.forEach((e) => {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    });
  });

  it('all edge ids are unique', () => {
    const { edges } = buildWholePersonGraph(KNOWN_IDS[0]);
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Unknown id safety ────────────────────────────────────────────────────────

describe('buildWholePersonGraph — unknown id', () => {
  it('returns isEmpty:true for an unrecognised id', () => {
    const result = buildWholePersonGraph('UNKNOWN-9999');
    expect(result.isEmpty).toBe(true);
  });

  it('returns empty arrays for an unrecognised id', () => {
    const { nodes, edges } = buildWholePersonGraph('UNKNOWN-9999');
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
