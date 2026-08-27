/**
 * S1 — EXHAUSTIVE adversarial tests for the XLSX loader (loader/xlsx.ts).
 *
 * The contract under attack: the canonical text is a PURE function of the decoded workbook
 * grid — no locale, no timezone, no Date parsing. Every date goes through fixed UTC epoch
 * math (serialToISO), cells render deterministically, sheets stay in file order, trailing
 * empties are trimmed, and a source with no derivable text fails closed. Anchors minted from
 * the derived text must round-trip through the S0 spine byte-for-byte.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  serialToISO,
  sheetsToCanonicalText,
  fakeWorkbookReader,
  loadXlsx,
  type Cell,
  type SheetGrid,
} from '@/lib/policy/loader/xlsx';
import { makeBuiltinCapture, type RawDoc } from '@/lib/policy/loader/capture';
import { makeSpan, verifyAnchor, hashText, type CanonicalRef } from '@/lib/policy/anchor/verify';

// ---- cell constructors (typed against the discriminated union) ----
const s = (v: string): Cell => ({ t: 's', v });
const n = (v: number): Cell => ({ t: 'n', v });
const b = (v: boolean): Cell => ({ t: 'b', v });
const dcell = (v: number): Cell => ({ t: 'd', v });
const err = (v: string): Cell => ({ t: 'e', v });
const z: Cell = { t: 'z' };

const enc = (str: string) => new TextEncoder().encode(str);
const SPREADSHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function rawXlsx(bytes: Uint8Array = enc('xlsx-bytes')): RawDoc {
  return {
    docId: 'd1',
    sourceFile: 'policy.xlsx',
    bytes,
    mime: SPREADSHEET_MIME,
    provenanceClass: 'authoritative',
  };
}

/** Convenience: canonical text for a single one-cell sheet named 'S'. */
function oneCell(cell: Cell, date1904 = false): string {
  return sheetsToCanonicalText([{ name: 'S', rows: [[cell]] }], date1904);
}

// =====================================================================================
// serialToISO — date-serial epoch math
// =====================================================================================
describe('serialToISO — 1900 date system', () => {
  it('renders an integer serial as YYYY-MM-DD (no time component)', () => {
    // 44197 = 2021-01-01, 25569 = 1970-01-01 (both well-known Excel anchors).
    expect(serialToISO(44197, false)).toBe('2021-01-01');
    expect(serialToISO(25569, false)).toBe('1970-01-01');
  });

  it('renders serial 0 as 1899-12-30 (the 1900-system epoch)', () => {
    expect(serialToISO(0, false)).toBe('1899-12-30');
  });

  it('resolves the 1900 leap-year artifact deterministically (serial 60 -> 1900-02-28)', () => {
    // Excel keeps a fictional 1900-02-29; the loader deliberately does NOT reproduce it.
    expect(serialToISO(60, false)).toBe('1900-02-28');
    // Real dates (serial >= 61) line up with Excel/SheetJS.
    expect(serialToISO(61, false)).toBe('1900-03-01');
  });

  it('renders a fractional serial as YYYY-MM-DDTHH:mm:ssZ', () => {
    expect(serialToISO(44197.5, false)).toBe('2021-01-01T12:00:00Z');
    expect(serialToISO(44197.25, false)).toBe('2021-01-01T06:00:00Z');
  });
});

describe('serialToISO — 1904 date system', () => {
  it('renders serial 0 as 1904-01-01 (the 1904-system epoch)', () => {
    expect(serialToISO(0, true)).toBe('1904-01-01');
    expect(serialToISO(1, true)).toBe('1904-01-02');
  });

  it('maps the same real date to different serials across the two systems', () => {
    // 2021-01-01 is serial 44197 in the 1900 system, 42735 in the 1904 system.
    expect(serialToISO(42735, true)).toBe('2021-01-01');
    expect(serialToISO(44197, false)).toBe(serialToISO(42735, true));
  });
});

describe('serialToISO — TIMEZONE INDEPENDENCE', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('output does not depend on process.env.TZ (getUTC* math)', () => {
    const utcInteger = serialToISO(44197, false);
    const utcFractional = serialToISO(44197.5, false);
    const utc1904 = serialToISO(0, true);
    // Shift the ambient timezone hard; a local-time bug would move the rendered day/hour.
    process.env.TZ = 'Asia/Kolkata'; // UTC+5:30 — would drag a midnight-UTC serial to prev day
    expect(serialToISO(44197, false)).toBe(utcInteger);
    expect(serialToISO(44197, false)).toBe('2021-01-01');
    expect(serialToISO(44197.5, false)).toBe(utcFractional);
    expect(serialToISO(44197.5, false)).toBe('2021-01-01T12:00:00Z');
    expect(serialToISO(0, true)).toBe(utc1904);
    expect(serialToISO(0, true)).toBe('1904-01-01');
  });
});

