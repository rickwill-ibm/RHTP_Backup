// storyNarrative.profile.ts — derived-profile helpers for Story Mode generation.
//
// Every value here traces to the patient registry — no fabricated clinical claims.
// buildProfile(p) collapses a RegistryPatient into a Profile of prose-ready facts;
// the phrase helpers turn those facts into gender-correct, barrier-honest sentences.
// Consumed by storyNarrative.genChapters.ts and storyNarrative.genSteps.ts.

import type { RegistryPatient } from '../../lib/patientRegistry.types';

// ─── Derived-profile helpers (every value traces to the registry) ───────────────

type Pron = {
  subj: string; obj: string; adj: string; pos: string; refl: string;
  Subj: string; Adj: string;
};
function pronouns(gender: string): Pron {
  const g = (gender || '').trim().toUpperCase();
  if (g.startsWith('F'))
    return { subj: 'she', obj: 'her', adj: 'her', pos: 'hers', refl: 'herself', Subj: 'She', Adj: 'Her' };
  if (g.startsWith('M'))
    return { subj: 'he', obj: 'him', adj: 'his', pos: 'his', refl: 'himself', Subj: 'He', Adj: 'His' };
  return { subj: 'they', obj: 'them', adj: 'their', pos: 'theirs', refl: 'themselves', Subj: 'They', Adj: 'Their' };
}

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}
// Possessive of a first name; handles a trailing "s".
export function poss(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function cleanLocation(loc: string): string {
  if (!loc) return 'their community';
  const m = loc.match(/([A-Za-z][A-Za-z ]+?)\s+SD\b/);
  if (m) return m[1].trim();
  if (/service area/i.test(loc)) return `the ${loc.split(/\s+/)[0]} region`;
  return loc.replace(/\s*\(CAH\)/i, '').trim();
}

function milesFrom(ruralDistance: string): number {
  const m = (ruralDistance || '').match(/(\d+)\s*mile/i);
  return m ? Number(m[1]) : 0;
}

// Most salient RESULTED lab with a value + flag — the honest clinical anchor.
function primaryLab(p: RegistryPatient): { name: string; result: string } | null {
  const o = (p.recentOrders || []).find(
    (r) =>
      r.status === 'Resulted' &&
      !!r.result &&
      /\d/.test(r.result) &&
      (r.flag === 'High' || r.flag === 'Critical' || r.flag === 'Low')
  );
  return o ? { name: o.name, result: o.result } : null;
}

// A metric embedded inside a condition name, e.g. "(BMI 38)" or "(HbA1c 6.2%)".
function conditionMetric(p: RegistryPatient): string | null {
  for (const c of p.conditions || []) {
    const m = c.name.match(/\(([^)]*\d[^)]*)\)/);
    if (m) return m[1].trim();
  }
  return null;
}

export function labFriendly(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('hba1c') || n.includes('a1c')) return 'A1C';
  if (n.includes('bp')) return 'blood pressure';
  if (n.includes('egfr')) return 'kidney function (eGFR)';
  if (n.includes('bnp')) return 'BNP';
  return name;
}

function topClinicalGap(p: RegistryPatient) {
  return (p.careGaps || []).find((g) => g.domain === 'Clinical' && g.status !== 'Closed') || null;
}

// Lay phrase for each condition token in episodeType.
const DISEASE_PHRASE: Record<string, string> = {
  'copd exacerbation': 'a COPD flare-up',
  copd: 'COPD',
  chf: 'heart failure',
  diabetes: 'diabetes',
  hypertension: 'high blood pressure',
  ckd: 'declining kidney function',
  asthma: 'asthma',
  obesity: 'obesity',
  'postpartum health': 'postpartum recovery',
};
function diseaseList(p: RegistryPatient): string[] {
  return (p.episodeType || '')
    .split('·')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => DISEASE_PHRASE[t.toLowerCase()] || t.toLowerCase());
}

