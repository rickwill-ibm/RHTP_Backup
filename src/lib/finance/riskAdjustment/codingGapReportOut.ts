// CONTRACT: C1  // CONTRACT: C10  // SEAM: graph  // Da Vinci-RA $report (P2 / Wave C)
/**
 * Da Vinci Risk Adjustment **$report** — assemble Coding Gap `MeasureReport`s back OUT
 * of the projected graph (the inverse of `codingGapReportAdapter`, which ingests them).
 *
 * A payer's RA engine, or a data-exchange partner, calls the Da Vinci-RA `$report`
 * operation to receive a member's coding gaps as standards-conformant FHIR
 * `MeasureReport`s (`hl7.org/fhir/us/davinci-ra`). This module reconstructs them from
 * the member's `CodingGap` subgraph:
 *
 *   (Member)-[:HAS_CODING_GAP]->(CodingGap)-[:SUPPORTED_BY]->(Evidence)
 *
 * CONSENT-SAFE (C1). Every `CodingGap` node is gated by `scopeCovers`, so a
 * 42 CFR Part 2 SUD gap is OMITTED from the report entirely unless the caller's scope
 * covers it — the assembled report can never re-disclose what the consent lens hides.
 * Each cited evidence reference is likewise gated on its Evidence node before it is
 * emitted as an `evaluatedResource`.
 *
 * ROUND-TRIP FIDELITY. Gaps are regrouped by their SOURCE MeasureReport id and model
 * version (parsed from the node key `CodingGap/<mrId>:<model>-<version>:<group>:<cc>`),
 * so a report that arrived with N groups is reassembled with those N groups — the
 * emitted Bundle re-ingests to the same graph.
 *
 * PHI-MINIMAL. The output carries CODES / STATUSES / DATES / REFS only — the HCC
 * category, evidence status, suspect type, hierarchical status, dates, and the opaque
 * evidence references — never a free-text rationale. It reads the graph; it never writes.
 */
import type { ConsentScope } from '@/lib/graph/lens/types';
import { NO_CONSENT } from '@/lib/graph/lens/types';
import { scopeCovers } from '@/lib/graph/lens/lenses';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import { HAS_CODING_GAP, SUPPORTED_BY, CODING_GAP_KIND } from '@/lib/graph/mapping/codingGap';
import type { GraphNodeRecord, GraphStore, PropVal } from '@/lib/graph/types';

/** The Da Vinci-RA StructureDefinition namespace the group extensions live under. */
const RA_SD = 'http://hl7.org/fhir/us/davinci-ra/StructureDefinition';

/** A minimal FHIR MeasureReport shape (PHI-minimal; only what $report needs to emit). */
export interface CodingGapMeasureReport {
  resourceType: 'MeasureReport';
  id: string;
  status: 'complete';
  type: 'individual';
  measure: string;
  subject: { reference: string };
  period: { start: string; end: string };
  group: CodingGapReportGroup[];
  evaluatedResource: { reference: string; extension?: { url: string; valueString: string }[] }[];
}
interface CodingGapReportGroup {
  id: string;
  code: { coding: { system: string; code: string }[] };
  extension: {
    url: string;
    valueCodeableConcept?: { coding: { code: string }[] };
    valueDate?: string;
  }[];
}
/** A FHIR searchset Bundle wrapping the assembled reports (what the route returns). */
export interface CodingGapReportBundle {
  resourceType: 'Bundle';
  type: 'searchset';
  total: number;
  entry: { resource: CodingGapMeasureReport }[];
}

