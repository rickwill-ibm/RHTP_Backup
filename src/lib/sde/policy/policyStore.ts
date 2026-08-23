// SEAM: sde-policy-store
/**
 * Disposition policy store. Policy IS DATA: contact-frequency caps, channel
 * preference, consent scoping, priority scoring, suppression + bundling rules
 * live in data/disposition-policy.default.json, tunable without a code change.
 * The engine reads a pack; a state deployment tunes the file (or, in production,
 * publishes a versioned pack through this seam).
 *
 * mock/seeded  -> the default pack shipped as data (demo stays green);
 * production   -> a versioned pack from the backend; until one is registered,
 *                 production refuses LOUDLY (the BackboneNotConfigured pattern).
 * An invalid pack throws at parse time and the last valid pack is retained.
 */
import { getDataMode } from '@/lib/config/dataMode';
import defaultPackJson from '../data/disposition-policy.default.json';
import { parsePolicyPack } from '../schema';
import type { PolicyPack } from '../types';

export class SdePolicyStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE signalDisposition=production: no production disposition-policy store is wired yet. ' +
        'Register one with setProductionPolicyPackLoader(() => loadPackFromDb()) ' +
        '(SEAM: sde-policy-store) or set DATA_MODE_SIGNAL_DISPOSITION=mock.',
    );
    this.name = 'SdePolicyStoreNotConfiguredError';
  }
}

let cachedDefault: PolicyPack | null = null;
let lastValid: PolicyPack | null = null;
let productionLoader: (() => unknown) | null = null;

/** The default pack, parsed + validated once. */
export function defaultPolicyPack(): PolicyPack {
  if (!cachedDefault) {
    cachedDefault = parsePolicyPack(defaultPackJson);
    lastValid = cachedDefault;
  }
  return cachedDefault;
}

/** Parse + validate an arbitrary pack object (a tuned pack). Retains last valid. */
export function loadPolicyPack(raw: unknown): PolicyPack {
  try {
    const pack = parsePolicyPack(raw);
    lastValid = pack;
    return pack;
  } catch (err) {
    if (lastValid) return lastValid; // keep the last valid version; never run invalid
    throw err;
  }
}

/** Register the production pack loader (composition root / tests). */
export function setProductionPolicyPackLoader(loader: (() => unknown) | null): void {
  productionLoader = loader;
}

/** Resolve the active pack for the configured 'signalDisposition' data mode. */
export function getPolicyPack(): PolicyPack {
  const mode = getDataMode('signalDisposition');
  if (mode === 'production') {
    if (!productionLoader) throw new SdePolicyStoreNotConfiguredError();
    return loadPolicyPack(productionLoader());
  }
  return defaultPolicyPack();
}
