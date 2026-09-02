// CONTRACT: C9  // CONTRACT: C10
/**
 * Da Vinci Risk Adjustment CODING GAP adapter (arrival mode: batch). Parses a FHIR R4
 * `MeasureReport` conforming to the Da Vinci-RA *Risk Adjustment Coding Gap* profile
 * (`hl7.org/fhir/us/davinci-ra`) into normalized coding-gap records, projected via the
 * NEW `codingGapSpec` (node kind CodingGap, edges HAS_CODING_GAP + SUPPORTED_BY).
 *
 * ONE MeasureReport carries MANY condition categories (one `group` each), so `parse`
 * FLATTENS: one RawRecord per group, each carrying the report-level context (subject,
 * model+version, clinical period) plus that group's coded fields and its supporting
 * evidence references (the `evaluatedResource`s whose `ra-groupReference` extension
 * names this group). Each group becomes ONE CodingGap node.
 *
 * CODING-INTENSITY FIREWALL (the safety property this adapter enforces): a coding gap
 * is a payer-analytics HYPOTHESIS, never a clinical assertion. This adapter therefore
 * (a) is intentionally OUT of `CODE_CARRYING_DOMAINS` — it never runs the clinical
 * semantic-binding gate, so a gap's HCC/ICD code is never treated as an asserted coded
 * diagnosis; (b) NEVER emits a Condition or any clinical assertion (only a CodingGap
 * node + associative links to evidence that ALREADY exists); (c) QUARANTINES a gap
 * whose evidence status or suspect type is not a governed value rather than guessing.
 *
 * PHI-MINIMAL: the projection carries CODES, STATUSES, DATES, and REFS only — the HCC
 * condition-category code, the evidence status, the suspect type, the hierarchical
 * status, the dates, and the supporting-evidence references — NEVER a free-text
 * rationale/justification narrative. The subject reference anchors the member through
 * the injected identity seam (never the graph key). Event `coding-gap.reported`.
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

/** One flattened coding-gap group pulled from a MeasureReport (report context + group). */
interface CodingGapGroup {
  measureReportId: string;
  /** The MeasureReport.group.id — disambiguates repeated categories in one report. */
  groupId: string;
  subjectRef: string;
  model: string;
  modelVersion: string;
  periodStart: string;
  periodEnd: string;
  /** The HCC condition-category code (e.g. 'HCC18') + its code system. */
  conditionCategory: string;
  codeSystem: string;
  evidenceStatus: string;
  suspectType: string;
  hierarchicalStatus: string;
  evidenceStatusDate: string;
  /** Supporting-evidence references for THIS group ('Type/id'), PHI-safe. */
  evidenceRefs: string[];
}

/** Normalized coding-gap payload (the CodingGap node's seed). PHI-minimal. */
export interface CodingGapPayload {
  gapRef: string;
  conditionCategory: string;
  codeSystem: string;
  model: string;
  modelVersion: string;
  evidenceStatus: string;
  suspectType: string;
  hierarchicalStatus: string;
  evidenceStatusDate: string;
  periodStart: string;
  periodEnd: string;
  /** 'Type/id' references to supporting evidence -> SUPPORTED_BY edges. */
  evidenceRefs: string[];
}

const SOURCE = { system: 'risk-engine', feed: 'coding-gap-measurereport' } as const;

/** The governed evidence-status codes (Da Vinci-RA). An unknown value QUARANTINES. */
export const RA_EVIDENCE_STATUS = Object.freeze(['open-gap', 'closed-gap', 'pending']);
/** The governed suspect-type codes (Da Vinci-RA). An unknown value QUARANTINES. */
export const RA_SUSPECT_TYPE = Object.freeze(['historic', 'suspected', 'net-new']);
/** The governed hierarchical-status codes (Da Vinci-RA). '' is allowed (not asserted). */
export const RA_HIERARCHICAL_STATUS = Object.freeze([
  'applied-superseded',
  'applied-not-superseded',
  'not-applied',
  'not-applicable',
]);
/**
 * SUD-linked CMS-HCC condition categories that make a coding gap 42 CFR Part 2
 * sensitive, keyed BY MODEL VERSION (V24 renumbered substance-use to V28): V24 uses
 * HCC54 (drug/alcohol psychosis) + HCC55 (substance use disorder); V28 uses HCC135-138.
 * A gap for one of these projects as a RESTRICTED node so the consent lens filters it
 * exactly like a Part 2 Condition/Flag. The UNION is the fail-safe default for an
 * unknown/blank version — over-restriction hides data (fail-closed), never leaks it.
 */
