// CONTRACT: C9  // CONTRACT: C10
/**
 * CBO flat-file SDOH adapter (arrival mode: batch, over a simulated SFTP drop).
 * Proves the flat-file path — the lowest-common-denominator arrival mode, first
 * class because CBO and social-sector data arrives this way. Parses a CSV drop
 * into normalized SDOH Observations at tier T1 with provenance = community-
 * reported. A behavioral-health program column attaches a segmentation hint the
 * shared transform turns into a durable label.
 *
 * C9.2 yield: CBO/HMIS flat file -> SDOH T1 (community-reported provenance).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

interface SdohRow {
  fields: Record<string, string>;
  rowIndex: number;
}

const SOURCE = { system: 'cbo-sftp', feed: 'sdoh-flat-file' } as const;
const REQUIRED = ['member_source_id', 'domain', 'zcode'] as const;

function parse(payload: string): RawRecord<SdohRow>[] {
  const lines = payload
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const fields: Record<string, string> = {};
    header.forEach((h, col) => (fields[h] = cells[col] ?? ''));
    const memberSourceId = fields['member_source_id'] || `row-${i + 1}`;
    return {
      sourceRef: `${memberSourceId}:${fields['domain'] || `r${i + 1}`}`,
      data: { fields, rowIndex: i + 1 },
    };
  });
}

function validate(raw: RawRecord<SdohRow>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  for (const field of REQUIRED) {
    if (!raw.data.fields[field]) issues.push({ reasonCode: `missing-${field}`, fieldPath: field });
  }
  const z = raw.data.fields['zcode'];
  if (z && !/^Z\d{2}(\.\d+)?$/.test(z))
    issues.push({ reasonCode: 'malformed-zcode', fieldPath: 'zcode' });
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<SdohRow>, deps: PipelineDeps): NormalizedRecord {
  const f = raw.data.fields;
  const memberSourceId = f['member_source_id'];
  const memberId = deps.resolveIdentity(memberSourceId, { feed: SOURCE.feed });
  const domain = f['domain'];
  const zcode = f['zcode'];
  const key = hashKey(`${memberSourceId}:${domain}:${f['screen_date'] ?? ''}`);
  const positive = (f['result'] ?? '').toLowerCase() === 'positive';
  const payload: Record<string, unknown> = {
    responseRef: `Observation/sdoh-${key}`,
    domain,
    zCode: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: zcode },
    positive,
    provenance: 'community-reported',
  };
  const program = (f['program'] ?? '').toLowerCase();
  if (program.includes('sud') || program.includes('substance'))
    payload.segmentationHints = ['part2-sud'];
  else if (program.includes('behavioral') || program.includes('mental'))
    payload.segmentationHints = ['behavioral-health'];
  return {
    domain: 'sdoh',
    memberId,
    resourceType: 'Observation',
    fhirResourceId: `Observation/sdoh-${key}`,
    eventType: 'sdoh.screening.completed',
    tier: 'T1',
    idempotencyKey: `sdoh:${memberSourceId}:${domain}:${f['screen_date'] ?? ''}`,
    provenance: 'community-reported',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: f['screen_date']
      ? `${f['screen_date']}T00:00:00Z`
      : new Date(deps.now()).toISOString(),
    payload,
  };
}

function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** The CBO flat-file SDOH adapter. */
export const cboSdohAdapter: DomainAdapter<SdohRow> = {
  source: SOURCE,
  domain: 'sdoh',
  format: 'flat-file-csv',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
