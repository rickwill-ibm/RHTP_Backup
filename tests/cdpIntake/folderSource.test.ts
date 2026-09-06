import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFolder, readManifest } from '@/lib/cdp-intake/folderSource';

const DIR = join(process.cwd(), 'src', 'lib', 'cdp-intake', 'sample-sources');

describe('cdp-intake/folderSource', () => {
  it('reads source files verbatim and skips the manifest', () => {
    const names = readFolder(DIR).map((f) => f.file);
    expect(names).toContain('member.fhir.json');
    expect(names).toContain('eligibility.834.txt');
    expect(names).not.toContain('index.json');
  });

  it('returns non-empty payloads with byte sizes', () => {
    const files = readFolder(DIR);
    expect(files.every((f) => f.text.length > 0 && f.bytes > 0)).toBe(true);
  });

  it('reads the manifest', () => {
    const m = readManifest(DIR);
    expect(m?.sources.length).toBe(2);
    expect(m?.sources.map((s) => s.sourceSystem)).toContain('SD_MEDICAID_MMIS');
  });
});
