/**
 * Input validation for the Financial Clearance surface (hardening).
 *
 * Pure validators for the untrusted inputs the BFF route accepts. Keep these
 * strict and boring — the route rejects anything that doesn't pass with a
 * structured OperationOutcome, so bad input never reaches the engine.
 */

import { isValidNpi } from '@/lib/identity/provider';

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

// 5-char codes: CPT (99213), Category III CPT (0523T), or HCPCS (A9576).
const CPT_HCPCS = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
const PATIENT_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function validateOrderCode(code: unknown): ValidationResult {
  if (typeof code !== 'string' || code.length === 0) {
    return { ok: false, error: 'orderCode is required' };
  }
  if (!CPT_HCPCS.test(code)) {
    return { ok: false, error: `orderCode "${code}" is not a valid CPT/HCPCS code` };
  }
  return { ok: true };
}

/**
 * Validate an optional provider NPI.
 *
 * WHY THIS DELEGATES RATHER THAN MATCHING A REGEX. It was `/^\d{10}$/` — a SECOND, weaker NPI
 * validator alongside `@/lib/identity/provider`'s `isValidNpi`, which runs the real NPPES
 * 80840-prefixed Luhn. Two validators that disagree is one validator plus a hole, and this one WAS
 * the hole: the demo reviewer of record carried `npi: '1730154783'`, whose check digit is 2, not 3.
 * It was check-digit invalid, it appeared in 26 files, and `tests/goldenThread/hardening.test.ts:33`
 * asserted it was valid — a green test proving only that the string had ten digits.
 *
 * So there is now ONE NPI validator. The `optional` semantics stay here, because they belong to this
 * input surface and not to the identity module.
 */
export function validateNpi(npi: unknown): ValidationResult {
  if (npi === undefined || npi === null || npi === '') return { ok: true }; // optional
  if (typeof npi !== 'string' || !isValidNpi(npi)) {
    return { ok: false, error: 'providerNpi must be a valid 10-digit NPI (NPPES check digit)' };
  }
  return { ok: true };
}

export function validatePatientId(id: unknown): ValidationResult {
  if (id === undefined || id === null || id === '') return { ok: true }; // optional (falls back to session)
  if (typeof id !== 'string' || !PATIENT_ID.test(id)) {
    return { ok: false, error: 'patientId contains invalid characters' };
  }
  return { ok: true };
}

/** Validate the whole request body; returns the first failure. */
export function validateClearanceRequest(body: {
  patientId?: unknown;
  orderCode?: unknown;
  providerNpi?: unknown;
}): ValidationResult {
  for (const check of [
    validatePatientId(body.patientId),
    // orderCode is optional in the request (may come from the ServiceRequest); if
    // present it must be valid.
    body.orderCode === undefined ? { ok: true } : validateOrderCode(body.orderCode),
    validateNpi(body.providerNpi),
  ]) {
    if (!check.ok) return check;
  }
  return { ok: true };
}

/** Evidence record ids are server-minted; validate the shape before lookup.
 * IDs follow the pattern ev-{memberId}-{cptCode}-{epochMs}.
 * memberId may contain hyphens (e.g. PAT-0042) so hyphens must be allowed.
 */
export function validateEvidenceId(id: unknown): ValidationResult {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
    return { ok: false, error: 'invalid evidence id' };
  }
  return { ok: true };
}
