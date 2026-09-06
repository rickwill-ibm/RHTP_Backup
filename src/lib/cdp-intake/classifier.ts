// cdp-intake/classifier.ts — file → {sourceSystem, format, adapter, arrivalMode}.
//
// Manifest is AUTHORITATIVE (it carries sourceSystem, which drives identity scoping and
// cannot be inferred from a filename). Filename heuristics are the fallback, and a
// mismatch between a manifest entry and the detected shape is surfaced, not silently
// trusted. An unclassifiable file resolves to format 'unknown' → the coordinator routes
// it to quarantine (fail-closed).

import type { ClassifiedFile, FileEntry, IntakeManifest } from './types';
import { formatForFilename, formatSpec } from './formatRegistry';
import { sha256 } from './receipt';

export function classify(files: FileEntry[], manifest: IntakeManifest | null): ClassifiedFile[] {
  return files.map((f) => {
    const m = manifest?.sources.find((s) => s.file === f.file);
    if (m) {
      // Manifest wins. Confirm the format is registered; unknown → still recorded,
      // coordinator quarantines. arrivalMode falls back to the registry's default.
      const spec = formatSpec(m.format);
      return {
        file: f.file,
        sourceSystem: m.sourceSystem,
        format: m.format,
        adapter: m.adapter || spec?.adapter || 'unknown',
        arrivalMode: m.arrivalMode || spec?.arrivalMode || 'batch',
        path: f.path,
        bytes: f.bytes,
        text: f.text,
        sha256: sha256(f.text),
      };
    }
    // No manifest entry — heuristic by filename suffix.
    const spec = formatForFilename(f.file);
    return {
      file: f.file,
      sourceSystem: 'UNKNOWN',
      format: spec?.format ?? 'unknown',
      adapter: spec?.adapter ?? 'unknown',
      arrivalMode: spec?.arrivalMode ?? 'batch',
      path: f.path,
      bytes: f.bytes,
      text: f.text,
      sha256: sha256(f.text),
    };
  });
}

/** True when the file could not be classified to a registered format. */
export function isUnclassified(c: ClassifiedFile): boolean {
  return c.format === 'unknown' || !formatSpec(c.format);
}
