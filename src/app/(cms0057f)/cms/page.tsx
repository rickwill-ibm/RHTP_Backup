'use client';

/**
 * CMS-0057-F hub -- single entry point to the four native provision experiences.
 * Reachable at /cms. Keeps the new work discoverable without touching the
 * existing app navigation.
 */
import { useEffect, useState } from 'react';
import { getJson } from '@/lib/client/bff';
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';

const LINKS = [
  {
    href: '/access',
    title: 'Patient Access',
    desc: 'Coverage, conditions & PA status',
    flag: 'patientAccess' as const,
  },
  {
    href: '/provider-access',
    title: 'Provider Access',
    desc: '$member-match + treatment-relationship data',
    flag: 'providerAccess' as const,
  },
  {
    href: '/payer-to-payer',
    title: 'Payer-to-Payer',
    desc: 'Async bulk export from a prior payer',
    flag: 'payerToPayer' as const,
  },
  {
    href: '/prior-auth',
    title: 'Prior Authorization',
    desc: 'CRD -> DTR -> PAS (human-gated)',
    flag: 'priorAuth' as const,
  },
  {
    href: '/financial-clearance',
    title: 'Golden Thread',
    desc: 'Eligibility · Med-Necessity · PA · Estimation (gold carding)',
    flag: 'goldenThread' as const,
  },
  {
    href: '/network-adequacy',
    title: 'Network Adequacy',
    desc: 'Adequacy analytics + analyst copilot (GA + SD/Maria)',
    flag: 'networkAdequacy' as const,
  },
  {
    href: '/api-explorer',
    title: 'CMS-0057-F API Explorer',
    desc: 'Live BFF endpoint testing -- Postman collection: build, download & run',
  },
];

export default function CmsHubPage(): React.ReactElement {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    getJson<{ authenticated: boolean }>('/api/auth/session').then((r) =>
      setAuthed(!!r.data?.authenticated)
    );
  }, []);

  return (
    <AppLayout>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">CMS-0057-F -- native experience</h1>
          <p className="mt-1 text-sm text-slate-600">
            Patient Access · Provider Access · Payer-to-Payer · Prior Authorization
          </p>
        </header>

        <div className="rounded border border-slate-200 p-3 text-sm">
          {authed === null ? (
            'Checking session...'
          ) : authed ? (
            <span className="text-green-700">Signed in.</span>
          ) : (
            <span>
              Not signed in.{' '}
              <a href="/api/auth/login" className="text-blue-600 underline">
                Sign in (SMART / dev)
              </a>
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((l) => {
            const isOn = l.flag ? flag(l.flag) : true;
            return (
              <a
                key={l.href}
                href={l.href}
                aria-disabled={!isOn}
                className={`block rounded border p-4 transition ${isOn ? 'border-slate-200 hover:border-blue-400' : 'border-slate-100 opacity-50'}`}
              >
                <div className="font-semibold">{l.title}</div>
                <div className="mt-1 text-sm text-slate-600">{l.desc}</div>
                {!isOn ? <div className="mt-1 text-xs text-amber-700">disabled</div> : null}
              </a>
            );
          })}
        </div>
      </main>
    </AppLayout>
  );
}
