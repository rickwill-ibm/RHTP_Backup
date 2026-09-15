/**
 * Feature flags (plan ┬º7). Gates slices so incomplete work never ships hot.
 * Reads NEXT_PUBLIC_* so flags are readable on client + server (they are not secrets).
 */
export type FeatureFlag =
  | 'patientAccess'
  | 'providerAccess'
  | 'payerToPayer'
  | 'priorAuth'
  | 'aiDtrGeneration'
  | 'goldenThread'
  | 'goldenThreadE2E'
  | 'networkAdequacy'
  | 'richCrdDtr';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  patientAccess: true,
  providerAccess: true,
  payerToPayer: true,
  priorAuth: true,
  aiDtrGeneration: false, // off until human-review gate is wired (Slice 5)
  goldenThread: true, // Financial Clearance thread (GT-*) -- demoable on mock data
  goldenThreadE2E: true, // order→cash continuation — wired in (waves 1-13.1); env NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E=false to disable
  networkAdequacy: true, // Network adequacy analytics + analyst copilot (NA-*)
  richCrdDtr: true, // Da Vinci-conformant CRD/DTR runtime screens; classic views are the fallback
};

const ENV_KEY: Record<FeatureFlag, string> = {
  patientAccess: 'NEXT_PUBLIC_FLAG_PATIENT_ACCESS',
  providerAccess: 'NEXT_PUBLIC_FLAG_PROVIDER_ACCESS',
  payerToPayer: 'NEXT_PUBLIC_FLAG_PAYER_TO_PAYER',
  priorAuth: 'NEXT_PUBLIC_FLAG_PRIOR_AUTH',
  aiDtrGeneration: 'NEXT_PUBLIC_FLAG_AI_DTR',
  goldenThread: 'NEXT_PUBLIC_FLAG_GOLDEN_THREAD',
  goldenThreadE2E: 'NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E',
  networkAdequacy: 'NEXT_PUBLIC_FLAG_NETWORK_ADEQUACY',
  richCrdDtr: 'NEXT_PUBLIC_FLAG_RICH_CRD_DTR',
};

export function flag(name: FeatureFlag): boolean {
  const raw = process.env[ENV_KEY[name]];
  if (raw === undefined) return DEFAULTS[name];
  return raw.toLowerCase() === 'true';
}
