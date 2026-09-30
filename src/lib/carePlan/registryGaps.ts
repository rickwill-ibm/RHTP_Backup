/**
 * registryGaps.ts — the TYPED adapter from the patient registry's care-gap shape to the
 * care-plan domain's `CareGap`.
 *
 * WHY: the registry stores a gap's label as `name` (`CareGapEntry`); the care-plan domain
 * reads it as `measureName` (`CareGap`). `/care-plan-monitor/[patientId]` bridged the two
 * with `(patient.careGaps || []) as any`, which silenced tsc and handed the engine objects
 * with no `measureName` — every patient then died on
 * `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.
 *
 * The cast was the defect; the crash was the symptom. This adapter is the seam: the page
 * calls it with a typed `CareGapEntry[]`, so the NEXT shape change is a compile error at the
 * call site rather than an error boundary in front of a care manager.
 *
 * Fields the registry does not carry (`measureId`, `program`, `dueDate`, `lastActionDate`,
 * `notes`, `closureRequirement`) are filled with explicit, honest neutrals — never invented
 * clinical facts. `program` is the domain type's narrowest sane value, `HEDIS`, because the
 * registry's `domain` (Clinical / BH / Social) is not a quality-program identifier and must
 * not be presented as one.
 *
 * Pure: no clock, no IO.
 */
import type { CareGapEntry } from '@/lib/patientRegistry.types';
import type { CareGap } from './types';

/** The neutral used where the registry carries no value for a domain field. */
const UNSPECIFIED = '';

/**
 * Registry gap status → domain `GapStatus`. TOTAL, not a lookup with a default: an
 * unmapped status silently becoming 'Open' would inflate the urgent-action list. The
 * registry's 'Waived' has no domain twin; 'Excluded' is its meaning — out of the measure
 * denominator — and is deliberately NOT 'Open'.
 */
const STATUS_MAP: Record<CareGapEntry['status'], CareGap['status']> = {
  Open: 'Open',
  'In Progress': 'In Progress',
  Closed: 'Closed',
  Waived: 'Excluded',
};

function toCareGap(entry: CareGapEntry, patientId: string): CareGap {
  return {
    id: entry.id,
    patientId,
    // The registry has no measure identifier; the gap id is the only stable handle.
    measureId: entry.id,
    measureName: entry.name,
    program: 'HEDIS',
    status: STATUS_MAP[entry.status],
    dueDate: UNSPECIFIED,
    daysOpen: entry.daysOpen,
    lastActionDate: UNSPECIFIED,
    assignedTo: entry.assignedTo,
    // `domain` is the only descriptive text the registry carries for the gap; surfacing it
    // as the note keeps the SDOH detection's `notes` read meaningful instead of blank.
    notes: entry.domain,
    closureRequirement: UNSPECIFIED,
  };
}

/** Map a registry patient's care gaps onto the care-plan domain shape. */
export function fromRegistryGaps(entries: readonly CareGapEntry[], patientId: string): CareGap[] {
  return entries.map((entry) => toCareGap(entry, patientId));
}
