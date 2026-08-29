/**
 * Byte helpers shared by the RTF and DOCX readers (server-only document intake). Split out of
 * `docIntake.ts` for the size cap; behavior unchanged.
 */

/** Decode bytes as latin1 (1 byte → 1 code unit). RTF structure is ASCII; non-ASCII bytes are carried
 *  through verbatim so `\'xx` escapes and codepage bytes are handled downstream. */
export function latin1(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000; // chunk to avoid call-stack limits on very large documents
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

export function bytesStartWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) if (bytes[i] !== sig[i]) return false;
  return true;
}
