'use client';

/**
 * Evidence Record viewer (reviewer UI).
 *
 * Fetches a persisted Evidence Record through the BFF and renders its
 * append-only timeline. Client component — reads only via /api/evidence/:id.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJson } from '@/lib/client/bff';
import type { EvidenceRecord } from '@/lib/evidence';
import { EvidenceTimeline } from '@/components/goldenThread/EvidenceTimeline';

/**
 * GET /api/evidence/:id returns the stored record AND — when the record carries a
 * seal and the verifier key resolves — an independent server-verified `integrity`
 * block (see the BFF's VERIFY-ON-READ). We must carry it through to the timeline;
 * dropping it would render a bare "Sealed" chip that reads as a positive verdict
 * even for a TAMPERED record.
 */
type FetchedEvidenceRecord = EvidenceRecord & {
  integrity?: { intact: boolean; signed: boolean };
};

export default function EvidenceViewerPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [record, setRecord] = useState<FetchedEvidenceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getJson<FetchedEvidenceRecord>(`/api/evidence/${encodeURIComponent(id)}`).then((r) => {
      if (r.ok && r.data) setRecord(r.data);
      else setError(r.error?.issue?.[0]?.diagnostics ?? 'Evidence record not found');
    });
  }, [id]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <nav className="text-sm">
        <a className="text-blue-700 hover:underline" href="/work-queue">
          ← Back to work queue
        </a>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold">Evidence Record</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{id}</p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : !record ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 p-4 text-sm">
            <p>
              <span className="font-medium">Order:</span>{' '}
              {record.order.display ?? record.order.code} ({record.order.code})
              {record.order.providerNpi ? ` · NPI ${record.order.providerNpi}` : ''}
            </p>
            <p>
              <span className="font-medium">Member:</span> {record.memberId} ·{' '}
              <span className="font-medium">Status:</span> {record.status} ·{' '}
              <span className="font-medium">Entries:</span> {record.entries.length}
            </p>
          </section>
          <section className="rounded-lg border border-slate-200 p-4">
            <h2 className="mb-3 text-sm font-semibold">Coverage Determination Record — timeline</h2>
            <EvidenceTimeline record={record} integrity={record.integrity} />
          </section>
        </>
      )}
    </main>
  );
}
