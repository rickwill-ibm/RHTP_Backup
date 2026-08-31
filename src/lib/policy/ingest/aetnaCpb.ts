/**
 * NOTE: MOCK-CORPUS SEED-RECORD ADAPTER — not a real payer ingestion path.
 *
 * Adapts an ALREADY-PARSED seed record from the bundled mock library (loadMockLibrary, used only by the
 * financial-clearance demo) into a NormalizedPolicy. The `raw.source === '<payer>'` check reads the
 * seed record's own field, NOT document content — do NOT copy this pattern for real ingestion. Real
 * per-payer/state adaptation belongs in the PolicyProfile seam (src/lib/policy/profile/policyProfile.ts).
 */

/**
 * Aetna Clinical Policy Bulletin (CPB) ingestion adapter (Policy Engine PE-2).
 *
 * Recognizes records with sourceType "medical-clinical-policy-bulletin" and a
 * `codes` bucket. Coerces to {@link NormalizedPolicy}, recomputing the
 * requiresPA / experimental / determinationBasis signals from the code buckets
 * so the normalized record is internally consistent even if an upstream
 * extractor set them differently.
 */
import type { NormalizedPolicy, PolicyCodeBuckets, PolicyIndication } from '../types';
import type { PolicyIngestionAdapter, RawPolicyRecord } from './index';

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function coerceBuckets(v: unknown): PolicyCodeBuckets {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    cptCovered: asStringArray(o.cptCovered),
    cptNotCovered: asStringArray(o.cptNotCovered),
    cptOther: asStringArray(o.cptOther),
    hcpcsCovered: asStringArray(o.hcpcsCovered),
    hcpcsNotCovered: asStringArray(o.hcpcsNotCovered),
    hcpcsOther: asStringArray(o.hcpcsOther),
    icd10Covered: asStringArray(o.icd10Covered),
    icd10NotCovered: asStringArray(o.icd10NotCovered),
  };
}

function coerceIndications(v: unknown): PolicyIndication[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x?.title === 'string')
    .map((x) => ({ label: String(x.label ?? ''), title: String(x.title) }));
}

export const aetnaCpbAdapter: PolicyIngestionAdapter = {
  id: 'aetna-cpb',
  source: 'Aetna',
  sourceType: 'medical-clinical-policy-bulletin',

  canIngest(raw: RawPolicyRecord): boolean {
    // A record explicitly typed as a PA-requirement list belongs to the PA-list
    // adapters, even when its source is Aetna — otherwise an Aetna PA list would be
    // mis-normalized as a bulletin with no codes and requiresPA=false.
    if (raw?.sourceType === 'prior-authorization-requirements-list') return false;
    return (
      raw?.sourceType === 'medical-clinical-policy-bulletin' ||
      raw?.source === 'Aetna' ||
      (typeof raw?.number === 'string' && !!raw?.codes)
    );
  },

  normalize(raw: RawPolicyRecord): NormalizedPolicy {
    const codes = coerceBuckets(raw.codes);
    const indications = coerceIndications(raw.indications);
    const hasCovered = codes.cptCovered.length > 0 || codes.hcpcsCovered.length > 0;
    const hasNotCovered = codes.cptNotCovered.length > 0 || codes.hcpcsNotCovered.length > 0;
    const experimental = !hasCovered && hasNotCovered && indications.length === 0;
    const requiresPA = hasCovered || indications.length > 0;
    const title = String(raw.title ?? 'Untitled Aetna CPB');
    const number = raw.number == null ? null : String(raw.number);

    return {
      policyId: String(raw.policyId ?? (number ? `aetna-cpb-${number}` : `aetna-cpb-${title}`)),
      source: 'Aetna',
      sourceType: 'medical-clinical-policy-bulletin',
      title,
      category: String(raw.category ?? 'Medical Clinical Policy Bulletin'),
      requiresPA,
      determinationBasis: experimental
        ? 'experimental-investigational-not-covered'
        : 'medical-necessity-criteria',
      number,
      url: raw.url == null ? null : String(raw.url),
      effectiveDate: raw.effectiveDate == null ? null : String(raw.effectiveDate),
      reviewLastDate: raw.reviewLastDate == null ? null : String(raw.reviewLastDate),
      nextReviewDate: raw.nextReviewDate == null ? null : String(raw.nextReviewDate),
      experimental,
      codes,
      indications,
      sourceFile: raw.sourceFile ? String(raw.sourceFile) : undefined,
      rawTextChars: typeof raw.rawTextChars === 'number' ? raw.rawTextChars : undefined,
    };
  },
};
