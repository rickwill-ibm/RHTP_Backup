import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { runIntake, planIntake } from '@/lib/cdp-intake/coordinator';
import type { IntakeDispatch, SourceLoadOutcome } from '@/lib/cdp-intake/types';
import type { IngestBundleResult } from '@/lib/runtime/ingestBundle';

const DIR = join(process.cwd(), 'src', 'lib', 'cdp-intake', 'sample-sources');

// Mock the two front doors. Only the fields the coordinator reads are populated;
// the rest of IngestBundleResult is satisfied via a cast (a test convenience).
const dispatch: IntakeDispatch = {
  async ingestFhir(_payload, sourceSystem): Promise<IngestBundleResult> {
    return {
      memberId: `MEM-${sourceSystem}`,
      held: false,
      admittedByDomain: { coverage: 1, conditions: 2, observation: 1 },
      quarantined: [],
      nonProjected: {},
      totalResources: 5,
      projection: { applied: 4, skipped: 0, members: 1 },
    } as unknown as IngestBundleResult;
  },
  async runAdapter(_adapter, sourceSystem): Promise<SourceLoadOutcome> {
    return {
      sourceSystem,
      file: '',
      memberId: `MEM-${sourceSystem}`,
      held: false,
      loaded: 1,
      quarantined: 0,
      byDomain: { coverage: 1 },
    };
  },
};

describe('cdp-intake/coordinator', () => {
  it('runs the folder through injected front doors and reconciles', async () => {
    const res = await runIntake(DIR, dispatch);
    expect(res.receipt.files).toHaveLength(2);
    expect(res.outcomes).toHaveLength(2);
    // fhir bundle admitted 4 + 834 adapter loaded 1
    expect(res.totals.loaded).toBe(5);
    expect(res.totals.quarantined).toBe(0);
    // attribution is authoritative: the 834 outcome carries its real filename
    const raw = res.outcomes.find((o) => o.sourceSystem === 'SD_MEDICAID_MMIS');
    expect(raw?.file).toBe('eligibility.834.txt');
  });

  it('orders anchor-first and by source (deterministic)', async () => {
    const res = await runIntake(DIR, dispatch);
    // BENNETT_COUNTY_EHR sorts before SD_MEDICAID_MMIS
    expect(res.outcomes[0].sourceSystem).toBe('BENNETT_COUNTY_EHR');
  });

  it('planIntake routes each file to the right door without ingesting', () => {
    const { plan } = planIntake(DIR);
    const fhir = plan.find((p) => p.file === 'member.fhir.json');
    const x12 = plan.find((p) => p.file === 'eligibility.834.txt');
    expect(fhir?.door).toBe('fhir');
    expect(x12?.door).toBe('adapter');
  });
});
