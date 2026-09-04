// lib/context/screenFrames.ts — the single source of truth for a screen's CONTEXT FRAME
// and intended ROLE. The shell (AppTopBarActions) reads this to decide which top-bar scope
// control to render — the member switcher belongs ONLY to member-subject frames, never on
// caseload/population/platform screens. This registry is also the seam RBAC later attaches to.
//
// Keyed by URL pathname. Next.js route groups like (reviewer)/(ops)/(analyst) do NOT appear
// in the URL, so e.g. app/(reviewer)/work-queue resolves at runtime to "/work-queue".

export type ScreenFrame =
  | 'member' // one person is the subject — member switcher belongs; screen follows active member
  | 'household' // a linked unit of members — household roster
  | 'launch' // member context arrives via URL param (SMART-on-FHIR) and is authoritative/locked
  | 'caseload' // a worker's book of attributed members — member is a ROW, not a filter
  | 'population' // cohorts / contracts / quality / finance / network — no member subject
  | 'enterprise' // multi-entity orchestration
  | 'platform' // system / admin / interop — no member
  | 'member-facing' // the member (or proxy) is the viewer — their own account
  | 'utility'; // landing, auth, demo tooling

export type ScreenRole =
  'CM' | 'MD' | 'CHW' | 'UMR' | 'PHA' | 'EXE' | 'OPS' | 'ADM' | 'ENT' | 'MBR' | 'PRS';

export interface ScreenContext {
  frame: ScreenFrame;
  role: ScreenRole;
}

// Exact-path registry (URL pathnames). Order does not matter; exact match wins over prefixes.
const REGISTRY: Record<string, ScreenContext> = {
  // ── Member (switcher shown) ─────────────────────────────────────────────
  '/whole-person-care-summary': { frame: 'member', role: 'CM' },
  '/whole-person-intelligence': { frame: 'member', role: 'CM' },
  '/patient-detail': { frame: 'member', role: 'CM' },
  '/social-needs-screening': { frame: 'member', role: 'CHW' },
  '/program-eligibility': { frame: 'member', role: 'CM' },
  '/benefit-enrollment': { frame: 'member', role: 'CM' },
  '/care-gap-closure-verification': { frame: 'member', role: 'CM' },
  '/episode-detail': { frame: 'member', role: 'CM' },
  '/patient-episode-summary': { frame: 'member', role: 'CM' },
  '/crisis-pathway': { frame: 'member', role: 'CM' },
  '/journey-aware-context': { frame: 'member', role: 'CM' },
  '/signal-disposition-engine': { frame: 'member', role: 'CM' },
  '/consent-sovereignty-panel': { frame: 'member', role: 'CM' },
  '/physician-view': { frame: 'member', role: 'CM' }, // the active member's care team
  '/uhg-orchestrate/consumer-360': { frame: 'member', role: 'CM' },
  '/uhg-orchestrate/whole-person-care': { frame: 'member', role: 'CM' },
  '/uhg-orchestrate/signal-disposition-engine': { frame: 'member', role: 'CM' },
  '/uhg-orchestrate/caregiver-elena': { frame: 'member', role: 'CM' },

  // ── Household (roster shown) ────────────────────────────────────────────
  '/household-view': { frame: 'household', role: 'CM' },
  '/uhg-orchestrate/family-sofia': { frame: 'household', role: 'CM' },

  // ── Launch (URL patientId is authoritative) ─────────────────────────────
  '/md-smart-launch': { frame: 'launch', role: 'MD' },
  '/provider-access': { frame: 'launch', role: 'MD' },

  // ── Caseload / Queue (no member switcher) ───────────────────────────────
  '/care-team-inbox': { frame: 'caseload', role: 'CM' },
  '/care-manager': { frame: 'caseload', role: 'CM' },
  '/chw-workflow': { frame: 'caseload', role: 'CHW' },
  '/specialist-inbox': { frame: 'caseload', role: 'MD' },
  '/referral-tracking': { frame: 'caseload', role: 'CM' },
  '/submitted-referrals': { frame: 'caseload', role: 'CM' },
  '/referral-journey-tracker': { frame: 'caseload', role: 'CM' },
  '/work-queue': { frame: 'caseload', role: 'UMR' },
  '/prior-auth': { frame: 'caseload', role: 'UMR' },
  '/financial-clearance': { frame: 'caseload', role: 'UMR' },

  // ── Population / Executive (no member switcher) ─────────────────────────
  '/contract-program-selection': { frame: 'population', role: 'EXE' },
  '/panel-cohort-view': { frame: 'population', role: 'PHA' },
  '/region-view': { frame: 'population', role: 'PHA' },
  '/provider-level': { frame: 'population', role: 'PHA' },
  '/stars-hedis-mips': { frame: 'population', role: 'PHA' },
  '/social-needs-dashboard': { frame: 'population', role: 'PHA' },
  '/outcomes-linkage': { frame: 'population', role: 'PHA' },
  '/episodic-management-analytics': { frame: 'population', role: 'PHA' },
  '/cbo-directory': { frame: 'population', role: 'CM' },
  '/financial-dashboard': { frame: 'population', role: 'EXE' },
  '/executive-outcomes-dashboard': { frame: 'population', role: 'EXE' },
  '/network-adequacy': { frame: 'population', role: 'PHA' },
  '/provider-selection': { frame: 'population', role: 'CM' },
  '/agent-coalition-monitor': { frame: 'population', role: 'OPS' },
  '/uhg-orchestrate/portfolio-scale': { frame: 'population', role: 'PHA' },
  '/uhg-orchestrate/agent-impact-dashboard': { frame: 'population', role: 'EXE' },
  '/uhg-orchestrate/reporting-dashboard': { frame: 'population', role: 'EXE' },

  // ── Enterprise / Orchestration (no member switcher) ─────────────────────
  '/uhg-orchestrate/fragmentation-split-system-view': { frame: 'enterprise', role: 'ENT' },
  '/uhg-orchestrate/controller-agentic-super-orchestration-centerpiece': {
    frame: 'enterprise',
    role: 'ENT',
  },

  // ── Platform / Admin / Interop (no member switcher) ─────────────────────
  '/uhg-orchestrate/agent-library': { frame: 'platform', role: 'ADM' },
  '/cdp-assembly': { frame: 'platform', role: 'ADM' },
  '/cdp-assembly-view': { frame: 'platform', role: 'ADM' },
  '/uhg-orchestrate/cdp-assembly-split': { frame: 'platform', role: 'ADM' },
  '/cms': { frame: 'platform', role: 'ADM' },
  '/payer-to-payer': { frame: 'platform', role: 'OPS' },
  '/api-explorer': { frame: 'platform', role: 'ADM' },

  // ── Member-facing / Utility ──────────────────────────────────────────────
  '/access': { frame: 'member-facing', role: 'MBR' },
  '/sign-up-login': { frame: 'utility', role: 'MBR' },
  '/demo-deck': { frame: 'utility', role: 'PRS' },
  '/demo-onboarding': { frame: 'utility', role: 'PRS' },
  '/': { frame: 'utility', role: 'PRS' },
};

