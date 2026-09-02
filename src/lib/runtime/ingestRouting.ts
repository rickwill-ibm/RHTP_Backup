// CONTRACT: C9  // CONTRACT: C2  // SEAM: cdc-relay  // M3
/**
 * FHIR-bundle routing (extracted from ingestBundle.ts to keep both modules under
 * the 400-line production cap). Given the bundle's resources, `route()` partitions
 * each entry to the domain adapter that owns it and returns the by-design
 * non-projected census — every resource is accounted for in exactly one bucket,
 * never silently dropped.
 *
 * Routing (resourceType, then discriminator):
 *   Coverage           -> coverage        (FHIR-JSON adapter over the existing spec)
 *   Encounter          -> encounter       (FHIR-JSON adapter over the existing spec)
 *   RiskAssessment     -> risk-assessment (NEW projected dimension)
 *   Flag               -> flag            (NEW projected dimension)
 *   Condition          -> behavioral-health (ICD-10 F-code, any position) | conditions
 *   Observation        -> labs-vitals (laboratory|vital-signs)
 *                       | sdoh (social-history) | behavioral-health (survey)
 *                       | care-gap overlay (by-design non-projection) | unrouted (loud)
 *   MedicationRequest / MedicationDispense -> medications
 *   ServiceRequest     -> referrals
 *   Goal / Task        -> goals-tasks
 *   CareTeam           -> care-team
 * Everything else (CarePlan, Organization, Practitioner, Consent, Patient, …) is
 * recorded in the non-projected census — accounted for by design.
 */
import type { DomainAdapter } from '@/lib/pipeline';
import {
  labAdapter,
  sdohObservationAdapter,
  bhObservationAdapter,
  conditionsAdapter,
  behavioralHealthAdapter,
  medicationAdapter,
  referralAdapter,
  goalTaskAdapter,
  careTeamAdapter,
  coverageFhirAdapter,
  encounterFhirAdapter,
  riskAssessmentAdapter,
  flagAdapter,
  isSocialHistory,
  isSurvey,
  isBehavioralHealthDiagnosis,
} from '@/lib/pipeline';

export interface FhirResource {
  resourceType: string;
  [k: string]: unknown;
}