function transportBarrier(p: RegistryPatient): boolean {
  return !!p.transportStatus && !/adequate/i.test(p.transportStatus);
}
function foodInsecure(p: RegistryPatient): boolean {
  return /insecur/i.test(p.foodSecurity || '');
}
function housingUnstable(p: RegistryPatient): boolean {
  return /waitlist|unstable|instab|homeless|eviction|shelter/i.test(p.housingStatus || '');
}
function snapActive(p: RegistryPatient): boolean {
  return /active/i.test(p.snapStatus || '');
}
function socialGapPhrase(p: RegistryPatient): string | null {
  const social = (p.careGaps || []).filter((g) => g.domain === 'Social');
  if (social.some((g) => /medication cost|cost assistance/i.test(g.name))) return 'Medication Cost';
  if (social.some((g) => /nutrition/i.test(g.name))) return 'Nutrition';
  return null;
}

// PRAPARE-style domains that are genuinely flagged (food / transport / housing).
function prapareDomains(p: RegistryPatient): string[] {
  const d: string[] = [];
  if (foodInsecure(p)) d.push('Food Insecurity');
  if (transportBarrier(p)) d.push('Transportation');
  if (housingUnstable(p)) d.push('Housing');
  return d;
}

function bhInclude(p: RegistryPatient): boolean {
  if (p.bhRisk && p.bhRisk !== 'Low') return true;
  if (/audit/i.test(p.bhScreeningLabel || '') && (p.auditC || 0) >= 4) return true;
  if (/phq/i.test(p.bhScreeningLabel || '') && (p.bhScore || 0) >= 8) return true;
  return false;
}
function bhFinding(p: RegistryPatient): string {
  if (/audit/i.test(p.bhScreeningLabel || ''))
    return `a low-to-moderate alcohol-use risk (AUDIT-C ${p.auditC})`;
  if (/phq/i.test(p.bhScreeningLabel || '') && p.bhScore != null) {
    const s = p.bhScore;
    const sev =
      s >= 20 ? 'severe depression'
      : s >= 15 ? 'moderately severe depression'
      : s >= 10 ? 'moderate depression'
      : s >= 5 ? 'mild depression'
      : 'minimal depressive symptoms';
    return `${sev} (PHQ-9 ${s})`;
  }
  if (/edinburgh/i.test(p.bhScreeningLabel || '') && p.bhScore != null)
    return `postpartum depression (Edinburgh ${p.bhScore})`;
  return (p.bhScoreLabel || 'a behavioral-health screen').toLowerCase();
}
function bhProviderStatus(p: RegistryPatient): string {
  if (/not referred/i.test(p.bhReferralStatus || '') || !p.bhProvider || p.bhProvider === '—')
    return 'no BH provider assigned yet';
  if (/open/i.test(p.bhReferralStatus || ''))
    return `referred to ${p.bhProvider}, still awaiting engagement`;
  return `referred to ${p.bhProvider}`;
}

// Real pending order / referral / imaging / procedure for the Prior-Auth beat.
function priorAuthItem(p: RegistryPatient): string {
  const candidates = (p.recentOrders || []).filter(
    (o) => /Imaging|Procedure|Referral/i.test(o.type) && /Ordered|Pending/i.test(o.status)
  );
  const pick = candidates[0];
  if (!pick) return 'a specialist referral';
  const n = pick.name.toLowerCase();
  if (/cardiac mri|mri/.test(n)) return 'a cardiac MRI';
  if (/nephrology/.test(n)) return 'a nephrology referral';
  if (/cardiology/.test(n)) return 'a cardiology consult';
  if (/ophthalmology/.test(n)) return 'an ophthalmology referral';
  if (/weight management/.test(n)) return 'a weight-management program referral';
  if (/nutrition/.test(n)) return 'a nutrition-counseling referral';
  return `a ${pick.name.toLowerCase()}`;
}

export function money(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US');
}

// Clinical-goal text for a given measure keyword (from the real care plan), date trimmed.
function clinicalGoal(p: RegistryPatient, kw: RegExp): string | null {
  const cl = (p.carePlanDomains || []).find((d) => d.domain === 'Clinical');
  const g = cl?.goals.find((x) => kw.test(x.goal));
  return g ? g.goal.replace(/\s+by\s+.*$/i, '').trim() : null;
}

