/**
 * DTR Questionnaire Package generator.
 *
 * Assembles the payer-authored artifact that feeds Da Vinci DTR — a FHIR `Bundle` (type
 * `collection`) whose FIRST entry is a Questionnaire, plus optional ValueSets (coded answers) and
 * a CQL Library (auto-population / criteria evaluation). See the DTR IG `$questionnaire-package`
 * operation and the DTR-QPackageBundle profile.
 *
 * REUSE: the Questionnaire ITEMS come from the app's existing `generateQuestionnaireFromPolicy`
 * (the one deterministic DTR generator behind the CRD→DTR→PAS flow) — this module wraps that output
 * as a conformant FHIR Questionnaire and packages the codes/logic around it. It does NOT invent a
 * second questionnaire path. Deterministic and dependency-free (pure UTF-8 base64; no Buffer/btoa),
 * so it is safe to import from any runtime.
 */
import type { NormalizedPolicy } from '@/lib/policy';
import { generateQuestionnaireFromPolicy } from '@/lib/goldenThread/dtrFromPolicy';
import type {
  FhirBundle,
  FhirCoding,
  FhirLibrary,
  FhirQuestionnaire,
  FhirQuestionnaireItem,
  FhirResource,
  FhirValueSet,
} from '@/lib/fhir/types';

const CPT_SYSTEM = 'http://www.ama-assn.org/go/cpt';
// US-realm canonical HCPCS Level II system (the OID US Core / Da Vinci terminology reference).
const HCPCS_SYSTEM = 'urn:oid:2.16.840.1.113883.6.285';
const LIBRARY_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/library-type';
const CQF_LIBRARY = 'http://hl7.org/fhir/StructureDefinition/cqf-library';
const DTR_QUESTIONNAIRE_PROFILE =
  'http://hl7.org/fhir/us/davinci-dtr/StructureDefinition/dtr-std-questionnaire';
const DTR_PACKAGE_PROFILE =
  'http://hl7.org/fhir/us/davinci-dtr/StructureDefinition/dtr-qpackage-bundle';

/** A coverage role a reviewer/coding layer can attach to a procedure code. */
export type CoverageRole =
  'covered' | 'not-covered' | 'investigational' | 'revision' | 'ambiguous' | 'supporting';

export interface CodedProcedure {
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  display?: string;
  /** When omitted (pre-review), the code is treated as policy-referenced, not asserted covered. */
  role?: CoverageRole;
}

export interface DiagnosisValueSet {
  id: string;
  title: string;
  concepts: { system: string; code: string; display?: string }[];
}

export interface QuestionnairePackageInput {
  policy: NormalizedPolicy;
  /** Procedure codes (typically the EXPLICIT extracted codes). */
  procedures?: CodedProcedure[];
  /** Diagnosis value sets from the coding-map layer (post-review). */
  diagnosisValueSets?: DiagnosisValueSet[];
  /** CQL emitted by the coding/AI layer for auto-population + evaluation. */
  cql?: { name: string; text: string; version?: string };
  /** Canonical base URL. */
  baseUrl?: string;
  version?: string;
}

export type DtrQuestionnairePackage = FhirBundle<FhirQuestionnaire | FhirValueSet | FhirLibrary>;

/** Lowercase URL/id slug (never empty). */
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'policy'
  );
}

/** A valid FHIR `name` (invariant cnl-0: must match `[A-Z]([A-Za-z0-9_]){1,254}` — letter-initial,
 *  PascalCase). Prefixes `Q` when the source would start with a digit; never empty. */
function fhirName(s: string): string {
  const parts = s
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const camel = parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const named = /^[A-Za-z]/.test(camel) ? camel : `Q${camel}`;
  return (named || 'Policy').slice(0, 255);
}

function systemFor(cs: 'CPT' | 'HCPCS'): string {
  return cs === 'HCPCS' ? HCPCS_SYSTEM : CPT_SYSTEM;
}

/** Pure UTF-8 → base64, byte-exact with Node `Buffer.from(str,'utf-8').toString('base64')`, so a
 *  FHIR server decodes `Library.content.data` back to the exact CQL — including ≥, dashes, quotes.
 *  No Buffer/btoa, so this module is runtime-neutral. */
export function base64Utf8(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(i + 1);
      i += 1;
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const bHas = i + 1 < bytes.length;
    const b = bHas ? bytes[i + 1] : 0;
    const cHas = i + 2 < bytes.length;
    const c = cHas ? bytes[i + 2] : 0;
    const e1 = a >> 2;
    const e2 = ((a & 3) << 4) | (b >> 4);
    const e3 = bHas ? ((b & 15) << 2) | (c >> 6) : 64;
    const e4 = cHas ? c & 63 : 64;
    out +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? '=' : chars.charAt(e3)) +
      (e4 === 64 ? '=' : chars.charAt(e4));
  }
  return out;
}

/** Select the procedures that a provider may actually request: when roles are present, only
 *  `covered`/`revision`; otherwise all referenced procedures. De-duplicated by system+code. */
function selectProcedures(procedures: CodedProcedure[]): {
  selected: CodedProcedure[];
  hasRoles: boolean;
} {
  const hasRoles = procedures.some((p) => p.role);
  const base = hasRoles
    ? procedures.filter((p) => p.role === 'covered' || p.role === 'revision')
    : procedures;
  const seen = new Set<string>();
  const selected: CodedProcedure[] = [];
  for (const p of base) {
    const key = `${p.codeSystem}:${p.code}`;
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(p);
    }
  }
  return { selected, hasRoles };
}

