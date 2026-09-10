import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { runIntake, planIntake } from '@/lib/cdp-intake/coordinator';
import type { IntakeDispatch, SourceLoadOutcome } from '@/lib/cdp-intake/types';
import type { IngestBundleResult } from '@/lib/runtime/ingestBundle';

const DIR = join(process.cwd(), 'src', 'lib', 'cdp-intake', 'sample-sources');

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
    // Seeded population: 5 FHIR bundles, one per demo patient.
    expect(res.receipt.files).toHaveLength(5);
    expect(res.outcomes).toHaveLength(5);
    // Each FHIR bundle admits coverage1 + conditions2 + observation1 = 4; 5 bundles = 20.
    expect(res.totals.loaded).toBe(20);
    expect(res.totals.quarantined).toBe(0);
    // attribution is authoritative: each outcome carries its real filename.
    const maria = res.outcomes.find((o) => o.file === 'sd-medicaid-mmis.maria.fhir.json');
    expect(maria?.sourceSystem).toBe('SD_MEDICAID_MMIS');
  });

  it('orders anchor-first and by source (deterministic)', async () => {
    const res = await runIntake(DIR, dispatch);
    // All batch; BENNETT_COUNTY_EHR sorts before the other source systems.
    expect(res.outcomes[0].sourceSystem).toBe('BENNETT_COUNTY_EHR');
  });

  it('planIntake routes each file to the fhir door without ingesting', () => {
    const { plan } = planIntake(DIR);
    // Every seeded source is a FHIR bundle -> the fhir door.
    expect(plan).toHaveLength(5);
    expect(plan.every((p) => p.door === 'fhir')).toBe(true);
  });
});
