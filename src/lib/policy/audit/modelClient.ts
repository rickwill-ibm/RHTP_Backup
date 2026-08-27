/**
 * Audited model client (S0) — the SINGLE path to any model (Guardrail 3). Defense in depth,
 * because no single layer is sufficient:
 *   (1) The backend only ever receives a text-only input RECONSTRUCTED through the factory,
 *       so any extra (structured PHI) fields a caller smuggled via a cast are dropped before
 *       the model sees them.
 *   (2) A DLP scan runs over the WHOLE serialized input (not just `.text`) and BLOCKS on any
 *       finding — fail closed, never strip.
 *   (3) A pre-call INTENT record is written to the ledger BEFORE the backend is invoked, so a
 *       model call can never occur without a corresponding audit record.
 *
 * Honest scope of the type barrier: `policyTextInput` is the only constructor, which keeps
 * STRUCTURED member data out of a ModelInput. It cannot, by itself, keep PHI out of the
 * free-text field — that is what the DLP scan (best-effort, security-critical, imperfect on
 * free-text names/addresses) plus a real classifier in production are for.
 */
import { hashText } from '../anchor/verify';
import type { Ledger } from './ledger';

export type InputClass = 'policy-text-only' | 'no-phi';

declare const MODEL_INPUT_BRAND: unique symbol;
/** Opaque, branded input. Phantom brand ⇒ only the factory can construct a value of this type. */
export type ModelInput = {
  readonly inputClass: InputClass;
  readonly text: string;
} & { readonly [MODEL_INPUT_BRAND]: 'ModelInput' };

/** The ONLY constructor: policy text. There is deliberately no PHI/member constructor. */
export function policyTextInput(text: string): ModelInput {
  return { inputClass: 'policy-text-only', text } as ModelInput;
}

export interface DlpFinding {
  kind: string;
  match: string;
}

const PHI_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: 'ssn', re: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/ }, // formatted OR bare 9-digit
  { kind: 'mrn', re: /\bMRN[:#]?\s*\d{3,}\b/i },
  { kind: 'member-id', re: /\bmember[\s_-]?id\b/i }, // "memberId", "member id", "member_id"
  { kind: 'member-ref', re: /\bmember\b[\s:#-]*[A-Za-z]?\d{4,}\b/i }, // "Member M12345"
  { kind: 'dob', re: /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d\d\b/ },
  { kind: 'phone', re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/ },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
];

/** Deterministic PHI scan. Findings mean BLOCK (fail closed), never strip. */
export function dlpScan(text: string): DlpFinding[] {
  const out: DlpFinding[] = [];
  for (const p of PHI_PATTERNS) {
    const m = p.re.exec(text);
    if (m) out.push({ kind: p.kind, match: m[0] });
  }
  return out;
}

export interface ModelResponse {
  text: string;
  confidence: number;
  model: string;
  modelVersion: string;
}
export type ModelBackend = (input: ModelInput) => Promise<ModelResponse>;

export interface ModelCallRecord {
  purpose: string;
  model: string;
  modelVersion: string;
  promptHash: string;
  inputClass: InputClass;
  outputHash: string;
  confidence: number;
  dlp: { ran: boolean; findings: DlpFinding[]; blocked: boolean };
  latencyMs: number;
  at: string;
}

export class PhiBlockedError extends Error {
  constructor(public readonly findings: DlpFinding[]) {
    super(`PHI blocked at model boundary: ${findings.map((f) => f.kind).join(', ')}`);
    this.name = 'PhiBlockedError';
  }
}

export interface ModelCallReq {
  purpose: string;
  input: ModelInput;
}
export interface ModelCallResult {
  output: { text: string; confidence: number };
  record: ModelCallRecord;
  ledgerId: string;
}

/** Deterministic, offline fixture backend for dev/CI (no keys, no network). */
export function fixtureBackend(
  fixtures: Record<string, string> = {},
  model = 'fixture',
  modelVersion = 'v0'
): ModelBackend {
  return async (input: ModelInput): Promise<ModelResponse> => {
    const key = hashText(input.text);
    const text = fixtures[key] ?? `FIXTURE:${key.slice(0, 12)}`;
    return { text, confidence: 1, model, modelVersion };
  };
}

/** Serialize the whole input (incl. any smuggled fields) for DLP; fall back to `.text`. */
function serializeForDlp(input: ModelInput): string {
  try {
    return JSON.stringify(input) ?? input.text;
  } catch {
    return input.text;
  }
}

export async function auditedModelCall(
  req: ModelCallReq,
  backend: ModelBackend,
  ledger: Ledger,
  now: () => string = () => new Date().toISOString()
): Promise<ModelCallResult> {
  const promptHash = hashText(req.input.text);
  // (2) Scan the WHOLE serialized input so structured PHI smuggled via a cast is caught too.
  const findings = dlpScan(serializeForDlp(req.input));
  if (findings.length > 0) {
    ledger.append(
      'ModelCallRecord',
      {
        purpose: req.purpose,
        inputClass: req.input.inputClass,
        promptHash,
        dlp: { ran: true, findings, blocked: true },
        at: now(),
      },
      'auditedModelClient'
    );
    throw new PhiBlockedError(findings);
  }
  // (3) Pre-call INTENT before the backend: no model call without a record. Fails closed if
  //     the ledger cannot record.
  ledger.append(
    'ModelCallIntent',
    { purpose: req.purpose, inputClass: req.input.inputClass, promptHash, at: now() },
    'auditedModelClient'
  );
  // (1) Reconstruct to text-only: any smuggled extra fields never reach the backend.
  const safeInput = policyTextInput(req.input.text);
  const t0 = Date.now();
  const res = await backend(safeInput);
  const record: ModelCallRecord = {
    purpose: req.purpose,
    model: res.model,
    modelVersion: res.modelVersion,
    promptHash,
    inputClass: 'policy-text-only',
    outputHash: hashText(res.text),
    confidence: res.confidence,
    dlp: { ran: true, findings: [], blocked: false },
    latencyMs: Date.now() - t0,
    at: now(),
  };
  const entry = ledger.append('ModelCallRecord', record, 'auditedModelClient');
  return {
    output: { text: res.text, confidence: res.confidence },
    record,
    ledgerId: entry.ledgerId,
  };
}
