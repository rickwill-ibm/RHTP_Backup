/**
 * Concept-binding registry — the "propose the concept, bind the value set" seam (Phase 1, inline).
 *
 * The engine deterministically NEVER invents codes, so a generated `choice` item arrives with a
 * synthetic concept id (`"<id> options"`, see encode.ts) and display-only options. This registry
 * turns that weak signal into an AUTHORITATIVE binding: it best-effort matches the item's heading
 * text + option displays to a curated canonical ValueSet URI, and returns `undefined` whenever the
 * match is not confident — leaving `answerValueSet` unset, which is exactly today's behaviour and
 * therefore always a safe no-op. It NEVER guesses a binding.
 *
 * Deliberately decoupled from the engine: it consumes a plain {@link ConceptSignal} (text + option
 * displays), not an engine `CodedValueSet`, so the terminology layer never imports `encode/` and the
 * engine layer stays clean (the engine-cleanliness point the architect flagged).
 *
 * GENERAL, not payer-specific: matchers key on clinical concepts (obesity dx, comorbidity, yes/no),
 * never on a payer name. The same table resolves Horizon, Elevance/Anthem, Aetna, UHC and state
 * Medicaid policies that express those concepts. INVARIANT: no payer-specific branch here.
 */
import { ALL_VALUE_SETS, type Coding } from '@/lib/policy/dtr/conformance/valueSets';

/** The weak signal an engine-generated (or hand-authored) choice item carries into resolution. */
export interface ConceptSignal {
  /** The item heading / criterion text (e.g. "one or more of the following comorbidities: …"). */
  text?: string;
  /** The option display strings (the clinical list under the heading). */
  optionDisplays: string[];
  /** Any code systems already present on the options (usually none — engine options are display-only). */
  optionSystems?: string[];
}

/** The authoritative binding for a concept: the canonical ValueSet URI (+ optional measure code). */
export interface ConceptBinding {
  /** Reserved for future measure→LOINC binding; unused in Phase 1 (measure coding stays in fhir.ts). */
  measureCode?: Coding;
  valueSetUri: string;
}

export interface ConceptBindingRegistry {
  /** Pure, offline. Returns `undefined` when there is no CONFIDENT single match (fail to unset). */
  resolve(signal: ConceptSignal): ConceptBinding | undefined;
}

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Combined, normalized haystack: heading text + all option displays. */
function haystack(signal: ConceptSignal): string {
  return norm([signal.text ?? '', ...signal.optionDisplays].join(' · '));
}

/** A conservative matcher for one curated ValueSet. Each returns true only on a specific anchor. */
interface MatchRule {
  valueSetUri: string;
  /** True only when this concept is confidently the one the item expresses. */
  match(hay: string, opts: string[]): boolean;
}

const COMORBIDITY_TERMS = ['diabet', 'sleep apnea', 'sleep apnoea', 'apnea', 'apnoea', 'hypertens'];
const ARRHYTHMIA_TERMS = [
  'atrial fibrillation',
  'atrial flutter',
  'supraventricular',
  'ventricular tachycardia',
  'tachyarrhythmia',
  'avnrt',
  'wolff',
  'wpw',
  'afib',
  'a-fib',
];

const RULES: MatchRule[] = [
  {
    // Yes / No / Unknown — every option is a yes/no/unknown token (a true boolean-ish choice set).
    valueSetUri: 'urn:rhtp:dtr/ValueSet/yes-no-unknown',
    match(_hay, opts) {
      if (opts.length < 2) return false;
      return opts.every((o) => ['yes', 'no', 'unknown', 'y', 'n'].includes(o));
    },
  },
  {
    // Qualifying obesity DIAGNOSIS — the "morbid obesity" phrase, an obesity + diagnosis cue, or an
    // E66 code. NOTE: anchored on the PHRASE "morbid obes…", never a bare "morbid", so the "morbid"
    // inside "co-morbid condition" does NOT mis-fire this rule on a comorbidity list.
    valueSetUri: 'urn:rhtp:dtr/ValueSet/obesity-diagnosis',
    match(hay) {
      if (!/\bobes/.test(hay)) return false;
      return (
        /\bmorbid obes/.test(hay) || /obes\w*[^.]{0,40}\bdiagnos/.test(hay) || /\be66/.test(hay)
      );
    },
  },
  {
    // Qualifying obesity-related COMORBIDITY — an explicit "comorbid"/"co-morbid" cue, or ≥2 distinct
    // comorbidities. Payers spell it both hyphenated and closed, so both forms match.
    valueSetUri: 'urn:rhtp:dtr/ValueSet/obesity-comorbidity',
    match(hay) {
      if (/\bco-?morbid/.test(hay)) return true;
      const hits = new Set<string>();
      for (const t of COMORBIDITY_TERMS) if (hay.includes(t)) hits.add(t.slice(0, 5));
      return hits.size >= 2;
    },
  },
  {
    // Qualifying cardiac ARRHYTHMIA — the "arrhythmi(a)" cue or any named arrhythmia (Aetna CPB 0165).
    // Note: NO rule for the ablation-PROCEDURE (CPT) value set — a procedure is a coverage code, not a
    // DTR attestation answer, and adding an "ablation" rule would collide with real arrhythmia headings
    // ("catheter ablation for the following arrhythmias …"). It stays corpus-only (expandable, inline).
    valueSetUri: 'urn:rhtp:dtr/ValueSet/cardiac-arrhythmia',
    match(hay) {
      if (/\barrhythmi/.test(hay)) return true;
      return ARRHYTHMIA_TERMS.some((t) => hay.includes(t));
    },
  },
  {
    // Tobacco use status — a "tobacco" or "smok(er/ing)" cue (cross-cutting surgical/cardiac criterion).
    valueSetUri: 'urn:rhtp:dtr/ValueSet/tobacco-use-status',
    match(hay) {
      return /\btobacco\b/.test(hay) || /\bsmok/.test(hay);
    },
  },
];

// A binding may only point at a value set that actually exists in the curated corpus.
const KNOWN_URIS = new Set(ALL_VALUE_SETS.map((v) => v.url));

/**
 * The default, inline, offline registry. It applies every conservative rule and binds ONLY when
 * exactly one rule fires — 0 matches (unknown) and ≥2 matches (ambiguous) both return `undefined`,
 * so an uncertain concept is never mis-bound. This "exactly one" rule is the safety property.
 */
export const defaultConceptRegistry: ConceptBindingRegistry = {
  resolve(signal) {
    const hay = haystack(signal);
    const opts = signal.optionDisplays.map(norm).filter(Boolean);
    const matched = RULES.filter((r) => KNOWN_URIS.has(r.valueSetUri) && r.match(hay, opts));
    if (matched.length !== 1) return undefined;
    return { valueSetUri: matched[0].valueSetUri };
  },
};
