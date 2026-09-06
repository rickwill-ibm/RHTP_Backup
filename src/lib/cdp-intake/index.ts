// cdp-intake/index.ts — public surface of the (deletable) CDP intake layer.
//
// Delete this folder + remove the one flag-guarded mount to revert the feature.
// Nothing in pipeline/identity/runtime imports this barrel (CI guard enforces it).

export type {
  ArrivalMode,
  IntakeManifest,
  IntakeManifestEntry,
  FileEntry,
  ClassifiedFile,
  IntakeReceipt,
  SourceLoadOutcome,
  IntakeDispatch,
  IntakeTotals,
  IntakeRunResult,
} from './types';

export {
  registerFormat,
  formatSpec,
  formatForFilename,
  allFormats,
  type FormatSpec,
} from './formatRegistry';

export { readFolder, readManifest } from './folderSource';
export { classify, isUnclassified } from './classifier';
export { sha256, buildReceipt } from './receipt';
export {
  runIntake,
  planIntake,
  type RunIntakeOptions,
  type IntakePlan,
  type IntakePlanItem,
} from './coordinator';
