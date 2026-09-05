/**
 * episodes — external episode-analytics ingestion seam (ETG grouper + measure output).
 *
 * getEpisodeAnalyticsView() resolves the `episodes` dataMode seam:
 *   mock / seeded → the authored demo analytics (screen preserved EXACTLY, parity #4);
 *   production    → the external grouper/measure feed, via a REGISTERED loader, or fail
 *                   CLOSED (never a silently fabricated analytics set).
 *
 * The platform ingests episode grouping + measures; it does not compute them.
 * Mirrors src/lib/measures (getCareGapView).
 */
import { getDataMode } from '@/lib/config/dataMode';
import * as authored from './mockEpisodes';
import { ingestEpisodeFeed } from './etgIngest';
import type {
  EpisodeAnalyticsView,
  EpisodeDisposition,
  ExternalEpisodeAnalyticsFeed,
} from './types';

export type {
  EpisodeAnalyticsView,
  EpisodeDisposition,
  ExternalEpisodeAnalyticsFeed,
} from './types';
export type { ProviderRanking, ProcedureFrequency, ReferralPattern } from './mockEpisodes';
export { ingestEpisodeFeed, EpisodeFeedMalformedError } from './etgIngest';

export class EpisodeFeedNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE episodes=production but no external grouper/measure feed loader is registered (fail-closed)'
    );
    this.name = 'EpisodeFeedNotConfiguredError';
  }
}

// The production feed loader returns the external system's computed episode analytics.
let productionFeedLoader: (() => ExternalEpisodeAnalyticsFeed) | null = null;

/** Register (or clear) the external episode-analytics feed loader (composition root / tests). */
export function setProductionEpisodeFeedLoader(
  loader: (() => ExternalEpisodeAnalyticsFeed) | null
): void {
  productionFeedLoader = loader;
}

function authoredBundle(disposition: EpisodeDisposition): EpisodeAnalyticsView {
  return {
    EPISODE_TYPES: authored.EPISODE_TYPES,
    OUTCOMES_DATA: authored.OUTCOMES_DATA,
    TREND_DATA: authored.TREND_DATA,
    TREND_LINES: authored.TREND_LINES,
    MEMBER_RISK_SCORES: authored.MEMBER_RISK_SCORES,
    PROVIDER_RANKINGS: authored.PROVIDER_RANKINGS,
    PROCEDURE_FREQUENCIES: authored.PROCEDURE_FREQUENCIES,
    REFERRAL_PATTERNS: authored.REFERRAL_PATTERNS,
    BH_EPISODE_TYPES: authored.BH_EPISODE_TYPES,
    BH_OUTCOMES: authored.BH_OUTCOMES,
    BH_PROVIDER_DATA: authored.BH_PROVIDER_DATA,
    SOCIAL_PROGRAM_OUTCOMES: authored.SOCIAL_PROGRAM_OUTCOMES,
    SDOH_COST_IMPACT: authored.SDOH_COST_IMPACT,
    disposition,
  };
}

/**
 * The episode-analytics view. Seam-switched: mock/seeded return the authored demo analytics
 * (preserved exactly); production ingests the external grouper/measure feed (fail-closed).
 */
export function getEpisodeAnalyticsView(): EpisodeAnalyticsView {
  const mode = getDataMode('episodes');
  if (mode === 'production') {
    if (!productionFeedLoader) throw new EpisodeFeedNotConfiguredError();
    return ingestEpisodeFeed(productionFeedLoader());
  }
  return authoredBundle(mode === 'seeded' ? 'seeded' : 'mock');
}
