// resolveIds — extracted from page.tsx for reuse by hooks and sub-components.
// AI-CODING-CONVENTIONS v2: extracted to prevent frozen file growth.
import { DEMO_PATIENT_ID, DEMO_ENCOUNTER_ID, storeRead } from '@/lib/fhir/store';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

/**
 * Resolve launch-context IDs to FHIR resource IDs.
 * Maria aliases normalise to the seeded demo IDs; in mock mode, patients
 * absent from the fixture store fall back to the demo patient.
 */
export function resolveIds(
  ctx: SmartLaunchContext,
  mock: boolean
): { patientId: string; encounterId: string } {
  const raw = (ctx.patientId ?? '').replace(/^patient\//, '');
  const patientId = raw === '' || raw === 'maria-redhawk-001' ? DEMO_PATIENT_ID : raw;
  if (mock && !storeRead('Patient', patientId)) {
    return { patientId: DEMO_PATIENT_ID, encounterId: DEMO_ENCOUNTER_ID };
  }
  return { patientId, encounterId: ctx.encounterId };
}