const SUD_HCC_BY_VERSION: Record<string, Set<string>> = {
  V24: new Set(['54', '55']),
  V28: new Set(['135', '136', '137', '138']),
};
const SUD_HCC_UNION = new Set(['54', '55', '135', '136', '137', '138']);

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
/** subject.reference "Patient/RA-MEM-01" -> the source member id component. */
function subjectSourceId(resource: Record<string, unknown>): string {
  return str(obj(resource.subject).reference).split('/').pop() ?? '';
}
/** The bare digits of an HCC code, leading zeros stripped ('HCC055'|'HCC-55'|'55' -> '55'). */
function hccDigits(code: string): string {
  const m = /(\d+)/.exec(code);
  return m ? String(parseInt(m[1], 10)) : '';
}
/**
 * True when the condition category is a SUD-linked HCC (42 CFR Part 2 sensitive) for the
 * given model version. Leading-zero tolerant; falls back to the cross-version UNION when
 * the version is unknown/blank so an unrecognized version FAILS CLOSED (over-restricts),
 * never leaks. An HCC code whose digits cannot be parsed is treated as sensitive under
 * the union (fail-closed) rather than silently disclosed.
 */
export function isSudConditionCategory(conditionCategory: string, modelVersion = ''): boolean {
  const digits = hccDigits(conditionCategory);
  // FAIL CLOSED: a non-empty category code we cannot parse to digits cannot be PROVEN
  // non-SUD, so treat it as sensitive rather than silently disclose it. (An empty code
  // never reaches projection — validate quarantines it as missing-condition-category.)
  if (!digits) return conditionCategory.trim() !== '';
  const set = SUD_HCC_BY_VERSION[modelVersion] ?? SUD_HCC_UNION;
  return set.has(digits);
}

/**
 * A group/report extension's coded value, matched by a URL substring (tolerant).
 * `not` excludes a substring so a prefix match is unambiguous — critical because
 * `evidenceStatus` is a substring of `evidenceStatusDate`: matching 'evidencestatus'
 * without `not:'date'` would pick up the DATE extension and store a date as the status.
 */
function extValue(extensions: unknown[], urlPart: string, notPart?: string): string {
  const want = urlPart.toLowerCase();
  const avoid = notPart?.toLowerCase();
  for (const e of extensions) {
    const ext = obj(e);
    const url = str(ext.url).toLowerCase();
    if (!url.includes(want)) continue;
    if (avoid && url.includes(avoid)) continue;
    // valueCodeableConcept.coding[0].code | valueCode | valueString | valueDate.
    const cc = obj(ext.valueCodeableConcept);
    const coding = arr(cc.coding);
    if (coding.length) {
      const code = str(obj(coding[0]).code);
      if (code) return code;
    }
    const scalar = str(ext.valueCode) || str(ext.valueString) || str(ext.valueDate);
    if (scalar) return scalar;
  }
  return '';
}

/**
 * An extension's DATE value ONLY (`valueDate`/`valueDateTime`), validated as ISO — a
 * date field must NEVER accept a free-text `valueString` (that would smuggle narrative
 * onto a PHI-minimal node). A non-date value is dropped to ''.
 */
function dateExtValue(extensions: unknown[], urlPart: string): string {
  const want = urlPart.toLowerCase();
  for (const e of extensions) {
    const ext = obj(e);
    if (!str(ext.url).toLowerCase().includes(want)) continue;
    const d = str(ext.valueDate) || str(ext.valueDateTime);
    if (/^\d{4}-\d{2}(-\d{2})?/.test(d)) return d;
  }
  return '';
}

/**
 * The HCC condition-category coding — scanned across ALL codings for an HCC-system
 * coding (never blindly `coding[0]`, which could be a co-listed ICD-10 code and would
 * both mislabel the category AND compute Part 2 restriction from the wrong digits).
 * Falls back to the first coding when no HCC-system coding is present.
 */
