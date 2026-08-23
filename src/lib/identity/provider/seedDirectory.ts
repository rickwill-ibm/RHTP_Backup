/**
 * Seeded provider directory — the mock/seeded backing for the `providerIdentity`
 * seam. A small, deterministic, synthetic stand-in for the NPPES registry: every
 * NPI here is a real check-digit-valid NPI (passes isValidNpi) but the providers
 * are fabricated demo entities, not real people or organizations. No PHI.
 *
 * This is DATA, not logic: the directory seam (directory.ts) reads it. Swapping
 * in a live NPPES client in production replaces this seed wholesale (and, absent
 * that client, production fails closed rather than serving this demo data).
 */
import type { ProviderIdentity } from './types';

/** Keyed lookup rows: NPI -> the seeded registry record (source always nppes-seed). */
export const SEED_PROVIDER_DIRECTORY: readonly ProviderIdentity[] = Object.freeze([
  {
    npi: '1234567893',
    name: 'Prairie Internal Medicine Clinic',
    taxonomy: '207R00000X', // Internal Medicine
    organization: 'Prairie Health Network',
    entityType: 'organization',
    source: 'nppes-seed',
  },
  {
    npi: '1987654328',
    name: 'Dr. Alex Whitefeather',
    taxonomy: '208D00000X', // General Practice
    organization: 'Prairie Health Network',
    entityType: 'individual',
    source: 'nppes-seed',
  },
  {
    npi: '1555666779',
    name: 'Cardiology Associates of the Plains',
    taxonomy: '207RC0000X', // Cardiovascular Disease
    organization: 'Plains Specialty Group',
    entityType: 'organization',
    source: 'nppes-seed',
  },
  {
    npi: '1488057732',
    name: 'Dr. Jordan Two Rivers',
    taxonomy: '2084P0800X', // Psychiatry
    organization: 'Behavioral Health Collaborative',
    entityType: 'individual',
    source: 'nppes-seed',
  },
]);

/** Index the seed by NPI for O(1) lookup. Frozen at module load (deterministic). */
export const SEED_PROVIDER_INDEX: ReadonlyMap<string, ProviderIdentity> = new Map(
  SEED_PROVIDER_DIRECTORY.map((p) => [p.npi, p]),
);