/** A per-adapter partition of the bundle's resources plus its feed handle. */
export interface Group {
  adapter: DomainAdapter<unknown>;
  feed: string;
  resources: FhirResource[];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

// ─── resource discriminators ──────────────────────────────────────────────────

/** The category axis codes on a resource (Observation.category / Condition.category). */
export function categoryCodes(resource: Record<string, unknown>): string[] {
  const cat = resource.category;
  if (!Array.isArray(cat)) return [];
  const out: string[] = [];
  for (const c of cat) {
    const coding = obj(c).coding;
    if (Array.isArray(coding)) for (const cc of coding) out.push(str(obj(cc).code));
  }
  return out;
}
/** A laboratory / vital-sign Observation (or one with no category axis -> default lab). */
export function isLabOrVital(resource: Record<string, unknown>): boolean {
  const codes = categoryCodes(resource);
  if (codes.length === 0) return true; // no category axis -> default laboratory
  return codes.some((c) => c === 'laboratory' || c === 'vital-signs');
}
/**
 * A TCOC care-gap Observation: an analytic overlay marker (open care gap), NOT a
 * clinical/SDOH/BH result — non-projected BY DESIGN. Recognized by its care-gap
 * extension or a "Care Gap" category display so the census can separate an INTENDED
 * non-projection from an UNEXPECTED unroutable Observation (a real clinical result
 * that fails to route must never hide inside the by-design care-gap count).
 */
export function isCareGap(resource: Record<string, unknown>): boolean {
  const ext = Array.isArray(resource.extension) ? resource.extension : [];
  for (const e of ext) if (/care-gap|tcoc-gap-id/i.test(str(obj(e).url))) return true;
  const cat = Array.isArray(resource.category) ? resource.category : [];
  for (const c of cat) {
    const coding = Array.isArray(obj(c).coding) ? (obj(c).coding as unknown[]) : [];
    for (const cc of coding) if (/care gap/i.test(str(obj(cc).display))) return true;
  }
  return false;
}
/** An ICD-10 F-code condition (behavioral-health ownership), any coding position. */
export function hasFCode(resource: Record<string, unknown>): boolean {
  const coding = obj(resource.code).coding;
  if (!Array.isArray(coding)) return false;
  for (const c of coding) {
    const cc = obj(c);
    if (isBehavioralHealthDiagnosis(str(cc.code), str(cc.system))) return true;
  }
  return false;
}
/** The four WPC payer dimensions are routed by resourceType alone (PHI-safe). */
export function isCoverage(resource: FhirResource): boolean {
  return resource.resourceType === 'Coverage';
}
export function isEncounter(resource: FhirResource): boolean {
  return resource.resourceType === 'Encounter';
}
export function isRiskAssessment(resource: FhirResource): boolean {
  return resource.resourceType === 'RiskAssessment';
}
export function isFlag(resource: FhirResource): boolean {
  return resource.resourceType === 'Flag';
}

// ─── routing ──────────────────────────────────────────────────────────────────

/** Partition the bundle's resources into per-adapter groups; return the non-projected census. */
export function route(resources: FhirResource[]): {
  groups: Group[];
  nonProjected: Record<string, number>;
} {
  const buckets = new Map<string, { adapter: DomainAdapter<unknown>; resources: FhirResource[] }>();
  const nonProjected: Record<string, number> = {};
  const put = (adapter: DomainAdapter<unknown>, r: FhirResource) => {
    const key = `${adapter.source.system}:${adapter.source.feed}`;
    const b = buckets.get(key) ?? { adapter, resources: [] };
    b.resources.push(r);
    buckets.set(key, b);
  };
  const drop = (r: FhirResource, key = r.resourceType) => {
    nonProjected[key] = (nonProjected[key] ?? 0) + 1;
  };

  for (const r of resources) {
    // ── WPC payer dimensions: Coverage / Encounter reuse their existing specs via
    // FHIR-JSON adapters; RiskAssessment / Flag are NEW projected dimensions. Each
    // is routed by resourceType alone.
    if (isCoverage(r)) {
      put(coverageFhirAdapter as DomainAdapter<unknown>, r);
      continue;
    }
    if (isEncounter(r)) {
      put(encounterFhirAdapter as DomainAdapter<unknown>, r);
      continue;
    }
    if (isRiskAssessment(r)) {
      put(riskAssessmentAdapter as DomainAdapter<unknown>, r);
      continue;
    }
    if (isFlag(r)) {
      put(flagAdapter as DomainAdapter<unknown>, r);
      continue;
    }

    switch (r.resourceType) {
      case 'Condition':
        put(
          hasFCode(r)
            ? (behavioralHealthAdapter as DomainAdapter<unknown>)
            : (conditionsAdapter as DomainAdapter<unknown>),
          r
        );
        break;
      case 'Observation':
        if (isLabOrVital(r)) put(labAdapter as DomainAdapter<unknown>, r);
        else if (isSocialHistory(r)) put(sdohObservationAdapter as DomainAdapter<unknown>, r);
        else if (isSurvey(r)) put(bhObservationAdapter as DomainAdapter<unknown>, r);
        // Separate the INTENDED non-projection (care-gap overlay markers) from an
        // UNEXPECTED unroutable Observation. The latter is counted under a distinct,
        // loud census key so a real clinical result can never be silently absorbed
        // into the by-design care-gap count.
        else if (isCareGap(r)) drop(r, 'Observation:care-gap');
        else drop(r, 'Observation:unrouted');
        break;
      case 'MedicationRequest':
      case 'MedicationDispense':
        put(medicationAdapter as DomainAdapter<unknown>, r);
        break;
      case 'ServiceRequest':
        put(referralAdapter as DomainAdapter<unknown>, r);
        break;
      case 'Goal':
      case 'Task':
        put(goalTaskAdapter as DomainAdapter<unknown>, r);
        break;
      case 'CareTeam':
        put(careTeamAdapter as DomainAdapter<unknown>, r);
        break;
      default:
        drop(r);
    }
  }
  const groups: Group[] = [...buckets.values()].map((b) => ({
    adapter: b.adapter,
    feed: b.adapter.source.feed,
    resources: b.resources,
  }));
  return { groups, nonProjected };
}