export interface Profile {
  p: RegistryPatient;
  id: string;
  name: string;
  first: string;
  possFirst: string;
  P: Pron;
  age: number;
  place: string;
  isRural: boolean;
  ruralText: string;
  org: string;
  pcp: string;
  cm: string;
  diseases: string[];
  diseasesStr: string;
  anchorLab: { name: string; result: string } | null;
  condMetric: string | null;
  topGap: ReturnType<typeof topClinicalGap>;
  bhOn: boolean;
  bhText: string;
  bhProv: string;
  transport: boolean;
  food: boolean;
  housing: boolean;
  snap: boolean;
  socialFlag: string | null;
  prapare: string[];
  caregiver: NonNullable<RegistryPatient['household']>['caregiverFor'] extends (infer T)[] | undefined ? T | null : null;
  dependent: NonNullable<RegistryPatient['household']>['dependents'] extends (infer T)[] | undefined ? T | null : null;
  paItem: string;
}

export function buildProfile(p: RegistryPatient): Profile {
  const P = pronouns(p.gender);
  const first = firstName(p.name);
  const caregiver = p.household?.caregiverFor?.[0] || null;
  const dependent = p.household?.dependents?.[0] || null;
  const diseases = diseaseList(p);
  return {
    p,
    id: p.platformId,
    name: p.name,
    first,
    possFirst: poss(first),
    P,
    age: p.age,
    place: cleanLocation(p.location),
    isRural: milesFrom(p.ruralDistance) >= 15,
    ruralText: p.ruralDistance,
    org: p.organization.replace(/\s*\(CAH\)/i, '').trim(),
    pcp: p.pcp,
    cm: p.careManager,
    diseases,
    diseasesStr: joinList(diseases),
    anchorLab: primaryLab(p),
    condMetric: conditionMetric(p),
    topGap: topClinicalGap(p),
    bhOn: bhInclude(p),
    bhText: bhFinding(p),
    bhProv: bhProviderStatus(p),
    transport: transportBarrier(p),
    food: foodInsecure(p),
    housing: housingUnstable(p),
    snap: snapActive(p),
    socialFlag: socialGapPhrase(p),
    prapare: prapareDomains(p),
    caregiver: caregiver as Profile['caregiver'],
    dependent: dependent as Profile['dependent'],
    paItem: priorAuthItem(p),
  };
}

