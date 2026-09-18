/**
 * threadPresets.ts (Phase A — Golden Thread guided reviewer surface).
 *
 * The three policy PRESETS the guided surface offers as the recovery-agent posture.
 * Pure data: each preset is a real `AutonomyTier` (one ladder of the Twin Ladder),
 * a materiality floor (the reconciliation tolerance), and a timely-filing window in
 * days. The surface threads these into the REAL pipeline — the autonomy tier into
 * both the manifest registry override (createRuntime) and CashDeps.recoveryAgentTier,
 * the materiality into CashDeps.materiality, and the window into CashDeps.filingWindowDays.
 *
 *   conservative — HITL,  $100, 60d  (a human acts on every draft; high materiality bar)
 *   balanced     — HOTL,   $25, 120d (default; auto-approve after a review window)
 *   aggressive   — autonomous, $5, 180d (widest recovery net)
 *
 * Autonomy never lifts authority past what the evidence tier ceiling permits — the
 * Twin-Ladder interlock caps a bolder preset on weak evidence. Presets change posture,
 * not the governance floor.
 */
import type { AutonomyTier } from '@/lib/agents/manifest/types';

export type ThreadPresetId = 'conservative' | 'balanced' | 'aggressive';

export interface ThreadPreset {
  label: string;
  autonomyTier: AutonomyTier;
  /** Absolute materiality floor ($) for the reconciliation tolerance. */
  materiality: { abs: number };
  /** Timely-filing / payer-appeal window in days from the remittance date. */
  filingWindowDays: number;
}

export const THREAD_PRESETS: Record<ThreadPresetId, ThreadPreset> = {
  conservative: {
    label: 'Conservative (HITL · $100 · 60d)',
    autonomyTier: 'HITL',
    materiality: { abs: 100 },
    filingWindowDays: 60,
  },
  balanced: {
    label: 'Balanced (HOTL · $25 · 120d)',
    autonomyTier: 'HOTL',
    materiality: { abs: 25 },
    filingWindowDays: 120,
  },
  aggressive: {
    label: 'Aggressive (autonomous · $5 · 180d)',
    autonomyTier: 'autonomous',
    materiality: { abs: 5 },
    filingWindowDays: 180,
  },
};

/** The picker list (id + label), stable order. */
export const presetList: ReadonlyArray<{ id: ThreadPresetId; label: string }> = (
  ['conservative', 'balanced', 'aggressive'] as const
).map((id) => ({ id, label: THREAD_PRESETS[id].label }));