// =====================================================================================
// Number cells via String(v)
// =====================================================================================
describe('number cells render via String(v)', () => {
  it('exposes IEEE-754 error for 0.1 + 0.2', () => {
    expect(oneCell(n(0.1 + 0.2))).toBe('# S\n0.30000000000000004');
  });

  it('normalizes negative zero to "0"', () => {
    expect(oneCell(n(-0))).toBe('# S\n0');
  });

  it('DOCUMENTS precision loss past MAX_SAFE_INTEGER (String of a rounded double)', () => {
    // 9007199254740993 is not representable; the literal collapses to ...992 before String().
    expect(oneCell(n(9007199254740993))).toBe('# S\n9007199254740992');
  });

  it('renders large magnitudes in exponential form as String() chooses', () => {
    expect(oneCell(n(1e21))).toBe('# S\n1e+21');
    expect(oneCell(n(1e-7))).toBe('# S\n1e-7');
  });
});

// =====================================================================================
// Cell types
// =====================================================================================
describe('cell type rendering', () => {
  it('boolean -> TRUE / FALSE', () => {
    expect(oneCell(b(true))).toBe('# S\nTRUE');
    expect(oneCell(b(false))).toBe('# S\nFALSE');
  });

  it('date cell renders through serialToISO (respecting the date system)', () => {
    expect(oneCell(dcell(44197))).toBe('# S\n2021-01-01');
    expect(oneCell(dcell(44197.5))).toBe('# S\n2021-01-01T12:00:00Z');
    // Same serial, 1904 system -> a different calendar date.
    expect(oneCell(dcell(42735), true)).toBe('# S\n2021-01-01');
    expect(oneCell(dcell(44197), true)).not.toBe('# S\n2021-01-01');
  });

  it('error cell -> its raw token', () => {
    expect(oneCell(err('#REF!'))).toBe('# S\n#REF!');
    expect(oneCell(err('#DIV/0!'))).toBe('# S\n#DIV/0!');
  });

  it('empty cell -> empty string (trimmed away when it is the only cell)', () => {
    // A lone empty cell trims to an empty grid, leaving just the header.
    expect(oneCell(z)).toBe('# S');
    // An empty cell that survives (interior) renders as '' between delimiters; the
    // canonicalizer then collapses the resulting double space, so 'a |  | c' -> 'a | | c'.
    expect(sheetsToCanonicalText([{ name: 'S', rows: [[s('a'), z, s('c')]] }], false)).toBe(
      '# S\na | | c'
    );
  });

  it('string cell folds embedded CR/LF to a single space', () => {
    expect(oneCell(s('first\r\nsecond\nthird'))).toBe('# S\nfirst second third');
    expect(oneCell(s('a\n\n\nb'))).toBe('# S\na b');
  });

  it('DELIMITER COLLISION: a cell literally containing " | " is indistinguishable from two cells', () => {
    // The loader does not escape the ' | ' delimiter, so a single string cell 'a | b'
    // canonicalizes to the SAME text as two cells ['a','b']. Non-injective encoding.
    const oneCellWithBar = sheetsToCanonicalText([{ name: 'S', rows: [[s('a | b')]] }], false);
    const twoCells = sheetsToCanonicalText([{ name: 'S', rows: [[s('a'), s('b')]] }], false);
    expect(oneCellWithBar).toBe('# S\na | b');
    expect(twoCells).toBe('# S\na | b');
    // Documented ambiguity: identical canonical text from structurally different grids.
    expect(oneCellWithBar).toBe(twoCells);
  });
});

// =====================================================================================
// sheetsToCanonicalText — determinism & layout
// =====================================================================================
describe('sheetsToCanonicalText — determinism', () => {
  it('keeps sheets in FILE order (never alphabetized): Z section precedes A', () => {
    const sheets: SheetGrid[] = [
      { name: 'Z', rows: [[s('z1'), n(1)]] },
      { name: 'A', rows: [[b(true)]] },
    ];
    const text = sheetsToCanonicalText(sheets, false);
    expect(text).toBe('# Z\nz1 | 1\n\n# A\nTRUE');
    expect(text.indexOf('# Z')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('# Z')).toBeLessThan(text.indexOf('# A'));
  });

  it('formats each sheet as "# <name>" header, row-per-line, sections split by a blank line', () => {
    const sheets: SheetGrid[] = [
      {
        name: 'Sheet1',
        rows: [
          [s('r1c1'), s('r1c2')],
          [s('r2c1'), s('r2c2')],
        ],
      },
      { name: 'Sheet2', rows: [[s('x')]] },
    ];
    expect(sheetsToCanonicalText(sheets, false)).toBe(
      '# Sheet1\nr1c1 | r1c2\nr2c1 | r2c2\n\n# Sheet2\nx'
    );
  });

  it('drops trailing all-empty rows and columns; different trailing padding yields identical text', () => {
    const tight: SheetGrid = {
      name: 'S',
      rows: [
        [s('a'), s('b')],
        [s('c'), s('d')],
      ],
    };
    const padded: SheetGrid = {
      name: 'S',
      rows: [
        [s('a'), s('b'), z],
        [s('c'), s('d'), z],
        [z, z, z],
      ],
    };
    const a = sheetsToCanonicalText([tight], false);
    const b2 = sheetsToCanonicalText([padded], false);
    expect(a).toBe('# S\na | b\nc | d');
    expect(b2).toBe(a);
  });

  it('is a fixed point of the canonicalizer (loader emits already-canonical text)', () => {
    const text = sheetsToCanonicalText(
      [{ name: 'S', rows: [[s('  spacey  '), s('t\r\nu')]] }],
      false
    );
    // Passing it back through the loader-shaped path must not change it (assertCanonical contract).
    expect(text).toBe(text.replace(/[ \t]+$/gm, ''));
    expect(text.includes('\r')).toBe(false);
  });
});

