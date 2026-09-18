/**
 * Real data-source adapters (O-2) — public surface.
 *
 * Three seams, one shape each: a normalized output type, a seeded loader backed
 * by a data/*.json file, and a production stub that throws until wired. Each
 * seam id is registered in the dataMode registry (lib/config/dataMode.ts):
 * goldCardRoster, denialRateFeed, providerDirectory.
 */
export { DataSourceNotConfiguredError, type DataSourceLoader } from './common';

export {
  getGoldCardRosterLoader,
  normalizeGoldCardRoster,
  seededGoldCardRosterLoader,
  productionGoldCardRosterLoader,
  type GoldCardRoster,
  type NormalizedGoldCard,
  type NormalizedPaHistory,
} from './goldCardRoster';

export {
  getDenialRateFeedLoader,
  normalizeDenialRateFeed,
  lookupDenialRate,
  seededDenialRateFeedLoader,
  productionDenialRateFeedLoader,
  type DenialRateFeed,
  type NormalizedDenialRate,
} from './denialRateFeed';

export {
  getProviderDirectoryLoader,
  normalizeProviderDirectory,
  seededProviderDirectoryLoader,
  productionProviderDirectoryLoader,
  type ProviderDirectory,
  type NormalizedDirectoryProvider,
  type ProviderStatus,
} from './providerDirectory';

export {
  getRemittanceGatewayLoader,
  normalizeRemittanceAdvice,
  seededRemittanceGatewayLoader,
  productionRemittanceGatewayLoader,
  type RemittanceAdvice,
  type Normalized835,
  type RemittanceAdjustment,
  type AdjustmentGroup,
} from './remittanceGateway';

export {
  getContractRepositoryLoader,
  normalizeFeeSchedule,
  seededContractRepositoryLoader,
  productionContractRepositoryLoader,
  type FeeSchedule,
  type ContractedRate,
} from './contractRepository';

export {
  getSubmissionGatewayLoader,
  submitAppealMock,
  seededSubmissionGatewayLoader,
  productionSubmissionGatewayLoader,
  type SubmissionGateway,
  type SubmissionReceipt,
  type AppealSubmissionTask,
} from './submissionGateway';
