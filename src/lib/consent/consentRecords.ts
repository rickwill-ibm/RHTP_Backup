/**
 * Consent records — the thin loader over the ONE seed copy, plus the FHIR → display
 * projection both consent surfaces share.
 *
 * WHY THIS MODULE EXISTS: `src/app/consent-sovereignty-panel/page.tsx` and
 * `src/app/admin-console/consent-governance/page.tsx` each held a field-for-field duplicate
 * of the same seven records (`cns-001`…`cns-007`) AND their own copy of the FHIR mapper, and
 * the two disagreed on PHI posture — one rendered `Maria Redhawk` / `MRN-0006`, the other
 * `M. Redhawk` / `…0006`. One of the two was wrong about HIPAA minimum necessary and no gate
 * said which. The seed now lives in `data/consent-records.json` and the posture is decided
 * once, here: MASKED. See that file's `_comment` for the reasoning.
 *
 * NO STORED STATUS: neither the seed nor this projection carries a `status`. Status is
 * derived from the lifecycle dates by `consentStatus.ts` against an injected clock. Call
 * `loadConsentView(nowIso)` — it returns the rows AND the tile counts from one traversal.
 */
import seed from './data/consent-records.json';
import {
  deriveConsentView,
  type ConsentLifecycle,
  type ConsentStatus,
  type WithConsentStatus,
} from './consentStatus';

/** A consent record as both surfaces display it. Masked identifiers only; no status. */
export interface ConsentSeedRecord extends ConsentLifecycle {
  id: string;
  /** Masked display name — first initial + family name (e.g. `M. Redhawk`). */
  patientDisplay: string;
  /** Pseudonymous internal id used to build FHIR Patient references (e.g. `PAT-0006`). */
  patientId: string;
  /** Masked MRN — ellipsis + last four (e.g. `…0006`). Never the full MRN. */
  mrnMasked: string;
  type: string;
  scope: string;
  grantedTo: string;
  method: string;
  fhirRef: string | null;
}

/** The single seed copy. Frozen at the type level; treat as read-only. */
export const CONSENT_RECORDS: readonly ConsentSeedRecord[] = seed.records;

/** Rows + tile counts from ONE traversal against ONE clock reading. */
export function loadConsentView(
  nowIso: string,
  records: readonly ConsentSeedRecord[] = CONSENT_RECORDS
): {
  records: WithConsentStatus<ConsentSeedRecord>[];
  counts: Record<ConsentStatus, number>;
  asOf: string;
} {
  return deriveConsentView(records, nowIso);
}

/** Render an absent date as an em dash. Explicit, so no `??` hides a missing date. */
export function displayDate(value: string | null): string {
  if (value === null) return '—';
  const trimmed = value.trim();
  if (trimmed === '') return '—';
  return trimmed;
}

/** Render an absent FHIR reference as an em dash. */
export function displayRef(value: string | null): string {
  return displayDate(value);
}

/** Mask a display name to first initial + family name. Returns '—' when unusable. */
export function maskName(display: string): string {
  const parts = display.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`;
}

/** Mask an identifier to ellipsis + last four characters. */
export function maskMrn(value: string): string {
  const digits = value.replace(/[^0-9A-Za-z]/g, '');
  if (digits.length === 0) return '…????';
  return `…${digits.slice(-4)}`;
}

// ─── FHIR Consent → display projection (shared by both surfaces) ───────────────

/**
 * Marker for a revocation with no readable date. Deliberately NOT a parseable instant:
 * `deriveConsentStatus` treats a present-but-unparseable revocation as REVOKED, which is
 * the fail-closed outcome. A `null` here would silently un-revoke the consent.
 */
export const UNDATED_REVOCATION = 'revoked-date-unavailable';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A non-empty trimmed string, or null. */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed;
}

function textOr(value: unknown, fallback: string): string {
  const text = asText(value);
  if (text === null) return fallback;
  return text;
}

/** A yyyy-mm-dd day from an ISO instant or date, or null. */
function asDay(value: unknown): string | null {
  const text = asText(value);
  if (text === null) return null;
  return text.slice(0, 10);
}

function extensionValue(resource: JsonObject, suffix: string): string | null {
  for (const raw of asArray(resource.extension)) {
    const ext = asObject(raw);
    const url = asText(ext.url);
    if (url !== null && url.endsWith(suffix)) return asText(ext.valueString);
  }
  return null;
}

/**
 * Translate FHIR `Consent.status` + `provision.period` into lifecycle DATES, fail-closed.
 *
 *   rejected / entered-in-error → revoked at the recorded period end (or the record instant)
 *   inactive                    → expired; when no period end is recorded the record instant
 *                                 is used, so an `inactive` consent can never derive ACTIVE
 *   proposed / draft            → no grant date → PENDING
 *   active                      → granted at `dateTime`, expiring at `provision.period.end`
 */
function fhirLifecycle(resource: JsonObject): ConsentLifecycle {
  const status = textOr(resource.status, 'unknown');
  const recorded = asDay(resource.dateTime);
  const period = asObject(asObject(resource.provision).period);
  const periodEnd = asDay(period.end);
  const periodStart = asDay(period.start);
  const granted = periodStart === null ? recorded : periodStart;

  if (status === 'rejected' || status === 'entered-in-error') {
    // A revocation we cannot DATE is still a revocation. When neither the period end nor
    // the record instant is readable we emit UNDATED_REVOCATION rather than null: the
    // derivation treats any non-absent revokedDate as REVOKED, so an undatable revocation
    // reaches REVOKED instead of falling through to PENDING or ACTIVE.
    const dated = periodEnd === null ? recorded : periodEnd;
    const revoked = dated === null ? UNDATED_REVOCATION : dated;
    return { grantedDate: granted, expiresDate: periodEnd, revokedDate: revoked };
  }
  if (status === 'proposed' || status === 'draft') {
    return { grantedDate: null, expiresDate: periodEnd, revokedDate: null };
  }
  if (status === 'inactive') {
    const expired = periodEnd === null ? recorded : periodEnd;
    return { grantedDate: granted, expiresDate: expired, revokedDate: null };
  }
  return { grantedDate: granted, expiresDate: periodEnd, revokedDate: null };
}

/** Project a FHIR Consent onto the shared, masked display record. */
export function mapFhirConsent(raw: unknown): ConsentSeedRecord {
  const resource = asObject(raw);
  const id = textOr(resource.id, 'unknown');
  const patient = asObject(resource.patient);
  const reference = textOr(patient.reference, '');
  const patientId = reference.replace('Patient/', '');
  const display = textOr(patient.display, patientId);
  const mrnSource = extensionValue(resource, 'mrn');
  const organization = asObject(asArray(resource.organization)[0]);

  return {
    id,
    patientDisplay: maskName(display),
    patientId,
    mrnMasked: maskMrn(mrnSource === null ? id : mrnSource),
    type: textOr(extensionValue(resource, 'consent-type'), 'Data Sharing'),
    scope: textOr(extensionValue(resource, 'consent-scope-text'), '—'),
    grantedTo: textOr(organization.display, '—'),
    method: textOr(extensionValue(resource, 'consent-method'), 'Electronic'),
    fhirRef: `Consent/${id}`,
    ...fhirLifecycle(resource),
  };
}

/** Pull the Consent resources out of a FHIR searchset Bundle. */
export function consentsFromBundle(bundle: unknown): ConsentSeedRecord[] {
  return asArray(asObject(bundle).entry)
    .map((entry) => asObject(asObject(entry).resource))
    .filter((resource) => asText(resource.resourceType) === 'Consent')
    .map(mapFhirConsent);
}
