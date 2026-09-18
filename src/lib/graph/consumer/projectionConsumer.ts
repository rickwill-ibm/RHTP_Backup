/**
 * OutboxProjectionConsumer (HW1 / I14, closes REC-01 — the #1 "unwired realness"
 * finding: the outbox had NO live consumer feeding the graph projector).
 *
 * It drains confirmed/published outbox intents (those with an assigned per-member
 * sequence), in per-member FIFO order, builds the C2 envelope, projects it to the
 * neutral mutation set, applies it to the GraphStore, and advances a per-member
 * checkpoint. Idempotent and resumable: re-running applies only intents beyond the
 * checkpoint, and graph mutations are upserts, so a crash mid-batch re-drives safely.
 *
 * This is the wiring, not new logic: buildEnvelope + project + store.apply already
 * existed and were unit-tested in isolation; nothing CALLED them from a real path.
 */

import type { OutboxStore, OutboxIntentRow } from '@/lib/outbox';
import { buildEnvelope } from '@/lib/outbox/envelope';
import { project } from '@/lib/graph/projector';
import type { GraphStore, ProjectorDeps } from '@/lib/graph/types';
import type { ProjectionCheckpointStore } from './checkpoint';

export interface ProjectionConsumerDeps extends ProjectorDeps {
  /** Deterministic RNG for envelope id generation (injected; never Math.random). */
  rng: () => number;
}

export interface ProjectionRunResult {
  /** Intents applied to the graph this run. */
  applied: number;
  /** Intents skipped because already behind the checkpoint (idempotent re-runs). */
  skipped: number;
  /** Members touched this run. */
  members: number;
  /** Per-member last-applied sequence after the run. */
  highWater: Record<string, number>;
}

/**
 * A single drain pass. Safe to call repeatedly (a scheduler tick or an ops trigger).
 * Only confirmed/published intents WITH a sequence are eligible (a pending intent
 * has not been ordered yet and must not project).
 */
export async function runProjectionOnce(
  outbox: OutboxStore,
  graph: GraphStore,
  checkpoint: ProjectionCheckpointStore,
  deps: ProjectionConsumerDeps
): Promise<ProjectionRunResult> {
  const rows = await outbox.all();
  const eligible = rows.filter(
    (r) => (r.status === 'confirmed' || r.status === 'published') && typeof r.sequence === 'number'
  );

  // group by member, ordered by sequence (per-member FIFO)
  const byMember = new Map<string, OutboxIntentRow[]>();
  for (const r of eligible) {
    const list = byMember.get(r.memberId) ?? [];
    list.push(r);
    byMember.set(r.memberId, list);
  }

  let applied = 0;
  let skipped = 0;
  const highWater: Record<string, number> = {};

  for (const [memberId, list] of byMember) {
    list.sort((a, b) => (a.sequence as number) - (b.sequence as number));
    let mark = await checkpoint.highWater(memberId);
    for (const row of list) {
      const seq = row.sequence as number;
      if (seq <= mark) {
        skipped++;
        continue;
      }
      const event = buildEnvelope(row, seq, { now: deps.now, rng: deps.rng });
      const mutations = project([event], { now: deps.now });
      await graph.apply(mutations);
      await checkpoint.advance(memberId, seq);
      mark = seq;
      applied++;
    }
    highWater[memberId] = mark;
  }

  return { applied, skipped, members: byMember.size, highWater };
}
