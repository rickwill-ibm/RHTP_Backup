// etgIngest.ts — PRODUCTION disposition. Normalizes the external grouper/measure system's
// computed episode-analytics feed into the EpisodeAnalyticsView. The platform does NOT
// compute ETG episode grouping or measures — it INGESTS the upstream system's output.
// Fail-closed: a feed missing its episode spine is rejected, never fabricated.
import type { EpisodeAnalyticsView, ExternalEpisodeAnalyticsFeed } from './types';

export class EpisodeFeedMalformedError extends Error {
  constructor(reason: string) {
    super(`external episode-analytics feed rejected (fail-closed): ${reason}`);
    this.name = 'EpisodeFeedMalformedError';
  }
}

/** Ingest the external analytics feed into the view. Validates the episode spine is present
 *  (data-quality gate); never invents rows. */
export function ingestEpisodeFeed(feed: ExternalEpisodeAnalyticsFeed): EpisodeAnalyticsView {
  if (!feed || !Array.isArray(feed.EPISODE_TYPES) || feed.EPISODE_TYPES.length === 0) {
    throw new EpisodeFeedMalformedError('no EPISODE_TYPES in feed');
  }
  return { ...feed, disposition: 'production' };
}
