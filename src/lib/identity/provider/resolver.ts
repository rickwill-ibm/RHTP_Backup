/**
 * Provider identity resolver (F5). Turns an NPI (or a raw provider ref carrying
 * one) into a ProviderIdentity anchored by the validated NPI, enriched from the
 * mode-gated NPPES directory seam when a record exists.
 *
 * TWO entry points, deliberately split by the sync/async boundary:
 *
 *   resolveProvider(input)      ASYNC. The full resolve: validate the NPI, then
 *                               consult the providerIdentity directory seam
 *                               (seeded in mock/seeded, live NPPES in production,
 *                               fail-closed when unwired) and merge its record
 *                               over the inline attributes. For services that can
 *                               await a registry call.
 *
 *   anchorProviderRef(input)    SYNC, registry-free. Validate the NPI and anchor
 *                               a ProviderIdentity from the inline attributes
 *                               only (source 'inline'). For the graph MAPPING,
 *                               whose toMutations is pure and synchronous: it can
 *                               anchor a provider by validated NPI without an
 *                               async NPPES round-trip. Returns null when no valid
 *                               NPI is present so the caller keeps the ref raw.
 *
 * E9 (never fail open to a fabricated identity):
 *   - a candidate that fails NPI validation resolves to NULL here (sync) or throws
 *     InvalidNpiError (async) — it is NEVER anchored to a made-up NPI;
 *   - a validated NPI with no directory record still resolves, but ONLY to its
 *     real validated anchor plus whatever inline facts the feed gave — the
 *     resolver never invents a name/taxonomy to fill the gap;
 *   - production with no NPPES client wired throws (fail closed), never fakes.
 */
import type { ProviderDirectory } from './directory';
import { getProviderDirectory } from './directory';
import { extractNpi, isValidNpi, assertValidNpi } from './npi';
import type { ProviderIdentity, ProviderResolveInput } from './types';

/** The validated NPI implied by an input, or null (no valid NPI present). */
function candidateNpi(input: ProviderResolveInput): string | null {
  if (input.npi && isValidNpi(input.npi)) return input.npi;
  if (input.npi && !input.rawRef) return null; // an explicit-but-invalid NPI: reject
  if (input.rawRef) return extractNpi(input.rawRef);
  return null;
}

/** Build the inline-anchored identity for a validated NPI (no registry). */
function inlineIdentity(npi: string, input: ProviderResolveInput): ProviderIdentity {
  const i = input.inline ?? {};
  const out: ProviderIdentity = { npi, source: 'inline' };
  if (i.name) out.name = i.name;
  if (i.taxonomy) out.taxonomy = i.taxonomy;
  if (i.organization) out.organization = i.organization;
  if (i.entityType) out.entityType = i.entityType;
  return out;
}

/**
 * SYNC anchor for the graph mapping. Returns a validated-NPI-anchored identity
 * built from inline attributes, or null when the input carries no valid NPI.
 * Never throws; never fabricates an NPI.
 */
export function anchorProviderRef(input: ProviderResolveInput): ProviderIdentity | null {
  const npi = candidateNpi(input);
  if (!npi) return null;
  return inlineIdentity(npi, input);
}

/** Merge a directory record over the inline anchor (directory facts win when present). */
function mergeRecord(anchor: ProviderIdentity, record: ProviderIdentity): ProviderIdentity {
  return {
    npi: anchor.npi, // the anchor NPI is authoritative; a directory can never change it
    name: record.name ?? anchor.name,
    taxonomy: record.taxonomy ?? anchor.taxonomy,
    organization: record.organization ?? anchor.organization,
    entityType: record.entityType ?? anchor.entityType,
    source: record.source, // 'nppes-seed' | 'nppes'
  };
}

/**
 * ASYNC full resolve. Validates the NPI (throwing InvalidNpiError on a bad one
 * that was supplied explicitly), then enriches from the directory seam.
 *
 * @throws InvalidNpiError        when input.npi is present but invalid.
 * @throws NppesNotConfiguredError when providerIdentity=production and no live
 *                                 NPPES client is registered (fail closed).
 * @returns the resolved ProviderIdentity, or null when the input carries no NPI
 *          at all (neither an explicit npi nor one extractable from rawRef).
 */
export async function resolveProvider(
  input: ProviderResolveInput,
  directory: ProviderDirectory = getProviderDirectory(),
): Promise<ProviderIdentity | null> {
  // An explicitly-supplied NPI must validate (fail loud). A rawRef-only input
  // that carries no valid NPI is a legitimate "no provider identity here" -> null.
  if (input.npi) assertValidNpi(input.npi);
  const npi = candidateNpi(input);
  if (!npi) return null;

  const anchor = inlineIdentity(npi, input);
  const record = directory.lookup(npi);
  return record ? mergeRecord(anchor, record) : anchor;
}
