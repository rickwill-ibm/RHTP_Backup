// uhg/data/citizenContext.ts — structured, graph-grounded context for the RHTP-Orchestrate
// screens. Sourced from RHTP patientRegistry + wholePersonGraphData helpers. Default = Maria
// Redhawk; works for ANY citizen (others derive from their own registry/graph; degrade gracefully).
import { getPatientById, type RegistryPatient } from '@/lib/patientRegistry';
import { citizenNeeds, type CitizenNeed } from '@/lib/careTeam/graph/resources';

export const DEFAULT_CITIZEN = 'MARIA_SD_001';

export type Sev = 'HIGH' | 'MEDIUM' | 'LOW';
export interface CtxSignal { id: string; label: string; domain: 'Clinical' | 'BH' | 'Social' | 'Eligibility'; severity: Sev; journeyContext: string; dependency: string; sdohAction: string; }
export interface CtxBarrier { category: string; label: string; severity: Sev; intensity: number; keystone: boolean; blocks: string[]; sources: string[]; }
export interface CtxPerson { name: string; relation: string; detail: string; consent: string; }
export interface CtxSource { system: string; recordId: string; nameVariant: string; address: string; risk: string; consent: string; sees: string[]; blindTo: string; color: string; }
export interface CtxLifecycle { label: string; value: string; color: string; }
export interface CtxConsentDomain { domain: string; scope: string; status: string; statusColor: string; icon: string; }
export interface CitizenContext {
  id: string; name: string; age: number; location: string; careManager: string; organization: string; pcp: string;
  signals: CtxSignal[];
  barriers: CtxBarrier[];
  journey: { episode: string; daysActive: number; stageLabel: string; expected: { label: string; ok: boolean; note: string }[] };
  household: { dependents: CtxPerson[]; caregiverFor: CtxPerson[] };
  channel: { primary: string; window: string; note: string };
  providers: { name: string; role: string; distance: string }[];
  sources: CtxSource[];
  benefits: { name: string; status: string }[];
  lifecycle: CtxLifecycle[];
  consentDomains: CtxConsentDomain[];
}

const SEV_INT: Record<string, number> = { HIGH: 82, MEDIUM: 55, MODERATE: 55, LOW: 32 };

function gapSeverity(daysOpen: number, blocked: boolean): Sev {
  if (blocked || daysOpen > 180) return 'HIGH';
  if (daysOpen > 45) return 'MEDIUM';
  return 'LOW';
}
function sdohActionFor(category: string | undefined): string {
  switch (category) {
    case 'Transportation': return 'Home lab kit / telehealth — eliminates the 47-mile trip';
    case 'Financial': return 'Generic substitution + manufacturer copay + benefit enrollment';
    case 'Food': return 'SNAP/WIC re-enrollment + food-resource referral';
    case 'Housing': return 'Housing navigation + utility (LIHEAP) assistance';
    case 'Behavioral Health': return 'BH warm handoff within 42 CFR Part 2 consent scope';
    default: return 'SDOH-aware sequencing applied';
  }
}

