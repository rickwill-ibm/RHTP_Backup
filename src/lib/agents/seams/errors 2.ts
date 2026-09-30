/** Typed seam refusals. A seam NEVER silently defaults or falls back to a mock. */

export type SeamErrorCode =
  | 'SEAM_NOT_CONFIGURED'
  | 'SEAM_TOOL_NOT_GRANTED'
  | 'SEAM_SHAPE'
  | 'SEAM_HASH_MISMATCH'
  | 'SEAM_ISSUER_MISMATCH'
  | 'SEAM_PHI_UNSAFE'
  | 'SEAM_DUPLICATE_BINDING';

/** Raised whenever a seam cannot be satisfied. Always fails closed. */
export class SeamError extends Error {
  constructor(
    public readonly code: SeamErrorCode,
    public readonly subject: string,
    message: string
  ) {
    super(`[${code}] ${subject}: ${message}`);
    this.name = 'SeamError';
  }
}
