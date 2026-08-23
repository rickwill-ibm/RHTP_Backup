/**
 * Seeded TerminologyService - the real-now stub backed by an in-repo allowlist.
 *
 * validateCode is REAL member-of-bound-version validation (I8A-ii wave A): a
 * governed coding validates only if it is a member of the value-set VERSION the
 * registry currently binds, a code retired in that version returns `retired`, and
 * the answer carries the bound CodeAssetBinding. The "current version at check
 * time" is deterministic: the service reads an injected clock (via @/lib/clock by
 * default, or a fixed `now` through createSeedTerminologyService), so tests pin it.
 *
 * translate / classify still answer from data/terminology-seed.json. Every answer
 * is flagged `stub: true` so no caller mistakes it for a live terminology server.
 * Selected for the `terminology` seam in mock and seeded modes.
 */
import * as clock from '@/lib/clock';
import hccCrosswalk from './classify/data/hcc-crosswalk.json';
import seed from './data/terminology-seed.json';
import { createValueSetRegistry, type ValueSetRegistry } from './registry/valueSetRegistry';
import { validateCodeVersioned } from './validateCode';
import {
  SYSTEM_URIS,
  type CodeAssetBinding,
  type ClassificationResult,
  type ClassificationScheme,
  type CodeValidation,
  type TerminologyService,
  type TerminologySystem,
  type TranslationResult,
} from './types';

type SeedShape = {
  codeSystems: Record<string, { uri: string; codes: Record<string, string> }>;
  conceptMap: Record<string, Record<string, string>>;
  valueSets: Record<string, string[]>;
};

const DATA = seed as unknown as SeedShape;

/**
 * The ICD-10-CM -> CMS-HCC classification content is sourced from the SINGLE Wave B
 * crosswalk seed (classify/data/hcc-crosswalk.json), so the seeded service and the
 * data-driven hccClassify share ONE source of truth (no duplicated, driftable map).
 */
const HCC_MAP = (hccCrosswalk as unknown as { map: Record<string, { hcc: string; label: string }> }).map;

/**
 * A registry whose "now" reads the injectable @/lib/clock, so the bound value-set
 * version resolves deterministically at check time (tests use clock.setClock).
 */
const clockRegistry: ValueSetRegistry = createValueSetRegistry({ now: () => clock.nowDate() });

/**
 * Consult the registry for the ACTIVE version of the asset governing `systemUri`,
 * so a classified code carries WHICH value-set version it was resolved against.
 */
function bindingForSystemUri(registry: ValueSetRegistry, systemUri: string | undefined): CodeAssetBinding | undefined {
  if (!systemUri) return undefined;
  const active = registry.getActiveBySystem(systemUri);
  if (!active) return undefined;
  return {
    assetId: active.id,
    version: active.version,
    status: active.status,
    current: registry.isCurrent(active.id),
  };
}

/** Options for a seeded terminology service (clock/registry injection for determinism). */
export interface SeedTerminologyOptions {
  /** The registry answering the bound-version question. */
  registry?: ValueSetRegistry;
  /** A fixed clock for "current version at check time"; builds a pinned registry. */
  now?: () => Date;
}

/** Build a seeded terminology service over the in-repo allowlist. */
export function createSeedTerminologyService(opts: SeedTerminologyOptions = {}): TerminologyService {
  const registry: ValueSetRegistry =
    opts.registry ?? (opts.now ? createValueSetRegistry({ now: opts.now }) : clockRegistry);

  return {
    id: 'seed-terminology-allowlist',

    validateCode(system, code): CodeValidation {
      return validateCodeVersioned(system, code, { registry });
    },

    translate(code, sourceSystem: TerminologySystem, targetSystem: TerminologySystem): TranslationResult {
      const key = `${sourceSystem}->${targetSystem}`;
      const map = DATA.conceptMap[key];
      const target = map ? (map[code] ?? null) : null;
      return {
        sourceSystem,
        sourceCode: code,
        targetSystem,
        targetCode: target,
        matched: target !== null,
        stub: true,
      };
    },

    classify(code, scheme: ClassificationScheme, valueSetId?: string): ClassificationResult {
      if (scheme === 'HCC') {
        const binding = bindingForSystemUri(registry, SYSTEM_URIS.HCC);
        const raw = HCC_MAP[code];
        if (raw) {
          return { scheme, code, group: raw.hcc, label: raw.label, classified: true, stub: true, binding };
        }
        return { scheme, code, group: null, classified: false, stub: true, binding };
      }
      // value-set membership
      const members = valueSetId ? (DATA.valueSets[valueSetId] ?? null) : null;
      if (members) {
        const inSet = members.includes(code);
        return {
          scheme,
          code,
          group: inSet ? valueSetId! : null,
          label: inSet ? `member of ${valueSetId}` : undefined,
          classified: inSet,
          stub: true,
        };
      }
      return { scheme, code, group: null, classified: false, stub: true };
    },
  };
}

/** The process-default seeded terminology service (clock-injected registry). */
export const seedTerminologyService: TerminologyService = createSeedTerminologyService();
