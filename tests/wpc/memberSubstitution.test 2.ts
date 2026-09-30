/**
 * NO SCREEN SUBSTITUTES ONE MEMBER FOR ANOTHER.
 *
 * THE DEFECT THESE LOCK, measured before the fix. The patient registry holds five members
 * (`MARIA_SD_001`, `PAT-0042`, `PAT-0087`, `PAT-0103`, `PAT-0156`). `patient-detail`'s
 * `MOCK_ID_TO_PLATFORM_ID` maps those plus `patient-001`…`patient-004` and `patient-maria`.
 * Six ids that the app's OWN navigation emits were in neither:
 *
 *   specialist-inbox      → `PAT-0113` ("Margaret Okonkwo"), `PAT-0201` ("Patricia Nguyen")
 *   mockReferrals         → `patient-005`, `patient-006`, `patient-011`, `patient-012`
 *
 * `patientContext.getInitialState()` ended in a bare `return defaultMariaState`, so each of
 * those clicks rendered MARIA REDHAWK'S MRN, DOB, RAF score, HCC suspects, care gaps and BH
 * risk under the name of the member the operator had asked for. A wrong-patient record, two
 * clicks into the demo, with every gate green — because the only gate for this class was a
 * COUNT RATCHET at 80 over `src/app` alone, and the root cause was one directory outside it.
 *
 * WHAT IS ASSERTED HERE, and what is asserted where. These tests pin the RESOLUTION
 * contract — which ids resolve, which do not, and that an unresolved one yields no member
 * rather than a substituted one. The render-path guard (`patient-detail` returning
 * `MemberScopeNotice` before mounting `PatientContextProvider`) is a client component and is
 * covered by `scripts/check-member-substitution.sh`, a zero-tolerance gate, plus the
 * browser walk. The two are complementary: a unit test cannot prove a screen renders the
 * notice, and a grep cannot prove an id resolves.
 */
import { describe, expect, it } from 'vitest';
import { getAllPatients, getPatientById } from '@/lib/patientRegistry';
import { buildStateFromRegistry } from '@/lib/patientContext.builders';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

/** Every id the registry actually knows. */
const REGISTRY_IDS = getAllPatients().map((p) => p.platformId);

/** Ids the app's own navigation emits that the registry does NOT know. */
const UNRESOLVABLE = [
  'PAT-0113', // specialist-inbox — "Margaret Okonkwo"
  'PAT-0201', // specialist-inbox — "Patricia Nguyen"
  'patient-005',
  'patient-006',
  'patient-011',
  'patient-012',
] as const;

describe('the registry is the single source of member truth', () => {
  it('knows exactly the five seeded members, named explicitly so a silent change is visible', () => {
    // Pinned as a SET, not a count: a count of five is satisfied by five wrong members, and
    // the whole defect class here is "a different member than the one asked for".
    expect(new Set(REGISTRY_IDS)).toEqual(
      new Set(['MARIA_SD_001', 'PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'])
    );
  });

  it('the configured demo member is one of them', () => {
    // If `DEMO_MEMBER_ID` ever pointed outside the registry, every screen that falls back to
    // it would fail closed — the guard would fire on the golden demo itself.
    expect(REGISTRY_IDS).toContain(DEMO_MEMBER_ID);
  });

  it('every known id resolves to ITS OWN record, not to a shared default', () => {
    // The property that matters: distinct ids yield distinct members. A fall-through default
    // passes an "every id resolves" test while collapsing all of them onto one person.
    const names = REGISTRY_IDS.map((id) => getPatientById(id)?.name);
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(REGISTRY_IDS.length);
  });
});

describe('an unresolvable member resolves to NOTHING, never to another member', () => {
  it.each(UNRESOLVABLE)('%s is not in the registry (the premise of the case below)', (id) => {
    // Asserted rather than assumed: if one of these is later added to the registry, this case
    // fails and tells the author to move it out of the list instead of quietly testing nothing.
    expect(getPatientById(id)).toBeUndefined();
  });

  it.each(UNRESOLVABLE)('%s builds NO patient state — the fall-through is gone', (id) => {
    expect(buildStateFromRegistry(id)).toBeNull();
  });

  it('and does not resolve to the demo member, which is the exact substitution', () => {
    const demo = getPatientById(DEMO_MEMBER_ID);
    expect(demo).toBeDefined();
    for (const id of UNRESOLVABLE) {
      const state = buildStateFromRegistry(id);
      // Not merely null — explicitly NOT the demo member's record, because the defect was a
      // silent substitution and `null` alone does not say which member was avoided.
      expect(state?.name).not.toBe(demo?.name);
      expect(state?.mrn).not.toBe(demo?.ehrMrn);
    }
  });

  it('an empty or whitespace id resolves to nothing', () => {
    expect(buildStateFromRegistry('')).toBeNull();
    expect(getPatientById('')).toBeUndefined();
  });
});

describe('the substitution gate covers the path the count ratchet could not see', () => {
  it('the root-cause file is inside the zero-tolerance gate scope', async () => {
    // The count ratchet scans `src/app/**/*.tsx`. The root cause lived in
    // `src/lib/patientContext.tsx`. This pins that the new gate's scope is `src`, so the same
    // blind spot cannot be reintroduced by narrowing it back.
    const { readFileSync } = await import('node:fs');
    const gate = readFileSync('scripts/check-member-substitution.sh', 'utf8');
    expect(gate).toMatch(/grep -rnE .* src /);
    expect(gate).not.toMatch(/grep -rnE .* src\/app /);
    // And it must be a zero check, not a ratchet — a baseline would be green with the defect.
    expect(gate).toMatch(/COUNT" -eq 0/);
  });
});
