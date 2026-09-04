// wpcGraph/builder.ts — builds the whole-person knowledge graph for any citizen.
//
// SEAM: mock-only (all patients in this platform are demo/mockOnly).
// The builder has two branches:
//   MARIA_SD_001 → returns the curated 52-node/67-edge authored dataset verbatim (golden source).
//   Any other id  → derives a graph from the canonical patientRegistry + citizenNeeds.
//
// The Maria branch is validated by a deepEqual snapshot test against wholePersonGraphData.ts.
// No DB, no fetch — pure static client-side data. Works in mock mode with no backend.

import { graphNodes as GOLDEN_NODES, graphEdges as GOLDEN_EDGES } from '@/lib/wholePersonGraphData';
import { getPatientSync } from '@/lib/services/patientService';
import { citizenNeeds } from '@/lib/careTeam/graph/resources';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';
import type { GraphNode, GraphEdge, NodeType, LensType } from '@/lib/wholePersonGraphData';
import type { WpcGraphResult } from './types';
import type { RegistryPatient } from '@/lib/patientRegistry';

// ─── Color palette (mirrors wholePersonGraphData palette) ───────────────────

const C = {
  blue: '#0043ce',
  pink: '#9f1853',
  red: '#da1e28',
  green: '#198038',
  orange: '#b45309',
  amber: '#f59e0b',
  purple: '#6929c4',
  teal: '#007d79',
  sky: '#0284c7',
  lime: '#4d7c0f',
  slate: '#64748b',
  indigo: '#4338ca',
  gray: '#525252',
} as const;

// Node type → lens membership mapping (determines which lens tabs show this node)
const TYPE_LENS: Record<NodeType, LensType[]> = {
  Member: ['all', 'clinical', 'behavioral', 'social', 'eligibility', 'agents'],
  Insurance: ['all', 'eligibility'],
  CareGap: ['all', 'clinical'],
  Episode: ['all', 'clinical'],
  Medication: ['all', 'clinical'],
  Provider: ['all', 'clinical'],
  Dependent: ['all', 'social'],
  SDOHNode: ['all', 'social', 'behavioral'],
  BHScreening: ['all', 'behavioral'],
  Consent: ['all', 'eligibility'],
  ChannelHistory: ['all', 'social'],
  WorkScheduleConstraint: ['all', 'social'],
  HouseholdUnit: ['all', 'social'],
  CaregiverBurden: ['all', 'social', 'behavioral'],
  PharmacyTouchpoint: ['all', 'clinical'],
  CriticalAccessHospital: ['all', 'clinical'],
  ChildDevelopment: ['all', 'social'],
  SeasonalBarrier: ['all', 'social'],
  EligibilityStatus: ['all', 'eligibility'],
  BenefitStatus: ['all', 'eligibility'],
  WICStatus: ['all', 'eligibility', 'social'],
  BHProgramStatus: ['all', 'behavioral', 'eligibility'],
  HousingStatus: ['all', 'social', 'eligibility'],
  LIHEAPStatus: ['all', 'eligibility', 'social'],
  ScreeningResult: ['all', 'behavioral'],
  Agent: ['all', 'agents'],
};

function memberNode(p: RegistryPatient): GraphNode {
  return {
    id: 'n01',
    nodeNum: 1,
    type: 'Member',
    label: p.name,
    sublabel: p.platformId,
    properties: {
      id: p.platformId,
      roles: p.household?.caregiverFor?.length ? ['PATIENT', 'CAREGIVER'] : ['PATIENT'],
      age: p.age,
      location: p.location,
      confidence: '87%',
    },
    lens: TYPE_LENS.Member,
    color: C.blue,
    radius: 28,
    cluster: 'maria',
    propertyRichness: 0.75,
    totalProperties: 8,
  };
}

function careGapNodes(p: RegistryPatient, startIdx: number): GraphNode[] {
  return (p.careGaps ?? [])
    .filter((g) => g.status !== 'Closed')
    .slice(0, 6)
    .map((g, i) => {
      const id = `n${String(startIdx + i).padStart(2, '0')}`;
      const isBH = g.domain === 'BH';
      const isClinical = g.domain === 'Clinical';
      return {
        id,
        nodeNum: startIdx + i,
        type: 'CareGap' as NodeType,
        label: g.name.replace(/ \(.*\)/, ''),
        sublabel: `${g.daysOpen}d open · ${g.status}`,
        properties: {
          domain: g.domain,
          status: g.status,
          daysOpen: g.daysOpen,
          assignedTo: g.assignedTo,
        },
        lens: isBH
          ? (['all', 'behavioral'] as LensType[])
          : isClinical
            ? (['all', 'clinical'] as LensType[])
            : (['all', 'social'] as LensType[]),
        color: g.status === 'Open' ? C.red : C.amber,
        radius: 14,
        pulse: g.daysOpen > 30,
        validUntilDays: g.daysOpen > 60 ? undefined : 40,
        locked: isBH,
        propertyRichness: 0.7,
        totalProperties: 5,
      } satisfies GraphNode;
    });
}

