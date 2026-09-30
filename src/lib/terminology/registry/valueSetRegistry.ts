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
        `authority client to replace this stub.`
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

/**
 * THE REGISTRY'S TEMPORAL FRAME IS A CIVIL DATE, NOT AN INSTANT (2026-09-30).
 *
 * Seed windows are authored as bare civil dates ('2026-09-30') with no zone, because that is how
 * their stewards publish them: a CMS fiscal-year boundary is a calendar date with no instant
 * attached. The first implementation parsed those to UTC midnight and compared an INSTANT against
 * them, which made the interval its own doc comment called CLOSED behave as half-open - an asset
 * was excluded for the whole of its final day, since any moment after 00:00 satisfies
 * `asOf > expiration`.
 *
 * WHAT THAT COST. On 2026-09-30, `icd-10-cm-fy2026` (exp 2026-09-30) stopped resolving, so
 * `validateCode('ICD-10-CM', ...)` returned NO binding and a test that had passed the previous day
 * against byte-identical code failed, blocking a push. The same bug sat mirrored on the lower
 * bound: `>= UTC midnight` makes an asset effective 2026-10-01 go live at 17:00 PDT on 09-30,
 * seven hours before the federal fiscal year starts.
 *
 * WHY STRING COMPARISON. ISO-8601 dates order lexicographically, so both bounds are inclusive by
 * construction. There is no midnight to straddle, no DST, and - the operational point - no
 * divergence between a UTC CI container and a developer's local machine, which would otherwise
 * make the same commit green in CI and red on the authoring host for a several-hour band around
 * every boundary. `dayOf` fixes the civil frame to UTC so a commit resolves identically
 * everywhere; a caller west of UTC therefore crosses a boundary in their local evening, which is
 * deterministic and stated rather than silently host-dependent.
 *
 * STILL OPEN, deliberately not fixed here: `asOf` defaults to the system clock, so a caller that
 * forgets to thread date-of-service silently gets today's code set. In claims and risk, currency
 * is keyed to DOS (or discharge date), never to "now" - a 2025 DOS claim reprocessed today must
 * validate against FY2025. That is an API change across every call site and belongs in its own
 * wave. Register: G-071.
 */
type CivilDate = string; // 'YYYY-MM-DD', comparable with < / > / <= / >=

/** The civil date (UTC frame) on which an instant falls. */
const dayOf = (asOf: Date): CivilDate => asOf.toISOString().slice(0, 10);

/** The civil date an authored bound denotes, tolerating a full timestamp in the seed. */
const civil = (iso: string): CivilDate => iso.slice(0, 10);

/**
 * True when `asOf` falls within the CLOSED interval [effectiveDate, expirationDate].
 * ONE primitive: inWindow, isExpiredAsOf and isNotYetEffective all derive from `dayOf`/`civil`,
 * so the enforcement path and the governance surface (listStale) can never disagree by a day
 * about the same asset - they did while only one of them was patched.
 */
function inWindow(asset: TerminologyAsset, asOf: Date): boolean {
  const d = dayOf(asOf);
  if (d < civil(asset.effectiveDate)) return false;
  if (asset.expirationDate && d > civil(asset.expirationDate)) return false;
  return true;
}

/** True when the asset's expiration day has fully passed at `asOf`. */
function isExpiredAsOf(asset: TerminologyAsset, asOf: Date): boolean {
  return asset.expirationDate !== undefined && dayOf(asOf) > civil(asset.expirationDate);
}

/** True when `asOf` precedes the asset's effective day. */
function isNotYetEffective(asset: TerminologyAsset, asOf: Date): boolean {
  return dayOf(asOf) < civil(asset.effectiveDate);
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
      const stale = pastCadence(asset, at) || isExpiredAsOf(asset, at);
      const current = asset.status === 'active' && windowed;
      let reason: string | undefined;
      if (asset.status !== 'active') reason = `version status is '${asset.status}'`;
      else if (!windowed)
        reason = isNotYetEffective(asset, at) ? 'not yet effective' : 'past expiration date';
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
        const expired = isExpiredAsOf(a, at);
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
