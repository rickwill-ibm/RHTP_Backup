/**
 * Publication store (RHTP Policy Engine) — the "one source of truth" seam.
 *
 * Authoring publishes, per policy, a set of artifacts (the encoded PolicyLogic, the DTR
 * Questionnaire, and the CRD coverage rules keyed by procedure code). The runtime CRD READS from
 * this store — it is not a hardcoded seed. Re-publishing a guideline supersedes the prior version
 * (monotonic version counter) so the runtime always sees the latest authored rule.
 *
 * Pure and in-memory: a persistence adapter (DB/FHIR server) implements the same read/write contract
 * behind this interface. Determinism preserved by injecting `now`.
 *
 * Design authority: docs/policy-encoder-spec.md §5; docs/crd-dtr-pas-remediation-plan.md (publication infra).
 */
import type { PolicyLogic } from './ir';
import { toQuestionnaire, type FhirQuestionnaire } from './fhir';
import { toCoverageRules, type EncodedCoverageRule } from './crd';

export interface PublishedArtifact {
  guidelineId: string;
  service: string;
  version: number;
  publishedAt: string;
  policyLogic: PolicyLogic;
  questionnaire: FhirQuestionnaire;
  coverageRules: EncodedCoverageRule[];
}

export interface PublicationStore {
  byGuideline: Map<string, PublishedArtifact>;
  /** procedure code → the guideline that most recently published a rule for it. */
  byCode: Map<string, string>;
  /** procedure code → ALL guidelines that publish it, so a contested code can be detected and a
   *  bare-code lookup can refuse to guess (spec §1.2 no cross-guideline contamination). */
  codeGuidelines: Map<string, Set<string>>;
}

export function createStore(): PublicationStore {
  return { byGuideline: new Map(), byCode: new Map(), codeGuidelines: new Map() };
}

/** Publish (or re-publish) a policy's artifacts. Returns the stored artifact with its version. */
export function publishPolicy(
  store: PublicationStore,
  policyLogic: PolicyLogic,
  opts: { now?: () => string } = {}
): PublishedArtifact {
  const prior = store.byGuideline.get(policyLogic.guidelineId);
  const version = (prior?.version ?? 0) + 1;
  const now = opts.now ?? (() => new Date().toISOString());
  const artifact: PublishedArtifact = {
    guidelineId: policyLogic.guidelineId,
    service: policyLogic.service,
    version,
    publishedAt: now(),
    policyLogic,
    questionnaire: toQuestionnaire(policyLogic),
    coverageRules: toCoverageRules(policyLogic),
  };
  store.byGuideline.set(policyLogic.guidelineId, artifact);
  // Re-key procedure codes to this guideline (latest publish wins for the convenience map) and
  // record every guideline that claims the code (for contested-code detection).
  for (const rule of artifact.coverageRules) {
    store.byCode.set(rule.code, policyLogic.guidelineId);
    const set = store.codeGuidelines.get(rule.code) ?? new Set<string>();
    set.add(policyLogic.guidelineId);
    store.codeGuidelines.set(rule.code, set);
  }
  return artifact;
}

/** Remove a guideline's artifacts and any code keys that pointed at it. */
export function unpublish(store: PublicationStore, guidelineId: string): void {
  store.byGuideline.delete(guidelineId);
  for (const [code, gid] of store.byCode) {
    if (gid === guidelineId) store.byCode.delete(code);
  }
  for (const [code, set] of store.codeGuidelines) {
    set.delete(guidelineId);
    if (set.size === 0) store.codeGuidelines.delete(code);
    else if (!store.byCode.has(code)) store.byCode.set(code, [...set][0]);
  }
}

/**
 * The artifact whose coverage rules include this procedure code. When `guidelineId` is given it is
 * used directly. When omitted and MORE THAN ONE guideline claims the code, the lookup REFUSES to
 * guess (returns undefined) so the caller fails closed rather than serving the wrong payer's rule.
 */
export function artifactForCode(
  store: PublicationStore,
  code: string,
  guidelineId?: string
): PublishedArtifact | undefined {
  if (guidelineId) {
    const art = store.byGuideline.get(guidelineId);
    return art?.coverageRules.some((r) => r.code === code) ? art : undefined;
  }
  const claimants = store.codeGuidelines.get(code);
  if (claimants && claimants.size > 1) return undefined; // contested — do not guess
  const gid = store.byCode.get(code);
  return gid ? store.byGuideline.get(gid) : undefined;
}

/** The published coverage rule the runtime CRD reads for a procedure code (optionally guideline-scoped). */
export function coverageRuleForCode(
  store: PublicationStore,
  code: string,
  guidelineId?: string
): EncodedCoverageRule | undefined {
  const artifact = artifactForCode(store, code, guidelineId);
  return artifact?.coverageRules.find((r) => r.code === code);
}

/** The DTR Questionnaire the CRD card points at for a procedure code (optionally guideline-scoped). */
export function questionnaireForCode(
  store: PublicationStore,
  code: string,
  guidelineId?: string
): FhirQuestionnaire | undefined {
  return artifactForCode(store, code, guidelineId)?.questionnaire;
}
