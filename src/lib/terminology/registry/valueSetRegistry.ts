/**
 * ValueSetRegistry — the terminology-asset management FACILITY (Iteration 4).
 *
 * Manages the CURRENCY, VERSIONING, and LIFECYCLE of every governed value set /
 * code system / classification / ontology, ACROSS families (clinical, risk,
 * quality, behavioral, social, privacy). It answers WHICH version of WHICH
 * authority's asset a use should bind to, whether that version is still current,
 * and which assets are stale and due for refresh from their steward.
 *
 * This is an HONEST STUB: the registry, its seed metadata, and the currency/
 * versioning logic are REAL-NOW and deterministic (inject a clock for asOf/now).
 * The REFRESH/FETCH of live content from external authorities (VSAC SVS+FHIR,
 * CMS HCC crosswalk, Gravity package, NLM) is the NOT-CONFIGURED stub: `refresh`
 * throws, naming the authority + operation, until the Terminology iteration wires
 * the real feeds.
 */
import seed from './data/terminology-assets.json';
import {
  CADENCE_DAYS,
  type AssetFamily,
  type AssetRegistrySeed,
  type BindingSpec,
  type CurrencyFlag,
  type ResolvedBinding,
  type TerminologyAsset,
} from './assetTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Thrown by the registry's refresh/fetch until the real external-authority feeds
 * are wired. Names the stewarding authority + the operation needed (fail-loud,
 * PHI-free), mirroring TerminologyServiceNotConfiguredError.
 */
export class TerminologyRefreshNotConfiguredError extends Error {
  readonly authority: string;
  readonly operation: string;
  constructor(authority: string, operation: string) {
    super(
      `Terminology asset refresh not configured: cannot ${operation} from "${authority}". ` +
        `Live refresh/fetch of value-set content from external authorities (VSAC SVS+FHIR, ` +
        `CMS HCC crosswalk, Gravity package, NLM RxNorm/LOINC feeds) is a later roadmap ` +
        `iteration. The registry manages currency/versioning metadata now; wire the ` +
        `authority client to replace this stub.`,
    );
    this.name = 'TerminologyRefreshNotConfiguredError';
    this.authority = authority;
    this.operation = operation;
  }
}

/** A monotonic clock the registry reads for "now" (injectable for determinism). */
export type Clock = () => Date;

export interface RegistryOptions {
  /** Override the seed asset set (tests). */
  assets?: TerminologyAsset[];
  /** Override the seed binding table (tests). */
  bindings?: BindingSpec[];
  /** Injected clock for now(); defaults to the system clock. */
  now?: Clock;
}

function toDate(iso: string): Date {
  return new Date(`${iso.length <= 10 ? `${iso}T00:00:00.000Z` : iso}`);
}

/** True when `asOf` falls within [effectiveDate, expirationDate] of the asset. */
function inWindow(asset: TerminologyAsset, asOf: Date): boolean {
  if (asOf < toDate(asset.effectiveDate)) return false;
  if (asset.expirationDate && asOf > toDate(asset.expirationDate)) return false;
  return true;
}

/** True when the asset is past its refresh cadence relative to `asOf`. */
function pastCadence(asset: TerminologyAsset, asOf: Date): boolean {
  const maxAgeDays = CADENCE_DAYS[asset.refreshCadence];
  if (maxAgeDays === null) return false; // irregular: not clock-driven
  const ageDays = (asOf.getTime() - toDate(asset.lastRefreshed).getTime()) / DAY_MS;
  return ageDays > maxAgeDays;
}

/** The public facility surface. */
export interface ValueSetRegistry {
  /** Register (or replace, by id) an asset. Returns the stored asset. */
  register(asset: TerminologyAsset): TerminologyAsset;
  /** Every registered asset, optionally filtered by family. */
  list(family?: AssetFamily): TerminologyAsset[];
  /** One asset by id, or undefined. */
  get(assetId: string): TerminologyAsset | undefined;
  /** The families that have at least one registered asset. */
  families(): AssetFamily[];
  /**
   * The ACTIVE version of the logical asset the given assetId belongs to
   * (assets sharing a `system` are versions of one logical asset). Undefined if
   * the id is unknown or the group has no active-in-window version at `asOf`.
   */
  getActiveVersion(assetId: string, asOf?: Date): TerminologyAsset | undefined;
  /** The active-in-window version for a code system / value-set `system`. */
  getActiveBySystem(system: string, asOf?: Date): TerminologyAsset | undefined;
  /** Currency check: is this specific asset version current at `asOf`? */
  isCurrent(assetId: string, asOf?: Date): boolean;
  /** Full currency/versioning verdict for one asset at `asOf`. */
  checkCurrency(assetId: string, asOf?: Date): CurrencyFlag;
  /** Assets past their refresh cadence or expired at `asOf` (due for refresh). */
  listStale(asOf?: Date): TerminologyAsset[];
  /** Which value set + active version a (domain, purpose) use should bind to. */
  resolveBinding(domain: string, purpose: string, asOf?: Date): ResolvedBinding | undefined;
  /** Every registered binding spec. */
  listBindings(): BindingSpec[];
  /**
   * NOT-CONFIGURED STUB: pull live content for an asset from its steward. Throws
   * TerminologyRefreshNotConfiguredError naming the authority + operation.
   */
  refresh(assetId: string): never;
}

