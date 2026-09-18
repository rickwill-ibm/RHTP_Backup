/**
 * Per-member critical section (amendment §2 step 3: "advisory lock on memberId,
 * or partition-affine single writer"). This is the partition-affine single-writer
 * model: work for one member serializes through a promise chain keyed by member,
 * guaranteeing sequence assignment and FIFO drain never interleave for a member.
 * Different members proceed concurrently. Shared by the writer and the sweep so
 * a sweep can never race a live drain for the same member.
 */
export class MemberLock {
  private chains = new Map<string, Promise<unknown>>();

  /** Run `fn` in the member's critical section; members are independent. */
  run<T>(memberId: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.chains.get(memberId) ?? Promise.resolve();
    const next = prior.then(fn, fn);
    // Keep the chain alive but swallow rejections so one failure never wedges it.
    this.chains.set(
      memberId,
      next.then(
        () => undefined,
        () => undefined
      )
    );
    return next;
  }
}
