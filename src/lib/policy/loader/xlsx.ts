/**
 * S1 — XLSX loader. A WorkbookReader seam (mirrors the OcrEngine pattern: readonly name +
 * one async method, a deterministic fake for the gate, and a real reader lazy-loaded via a
 * runtime string-cast import so tsc stays green and the mandatory core needs no dependency).
 *
 * The vendor reader only DECODES; the pure-JS sheetsToCanonicalText owns every formatting
 * choice so the canonical text is a pure function of the workbook bytes — no locale, no
 * timezone, no Date parsing. Cells render: number → String(v); boolean → TRUE/FALSE;
 * date-serial → fixed UTC epoch math → YYYY-MM-DD[THH:mm:ssZ]; error → the error token.
 */
import type { LayoutBlock } from '../pipeline/contracts';
import { canonicalizeText } from './normalize';
import type { RawDoc } from './capture';
import type { BuiltinOptions } from './capture';

/** A decoded cell. `d` carries a raw Excel date serial (never a pre-formatted string). */
export type Cell =
  | { t: 'n'; v: number } // number (computed value)
  | { t: 's'; v: string } // string
  | { t: 'b'; v: boolean } // boolean
  | { t: 'd'; v: number } // date as raw Excel serial
  | { t: 'e'; v: string } // error token, e.g. '#REF!'
  | { t: 'z' }; // empty

export interface SheetGrid {
  name: string;
  rows: Cell[][];
}

export interface WorkbookReader {
  readonly name: string;
  /** Decode container bytes into sheets (workbook file order) + the date system flag. */
  read(bytes: Uint8Array): Promise<{ sheets: SheetGrid[]; date1904: boolean }>;
}

/** Deterministic in-memory reader for unit tests — no dependency. */
export function fakeWorkbookReader(sheets: SheetGrid[], date1904 = false): WorkbookReader {
  return {
    name: 'fake',
    async read(): Promise<{ sheets: SheetGrid[]; date1904: boolean }> {
      return { sheets, date1904 };
    },
  };
}

// Minimal local shape of the SheetJS surface we use (kept local so tsc does not require the
// optional 'xlsx' package to be installed for the gate to pass).
interface XlsxCellRaw {
  t?: string; // 'n' | 's' | 'b' | 'd' | 'e' | 'z' | 'str'
  v?: unknown;
  f?: string; // formula (present ⇒ must have a cached v)
  w?: string;
}
interface XlsxSheet {
  [addr: string]: XlsxCellRaw | unknown;
  '!ref'?: string;
}
interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XlsxSheet>;
  Workbook?: { WBProps?: { date1904?: boolean | number } };
}
interface XlsxModule {
  read(data: Uint8Array, opts: Record<string, unknown>): XlsxWorkbook;
  utils: {
    decode_range(ref: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_cell(a: { r: number; c: number }): string;
  };
}

/**
 * Real reader via SheetJS. Lazily loaded; read with cellFormula:false + cellDates:false so
 * it returns COMPUTED values and RAW date serials (the vendor never formats). Throws on a
 * formula cell with no cached computed value (fail closed — we will not guess).
 */
export function sheetjsWorkbookReader(): WorkbookReader {
  return {
    name: 'sheetjs',
    async read(bytes: Uint8Array): Promise<{ sheets: SheetGrid[]; date1904: boolean }> {
      const specifier = 'xlsx';
      const mod = (await import(specifier as string)) as unknown as XlsxModule;
      const wb = mod.read(bytes, { type: 'array', cellFormula: false, cellDates: false });
      const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
      const sheets: SheetGrid[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const ref = ws['!ref'];
        if (!ref) return { name, rows: [] };
        const range = mod.utils.decode_range(ref);
        const rows: Cell[][] = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: Cell[] = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const raw = ws[mod.utils.encode_cell({ r, c })] as XlsxCellRaw | undefined;
            row.push(coerceCell(raw));
          }
          rows.push(row);
        }
        return { name, rows };
      });
      return { sheets, date1904 };
    },
  };
}

function coerceCell(raw: XlsxCellRaw | undefined): Cell {
  if (!raw || raw.t === undefined || raw.t === 'z') return { t: 'z' };
  if (raw.f !== undefined && raw.v === undefined) {
    throw new Error('xlsx: formula cell has no cached computed value (fail closed)');
  }
  switch (raw.t) {
    case 'n':
      return { t: 'n', v: Number(raw.v) };
    case 'd':
      // cellDates:false keeps dates as serials; if a Date slips through, reject rather than guess.
      if (typeof raw.v !== 'number') {
        throw new Error('xlsx: date cell is not a raw serial (fail closed)');
      }
      return { t: 'd', v: raw.v };
    case 'b':
      return { t: 'b', v: Boolean(raw.v) };
    case 'e':
      return { t: 'e', v: String(raw.v ?? '#ERR') };
    case 's':
    case 'str':
    default:
      return { t: 's', v: String(raw.v ?? '') };
  }
}

