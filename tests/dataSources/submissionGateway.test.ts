import { describe, it, expect, afterEach } from 'vitest';
import { setSessionDataMode, clearSessionDataModes, DATA_MODE_SEAMS } from '@/lib/config/dataMode';
import {
  DataSourceNotConfiguredError,
  getSubmissionGatewayLoader,
  submitAppealMock,
} from '@/lib/dataSources';

const AS_OF = '2026-09-12T00:00:00.000Z';
const TASK = { claimId: 'claim-7', remittanceId: 'rem-7', authId: 'auth-7' };

afterEach(() => clearSessionDataModes());

describe('submission gateway seam (Wave-4 fail-closed EDI stub)', () => {
  it('registers the submissionGateway seam', () => {
    expect(DATA_MODE_SEAMS).toContain('submissionGateway');
  });

  it('seeded mode returns a MOCK, not-transmitted receipt (honest end-to-end)', async () => {
    const gateway = await getSubmissionGatewayLoader().load(AS_OF);
    expect(gateway.asOf).toBe(AS_OF);
    const receipt = gateway.submitAppeal(TASK);
    expect(receipt.channel).toBe('mock');
    expect(receipt.transmitted).toBe(false);
    // FIX-1 (PHI-in-DOM): the ref is keyed on the payer remittance id (a PHI-safe correlation
    // anchor) + a non-reversible sha256 token of the claim — the claimId (which can be a
    // member-embedding evidence id in the demo) is NEVER placed raw in the rendered ref.
    expect(receipt.submissionRef).toBe('appeal-mock::rem-7::c-42a451505c9d');
    expect(receipt.submissionRef).toContain('rem-7'); // still useful as a correlation reference
    expect(receipt.submissionRef).not.toContain('claim-7'); // claim ref not embedded raw
  });

  it('submitAppealMock is deterministic (same task → same submissionRef, no wall-clock/random)', () => {
    const a = submitAppealMock(TASK);
    const b = submitAppealMock(TASK);
    expect(a).toEqual(b);
    expect(a.transmitted).toBe(false);
  });

  it('production mode throws DataSourceNotConfiguredError (no plausible-but-fake transmission)', async () => {
    setSessionDataMode('submissionGateway', 'production');
    await expect(getSubmissionGatewayLoader().load(AS_OF)).rejects.toThrow(
      DataSourceNotConfiguredError
    );
  });
});
