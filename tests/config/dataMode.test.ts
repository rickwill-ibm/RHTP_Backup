/**
 * Data-mode registry tests (lib/config/dataMode.ts).
 *
 * Resolution order under test: session override > per-seam env
 * (DATA_MODE_<SEAM>) > global env (DATA_MODE) > legacy compat env > default
 * ('mock').
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  DATA_MODES,
  DATA_MODE_SEAMS,
  DEFAULT_DATA_MODES,
  getDataMode,
  describeDataModes,
  setSessionDataMode,
  clearSessionDataModes,
  seamEnvVar,
} from '@/lib/config/dataMode';

const TOUCHED_ENV = [
  'DATA_MODE',
  'NEXT_PUBLIC_USE_MOCK_DATA',
  ...DATA_MODE_SEAMS.map((s) => seamEnvVar(s)),
  'DATA_MODE_TOTALLY_UNKNOWN',
];
const saved: Record<string, string | undefined> = {};
for (const k of TOUCHED_ENV) saved[k] = process.env[k];

afterEach(() => {
  for (const k of TOUCHED_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  clearSessionDataModes();
});

function unsetAll(): void {
  for (const k of TOUCHED_ENV) delete process.env[k];
}

describe('defaults', () => {
  it('every registered seam defaults to mock (demo stays green)', () => {
    unsetAll();
    for (const seam of DATA_MODE_SEAMS) {
      expect(getDataMode(seam)).toBe('mock');
    }
  });

  it('describeDataModes reports source=default and the env var name', () => {
    unsetAll();
    const desc = describeDataModes();
    expect(desc).toHaveLength(DATA_MODE_SEAMS.length);
    const consent = desc.find((d) => d.seam === 'consent');
    expect(consent).toMatchObject({ mode: 'mock', source: 'default', envVar: 'DATA_MODE_CONSENT' });
    const fhir = desc.find((d) => d.seam === 'fhirStore');
    expect(fhir?.envVar).toBe('DATA_MODE_FHIR_STORE');
  });
});

describe('resolution order', () => {
  it('global DATA_MODE overrides the default for all seams', () => {
    unsetAll();
    process.env.DATA_MODE = 'production';
    for (const seam of DATA_MODE_SEAMS) {
      expect(getDataMode(seam)).toBe('production');
    }
    expect(describeDataModes().every((d) => d.source === 'env-global')).toBe(true);
  });

  it('per-seam env beats global env', () => {
    unsetAll();
    process.env.DATA_MODE = 'production';
    process.env.DATA_MODE_CONSENT = 'seeded';
    expect(getDataMode('consent')).toBe('seeded');
    expect(getDataMode('evidence')).toBe('production');
    const consent = describeDataModes().find((d) => d.seam === 'consent');
    expect(consent?.source).toBe('env-seam');
  });

  it('camelCase seam ids map to upper-snake env vars', () => {
    unsetAll();
    expect(seamEnvVar('fhirStore')).toBe('DATA_MODE_FHIR_STORE');
    expect(seamEnvVar('wpcRecord')).toBe('DATA_MODE_WPC_RECORD');
    process.env.DATA_MODE_FHIR_STORE = 'production';
    expect(getDataMode('fhirStore')).toBe('production');
  });

  it('invalid env values are ignored and resolution falls through', () => {
    unsetAll();
    process.env.DATA_MODE_CONSENT = 'bogus';
    process.env.DATA_MODE = 'also-bogus';
    expect(getDataMode('consent')).toBe('mock');
  });

  it('env values are case-insensitive', () => {
    unsetAll();
    process.env.DATA_MODE = 'Production';
    expect(getDataMode('consent')).toBe('production');
    process.env.DATA_MODE_CONSENT = 'SEEDED';
    expect(getDataMode('consent')).toBe('seeded');
  });

  it('legacy NEXT_PUBLIC_USE_MOCK_DATA feeds fhirStore below DATA_MODE', () => {
    unsetAll();
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
    expect(getDataMode('fhirStore')).toBe('production');
    expect(getDataMode('consent')).toBe('mock'); // legacy var is fhirStore-only

    process.env.DATA_MODE = 'mock';
    expect(getDataMode('fhirStore')).toBe('mock'); // new config wins over legacy
  });
});

describe('unknown seams', () => {
  it('resolve through the same layers (default mock, honors global)', () => {
    unsetAll();
    expect(getDataMode('totallyUnknown')).toBe('mock');
    process.env.DATA_MODE = 'seeded';
    expect(getDataMode('totallyUnknown')).toBe('seeded');
    process.env.DATA_MODE_TOTALLY_UNKNOWN = 'production';
    expect(getDataMode('totallyUnknown')).toBe('production');
  });

  it('are not listed by describeDataModes', () => {
    unsetAll();
    expect(describeDataModes().map((d) => d.seam as string)).not.toContain('totallyUnknown');
  });
});

describe('session override hook (demo toggle layer)', () => {
  it('beats per-seam env, global env, and default', () => {
    unsetAll();
    process.env.DATA_MODE = 'production';
    process.env.DATA_MODE_FHIR_STORE = 'production';
    setSessionDataMode('fhirStore', 'mock');
    expect(getDataMode('fhirStore')).toBe('mock');
    const fhir = describeDataModes().find((d) => d.seam === 'fhirStore');
    expect(fhir?.source).toBe('session');
  });

  it('clears per seam with null and globally with clearSessionDataModes', () => {
    unsetAll();
    setSessionDataMode('consent', 'production');
    setSessionDataMode('graph', 'seeded');
    expect(getDataMode('consent')).toBe('production');

    setSessionDataMode('consent', null);
    expect(getDataMode('consent')).toBe('mock');
    expect(getDataMode('graph')).toBe('seeded');

    clearSessionDataModes();
    expect(getDataMode('graph')).toBe('mock');
  });

  it('only affects the overridden seam', () => {
    unsetAll();
    setSessionDataMode('fhirStore', 'production');
    expect(getDataMode('fhirStore')).toBe('production');
    expect(getDataMode('consent')).toBe('mock');
  });

  it('rejects an invalid mode loudly instead of silently flipping resolution', () => {
    unsetAll();
    expect(() =>
      setSessionDataMode('fhirStore', 'bogus' as unknown as 'mock'),
    ).toThrow(TypeError);
    expect(getDataMode('fhirStore')).toBe('mock'); // resolution unchanged
  });
});

describe('immutability of defaults', () => {
  it('DEFAULT_DATA_MODES, DATA_MODE_SEAMS, and DATA_MODES are frozen', () => {
    expect(Object.isFrozen(DEFAULT_DATA_MODES)).toBe(true);
    expect(Object.isFrozen(DATA_MODE_SEAMS)).toBe(true);
    expect(Object.isFrozen(DATA_MODES)).toBe(true);
  });

  it('attempted mutation does not change resolution', () => {
    unsetAll();
    expect(() => {
      (DEFAULT_DATA_MODES as Record<string, string>).consent = 'production';
    }).toThrow(TypeError); // frozen objects throw in strict mode (ESM)
    expect(DEFAULT_DATA_MODES.consent).toBe('mock');
    expect(getDataMode('consent')).toBe('mock');
  });
});
