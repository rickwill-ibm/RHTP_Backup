// CONTRACT: C9  // CONTRACT: C10  // DP-1
/**
 * Diagnostic-reports mapping spec: a DiagnosticReport event -> the member's
 * diagnostics subgraph. ONE node type, a dated member link, and result linkage:
 *
 *   (Member)-[:HAS_DIAGNOSTIC_REPORT {valid from effective}]->(DiagnosticReport)  associative
 *   (DiagnosticReport)-[:REPORTS_RESULT {per result}]->(Observation)              associative
 *
 * HAS_DIAGNOSTIC_REPORT is the factual "member has this report" link (associative,
 * dated), so the whole-person lens surfaces the DiagnosticReport off the member.
 * When the report is COMPUTABLE (T1, structured `resultRefs`), one REPORTS_RESULT
 * edge is emitted per referenced Observation, so the report links to the Observation
 * nodes the labs domain owns. A NARRATIVE-ONLY report (T2) carries `computable:false`
 * and a presentedForm pointer and emits NO REPORTS_RESULT edges — there is no
 * structured result to link, and we never fabricate one (E9).
 *
 * The pinned namespace (L3) is exported so the diagnostic-reports namespace-integrity
 * test can assert every surface (adapter, mapping, registry) agrees (F-C1 lesson).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import { MEMBER_KIND, associative, memberNode, resourceNode } from './spec';

/** Pinned diagnostic-reports namespace — the single source of truth the pin test uses. */
export const DIAGNOSTIC_REPORTS_DOMAIN = 'diagnostic-reports';
export const DIAGNOSTIC_REPORT_KIND = 'DiagnosticReport';
export const OBSERVATION_KIND = 'Observation';
export const HAS_DIAGNOSTIC_REPORT = 'HAS_DIAGNOSTIC_REPORT';
export const REPORTS_RESULT = 'REPORTS_RESULT';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function reportCode(p: Record<string, unknown>): string {
  const c = (p.code ?? {}) as Record<string, unknown>;
  return str(c.code);
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter((x) => x !== '') : [];
}
function contentUrl(p: Record<string, unknown>): string {
  const pf = (p.presentedForm ?? {}) as Record<string, unknown>;
  return str(pf.url);
}

export const diagnosticReportsSpec = {
  domain: DIAGNOSTIC_REPORTS_DOMAIN,
  matches(eventType: string): boolean {
    return eventType.startsWith('diagnostic-report.');
  },
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[] {
    const p = event.payload;
    const reportRef = str(p.diagnosticReportRef, `DiagnosticReport/${event.memberId}`);
    const start =
      str(p.effectiveDateTime) || event.occurredAt || new Date(deps.now()).toISOString();
    const computable = Boolean(p.computable);
    const out: Mutation[] = [memberNode(event)];
    out.push(
      ...resourceNode(event, DIAGNOSTIC_REPORT_KIND, reportRef, {
        code: reportCode(p),
        category: str(p.category, 'LAB'),
        status: str(p.status, 'final'),
        // The tier decision travels with the node: T2 narrative-only reports carry
        // computable:false + a content pointer, never parsed structured data.
        computable,
        contentUrl: contentUrl(p),
      })
    );
    // The member HAS this diagnostic report — factual attachment (associative), dated.
    out.push({
      op: 'UpsertEdge',
      type: HAS_DIAGNOSTIC_REPORT,
      from: { kind: MEMBER_KIND, key: event.memberId },
      to: { kind: DIAGNOSTIC_REPORT_KIND, key: reportRef },
      properties: { code: reportCode(p), computable },
      validity: { start, end: null },
      semantics: associative,
    });
    // Structured result linkage — ONLY for computable (T1) reports. A narrative-only
    // report has no resultRefs and emits no REPORTS_RESULT edge (E9: no fabrication).
    for (const obsRef of stringArray(p.resultRefs)) {
      out.push({
        op: 'UpsertEdge',
        type: REPORTS_RESULT,
        from: { kind: DIAGNOSTIC_REPORT_KIND, key: reportRef },
        to: { kind: OBSERVATION_KIND, key: obsRef },
        properties: {},
        validity: { start, end: null },
        semantics: associative,
      });
    }
    return out;
  },
};
