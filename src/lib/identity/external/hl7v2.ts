/**
 * HL7v2 ER7 codec + PIX/PDQ (QBP/RSP) message layer.
 *
 * REAL query construction and response parsing for the HL7v2 identity family:
 *   PIX  QBP^Q23 / RSP^K23  — Patient Identifier Cross-referencing (ITI-9)
 *   PDQ  QBP^Q22 / RSP^K22  — Patient Demographics Query (ITI-21)
 *
 * This module is pure and transport-free: it turns a PixQuery/PdqQuery into an
 * ER7 request string and parses an ER7 response string back into the seam's
 * PixResponse/PdqResponse. The MLLP/socket send is a separate injected transport
 * (types.ts Hl7v2Transport) so the query/parse logic is testable against a fake
 * MPI without a live endpoint. Encoding is ER7 (pipe-and-hat), the field default.
 */
import type {
  CrossReferenceStatus,
  ExternalPatientIdentifier,
  PdqCandidate,
  PdqQuery,
  PdqResponse,
  PixPdqConfig,
  PixQuery,
  PixResponse,
} from './types';

// ── ER7 delimiters (as declared in MSH-1 / MSH-2) ────────────────────────────
const FIELD = '|';
const COMP = '^';
const REP = '~';
const SUB = '&';
const SEG = '\r';
const ENCODING_CHARS = `${COMP}${REP}\\${SUB}`; // ^~\&

/** A parsed ER7 message: ordered segments, each a field array (field 0 = seg id). */
export interface Er7Message {
  segments: string[][];
}

/** Split an ER7 wire string into segments/fields. Tolerant of \r, \n, or \r\n. */
export function parseEr7(raw: string): Er7Message {
  const segments = raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(FIELD));
  return { segments };
}

/** The first segment with the given id (e.g. 'PID'), or undefined. */
export function segment(msg: Er7Message, id: string): string[] | undefined {
  return msg.segments.find((s) => s[0] === id);
}

/** Every segment with the given id (e.g. all 'PID' in a PDQ response). */
export function segments(msg: Er7Message, id: string): string[][] {
  return msg.segments.filter((s) => s[0] === id);
}

/** A CX identifier field: `value^^^&OID&ISO` -> {assigningAuthority, value}. */
export function parseCx(field: string): ExternalPatientIdentifier | null {
  if (!field) return null;
  const comps = field.split(COMP);
  const value = comps[0] ?? '';
  if (!value) return null;
  // CX.4 (assigning authority) is component index 3: `&OID&ISO` (HD sub-components).
  const authority = comps[3] ?? '';
  const authSubs = authority.split(SUB);
  // HD: namespaceId & universalId & universalIdType — the OID is the universalId.
  const oid = authSubs[1] || authSubs[0] || '';
  return { assigningAuthority: oid, value };
}

/** Encode an identifier as a CX field: `value^^^&OID&ISO`. */
export function encodeCx(id: ExternalPatientIdentifier): string {
  return `${id.value}${COMP}${COMP}${COMP}${SUB}${id.assigningAuthority}${SUB}ISO`;
}

function msh(config: PixPdqConfig, messageType: string, controlId: string): string {
  // MSH-1 is the field separator; MSH-2 the encoding chars. Fields after that:
  // sendingApp | sendingFac | receivingApp | receivingFac | dt || msgType | ctrlId | P | 2.5.1
  return [
    'MSH',
    ENCODING_CHARS,
    config.sendingApplication,
    config.sendingFacility,
    config.receivingApplication,
    config.receivingFacility,
    '', // timestamp (deterministic: filled by caller-supplied controlId flow if needed)
    '',
    messageType,
    controlId,
    'P',
    '2.5.1',
  ].join(FIELD);
}

// ── PIX  QBP^Q23 (build) / RSP^K23 (parse) ───────────────────────────────────

