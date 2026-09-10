/**
 * FHIR R4 HTTP Client
 *
 * A thin, fetch-based FHIR R4 client.  When NEXT_PUBLIC_USE_MOCK_DATA=true
 * every method short-circuits to return empty / stub data so the app works
 * without a live FHIR server.
 *
 * When NEXT_PUBLIC_USE_MOCK_DATA=false the client issues real HTTP requests
 * against NEXT_PUBLIC_FHIR_BASE_URL (default http://localhost:8090/fhir).
 */

import type { RegistryPatient } from '../patientRegistry';
import { storeRead, storeSearch, storeCreate, storeUpdate, storeDelete } from '../fhir/store';

const FHIR_BASE = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8090/fhir';

const TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_FHIR_TIMEOUT ?? 30_000);

// Runtime-overridable mock flag.
// Starts from env var but can be toggled at runtime via setFhirMockMode().
let _useMock = (process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? 'true').toLowerCase() === 'true';

/** Toggle mock mode at runtime — called by the FHIR/Mock toggle in the UI. */
export function setFhirMockMode(mock: boolean): void {
  _useMock = mock;
}

/** Read current mock mode — useful for components that need to check. */
export function getFhirMockMode(): boolean {
  return _useMock;
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
    if (_useMock) {
      console.debug(`[FhirClient][mock] read ${resourceType}/${id}`);
      // Serve from the fixture store (same bundles that seed HAPI);
      // fall back to the legacy stub shape if the fixture is absent.
      return storeRead<T>(resourceType, id) ?? ({ resourceType, id } as T);
    }
    return fhirFetch<T>(`${resourceType}/${id}`);
  }

  /** Create a resource (server assigns id) */
  async create<T = unknown>(resource: Record<string, unknown>): Promise<T> {
    if (_useMock) {
      console.debug(`[FhirClient][mock] create ${resource.resourceType}`);
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
    if (_useMock) {
      console.debug(`[FhirClient][mock] update ${resource.resourceType}/${resource.id}`);
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
    if (_useMock) {
      console.debug(`[FhirClient][mock] search ${resourceType}`, params);
      return storeSearch<T>(resourceType, params);
    }
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    return fhirFetch<T>(`${resourceType}?${qs}`);
  }

  /** Delete a resource */
  async delete(resourceType: string, id: string): Promise<void> {
    if (_useMock) {
      console.debug(`[FhirClient][mock] delete ${resourceType}/${id}`);
      storeDelete(resourceType, id);
      return;
    }
    await fhirFetch<void>(`${resourceType}/${id}`, { method: 'DELETE' });
  }

  // ── High-level patient helpers ──────────────────────────────────────────────

  /**
   * DaVinci HRex $member-match
   * POST /Patient/$member-match — identifies a payer member from a provider-supplied
   * demographic + coverage record.  Used for Provider Access and Payer-to-Payer.
   *
   * Returns the matched FHIR Patient reference (e.g. "Patient/123") or null.
   */
  async memberMatch(params: {
    memberPatient: Record<string, unknown>;
    coverageToMatch: Record<string, unknown>;
    consentToAccess: Record<string, unknown>;
  }): Promise<string | null> {
    if (_useMock) {
      const id = (params.memberPatient.id as string | undefined) ?? 'demo-matched-001';
      return `Patient/${id}`;
    }
    const body = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'MemberPatient', resource: params.memberPatient },
        { name: 'CoverageToMatch', resource: params.coverageToMatch },
        { name: 'Consent', resource: params.consentToAccess },
      ],
    };
    try {
      const result = await fhirFetch<{
        parameter?: Array<{ name: string; valueReference?: { reference: string } }>;
      }>('Patient/$member-match', { method: 'POST', body: JSON.stringify(body) });
      return (
        result.parameter?.find((p) => p.name === 'MemberIdentifier')?.valueReference?.reference ??
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Fetch a patient from HAPI FHIR by FHIR id and inflate it into a
   * RegistryPatient including related Observations, Flags, and RiskAssessment.
   *
   * Returns undefined if not found.
   */
  async getRegistryPatient(fhirPatientId: string): Promise<RegistryPatient | undefined> {
    if (_useMock) return undefined;

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

      const observations = bundleEntries(obsBundle as never, 'Observation');
      const flags = bundleEntries(flagBundle as never, 'Flag');
      const risks = bundleEntries(riskBundle as never, 'RiskAssessment');
      const conditions = bundleEntries(condBundle as never, 'Condition');
      const medications = bundleEntries(medBundle as never, 'MedicationRequest');
      const fhirCareTeam = careTeam?.resourceType === 'CareTeam' ? careTeam : undefined;
      const encounters = bundleEntries(encounterBundle as never, 'Encounter');
      const goals = bundleEntries(goalBundle as never, 'Goal');

      return mapFhirPatientToRegistryPatient(
        patient as never,
        observations as never,
        flags as never,
        risks[0] as never,
        conditions as never,
        medications as never,
        fhirCareTeam as never,
        encounters as never,
        goals as never
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
    if (_useMock) return [];

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
