'use client';

/**
 * Evidence Record timeline (reviewer UI). Presentational + accessible: renders
 * the append-only entries of a Coverage Determination Record as an ordered list.
 */
import type { EvidenceRecord, EvidenceEntry } from '@/lib/evidence';

const STAGE_LABEL: Record<string, string> = {
  eligibility: 'Eligibility',
  'medical-necessity': 'Medical Necessity',
  'prior-auth': 'Prior Authorization',
  'patient-estimation': 'Patient Estimation',
};

function summarizeEntry(e: EvidenceEntry): string {
  switch (e.type) {
    case 'eligibility':
      return `Coverage ${e.requiresPA ? 'requires PA' : 'no PA required'}${e.note ? ` — ${e.note}` : ''}`;
    case 'coverage-determination':
      return `Determination: ${e.determination.outcome} (requiresPA=${e.determination.requiresPA}, submission-readiness score ${e.determination.propensityToDeny})`;
    case 'gold-card':
      return `Gold card ${e.exemption.applied ? 'APPLIED — PA waived' : 'not applied'} — ${e.exemption.reason}`;
    case 'propensity':
      return `Submission-readiness (completeness) score ${e.score}/100 (${e.band})`;
    case 'dtr-response':
      return `DTR response (${e.itemCount} items)`;
    case 'pas-submission':
      return `PAS submitted by ${e.approver.display} (${e.approver.reference})`;
    case 'pas-decision':
      return `Payer decision: ${e.decision}${e.reasons?.length ? ` — ${e.reasons.join('; ')}` : ''}`;
    case 'note':
      return e.text;
    default:
      return '';
  }
}

export function EvidenceTimeline({ record }: { record: EvidenceRecord }): React.ReactElement {
  return (
    <ol className="space-y-3" aria-label={`Evidence record ${record.id} timeline`}>
      {record.entries.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span
            className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"
            aria-hidden
          />
          <div>
            <p className="font-medium">
              {STAGE_LABEL[e.stage] ?? e.stage}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                {e.type}
              </span>
            </p>
            <p className="text-slate-700">{summarizeEntry(e)}</p>
            <p className="text-xs text-slate-400">
              <time dateTime={e.ts}>{e.ts.replace('T', ' ').slice(0, 19)}</time> ·{' '}
              {e.actor ?? 'system'}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