// Prefix registry for dynamic / nested routes (longest match wins).
const PREFIXES: Array<[string, ScreenContext]> = [
  ['/care-plan-monitor', { frame: 'launch', role: 'CM' }], // /care-plan-monitor/[patientId]
  ['/evidence', { frame: 'launch', role: 'UMR' }], // /(reviewer)/evidence/[id]
  ['/policy-engine', { frame: 'platform', role: 'UMR' }],
  ['/admin-console', { frame: 'platform', role: 'ADM' }],
  ['/settings', { frame: 'platform', role: 'ADM' }],
];

const norm = (p: string): string => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

/** Resolve a pathname to its screen context. Unknown routes fall back to a NON-member
 *  frame (switcher hidden) — safer than wrongly showing member context — and warn in dev. */
export function resolveScreenContext(pathname: string): ScreenContext {
  const path = norm((pathname || '/').split('?')[0]);
  const exact = REGISTRY[path];
  if (exact) return exact;
  let best: [string, ScreenContext] | undefined;
  for (const entry of PREFIXES) {
    if (
      (path === entry[0] || path.startsWith(entry[0] + '/')) &&
      (!best || entry[0].length > best[0].length)
    ) {
      best = entry;
    }
  }
  if (best) return best[1];
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `[screenFrames] no frame registered for "${path}" — defaulting to platform (switcher hidden). Add it to screenFrames.ts.`
    );
  }
  return { frame: 'platform', role: 'ADM' };
}

/** Frames whose SUBJECT is a single member — the only frames that show the member switcher. */
export function showsMemberSwitcher(frame: ScreenFrame): boolean {
  return frame === 'member' || frame === 'household' || frame === 'launch';
}
