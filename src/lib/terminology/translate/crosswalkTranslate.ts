/**
 * Crosswalk $translate - the real-now cross-map over SEEDED crosswalks (Wave B).
 *
 * Implements FHIR ConceptMap $translate semantics over the in-repo crosswalk seed:
 * ICD-10-CM <-> CMS-HCC and SNOMED-CT <-> ICD-10-CM. Given a source coding it
 * returns the target coding(s) with the crosswalk asset id + version. A source code
 * with no seeded entry returns NO-MAP (empty targets) and NEVER a fabricated target.
 *
 * Mode (via the SAME `terminology` dataMode seam, not a second one):
 * mock / seeded -> this seeded crosswalk translator (demo stays green).
 * production -> the not-configured live crosswalk service, which THROWS
 * TerminologyServiceNotConfiguredError so a live-only $translate
 * fails closed rather than returning a guessed map.
 */
import { getDataMode, type DataMode } from '@/lib/config/dataMode';
import { TerminologyServiceNotConfiguredError, type TerminologySystem } from '../types';
import crosswalkSeed from './data/crosswalks.json';
import type {
  CrosswalkProvenance,
  CrosswalkTarget,
  CrosswalkTranslation,
  CrosswalkTranslator,
} from './types';

interface SeedCrosswalk {
  id: string;
  name: string;
  sourceSystem: TerminologySystem;
  targetSystem: TerminologySystem;
  assetId: string;
  version: string;
  steward: string;
  sourceUrl: string;
  stub: boolean;
  map: Record<string, CrosswalkTarget[]>;
}

interface SeedShape {
  crosswalks: SeedCrosswalk[];
}

const DATA = crosswalkSeed as unknown as SeedShape;

function pairKey(source: TerminologySystem, target: TerminologySystem): string {
  return `${source}->${target}`;
}

/** Index the seed by source->target system so a pair resolves in O(1). */
function indexBySystemPair(crosswalks: SeedCrosswalk[]): Map<string, SeedCrosswalk> {
  const index = new Map<string, SeedCrosswalk>();
  for (const cw of crosswalks) index.set(pairKey(cw.sourceSystem, cw.targetSystem), cw);
  return index;
}

function provenanceOf(cw: SeedCrosswalk): CrosswalkProvenance {
  return {
    crosswalkId: cw.id,
    name: cw.name,
    assetId: cw.assetId,
    version: cw.version,
    sourceSystem: cw.sourceSystem,
    targetSystem: cw.targetSystem,
  };
}

/** Build a crosswalk translator over a crosswalk set (defaults to the in-repo seed). */
export function makeCrosswalkTranslator(
  crosswalks: SeedCrosswalk[] = DATA.crosswalks
): CrosswalkTranslator {
  const index = indexBySystemPair(crosswalks);
  return {
    id: 'seed-crosswalk-translator',

    translate(sourceSystem, sourceCode, targetSystem): CrosswalkTranslation {
      const cw = index.get(pairKey(sourceSystem, targetSystem));
      if (!cw) {
        // No crosswalk covers this system pair at all: no-map, no fabricated target.
        return {
          sourceSystem,
          sourceCode,
          targetSystem,
          targets: [],
          matched: false,
          noMap: true,
          crosswalk: null,
          stub: true,
        };
      }
      const provenance = provenanceOf(cw);
      const targets = cw.map[sourceCode];
      if (!targets || targets.length === 0) {
        // Crosswalk exists but this source code is unmapped: NO-MAP, never a guess.
        return {
          sourceSystem,
          sourceCode,
          targetSystem,
          targets: [],
          matched: false,
          noMap: true,
          crosswalk: provenance,
          stub: true,
        };
      }
      // Stamp the declared target system on every returned coding.
      const stamped: CrosswalkTarget[] = targets.map((t) => ({
        system: targetSystem,
        code: t.code,
        display: t.display,
      }));
      return {
        sourceSystem,
        sourceCode,
        targetSystem,
        targets: stamped,
        matched: true,
        noMap: false,
        crosswalk: provenance,
        stub: true,
      };
    },

    listCrosswalks(): CrosswalkProvenance[] {
      return crosswalks.map(provenanceOf);
    },
  };
}

/** The process-default seeded crosswalk translator over the in-repo seed. */
export const seedCrosswalkTranslator: CrosswalkTranslator = makeCrosswalkTranslator();

/**
 * Live crosswalk $translate - the NOT-CONFIGURED production path. Throws
 * TerminologyServiceNotConfiguredError naming the ConceptMap $translate operation,
 * so a live-only translation fails closed (never a fabricated or seed-as-live map).
 */
export const liveCrosswalkTranslator: CrosswalkTranslator = {
  id: 'live-crosswalk-translator',
  translate(): CrosswalkTranslation {
    throw new TerminologyServiceNotConfiguredError('$translate (live ConceptMap crosswalk)');
  },
  listCrosswalks(): CrosswalkProvenance[] {
    throw new TerminologyServiceNotConfiguredError('$translate (live ConceptMap crosswalk)');
  },
};

/**
 * The crosswalk translator for the current `terminology` dataMode. Extends the SAME
 * seam as validateCode/classify: production selects the fail-closed live translator.
 */
export function selectCrosswalkTranslator(): CrosswalkTranslator {
  const mode: DataMode = getDataMode('terminology');
  return mode === 'production' ? liveCrosswalkTranslator : seedCrosswalkTranslator;
}
