/**
 * COMPILE-TIME negative test (Guardrail 3): PHI cannot be constructed into a ModelInput.
 * tsc typechecks this file (it is intentionally NOT a vitest *.test.ts). The @ts-expect-error
 * asserts the PHI-bearing object is NOT assignable to ModelInput; if the type barrier ever
 * regressed and the object DID compile, tsc fails on the now-unused @ts-expect-error.
 * A green `tsc --noEmit` therefore proves the PHI barrier holds.
 */
import { policyTextInput, type ModelInput } from '@/lib/policy/audit/modelClient';

// prettier-ignore
// @ts-expect-error — a plain object carrying member/PHI fields is not a branded ModelInput.
export const leak: ModelInput = { inputClass: 'policy-text-only', text: 'x', memberId: 'M1', diagnoses: ['E66.01'] };

// The only legitimate construction path — policy text, no PHI.
export const safe: ModelInput = policyTextInput('policy text only, no PHI');
