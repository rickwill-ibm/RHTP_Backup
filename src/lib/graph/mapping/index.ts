// SEAM: graph  // DP-1
/**
 * The mapping-spec registry. The projector is store-agnostic AND domain-agnostic:
 * it never names a domain, it asks this registry which spec owns an event. Adding
 * a domain is adding a spec here — no projector change (open/closed).
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from '../types';
import type { MappingSpec } from './spec';
import { coverageSpec } from './coverage';
import { encounterSpec } from './encounter';
import { sdohSpec } from './sdoh';
import { careteamSpec } from './careteam';
import { medicationSpec } from './medication';
import { labSpec } from './lab';
import { allergySpec } from './allergy';
import { procedureSpec } from './procedure';
import { goalTaskSpec } from './goalTask';
import { referralSpec } from './referral';
import { immunizationSpec } from './immunization';
import { claimsFinancialSpec } from './claimsFinancial';
import { priorAuthLifecycleSpec } from './priorAuthLifecycle';
import { behavioralHealthSpec } from './behavioralHealth';
import { assessmentSpec } from './assessment';
import { caregiverSpec } from './caregiver';
import { documentSpec } from './document';
// ── Iteration 11 Wave B (append-only): conditions, diagnostic-reports, family-history.
import { conditionsSpec } from './conditions';
import { diagnosticReportsSpec } from './diagnosticReports';
import { familyHistorySpec } from './familyHistory';
// ── WPC payer dimensions (append-only): RiskAssessment + Flag become first-class
// PROJECTED knowledge-graph dimensions (each a new WpcDomain + spec). Coverage and
// Encounter reuse their EXISTING specs (already registered above) via new FHIR-JSON
// adapters, so they add NO spec here — the record-domain count moves 20 -> 22, not 24.
import { riskAssessmentSpec } from './riskAssessment';
import { flagSpec } from './flag';
// ── WPC Unit 1 (append-only): access-geography (first FHIR-fed person dimension).
import { accessSpec } from './access';

/** Ordered spec registry. First match wins (specs are disjoint by eventType). */
export const MAPPING_SPECS: readonly MappingSpec[] = Object.freeze([
  coverageSpec,
  encounterSpec,
  sdohSpec,
  careteamSpec,
  medicationSpec,
  labSpec,
  allergySpec,
  procedureSpec,
  goalTaskSpec,
  referralSpec,
  immunizationSpec,
  claimsFinancialSpec,
  priorAuthLifecycleSpec,
  behavioralHealthSpec,
  assessmentSpec,
  caregiverSpec,
  documentSpec,
  // ── Iteration 11 Wave B (append-only).
  conditionsSpec,
  diagnosticReportsSpec,
  familyHistorySpec,
  // ── WPC payer dimensions (append-only): 20 -> 22 record domains.
  riskAssessmentSpec,
  flagSpec,
]);

/**
 * Enrichment projections (WPC Unit 1) — DERIVED graph projections that are NOT C9
 * FHIR record domains (they have no ingestion adapter of their own; they enrich the
 * graph from already-landed data). Kept OUT of MAPPING_SPECS so the C9 record-domain
 * count stays a truthful 20/20, but consulted by specFor/project so they still land.
 */
export const ENRICHMENT_SPECS: readonly MappingSpec[] = Object.freeze([accessSpec]);

const ALL_SPECS: readonly MappingSpec[] = [...MAPPING_SPECS, ...ENRICHMENT_SPECS];

/** The spec (record OR enrichment) that owns an event type, or undefined. */
export function specFor(eventType: string): MappingSpec | undefined {
  return ALL_SPECS.find((s) => s.matches(eventType));
}

/** Map one event to mutations via its spec; [] when no spec claims it. */
export function mutationsFor(event: C2Event, deps: ProjectorDeps): Mutation[] {
  return specFor(event.eventType)?.toMutations(event, deps) ?? [];
}

export type { MappingSpec } from './spec';
export { MEMBER_KIND } from './spec';
