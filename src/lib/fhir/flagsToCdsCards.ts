/**
 * flagsToCdsCards
 *
 * Converts a patient's active FHIR Flag resources into CdsCard objects for
 * the MD SmartApp CDS Alerts column.
 *
 * Used for non-Maria patients whose Flags carry their own clinical alerts.
 * Maria (DEMO_PATIENT_ID) keeps the authored mockCdsCards narrative — this
 * function is never called for her, so mock mode is unaffected.
 *
 * Flag → CdsCard mapping:
 *   Flag.code.text           → CdsCard.summary
 *   cds-detail extension     → CdsCard.detail
 *   Flag code system code    → indicator (warning | info → card type)
 *   Flag.period.start        → included in detail as gap age
 */
import type { CdsCard } from '@/lib/smartFhirTypes';
import type { FhirFlag } from './types';
import { ccText } from './types';

const CDS_DETAIL_URL = 'http://tcoc.example.org/fhir/StructureDefinition/cds-detail';

function indicatorFromFlag(flag: FhirFlag): 'critical' | 'warning' | 'info' {
  const code = flag.code?.coding?.find((c) => c.system?.includes('cds-indicator'))?.code;
  if (code === 'critical' || code === 'error') return 'critical';
  if (code === 'warning') return 'warning';
  return 'info';
}

function detailFromFlag(flag: FhirFlag): string | undefined {
  const ext = (
    flag as unknown as { extension?: Array<{ url?: string; valueString?: string }> }
  ).extension?.find((e) => e.url === CDS_DETAIL_URL);
  return ext?.valueString;
}

/** Days open from Flag.period.start; undefined if not set. */
function daysOpen(flag: FhirFlag): number | undefined {
  const start = flag.period?.start;
  if (!start) return undefined;
  const days = Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000);
  return days >= 0 ? days : undefined;
}

export function flagsToCdsCards(flags: FhirFlag[], patientId: string): CdsCard[] {
  return flags
    .filter((f) => f.status === 'active' && f.code)
    .map((f, i) => {
      const indicator = indicatorFromFlag(f);
      const days = daysOpen(f);
      const summary = ccText(f.code) + (days !== undefined ? ` — ${days} days` : '');
      const detail = detailFromFlag(f);
      return {
        id: f.id ?? `flag-card-${patientId}-${i}`,
        hookType: 'patient-view' as const,
        cardType:
          indicator === 'critical' ? 'critical' : indicator === 'warning' ? 'warning' : 'info',
        summary,
        detail,
        source: 'CDS Hooks / Care Gap Engine',
        indicator,
        timestamp: new Date().toISOString(),
      } satisfies CdsCard;
    });
}