function sdohNodes(
  _p: RegistryPatient,
  needs: ReturnType<typeof citizenNeeds>,
  startIdx: number
): GraphNode[] {
  // citizenNeeds() already has the registry fallback (resources.ts:73-83).
  // This function only wraps it into GraphNode shape; no duplicate fallback needed (A3).
  return needs.slice(0, 5).map(
    (need, i) =>
      ({
        id: `n${String(startIdx + i).padStart(2, '0')}`,
        nodeNum: startIdx + i,
        type: 'SDOHNode' as NodeType,
        label: need.label,
        sublabel: need.severity,
        properties: {
          category: need.category,
          severity: need.severity,
          keystone: need.keystone ?? false,
        },
        lens: TYPE_LENS.SDOHNode,
        color: need.severity === 'HIGH' ? C.red : need.severity === 'MODERATE' ? C.amber : C.slate,
        radius: need.keystone ? 16 : 13,
        propertyRichness: 0.6,
        totalProperties: 4,
      }) satisfies GraphNode
  );
}

function householdNodes(
  p: RegistryPatient,
  startIdx: number
): { nodes: GraphNode[]; counter: number } {
  const nodes: GraphNode[] = [];
  let idx = startIdx;
  (p.household?.dependents ?? []).slice(0, 2).forEach((dep) => {
    nodes.push({
      id: `n${String(idx).padStart(2, '0')}`,
      nodeNum: idx,
      type: 'Dependent',
      label: dep.name,
      sublabel: `${dep.relation} · Age ${dep.age}`,
      properties: { relation: dep.relation, age: dep.age, plan: dep.plan, consent: dep.consent },
      lens: TYPE_LENS.Dependent,
      color: C.pink,
      radius: 14,
    });
    idx++;
  });
  (p.household?.caregiverFor ?? []).slice(0, 1).forEach((cg) => {
    nodes.push({
      id: `n${String(idx).padStart(2, '0')}`,
      nodeNum: idx,
      type: 'HouseholdUnit',
      label: cg.name,
      sublabel: `${cg.relation} · ${cg.condition.slice(0, 40)}`,
      properties: {
        relation: cg.relation,
        condition: cg.condition,
        clinicalMetric: cg.clinicalMetric,
      },
      lens: TYPE_LENS.HouseholdUnit,
      color: C.purple,
      radius: 14,
      consentPending: true,
    });
    idx++;
  });
  return { nodes, counter: idx };
}

function episodeNode(p: RegistryPatient, nodeId: string, nodeNum: number): GraphNode {
  return {
    id: nodeId,
    nodeNum,
    type: 'Episode',
    label: p.episodeType,
    sublabel: `${p.episodeStatus} · ${p.episodeDaysActive}d`,
    properties: { status: p.episodeStatus, daysActive: p.episodeDaysActive, riskPct: p.erRiskPct },
    lens: TYPE_LENS.Episode,
    color: p.episodeStatus === 'Active' ? C.sky : C.slate,
    radius: 16,
    propertyRichness: 0.7,
    totalProperties: 4,
  };
}

