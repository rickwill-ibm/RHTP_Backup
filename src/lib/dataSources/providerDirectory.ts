/**
 * Provider-directory loader (O-2).
 *
 * Normalized provider directory (NPI, specialty, geo, lines of business, status),
 * generic and persona-free. Seeded mode reads data/provider-directory.seed.json;
 * production mode throws until a real directory source (credentialing / roster
 * API) is wired. Deterministic: callers pass `asOf`.
 *
 * SEAM: providerDirectory — mode-registry switch point (lib/config/dataMode.ts).
 */
import {
  type DataSourceLoader,
  DataSourceNotConfiguredError,
  selectLoader,
  asRecord,
  reqString,
  reqNumber,
  reqBool,
  reqArray,
} from './common';
import seed from './data/provider-directory.seed.json';

const SEAM = 'providerDirectory';

const PROVIDER_STATUSES = ['active', 'credentialing', 'pending'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export interface NormalizedDirectoryProvider {
  npi: string;
  name: string;
  specialty: string;
  county: string;
  state: string;
  lat: number;
  lng: number;
  lobs: string[];
  acceptingNewPatients: boolean;
  status: ProviderStatus;
}

export interface ProviderDirectory {
  asOf: string;
  providers: NormalizedDirectoryProvider[];
}

function parseStatus(v: unknown, ctx: string): ProviderStatus {
  if (typeof v !== 'string' || !(PROVIDER_STATUSES as readonly string[]).includes(v)) {
    throw new Error(`${ctx}: 'status' must be one of ${PROVIDER_STATUSES.join(', ')}`);
  }
  return v as ProviderStatus;
}

function parseProvider(v: unknown, i: number): NormalizedDirectoryProvider {
  const o = asRecord(v, `providerDirectory.providers[${i}]`);
  const ctx = `providerDirectory.providers[${i}]`;
  const lobs = reqArray(o.lobs ?? [], `${ctx}.lobs`).map((l, j) => {
    if (typeof l !== 'string' || l.length === 0) throw new Error(`${ctx}.lobs[${j}]: must be a non-empty string`);
    return l;
  });
  return {
    npi: reqString(o, 'npi', ctx),
    name: reqString(o, 'name', ctx),
    specialty: reqString(o, 'specialty', ctx),
    county: reqString(o, 'county', ctx),
    state: reqString(o, 'state', ctx),
    lat: reqNumber(o, 'lat', ctx),
    lng: reqNumber(o, 'lng', ctx),
    lobs,
    acceptingNewPatients: reqBool(o, 'acceptingNewPatients', ctx),
    status: parseStatus(o.status, ctx),
  };
}

/** Normalize a raw directory document. Exported for tests / real clients. */
export function normalizeProviderDirectory(raw: unknown, asOf: string): ProviderDirectory {
  const doc = asRecord(raw, 'providerDirectory');
  const providers = reqArray(doc.providers ?? [], 'providerDirectory.providers').map(parseProvider);
  return { asOf, providers };
}

export const seededProviderDirectoryLoader: DataSourceLoader<ProviderDirectory> = {
  id: 'seeded-provider-directory',
  async load(asOf: string): Promise<ProviderDirectory> {
    return normalizeProviderDirectory(seed, asOf);
  },
};

export const productionProviderDirectoryLoader: DataSourceLoader<ProviderDirectory> = {
  id: 'production-provider-directory',
  async load(): Promise<ProviderDirectory> {
    throw new DataSourceNotConfiguredError(
      SEAM,
      'Implement a directory client here (credentialing / provider-roster API).'
    );
  },
};

/** Resolve the provider-directory loader for the configured 'providerDirectory' mode. */
export function getProviderDirectoryLoader(): DataSourceLoader<ProviderDirectory> {
  return selectLoader(SEAM, seededProviderDirectoryLoader, productionProviderDirectoryLoader);
}
