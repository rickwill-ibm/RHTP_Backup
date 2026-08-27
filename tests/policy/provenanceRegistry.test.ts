/**
 * S1 provenance registry tests (Guardrail 5): unregistered sources are blocked, sample markers
 * downgrade, and a registry "authoritative" claim contradicted by sample content is quarantined.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveProvenanceClass,
  contentLooksSample,
  type SourceRegistryEntry,
} from '@/lib/policy/provenance/registry';

const registry = new Map<string, SourceRegistryEntry>([
  [
    'cms-ncd-100-1',
    { sourceId: 'cms-ncd-100-1', provenanceClass: 'authoritative', publisher: 'cms.gov' },
  ],
  ['horizon-sample', { sourceId: 'horizon-sample', provenanceClass: 'synthetic' }],
  ['vendor-demo', { sourceId: 'vendor-demo', provenanceClass: 'sample' }],
]);

describe('provenance registry', () => {
  it('blocks an unregistered source (never defaults)', () => {
    expect(resolveProvenanceClass('unknown', 'clean policy text', registry)).toMatchObject({
      class: 'blocked',
      reason: 'unregistered',
    });
  });

  it('accepts an authoritative source with clean content', () => {
    expect(
      resolveProvenanceClass('cms-ncd-100-1', 'Bariatric surgery covered when BMI >= 40.', registry)
    ).toMatchObject({
      class: 'authoritative',
      reason: 'registry',
    });
  });

  it('quarantines an "authoritative" source whose content says sample', () => {
    expect(
      resolveProvenanceClass(
        'cms-ncd-100-1',
        'This is a SAMPLE summary — placeholder text.',
        registry
      )
    ).toMatchObject({
      class: 'blocked',
      reason: 'content-conflict',
    });
  });

  it('keeps a synthetic source synthetic even with markers', () => {
    expect(
      resolveProvenanceClass('horizon-sample', 'sample summary, do not use', registry)
    ).toMatchObject({
      class: 'synthetic',
      reason: 'registry',
    });
  });

  it('downgrades a sample-declared source appropriately', () => {
    expect(resolveProvenanceClass('vendor-demo', 'for illustration only', registry).class).toBe(
      'sample'
    );
  });

  it('detects common sample/placeholder markers', () => {
    expect(contentLooksSample('This is a SAMPLE')).toBe(true);
    expect(contentLooksSample('placeholder text')).toBe(true);
    expect(contentLooksSample('Bariatric surgery is medically necessary')).toBe(false);
  });
});
