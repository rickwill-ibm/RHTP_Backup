import { describe, it, expect } from 'vitest';
import {
  getEpisodeAnalyticsView,
  ingestEpisodeFeed,
  setProductionEpisodeFeedLoader,
  EpisodeFeedMalformedError,
} from '@/lib/episodes';

describe('episodes seam — consume, do not compute', () => {
  it('mock disposition returns the authored analytics verbatim (screen parity)', () => {
    const v = getEpisodeAnalyticsView();
    expect(v.disposition).toBe('mock');
    expect(v.EPISODE_TYPES.length).toBeGreaterThan(0);
    expect(v.MEMBER_RISK_SCORES.length).toBeGreaterThan(0);
    expect(v.PROVIDER_RANKINGS.length).toBeGreaterThan(0);
    expect(v.BH_EPISODE_TYPES.length).toBeGreaterThan(0);
    expect(v.SOCIAL_PROGRAM_OUTCOMES.length).toBeGreaterThan(0);
  });

  it('ingestEpisodeFeed normalizes an external feed into the production view', () => {
    const { disposition: _d, ...feed } = getEpisodeAnalyticsView();
    const view = ingestEpisodeFeed(feed);
    expect(view.disposition).toBe('production');
    expect(view.EPISODE_TYPES).toEqual(feed.EPISODE_TYPES);
  });

  it('fails CLOSED on a feed missing its episode spine (never fabricates)', () => {
    const { disposition: _d, ...feed } = getEpisodeAnalyticsView();
    expect(() => ingestEpisodeFeed({ ...feed, EPISODE_TYPES: [] })).toThrow(
      EpisodeFeedMalformedError
    );
  });

  it('registers and clears the external production feed loader', () => {
    setProductionEpisodeFeedLoader(() => {
      const { disposition: _d, ...feed } = getEpisodeAnalyticsView();
      return feed;
    });
    setProductionEpisodeFeedLoader(null);
    expect(getEpisodeAnalyticsView().disposition).toBe('mock');
  });
});
