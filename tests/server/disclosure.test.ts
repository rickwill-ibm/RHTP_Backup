/**
 * HW2-B / I23 — accounting of disclosures + retention (AUD-10).
 */
import { describe, it, expect } from 'vitest';
import {
  createMemoryDisclosureLog,
  isAccountable,
  DISCLOSURE_RETENTION_MS,
} from '../../src/lib/server/disclosure';

describe('accounting of disclosures', () => {
  it('records and returns a member accounting, newest first', async () => {
    const log = createMemoryDisclosureLog();
    await log.record({ memberId: 'm1', recipient: 'Org/a', resourceRef: 'Patient/m1', purpose: 'break-glass', tsMs: 100, actor: 'x', correlationId: 'c' });
    await log.record({ memberId: 'm1', recipient: 'Org/b', resourceRef: 'Patient/m1', purpose: 'required-by-law', tsMs: 200, actor: 'x', correlationId: 'c' });
    await log.record({ memberId: 'm2', recipient: 'Org/c', resourceRef: 'Patient/m2', purpose: 'public-health', tsMs: 150, actor: 'x', correlationId: 'c' });
    const acct = await log.accountingFor('m1');
    expect(acct.map((d) => d.recipient)).toEqual(['Org/b', 'Org/a']); // newest first
    expect(await log.accountingFor('m2')).toHaveLength(1);
  });

  it('classifies accountable vs exempt purposes per HIPAA', () => {
    expect(isAccountable('break-glass')).toBe(true);
    expect(isAccountable('required-by-law')).toBe(true);
    expect(isAccountable('public-health')).toBe(true);
    expect(isAccountable('treatment')).toBe(false);
    expect(isAccountable('payment')).toBe(false);
    expect(isAccountable('operations')).toBe(false);
  });

  it('flags records past the 6-year retention as purgeable (never auto-deletes)', async () => {
    const log = createMemoryDisclosureLog();
    await log.record({ memberId: 'm1', recipient: 'Org/a', resourceRef: 'Patient/m1', purpose: 'break-glass', tsMs: 0, actor: 'x', correlationId: 'c' });
    expect(await log.purgeable(DISCLOSURE_RETENTION_MS - 1)).toHaveLength(0);
    expect(await log.purgeable(DISCLOSURE_RETENTION_MS + 1)).toHaveLength(1);
  });
});
