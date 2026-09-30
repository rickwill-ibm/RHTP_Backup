/**
 * ADL error taxonomy. Every refusal is typed and carries the JSON path that
 * caused it, so a malformed or unsafe definition never silently defaults.
 */

/** Every way an agent definition can be refused. */
export type AdlErrorCode =
  | 'ADL_SHAPE'
  | 'ADL_DUPLICATE_ID'
  | 'ADL_FREE_TEXT'
  | 'ADL_TOOL_NOT_ALLOWED'
  | 'ADL_PHI_OVERRIDE_REQUIRED'
  | 'ADL_UNSUPPORTED_BODY'
  | 'ADL_DRIFT'
  | 'ADL_AUTHORITY_LOCK'
  | 'ADL_ROUTE_ORDER';

/** Raised loudly whenever a definition is malformed, unsafe, or has drifted. */
export class AdlError extends Error {
  constructor(
    public readonly code: AdlErrorCode,
    public readonly path: string,
    message: string
  ) {
    super(`[${code}] ${path}: ${message}`);
    this.name = 'AdlError';
  }
}
