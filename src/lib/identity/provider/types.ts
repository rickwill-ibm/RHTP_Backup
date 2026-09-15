/**
 * Provider-identity types (F5). A ProviderIdentity is ALWAYS anchored by a
 * validated NPI — the NPI is the identity's spine, the rest is enrichment that
 * may or may not be available. This mirrors how the EMPI anchors a member by an
 * enterprise id: the anchor is authoritative, the attributes are decorated on.
 *
 * Provenance of the enrichment is explicit (`source`) so a downstream consumer
 * can tell a fully-resolved NPPES record from one carrying only the inline facts
 * a feed supplied. E9: there is no "synthesized" or "guessed" provenance — an
 * unresolvable provider never becomes a fabricated identity; it either stays a
 * raw ref upstream or the resolver throws.
 */

/** NPPES entity type: 1 = individual provider, 2 = organization. */
export type ProviderEntityType = 'individual' | 'organization';

/** Where a ProviderIdentity's attributes came from (the NPI is always validated). */
export type ProviderResolutionSource =
  /** Anchor only + attributes taken verbatim from the inbound feed (no registry). */
  | 'inline'
  /** Enriched from the seeded provider directory (mock/seeded seam). */
  | 'nppes-seed'
  /** Enriched from a live NPPES registry (production seam, once wired). */
  | 'nppes';

/**
 * A resolved provider identity, NPI-anchored. `npi` is guaranteed to have passed
 * isValidNpi. All enrichment fields are optional: a provider may resolve to just
 * its validated NPI when no directory record exists.
 */
export interface ProviderIdentity {
  /** The validated 10-digit NPI. The identity anchor. */
  npi: string;
  /** Display name (individual full name or organization legal name), when known. */
  name?: string;
  /** Primary NPPES taxonomy code (provider type), when known. */
  taxonomy?: string;
  /** Affiliated / owning organization name, when known. */
  organization?: string;
  /** NPPES entity type, when known. */
  entityType?: ProviderEntityType;
  /** Provenance of the enrichment above (the NPI is always validated). */
  source: ProviderResolutionSource;
}

/**
 * Resolver input: either a bare NPI, or a raw provider reference that may carry
 * one, plus any inline attributes the feed already supplied (used as fallback
 * enrichment when the directory has no record). At least one of `npi`/`rawRef`
 * must be present.
 */
export interface ProviderResolveInput {
  /** A candidate NPI (validated by the resolver; an invalid one is rejected). */
  npi?: string;
  /** A raw provider ref ("Practitioner/1234567893", "Organization/org-1", ...). */
  rawRef?: string;
  /** Inline attributes from the inbound record (name/taxonomy/org). */
  inline?: {
    name?: string;
    taxonomy?: string;
    organization?: string;
    entityType?: ProviderEntityType;
  };
}

/**
 * Thrown when provider resolution is asked to hit the live NPPES registry in
 * production but no registry client is wired. The fail-closed stub for the
 * `providerIdentity` seam: production NEVER serves a plausible-but-fake provider
 * directory record. PHI-free message names the remediation.
 */
export class NppesNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE providerIdentity=production: no live NPPES registry client is wired yet. ' +
        'Register one with setProductionProviderDirectory(realNppesClient) (SEAM: providerIdentity) ' +
        'or set DATA_MODE_PROVIDER_IDENTITY=mock|seeded to resolve against the seeded provider directory.'
    );
    this.name = 'NppesNotConfiguredError';
  }
}