/** Build the ER7 QBP^Q23 PIX cross-reference query for a source patient id. */
export function buildPixQuery(query: PixQuery, config: PixPdqConfig, controlId: string): string {
  const queryTag = `PIX${controlId}`;
  const personId = encodeCx({
    assigningAuthority: query.sourceAssigningAuthority,
    value: query.sourcePatientId,
  });
  const qpdParts = ['QPD', 'IHE PIX Query^^HL7', queryTag, personId];
  // QPD-4: the domains to return (What Domains Returned), repetition-separated.
  const targets = query.targetAssigningAuthorities ?? [];
  if (targets.length > 0) {
    qpdParts.push(targets.map((oid) => `${COMP}${COMP}${COMP}${SUB}${oid}${SUB}ISO`).join(REP));
  }
  const segmentsOut = [
    msh(config, 'QBP^Q23^QBP_Q21', controlId),
    qpdParts.join(FIELD),
    `RCP${FIELD}I`,
  ];
  return segmentsOut.join(SEG);
}

function qakStatus(msg: Er7Message): CrossReferenceStatus {
  const qak = segment(msg, 'QAK');
  const code = (qak?.[2] ?? '').toUpperCase();
  if (code === 'OK') return 'resolved';
  if (code === 'NF') return 'not-found';
  if (code === 'AE' || code === 'AR') return 'ambiguous';
  // MSA-1 fallback (AA=accept, AE/AR=error).
  const msa = segment(msg, 'MSA');
  const ack = (msa?.[1] ?? '').toUpperCase();
  if (ack === 'AE' || ack === 'AR') return 'ambiguous';
  return 'not-found';
}

/**
 * Parse an RSP^K23 PIX response. The enterprise id is the returned PID-3
 * repetition whose assigning authority matches the enterprise OID; the remaining
 * repetitions are the peer-domain cross references. Ambiguity (an application
 * error / multiple enterprise ids) yields status 'ambiguous'.
 */
export function parsePixResponse(raw: string, enterpriseOid: string): PixResponse {
  const msg = parseEr7(raw);
  const status = qakStatus(msg);
  const pid = segment(msg, 'PID');
  const ids: ExternalPatientIdentifier[] = [];
  if (pid) {
    const pid3 = pid[3] ?? '';
    for (const rep of pid3.split(REP)) {
      const cx = parseCx(rep);
      if (cx) ids.push(cx);
    }
  }
  const enterpriseMatches = ids.filter((id) => id.assigningAuthority === enterpriseOid);
  const peers = ids.filter((id) => id.assigningAuthority !== enterpriseOid);

  if (status !== 'resolved' || enterpriseMatches.length === 0) {
    return {
      status:
        enterpriseMatches.length > 1 ? 'ambiguous' : status === 'resolved' ? 'not-found' : status,
      enterpriseId: '',
      enterpriseAssigningAuthority: enterpriseOid,
      crossReferences: peers,
    };
  }
  if (enterpriseMatches.length > 1) {
    return {
      status: 'ambiguous',
      enterpriseId: '',
      enterpriseAssigningAuthority: enterpriseOid,
      crossReferences: peers,
    };
  }
  return {
    status: 'resolved',
    enterpriseId: enterpriseMatches[0].value,
    enterpriseAssigningAuthority: enterpriseOid,
    crossReferences: peers,
  };
}

// ── PDQ  QBP^Q22 (build) / RSP^K22 (parse) ───────────────────────────────────

