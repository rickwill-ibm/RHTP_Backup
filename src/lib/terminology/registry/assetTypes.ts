/**
 * TerminologyAsset model — lifecycle metadata for every managed value set, code
 * system, classification, and ontology (Iteration 4 terminology-asset registry).
 *
 * A TerminologyAsset does NOT hold code content; it holds the CURRENCY and
 * VERSIONING metadata a semantic layer needs to know WHICH version of WHICH
 * authority's value set a given use should bind to, whether that version is
 * still current, and when it must be refreshed from its steward. The actual code
 * content is answered by the TerminologyService (seeded allowlist now; a FHIR
 * terminology server / VSAC / CMS feed later).
 *
 * Every seeded version string is an ILLUSTRATIVE STUB pending the real
 * terminology server / VSAC SVS+FHIR / CMS HCC crosswalk / Gravity package feed.
 */

/** The domain families the semantic layer governs. HCC is ONE member of `risk`. */
export const ASSET_FAMILIES = Object.freeze([
  'clinical', //    coding systems: ICD-10-CM, SNOMED, LOINC, RxNorm, CPT/HCPCS, CVX, UCUM
  'risk', //        risk adjustment / classification: CMS-HCC, RxHCC, HHS-HCC, CDPS
  'quality', //     measure value sets: HEDIS/QARR, eCQM
  'behavioral', //  behavioral health: DSM-5-TR, ICD-10 F-codes, DC:0-5, LOCUS/CALOCUS
  'social', //      SDOH: Gravity, ICD-10 Z-codes, LOINC SDOH panels, AHC-HRSN, PRAPARE
  'privacy', //     sensitivity: 42 CFR Part 2, HL7 Confidentiality
] as const);
export type AssetFamily = (typeof ASSET_FAMILIES)[number];

/** Lifecycle status of one asset VERSION. */
export const ASSET_STATUSES = Object.freeze(['draft', 'active', 'superseded', 'retired'] as const);
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * FHIR binding strength — how strongly a use is REQUIRED to draw from the bound
 * value set (required > extensible > preferred > example).
 */
export const BINDING_STRENGTHS = Object.freeze([
  'required',
  'extensible',
  'preferred',
  'example',
] as const);
export type BindingStrength = (typeof BINDING_STRENGTHS)[number];

/**
 * Refresh cadence — how often the asset must be pulled from its steward. A stub
 * currency check treats an asset as stale once `lastRefreshed + cadence < asOf`.
 * `irregular` = released on the steward's own schedule (checked, not clock-driven);
 * `continuous` = a rolling feed (e.g. RxNorm/CVX), refreshed frequently.
 */
export const REFRESH_CADENCES = Object.freeze([
  'continuous',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi-annual',
  'annual',
  'irregular',
] as const);
export type RefreshCadence = (typeof REFRESH_CADENCES)[number];

/** Cadence -> the max age (days) before an asset is stale. `irregular` never ages out by clock. */
export const CADENCE_DAYS: Readonly<Record<RefreshCadence, number | null>> = Object.freeze({
  continuous: 7,
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 93,
  'semi-annual': 186,
  annual: 366,
  irregular: null,
});

/**
 * A managed terminology asset — one VERSION of one value set / code system /
 * classification. `id` is unique per version; assets sharing a `system` are
 * versions of the same logical asset (e.g. cms-hcc-v24 and cms-hcc-v28).
 */
export interface TerminologyAsset {
  /** Unique per version, e.g. `cms-hcc-v28`. */
  id: string;
  /** Human name, e.g. `CMS-HCC`. */
  name: string;
  family: AssetFamily;
  /** The authority that stewards this asset, e.g. `CMS`, `NLM/VSAC`, `HL7 Gravity Project`. */
  steward: string;
  /** Canonical system identifier: an OID or a URL. Versions of one logical asset SHARE this. */
  system: string;
  /** Version string (ILLUSTRATIVE STUB), e.g. `V28`, `FY2026`, `2.6.0`. */
  version: string;
  /** ISO date the version takes effect. */
  effectiveDate: string;
  /** ISO date the version expires / is retired, if known. */
  expirationDate?: string;
  status: AssetStatus;
  /** ISO date this asset was last pulled from its steward (stub: seed date). */
  lastRefreshed: string;
  refreshCadence: RefreshCadence;
  bindingStrength: BindingStrength;
  /** Where the real content is stewarded (for the refresh/fetch integration). */
  sourceUrl: string;
  /** Marks that the version/date metadata is an illustrative stub, not a live feed value. */
  stub?: boolean;
}

/**
 * A use-site binding: which value set + version a given (domain, purpose) should
 * draw from. Resolved by ValueSetRegistry.resolveBinding to the ACTIVE version.
 */
export interface BindingSpec {
  domain: string;
  purpose: string;
  /** The asset id this use binds to (resolved to its active version at query time). */
  assetId: string;
  note?: string;
}

/** Result of resolveBinding — the active value set a use should bind to. */
export interface ResolvedBinding {
  domain: string;
  purpose: string;
  assetId: string;
  valueSet: string;
  version: string;
  system: string;
  bindingStrength: BindingStrength;
  status: AssetStatus;
  /** true when the resolved version is current at the query time. */
  current: boolean;
}

/** Currency/versioning verdict for one asset at a point in time. */
export interface CurrencyFlag {
  assetId: string;
  version: string;
  status: AssetStatus;
  /** In its effective/expiration window AND status active. */
  current: boolean;
  /** Past its refresh cadence, or expired. */
  stale: boolean;
  /** true when a use of this version should be flagged (not current, or stale). */
  flagged: boolean;
  reason?: string;
}

/** The seed file shape for data/terminology-assets.json. */
export interface AssetRegistrySeed {
  assets: TerminologyAsset[];
  bindings: BindingSpec[];
}
