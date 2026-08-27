/**
 * S1 — provenance registry + content cross-check (Guardrail 5). A source's provenanceClass
 * requires an explicit governed registry entry AND an independent content check: an
 * unregistered source is `blocked` (never defaulted), and a document whose content bears a
 * sample/placeholder/watermark marker is downgraded (or, if the registry claims it is
 * authoritative, quarantined as a conflict). Only `authoritative` may later back a live
 * decision (enforced at the loadPromoted choke point).
 */
import type { ProvenanceClass } from '../anchor/verify';

export interface SourceRegistryEntry {
  sourceId: string;
  provenanceClass: ProvenanceClass; // declared class
  publisher?: string; // for authoritative sources: the verified publisher/host
}

const SAMPLE_MARKERS: readonly RegExp[] = [
  /\bsample\b/i,
  /\bfor illustration\b/i,
  /\bplaceholder\b/i,
  /\bspecimen\b/i,
  /\bdo not use\b/i,
  /\bwatermark\b/i,
];

/** True if the content self-identifies as sample/placeholder (independent of the registry). */
export function contentLooksSample(text: string): boolean {
  return SAMPLE_MARKERS.some((re) => re.test(text));
}

export type ProvenanceResolution =
  | { class: ProvenanceClass; sourceId: string; reason: 'registry' | 'content-downgrade' }
  | { class: 'blocked'; sourceId: string; reason: 'unregistered' | 'content-conflict' };

/**
 * Resolve the effective provenanceClass for a source + its content.
 * - unregistered → blocked (never a silent default)
 * - registry says authoritative but content looks sample → blocked (conflict / quarantine)
 * - content looks sample and registry is not synthetic → downgrade to sample
 * - otherwise → the registry class
 */
export function resolveProvenanceClass(
  sourceId: string,
  content: string,
  registry: Map<string, SourceRegistryEntry>
): ProvenanceResolution {
  const entry = registry.get(sourceId);
  if (!entry) return { class: 'blocked', sourceId, reason: 'unregistered' };
  const looksSample = contentLooksSample(content);
  if (entry.provenanceClass === 'authoritative' && looksSample) {
    return { class: 'blocked', sourceId, reason: 'content-conflict' };
  }
  if (looksSample && entry.provenanceClass !== 'synthetic') {
    return { class: 'sample', sourceId, reason: 'content-downgrade' };
  }
  return { class: entry.provenanceClass, sourceId, reason: 'registry' };
}
