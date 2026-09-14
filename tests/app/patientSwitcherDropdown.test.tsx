// @vitest-environment jsdom
/**
 * patientSwitcherDropdown.test.tsx — does the RHTP platform's topbar patient
 * selector actually change patients AND pass that to the Cerner SmartApp?
 *
 * Directly answers two of the user's original questions:
 *   (3) "Can I use the patient selector in the RHTP platform, change patients,
 *        and have that info passed to the Cerner SmartApp?"
 *   (2) "Will the patient selector still work in demo (mock mode) vs Live FHIR?"
 *
 * SOURCE OF TRUTH: src/components/PatientSwitcherDropdown.tsx (read in full for
 * this test). On click it always calls setActiveCitizen(platformId) (global
 * demo store), and ADDITIONALLY calls router.replace('/md-smart-launch?...')
 * — but only when pathname starts with '/md-smart-launch' AND a FHIR id exists
 * for that platform id in PLATFORM_TO_FHIR_ID_MAP. The replace URL is built
 * from `new URLSearchParams(window.location.search)` (i.e. it starts from
 * whatever query params are already on the URL, then only sets/overwrites
 * patientId + patientName) — so an existing `?dataMode=mock|live` param
 * survives a patient switch untouched. That is the actual mechanism by which
 * "mock vs live" keeps working across a patient change: this component makes
 * no mock/live decision itself, it just doesn't clobber the param that does.
 *
 * Renders the REAL component against the REAL registry/store (no fixture
 * doubles for patient data) — only next/navigation is mocked, since it
 * doesn't exist outside a Next.js app router render tree.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

const replaceSpy = vi.fn();
let mockPathname = '/md-smart-launch';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
}));

import PatientSwitcherDropdown from '@/components/PatientSwitcherDropdown';
import { useDemoStore } from '@/uhg/store/demoStore';
import { getAllRegistryPatients } from '@/lib/services/patientService';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';

beforeEach(() => {
  replaceSpy.mockReset();
  useDemoStore.setState({ activeCitizenId: 'MARIA_SD_001' });
  mockPathname = '/md-smart-launch';
  window.history.pushState(null, '', '/md-smart-launch');
});

afterEach(() => cleanup());

function openDropdown() {
  render(<PatientSwitcherDropdown />);
  fireEvent.click(screen.getByTitle('Switch active patient'));
}

// Click the patient's row INSIDE the open panel, not the trigger button (which
// also shows the currently-active patient's name and would collide with a
// plain getByText when that patient is already active).
function clickPatientRow(name: string) {
  const matches = screen.getAllByText(name);
  fireEvent.click(matches[matches.length - 1]);
}

describe('PatientSwitcherDropdown — registry coverage (all seeded patients)', () => {
  it('renders every patient the registry actually contains', () => {
    openDropdown();
    const registryNames = getAllRegistryPatients()
      .map((p) => p.name)
      .sort();
    expect(registryNames).toEqual(
      ['Dorothy Simmons', 'James Wilson', 'Lisa Thompson', 'Maria Redhawk', 'Robert Chen'].sort()
    );
    for (const name of registryNames) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('KNOWN GAP: Alex Kirby (PAT-0200) is fully resolvable but cannot be selected from this dropdown', () => {
    // The resolver chain (resolvePatientId.ts) and PLATFORM_TO_FHIR_ID_MAP both
    // fully support her ...
    expect(PLATFORM_TO_FHIR_ID_MAP['PAT-0200']).toBe('patient-alex-kirby');
    // ... but patientRegistry.data4.ts's REGISTRY_PART4 (the list this dropdown
    // actually renders from) is empty — "No registry patient record for Alex
    // yet — she is a FHIR-only test patient." So she is unreachable through
    // this UI: a user can never pick her via the platform's patient selector,
    // only by a direct/deep link with her ID already known.
    openDropdown();
    expect(screen.queryByText('Alex Kirby')).not.toBeInTheDocument();
  });
});

describe('PatientSwitcherDropdown — switching propagates to the SmartApp, mock AND live', () => {
  const REGISTRY_PATIENTS = [
    { platformId: 'MARIA_SD_001', name: 'Maria Redhawk', fhirId: 'patient-maria-001' },
    { platformId: 'PAT-0042', name: 'Dorothy Simmons', fhirId: 'patient-dorothy-042' },
    { platformId: 'PAT-0087', name: 'James Wilson', fhirId: 'patient-james-087' },
    { platformId: 'PAT-0103', name: 'Robert Chen', fhirId: 'patient-robert-103' },
    { platformId: 'PAT-0156', name: 'Lisa Thompson', fhirId: 'patient-lisa-156' },
  ] as const;

  for (const p of REGISTRY_PATIENTS) {
    for (const mode of ['mock', 'live'] as const) {
      it(`${p.name} — ${mode} mode: updates the global active patient and router.replace's the SmartApp URL with her FHIR id`, () => {
        window.history.pushState(null, '', `/md-smart-launch?dataMode=${mode}`);
        openDropdown();
        clickPatientRow(p.name);

        expect(useDemoStore.getState().activeCitizenId).toBe(p.platformId);
        expect(replaceSpy).toHaveBeenCalledTimes(1);

        const url = replaceSpy.mock.calls[0][0] as string;
        expect(url.startsWith('/md-smart-launch?')).toBe(true);
        const params = new URLSearchParams(url.split('?')[1]);
        expect(params.get('patientId')).toBe(p.fhirId);
        expect(params.get('patientName')).toBe(p.name);
        // The data-mode toggle survives the switch untouched — proves mock vs.
        // live is orthogonal to, and unbroken by, patient switching.
        expect(params.get('dataMode')).toBe(mode);
      });
    }
  }

  it('does not inject a dataMode param that was not already on the URL (no forced mode)', () => {
    window.history.pushState(null, '', '/md-smart-launch');
    openDropdown();
    clickPatientRow('Dorothy Simmons');
    const url = replaceSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('dataMode')).toBe(false);
  });

  it('preserves unrelated existing query params (not just dataMode) across a switch', () => {
    window.history.pushState(null, '', '/md-smart-launch?dataMode=live&debug=1');
    openDropdown();
    clickPatientRow('Robert Chen');
    const url = replaceSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('debug')).toBe('1');
    expect(params.get('dataMode')).toBe('live');
    expect(params.get('patientId')).toBe('patient-robert-103');
  });
});

describe('PatientSwitcherDropdown — off the SmartApp route', () => {
  it('still updates the global active patient, but does NOT navigate when not on /md-smart-launch', () => {
    mockPathname = '/knowledge-graph-population-and-maria-subgraph';
    window.history.pushState(null, '', '/knowledge-graph-population-and-maria-subgraph');
    openDropdown();
    clickPatientRow('James Wilson');
    expect(useDemoStore.getState().activeCitizenId).toBe('PAT-0087');
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