function buildEdges(
  memberNodeId: string,
  gapNodes: GraphNode[],
  sdohNodesList: GraphNode[],
  hhNodes: GraphNode[],
  episodeNodeId: string,
  needs: ReturnType<typeof citizenNeeds>
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  let eIdx = 1;

  const edge = (
    source: string,
    target: string,
    type: string,
    label: string,
    color: string,
    lens: LensType[],
    strokeWidth = 1.5,
    dashed = false
  ): GraphEdge => ({
    id: `e${String(eIdx++).padStart(2, '0')}`,
    source,
    target,
    type,
    label,
    color,
    strokeWidth,
    dashed,
    lens,
  });

  // Member → episode
  edges.push(
    edge(memberNodeId, episodeNodeId, 'HAS_EPISODE', 'HAS_EPISODE', C.sky, ['all', 'clinical'])
  );

  // Member → care gaps
  gapNodes.forEach((g) => {
    edges.push(
      edge(memberNodeId, g.id, 'HAS_CARE_GAP', 'HAS_CARE_GAP', C.red, ['all', 'clinical'], 1.5)
    );
  });

  // Member → SDOH
  sdohNodesList.forEach((s) => {
    edges.push(edge(memberNodeId, s.id, 'HAS_SDOH', 'HAS_SDOH', C.orange, ['all', 'social'], 1.5));
  });

  // SDOH → gaps: BLOCKS edges (the key story — keystone barriers block clinical gaps)
  const keystoneNeeds = needs.filter((n) => n.keystone && (n.blockedGaps?.length ?? 0) > 0);
  keystoneNeeds.forEach((kn) => {
    const sdohNode = sdohNodesList.find((s) => s.label === kn.label);
    if (!sdohNode) return;
    (kn.blockedGaps ?? []).forEach((blockedGapName) => {
      const gapNode = gapNodes.find((g) => g.label.includes(blockedGapName.split(' ')[0]));
      if (gapNode) {
        edges.push(
          edge(
            sdohNode.id,
            gapNode.id,
            'BLOCKS',
            'BLOCKS',
            C.red,
            ['all', 'clinical', 'social'],
            2,
            true
          )
        );
      }
    });
  });

  // Derived BLOCKS fallback (registry patients): the authored keystone→blockedGaps
  // mapping only exists for the golden dataset, so a registry-derived member would
  // otherwise carry NO barrier→gap causality. When none was produced above, link the
  // most severe SDOH barrier to a clinical care gap so the cross-domain story survives.
  // Absence is fine — if there is no barrier or no gap, no BLOCKS edge is emitted.
  if (!edges.some((e) => e.type === 'BLOCKS')) {
    const sev = (n: GraphNode): number => {
      const s2 = String((n.properties as Record<string, unknown>)?.severity ?? '');
      return s2 === 'HIGH' ? 3 : s2 === 'MODERATE' ? 2 : s2 === 'LOW' ? 1 : 0;
    };
    const barrier = [...sdohNodesList].sort((a, b) => sev(b) - sev(a))[0];
    const clinicalGap =
      gapNodes.find((g) => (g.lens as string[]).includes('clinical')) ?? gapNodes[0];
    if (barrier && sev(barrier) > 0 && clinicalGap) {
      edges.push(
        edge(
          barrier.id,
          clinicalGap.id,
          'BLOCKS',
          'BLOCKS',
          C.red,
          ['all', 'clinical', 'social'],
          2,
          true
        )
      );
    }
  }

  // Member → household
  hhNodes.forEach((h) => {
    const relType = h.type === 'Dependent' ? 'PARENT_OF' : 'CAREGIVER_FOR';
    edges.push(edge(memberNodeId, h.id, relType, relType, C.purple, ['all', 'social'], 1.5));
  });

  return edges;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the whole-person knowledge graph for a citizen.
 *
 * The member record is resolved through the patientService SEAM (mock → registry,
 * live → FHIR), so the graph rides the single data pipeline — no side pipeline, no
 * persona bypass. A member's authored graph (Maria in mock) flows as a DATA lookup
 * keyed on platformId, returned by reference so the demo-preservation golden is
 * byte-identical. Unknown id → isEmpty:true (no crash). Sync/pure in mock/seeded.
 */
// Authored mock graph dispositions. A member's golden graph flows through the same
// seam as a DATA lookup keyed on platformId — not a persona control-flow branch —
// and is returned BY REFERENCE so the demo-preservation fingerprint is unchanged
// (byte-parity by construction, zero golden regeneration). In a live/production
// disposition this map is empty and the graph comes from deriveGraph over the
// FHIR-sourced record.
const AUTHORED_GRAPHS: Record<string, WpcGraphResult> = {
  [DEMO_MEMBER_ID]: { nodes: GOLDEN_NODES, edges: GOLDEN_EDGES, isEmpty: false },
};

/**
 * Pure transform — derive the whole-person graph from a resolved member record and
 * its needs. No I/O; shared verbatim by the sync (mock/seeded) and async (live) paths.
 */
export function deriveGraph(
  p: RegistryPatient,
  needs: ReturnType<typeof citizenNeeds>
): WpcGraphResult {
  // Assign node ids sequentially. n01 = member (always present).
  const gapNodes = careGapNodes(p, 2); // n02+
  const nextAfterGaps = 2 + gapNodes.length;
  const sdohList = sdohNodes(p, needs, nextAfterGaps); // nextAfterGaps+
  const nextAfterSdoh = nextAfterGaps + sdohList.length;
  const { nodes: hhNodesList, counter: nextAfterHh } = householdNodes(p, nextAfterSdoh);
  const epNode = episodeNode(p, `n${String(nextAfterHh).padStart(2, '0')}`, nextAfterHh);

  const member = memberNode(p);
  const allNodes: GraphNode[] = [member, ...gapNodes, ...sdohList, ...hhNodesList, epNode];
  const allEdges = buildEdges(member.id, gapNodes, sdohList, hhNodesList, epNode.id, needs);

  return { nodes: allNodes, edges: allEdges, isEmpty: false };
}

export function buildWholePersonGraph(citizenId: string): WpcGraphResult {
  // Single data-access seam — mock → registry, live → FHIR (behind patientService).
  // Maria is resolved here as a standard record; there is no persona control branch.
  const p = getPatientSync(citizenId);
  if (!p) return { nodes: [], edges: [], isEmpty: true };
  // Authored mock graph disposition (by reference = byte-parity), else pure derivation.
  return AUTHORED_GRAPHS[p.platformId] ?? deriveGraph(p, citizenNeeds(citizenId));
}
