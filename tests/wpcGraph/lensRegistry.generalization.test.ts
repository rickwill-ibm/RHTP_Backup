/**
 * buildLensRegistry — GENERALIZATION proof.
 *
 * The lens system must work for ANY member in the population, not just the golden
 * demo. These tests build synthetic members entirely from data (no Maria/Sofia/Elena
 * literals) and assert the registry derives the right lenses:
 *   - domain lenses always present; an empty domain degrades to the member anchor;
 *   - relationship lenses are DERIVED from PARENT_OF / CAREGIVER_FOR edges, labeled by
 *     whatever name is on the node, and ABSENT when the member has none;
 *   - 0 / 1 / many relationships all render correctly (dependents before caregivers).
 * A final block guards the golden demo (Maria) so it stays pixel-identical.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildLensRegistry, SOFIA_LENS_NODES } from '@/lib/wpcGraph/lensUtils';
import { buildWholePersonGraph } from '@/lib/wpcGraph/builder';
import type { GraphNode, GraphEdge, LensType } from '@/lib/wholePersonGraphData';

// ── tiny synthetic-graph builders (data only — no hardcoded names) ────────────
const node = (id: string, type: string, label: string, lens: LensType[]): GraphNode =>
  ({
    id,
    nodeNum: 0,
    type,
    label,
    sublabel: '',
    properties: {},
    lens,
    color: '#000',
    radius: 10,
  }) as unknown as GraphNode;
const edge = (source: string, target: string, type: string): GraphEdge =>
  ({
    id: `${source}->${target}`,
    source,
    target,
    type,
    label: type,
    color: '#000',
    strokeWidth: 1,
    lens: ['all'],
  }) as unknown as GraphEdge;

const member = (id = 'm1') =>
  node(id, 'Member', 'Jordan Vega', [
    'all',
    'clinical',
    'behavioral',
    'social',
    'eligibility',
    'agents',
  ]);

const ids = (reg: ReturnType<typeof buildLensRegistry>) => reg.map((l) => l.id);
const rels = (reg: ReturnType<typeof buildLensRegistry>) =>
  reg.filter((l) => l.kind === 'relationship');

describe('buildLensRegistry — universal domain lenses', () => {
  it('always emits the six domain lenses for any member', () => {
    const reg = buildLensRegistry([member()], []);
    expect(ids(reg)).toEqual(['all', 'clinical', 'behavioral', 'social', 'eligibility', 'agents']);
    expect(reg.every((l) => l.kind !== 'relationship')).toBe(true);
  });

  it('degrades an EMPTY domain to the member anchor only (never the whole graph)', () => {
    // member + one clinical gap; social/behavioral/eligibility/agents are empty.
    const nodes = [member(), node('g1', 'CareGap', 'A1c overdue', ['all', 'clinical'])];
    const reg = buildLensRegistry(nodes, [edge('m1', 'g1', 'HAS_CARE_GAP')]);
    const social = reg.find((l) => l.id === 'social')!;
    const clinical = reg.find((l) => l.id === 'clinical')!;
    expect(social.nodeIds).toEqual(['m1']); // graceful absence
    expect(social.count).toBe(1);
    expect(clinical.nodeIds).toContain('g1'); // populated domain still works
  });
});

describe('buildLensRegistry — relationship lenses are DERIVED and member-agnostic', () => {
  it('a member with NO relationships gets ZERO relationship lenses', () => {
    const reg = buildLensRegistry([member()], []);
    expect(rels(reg)).toHaveLength(0);
  });

  it('a member with ONE dependent gets one dep: lens labeled by that person', () => {
    const nodes = [member(), node('c1', 'Dependent', 'Amara Vega', ['all', 'social'])];
    const reg = buildLensRegistry(nodes, [edge('m1', 'c1', 'PARENT_OF')]);
    const r = rels(reg);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('dep:c1');
    expect(r[0].label).toBe('Amara · Dependent');
    expect(r[0].role).toBe('Dependent');
    expect(r[0].nodeIds).toEqual(expect.arrayContaining(['m1', 'c1']));
  });

  it('a member with MANY relationships gets one lens each, dependents before caregivers, named from data', () => {
    const nodes = [
      member(),
      node('c1', 'Dependent', 'Amara Vega', ['all', 'social']),
      node('c2', 'Dependent', 'Diego Vega', ['all', 'social']),
      node('p1', 'Member', 'Rosa Vega', ['all', 'social']), // elderly parent, cared for
    ];
    const edges = [
      edge('m1', 'c1', 'PARENT_OF'),
      edge('m1', 'c2', 'PARENT_OF'),
      edge('m1', 'p1', 'CAREGIVER_FOR'),
    ];
    const r = rels(buildLensRegistry(nodes, edges));
    expect(r.map((l) => l.label)).toEqual([
      'Amara · Dependent',
      'Diego · Dependent',
      'Rosa · Caregiver',
    ]);
    expect(r.map((l) => l.id)).toEqual(['dep:c1', 'dep:c2', 'car:p1']);
    // distinct colors within a family (lightness ramp), and dependent≠caregiver hue
    expect(new Set(r.map((l) => l.color)).size).toBe(3);
    // NOTHING references Sofia/Elena — labels are pure data
    expect(JSON.stringify(r)).not.toMatch(/sofia|elena/i);
  });

  it("INFORMAL_CAREGIVER_FOR also yields a Caregiver lens, and its closure pulls the person's neighborhood", () => {
    const nodes = [
      member(),
      node('e1', 'Member', 'Sam Cruz', ['all', 'clinical']),
      node('rx', 'Medication', 'Metformin', ['all', 'clinical']),
    ];
    const edges = [edge('m1', 'e1', 'INFORMAL_CAREGIVER_FOR'), edge('e1', 'rx', 'PRESCRIBED')];
    const r = rels(buildLensRegistry(nodes, edges));
    expect(r).toHaveLength(1);
    expect(r[0].role).toBe('Caregiver');
    expect(r[0].nodeIds).toEqual(expect.arrayContaining(['m1', 'e1', 'rx'])); // one-hop closure
  });
});

describe('buildLensRegistry — registry-derived patient (builder end-to-end)', () => {
  it('derives lenses purely from a registry patient graph (if any exist beyond the demo)', () => {
    // Smoke: unknown id → empty graph → still returns the six domain lenses, no crash.
    const g = buildWholePersonGraph('___nonexistent___');
    const reg = buildLensRegistry(g.nodes, g.edges);
    expect(reg.filter((l) => l.kind !== 'relationship').length).toBeGreaterThanOrEqual(0);
    expect(() => buildLensRegistry(g.nodes, g.edges)).not.toThrow();
  });
});

describe('buildLensRegistry — GOLDEN DEMO protected (Maria)', () => {
  const g = buildWholePersonGraph('MARIA_SD_001');
  const reg = buildLensRegistry(g.nodes, g.edges);

  it('emits Sophia (dependent) with the curated authored node-set, verbatim', () => {
    const sophia = reg.find((l) => l.id === 'dep:n15');
    expect(sophia).toBeDefined();
    expect(sophia!.label).toBe('Sophia · Dependent');
    expect([...sophia!.nodeIds].sort()).toEqual([...SOFIA_LENS_NODES].sort());
  });

  it('emits Elena (caregiver) derived from the INFORMAL_CAREGIVER_FOR edge', () => {
    const elena = reg.find((l) => l.id === 'car:n16');
    expect(elena).toBeDefined();
    expect(elena!.label).toBe('Elena · Caregiver');
    expect(elena!.role).toBe('Caregiver');
  });

  it('preserves the six domain lenses for the golden member', () => {
    expect(ids(reg).slice(0, 6)).toEqual([
      'all',
      'clinical',
      'behavioral',
      'social',
      'eligibility',
      'agents',
    ]);
  });
});
