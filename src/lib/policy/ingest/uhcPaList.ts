/**
 * NOTE: MOCK-CORPUS SEED-RECORD ADAPTER — not a real payer ingestion path.
 *
 * Adapts an ALREADY-PARSED seed record from the bundled mock library (loadMockLibrary, used only by the
 * financial-clearance demo) into a NormalizedPolicy. The `raw.source === '<payer>'` check reads the
 * seed record's own field, NOT document content — do NOT copy this pattern for real ingestion. Real
 * per-payer/state adaptation belongs in the PolicyProfile seam (src/lib/policy/profile/policyProfile.ts).
 */

/**
 * UnitedHealthcare Prior-Authorization requirement-list ingestion adapter
 * (Policy Engine PE-2).
 *
 * Recognizes records with sourceType "prior-authorization-requirements-list".
 * These are code-on-list determinations: any listed CPT/HCPCS requires PA. The
 * adapter rebuilds `allPaCodes` from the category items so the flat lookup the
 * engine uses is always consistent with the grouped `paItems`.
 */
import type { NormalizedPolicy, PaListItem } from '../types';
import type { PolicyIngestionAdapter, RawPolicyRecord } from './index';

function coercePaItems(v: unknown): PaListItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x?.category === 'string' && Array.isArray(x?.codes))
    .map((x) => ({
      category: String(x.category),
      codes: (x.codes as unknown[]).filter((c): c is string => typeof c === 'string'),
      effectiveDate: x.effectiveDate == null ? null : String(x.effectiveDate),
    }));
}

export const uhcPaListAdapter: PolicyIngestionAdapter = {
  id: 'uhc-pa-list',
  source: 'UnitedHealthcare',
  sourceType: 'prior-authorization-requirements-list',

  canIngest(raw: RawPolicyRecord): boolean {
    // UHC-specific: the generic PA-list adapter handles all other sources.
    return (
      raw?.source === 'UnitedHealthcare' &&
      (raw?.sourceType === 'prior-authorization-requirements-list' || Array.isArray(raw?.paItems))
    );
  },

  normalize(raw: RawPolicyRecord): NormalizedPolicy {
    const paItems = coercePaItems(raw.paItems);
    const allPaCodes = Array.from(new Set(paItems.flatMap((i) => i.codes))).sort();
    const plan = String(raw.plan ?? 'UnitedHealthcare plan');

    return {
      policyId: String(raw.policyId ?? `uhc-${plan.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
      source: 'UnitedHealthcare',
      sourceType: 'prior-authorization-requirements-list',
      title: String(raw.title ?? `UnitedHealthcare Prior Authorization Requirements — ${plan}`),
      category: String(raw.category ?? 'Payer PA-required code list'),
      requiresPA: true,
      determinationBasis: 'code-on-pa-required-list',
      plan,
      effectiveDate: raw.effectiveDate == null ? null : String(raw.effectiveDate),
      paItems,
      allPaCodes,
      sourceFile: raw.sourceFile ? String(raw.sourceFile) : undefined,
      rawTextChars: typeof raw.rawTextChars === 'number' ? raw.rawTextChars : undefined,
    };
  },
};
