/**
 * Touchpoint composition. The acts + bundles for one member in one fold compose
 * into a single coordinated touchpoint (content intents ordered by priority);
 * delayed signals parked to the same coordination window compose into a delay
 * bundle. This is what makes "one coordinated touchpoint" a real, derived object
 * rather than an authored label.
 */
import type {
  ActDisposition,
  BundleDisposition,
  DelayBundle,
  DelayDisposition,
  Disposition,
  Signal,
  Touchpoint,
} from '../types';

/** Group act/bundle decisions by touchpointId into coordinated touchpoints. */
export function composeTouchpoints(
  dispositions: Disposition[],
  signalsById: Map<string, Signal>,
  memberId: string
): Touchpoint[] {
  const byTp = new Map<string, Array<ActDisposition | BundleDisposition>>();
  for (const d of dispositions) {
    if (d.action !== 'act' && d.action !== 'bundle') continue;
    const list = byTp.get(d.touchpointId) ?? [];
    list.push(d);
    byTp.set(d.touchpointId, list);
  }
  const touchpoints: Touchpoint[] = [];
  for (const [touchpointId, decisions] of byTp) {
    const intents = decisions
      .map((d) => ({
        signalId: d.signalId,
        kind: signalsById.get(d.signalId)?.kind ?? 'unknown',
        priorityScore: d.priorityScore,
        channel: d.channel,
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore || (a.signalId < b.signalId ? -1 : 1));
    // The touchpoint channel is the opener's (highest-priority intent's) channel.
    const channel = intents[0]?.channel ?? 'portal';
    touchpoints.push({ touchpointId, memberId, channel, intents });
  }
  return touchpoints.sort((a, b) => (a.touchpointId < b.touchpointId ? -1 : 1));
}

/** Group delay decisions by their coordination window into delay bundles. */
export function bundleDelays(dispositions: Disposition[]): DelayBundle[] {
  const byWindow = new Map<string, DelayDisposition[]>();
  for (const d of dispositions) {
    if (d.action !== 'delay') continue;
    const list = byWindow.get(d.untilWindowId) ?? [];
    list.push(d);
    byWindow.set(d.untilWindowId, list);
  }
  const bundles: DelayBundle[] = [];
  for (const [windowId, decisions] of byWindow) {
    bundles.push({
      windowId,
      untilMs: decisions[0].untilMs,
      signalIds: decisions.map((d) => d.signalId).sort(),
    });
  }
  return bundles.sort((a, b) => (a.windowId < b.windowId ? -1 : 1));
}
