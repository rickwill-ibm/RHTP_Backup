// CONTRACT: C10  // DP-1  // F5-b
/**
 * Shared performer/prescriber -> ProviderIdentity resolution for the mapping layer
 * (F5-b). Claims, medications and care-team all name a provider by a raw reference
 * that may carry an NPI. This helper applies the SAME rule the referrals mapping
 * pioneered, so every domain resolves a provider ref identically:
 *
 *   valid NPI present  -> an NPI-anchored ProviderIdentity node (key `npi:<npi>`,
 *                         `providerResolution: 'resolved'`) linked from the owning
 *                         resource via `edgeType`, resolved by the SYNC provider
 *                         resolver (anchorProviderRef, registry-free);
 *   no valid NPI       -> the RAW reference node is kept (kind derived from the ref
 *                         prefix), flagged `providerResolution: 'deferred-I8A'`.
 *
 * E9 (never fabricate identity): a ref that carries no valid NPI is NEVER anchored
 * to a made-up NPI. It stays raw and flagged so an operator can see it was seen but
 * not resolved, exactly as the referrals mapping already does. This helper REUSES
 * the provider resolver and the ProviderIdentity node namespace; it reimplements
 * neither.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation } from '../types';
import {
  anchorProviderRef,
  PROVIDER_IDENTITY_KIND,
  providerNodeKey,
  providerNodeProps,
} from '@/lib/identity/provider';
import { associative, resourceNode } from './spec';

/** Re-exported so a namespace-integrity test can pin the resolved provider node kind. */
export { PROVIDER_IDENTITY_KIND } from '@/lib/identity/provider';

/** The raw attributes a feed may carry alongside a performer/prescriber ref. */
export interface ProviderRefInput {
  /** The raw provider reference, e.g. "Practitioner/1234567893" or "Organization/org-1". */
  rawRef: string;
  /** An explicit NPI the feed supplied (validated by the resolver; a bad one is ignored). */
  npi?: string;
  name?: string;
  organization?: string;
  taxonomy?: string;
}

/** The node kind for a raw provider ref: its resource-type prefix, else Practitioner. */
function rawKind(ref: string): string {
  return ref.split('/')[0] || 'Practitioner';
}

/**
 * Resolve one performer/prescriber ref and link it from `from` via `edgeType`,
 * dated from `start`. Emits the ProviderIdentity node + resolved edge when a valid
 * NPI is present, else the raw ref node + a deferred-I8A edge. Returns [] when the
 * ref is empty (no provider named -> no edge, mirroring the referrals mapping).
 */
export function providerRefMutations(
  event: C2Event,
  from: { kind: string; key: string },
  edgeType: string,
  input: ProviderRefInput,
  start: string
): Mutation[] {
  const rawRef = input.rawRef;
  if (!rawRef) return [];
  const provider = anchorProviderRef({
    npi: input.npi || undefined,
    rawRef,
    inline: {
      name: input.name || undefined,
      organization: input.organization || undefined,
      taxonomy: input.taxonomy || undefined,
    },
  });
  const out: Mutation[] = [];
  if (provider) {
    const key = providerNodeKey(provider.npi);
    out.push(...resourceNode(event, PROVIDER_IDENTITY_KIND, key, providerNodeProps(provider)));
    out.push({
      op: 'UpsertEdge',
      type: edgeType,
      from,
      to: { kind: PROVIDER_IDENTITY_KIND, key },
      properties: { providerResolution: 'resolved', npi: provider.npi },
      validity: { start, end: null },
      semantics: associative,
    });
  } else {
    const kind = rawKind(rawRef);
    out.push(...resourceNode(event, kind, rawRef, { rawRef, providerResolution: 'deferred-I8A' }));
    out.push({
      op: 'UpsertEdge',
      type: edgeType,
      from,
      to: { kind, key: rawRef },
      properties: { providerResolution: 'deferred-I8A' },
      validity: { start, end: null },
      semantics: associative,
    });
  }
  return out;
}