export function contextFor(citizenId?: string): CitizenContext {
  const p = getPatientById(citizenId || DEFAULT_CITIZEN) || getPatientById(DEFAULT_CITIZEN)!;
  const needs: CitizenNeed[] = citizenNeeds(p.platformId);
  const blockedGapNames = new Set(needs.flatMap((n) => n.blockedGaps ?? []));

  // ── Signals: from open care gaps (Clinical/BH/Social) + eligibility ──
  const signals: CtxSignal[] = (p.careGaps || [])
    .filter((g) => g.status !== 'Closed')
    .slice(0, 6)
    .map((g) => {
      const blocked = [...blockedGapNames].some((bn) => g.name.includes(bn) || bn.includes(g.name.split(' (')[0]));
      const blocker = needs.find((n) => (n.blockedGaps ?? []).some((bn) => g.name.includes(bn)));
      return {
        id: g.id,
        label: g.name,
        domain: (g.domain === 'Clinical' || g.domain === 'BH' || g.domain === 'Social') ? g.domain : 'Clinical',
        severity: gapSeverity(g.daysOpen, blocked),
        journeyContext: `${p.episodeType} · Day ${p.episodeDaysActive}`,
        dependency: blocked && blocker ? `BLOCKED by ${blocker.label}` : 'None blocking',
        sdohAction: blocked && blocker ? sdohActionFor(blocker.category) : 'Standard outreach protocol',
      } as CtxSignal;
    });
  signals.push({
    id: 'elig', label: 'Eligibility renewal', domain: 'Eligibility', severity: 'MEDIUM',
    journeyContext: `${p.contract} · ${p.attribution}`, dependency: 'None blocking',
    sdohAction: 'Proactive renewal outreach via preferred channel',
  });

  // ── Barriers: from citizenNeeds (graph for Maria, registry-derived for others) ──
  const barriers: CtxBarrier[] = needs.map((n) => ({
    category: n.category, label: n.label, severity: (n.severity === 'MODERATE' ? 'MEDIUM' : n.severity) as Sev,
    intensity: SEV_INT[n.severity] ?? 55, keystone: !!n.keystone, blocks: n.blockedGaps ?? [],
    sources: [p.transportStatus, p.foodSecurity, p.housingStatus].filter(Boolean).slice(0, 2) as string[],
  }));

  // ── Household: dependents (care-gap "(Name)") + caregiver-for (from goal/cohort) ──
  const depNames = Array.from(new Set((p.careGaps || [])
    .map((g) => (g.name.match(/\(([^)]+)\)/) || [])[1]).filter(Boolean) as string[]));
  const dependents: CtxPerson[] = p.household?.dependents?.length
    ? p.household.dependents.map((d) => ({ name: d.name, relation: `${d.relation} · age ${d.age}`, detail: d.gaps[0]?.label ?? 'Pediatric care', consent: d.consent }))
    : depNames.map((n) => ({ name: n, relation: 'Dependent (child)', detail: 'Well-child / pediatric care', consent: 'Parent proxy · ACTIVE' }));
  const caregiverFor: CtxPerson[] = p.household?.caregiverFor?.length
    ? p.household.caregiverFor.map((c) => ({ name: c.name, relation: `Cared-for · ${c.relation}`, detail: c.condition, consent: `Caregiver-scoped · ${c.consentScopeItems.length} domains` }))
    : (/caregiver/i.test(p.cohortFlag || '')
        ? [{ name: 'Elena Redhawk', relation: 'Cared-for (parent)', detail: 'Heart/DM · meds picked up by ' + p.name.split(' ')[0], consent: 'Caregiver-scoped · PENDING' }]
            .filter(() => /MARIA_SD_001/.test(p.platformId))
        : []);

  // ── Sources: fragmented SD systems with conflicting views of this citizen ──
  const [first, ...rest] = p.name.split(' ');
  const last = rest.join(' ');
  const sources: CtxSource[] = [
    { system: 'SD Medicaid · MMIS / Claims', recordId: `SDMCD-${p.ehrMrn}`, nameVariant: `${last}, ${first}`, address: p.location, risk: `RAF ${p.rafScore}`, consent: 'TPO only', sees: ['Eligibility & benefits', 'Claims history', 'Renewal status'], blindTo: 'Clinical episodes, SDOH barriers, BH (42 CFR gated)', color: '#3b82f6' },
    { system: `${p.organization} · CAH EHR`, recordId: `EHR-${p.ehrMrn}`, nameVariant: p.name, address: p.location, risk: p.riskTier, consent: 'Research excluded', sees: ['Clinical record', 'Diagnoses', 'Medication list'], blindTo: 'Medicaid auth, pharmacy fills, social services', color: '#22c55e' },
    { system: 'Martin Pharmacy', recordId: `RX-${p.ehrMrn}`, nameVariant: `${first} ${last[0]}.`, address: 'Martin, SD', risk: 'NOT SCORED', consent: 'Unknown', sees: ['Fills (self + family)', 'Adherence'], blindTo: 'Clinical context, claims, BH', color: '#a855f7' },
    { system: 'RHTP Care Management', recordId: `CM-${p.ehrMrn}`, nameVariant: `${first} ${last[0]}.`, address: p.location, risk: p.riskLabel, consent: 'Partial — care coordination', sees: [`Care manager: ${p.careManager}`, 'Care plan & tasks', 'Open care gaps'], blindTo: 'Benefit-enrollment status, live pharmacy signals', color: '#f59e0b' },
    { system: 'CBO / Social Services', recordId: `CBO-${p.ehrMrn}`, nameVariant: `${first} ${last}`, address: p.location, risk: 'NOT SCORED', consent: 'Program-scoped', sees: ['SNAP/WIC/LIHEAP status', 'Housing waitlist', 'Childcare subsidy'], blindTo: 'Clinical, eligibility, BH', color: '#06b6d4' },
    { system: 'Behavioral Health · Postpartum Support', recordId: `BH-${p.ehrMrn}`, nameVariant: p.name, address: p.location, risk: p.bhRisk, consent: '42 CFR Part 2 — gated', sees: [p.bhScoreLabel, p.bhReferralStatus], blindTo: 'All other systems (consent-gated)', color: '#ef4444' },
  ];

  // ── Benefits ──
  const benefits = [
    { name: 'SD Medicaid', status: 'Active' },
    { name: 'SNAP / WIC', status: p.snapStatus },
    { name: 'Housing', status: p.housingStatus },
  ];

  // ── Journey ──
  const journey = {
    episode: p.episodeType, daysActive: p.episodeDaysActive,
    stageLabel: p.episodeStatus,
    expected: [
      { label: p.bhScreeningLabel + ' follow-up', ok: false, note: `${p.episodeDaysActive}d open — overdue` },
      { label: 'Clinical care gap', ok: false, note: 'SDOH-blocked — needs modified intervention' },
      { label: 'Engagement', ok: true, note: `Preferred channel: ${/low|moderate/i.test(p.digitalAccess) ? 'SMS' : 'portal'}` },
    ],
  };

  // ── Lifecycle events (derived per citizen) ──
  const orgShort = p.organization.replace(/ \(.*\)/, '');
  const lifecycle: CtxLifecycle[] = [
    { label: 'Episode', value: `${p.episodeType} · Day ${p.episodeDaysActive} of 90 (${p.episodeStatus})`, color: '#78a9ff' },
    ...(dependents.length ? [{ label: 'Life events', value: `New dependent registered (${dependents[0].name})`, color: '#ff7eb6' }] : []),
    ...(caregiverFor.length ? [{ label: 'Caregiver status', value: `Caregiver for ${caregiverFor[0].name} — ${caregiverFor[0].detail}`, color: '#c084fc' }] : []),
    { label: 'Benefits', value: p.snapStatus, color: '#f1c21b' },
    { label: 'Last contact', value: p.lastContact, color: '#8d8d8d' },
  ];

  // ── Consent domains (derived per citizen) ──
  const consentDomains: CtxConsentDomain[] = [
    { domain: 'Claims / TPO', scope: 'GRANTED', status: 'Full — HIPAA TPO', statusColor: '#42be65', icon: '\u2713' },
    { domain: 'Clinical / EHR', scope: 'GRANTED', status: 'Care coordination', statusColor: '#42be65', icon: '\u2713' },
    { domain: 'Behavioral Health', scope: 'GATED', status: '42 CFR Part 2 — consent required', statusColor: '#f1c21b', icon: '\u26a0' },
    ...(caregiverFor.length ? [{ domain: `${caregiverFor[0].name.split(' ')[0]} Proxy`, scope: 'SCOPED', status: 'Meds + Appts', statusColor: '#c084fc', icon: '\u2299' }] : []),
    { domain: orgShort, scope: (dependents.length || caregiverFor.length) ? 'PENDING' : 'GRANTED', status: (dependents.length ? 'Not granted' : 'Provider access'), statusColor: dependents.length ? '#9ca3af' : '#42be65', icon: dependents.length ? '\u2717' : '\u2713' },
  ];

  return {
    id: p.platformId, name: p.name, age: p.age, location: p.location, careManager: p.careManager, organization: p.organization, pcp: p.pcp,
    signals, barriers, journey,
    household: { dependents, caregiverFor },
    channel: {
      primary: /low|moderate/i.test(p.digitalAccess) ? 'SMS only' : 'Portal',
      window: '3pm–7pm', note: p.digitalAccess + (/winner|martin|pine ridge|rural/i.test(p.location) ? ' · rural broadband gap' : ''),
    },
    providers: [
      { name: p.organization, role: 'PCP · CAH', distance: '0 miles' },
      { name: 'Cedar Bluff Regional Medical Center', role: 'Specialty · ENT/IM', distance: p.ruralDistance || '47 miles' },
    ],
    sources, benefits, lifecycle, consentDomains,
  };
}
