/**
 * Model client tests (S0) with red-team regressions: unformatted SSN and member refs are
 * blocked; structured PHI smuggled via a cast is caught by whole-input DLP and never reaches
 * the backend; a pre-call intent record means no model call without an audit record.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryLedger, type Ledger } from '@/lib/policy/audit/ledger';
import {
  auditedModelCall,
  policyTextInput,
  fixtureBackend,
  dlpScan,
  PhiBlockedError,
  type ModelInput,
} from '@/lib/policy/audit/modelClient';

const clock = () => '2026-01-01T00:00:00.000Z';

describe('audited model client', () => {
  it('routes a policy-text call: intent + record, output returned', async () => {
    const ledger = new InMemoryLedger(clock);
    const res = await auditedModelCall(
      { purpose: 'extract', input: policyTextInput('BMI >= 40 required') },
      fixtureBackend(),
      ledger,
      clock
    );
    expect(res.output.text).toContain('FIXTURE:');
    expect(res.record.inputClass).toBe('policy-text-only');
    const kinds = ledger.entries().map((e) => e.kind);
    expect(kinds).toEqual(['ModelCallIntent', 'ModelCallRecord']); // intent precedes the call
    expect(ledger.verify()).toEqual({ ok: true });
  });

  it('BLOCKS PHI and fails closed — records the block, no backend call', async () => {
    const ledger = new InMemoryLedger(clock);
    await expect(
      auditedModelCall(
        { purpose: 'extract', input: policyTextInput('criteria ... SSN 123-45-6789 ...') },
        fixtureBackend(),
        ledger,
        clock
      )
    ).rejects.toBeInstanceOf(PhiBlockedError);
    expect(ledger.entries()).toHaveLength(1); // only the blocked record; no intent, no call
    const body = ledger.entries()[0].body as { dlp: { blocked: boolean } };
    expect(body.dlp.blocked).toBe(true);
  });

  it('fails closed if the ledger cannot record (intent write throws)', async () => {
    const broken: Ledger = {
      append() {
        throw new Error('WORM unavailable');
      },
      entries: () => [],
      get: () => undefined,
      head: () => ({ count: 0, headHash: null }),
      verify: () => ({ ok: true }),
    };
    await expect(
      auditedModelCall(
        { purpose: 'p', input: policyTextInput('ok text') },
        fixtureBackend(),
        broken,
        clock
      )
    ).rejects.toThrow('WORM unavailable');
  });

  it('REGRESSION: blocks an UNFORMATTED / space-separated SSN', async () => {
    const ledger = new InMemoryLedger(clock);
    await expect(
      auditedModelCall(
        { purpose: 'p', input: policyTextInput('Member SSN 123456789 approved') },
        fixtureBackend(),
        ledger,
        clock
      )
    ).rejects.toBeInstanceOf(PhiBlockedError);
  });

  it('REGRESSION: blocks a member reference lacking the literal token "id"', async () => {
    const ledger = new InMemoryLedger(clock);
    await expect(
      auditedModelCall(
        { purpose: 'p', input: policyTextInput('member M12345 diagnosed with E66.01, CPT 43775') },
        fixtureBackend(),
        ledger,
        clock
      )
    ).rejects.toBeInstanceOf(PhiBlockedError);
  });

  it('REGRESSION: catches structured PHI smuggled via a cast (whole-input DLP)', async () => {
    const ledger = new InMemoryLedger(clock);
    const smuggled = {
      inputClass: 'no-phi',
      text: 'BMI >= 40',
      memberId: 'M12345',
      diagnoses: ['E66.01'],
    } as unknown as ModelInput;
    await expect(
      auditedModelCall({ purpose: 'p', input: smuggled }, fixtureBackend(), ledger, clock)
    ).rejects.toBeInstanceOf(PhiBlockedError);
  });

  it('dlpScan flags PHI shapes and clears clean policy text', () => {
    expect(dlpScan('SSN 123-45-6789').some((f) => f.kind === 'ssn')).toBe(true);
    expect(dlpScan('member id: M12345').some((f) => f.kind === 'member-id')).toBe(true);
    expect(dlpScan('bariatric surgery is medically necessary when BMI >= 40')).toHaveLength(0);
  });
});
