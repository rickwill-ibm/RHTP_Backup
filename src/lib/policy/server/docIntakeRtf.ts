/**
 * RTF → text — deterministic, self-contained strip-RTF state machine that ALSO reconstructs outline
 * list numbering (I./A./1./•) from the document's list table so the criteria hierarchy survives a
 * plain strip. Split out of `docIntake.ts` for the size cap; behavior unchanged. No dependency, no
 * per-document rules. Lookup tables live in `docIntakeRtfTables`.
 */
import { latin1 } from './docIntakeBytes';
import { RTF_DESTINATIONS, RTF_SPECIAL, cp1252Char } from './docIntakeRtfTables';

/* ---- Outline list reconstruction ------------------------------------------------------ *
 *
 * Word/RTF stores list numbering by REFERENCE, not as literal text: a paragraph carries `\lsN\ilvlM`
 * and the visible marker ("I.", "A.", "1.", "•") is generated from the document's list table (a
 * number format per level). A plain strip therefore DROPS every marker, destroying the criteria
 * hierarchy a downstream parser depends on. So we parse the list table and regenerate the marker for
 * each list paragraph. Standard RTF feature — payer-agnostic, not a per-doc rule.
 */

// \levelnfc number formats: 0 decimal, 1 UpperRoman, 2 lowerRoman, 3 UpperLetter, 4 lowerLetter,
// 23 bullet. Anything else → decimal.
interface ListLevelDef {
  nfc: number;
  startAt: number;
}
interface RtfLists {
  lists: Map<number, ListLevelDef[]>; // listid → levels[]
  lsToListId: Map<number, number>; // \ls override id → listid
}

function toRoman(n: number): string {
  if (n <= 0) return String(n);
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let r = '';
  let v = n;
  for (const [val, sym] of table)
    while (v >= val) {
      r += sym;
      v -= val;
    }
  return r;
}

function toLetter(n: number): string {
  let s = '';
  let v = n;
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s || 'a';
}

function fmtNum(nfc: number, n: number): string {
  switch (nfc) {
    case 1:
      return toRoman(n).toUpperCase();
    case 2:
      return toRoman(n);
    case 3:
      return toLetter(n).toUpperCase();
    case 4:
      return toLetter(n);
    default:
      return String(n);
  }
}