function includeBySystem(
  items: { system: string; code: string; display?: string }[]
): { system: string; concept: { code: string; display?: string }[] }[] {
  const bySystem = new Map<string, { code: string; display?: string }[]>();
  for (const it of items) {
    const arr = bySystem.get(it.system) ?? [];
    if (!arr.some((c) => c.code === it.code)) arr.push({ code: it.code, display: it.display });
    bySystem.set(it.system, arr);
  }
  return [...bySystem.entries()].map(([system, concept]) => ({ system, concept }));
}

function proceduresValueSet(
  selected: CodedProcedure[],
  hasRoles: boolean,
  baseUrl: string,
  version: string
): FhirValueSet | null {
  if (selected.length === 0) return null;
  return {
    resourceType: 'ValueSet',
    id: 'covered-procedures',
    url: `${baseUrl}/ValueSet/covered-procedures`,
    version,
    name: 'CoveredProcedures',
    title: hasRoles ? 'Covered procedures' : 'Procedures referenced by policy (pending review)',
    status: 'draft',
    compose: {
      include: includeBySystem(
        selected.map((p) => ({ system: systemFor(p.codeSystem), code: p.code, display: p.display }))
      ),
    },
  };
}

function diagnosisValueSetResource(vs: DiagnosisValueSet, version: string): FhirValueSet {
  return {
    resourceType: 'ValueSet',
    id: vs.id,
    url: `urn:rhtp:vs:${vs.id}`,
    version,
    name: fhirName(vs.id),
    title: vs.title,
    status: 'draft',
    compose: { include: includeBySystem(vs.concepts) },
  };
}

/**
 * Build a DTR Questionnaire Package Bundle from a normalized policy plus (optionally) its coded
 * procedures, diagnosis value sets, and CQL. The Questionnaire's items are produced by the existing
 * generator; this function only wraps + packages them. The Bundle's first entry is always the
 * Questionnaire (DTR-QPackageBundle constraint dtrb-1).
 */
export function buildQuestionnairePackage(
  input: QuestionnairePackageInput
): DtrQuestionnairePackage {
  const baseUrl = input.baseUrl ?? 'urn:rhtp:dtr';
  const version = input.version ?? '0.1.0-draft';
  const { selected, hasRoles } = selectProcedures(input.procedures ?? []);

  const gen = generateQuestionnaireFromPolicy(input.policy);

  const qId = slug(input.policy.policyId);
  const libraryCanonical = input.cql
    ? `${baseUrl}/Library/${slug(input.cql.name)}|${input.cql.version ?? '0.1.0'}`
    : undefined;

  const codeList: FhirCoding[] = selected.map((p) => ({
    system: systemFor(p.codeSystem),
    code: p.code,
    display: p.display,
  }));

  const questionnaire: FhirQuestionnaire = {
    resourceType: 'Questionnaire',
    id: qId,
    meta: { profile: [DTR_QUESTIONNAIRE_PROFILE] },
    ...(libraryCanonical
      ? { extension: [{ url: CQF_LIBRARY, valueCanonical: libraryCanonical }] }
      : {}),
    url: `${baseUrl}/Questionnaire/${qId}`,
    version,
    name: fhirName(input.policy.title),
    title: gen.title,
    status: 'draft',
    experimental: true,
    subjectType: ['Patient'],
    ...(codeList.length > 0 ? { code: codeList } : {}),
    item: gen.item.map((it): FhirQuestionnaireItem => ({
      linkId: it.linkId,
      text: it.text,
      type: it.type,
      required: it.required ?? false,
    })),
  };

  const entries: { resource: FhirQuestionnaire | FhirValueSet | FhirLibrary }[] = [
    { resource: questionnaire },
  ];

  if (input.cql) {
    const library: FhirLibrary = {
      resourceType: 'Library',
      id: slug(input.cql.name),
      url: `${baseUrl}/Library/${slug(input.cql.name)}`,
      version: input.cql.version ?? '0.1.0',
      name: fhirName(input.cql.name),
      title: `${input.policy.title} — DTR logic (CQL)`,
      status: 'draft',
      experimental: true,
      type: {
        coding: [{ system: LIBRARY_TYPE_SYSTEM, code: 'logic-library', display: 'Logic Library' }],
      },
      content: [{ contentType: 'text/cql', data: base64Utf8(input.cql.text) }],
    };
    entries.push({ resource: library });
  }

  const procVs = proceduresValueSet(selected, hasRoles, baseUrl, version);
  if (procVs) entries.push({ resource: procVs });

  const seenVs = new Set<string>();
  for (const vs of input.diagnosisValueSets ?? []) {
    if (seenVs.has(vs.id)) continue; // de-dup by id → no ambiguous references
    seenVs.add(vs.id);
    entries.push({ resource: diagnosisValueSetResource(vs, version) });
  }

  return {
    resourceType: 'Bundle',
    id: `dtr-qpackage-${qId}`,
    meta: { profile: [DTR_PACKAGE_PROFILE] },
    type: 'collection',
    entry: entries,
  };
}

/** True when the bundle satisfies the DTR package shape: a `collection` whose first entry is a
 *  Questionnaire and which contains exactly one Questionnaire. */
export function isValidQuestionnairePackage(bundle: FhirBundle<FhirResource>): boolean {
  if (bundle.resourceType !== 'Bundle' || bundle.type !== 'collection') return false;
  const entries = bundle.entry ?? [];
  const questionnaires = entries.filter((e) => e.resource?.resourceType === 'Questionnaire');
  return questionnaires.length === 1 && entries[0]?.resource?.resourceType === 'Questionnaire';
}
