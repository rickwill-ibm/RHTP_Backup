/**
 * Word-processor intake — RTF and DOCX bytes → text, and routing through fileToTextSource.
 * RTF uses a self-contained deterministic stripper; DOCX a minimal zip reader. Both are exercised
 * against real byte containers (a hand-built ZIP, real RTF markup), not fakes.
 */
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  rtfToText,
  docxToText,
  docxXmlToText,
  docToText,
  detectDocFormat,
  isWordProcessorDoc,
  UnsupportedDocError,
} from '@/lib/policy/server/docIntake';
import { fileToTextSource } from '@/lib/policy/server/pdfIntake';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Build a minimal (crc-free) ZIP container from entries, to exercise the DOCX reader for real. */
function makeZip(entries: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameB = enc(e.name);
    const stored = e.deflate ? new Uint8Array(deflateRawSync(Buffer.from(e.data))) : e.data;
    const method = e.deflate ? 8 : 0;
    const local = new Uint8Array(30 + nameB.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, method, true);
    dv.setUint32(18, stored.length, true);
    dv.setUint32(22, e.data.length, true);
    dv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    parts.push(local, stored);
    const c = new Uint8Array(46 + nameB.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    c.set(nameB, 46);
    central.push(c);
    offset += local.length + stored.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    parts.push(c);
    cdSize += c.length;
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  parts.push(eocd);
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function docx(xmlBody: string, deflate = true): Uint8Array {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${xmlBody}</w:body></w:document>`;
  return makeZip([{ name: 'word/document.xml', data: enc(xml), deflate }]);
}

describe('RTF → text', () => {
  it('strips control words and destination groups, keeps body text, \\par → newline', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}' +
      '\\f0\\fs24 Medically Necessary\\par BMI \\u8805? 35\\par}';
    const txt = rtfToText(rtf);
    expect(txt).toContain('Medically Necessary');
    expect(txt).toContain('BMI');
    expect(txt).toContain('≥'); // 蠅 → ≥
    expect(txt).not.toContain('Arial'); // fonttbl destination dropped
    expect(txt).not.toContain('fonttbl');
    expect(txt.split('\n').length).toBeGreaterThanOrEqual(2); // \par produced line breaks
  });

  it("decodes \\'xx cp1252 hex escapes (smart punctuation)", () => {
    // \'92 = right single quote in cp1252; \'2d region not needed. Use bullet \'95.
    const txt = rtfToText("{\\rtf1 Criteria\\'92s list\\'95 item}");
    expect(txt).toContain('Criteria’s'); // \'92 → ’
    expect(txt).toContain('•'); // \'95 → bullet
  });

  it('honors \\uc skip so the ANSI fallback after \\u is dropped', () => {
    // \uc1 then 蠅 followed by one fallback char "?" which must be skipped.
    const txt = rtfToText('{\\rtf1\\uc1 x\\u8805?y}');
    expect(txt).toBe('x≥y');
  });

  it('accepts bytes (latin1) as well as a string', () => {
    const txt = rtfToText(enc('{\\rtf1 Gastric Bypass\\par}'));
    expect(txt).toContain('Gastric Bypass');
  });
});

describe('DOCX → text', () => {
  it('reads a deflated word/document.xml and joins paragraphs as lines', () => {
    const bytes = docx(
      '<w:p><w:r><w:t>Medical Necessity</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>BMI 35</w:t></w:r></w:p>'
    );
    const txt = docxToText(bytes);
    expect(txt).toContain('Medical Necessity');
    expect(txt).toContain('BMI 35');
    expect(txt.trim().split('\n').filter(Boolean).length).toBe(2);
  });

  it('reads a STORED (uncompressed) entry too', () => {
    const bytes = docx('<w:p><w:r><w:t>Stored Path</w:t></w:r></w:p>', false);
    expect(docxToText(bytes)).toContain('Stored Path');
  });

  it('decodes XML entities and tab/break elements', () => {
    const txt = docxXmlToText(
      '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B &amp; C</w:t><w:br/><w:t>D</w:t></w:r></w:p>'
    );
    expect(txt).toContain('A\tB & C');
    expect(txt).toContain('\nD');
  });

  it('throws on a zip without word/document.xml', () => {
    const bytes = makeZip([{ name: 'other.xml', data: enc('<x/>'), deflate: true }]);
    expect(() => docxToText(bytes)).toThrow(/word\/document\.xml/);
  });
});

describe('format detection', () => {
  it('detects RTF by content even when the extension is .doc', () => {
    expect(detectDocFormat(enc('{\\rtf1 hi}'), 'policy.doc')).toBe('rtf');
    expect(isWordProcessorDoc(enc('{\\rtf1 hi}'), 'policy.doc')).toBe(true);
  });

  it('detects DOCX by PK zip magic', () => {
    const bytes = docx('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
    expect(detectDocFormat(bytes, 'policy.docx')).toBe('docx');
  });

  it('detects and rejects legacy OLE .doc with a clear error', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(detectDocFormat(ole, 'old.doc')).toBe('ole-doc');
    expect(() => docToText(ole, 'old.doc')).toThrow(UnsupportedDocError);
  });
});

describe('fileToTextSource routing', () => {
  it('routes RTF-in-.doc bytes through the RTF stripper', async () => {
    const rtf =
      '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Bariatric Surgery Criteria\\par 43775\\par}';
    const src = await fileToTextSource(enc(rtf), 'Horizon bariatric.doc', 'application/msword');
    expect(src.mimeType).toBe('application/rtf');
    expect(src.text).toContain('Bariatric Surgery Criteria');
    expect(src.text).toContain('43775');
    expect(src.text).not.toContain('Arial');
  });

  it('routes a DOCX upload through the docx reader', async () => {
    const bytes = docx('<w:p><w:r><w:t>Gastric Sleeve 43775</w:t></w:r></w:p>');
    const src = await fileToTextSource(
      bytes,
      'policy.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(src.text).toContain('Gastric Sleeve 43775');
  });

  it('still routes plain .txt as UTF-8', async () => {
    const src = await fileToTextSource(enc('Radiology\n70450'), 'list.txt', 'text/plain');
    expect(src.text).toContain('70450');
  });
});
