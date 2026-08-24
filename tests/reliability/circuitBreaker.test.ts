/**
 * HW1-B / I22 — circuit breaker + timeout + scheduler + observability.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError, CircuitTimeoutError } from '../../src/lib/reliability/circuitBreaker';
import { Scheduler } from '../../src/lib/reliability/scheduler';
import { metrics, instrument, type SloTarget } from '../../src/lib/observability';

function fixedClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('circuit breaker', () => {
  it('trips open after the failure threshold, then fails fast', async () => {
    const clk = fixedClock();
    const b = new CircuitBreaker('seam', { failureThreshold: 2, cooldownMs: 1000, timeoutMs: 100, now: clk.now });
    const boom = () => Promise.reject(new Error('down'));
    await expect(b.call(boom)).rejects.toThrow('down');
    expect(b.peek()).toBe('closed');
    await expect(b.call(boom)).rejects.toThrow('down'); // 2nd failure trips
    expect(b.peek()).toBe('open');
    await expect(b.call(() => Promise.resolve('x'))).rejects.toThrow(CircuitOpenError); // fails fast
  });

  it('half-opens after cooldown and re-closes on a success', async () => {
    const clk = fixedClock();
    const b = new CircuitBreaker('seam', { failureThreshold: 1, cooldownMs: 1000, timeoutMs: 100, now: clk.now });
    await expect(b.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(b.peek()).toBe('open');
    clk.advance(1000);
    expect(b.peek()).toBe('half-open');
    await expect(b.call(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(b.peek()).toBe('closed');
  });

  it('times out a slow call', async () => {
    const clk = fixedClock();
    const b = new CircuitBreaker('seam', { failureThreshold: 3, cooldownMs: 1000, timeoutMs: 10, now: clk.now });
    const slow = () => new Promise((r) => setTimeout(r, 1000));
    await expect(b.call(slow)).rejects.toThrow(CircuitTimeoutError);
  });
});

describe('scheduler', () => {
  it('runs a job when its interval elapses, skips otherwise, isolates failures', async () => {
    const s = new Scheduler();
    let ran = 0;
    s.register({ id: 'a', intervalMs: 100, run: () => { ran++; } });
    s.register({ id: 'b', intervalMs: 100, run: () => { throw new Error('boom'); } });
    const r1 = await s.tick(0); // both due on first tick
    expect(r1.ran).toContain('a');
    expect(r1.errors.map((e) => e.id)).toContain('b');
    expect(ran).toBe(1);
    const r2 = await s.tick(50); // not yet due
    expect(r2.skipped.sort()).toEqual(['a', 'b']);
    const r3 = await s.tick(200); // due again
    expect(r3.ran).toContain('a');
    expect(ran).toBe(2);
  });
});

describe('observability', () => {
  beforeEach(() => metrics().reset());
  it('records latency + ok/error counters and evaluates SLOs', async () => {
    const clk = fixedClock();
    await instrument('op', () => { clk.advance(3); return clk.now(); }, async () => 'ok');
    await expect(instrument('op', clk.now, async () => { throw new Error('x'); })).rejects.toThrow();
    const snap = metrics().snapshot();
    expect(snap.counters['op.ok']).toBe(1);
    expect(snap.counters['op.error']).toBe(1);
    const slos: SloTarget[] = [{ name: 'op', p95BudgetMs: 1000, maxErrorRatio: 0.1 }];
    const status = metrics().evaluateSlos(slos)[0];
    expect(status.errorRatio).toBeCloseTo(0.5, 5);
    expect(status.ok).toBe(false); // 50% error > 10% budget
  });
});
