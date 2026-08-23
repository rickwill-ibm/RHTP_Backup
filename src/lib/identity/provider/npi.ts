/**
 * NPI (National Provider Identifier) validation — the NPPES check-digit algorithm.
 *
 * An NPI is a 10-digit, intelligence-free identifier. The 10th digit is a Luhn
 * check digit computed over the first 9 digits PREFIXED with the constant
 * "80840" — the ISO 7812 issuer prefix CMS assigned to the health-industry
 * numbering space so an NPI is a valid card number under the same algorithm a
 * payer's other identifiers use. Validation therefore is:
 *
 *   base   = "80840" + firstNineDigits
 *   check  = Luhn check digit of `base`   (double every second digit from the
 *                                          right of `base`, sum, 10 - sum%10)
 *   valid  <=> check === tenthDigit
 *
 * This is a pure, deterministic, offline check: it proves the digits are
 * self-consistent, NOT that the NPI is enrolled in NPPES. Registry existence is
 * a separate, seam-gated concern (see resolver.ts / directory.ts). E9: an NPI
 * that fails this check is REJECTED — we never round it, never guess a check
 * digit, never fabricate a valid NPI from an invalid input.
 */

/** Thrown when a value asserted to be an NPI is not a valid NPI. PHI-free. */
export class InvalidNpiError extends Error {
  readonly npi: string;
  constructor(npi: string, reason: string) {
    super(`Invalid NPI "${npi}": ${reason}`);
    this.name = 'InvalidNpiError';
    this.npi = npi;
  }
}

/** The 5-digit ISO prefix CMS assigned to the NPI numbering space. */
export const NPI_ISO_PREFIX = '80840';

/** True only for a 10-digit string (no spaces, no separators). Shape gate. */
export function isNpiShaped(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/**
 * The Luhn check digit for the 5-digit-prefixed 9-digit body (13-digit `base`).
 * Doubles every second digit starting from the RIGHTMOST of `base` (because the
 * check digit is appended after it), summing digit-sums, then 10 - (sum % 10).
 */
function luhnCheckDigit(base: string): number {
  let sum = 0;
  let double = true; // rightmost of base is the first doubled position
  for (let i = base.length - 1; i >= 0; i--) {
    let d = base.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9; // mut-equiv: d is 2*(0..9) so always even; d>9 and d>=9 are identical (9 never occurs)
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validate an NPI by the NPPES 80840-prefixed Luhn check. Returns true only when
 * the value is 10 digits AND its 10th digit is the correct check digit.
 */
export function isValidNpi(value: string): boolean {
  if (!isNpiShaped(value)) return false;
  const base = NPI_ISO_PREFIX + value.slice(0, 9);
  return luhnCheckDigit(base) === value.charCodeAt(9) - 48;
}

/**
 * Assert-and-normalize: returns the NPI unchanged when valid, throws
 * InvalidNpiError otherwise. Use at the boundary where a validated NPI is
 * required (the resolver, the graph anchor). Never returns a "fixed" value.
 */
export function assertValidNpi(value: string): string {
  if (!isNpiShaped(value)) {
    throw new InvalidNpiError(value, 'must be exactly 10 digits');
  }
  if (!isValidNpi(value)) {
    throw new InvalidNpiError(value, 'check digit failed the NPPES 80840-prefixed Luhn test');
  }
  return value;
}

/**
 * Extract a VALID NPI from a raw provider reference, or null. A provider ref may
 * carry its NPI in several deterministic shapes seen in synthetic feeds:
 *   - a bare NPI:                       "1234567893"
 *   - a typed FHIR-style ref segment:   "Practitioner/1234567893", ".../npi-1234567893"
 *   - an npi-scoped identifier token:   "npi:1234567893"
 * We scan for 10-digit runs and return the FIRST that passes isValidNpi. A ref
 * with no valid NPI returns null (the caller keeps it raw + flagged — never
 * invents an identity). This never returns an invalid NPI.
 */
export function extractNpi(rawRef: string): string | null {
  if (!rawRef) return null;
  const candidates = rawRef.match(/\d{10}/g);
  if (!candidates) return null;
  for (const c of candidates) {
    if (isValidNpi(c)) return c;
  }
  return null;
}