function pickConditionCategory(group: Record<string, unknown>): { code: string; system: string } {
  const codings = arr(obj(group.code).coding).map(obj);
  const hcc = codings.find((c) => /hcc/i.test(str(c.system)));
  const chosen = hcc ?? codings[0] ?? {};
  return { code: str(chosen.code), system: str(chosen.system) };
}

/**
 * Is this MeasureReport a Da Vinci-RA *coding gap* report (vs a generic quality
 * MeasureReport)? True when its measure names a risk-adjustment model, OR any group
 * carries an RA evidence-status extension. Keeps non-RA MeasureReports out of this lane.
 */
export function isRaCodingGapReport(resource: Record<string, unknown>): boolean {
  if (str(resource.resourceType) !== 'MeasureReport') return false;
  const measure = str(resource.measure).toLowerCase();
  // The canonical Da Vinci-RA namespace ('davinci-ra'), an 'ra-'/'ra/' model token, or
  // an HCC/risk-adjustment model name. The per-group RA extension is the strong signal.
  if (/davinci-ra|risk[-\s]?adjust|(^|[^a-z])ra[-\s/]|hcc|rxhcc|cms-?hcc/.test(measure))
    return true;
  for (const g of arr(resource.group)) {
    if (extValue(arr(obj(g).extension), 'evidencestatus', 'date')) return true;
  }
  return false;
}

/** Parse the model + version from the MeasureReport.measure canonical (tolerant). */
function modelVersionOf(resource: Record<string, unknown>): { model: string; version: string } {
  const measure = str(resource.measure);
  const lower = measure.toLowerCase();
  const model = /rxhcc/.test(lower) ? 'RxHCC' : /hcc/.test(lower) ? 'CMS-HCC' : 'risk-adjustment';
  // version from `...|24`, or a `v24`/`V28` token, or a bare number in the tail.
  const bar = measure.includes('|') ? (measure.split('|').pop() ?? '') : '';
  const vtoken = /v(\d+)/i.exec(measure);
  const version = bar ? (/^\d/.test(bar) ? `V${bar}` : bar) : vtoken ? `V${vtoken[1]}` : '';
  return { model, version };
}

/**
 * Build the group's supporting-evidence references from evaluatedResource +
 * ra-groupReference. Evidence is attached ONLY by an explicit `ra-groupReference`
 * naming this group. The report-wide fallback (no groupReference anywhere) attaches
 * evidence to the group ONLY when the report has a SINGLE group — otherwise the group
 * is genuinely ambiguous and cross-linking a co-reported (possibly SUD) gap's evidence
 * would inflate a hypothesis, so it is left UNLINKED rather than guessed. PHI-safe refs.
 */
function evidenceRefsForGroup(
  resource: Record<string, unknown>,
  groupId: string,
  groupCount: number
): string[] {
  const evaluated = arr(resource.evaluatedResource);
  const anyGroupRef = evaluated.some((x) => extValue(arr(obj(x).extension), 'groupreference'));
  const out: string[] = [];
  for (const er of evaluated) {
    const ref = str(obj(er).reference);
    if (!ref) continue;
    const gref = extValue(arr(obj(er).extension), 'groupreference');
    if (gref === groupId || (!anyGroupRef && groupCount === 1)) out.push(ref);
  }
  return [...new Set(out)];
}

function parse(payload: string): RawRecord<CodingGapGroup>[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = obj(JSON.parse(payload));
  } catch {
    return [];
  }
  const out: RawRecord<CodingGapGroup>[] = [];
  for (const entry of arr(bundle.entry)) {
    const resource = obj(obj(entry).resource);
    if (!isRaCodingGapReport(resource)) continue;
    const mrId = str(resource.id);
    const subjectRef = str(obj(resource.subject).reference);
    const period = obj(resource.period);
    const { model, version } = modelVersionOf(resource);
    const groups = arr(resource.group);
    for (const g of groups) {
      const group = obj(g);
      const groupId = str(group.id);
      const cc = pickConditionCategory(group);
      const ext = arr(group.extension);
      out.push({
        sourceRef: `${mrId || 'mr'}:${groupId || cc.code || `g${out.length + 1}`}`,
        data: {
          measureReportId: mrId,
          groupId,
          subjectRef,
          model,
          modelVersion: version,
          periodStart: str(period.start),
          periodEnd: str(period.end),
          conditionCategory: cc.code,
          codeSystem: cc.system,
          // `not:'date'` so 'evidencestatus' does not match the evidenceStatusDate ext.
          evidenceStatus: extValue(ext, 'evidencestatus', 'date'),
          suspectType: extValue(ext, 'suspecttype') || extValue(ext, 'suspect-type'),
          hierarchicalStatus: extValue(ext, 'hierarchicalstatus'),
          // DATE-only: never accepts a free-text valueString (PHI-minimal).
          evidenceStatusDate: dateExtValue(ext, 'evidencestatusdate'),
          evidenceRefs: evidenceRefsForGroup(resource, groupId, groups.length),
        },
      });
    }
  }
  return out;
}

