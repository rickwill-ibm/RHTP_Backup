// launch.helpers.ts — audit-id + launch-context id resolution extracted from the page
// render layer (AI-CODING-CONVENTIONS §3).
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import { DEMO_PATIENT_ID, DEMO_ENCOUNTER_ID, storeRead } from '@/lib/fhir/store';

let auditSeq = 0;
export function makeAuditId(): string {
  auditSeq += 1;
  return `AUD-${Date.now().toString(36).toUpperCase()}-${String(auditSeq).padStart(3, '0')}`;
}

/**
 * Resolve launch-context IDs to FHIR resource IDs.
 * The launch context carries the ?patientId= passed by the RHTP menu /
 * patient switcher (see SmartLaunchHandler), so the app opens for the
 * patient currently selected in RHTP — replacing the old smart app's
 * entry behavior. Maria aliases normalize to the seeded demo IDs; in
 * mock mode, patients absent from the fixture store fall back to the
 * demo patient so the demo always renders.
 */
export function resolveIds(
  ctx: SmartLaunchContext,
  mock: boolean
): { patientId: string; encounterId: string } {
  const raw = (ctx.patientId ?? '').replace(/^patient\//, '');
  const patientId = raw === '' || raw === 'maria-redhawk-001' ? DEMO_PATIENT_ID : raw;
  if (patientId === DEMO_PATIENT_ID) {
    return { patientId: DEMO_PATIENT_ID, encounterId: DEMO_ENCOUNTER_ID };
  }
  if (mock && !storeRead('Patient', patientId)) {
    return { patientId: DEMO_PATIENT_ID, encounterId: DEMO_ENCOUNTER_ID };
  }
  return { patientId, encounterId: ctx.encounterId };
}
