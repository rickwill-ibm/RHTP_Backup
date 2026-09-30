import { describe, it, expect } from 'vitest';
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import {
  projectThreadInputs,
  coverageToInfo,
  providerNpiFrom,
} from '@/lib/goldenThread/fromFhirBundle';
import { createInMemoryEvidenceStore } from '@/lib/evidence/evidenceStore';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource, emptyGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { StageOrder } from '@/lib/goldenThread';

/** #1 — orchestrator + persistence + FHIR projection. */
const lib = loadMockLibrary();
const TS = '2026-07-26T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';

function inputs(providerNpi: string): ThreadInputs {
  const member: MemberContext = { memberId: 'MARIA_SD_001', diagnoses: [] };
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar',
    providerNpi,
    payer: PAYER,
  };
  return { member, order, coverage: { status: 'active', payer: PAYER, plan: 'Texas STAR' } };
}
function deps(store = createInMemoryEvidenceStore(), goldCardSource = mockGoldCardDataSource) {
  return {
    library: lib,
    goldCardSource,
    denialRates: mockDenialRateProvider,
    store,
    ts: TS,
    ids: {
      evidence: 'ev1',
      determination: 'd',
      goldCard: 'g',
      propensity: 'p',
      eligibility: 'e',
      estimation: 'x',
    },
  };
}

describe('Orchestrator — full thread + evidence persistence', () => {
  it('runs a non-gold-carded order → PA required, persists a 5-entry record', async () => {
    const store = createInMemoryEvidenceStore();
    const r = await runFinancialClearance(inputs('1518998765'), deps(store));
    expect(r.netRequiresPA).toBe(true);
    expect(r.summary.netOutcome).toBe('pa-required-list');
    expect(r.evidence.entries.length).toBe(5); // det + gc + propensity + eligibility + estimation
    expect(r.workItem.queue).toBe('ready-to-submit'); // PA required, medium propensity
    expect(['low', 'medium', 'high']).toContain(r.medicalNecessity.propensity.band);
    const persisted = await store.get('ev1');
    expect(persisted?.id).toBe('ev1');
    expect(persisted?.entries.length).toBe(5);
  });

  it('runs a gold-carded order → PA waived, auto-cleared queue', async () => {
    const r = await runFinancialClearance(inputs('1730154782'), deps());
    expect(r.netRequiresPA).toBe(false);
    expect(r.summary.netOutcome).toBe('pa-exempt-gold-card');
    expect(r.workItem.queue).toBe('auto-cleared');
    expect(r.eligibility.note).toMatch(/gold-carded/i);
  });

  it('with an empty gold-card source, the same provider needs PA', async () => {
    const r = await runFinancialClearance(
      inputs('1730154782'),
      deps(createInMemoryEvidenceStore(), emptyGoldCardDataSource)
    );
    expect(r.netRequiresPA).toBe(true);
  });
});

describe('FHIR projection', () => {
  it('projects Condition + ServiceRequest + Coverage into thread inputs', () => {
    const projected = projectThreadInputs({
      memberId: 'P1',
      conditions: [
        {
          code: {
            coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I42.0' }],
            text: 'Cardiomyopathy',
          },
        },
      ],
      serviceRequest: {
        code: {
          coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '75561' }],
          text: 'Cardiac MRI',
        },
        requester: { identifier: { value: '1730154782' } },
      },
      coverage: { status: 'active', payor: [{ display: 'UHC' }], type: { text: 'Medicaid' } },
    });
    expect(projected.order.code).toBe('75561');
    expect(projected.order.providerNpi).toBe('1730154782');
    expect(projected.coverage.payer).toBe('UHC');
    expect(projected.member.diagnoses[0].code).toBe('I42.0'); // ICD-10 surfaced
  });

  it('coverageToInfo + providerNpiFrom handle missing data', () => {
    expect(coverageToInfo(undefined).status).toBe('unknown');
    expect(providerNpiFrom(undefined, 'fallback')).toBe('fallback');
  });
});
