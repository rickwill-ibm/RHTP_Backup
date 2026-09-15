import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { log } from '@/lib/server/log'; // structured logging seam (see src/lib/server/log.ts)
/**
 * patientService.ts — TCOC Patient Service Wrapper
 *
 * Rick's FHIR Plan Section 6.2 — abstraction layer that pages call instead of
 * directly importing fhirClient.  All patient data access (read, search, write)
 * flows through this module so we have one place to:
 *   • toggle mock vs. live mode
 *   • handle errors / retries
 *   • add server-side auth headers in future
 *
 * Usage:
 *   import { patientService } from '@/lib/services/patientService';
 *   const patient = await patientService.getPatient('patient-dorothy-042');
 */

import type { RegistryPatient } from '../patientRegistry';
import {
  getPatientById,
  getAllPatients as registryGetAll,
  PLATFORM_TO_FHIR_ID_MAP,
} from '../patientRegistry';
import { getFhirClient, getFhirMockMode } from './fhirClient';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get a single patient by platform ID (e.g. 'PAT-0042') or FHIR ID.
 * In mock mode returns registry data.  In live mode fetches from HAPI FHIR.
 */
export async function getPatient(platformOrFhirId: string): Promise<RegistryPatient | undefined> {
  if (getFhirMockMode()) {
    return getPatientById(platformOrFhirId) ?? undefined;
  }
  // Resolve platform ID → canonical FHIR ID
  const fhirId = PLATFORM_TO_FHIR_ID_MAP[platformOrFhirId] ?? platformOrFhirId;
  return getFhirClient().getRegistryPatient(fhirId);
}

/**
 * Get all patients in the panel.
 * In mock mode returns the full registry.  In live mode fetches from HAPI FHIR.
 */
export async function getAllPatients(): Promise<RegistryPatient[]> {
  if (getFhirMockMode()) {
    const { getAllPatients: getAll } = await import('../patientRegistry');
    return getAll();
  }
  return getFhirClient().getAllRegistryPatients();
}

/**
 * Synchronous registry lookup — always returns registry data regardless of
 * FHIR mode.  Used by components that cannot be async (e.g. PatientSwitcherDropdown).
 */
export function getAllRegistryPatients(): RegistryPatient[] {
  return registryGetAll();
}

/**
 * Synchronous single-patient lookup — always reads from registry.
 */
export function getPatientSync(platformId: string): RegistryPatient | undefined {
  return getPatientById(platformId) ?? undefined;
}

// ─── Write — gap closure ──────────────────────────────────────────────────────

/**
 * Upsert a gap closure Observation.
 * PUT if obsId is provided (pre-seeded by migration), POST otherwise.
 */
export async function upsertGapObservation(
  fhirPatientId: string,
  gapId: string,
  obsId: string | undefined,
  data: {
    dateOfService?: string;
    performingProvider?: string;
    procedureCode?: string;
    resultValue?: number;
    resultUnit?: string;
    hedisCompliance?: string;
  }
): Promise<{ id: string }> {
  const now = clock.nowIso();
  const BASE = 'http://tcoc.example.org/fhir/StructureDefinition';
  const resource: Record<string, unknown> = {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'survey',
            display: 'Survey',
          },
        ],
      },
    ],
    code: {
      coding: [{ system: 'http://loinc.org', code: data.procedureCode ?? '83036', display: gapId }],
      text: gapId,
    },
    subject: { reference: `Patient/${fhirPatientId}` },
    effectiveDateTime: data.dateOfService ?? now,
    ...(data.resultValue !== undefined
      ? { valueQuantity: { value: data.resultValue, unit: data.resultUnit ?? '%' } }
      : {}),
    extension: [
      { url: `${BASE}/tcoc-gap-id`, valueString: gapId },
      { url: `${BASE}/care-gap-status`, valueString: 'Closed' },
      ...(data.hedisCompliance
        ? [{ url: `${BASE}/hedis-compliance`, valueString: data.hedisCompliance }]
        : []),
      ...(data.performingProvider
        ? [{ url: `${BASE}/performing-provider`, valueString: data.performingProvider }]
        : []),
    ],
    note: [{ text: `Gap closed via patientService on ${now}` }],
  };

  if (obsId) {
    return getFhirClient().update({ ...resource, id: obsId } as Record<string, unknown> & {
      id: string;
    }) as Promise<{ id: string }>;
  }
  return getFhirClient().create(resource) as Promise<{ id: string }>;
}

/**
 * Mark a FHIR Task as completed.
 * ID pattern: patient-{fhirId}-task-{gapId}
 */
export async function completeTask(fhirPatientId: string, gapId: string): Promise<void> {
  const taskId = `patient-${fhirPatientId}-task-${gapId}`;
  await getFhirClient().update({
    id: taskId,
    resourceType: 'Task',
    status: 'completed',
    intent: 'order',
    lastModified: clock.nowIso(),
    output: [
      {
        type: { text: 'Gap Closure Evidence' },
        valueReference: { reference: `Observation/patient-${fhirPatientId}-gap-${gapId}` },
      },
    ],
  });
}

/**
 * PUT a CareTeam member update (e.g. after care manager reassignment).
 */
export async function updateCareTeamMember(
  fhirPatientId: string,
  roleName: string,
  newMemberDisplay: string
): Promise<void> {
  const client = getFhirClient();
  const careTeamId = `${fhirPatientId}-careteam`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await client.read<any>('CareTeam', careTeamId);
    if (!existing || existing.resourceType !== 'CareTeam') return;
    const BASE = 'http://tcoc.example.org/fhir/StructureDefinition/careteam-role';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedParticipants = (existing.participant ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const role = p.extension?.find((e: any) => e.url === BASE)?.valueString;
      if (role === roleName) return { ...p, member: { display: newMemberDisplay } };
      return p;
    });
    await client.update({ ...existing, participant: updatedParticipants, id: careTeamId });
  } catch {
    // CareTeam may not exist for all patients (expected); logged so the skip is visible (silent-failure audit).
    log.debug('patientService.careTeam.updateSkipped', { careTeamId, role: roleName });
  }
}

/**
 * POST a social screening AuditEvent to FHIR.
 */
export async function postScreeningAuditEvent(
  fhirPatientId: string,
  screeningType: string,
  domainsScreened: string[]
): Promise<void> {
  await getFhirClient().create({
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [
      { system: 'http://hl7.org/fhir/restful-interaction', code: 'create', display: 'create' },
    ],
    action: 'C',
    recorded: clock.nowIso(),
    outcome: '0',
    agent: [{ who: { display: 'TCOC Platform' }, requestor: true }],
    source: { observer: { display: 'TCOC-PatientService' } },
    entity: [
      { what: { reference: `Patient/${fhirPatientId}` }, type: { code: '1', display: 'Person' } },
      {
        what: { display: screeningType },
        type: { code: '4', display: 'Other' },
        detail: [{ type: 'domains', valueBase64Binary: btoa(domainsScreened.join(', ')) }],
      },
    ],
  });
}

// ─── Namespace export (Rick's plan Section 6.2 interface) ─────────────────────
export const patientService = {
  getPatient,
  getAllPatients,
  upsertGapObservation,
  completeTask,
  updateCareTeamMember,
  postScreeningAuditEvent,
};
