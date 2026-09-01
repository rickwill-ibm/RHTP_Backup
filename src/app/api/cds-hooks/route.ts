/**
 * CDS Hooks Discovery endpoint
 * GET /api/cds-hooks
 * Returns the list of registered hooks per the CDS Hooks specification.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    services: [
      {
        hook: 'patient-view',
        title: 'TCOC Patient View',
        description:
          'Surfaces care gaps, BH risk, and social needs when a patient record is opened.',
        id: 'tcoc-patient-view',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
      {
        hook: 'encounter-start',
        title: 'TCOC Encounter Start',
        description: 'Surfaces priority CDS alerts at the start of an encounter.',
        id: 'tcoc-encounter-start',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
          encounter: 'Encounter/{{context.encounterId}}',
        },
      },
      {
        hook: 'order-sign',
        title: 'TCOC Order Sign',
        description:
          'Medication-safety CDS: drug-drug interaction checks + STAT-order validation (NOT coverage/CRD).',
        id: 'tcoc-order-sign',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
      {
        hook: 'order-select',
        title: 'RHTP Coverage Requirements (CRD)',
        description:
          'Surfaces prior-authorization / coverage-requirement cards when a clinician selects an order. Advisory CDS Hooks card delivery — not Da Vinci CRD coverage-information system-actions.',
        id: 'rhtp-crd-order-select',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
    ],
  });
}
