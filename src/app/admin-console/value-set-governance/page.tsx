'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ValueSetGovernanceConsole from './components/Console';
import { DEMO_PRINCIPALS, governanceModeForRole, type GovernancePrincipal } from './governanceApi';

/** Human label for a console principal's governance role (maker / checker / viewer). */
const GOV_ROLE_LABEL: Record<string, string> = {
  'value-set-steward': 'Steward (maker)',
  'value-set-reviewer': 'Reviewer (checker)',
  viewer: 'Viewer',
};
function roleLabel(p: GovernancePrincipal): string {
  return GOV_ROLE_LABEL[p.govRole ?? 'viewer'];
}

/**
 * Value-Set Governance Console (Iteration 8A-iii, Wave B).
 *
 * Dual-mode specialist surface over the Wave-A governance engine: list versions
 * with lifecycle state + active badge, diff members between versions, run the
 * approval-workflow gates (submit / approve / reject) gated by role AND the
 * maker-checker rule, review the immutable version-history timeline, and replay a
 * code's binding against a chosen historical version. Mode (admin vs viewer) is
 * derived from the selected principal's role — no new auth.
 */
export default function ValueSetGovernancePage() {
  const [principalKey, setPrincipalKey] = useState<keyof typeof DEMO_PRINCIPALS>('steward');
  const principal: GovernancePrincipal = DEMO_PRINCIPALS[principalKey];
  const mode = governanceModeForRole(principal.govRole);

  return (
    <AppLayout
      pageTitle="Value-Set Governance"
      breadcrumbs={[{ label: 'Admin Console', href: '/admin-console/home' }, { label: 'Value-Set Governance' }]}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-carbon-gray-100">Value-Set Governance</h1>
          <p className="text-sm text-carbon-gray-70 mt-0.5">
            Review, diff, approve, and replay governed value-set versions with maker-checker workflow gates
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs text-carbon-gray-50 uppercase tracking-wide font-semibold">Acting as</span>
          <select
            value={principalKey}
            onChange={(e) => setPrincipalKey(e.target.value as keyof typeof DEMO_PRINCIPALS)}
            className="text-xs border border-carbon-gray-20 bg-white px-2 py-1 focus:outline-none focus:border-carbon-blue"
            aria-label="Acting principal"
          >
            {(Object.keys(DEMO_PRINCIPALS) as (keyof typeof DEMO_PRINCIPALS)[]).map((k) => {
              const p = DEMO_PRINCIPALS[k];
              return (
                <option key={k} value={k}>
                  {p.name} — {roleLabel(p)} ({governanceModeForRole(p.govRole)})
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="mb-4 text-xs text-carbon-gray-50">
        Mode: <span className="font-semibold text-carbon-gray-100">{mode}</span>
      </div>

      <ValueSetGovernanceConsole principal={principal} />
    </AppLayout>
  );
}