/** Index just past the `}` closing the group opened at `open`, honoring `\{ \} \\` escapes. */
function braceMatchEnd(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

/** The brace-matched substring of the first `{…\keyword…}` group in `s`, or null. */
function groupBody(s: string, keyword: string): string | null {
  const at = s.indexOf('\\' + keyword);
  if (at < 0) return null;
  let open = at;
  while (open >= 0 && s[open] !== '{') open -= 1;
  if (open < 0) return null;
  return s.slice(open, braceMatchEnd(s, open));
}

/** Parse the RTF list table + override table into (listid → per-level format) and (\ls → listid).
 *  Failure is non-fatal: maps are simply incomplete and a default outline scheme fills the gaps. */
function parseRtfLists(rtf: string): RtfLists {
  const lists = new Map<number, ListLevelDef[]>();
  const lsToListId = new Map<number, number>();

  const ltBody = groupBody(rtf, 'listtable');
  if (ltBody) {
    const listRe = /\{\\list\\/g;
    let mm: RegExpExecArray | null;
    while ((mm = listRe.exec(ltBody)) !== null) {
      const end = braceMatchEnd(ltBody, mm.index);
      const body = ltBody.slice(mm.index, end);
      listRe.lastIndex = end;
      const idm = /\\listid(-?\d+)/.exec(body);
      if (!idm) continue;
      const levels: ListLevelDef[] = [];
      const lvlRe = /\{\\listlevel/g;
      let lm: RegExpExecArray | null;
      while ((lm = lvlRe.exec(body)) !== null) {
        const le = braceMatchEnd(body, lm.index);
        const lb = body.slice(lm.index, le);
        lvlRe.lastIndex = le;
        const nfcm = /\\levelnfcn?(-?\d+)/.exec(lb);
        const stm = /\\levelstartat(-?\d+)/.exec(lb);
        levels.push({ nfc: nfcm ? Number(nfcm[1]) : 0, startAt: stm ? Number(stm[1]) : 1 });
      }
      lists.set(Number(idm[1]), levels);
    }
  }

  const loBody = groupBody(rtf, 'listoverridetable');
  if (loBody) {
    const ovRe = /\{\\listoverride\b/g;
    let mm: RegExpExecArray | null;
    while ((mm = ovRe.exec(loBody)) !== null) {
      const end = braceMatchEnd(loBody, mm.index);
      const body = loBody.slice(mm.index, end);
      ovRe.lastIndex = end;
      const idm = /\\listid(-?\d+)/.exec(body);
      const lsm = /\\ls(-?\d+)/.exec(body);
      if (idm && lsm) lsToListId.set(Number(lsm[1]), Number(idm[1]));
    }
  }
  return { lists, lsToListId };
}

// Tokenize RTF: control word (+optional numeric arg +optional trailing space), hex escape, non-letter
// control, brace, newline run, or a single literal char.
const RTF_TOKEN =
  /\\([a-z]{1,32})(-?\d{1,10})?[ ]?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|[\r\n]+|(.)/gi;

// Groups whose leading text IS the literal list marker (older RTF numbering). We do NOT skip them
// (their text is the marker, correctly positioned) and we suppress reconstruction for that paragraph
// so a marker is never doubled.
const LITERAL_MARKER = new Set(['listtext', 'pntext', 'pntxta', 'pntxtb']);
// Control words that end a paragraph — flush the buffer, applying any reconstructed marker.
const PARA_BREAK = new Set(['par', 'sect', 'page', 'row']);
// Default outline number formats by level when the list table lacks a definition: I / A / 1 / a / i.
const DEFAULT_NFC = [1, 3, 0, 4, 2];

/**
 * Convert RTF markup into plain text, RECONSTRUCTING outline list markers (I./A./1./•) from the
 * document's list table so the criteria hierarchy survives. Deterministic and self-contained: a
 * strip-RTF state machine (brace-stack `uc`/ignorable state, destination skipping, `\u`/`\'` decoding)
 * plus list-number regeneration. No dependency, no per-document rules.
 */
export function rtfToText(input: string | Uint8Array): string {
  const rtf = typeof input === 'string' ? input : latin1(input);
  const { lists, lsToListId } = parseRtfLists(rtf);

  // Per-(list,level) running counters. Advancing a level resets all deeper levels.
  const counters = new Map<string, number>();
  const bump = (ls: number, level: number, startAt: number): number => {
    const key = `${ls}:${level}`;
    const cur = counters.get(key);
    const next = cur === undefined ? startAt : cur + 1;
    counters.set(key, next);
    for (let k = level + 1; k <= 8; k += 1) counters.delete(`${ls}:${k}`);
    return next;
  };
  const renderMarker = (ls: number, ilvl: number): string => {
    const listid = lsToListId.get(ls);
    const lvl = listid !== undefined ? lists.get(listid)?.[ilvl] : undefined;
    const nfc = lvl?.nfc ?? DEFAULT_NFC[ilvl] ?? 0;
    const n = bump(ls, ilvl, lvl?.startAt ?? 1);
    if (nfc === 23) return '• '; // bullet — no number
    return `${fmtNum(nfc, n)}. `; // single-level marker; parser infers nesting from style
  };

  const out: string[] = [];
  let buf = '';
  let curLs = 0;
  let curIlvl = 0;
  let hadLiteralMarker = false;
  const flushPara = (): void => {
    let marker = '';
    if (curLs > 0 && !hadLiteralMarker && buf.trim().length > 0) {
      marker = renderMarker(curLs, curIlvl);
    }
    out.push(`${marker}${buf}\n`);
    buf = '';
    hadLiteralMarker = false;
  };

  const stack: { ucskip: number; ignorable: boolean }[] = [];
  let ucskip = 1;
  let ignorable = false;
  let curskip = 0;

  RTF_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RTF_TOKEN.exec(rtf)) !== null) {
    const word = m[1];
    const arg = m[2];
    const hex = m[3];
    const ctrl = m[4];
    const brace = m[5];
    const tchar = m[6];

    if (brace !== undefined) {
      curskip = 0;
      if (brace === '{') {
        stack.push({ ucskip, ignorable });
      } else {
        const s = stack.pop();
        if (s) {
          ucskip = s.ucskip;
          ignorable = s.ignorable;
        }
      }
    } else if (ctrl !== undefined) {
      curskip = 0;
      if (ignorable) {
        /* skip */
      } else if (ctrl === '~') {
        buf += ' ';
      } else if (ctrl === '_') {
        buf += '‑';
      } else if (ctrl === '{' || ctrl === '}' || ctrl === '\\') {
        buf += ctrl;
      } else if (ctrl === '*') {
        ignorable = true;
      }
    } else if (word !== undefined) {
      curskip = 0;
      if (LITERAL_MARKER.has(word)) {
        hadLiteralMarker = true; // its text flows into buf as the marker; do not skip, do not rebuild
      } else if (RTF_DESTINATIONS.has(word)) {
        ignorable = true;
      } else if (ignorable) {
        /* inside a skipped destination — drop */
      } else if (word === 'pard') {
        curLs = 0;
        curIlvl = 0;
      } else if (word === 'ls') {
        curLs = arg ? Number(arg) : 0;
      } else if (word === 'ilvl') {
        curIlvl = arg ? Number(arg) : 0;
      } else if (PARA_BREAK.has(word)) {
        flushPara();
      } else if (word in RTF_SPECIAL) {
        buf += RTF_SPECIAL[word];
      } else if (word === 'uc') {
        ucskip = arg ? Number(arg) : 1;
      } else if (word === 'u') {
        let c = Number(arg);
        if (c < 0) c += 0x10000;
        buf += String.fromCharCode(c);
        curskip = ucskip;
      }
      // any other control word: formatting only — no output, state unchanged
    } else if (hex !== undefined) {
      if (curskip > 0) curskip -= 1;
      else if (!ignorable) buf += cp1252Char(parseInt(hex, 16));
    } else if (tchar !== undefined) {
      if (curskip > 0) curskip -= 1;
      else if (!ignorable) buf += tchar;
    }
    // a [\r\n]+ run matches with all groups undefined → ignored (RTF line breaks aren't content)
  }
  // Trailing paragraph with no closing \par.
  if (buf.trim().length > 0) {
    const marker = curLs > 0 && !hadLiteralMarker ? renderMarker(curLs, curIlvl) : '';
    out.push(`${marker}${buf}`);
  }
  return out.join('');
}
