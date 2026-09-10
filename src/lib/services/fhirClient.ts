/**
 * FHIR R4 HTTP Client
 *
 * A thin, fetch-based FHIR R4 client. The 'fhirStore' seam of the data-mode
 * registry (lib/config/dataMode.ts) decides its behavior: in 'mock'/'seeded'
 * mode every method serves the in-memory fixture store so the app works
 * without a live FHIR server; in 'production' mode the client issues real
 * HTTP requests against NEXT_PUBLIC_FHIR_BASE_URL (default
 * http://localhost:8080/fhir). Legacy NEXT_PUBLIC_USE_MOCK_DATA still works
 * via the registry's compat layer.
 */

import type { RegistryPatient } from '../patientRegistry';
import { getDataMode, setSessionDataMode } from '../config/dataMode';
import { storeRead, storeSearch, storeCreate, storeUpdate, storeDelete } from '../fhir/store';

const FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';

const TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_FHIR_TIMEOUT ?? 30_000);

// SEAM: fhirStore — mode-registry switch point (lib/config/dataMode.ts).
// 'mock' / 'seeded' serve the in-memory fixture store; 'production' issues real
// HTTP requests. Config: DATA_MODE_FHIR_STORE / DATA_MODE (legacy
// NEXT_PUBLIC_USE_MOCK_DATA still honored below them); the UI FHIR/Mock toggle
// layers on top as a session override via setFhirMockMode().
function isMockMode(): boolean {
  return getDataMode('fhirStore') !== 'production';
}

/** Toggle mock mode at runtime — called by the FHIR/Mock toggle in the UI. */
export function setFhirMockMode(mock: boolean): void {
  setSessionDataMode('fhirStore', mock ? 'mock' : 'production');
}

/** Read current mock mode — useful for components that need to check. */
export function getFhirMockMode(): boolean {
  return isMockMode();
}

// ─── Low-level fetch wrapper ──────────────────────────────────────────────────

async function fhirFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${FHIR_BASE}/${path.replace(/^\//, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`FHIR ${res.status} ${res.statusText} — ${path}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class FhirClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? FHIR_BASE;
  }

  /** Read a single resource by type and id */
  async read<T = unknown>(resourceType: string, id: string): Promise<T> {
    if (isMockMode()) {
      // Serve from the fixture store (same bundles that seed HAPI);
      // fall back to the legacy stub shape if the fixture is absent.
      return storeRead<T>(resourceType, id) ?? ({ resourceType, id } as T);
    }
    return fhirFetch<T>(`${resourceType}/${id}`);
  }

  /** Create a resource (server assigns id) */
  async create<T = unknown>(resource: Record<string, unknown>): Promise<T> {
    if (isMockMode()) {
      // Persist to the in-memory fixture store so demo write-back flows work.
      return storeCreate<T>(resource);
    }
    return fhirFetch<T>(`${resource.resourceType}`, {
      method: 'POST',
      body: JSON.stringify(resource),
    });
  }

  /** Update (PUT) a resource — id must be set on the resource */
  async update<T = unknown>(resource: Record<string, unknown> & { id: string }): Promise<T> {
    if (isMockMode()) {
      return storeUpdate<T>(resource);
    }
    return fhirFetch<T>(`${resource.resourceType}/${resource.id}`, {
      method: 'PUT',
      body: JSON.stringify(resource),
    });
  }

  /** Search for resources */
  async search<T = unknown>(
    resourceType: string,
    params: Record<string, string | number | boolean>
  ): Promise<T> {
    if (isMockMode()) {
      return storeSearch<T>(resourceType, params);
    }
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    return fhirFetch<T>(`${resourceType}?${qs}`);
  }

  /** Delete a resource */
  async delete(resourceType: string, id: string): Promise<void> {
    if (isMockMode()) {
      storeDelete(resourceType, id);
      return;
    }
    await fhirFetch<void>(`${resourceType}/${id}`, { method: 'DELETE' });
  }

  // ── High-level patient helpers ──────────────────────────────────────────────

  /**
   * Fetch a patient from HAPI FHIR by FHIR id and inflate it into a
   * RegistryPatient including related Observations, Flags, and RiskAssessment.
   *
   * Returns undefined if not found.
   */
  async getRegistryPatient(fhirPatientId: string): Promise<RegistryPatient | undefined> {
    if (isMockMode()) return undefined;

    try {
      const { mapFhirPatientToRegistryPatient, bundleEntries } =
        await import('./fhirResourceMappers');

      const [
        patient,
        obsBundle,
        flagBundle,
        riskBundle,
        condBundle,
        medBundle,
        careTeam,
        encounterBundle,
        goalBundle,
      ] = await Promise.all([
        fhirFetch<{ resourceType: string; id: string }>(`Patient/${fhirPatientId}`).catch(
          () => undefined
        ),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `Observation?subject=Patient/${fhirPatientId}&_count=200`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `Flag?subject=Patient/${fhirPatientId}&_count=100`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `RiskAssessment?subject=Patient/${fhirPatientId}&_count=5`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `Condition?patient=${fhirPatientId}&_count=50`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `MedicationRequest?patient=${fhirPatientId}&status=active&_count=50`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; id: string }>(`CareTeam/${fhirPatientId}-careteam`).catch(
          () => undefined
        ),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `Encounter?patient=${fhirPatientId}&_count=20&_sort=-date`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
        fhirFetch<{ resourceType: string; entry?: unknown[] }>(
          `Goal?patient=${fhirPatientId}&_count=50`
        ).catch(() => ({ resourceType: 'Bundle', entry: [] })),
      ]);

      if (!patient || patient.resourceType !== 'Patient') return undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const observations = bundleEntries(obsBundle as any, 'Observation') as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flags = bundleEntries(flagBundle as any, 'Flag') as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const risks = bundleEntries(riskBundle as any, 'RiskAssessment') as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conditions = bundleEntries(condBundle as any, 'Condition') as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const medications = bundleEntries(medBundle as any, 'MedicationRequest') as any[];
      const fhirCareTeam = careTeam?.resourceType === 'CareTeam' ? careTeam : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encounters = bundleEntries(encounterBundle as any, 'Encounter') as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const goals = bundleEntries(goalBundle as any, 'Goal') as any[];

      return mapFhirPatientToRegistryPatient(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patient as any,
        observations,
        flags,
        risks[0],
        conditions,
        medications,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fhirCareTeam as any,
        encounters,
        goals
      );
    } catch (err) {
      console.error(`[FhirClient] getRegistryPatient(${fhirPatientId}) failed:`, err);
      return undefined;
    }
  }

  /**
   * Fetch all patients from HAPI FHIR and return them as RegistryPatient[].
   * Falls back to empty array on error.
   */
  async getAllRegistryPatients(): Promise<RegistryPatient[]> {
    if (isMockMode()) return [];

    try {
      const bundle = await fhirFetch<{
        resourceType: string;
        entry?: { resource?: { id?: string } }[];
      }>('Patient?_count=100');
      const ids = (bundle.entry ?? [])
        .map((e) => e.resource?.id)
        .filter((id): id is string => !!id);

      const patients = await Promise.all(ids.map((id) => this.getRegistryPatient(id)));
      return patients.filter((p): p is RegistryPatient => !!p);
    } catch (err) {
      console.error('[FhirClient] getAllRegistryPatients() failed:', err);
      return [];
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: FhirClient | null = null;

export function getFhirClient(): FhirClient {
  if (!_instance) _instance = new FhirClient();
  return _instance;
}

export const fhirClient = { getFhirClient };
