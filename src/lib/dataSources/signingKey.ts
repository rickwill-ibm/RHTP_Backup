/**
 * Ledger signing-key loader (Wave-2 W2-1).
 *
 * The key material used to seal the append-only Evidence Record ledger
 * (lib/evidence/ledgerIntegrity.ts). Seeded mode returns a demo-only HMAC key
 * from data/signing-key.seed.json (keyId 'demo-hmac-v1'); production mode throws
 * DataSourceNotConfiguredError until a real KMS/HSM asymmetric signer is wired
 * (HMAC is tamper-evident/symmetric, NOT non-repudiable — see ledgerIntegrity.ts).
 *
 * Mirrors the goldCardRoster.ts idiom exactly. SEAM: signingKey — mode-registry
 * switch point (lib/config/dataMode.ts).
 */
import {
  type DataSourceLoader,
  DataSourceNotConfiguredError,
  selectLoader,
  asRecord,
  reqString,
} from './common';
import seed from './data/signing-key.seed.json';

const SEAM = 'signingKey';

export interface SigningKeyMaterial {
  keyId: string;
  secret: string;
}

/** Normalize a raw signing-key document. Exported for direct-parse tests / real clients. */
export function normalizeSigningKey(raw: unknown): SigningKeyMaterial {
  const o = asRecord(raw, 'signingKey');
  return {
    keyId: reqString(o, 'keyId', 'signingKey'),
    secret: reqString(o, 'secret', 'signingKey'),
  };
}

export const seededSigningKeyLoader: DataSourceLoader<SigningKeyMaterial> = {
  id: 'seeded-signing-key',
  async load(): Promise<SigningKeyMaterial> {
    return normalizeSigningKey(seed);
  },
};

export const productionSigningKeyLoader: DataSourceLoader<SigningKeyMaterial> = {
  id: 'production-signing-key',
  async load(): Promise<SigningKeyMaterial> {
    throw new DataSourceNotConfiguredError(SEAM, 'Wire a real KMS/HSM asymmetric signer here.');
  },
};

/** Resolve the signing-key loader for the configured 'signingKey' mode. */
export function getSigningKeyLoader(): DataSourceLoader<SigningKeyMaterial> {
  return selectLoader(SEAM, seededSigningKeyLoader, productionSigningKeyLoader);
}
