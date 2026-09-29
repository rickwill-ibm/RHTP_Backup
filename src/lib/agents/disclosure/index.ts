/**
 * Disclosure decision plane — public surface. Authority over a disclosure is
 * decided here, at runtime, per event; the authority lock caps agent capability
 * at build time. The two are deliberately separate planes.
 */
export { decideDisclosure } from './decide';
export { createDisclosureLedger, type DisclosureLedger } from './ledger';
export {
  DATA_CLASSES,
  PURPOSES_OF_USE,
  RECIPIENT_KINDS,
  DENIAL_REASONS,
  OBLIGATIONS,
  HEIGHTENED_BASIS_REQUIRED,
  type AgentCapability,
  type ConsentBasis,
  type DataClass,
  type DenialReason,
  type DisclosureDecision,
  type DisclosureOutcome,
  type DisclosureRequest,
  type Obligation,
  type PurposeOfUse,
  type Recipient,
  type RecipientKind,
} from './types';
