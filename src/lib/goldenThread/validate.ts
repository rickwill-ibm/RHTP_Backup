/**
 * Input validation for the Financial Clearance surface (hardening).
 *
 * Pure validators for the untrusted inputs the BFF route accepts. Keep these
 * strict and boring — the route rejects anything that doesn't pass with a
 * structured OperationOutcome, so bad input never reaches the engine.
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

// 5-char codes: CPT (99213), Category III CPT (0523T), or HCPCS (A9576).
const CPT_HCPCS = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
const NPI = /^\d{10}$/;
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

export function validateNpi(npi: unknown): ValidationResult {
  if (npi === undefined || npi === null || npi === '') return { ok: true }; // optional
  if (typeof npi !== 'string' || !NPI.test(npi)) {
    return { ok: false, error: 'providerNpi must be a 10-digit NPI' };
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
