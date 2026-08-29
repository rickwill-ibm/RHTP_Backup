/**
 * CRD coverage rules — the Coverage Requirements Discovery end of the chain.
 *
 * From a policy's coded procedures + its "requires PA" determination, produce the coverage rules a
 * CRD service returns at order entry: for each covered/revision procedure code, whether PA is
 * required and which DTR questionnaire (template) to launch. Deterministic; pure. This is the
 * authoring output that feeds CRD, alongside the DTR package that feeds DTR.
 */
import type { NormalizedPolicy } from '@/lib/policy';
import type { CodedProcedure, CoverageRole } from '@/lib/policy/dtr/questionnairePackage';

export interface CoverageRule {
  code: string;
  codeSystem: 'CPT' | 'HCPCS';
  display?: string;
  priorAuthRequired: boolean;
  policyId: string;
  policyTitle: string;
  /** Canonical URL of the DTR questionnaire to launch for this code (matches the DTR package). */
  questionnaireCanonical: string;
  role: CoverageRole | 'referenced';
  reason: string;
}

export interface CoverageRuleOptions {
  baseUrl?: string;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'policy'
  );
}

/**
 * Build coverage rules for a policy's procedures. When roles are present, `covered`/`revision`
 * codes get PA-required rules and `not-covered`/`investigational` get an explicit not-covered rule;
 * `ambiguous` codes are surfaced as PA-required with a review note (never silently covered/denied).
 * Without roles (pre-review), every referenced procedure is PA-required pending review.
 */
export function buildCoverageRules(
  policy: NormalizedPolicy,
  procedures: CodedProcedure[],
  opts: CoverageRuleOptions = {}
): CoverageRule[] {
  const baseUrl = opts.baseUrl ?? 'urn:rhtp:dtr';
  const questionnaireCanonical = `${baseUrl}/Questionnaire/${slug(policy.policyId)}`;

  // Collapse duplicates by code, DETECTING conflicting roles (e.g. the same code marked both
  // covered and not-covered) rather than silently letting input order decide coverage.
  const merged = new Map<string, { proc: CodedProcedure; conflict: boolean }>();
  const order: string[] = [];
  for (const p of procedures) {
    const key = `${p.codeSystem}:${p.code}`;
    const cur = merged.get(key);
    if (!cur) {
      merged.set(key, { proc: p, conflict: false });
      order.push(key);
    } else if ((cur.proc.role ?? 'referenced') !== (p.role ?? 'referenced')) {
      cur.conflict = true;
    }
  }

  const rules: CoverageRule[] = [];
  for (const key of order) {
    const entry = merged.get(key);
    if (!entry) continue;
    const p = entry.proc;

    // A conflict is never auto-resolved: PA-required + route to review, so the collision is visible.
    if (entry.conflict) {
      rules.push({
        code: p.code,
        codeSystem: p.codeSystem,
        display: p.display,
        priorAuthRequired: true,
        policyId: policy.policyId,
        policyTitle: policy.title,
        questionnaireCanonical,
        role: 'ambiguous',
        reason: `Conflicting coverage roles for this code — route to review (${policy.title}).`,
      });
      continue;
    }

    const role: CoverageRole | 'referenced' = p.role ?? 'referenced';
    let priorAuthRequired: boolean;
    let reason: string;
    switch (role) {
      case 'covered':
      case 'revision':
        priorAuthRequired = true;
        reason = `Prior authorization required under ${policy.title}; complete the DTR template.`;
        break;
      case 'not-covered':
        priorAuthRequired = false;
        reason = `Not covered under ${policy.title}.`;
        break;
      case 'investigational':
        priorAuthRequired = false;
        reason = `Considered investigational under ${policy.title}.`;
        break;
      case 'ambiguous':
        priorAuthRequired = true;
        reason = `Coverage depends on operative documentation — route to review (${policy.title}).`;
        break;
      case 'supporting':
        priorAuthRequired = false;
        reason = `Supporting/ancillary code under ${policy.title}.`;
        break;
      default:
        priorAuthRequired = true;
        reason = `Referenced by ${policy.title}; coverage role pending review — PA required by default.`;
    }

    rules.push({
      code: p.code,
      codeSystem: p.codeSystem,
      display: p.display,
      priorAuthRequired,
      policyId: policy.policyId,
      policyTitle: policy.title,
      questionnaireCanonical,
      role,
      reason,
    });
  }
  return rules;
}
