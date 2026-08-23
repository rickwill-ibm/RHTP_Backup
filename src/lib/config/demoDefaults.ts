// demoDefaults.ts: the single configured default demo member (Cycle 1 convergence).
//
// Wave-1 follow-up #1: the demo member id was hardcoded as a literal in ~10
// logic files, keying defaults to one persona. Logic-file defaults now import
// DEMO_MEMBER_ID from here, so swapping the demo persona is one env var (or
// one line here). Data/seed modules that carry the persona's own records keep
// their literal ids on purpose: they ARE that persona's data.
//
// The env var is read via a static member expression so Next.js inlines it
// into client bundles too.

/** Platform member id of the default demo patient (configurable). */
export const DEMO_MEMBER_ID: string =
  process.env.NEXT_PUBLIC_DEMO_MEMBER_ID ?? 'MARIA_SD_001';
