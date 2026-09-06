import { describe, it, expect } from 'vitest';
import { classify, isUnclassified } from '@/lib/cdp-intake/classifier';
import type { FileEntry, IntakeManifest } from '@/lib/cdp-intake/types';

const files: FileEntry[] = [
  { file: 'm.fhir.json', path: '/x/m', bytes: 2, text: '{}' },
  { file: 'e.834.txt', path: '/x/e', bytes: 3, text: 'ISA' },
  { file: 'weird.dat', path: '/x/w', bytes: 1, text: '?' },
];

const manifest: IntakeManifest = {
  sources: [
    {
      file: 'm.fhir.json',
      sourceSystem: 'EHR',
      format: 'fhir-json',
      adapter: 'fhir-bundle',
      arrivalMode: 'batch',
    },
    {
      file: 'e.834.txt',
      sourceSystem: 'MMIS',
      format: 'x12-834',
      adapter: 'eligibility834',
      arrivalMode: 'batch',
    },
  ],
};

describe('cdp-intake/classifier', () => {
  it('treats the manifest as authoritative for sourceSystem', () => {
    const c = classify(files, manifest);
    expect(c.find((x) => x.file === 'm.fhir.json')?.sourceSystem).toBe('EHR');
    expect(c.find((x) => x.file === 'e.834.txt')?.adapter).toBe('eligibility834');
  });

  it('falls back to filename heuristics; an unknown shape is unclassified', () => {
    const c = classify(files, null);
    expect(c.find((x) => x.file === 'm.fhir.json')?.format).toBe('fhir-json');
    const weird = c.find((x) => x.file === 'weird.dat');
    expect(weird).toBeDefined();
    expect(isUnclassified(weird!)).toBe(true);
  });
});
