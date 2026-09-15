/**
 * policyRegistry.ts — the GENERIC live-DTR policy registry behind the stateless `/api/dtr/evaluate`
 * mock. It generalizes what used to be a hardcoded, per-policy dispatch (a bariatric-only branch +
 * a per-policy PDF pin) into ONE data-driven pipeline: for ANY registered CPT/HCPCS code it parses
 * the row's real policy PDF (cached per file), lifts computable `DtrCriteria` through the SAME shared
 * `dtrCriteriaFromReview` encoder the authoring workbench uses, and evaluates it against the row's
 * sample patient bundle through the SAME `evaluateDtr` engine.
 *
 * SCOPE / HONEST BOUNDARY (read before adding a policy): the PLUMBING here is generic — any row's
 * PDF is parsed and run through the shared encoder + engine. The criteria-lifting SEMANTICS are now
 * generic across QUANTITATIVE measures: `dtrCriteriaFromReview` lifts age, BMI + obesity band, AND any
 * other measure the policy gates on that maps to a standard LOINC concept (BP, weight, height, HbA1c,
 * glucose, eGFR, LDL/HDL/total-chol/triglycerides, LVEF — the `MEASURE_LOINC` set), evaluated from the
 * record through the SHARED three-valued engine (`evalMeasure`), respecting the policy's boolean tree
 * (OR-branches → non-required), unit compatibility (a cross-unit reading is a gap, never a wrong met),
 * exclusions/negation (never a positive gate), `between` inclusivity, and a review-flagged (OCR-
 * ambiguous) measure is surfaced for attestation, never auto-computed. A measure with NO standard coded
 * concept (stenosis %, tumour size) is surfaced as a documentation gap, not silently dropped. The
 * `allMet` rollup requires every required gate met AND — when OR-alternatives are present — at least
 * one alternative met (closing the OR fail-open within the flat group model).
 *
 * REMAINING scope (tracked follow-ups — a full BoolExpr verdict via `evalExpr` would subsume these):
 * distinct OR-pools evaluated independently; multi-pathway POPULATION gating; coverage-EXCLUSION denial
 * surfaced in the group view; the needs-info (missing data) vs not-met (fails criterion) distinction,
 * collapsed to `gap` today; `sustainedOver`/temporal windows evaluated on a point reading; per-group
 * policy-version provenance. To stop a hollow answer slipping out, `evaluateLivePolicy` FAILS LOUD
 * (throws) for a registered code whose lifted criteria carry no VALID gate, or whose row is
 * misconfigured — it never falls open to an unrelated scenario.
 *
 * Adding a supported policy = a row in `policyRegistry.data.json` + its PDF under `public/sample-policies`
 * (+ a bundle in PATIENT_BUNDLES only if it needs a new sample patient).
 *
 * This is DEMO SCAFFOLDING for the stateless endpoint — the real per-patient path is the workbench's
 * live authored review. Codes NOT in the registry fall through to the canned scenarios in devStubs.dtr;
 * a registered-but-broken code is an ERROR, never a fall-through.
 *
 * SERVER-ONLY: reads a repo PDF asset via node:fs. Do not import from a client component.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pdfToTextSource } from '@/lib/policy/server/pdfIntake';
import { processPolicyDocument, type PolicyReview } from '@/lib/policy/policyReview';
import { dtrCriteriaFromReview } from './dtrCriteriaFromPolicy';
import { evaluateDtr, type ComputableCriterion, type DtrCriteria } from './patientEvaluation';
import { bariatricPatientBundle } from './patientData';
import type { PatientBundle } from './patientData';
import registryData from './policyRegistry.data.json';

export interface LivePolicyEntry {
  id: string;
  title: string;
  pdfPath: string; // relative to process.cwd()
  patientBundleKey: string;
  asOf: string; // ISO date the sample patient is evaluated against
  cptCodes: readonly string[];
}

/** Sample patient bundles the stateless mock evaluates against (real FHIR reads, not literals).
 *  Keyed by `patientBundleKey`; add a key here only when a new policy needs a different sample patient. */
const PATIENT_BUNDLES: Record<string, PatientBundle> = {
  'maria-bariatric': bariatricPatientBundle,
};

export const LIVE_POLICY_REGISTRY: readonly LivePolicyEntry[] = (
  registryData as { policies: LivePolicyEntry[] }
).policies;

/** Every CPT/HCPCS code the registry can live-evaluate (union across all rows). */
export const LIVE_POLICY_CPT_CODES: ReadonlySet<string> = new Set(
  LIVE_POLICY_REGISTRY.flatMap((p) => p.cptCodes)
);

/** The registry row that owns a code, if any. */
export function resolveLivePolicy(cptCode: string): LivePolicyEntry | undefined {
  return LIVE_POLICY_REGISTRY.find((p) => p.cptCodes.includes(cptCode));
}

/** A registry row by policy id (throws if absent — used by compat shims that name a specific policy,
 *  so a renamed/removed row fails LOUD at import instead of silently yielding an empty set). */
