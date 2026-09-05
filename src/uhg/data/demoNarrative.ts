// Per-patient demo narrative — makes the Demo Navigator contextual to the SELECTED patient.
// Uses the AUTHORITATIVE registry household (getPatientById), NOT contextFor(): the latter
// fabricates a fallback "dependent" from care-gap parentheticals. Two jobs: (1) decide whether a
// beat APPLIES to a patient (household beats drop out when the relationship doesn't exist),
// (2) generate the beat's caption for that patient.
//
// KEY RULE: when the SELECTED patient is the beat's scripted lead (Maria), the authored caption is
// returned VERBATIM — the curated demo copy is never altered. Contextualization + defensive
// neutralization run ONLY when the operator has selected a DIFFERENT patient, so a name-swap can
// never assert a scripted-lead clinical specific (A1C, caregiver burden, a named PCP/CHW, a
// specific procedure or enrollment) onto a member for whom it is false.
import { getPatientById } from '@/lib/patientRegistry';

const HOUSEHOLD_BEAT: Record<string, 'dependents' | 'caregiverFor'> = {
  '/uhg-orchestrate/family-sofia': 'dependents',
  '/uhg-orchestrate/caregiver-elena': 'caregiverFor',
};

/** Does this beat belong in the demo for the selected patient? */
export function beatApplies(route: string, citizenId: string): boolean {
  const need = HOUSEHOLD_BEAT[route];
  if (!need) return true;
  const hh = getPatientById(citizenId)?.household;
  return (hh?.[need]?.length ?? 0) > 0;
}

/** First name only, for caption phrasing. */
function first(name?: string): string {
  return name?.trim().split(/\s+/)[0] ?? 'the member';
}

// Runs ONLY for a non-lead selected patient. Neutralizes scripted-lead (Maria) specifics that
// would read as FALSE for another member, then swaps the lead's name for the selected patient's.
function contextualizeText(authored: string, name: string): string {
  return authored
    .replace(/lumbar MRI/gi, 'imaging prior-auth')
    .replace(/A1C\s*\d+(?:\.\d+)?%\s*(?:→|to|->)\s*\d+(?:\.\d+)?%/gi, 'measurable improvement')
    .replace(/Financial\s*\d+,\s*Caregiver Burden\s*\d+,\s*Transport blocker/gi, 'financial, caregiver, and transport domains')
    .replace(/SNAP enrolled, housing pending, gaps flagged/gi, 'benefit enrollment and gap flags per member')
    .replace(/\bA1C\b/g, 'care gaps') // diabetes-specific metric → generic (safe for non-diabetic members)
    .replace(/caregiver burden/gi, 'whole-person needs') // false for non-caregivers
    .replace(/,?\s*respite first/gi, '')
    .replace(/\bher life\b/gi, 'their life')
    .replace(/\bDr\.?\s+Chen\b/g, 'the care team') // scripted PCP → role (wrong person otherwise)
    .replace(/\bMarcus\b/g, 'the CHW') // scripted CHW → role
    .replace(/\bMaria(['’]s)\b/g, `${name}$1`)
    .replace(/\bMaria\b/g, name);
}

/**
 * Caption for a beat, contextual to the selected patient. Lead selected → authored verbatim.
 * Household beats generate from real relationship data. Everything else runs contextualizeText.
 * Unknown member fails CLOSED (neutralized, no lead identity leak).
 */
export function resolveBeat(
  route: string,
  authored: string,
  activePatient: string | undefined,
  citizenId: string
): string {
  if (!activePatient) return authored; // global narration — never rewrite
  if (citizenId === activePatient) return authored; // scripted lead selected — curated copy intact
  const p = getPatientById(citizenId);
  if (!p) return contextualizeText(authored, 'the member'); // fail closed
  const name = first(p.name);
  const dep = p.household?.dependents?.[0];
  const cg = p.household?.caregiverFor?.[0];
  if (route === '/uhg-orchestrate/family-sofia') {
    return dep
      ? `${name}'s dependent ${first(dep.name)} — ${dep.gaps?.[0]?.label ?? 'pediatric'} gaps orchestrated in the household loop`
      : contextualizeText(authored, name);
  }
  if (route === '/uhg-orchestrate/caregiver-elena') {
    return cg
      ? `${name} as caregiver — ${first(cg.name)}'s ${cg.condition}, polypharmacy, ${cg.pharmacy} refill sync`
      : contextualizeText(authored, name);
  }
  return contextualizeText(authored, name);
}

/** Display name for the "attributed to" badge — the selected patient, not a hardcoded lead. */
export function beatAttribution(
  activePatient: string | undefined,
  citizenId: string
): string | null {
  if (!activePatient) return null;
  return getPatientById(citizenId)?.name ?? null;
}