// =====================================================================================
// Round-trip through the S0 anchoring spine
// =====================================================================================
describe('round-trip: loadXlsx -> makeBuiltinCapture -> verifyAnchor', () => {
  it('an anchor minted from the derived text re-verifies byte-for-byte', async () => {
    const cap = makeBuiltinCapture({
      workbook: fakeWorkbookReader([
        {
          name: 'Coverage',
          rows: [
            [s('Procedure'), s('Rule')],
            [s('Bariatric surgery'), s('Covered when BMI >= 40')],
          ],
        },
      ]),
    });
    const doc = await cap.load(rawXlsx());
    const needle = 'Covered when BMI >= 40';
    const start = doc.text.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    const span = makeSpan(doc as CanonicalRef, start, start + needle.length);
    const verdict = verifyAnchor(
      { anchorId: 'a1', provenanceClass: 'authoritative', spans: [span] },
      [doc as CanonicalRef]
    );
    expect(verdict.ok).toBe(true);
  });

  it('loadXlsx emits one LayoutBlock per sheet in file order', async () => {
    const { text, blocks } = await loadXlsx(rawXlsx(), {
      workbook: fakeWorkbookReader([
        { name: 'One', rows: [[s('alpha')]] },
        { name: 'Two', rows: [[s('beta')]] },
      ]),
    });
    expect(text).toBe('# One\nalpha\n\n# Two\nbeta');
    expect(blocks.map((bl) => bl.page)).toEqual([1, 2]);
    expect(blocks[0].text).toBe('# One\nalpha');
    expect(blocks[1].text).toBe('# Two\nbeta');
  });
});

// =====================================================================================
// Fail-closed behavior
// =====================================================================================
describe('fail closed', () => {
  it('spreadsheet input with NO workbook reader rejects', async () => {
    const cap = makeBuiltinCapture(); // no seams
    await expect(cap.load(rawXlsx())).rejects.toThrow(/requires a WorkbookReader/);
  });

  it('loadXlsx directly rejects when options.workbook is absent', async () => {
    await expect(loadXlsx(rawXlsx(), {})).rejects.toThrow(/WorkbookReader/);
  });

  it('a zero-sheet workbook produces empty text and fails closed (non-empty bytes)', async () => {
    const cap = makeBuiltinCapture({ workbook: fakeWorkbookReader([]) });
    // sheetsToCanonicalText([]) === '' but the source bytes are non-empty -> assertNonEmpty throws.
    expect(sheetsToCanonicalText([], false)).toBe('');
    await expect(cap.load(rawXlsx())).rejects.toThrow(/empty text/);
  });

  it('a single empty sheet still yields its header (only truly zero sheets are empty)', async () => {
    const cap = makeBuiltinCapture({
      workbook: fakeWorkbookReader([{ name: 'Blank', rows: [[z, z]] }]),
    });
    const doc = await cap.load(rawXlsx());
    expect(doc.text).toBe('# Blank');
  });
});

// =====================================================================================
// sourceContentHash — over source bytes, invariant to derived text
// =====================================================================================
describe('sourceContentHash', () => {
  it('equals hashText(base64(bytes))', async () => {
    const bytes = enc('xlsx-bytes');
    const cap = makeBuiltinCapture({
      workbook: fakeWorkbookReader([{ name: 'S', rows: [[s('x')]] }]),
    });
    const doc = await cap.load(rawXlsx(bytes));
    expect(doc.sourceContentHash).toBe(hashText(Buffer.from(bytes).toString('base64')));
  });

  it('is invariant to the derived text (two workbooks, same bytes -> same hash)', async () => {
    const bytes = enc('identical-container-bytes');
    const doc1 = await makeBuiltinCapture({
      workbook: fakeWorkbookReader([{ name: 'S1', rows: [[s('hello')]] }]),
    }).load(rawXlsx(bytes));
    const doc2 = await makeBuiltinCapture({
      workbook: fakeWorkbookReader([{ name: 'DIFFERENT', rows: [[s('world'), s('again')]] }]),
    }).load(rawXlsx(bytes));
    expect(doc1.text).not.toBe(doc2.text);
    expect(doc1.sourceContentHash).toBe(doc2.sourceContentHash);
    expect(doc1.sourceContentHash).toBe(hashText(Buffer.from(bytes).toString('base64')));
  });
});
