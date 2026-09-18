// demoScenario.ts — the configured demo order-to-cash SCENARIO (the order threaded through the
// Golden Thread demo). Env-overridable so the scenario is a config change, not a code edit — and
// so no record literals live in the screens. The demo MEMBER is resolved separately at the screen
// (getSessionPatient() ?? DEMO_MEMBER_ID); this module is only the order + coverage context.
//
// A production/SMART-launched run resolves the member from the session; the order likewise comes
// from the launch context there. These defaults are the offline-demo scenario.

/** Deterministic timestamp so the evidence id is stable across renders (not a record value). */
export const DEMO_THREAD_TS: string =
  process.env.NEXT_PUBLIC_DEMO_THREAD_TS ?? '2026-08-30T00:00:00.000Z';

/** The demo order + coverage context. Every field is env-overridable. */
export const DEMO_SCENARIO = {
  orderCode: process.env.NEXT_PUBLIC_DEMO_ORDER_CODE ?? '72148',
  orderDisplay: process.env.NEXT_PUBLIC_DEMO_ORDER_DISPLAY ?? 'MRI lumbar spine w/o contrast',
  orderCodeSystem: 'CPT',
  payer: process.env.NEXT_PUBLIC_DEMO_PAYER ?? 'UnitedHealthcare Community Plan',
  plan: process.env.NEXT_PUBLIC_DEMO_PLAN ?? 'Texas STAR',
  coverageType: 'Medicaid managed care',
  providerNpi: process.env.NEXT_PUBLIC_DEMO_PROVIDER_NPI ?? '1518998765',
} as const;
