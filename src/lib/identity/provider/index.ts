/**
 * Provider identity (F5) — public surface.
 *
 * NPI validation (NPPES 80840-prefixed Luhn), a mode-gated NPPES directory seam
 * (seeded in mock/seeded, fail-closed in production until a live client is wired),
 * a resolver that anchors providers by validated NPI, and the ProviderIdentity
 * graph node namespace. See README.md.
 */
export {
  isValidNpi,
  isNpiShaped,
  assertValidNpi,
  extractNpi,
  InvalidNpiError,
  NPI_ISO_PREFIX,
} from './npi';
export type {
  ProviderIdentity,
  ProviderEntityType,
  ProviderResolutionSource,
  ProviderResolveInput,
} from './types';
export { NppesNotConfiguredError } from './types';
export {
  getProviderDirectory,
  setProductionProviderDirectory,
  seededProviderDirectory,
  type ProviderDirectory,
} from './directory';
export { resolveProvider, anchorProviderRef } from './resolver';
export { PROVIDER_IDENTITY_KIND, providerNodeKey, providerNodeProps } from './node';
export { SEED_PROVIDER_DIRECTORY } from './seedDirectory';
