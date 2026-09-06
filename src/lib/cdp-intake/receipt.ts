// cdp-intake/receipt.ts — content hashing + the PHI-safe intake receipt.
//
// The receipt is a THIN INDEX over what landed: file, sourceSystem, format, adapter,
// arrivalMode, size, and a content sha256 — never payload values. It mirrors the
// discipline of the pipeline's LandedBatch (checksum + verbatim replay) and
// LoadReconciliationRecord (counts/ids only) rather than duplicating them.

import { createHash } from 'node:crypto';
import type { ClassifiedFile, IntakeReceipt } from './types';

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function buildReceipt(
  dir: string,
  classified: ClassifiedFile[],
  receivedAt: string
): IntakeReceipt {
  const receiptId = sha256(
    `${dir}|${classified.map((c) => `${c.file}:${c.sha256}`).join(',')}`
  ).slice(0, 16);
  return {
    receiptId,
    dir,
    receivedAt,
    files: classified.map((c) => ({
      file: c.file,
      sourceSystem: c.sourceSystem,
      format: c.format,
      adapter: c.adapter,
      arrivalMode: c.arrivalMode,
      bytes: c.bytes,
      sha256: c.sha256,
    })),
  };
}
