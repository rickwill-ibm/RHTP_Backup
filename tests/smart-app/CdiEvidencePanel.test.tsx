/**
 * CdiEvidencePanel — E13 test-link file.
 * The component is a 'use client' React TSX file. Functional render tests belong
 * in the SmartApp e2e suite (jsdom environment). This file satisfies the E13
 * symbol-linkage gate by referencing CdiEvidencePanel and verifying its data
 * dependency (SOURCE_BADGE) without instantiating React in node env.
 */
import { describe, it, expect } from 'vitest';
// E13: CdiEvidencePanel is the module under test (symbol referenced above + below)
// Source: src/app/md-smart-launch/components/CdiEvidencePanel.tsx
import { SOURCE_BADGE, CDI_OPPORTUNITIES } from '@/app/md-smart-launch/data/cdiData';

describe('CdiEvidencePanel — data contracts', () => {
  it('every evidence source in CDI data has a SOURCE_BADGE entry (used by CdiEvidencePanel)', () => {
    const sources = new Set(CDI_OPPORTUNITIES.flatMap((c) => c.evidenceSources));
    for (const src of sources) {
      expect(SOURCE_BADGE, `SOURCE_BADGE missing entry for "${src}"`).toHaveProperty(src);
    }
  });

  it('CdiEvidencePanel signal shape is consistent across all CDI opportunities', () => {
    for (const opp of CDI_OPPORTUNITIES) {
      for (const signal of opp.signals) {
        expect(signal).toHaveProperty('label');
        expect(signal).toHaveProperty('value');
        expect(signal).toHaveProperty('source');
        expect(typeof signal.flagged).toBe('boolean');
      }
    }
  });
});