/** Construct a registry over a seed asset set + binding table, with an injected clock. */
export function createValueSetRegistry(opts: RegistryOptions = {}): ValueSetRegistry {
  const data = seed as unknown as AssetRegistrySeed;
  const now: Clock = opts.now ?? (() => new Date());
  const assets = new Map<string, TerminologyAsset>();
  for (const a of opts.assets ?? data.assets) assets.set(a.id, a);
  const bindings: BindingSpec[] = [...(opts.bindings ?? data.bindings)];

  const asOfOrNow = (asOf?: Date): Date => asOf ?? now();

  function groupBySystem(system: string): TerminologyAsset[] {
    return [...assets.values()].filter((a) => a.system === system);
  }

  function activeInGroup(system: string, asOf: Date): TerminologyAsset | undefined {
    return groupBySystem(system).find((a) => a.status === 'active' && inWindow(a, asOf));
  }

  const registry: ValueSetRegistry = {
    register(asset) {
      assets.set(asset.id, asset);
      return asset;
    },

    list(family) {
      const all = [...assets.values()];
      return family ? all.filter((a) => a.family === family) : all;
    },

    get(assetId) {
      return assets.get(assetId);
    },

    families() {
      return [...new Set([...assets.values()].map((a) => a.family))];
    },

    getActiveVersion(assetId, asOf) {
      const asset = assets.get(assetId);
      if (!asset) return undefined;
      return activeInGroup(asset.system, asOfOrNow(asOf));
    },

    getActiveBySystem(system, asOf) {
      return activeInGroup(system, asOfOrNow(asOf));
    },

    isCurrent(assetId, asOf) {
      return registry.checkCurrency(assetId, asOf).current;
    },

    checkCurrency(assetId, asOf) {
      const at = asOfOrNow(asOf);
      const asset = assets.get(assetId);
      if (!asset) {
        return {
          assetId,
          version: '(unknown)',
          status: 'retired',
          current: false,
          stale: true,
          flagged: true,
          reason: 'asset not registered',
        };
      }
      const windowed = inWindow(asset, at);
      const stale = pastCadence(asset, at) || (asset.expirationDate !== undefined && at > toDate(asset.expirationDate));
      const current = asset.status === 'active' && windowed;
      let reason: string | undefined;
      if (asset.status !== 'active') reason = `version status is '${asset.status}'`;
      else if (!windowed) reason = at < toDate(asset.effectiveDate) ? 'not yet effective' : 'past expiration date';
      else if (stale) reason = `past ${asset.refreshCadence} refresh cadence`;
      return {
        assetId,
        version: asset.version,
        status: asset.status,
        current,
        stale,
        flagged: !current || stale,
        reason,
      };
    },

    listStale(asOf) {
      const at = asOfOrNow(asOf);
      return [...assets.values()].filter((a) => {
        const expired = a.expirationDate !== undefined && at > toDate(a.expirationDate);
        return expired || pastCadence(a, at);
      });
    },

    resolveBinding(domain, purpose, asOf) {
      const spec = bindings.find((b) => b.domain === domain && b.purpose === purpose);
      if (!spec) return undefined;
      const bound = assets.get(spec.assetId);
      if (!bound) return undefined;
      const at = asOfOrNow(asOf);
      // Resolve to the active version in the bound asset's system group; fall
      // back to the bound asset itself when its group has no active version.
      const active = activeInGroup(bound.system, at) ?? bound;
      return {
        domain,
        purpose,
        assetId: active.id,
        valueSet: active.name,
        version: active.version,
        system: active.system,
        bindingStrength: active.bindingStrength,
        status: active.status,
        current: active.status === 'active' && inWindow(active, at),
      };
    },

    listBindings() {
      return [...bindings];
    },

    refresh(assetId) {
      const asset = assets.get(assetId);
      const authority = asset ? asset.steward : 'the stewarding authority';
      throw new TerminologyRefreshNotConfiguredError(authority, `refresh asset '${assetId}'`);
    },
  };

  return registry;
}

/** The process-default registry over the in-repo seed (system clock). */
export const valueSetRegistry: ValueSetRegistry = createValueSetRegistry();
