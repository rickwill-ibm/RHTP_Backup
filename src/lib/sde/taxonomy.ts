// CONTRACT: C10
/**
 * Signal taxonomy loader + lookup. The taxonomy is DATA (data/signal-taxonomy.json)
 * validated at load; a deployment tunes the file, the engine reads it. The map
 * from a C2 event type to a signal kind lives here, so intake keys on nothing
 * persona-specific — every mapping is a taxonomy row.
 */
import taxonomyJson from './data/signal-taxonomy.json';
import { parseTaxonomy } from './schema';
import type { SignalTaxonomy, TaxonomyEntry } from './types';

let cached: SignalTaxonomy | null = null;

/** The default taxonomy, parsed + validated once (refuses loudly if invalid). */
export function defaultTaxonomy(): SignalTaxonomy {
  if (!cached) cached = parseTaxonomy(taxonomyJson);
  return cached;
}

/** Parse an arbitrary taxonomy object (a tuned pack); does not touch the cache. */
export function loadTaxonomy(raw: unknown): SignalTaxonomy {
  return parseTaxonomy(raw);
}

/** Build an index from C2 sourceEventType -> entry, and from signalType -> entry. */
export function indexTaxonomy(tax: SignalTaxonomy): {
  bySourceEvent: Map<string, TaxonomyEntry>;
  bySignalType: Map<string, TaxonomyEntry>;
} {
  const bySourceEvent = new Map<string, TaxonomyEntry>();
  const bySignalType = new Map<string, TaxonomyEntry>();
  for (const e of tax.entries) {
    bySignalType.set(e.signalType, e);
    for (const src of e.sourceEventTypes) bySourceEvent.set(src, e);
  }
  return { bySourceEvent, bySignalType };
}

/** Fill a dedupe-key template with the available params; unknown tokens -> "na". */
export function fillDedupeKey(
  template: string,
  params: Record<string, string | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = params[key];
    return v === undefined || v === '' ? 'na' : v;
  });
}
