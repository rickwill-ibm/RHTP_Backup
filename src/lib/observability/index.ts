/**
 * observability — metrics, latency, SLO evaluation (HW1-B / I22). Wired via the
 * ops health route; the same API binds to a real metrics backend in production.
 */
export {
  metrics,
  instrument,
  type MetricSnapshot,
  type SloTarget,
  type SloStatus,
} from './context';
