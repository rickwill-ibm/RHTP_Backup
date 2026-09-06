// cdp-intake/folderSource.ts — read a source folder (default: the seed dir).
//
// Node-only (server): reads raw files verbatim and the optional index.json manifest.
// Deterministic ordering (sorted). Skips dotfiles, the manifest itself, and seed
// OUTPUTS (patientRegistry / *.seed.json) so the loader never re-ingests its own
// product. This module is never imported by client code.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FileEntry, IntakeManifest } from './types';

/** Names that are never source inputs (manifest, dotfiles, seed outputs). */
function isSkippable(name: string): boolean {
  if (name.startsWith('.')) return true;
  if (name === 'index.json') return true;
  if (/\.seed\.json$/i.test(name)) return true;
  if (/^patientRegistry/i.test(name)) return true;
  return false;
}

export function readFolder(dir: string): FileEntry[] {
  const names = readdirSync(dir)
    .filter((n) => !isSkippable(n))
    .sort();
  const out: FileEntry[] = [];
  for (const file of names) {
    const path = join(dir, file);
    const st = statSync(path);
    if (!st.isFile()) continue;
    out.push({ file, path, bytes: st.size, text: readFileSync(path, 'utf8') });
  }
  return out;
}

export function readManifest(dir: string): IntakeManifest | null {
  try {
    const raw = readFileSync(join(dir, 'index.json'), 'utf8');
    const parsed = JSON.parse(raw) as IntakeManifest;
    return Array.isArray(parsed.sources) ? parsed : null;
  } catch {
    return null; // no manifest — classifier falls back to filename heuristics
  }
}