function validate(raw: RawRecord<CodingGapGroup>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const d = raw.data;
  if (!d.subjectRef) issues.push({ reasonCode: 'missing-subject', fieldPath: 'subject.reference' });
  // Keyed on measureReportId + category; without the report id two id-less reports'
  // gaps would collide onto ONE node (silent loss). Require it so it QUARANTINES.
  if (!d.measureReportId) {
    issues.push({ reasonCode: 'missing-measurereport-id', fieldPath: 'id' });
  }
  if (!d.conditionCategory) {
    issues.push({ reasonCode: 'missing-condition-category', fieldPath: 'group.code' });
  }
  // FIREWALL: never guess a status/suspect. An ungoverned value is HELD, not coerced.
  if (!RA_EVIDENCE_STATUS.includes(d.evidenceStatus)) {
    issues.push({
      reasonCode: 'invalid-evidence-status',
      fieldPath: 'group.extension:evidenceStatus',
    });
  }
  if (!RA_SUSPECT_TYPE.includes(d.suspectType)) {
    issues.push({ reasonCode: 'invalid-suspect-type', fieldPath: 'group.extension:suspectType' });
  }
  if (d.hierarchicalStatus && !RA_HIERARCHICAL_STATUS.includes(d.hierarchicalStatus)) {
    issues.push({
      reasonCode: 'invalid-hierarchical-status',
      fieldPath: 'group.extension:hierarchicalStatus',
    });
  }
  return { ok: issues.length === 0, issues };
}

function normalize(raw: RawRecord<CodingGapGroup>, deps: PipelineDeps): NormalizedRecord {
  const d = raw.data;
  const memberId = deps.resolveIdentity(subjectSourceId({ subject: { reference: d.subjectRef } }), {
    feed: SOURCE.feed,
  });
  // Node key encodes report + MODEL + VERSION + group + category so concurrent model
  // versions coexist AND a repeated category within one report cannot collapse onto one
  // node (the group id disambiguates). Does not rely on the source giving distinct ids.
  const modelTag = `${d.model}-${d.modelVersion || 'v'}`;
  const gapRef = `CodingGap/${d.measureReportId}:${modelTag}:${d.groupId || 'g'}:${d.conditionCategory}`;
  const restricted = isSudConditionCategory(d.conditionCategory, d.modelVersion);

  const payload: CodingGapPayload = {
    gapRef,
    conditionCategory: d.conditionCategory,
    codeSystem: d.codeSystem,
    model: d.model,
    modelVersion: d.modelVersion,
    evidenceStatus: d.evidenceStatus,
    suspectType: d.suspectType,
    hierarchicalStatus: d.hierarchicalStatus,
    evidenceStatusDate: d.evidenceStatusDate,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    evidenceRefs: d.evidenceRefs,
  };
  return {
    domain: 'coding-gap',
    memberId,
    resourceType: 'MeasureReport',
    fhirResourceId: gapRef,
    eventType: 'coding-gap.reported',
    tier: 'T1',
    idempotencyKey: `coding-gap:${gapRef}`,
    provenance: 'risk-engine',
    // 42 CFR Part 2 segmentation-at-transform: a SUD-linked HCC gap is restricted.
    consent: {
      part2Restricted: restricted,
      segmentLabels: restricted ? ['42-CFR-Part-2'] : [],
    },
    source: SOURCE,
    occurredAt: d.periodStart || new Date(deps.now()).toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** The Da Vinci-RA Coding Gap MeasureReport batch adapter (PHI-minimal; firewall-gated). */
export const codingGapReportAdapter: DomainAdapter<CodingGapGroup> = {
  source: SOURCE,
  domain: 'coding-gap',
  format: 'fhir-json',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
