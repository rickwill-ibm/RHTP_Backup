/**
 * Circuit breaker + timeout for external seam calls (HW1-B / I22, HS-03).
 *
 * Every call across an external seam (FHIR server, terminology server, EMPI,
 * measures feed) must have a TIMEOUT and a CIRCUIT BREAKER, so a slow or failing
 * dependency degrades gracefully instead of hanging the request or hammering a
 * downed service. Deterministic: the clock is injected (never wall time), so the
 * breaker is unit-testable and reproducible.
 *
 * States: closed (calls flow) -> open (calls fail fast after N failures) ->
 * half-open (after a cooldown, one trial call decides re-close or re-open).
 */

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** Cooldown (ms) before an open breaker allows a trial call. */
  cooldownMs: number;
  /** Per-call timeout (ms). */
  timeoutMs: number;
  /** Injected clock (ms since epoch). */
  now: () => number;
}

export class CircuitOpenError extends Error {
  constructor(public readonly seam: string) {
    super(`circuit open for seam '${seam}' — failing fast`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitTimeoutError extends Error {
  constructor(public readonly seam: string, ms: number) {
    super(`seam '${seam}' timed out after ${ms}ms`);
    this.name = 'CircuitTimeoutError';
  }
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAtMs = 0;

  constructor(
    public readonly seam: string,
    private readonly opts: BreakerOptions,
  ) {}

  /** Current state, advancing open -> half-open when the cooldown has elapsed. */
  peek(): BreakerState {
    if (this.state === 'open' && this.opts.now() - this.openedAtMs >= this.opts.cooldownMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  private trip(): void {
    this.state = 'open';
    this.openedAtMs = this.opts.now();
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.opts.failureThreshold) this.trip();
  }

  /**
   * Run `fn` through the breaker with a timeout. Fails fast (CircuitOpenError)
   * when open; on half-open a single trial runs and its outcome decides the state.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.peek() === 'open') throw new CircuitOpenError(this.seam);
    try {
      const result = await this.withTimeout(fn());
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new CircuitTimeoutError(this.seam, this.opts.timeoutMs));
        }
      }, this.opts.timeoutMs);
      if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as { unref: () => void }).unref();
      p.then(
        (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
        (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } },
      );
    });
  }

  /** Snapshot for observability / an ops health screen. */
  snapshot(): { seam: string; state: BreakerState; failures: number } {
    return { seam: this.seam, state: this.peek(), failures: this.failures };
  }
}

/** A registry so ops/health can enumerate every seam's breaker. */
const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(seam: string, opts: BreakerOptions): CircuitBreaker {
  let b = breakers.get(seam);
  if (!b) {
    b = new CircuitBreaker(seam, opts);
    breakers.set(seam, b);
  }
  return b;
}

export function breakerSnapshots(): Array<{ seam: string; state: BreakerState; failures: number }> {
  return [...breakers.values()].map((b) => b.snapshot());
}

/** Test/ops reset. */
export function _resetBreakers(): void {
  breakers.clear();
}
