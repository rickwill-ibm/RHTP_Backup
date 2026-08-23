/**
 * ProviderIdentity graph node — the NPI-anchored projection surface (F5).
 *
 * A resolved provider projects as a ProviderIdentity node whose business key is
 * its validated NPI (never the opaque source ref). This file owns the pinned
 * namespace for that node type and the pure helper that turns a ProviderIdentity
 * into a node key + property bag. It deliberately imports NOTHING from the graph
 * layer: the graph mapping (referral, etc.) imports THESE constants and feeds the
 * props through the graph's own resourceNode() helper, so restriction/label
 * handling stays in the graph layer and identity stays graph-agnostic.
 *
 * NPI-anchored keys mean two feeds that name the same provider by NPI converge on
 * ONE ProviderIdentity node (deduped by identity), instead of fragmenting into a
 * raw ref per feed — the provider-side analogue of the member cross-reference.
 */
import type { PropVal } from '@/lib/graph/types';
import type { ProviderIdentity } from './types';

/** Pinned node kind for a resolved, NPI-anchored provider. */
export const PROVIDER_IDENTITY_KIND = 'ProviderIdentity';

/** The NPI-anchored business key for a provider node: `npi:<validated-npi>`. */
export function providerNodeKey(npi: string): string {
  return `npi:${npi}`;
}

/**
 * The node property bag for a resolved provider. `providerResolution: 'resolved'`
 * distinguishes a resolved ProviderIdentity node from the raw + `deferred-I8A` /
 * unresolved performer refs the mapping still emits when no NPI is present.
 * Optional attributes are omitted (not emitted as empty strings) so a sparse
 * resolution stays sparse.
 */
export function providerNodeProps(provider: ProviderIdentity): Record<string, PropVal> {
  const props: Record<string, PropVal> = {
    npi: provider.npi,
    providerResolution: 'resolved',
    resolutionSource: provider.source,
  };
  if (provider.name) props.name = provider.name;
  if (provider.taxonomy) props.taxonomy = provider.taxonomy;
  if (provider.organization) props.organization = provider.organization;
  if (provider.entityType) props.entityType = provider.entityType;
  return props;
}
