import { useDemoStore } from '@/uhg/store/demoStore';

/**
 * useActiveCitizen — single access point for the active patient/citizen context.
 *
 * Thin wrapper over demoStore so pages stop duplicating the same store wiring
 * (the previous copy-paste of `useDemoStore((s) => s.activeCitizenId)` /
 * `s.setActiveCitizen` across a dozen pages). Selectors stay ATOMIC — each reads a
 * single primitive/function reference — so referential stability is unchanged and
 * the golden demo (Maria, default `MARIA_SD_001`) renders byte-identical.
 *
 * Future cross-cutting concerns on the active citizen (telemetry on switch, authz
 * on setActiveCitizen, memoized derivations) hang here, not in every page.
 */
export function useActiveCitizen() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  return { activeCitizenId, setActiveCitizen };
}
