/**
 * The `providerIdentity` data-mode seam — NPPES registry lookup, mode-gated.
 *
 * Same fail-closed-stub pattern every sibling seam uses (identity, terminology,
 * evidence, ...): mock/seeded resolve against an in-repo seeded directory so the
 * demo stays green; production defers to a registered live NPPES client, and with
 * NONE wired it FAILS CLOSED (throws NppesNotConfiguredError) rather than serving
 * the demo directory dressed up as production data.
 *
 * A ProviderDirectory answers ONE question: given a validated NPI, what does the
 * registry know about this provider (name/taxonomy/org)? It never validates the
 * NPI itself (that is npi.ts) and never invents a record: a lookup miss is a
 * plain undefined, not a fabricated provider.
 */
import { getDataMode } from '@/lib/config/dataMode';
import type { ProviderIdentity } from './types';
import { NppesNotConfiguredError } from './types';
import { SEED_PROVIDER_INDEX } from './seedDirectory';

export interface ProviderDirectory {
  readonly id: string;
  /** Registry record for an already-validated NPI, or undefined on a miss. */
  lookup(npi: string): ProviderIdentity | undefined;
}

/** The seeded (mock/seeded) directory: reads the frozen synthetic seed index. */
const seedDirectory: ProviderDirectory = Object.freeze({
  id: 'seed-provider-directory',
  lookup(npi: string): ProviderIdentity | undefined {
    return SEED_PROVIDER_INDEX.get(npi);
  },
});

/** Exposed for tests/ops that want the seed directly (never the production path). */
export const seededProviderDirectory: ProviderDirectory = seedDirectory;

let productionProviderDirectory: ProviderDirectory | null = null;

/** Register (or clear, with null) the live NPPES-backed directory (composition root / tests). */
export function setProductionProviderDirectory(dir: ProviderDirectory | null): void {
  productionProviderDirectory = dir;
}

/**
 * Resolve the provider directory for the configured `providerIdentity` mode.
 *   mock / seeded -> the seeded synthetic directory (demo stays green).
 *   production     -> the registered live NPPES client, or throw
 *                     NppesNotConfiguredError (fail closed) when none is wired.
 */
export function getProviderDirectory(): ProviderDirectory {
  if (getDataMode('providerIdentity') === 'production') {
    if (!productionProviderDirectory) throw new NppesNotConfiguredError();
    return productionProviderDirectory;
  }
  return seedDirectory;
}