const EPOCH_1900 = Date.UTC(1899, 11, 30); // serial 0; matches SheetJS for real dates (serial ≥ 61)
const EPOCH_1904 = Date.UTC(1904, 0, 1); // serial 0 = 1904-01-01
const DAY_MS = 86400000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Excel serial → ISO date, via fixed UTC epoch math (never Date parsing / toLocale / local
 * TZ). Integer serial → 'YYYY-MM-DD'; fractional → 'YYYY-MM-DDTHH:mm:ssZ'. The 1900
 * leap-year artifact (serial 60) resolves to 1900-02-28 deterministically; we do not
 * reproduce Excel's fictional 1900-02-29.
 */
export function serialToISO(serial: number, date1904: boolean): string {
  const base = date1904 ? EPOCH_1904 : EPOCH_1900;
  const ms = base + Math.round(serial * DAY_MS);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const da = d.getUTCDate();
  const dateStr = `${pad(y, 4)}-${pad(mo)}-${pad(da)}`;
  const hasTime = Math.round(serial * DAY_MS) % DAY_MS !== 0;
  if (!hasTime) return dateStr;
  return `${dateStr}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function isEmpty(c: Cell): boolean {
  return c.t === 'z';
}

/** Render one cell to its deterministic string. Intra-cell CR/LF fold to a single space. */
function renderCell(c: Cell, date1904: boolean): string {
  switch (c.t) {
    case 'z':
      return '';
    case 'n':
      return String(c.v);
    case 'b':
      return c.v ? 'TRUE' : 'FALSE';
    case 'd':
      return serialToISO(c.v, date1904);
    case 'e':
      return c.v;
    case 's':
      return c.v.replace(/[\r\n]+/g, ' ');
  }
}

/** Trim trailing all-empty rows and columns; pad remaining rows to a uniform width. */
function trimGrid(rows: Cell[][]): Cell[][] {
  let lastRow = -1;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].some((c) => !isEmpty(c))) lastRow = r;
  }
  const kept = rows.slice(0, lastRow + 1);
  let lastCol = -1;
  for (const row of kept) {
    for (let c = 0; c < row.length; c++) {
      if (!isEmpty(row[c]) && c > lastCol) lastCol = c;
    }
  }
  const width = lastCol + 1;
  return kept.map((row) => {
    const out: Cell[] = [];
    for (let c = 0; c < width; c++) out.push(row[c] ?? { t: 'z' });
    return out;
  });
}

function renderSheet(sheet: SheetGrid, date1904: boolean): string {
  const grid = trimGrid(sheet.rows);
  const body = grid.map((row) => row.map((c) => renderCell(c, date1904)).join(' | ')).join('\n');
  return `# ${sheet.name}\n${body}`;
}

/**
 * Sheets → canonical text. Workbook FILE order (never alphabetized); each sheet a section
 * headed by '# <name>', rows one-per-line with cells joined by ' | ', sections separated by
 * a blank line. A pure function of the decoded grid.
 *
 * NAMED RESIDUAL (red-team, delimiter collision): the ' | ' cell join is NOT escaped, so a
 * string cell literally containing ' | ' renders identically to two cells. This does NOT
 * break anchoring — verifyAnchor byte-matches against the canonical TEXT, which is faithful
 * and deterministic; no citation ever verifies falsely. What is ambiguous is only the
 * reverse map from an offset back to a specific CELL. We deliberately do not escape, because
 * escaping would corrupt the citable policy text. Cell-precise provenance is a future
 * enhancement via per-cell LayoutBlocks (blocks[]), not text mangling.
 */
export function sheetsToCanonicalText(sheets: SheetGrid[], date1904: boolean): string {
  return canonicalizeText(sheets.map((s) => renderSheet(s, date1904)).join('\n\n'));
}

/** Load an XLSX RawDoc into canonical text + per-sheet blocks. Fails closed with no reader. */
export async function loadXlsx(
  raw: RawDoc,
  options: BuiltinOptions
): Promise<{ text: string; blocks: LayoutBlock[] }> {
  if (!options.workbook) {
    throw new Error(
      'builtin capture: spreadsheet input requires a WorkbookReader — makeBuiltinCapture({ workbook })'
    );
  }
  const { sheets, date1904 } = await options.workbook.read(raw.bytes);
  const text = sheetsToCanonicalText(sheets, date1904);
  const blocks: LayoutBlock[] = sheets.map((s, i) => ({
    page: i + 1,
    text: canonicalizeText(renderSheet(s, date1904)),
  }));
  return { text, blocks };
}