/** Build the ER7 QBP^Q22 PDQ demographics query from PHI-minimal traits. */
export function buildPdqQuery(query: PdqQuery, config: PixPdqConfig, controlId: string): string {
  const queryTag = `PDQ${controlId}`;
  const t = query.traits;
  // QPD-3 for PDQ is a repetition of @field^value demographic search parameters (ITI-21).
  const params: string[] = [];
  if (t.family) params.push(`@PID.5.1.1${COMP}${t.family}`);
  if (t.given) params.push(`@PID.5.2${COMP}${t.given}`);
  if (t.birthDate) params.push(`@PID.7.1${COMP}${t.birthDate.replace(/-/g, '')}`);
  if (t.gender) params.push(`@PID.8${COMP}${genderToHl7(t.gender)}`);
  for (const id of t.identifiers ?? []) {
    params.push(`@PID.3.1${COMP}${id.value}`);
  }
  const qpd = ['QPD', 'IHE PDQ Query^^HL7', queryTag, params.join(REP)].join(FIELD);
  const rcp = query.maxResults
    ? `RCP${FIELD}I${FIELD}${query.maxResults}${COMP}RD`
    : `RCP${FIELD}I`;
  return [msh(config, 'QBP^Q22^QBP_Q21', controlId), qpd, rcp].join(SEG);
}

function genderToHl7(g: NonNullable<PdqQuery['traits']['gender']>): string {
  switch (g) {
    case 'male':
      return 'M';
    case 'female':
      return 'F';
    case 'other':
      return 'O';
    default:
      return 'U';
  }
}

function hl7ToGender(code: string): PdqCandidate['traits']['gender'] {
  switch ((code || '').toUpperCase()) {
    case 'M':
      return 'male';
    case 'F':
      return 'female';
    case 'O':
      return 'other';
    default:
      return 'unknown';
  }
}

/**
 * Parse an RSP^K22 PDQ response into candidates. Each PID segment is a candidate;
 * a following QRI segment carries the responder match weight (QRI-1) mapped to the
 * seam's 0-100 confidence. The enterprise id is the PID-3 repetition in the
 * enterprise assigning authority (falls back to the first id).
 */
export function parsePdqResponse(raw: string, enterpriseOid: string): PdqResponse {
  const msg = parseEr7(raw);
  const candidates: PdqCandidate[] = [];
  // Walk segments so each PID keeps its trailing QRI (if any).
  const segs = msg.segments;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i][0] !== 'PID') continue;
    const pid = segs[i];
    const qri = segs[i + 1]?.[0] === 'QRI' ? segs[i + 1] : undefined;
    const ids: ExternalPatientIdentifier[] = [];
    for (const rep of (pid[3] ?? '').split(REP)) {
      const cx = parseCx(rep);
      if (cx) ids.push(cx);
    }
    // E9: a candidate with no id in the enterprise assigning authority cannot
    // supply an enterprise anchor. Keep the candidate (so it still counts toward
    // dominance/ambiguity) but leave enterpriseId EMPTY — never fabricate an
    // enterprise anchor from a peer-domain id. decideDemographic HOLDS an
    // empty-anchor top candidate rather than auto-linking to a wrong-domain id.
    const enterprise = ids.find((id) => id.assigningAuthority === enterpriseOid);
    const name = (pid[5] ?? '').split(COMP);
    const confidence = parseQriWeight(qri);
    candidates.push({
      enterpriseId: enterprise?.value ?? '',
      enterpriseAssigningAuthority: enterpriseOid,
      traits: {
        family: name[0] || undefined,
        given: name[1] || undefined,
        birthDate: formatHl7Date(pid[7] ?? ''),
        gender: hl7ToGender(pid[8] ?? ''),
        identifiers: ids,
      },
      confidence,
    });
  }
  return { candidates };
}

/** QRI-1 is a numeric match weight; scale to 0-100. Missing QRI => 0 (unscored). */
function parseQriWeight(qri: string[] | undefined): number {
  if (!qri) return 0;
  const raw = (qri[1] ?? '').split(COMP)[0];
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  // Responders may report 0-1 or 0-100; normalize both to 0-100.
  const scaled = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/** HL7 date `YYYYMMDD...` -> `YYYY-MM-DD` (or undefined). */
function formatHl7Date(field: string): string | undefined {
  const d = (field || '').split(COMP)[0].trim();
  if (d.length < 8) return undefined;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
