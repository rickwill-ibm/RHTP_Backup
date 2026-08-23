import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Da Vinci CDex-conformant DocumentReference construction.
 * Ported from PA-Standalone-SmartApp — no external dependencies.
 */
import type { DocumentReference } from './pa-types';

export interface UploadedFileMeta {
  name: string;
  type: string;
  size: number;
}

export interface CdexContext {
  patientId: string;
  groupId: number;
  groupTitle: string;
  creation?: string;
}

export function buildCdexDocumentReference(
  file: UploadedFileMeta,
  ctx: CdexContext
): DocumentReference {
  const creation = ctx.creation ?? clock.nowIso();
  return {
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: 'preliminary',
    type: {
      coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summary of episode note' }],
      text: 'Supporting clinical documentation',
    },
    category: [
      {
        coding: [
          {
            system: 'http://hl7.org/fhir/us/davinci-cdex/CodeSystem/cdex-temp-code-system',
            code: 'attachment',
            display: 'CDex Attachment',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${ctx.patientId}` },
    date: creation,
    content: [
      {
        attachment: {
          contentType: file.type || 'application/octet-stream',
          title: file.name,
          size: file.size,
          creation,
        },
      },
    ],
    context: {
      related: [{ display: `DTR requirement group ${ctx.groupId}: ${ctx.groupTitle}` }],
    },
  };
}

export function summarizeDocumentReference(doc: DocumentReference): string {
  const attachment = doc.content[0]?.attachment;
  const status = doc.docStatus === 'preliminary' ? 'pending clinical confirmation' : 'confirmed';
  return `Uploaded: ${attachment?.title ?? 'document'} — ${status}`;
}