// Clean a raw care-gap name for prose: drop parentheticals, fix A1C casing,
// lowercase common trailing verbs ("Recheck", "Follow-up", …).
export function niceGap(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\ba1c\b/gi, 'A1C')
    .replace(/\bRecheck\b/g, 'recheck')
    .replace(/\bFollow-up\b/g, 'follow-up')
    .replace(/\bScreening\b/g, 'screening')
    .replace(/\bUpdate\b/g, 'update')
    .replace(/\bLab\b/g, 'lab')
    .replace(/\s+—\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// "BMI 38" → "BMI of 38"; "HbA1c 6.2%" → "A1C of 6.2%".
export function condMetricNice(cm: string): string {
  const m = cm.match(/^(\S+)\s+(.+)$/);
  if (!m) return cm;
  const unit = /hba1c/i.test(m[1]) ? 'A1C' : m[1];
  return `${unit} of ${m[2]}`;
}

export function joinList(items: string[]): string {
  const a = items.filter(Boolean);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}

// Short clinical descriptor (real): a resulted lab, else a condition metric, else the overdue gap.
export function clinicalFlagPhrase(f: Profile): string {
  if (f.anchorLab) return `${labFriendly(f.anchorLab.name)} at ${f.anchorLab.result}`;
  if (f.condMetric) return `a ${condMetricNice(f.condMetric)}`;
  if (f.topGap) return `${niceGap(f.topGap.name)} ${f.topGap.daysOpen} days overdue`;
  return f.diseases[0] || 'a chronic condition';
}

// The dominant social barrier, phrased in prose (or null if none is real).
export function socialBarrierPhrase(f: Profile): string | null {
  if (f.transport) return 'a transportation barrier';
  if (f.food) return 'food insecurity';
  if (f.housing) return 'unstable housing';
  if (f.socialFlag === 'Medication Cost') return 'a medication-cost barrier';
  if (f.socialFlag === 'Nutrition') return 'a nutrition-support need';
  return null;
}

export function caregiverClause(f: Profile): string | null {
  const cg = f.caregiver as any;
  if (!cg) return null;
  const rel = String(cg.relation || 'relative').toLowerCase();
  const cond = String(cg.condition || '').split('+')[0].trim();
  const lay =
    /dementia/i.test(cond) ? 'dementia'
    : /alzheimer/i.test(cond) ? "Alzheimer's"
    : /stroke/i.test(cond) ? 'the effects of a stroke'
    : cond.toLowerCase();
  return `${f.P.Subj} also cares for ${f.P.adj} ${cg.age ? cg.age + '-year-old ' : ''}${rel} ${cg.name}, who lives with ${lay}`;
}

export function dependentClause(f: Profile): string | null {
  const d = f.dependent as any;
  if (!d) return null;
  const rel = String(d.relation || 'child').toLowerCase();
  const gapWord = (d.gaps && d.gaps[0]?.label) || '';
  const extra = /asthma/i.test(gapWord)
    ? `, who has asthma of ${rel === 'son' ? 'his' : rel === 'daughter' ? 'her' : 'their'} own`
    : '';
  return `${f.P.Subj} is also raising ${f.P.adj} ${d.age ? d.age + '-year-old ' : ''}${rel} ${d.name}${extra}`;
}

// The outcomes-linkage metric (step 11): real baseline + real documented goal.
export function outcomeMetric(f: Profile): { label: string; value: string } {
  const lab = f.anchorLab;
  if (lab && /hba1c|a1c/i.test(lab.name)) {
    const g = clinicalGoal(f.p, /a1c/i);
    return { label: `${f.possFirst} A1C`, value: `${lab.result}${g ? ` → goal ${g.replace(/^A1C\s*/i, '')}` : ''}` };
  }
  if (lab && /bp/i.test(lab.name)) {
    const g = clinicalGoal(f.p, /bp|blood pressure/i);
    return { label: `${f.possFirst} Blood Pressure`, value: `${lab.result}${g ? ` → goal ${g.replace(/^BP\s*/i, '')}` : ''}` };
  }
  if (lab) {
    return { label: `${f.possFirst} ${labFriendly(lab.name)}`, value: lab.result };
  }
  // No resulted anchor lab — fall back to a condition metric or the overdue clinical gap.
  if (f.condMetric) {
    const g = clinicalGoal(f.p, /bmi|weight/i);
    return { label: `${f.possFirst} ${f.condMetric.split(/\s+/)[0]}`, value: `${f.condMetric.replace(/^\S+\s*/, '') || f.condMetric}${g ? ` → ${g.replace(/^BMI reduction\s*/i, 'goal ')}` : ''}` };
  }
  const gA1c = clinicalGoal(f.p, /a1c/i);
  if (f.topGap) return { label: `${f.possFirst} ${labFriendly(niceGap(f.topGap.name))}`, value: `recheck due${gA1c ? ` → goal ${gA1c.replace(/^A1C\s*/i, '')}` : ''}` };
  return { label: `${f.possFirst} Care Plan`, value: 'on track' };
}

// Domains-flagged metric (step 8): real flagged domains, else the real social flag, else none.
export function flaggedMetric(f: Profile): { label: string; value: string } {
  const label = `Domains Flagged for ${f.first}`;
  if (f.prapare.length)
    return { label, value: `${f.prapare.length} — ${f.prapare.join(' + ')}` };
  if (f.socialFlag) return { label, value: `1 — ${f.socialFlag}` };
  return { label, value: '0 — none acute' };
}