export function policyById(id: string): LivePolicyEntry {
  const entry = LIVE_POLICY_REGISTRY.find((p) => p.id === id);
  if (!entry) throw new Error(`policyRegistry: no policy row with id '${id}'`);
  return entry;
}

// One parsed PolicyReview per PDF path, cached for the life of the process (the PDFs are static repo
// assets — re-parsing on every request would be waste). We cache the PROMISE for concurrency, but on
// REJECTION we evict it so a transient/asset failure retries next request instead of poisoning the
// cache permanently.
const reviewCache = new Map<string, Promise<PolicyReview>>();
function loadReview(pdfPath: string): Promise<PolicyReview> {
  let review = reviewCache.get(pdfPath);
  if (!review) {
    review = (async () => {
      const bytes = await readFile(path.join(process.cwd(), pdfPath));
      const src = await pdfToTextSource(new Uint8Array(bytes), path.basename(pdfPath));
      return processPolicyDocument(src);
    })();
    review.catch(() => reviewCache.delete(pdfPath)); // evict a rejected promise — never cache a failure
    reviewCache.set(pdfPath, review);
  }
  return review;
}

const LEGAL_OPS = new Set(['>=', '<=', '>', '<', 'between', '=', '!=']);
/** A computable criterion counts toward "not hollow" ONLY when it is actually evaluable: a legal
 *  operator, a finite value (both endpoints for `between`), and a resolved concept (LOINC, or a
 *  compound measure). A junk/half-parsed measure must NOT rescue an otherwise-unsupported policy from
 *  the fail-loud guard — otherwise a parse failure masquerades as a clinical gap. */
export function isValidComputable(c: ComputableCriterion): boolean {
  const m = c.measure;
  // A COMPOUND measure (e.g. BP systolic/diastolic) carries no top-level operator/value — validity is
  // per sub-measure. Check it FIRST, before the scalar operator/value guards (which a compound fails).
  if (m.kind === 'compound') {
    const subs = m.subMeasures ?? [];
    return (
      subs.length > 0 &&
      subs.every(
        (s) =>
          !!s.operator &&
          LEGAL_OPS.has(s.operator) &&
          Number.isFinite(s.value) &&
          (s.operator !== 'between' || Number.isFinite(s.value2))
      )
    );
  }
  if (!m.operator || !LEGAL_OPS.has(m.operator)) return false;
  if (!Number.isFinite(m.value)) return false;
  if (m.operator === 'between' && !Number.isFinite(m.value2)) return false;
  return !!c.loinc;
}

/** True when lifted criteria carry NO computable or documentation gate — i.e. an unsupported policy
 *  shape (see SCOPE note). Used to fail loud rather than return a hollow evaluation. A computable
 *  counts only when VALID (see `isValidComputable`). */
export function isHollowCriteria(c: DtrCriteria): boolean {
  const validComputable = (c.computable ?? []).some(isValidComputable);
  return (
    c.minAge === undefined &&
    c.bmi === undefined &&
    (c.documentation?.length ?? 0) === 0 &&
    !validComputable
  );
}

/** Derive live DTR criteria for ANY registered CPT — parsed from its real policy PDF through the
 *  shared encoder. Returns undefined for an unregistered code. */
export async function getDtrCriteriaForCpt(cptCode: string): Promise<DtrCriteria | undefined> {
  const entry = resolveLivePolicy(cptCode);
  if (!entry) return undefined;
  return dtrCriteriaFromReview(await loadReview(entry.pdfPath), cptCode);
}

/**
 * Evaluate a registered CPT against its row's sample patient bundle, through the shared engine.
 * Returns `undefined` ONLY when the code is not registered (the caller then falls back to the canned
 * scenarios). For a REGISTERED code it always either returns a real evaluation or THROWS — it never
 * returns undefined, so a misconfigured/broken row can never silently fall open to an unrelated
 * canned scenario (the exact 14-of-27 → lumbar-MRI mis-routing this package was written to kill).
 */
export async function evaluateLivePolicy(cptCode: string): Promise<unknown | undefined> {
  const entry = resolveLivePolicy(cptCode);
  if (!entry) return undefined; // the one legitimate fall-through: code is not a registered policy
  const bundle = PATIENT_BUNDLES[entry.patientBundleKey];
  if (!bundle)
    throw new Error(
      `policyRegistry: row '${entry.id}' references unknown patientBundleKey '${entry.patientBundleKey}'`
    );
  const criteria = await getDtrCriteriaForCpt(cptCode); // may throw on a PDF/parse failure — intentional
  if (!criteria)
    throw new Error(`policyRegistry: no criteria lifted for '${cptCode}' from '${entry.id}'`);
  if (isHollowCriteria(criteria)) {
    throw new Error(
      `policyRegistry: '${entry.id}' lifted no computable/documentation criteria for '${cptCode}' — unsupported policy shape (see SCOPE note)`
    );
  }
  return evaluateDtr({ ...criteria, cptCode }, bundle, new Date(entry.asOf));
}