function str(v: PropVal | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
/** Parse a CodingGap node key into its source report id + group id (best-effort). */
function parseGapKey(key: string): { mrId: string; groupId: string } {
  // 'CodingGap/<mrId>:<model>-<version>:<group>:<cc>' — 4 colon-parts after the kind.
  const body = key.startsWith(`${CODING_GAP_KIND}/`) ? key.slice(CODING_GAP_KIND.length + 1) : key;
  const parts = body.split(':');
  if (parts.length >= 4) return { mrId: parts[0], groupId: parts[parts.length - 2] };
  return { mrId: body || 'coding-gap', groupId: 'g1' };
}

/**
 * Assemble a member's Coding Gap MeasureReports from the projected graph, consent-safe.
 * A member absent from the graph, or with no visible gaps under `scope`, yields `[]`
 * (a pure read; it never fabricates). The store is INJECTED (both backends, no globals).
 */
export async function assembleCodingGapReports(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<CodingGapMeasureReport[]> {
  const member = await store.getNode(MEMBER_KIND, memberId);
  if (!member) return [];

  const gapEdges = await store.listEdges({ fromKey: memberId, type: HAS_CODING_GAP });
  // group source-report id -> its gap nodes (consent-filtered), preserving arrival grouping.
  const byReport = new Map<string, GraphNodeRecord[]>();
  for (const ge of gapEdges) {
    const gap = await store.getNode(ge.to.kind || CODING_GAP_KIND, ge.to.key);
    if (!gap) continue;
    if (!scopeCovers(gap, scope)) continue; // consent: the gap node
    const { mrId } = parseGapKey(gap.key);
    (byReport.get(mrId) ?? byReport.set(mrId, []).get(mrId)!).push(gap);
  }

  const reports: CodingGapMeasureReport[] = [];
  for (const [mrId, gaps] of byReport) {
    const groups: CodingGapReportGroup[] = [];
    const evaluated: CodingGapMeasureReport['evaluatedResource'] = [];
    // report-level context comes from the first gap (all share model/version/period per report).
    const head = gaps[0];
    const model = str(head.properties.model, 'CMS-HCC');
    const version = str(head.properties.modelVersion);
    let periodStart = str(head.properties.periodStart);
    let periodEnd = str(head.properties.periodEnd);

    for (const gap of gaps) {
      const { groupId } = parseGapKey(gap.key);
      periodStart = periodStart || str(gap.properties.periodStart);
      periodEnd = periodEnd || str(gap.properties.periodEnd);
      groups.push({
        id: groupId,
        code: {
          coding: [
            { system: str(gap.properties.codeSystem), code: str(gap.properties.conditionCategory) },
          ],
        },
        extension: [
          coded(`${RA_SD}/ra-evidenceStatus`, str(gap.properties.evidenceStatus)),
          coded(`${RA_SD}/ra-suspectType`, str(gap.properties.suspectType)),
          ...(str(gap.properties.hierarchicalStatus)
            ? [coded(`${RA_SD}/ra-hierarchicalStatus`, str(gap.properties.hierarchicalStatus))]
            : []),
          ...(str(gap.properties.evidenceStatusDate)
            ? [
                {
                  url: `${RA_SD}/ra-evidenceStatusDate`,
                  valueDate: str(gap.properties.evidenceStatusDate),
                },
              ]
            : []),
        ],
      });
      // evaluatedResource: the gap's cited evidence, consent-gated on each Evidence node,
      // tagged with ra-groupReference so the emitted report re-ingests to the same groups.
      const supEdges = await store.listEdges({ fromKey: gap.key, type: SUPPORTED_BY });
      for (const se of supEdges) {
        const evidence = await store.getNode(se.to.kind, se.to.key);
        if (!evidence) continue;
        if (!scopeCovers(evidence, scope)) continue; // consent: the citation node
        const ref = str(evidence.properties.evidenceRef) || se.to.key;
        evaluated.push({
          reference: ref,
          extension: [{ url: `${RA_SD}/ra-groupReference`, valueString: groupId }],
        });
      }
    }

    reports.push({
      resourceType: 'MeasureReport',
      id: mrId,
      status: 'complete',
      type: 'individual',
      measure: `${model}|${version}`,
      subject: { reference: `Patient/${memberId}` },
      period: { start: periodStart, end: periodEnd },
      group: groups,
      evaluatedResource: dedupeEvaluated(evaluated),
    });
  }
  return reports;
}

/** Wrap the assembled reports in a FHIR searchset Bundle (the $report response shape). */
export async function assembleCodingGapReportBundle(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<CodingGapReportBundle> {
  const reports = await assembleCodingGapReports(store, memberId, scope);
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: reports.length,
    entry: reports.map((resource) => ({ resource })),
  };
}

function coded(url: string, code: string): CodingGapReportGroup['extension'][number] {
  return { url, valueCodeableConcept: { coding: [{ code }] } };
}
/** De-duplicate evaluatedResource by (reference, groupReference) — a gap may cite once per group. */
function dedupeEvaluated(
  ev: CodingGapMeasureReport['evaluatedResource']
): CodingGapMeasureReport['evaluatedResource'] {
  const seen = new Set<string>();
  const out: CodingGapMeasureReport['evaluatedResource'] = [];
  for (const e of ev) {
    const grp = e.extension?.[0]?.valueString ?? '';
    const key = `${e.reference}|${grp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
