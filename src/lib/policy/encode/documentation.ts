/**
 * Documentation-requirement detection + spec (RHTP Policy Engine, encoding layer).
 *
 * A residual attestation criterion that asks for EVIDENCE of a completed activity — an evaluation /
 * clearance, education / counseling, a treatment plan, or records / documentation of something —
 * becomes a DISCRETE item set (an attestation boolean + its OWN targeted attachment + an optional
 * typed datum) instead of draining into one shared catch-all "attach clinical documentation" upload.
 * That is the whole point of DTR: structured, per-requirement evidence a rules engine can evaluate.
 *
 * PAYER-AGNOSTIC: keys ONLY off generic linguistic cues + structure (a named complication list, a
 * time window, an "evaluated by" phrase), never a payer name or a policy's specific wording. Called
 * ONLY on the residual attestation case — a measure or an enumeration is never reclassified — so an
 * eligibility threshold or a choice can never be softened into documentation.
 */
import type { TimeWindow, DocDatum, DocItemSpec, CodedOption } from './ir';
import { repairGlyphs } from './text';

const DOC_CUE =
  /\b(document(?:ed|ation|s)?|evaluat(?:ion|ed)|clearance|cleared|assessment|educat(?:ion|ed)|counsel(?:ing|ed)|treatment plan|attest(?:ation|ed|s)?|records?\s+(?:of|showing|documenting)|letter\s+(?:of|from)|report\s+(?:of|showing)|must\s+(?:provide|submit|include|document))\b/i;

/** True when a residual-attestation criterion is a documentation requirement (evidence of a completed
 *  activity), by generic cue — never a payer name. */
export function classifyDocumentation(text: string): boolean {
  return DOC_CUE.test(repairGlyphs(text).repaired);
}

const LEAD_IN =
  /^\s*(?:(?:but\s+)?not\s+limited\s+to|including|such\s+as|e\.?\s*g\.?|i\.?\s*e\.?)\b[\s,;:]*/gi;
const STOPWORD = /^(?:but|not|limited|to|including|such|as|the|a|an|and|or|e\.?g\.?|i\.?e\.?)$/i;

/** Split a named enumeration ("obstruction, stricture or documented GERD"; "obstruction and/or leak")
 *  into de-duplicated option tokens, tolerating a comma-split lead-in ("including, but not limited to,")
 *  and dropping stop-word fragments. */
function splitNamedTokens(inner: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of inner.split(/\band\s*\/\s*or\b|,|\bor\b|\band\b/i)) {
    const tok = raw
      .replace(LEAD_IN, '')
      .replace(/^[\s,;:]+|[\s,;:.]+$/g, '')
      .trim();
    const key = tok.toLowerCase();
    if (tok.length > 1 && tok.length < 60 && !STOPWORD.test(tok) && !seen.has(key)) {
      seen.add(key);
      out.push(tok);
    }
  }
  return out;
}

/** The discrete typed datum a documentation criterion asks for, detected structurally. Undefined when
 *  the requirement is a plain attest + attachment (no extra discrete field). */
export function buildDocDatum(text: string, timeWindow?: TimeWindow): DocDatum | undefined {
  const t = repairGlyphs(text).repaired;

  // A named complication / finding enumeration → an open choice built from the criterion's own tokens.
  if (/\bcomplication\b/i.test(t)) {
    const paren = /\(([^)]*)\)/.exec(t);
    // Non-parenthetical: capture the list AFTER the connector ("such as" / "including" / ":" / ",")
    // rather than greedily eating through the first comma (which dropped the first complication).
    const inner = paren
      ? paren[1]
      : (/\bcomplication\b[^:,(]*?(?:such\s+as|including|not\s+limited\s+to|[:,])\s*(.*)$/i.exec(
          t
        )?.[1] ?? '');
    const tokens = splitNamedTokens(inner);
    if (tokens.length >= 2) {
      const open = /\bnot\s+limited\s+to\b|\bother\b|\betc\b/i.test(t);
      const options: CodedOption[] = tokens.map((tok) => ({ display: tok, sourceText: tok }));
      if (open) options.push({ display: 'Other', sourceText: 'other' });
      return { kind: 'complication-type', label: 'Complication', options, open };
    }
  }

  // A completion date — an explicit lookback window or a date phrase.
  if (
    timeWindow?.lookback ||
    /\b(date\s+of|dated|on\s+or\s+(?:before|after)|within\s+\d+\s+(?:day|week|month|year))/i.test(t)
  ) {
    return { kind: 'date', label: 'Date completed' };
  }

  // An evaluating / performing provider.
  if (
    /\b(?:evaluat(?:ing|ed|ion)|performed|assessed|cleared|provided|conducted)\s+by\b|by\s+a\s+(?:physician|provider|specialist|surgeon|psychologist)\b/i.test(
      t
    )
  ) {
    return { kind: 'provider', label: 'Evaluating provider' };
  }
  return undefined;
}

/** Build the discrete-item spec for a documentation criterion. */
export function buildDocSpec(text: string, datum?: DocDatum): DocItemSpec {
  const attestationText = repairGlyphs(text).repaired.replace(/\s+/g, ' ').trim();
  const short = attestationText.length > 80 ? `${attestationText.slice(0, 77)}…` : attestationText;
  return {
    attestationText,
    attachmentText: `Attach documentation evidencing: ${short}`,
    datum,
  };
}
