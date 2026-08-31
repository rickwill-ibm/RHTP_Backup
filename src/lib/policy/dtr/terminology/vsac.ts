/**
 * VSAC expansion provider — the gated, network-backed `$expand` path (Phase 2; inert in Phase 1).
 *
 * Mirrors the AI branch of `codingMap.ts`: it is a real provider behind the same interface, but the
 * live `$expand` needs a UMLS endpoint + `VSAC_API_KEY` and cannot run offline, so it throws
 * {@link VsacNotConfiguredError} until configured. `selectExpansionProvider` never routes here unless
 * the config reports `configured`, and CPT / `urn:rhtp:*` value sets are ALWAYS kept inline (VSAC
 * cannot $expand CPT — AMA licensing), so this provider is never asked to expand them.
 */
import type { ValueSetExpansionProvider } from './expansion';

export class VsacNotConfiguredError extends Error {
  constructor() {
    super('VSAC expansion is enabled but not configured (missing VSAC_ENDPOINT / VSAC_API_KEY).');
    this.name = 'VsacNotConfiguredError';
  }
}

/**
 * VSAC provider. When configured it would `$expand` an intensional ValueSet over the network and
 * return the enumerated codings; until then it throws so no code path silently degrades. The network
 * branch is unreachable offline (hence a testlink-baseline row, not a live unit test).
 */
export const vsacExpansionProvider: ValueSetExpansionProvider = {
  id: 'vsac',
  async expand() {
    throw new VsacNotConfiguredError();
  },
};
