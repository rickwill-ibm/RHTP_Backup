'use client';
/**
 * GainShareStandalone — client wrapper so the standalone /gain-share and /gs-modeler routes render the
 * SAME real, sim-anchored Gain-Share board as the Golden-Thread flow tab (one operating loop, one epoch),
 * instead of the old illustrative-only page / static iframe mock.
 */
import { useOperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { GainShareBoard } from '@/components/gainShare/GainShareBoard';

export function GainShareStandalone(): React.ReactElement {
  const op = useOperatingSim();
  return <GainShareBoard op={op} />;
}
