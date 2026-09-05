// episodes — seam types. The episode-analytics VIEW the screen consumes, the external
// grouper/measure feed shape, and the disposition. Field types are taken from the authored
// data (typeof) so mock and production stay in exact parity (E15).
import type * as A from './mockEpisodes';

export type EpisodeDisposition = 'mock' | 'seeded' | 'production';

/** The full episode-analytics view the screen renders. Field names match the authored
 *  constants verbatim so components consume the seam with a one-line destructure. */
export interface EpisodeAnalyticsView {
  EPISODE_TYPES: typeof A.EPISODE_TYPES;
  OUTCOMES_DATA: typeof A.OUTCOMES_DATA;
  TREND_DATA: typeof A.TREND_DATA;
  TREND_LINES: typeof A.TREND_LINES;
  MEMBER_RISK_SCORES: typeof A.MEMBER_RISK_SCORES;
  PROVIDER_RANKINGS: typeof A.PROVIDER_RANKINGS;
  PROCEDURE_FREQUENCIES: typeof A.PROCEDURE_FREQUENCIES;
  REFERRAL_PATTERNS: typeof A.REFERRAL_PATTERNS;
  BH_EPISODE_TYPES: typeof A.BH_EPISODE_TYPES;
  BH_OUTCOMES: typeof A.BH_OUTCOMES;
  BH_PROVIDER_DATA: typeof A.BH_PROVIDER_DATA;
  SOCIAL_PROGRAM_OUTCOMES: typeof A.SOCIAL_PROGRAM_OUTCOMES;
  SDOH_COST_IMPACT: typeof A.SDOH_COST_IMPACT;
  disposition: EpisodeDisposition;
}

/** The external grouper/measure system's COMPUTED analytics payload (Da Vinci-style:
 *  EpisodeOfCare grouping + MeasureReport stratifiers, already computed upstream). The
 *  platform ingests this — it never runs ETG grouping or measure math itself. */
export type ExternalEpisodeAnalyticsFeed = Omit<EpisodeAnalyticsView, 'disposition'>;
