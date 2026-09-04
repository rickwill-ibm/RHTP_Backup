'use client';

/**
 * Provider Access (plan Slice 2). A provider identifies a member via
 * $member-match, then reads member data under a treatment relationship.
 * Authorization basis differs from member access (see lib/authz/guard).
 * Member ID input is pre-populated from the global patient switcher.
 */
import { useState } from 'react';
import { postJson, fhirGet, getJson } from '@/lib/client/bff';
import { canReadMemberData } from '@/lib/authz/guard';
import { toConditionVM, type ConditionVM } from '@/lib/fhir/viewModels';
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';
import { useDemoStore } from '@/uhg/store/demoStore';

interface Bundle {
  entry?: { resource?: Record<string, unknown> }[];
}

interface ConsentStatus {
  memberId: string;
  optedOut: boolean;
}

export default function ProviderAccessPage(): React.ReactElement {
  const activePatientId = useDemoStore((s) => s.activeCitizenId);
  const [memberId, setMemberId] = useState(activePatientId);
  const [matched, setMatched] = useState<string | null>(null);
  const [conditions, setConditions] = useState<ConditionVM[]>([]);
  const [msg, setMsg] = useState('');
  const [consent, setConsent] = useState<ConsentStatus | null>(null);

  const decision = canReadMemberData({
    role: 'provider',
    purpose: 'treatment',
    treatmentRelationship: true,
    providerAccessOptedOut: consent?.optedOut ?? false,
  });

  async function match(): Promise<void> {
    setMsg('Checking consent…');
    const consentRes = await getJson<ConsentStatus>(
      `/api/consent/provider-access?memberId=${encodeURIComponent(memberId)}`
    );
    const optedOut = consentRes.data?.optedOut ?? false;
    setConsent({ memberId, optedOut });

    if (optedOut) {
      setMsg('Member has opted out of Provider Access data sharing. Access denied.');
      setMatched(null);
      setConditions([]);
      return;
    }

    setMsg('Matching…');
    const params = {
      resourceType: 'Parameters',
      parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: memberId } }],
    };
    const r = await postJson<{ id?: string }>('/api/match', params);
    if (r.ok) {
      setMatched(memberId);
      setMsg('Member matched. Loading data under treatment relationship…');
      const cond = await fhirGet<Bundle>(`Condition?subject=Patient/${memberId}`);
      setConditions((cond.data?.entry ?? []).map((e) => toConditionVM(e.resource ?? {})));
      setMsg('');
    } else {
      setMsg('No match / not authorized.');
    }
  }

  if (!flag('providerAccess')) return <main className="p-6">Provider Access is not enabled.</main>;

  return (
    <AppLayout>
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Provider access</h1>
        <p className="text-xs text-slate-500">
          Authorization basis: {decision.reason} {decision.elevatedAudit ? '(elevated audit)' : ''}
        </p>
        <div className="flex gap-2">
          <input
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="Member id (e.g. MARIA_SD_001)"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={match}
            disabled={!memberId}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            $member-match
          </button>
        </div>
        {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
        {consent?.optedOut ? (
          <section
            aria-label="Provider Access opt-out"
            className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            <p className="font-medium text-amber-900">
              Member {consent.memberId} has opted out of Provider Access data sharing.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Access is blocked (Authorization basis: {decision.reason}). The member — or an
              authorized delegate — can revoke this opt-out via the consent API (POST
              /api/consent/provider-access, action: &quot;revoke&quot;).
            </p>
          </section>
        ) : null}
        {matched ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Conditions for {matched}</h2>
            <div className="rounded border border-slate-200 p-3">
              {conditions.length === 0 ? (
                <p className="text-sm text-slate-400">No records.</p>
              ) : (
                conditions.map((c) => (
                  <div key={c.id} className="border-b py-1 text-sm last:border-0">
                    {c.display} — {c.clinicalStatus}
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </main>
    </AppLayout>
  );
}
