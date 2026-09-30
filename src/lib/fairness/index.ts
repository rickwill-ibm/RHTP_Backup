// CONTRACT: C-FAIRNESS
/**
 * 45 CFR 92.210 identification and mitigation — public surface.
 *
 * The record is EVIDENCE of reasonable efforts, not a thing the rule requires: OCR declined to
 * mandate documentation and encourages written policies and procedures, while its enforcement
 * factors include whether a methodology or process exists for evaluating a tool. Read `types.ts`
 * for what the adversarial-BEFORE round changed about this design and why — in particular why the
 * unit of regulation is the INPUT VARIABLE and not the agent.
 */
export type {
  ProtectedBasis,
  Directness,
  ToolScope,
  IdentifiedInput,
  Mitigation,
  FairnessLockEntry,
  FairnessLockFile,
} from './types';
export { PROTECTED_BASES, FairnessLockError } from './types';
export {
  parseFairnessLock,
  assertEntryComplete,
  assertFieldsIdentified,
  mitigationCurrency,
  MITIGATION_REVIEW_INTERVAL_MS,
} from './assertFairnessLock';
export { default as fairnessLockData } from './data/fairness-lock.json';
export { ENGINE_READ_FIELDS, loadFairnessLock } from './engineFields';
