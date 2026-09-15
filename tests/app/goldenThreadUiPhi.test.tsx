// @vitest-environment jsdom
/**
 * Golden-thread UI — PHI-in-DOM negative test (Wave-5, adversarial-before Finding 4).
 *
 * The page passes EvidenceTimeline a MASKED record (`id: 'evidence-record'`) because
 * the real record id embeds a member reference (`ev-<memberId>-…`). This test proves
 * the masking is sufficient: rendering the timeline with a masked record whose ENTRIES
 * still carry the real (member-embedding) entry ids leaks NO member reference into the
 * DOM or the aria-label — and, as a guard, that an UNMASKED record WOULD leak (so the
 * masking is load-bearing, not decorative).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { EvidenceTimeline } from '@/components/goldenThread/EvidenceTimeline';
import { createEvidenceRecord } from '@/lib/evidence';

const MEMBER = 'MARIA_SD_001';

function recordFor(id: string) {
  return createEvidenceRecord({
    id,
    memberId: MEMBER,
    order: { code: '72148' },
    createdAt: '2026-08-30T00:00:00.000Z',
  });
}

afterEach(cleanup);

describe('golden-thread UI — PHI masking', () => {
  it('leaks no member reference when the record id is masked before the timeline', () => {
    const real = recordFor(`ev-${MEMBER}-72148-1756512000000`);
    const masked = { ...real, id: 'evidence-record' };
    const { container } = render(<EvidenceTimeline record={masked} />);
    expect(container.innerHTML).not.toContain(MEMBER);
    // The aria-label uses the masked id.
    expect(container.querySelector('[aria-label*="evidence-record"]')).toBeTruthy();
  });

  it('confirms the masking is load-bearing: an UNMASKED record would leak the member id', () => {
    const real = recordFor(`ev-${MEMBER}-72148-1756512000000`);
    const { container } = render(<EvidenceTimeline record={real} />);
    // Documents the leak the page's masking prevents (guards against a regression that
    // drops the mask).
    expect(container.innerHTML).toContain(MEMBER);
  });
});
