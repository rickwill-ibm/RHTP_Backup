// Agent-library coalition logic — extracted from page.tsx so it can be imported
// by other modules (Next.js forbids non-framework exports from a page file).
// SEAM: agent-dispatch — presentational demo dispatch; the production agent
// runtime (G4) replaces this behind the same shape.
import type { RegistryPatient } from '@/lib/patientRegistry';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

export type TriggerCode = 'CARE_GAP' | 'AUTH_EXPIRY' | 'SDOH' | 'CAREGIVER' | 'BH' | 'COST';

export interface CoalitionAgent {
  id: string;
  libId: string;
  name: string;
  role: 'PRIMARY' | 'CONCURRENT' | 'SUPPORTING' | 'COMPLIANCE' | 'SPECIALIST';
  color: string;
  trigger: TriggerCode;
}

// The dispatchable domain agents (these become the controller's agent panels).
export const DOMAIN_COALITION: CoalitionAgent[] = [
  {
    id: 'agent-care',
    libId: 'care-mgmt',
    name: 'Clinical Care Agent',
    role: 'PRIMARY',
    color: '#0C55B8',
    trigger: 'CARE_GAP',
  },
  {
    id: 'agent-provider',
    libId: 'sdoh-intel',
    name: 'Social / SDOH Agent',
    role: 'CONCURRENT',
    color: '#8b5cf6',
    trigger: 'SDOH',
  },
  {
    id: 'agent-util',
    libId: 'util-mgmt',
    name: 'Eligibility Agent',
    role: 'SUPPORTING',
    color: '#f59e0b',
    trigger: 'AUTH_EXPIRY',
  },
  {
    // IDENTITY CORRECTED. This entry read `id: 'agent-appeals'`, `libId: 'appeals'`,
    // `name: 'Behavioral Health Agent'`, `role: 'COMPLIANCE'` — four answers to one
    // question, on the most Part-2-exposed component in the set. Appeals and BH
    // clinical are DISJOINT legal surfaces: appeals runs under 42 CFR 438.406 and
    // NY PHL §4904 (45 days to file, 30 to determine, 2 business days expedited);
    // BH clinical runs under NY MHL §33.13. An agent holding both holds an
    // authority union no single consent instrument can satisfy.
    id: 'agent-appeals',
    libId: 'appeals',
    name: 'Appeals & Grievances Agent',
    role: 'COMPLIANCE',
    color: '#ef4444',
    trigger: 'AUTH_EXPIRY',
  },
  {
    // A NEW id, not a rename. Repurposing `agent-appeals` would leave every
    // existing ledger row, escalation record and audit entry filed under an id
    // that now means something else — which is how a privacy officer fails to
    // find a disclosure during a breach review.
    id: 'agent-bh-screening-triage',
    libId: 'bh-screening-triage',
    name: 'Behavioral Health Screening Triage Agent',
    role: 'SPECIALIST',
    color: '#ef4444',
    trigger: 'BH',
  },
  {
    id: 'agent-caregiver',
    libId: 'caregiver-intel',
    name: 'Caregiver Intelligence Agent',
    role: 'SPECIALIST',
    color: '#c084fc',
    trigger: 'CAREGIVER',
  },
  {
    id: 'agent-financial',
    libId: 'financial-intel',
    name: 'Financial Intelligence Agent',
    role: 'SPECIALIST',
    color: '#10b981',
    trigger: 'COST',
  },
];

const ALWAYS_ON_LIB_IDS = ['graph-intel', 'identity', 'consent', 'person-state'];

// Evaluate a member's active trigger codes from their knowledge-graph context.
export function activeTriggers(p: RegistryPatient): Set<TriggerCode> {
  const t = new Set<TriggerCode>(['CARE_GAP', 'AUTH_EXPIRY', 'COST']);
  const sdoh =
    /barrier|mile|insecur|waitlist|instab|assistance|not enrolled|expired|lapsed/i.test(
      `${p.transportStatus || ''} ${p.foodSecurity || ''} ${p.housingStatus || ''} ${p.snapStatus || ''}`
    ) ||
    /low income|rural/i.test(p.disparityFlag || '') ||
    (p.careGaps || []).some((g) => g.domain === 'Social' && g.status !== 'Closed');
  if (sdoh) t.add('SDOH');
  if (p.household?.caregiverFor?.length) t.add('CAREGIVER');
  if (p.bhRisk && p.bhRisk !== 'Low') t.add('BH');
  return t;
}

// The dispatched domain coalition for a member (ordered, deterministic).
export function dispatchAgentsForPatient(p: RegistryPatient): CoalitionAgent[] {
  // The flagship authored coalition (canonical 4-agent walkthrough) is keyed to
  // the configured demo member, not a hardcoded persona id.
  if (p.platformId === DEMO_MEMBER_ID) {
    const core = ['agent-care', 'agent-provider', 'agent-util', 'agent-appeals'];
    return DOMAIN_COALITION.filter((a) => core.includes(a.id));
  }
  const active = activeTriggers(p);
  return DOMAIN_COALITION.filter((a) => active.has(a.trigger));
}

// Marketplace drawdown — which library agent ids are dispatched/active for this member.
export function dispatchedLibIds(p: RegistryPatient): Set<string> {
  const ids = new Set<string>(ALWAYS_ON_LIB_IDS);
  dispatchAgentsForPatient(p).forEach((a) => ids.add(a.libId));
  return ids;
}
