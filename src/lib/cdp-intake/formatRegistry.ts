// cdp-intake/formatRegistry.ts — the extensible format → adapter table.
//
// This is how new source formats (NCPDP, CDA/CCDA, X12 837/835/270-271, …) are added
// WITHOUT editing the pipeline's SourceFormat union or any adapter: register a spec
// here and the classifier + coordinator route it. Fail-closed by design — an unknown
// format resolves to no spec, so the coordinator routes it to quarantine rather than
// guessing.

import type { ArrivalMode } from './types';

export interface FormatSpec {
  /** Registry id — a SourceFormat value, or an extended id (e.g. 'ncpdp-script'). */
  format: string;
  /** Owning adapter/domain id, or 'fhir-bundle' for FHIR-JSON bundles. */
  adapter: string;
  arrivalMode: ArrivalMode;
  /** true → route through ingestFhir (bundle); false → route through runAdapter (raw). */
  isFhir: boolean;
  /** Filename suffix hints for heuristic fallback when no manifest entry exists. */
  extensions: string[];
}

const REGISTRY = new Map<string, FormatSpec>();

export function registerFormat(spec: FormatSpec): void {
  REGISTRY.set(spec.format, spec);
}
export function formatSpec(format: string): FormatSpec | undefined {
  return REGISTRY.get(format);
}
export function allFormats(): FormatSpec[] {
  return [...REGISTRY.values()];
}

/** Heuristic fallback: match a filename's suffix to a registered format. */
export function formatForFilename(name: string): FormatSpec | undefined {
  const lower = name.toLowerCase();
  for (const spec of REGISTRY.values()) {
    if (spec.extensions.some((ext) => lower.endsWith(ext))) return spec;
  }
  return undefined;
}

// ─── Seed: the four SourceFormats the pipeline already declares ──────────────────
// (Extended systems are registered by their own modules; these are the built-ins.)
registerFormat({
  format: 'fhir-json',
  adapter: 'fhir-bundle',
  arrivalMode: 'batch',
  isFhir: true,
  extensions: ['.fhir.json', '.bundle.json'],
});
registerFormat({
  format: 'x12-834',
  adapter: 'eligibility834',
  arrivalMode: 'batch',
  isFhir: false,
  extensions: ['.834', '.834.txt', '.x12'],
});
registerFormat({
  format: 'hl7v2-adt',
  adapter: 'adtEncounter',
  arrivalMode: 'stream',
  isFhir: false,
  extensions: ['.hl7', '.adt.hl7'],
});
registerFormat({
  format: 'flat-file-csv',
  adapter: 'cboSdoh',
  arrivalMode: 'batch',
  isFhir: false,
  extensions: ['.csv'],
});
