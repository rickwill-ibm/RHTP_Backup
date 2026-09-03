'use client';
/**
 * PayerExchangePanel — CMS-0057-F Payer-to-Payer Data Exchange (read-only status view)
 *
 * Polls the bulk-export-client API (/bulk) for the patient's exchange job status.
 * Full exchange management (initiate, approve) lives in the payer-admin-app.
 * This panel gives the clinician visibility into what data has been imported
 * from a previous payer.
 */
import React, { useCallback, useEffect, useState } from 'react';

const BULK_ENDPOINT =
  process.env.NEXT_PUBLIC_BULK_EXPORT_ENDPOINT ?? 'http://localhost:8091/bulk';

type ExchangeStatus = 'idle' | 'queued' | 'in-progress' | 'complete' | 'error';

interface ExchangeJob {
  jobId: string;
  previousPayerName: string;
  requestedAt: string;
  completedAt?: string;
  status: ExchangeStatus;
  resourceCounts?: Record<string, number>;
  fileUrl?: string;
}

function statusColor(s: ExchangeStatus): string {
  switch (s) {
    case 'complete': return 'text-[#1e7e34]';
    case 'in-progress': return 'text-[#0043ce]';
    case 'queued': return 'text-[#8a5300]';
    case 'error': return 'text-[#c8102e]';
    default: return 'text-[#5b6770]';
  }
}

function statusLabel(s: ExchangeStatus): string {
  switch (s) {
    case 'complete': return '✓ Complete';
    case 'in-progress': return '⟳ In Progress';
    case 'queued': return '◷ Queued';
    case 'error': return '✗ Error';
    default: return '—';
  }
}

/** Mock exchange jobs for demo mode. */
const MOCK_JOBS: ExchangeJob[] = [
  {
    jobId: 'pdex-job-001',
    previousPayerName: 'Blue Cross Blue Shield (Previous)',
    requestedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'complete',
    resourceCounts: { Patient: 1, Coverage: 2, Condition: 14, MedicationRequest: 8, Claim: 23, ExplanationOfBenefit: 23 },
  },
];

interface PayerExchangePanelProps {
  patientId: string;
}

export default function PayerExchangePanel({ patientId }: PayerExchangePanelProps) {
  const [jobs, setJobs] = useState<ExchangeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${BULK_ENDPOINT}/status?patient=${encodeURIComponent(patientId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Bulk export API ${res.status}`);
      const data = (await res.json()) as { jobs?: ExchangeJob[] };
      setJobs(data.jobs ?? []);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (err) {
      // Fall back to mock jobs when service is unreachable
      setJobs(MOCK_JOBS);
      setError(
        err instanceof Error && err.message.includes('fetch')
          ? 'Bulk export service offline — showing mock data'
          : err instanceof Error
          ? err.message
          : String(err),
      );
      setLastFetched(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchJobs();
    // Poll every 15 s for in-progress jobs
    const id = setInterval(() => {
      if (jobs.some((j) => j.status === 'queued' || j.status === 'in-progress')) {
        fetchJobs();
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [fetchJobs, jobs]);

  return (
    <div className="bg-white border border-[#b7c1ca] rounded-sm max-w-3xl">
      {/* Header */}
      <div className="bg-[#2d4a63] text-white px-4 py-2 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold">Payer-to-Payer Data Exchange</p>
          <p className="text-[11px] text-white/70">
            CMS-0057-F § Payer-to-Payer &nbsp;·&nbsp; DaVinci PDex bulk export
          </p>
        </div>
        <button
          className="text-white/80 hover:text-white text-[11.5px] border border-white/30 px-2 py-0.5 rounded-sm"
          onClick={fetchJobs}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : '↺ Refresh'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-[#fff4e5] border-b border-[#e8a33d] px-4 py-1.5 text-[11.5px] text-[#8a5300]">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {loading && <p className="text-[12.5px] text-[#5b6770]">Loading exchange history…</p>}

        {!loading && jobs.length === 0 && (
          <div className="text-[12.5px] text-[#5b6770] italic">
            No payer data exchange records found for this patient.
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.jobId} className="border border-[#e2e7eb] rounded-sm p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{job.previousPayerName}</p>
                    <p className="text-[11px] text-[#5b6770]">
                      Requested: {new Date(job.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {job.completedAt &&
                        ` · Completed: ${new Date(job.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </p>
                  </div>
                  <span className={`text-[12px] font-semibold ${statusColor(job.status)}`}>
                    {statusLabel(job.status)}
                  </span>
                </div>

                {/* Resource summary */}
                {job.resourceCounts && Object.keys(job.resourceCounts).length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-[#5b6770] uppercase tracking-wider mb-1">
                      Imported resources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(job.resourceCounts).map(([type, count]) => (
                        <span
                          key={type}
                          className="inline-flex items-center gap-1 bg-[#f0f4f8] border border-[#d5dce2] rounded-sm px-2 py-0.5 text-[11px]"
                        >
                          <span className="font-semibold text-[#1a1a1a]">{count}</span>
                          <span className="text-[#5b6770]">{type}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* File link */}
                {job.status === 'complete' && job.fileUrl && (
                  <div className="mt-2">
                    <a
                      href={job.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] text-[#0043ce] hover:underline"
                    >
                      View exported NDJSON files →
                    </a>
                  </div>
                )}

                {/* Job id */}
                <p className="text-[10.5px] text-[#8a949c] mt-2">Job ID: {job.jobId}</p>
              </div>
            ))}
          </div>
        )}

        {lastFetched && (
          <p className="text-[10.5px] text-[#8a949c] mt-3">Last refreshed: {lastFetched}</p>
        )}
      </div>
    </div>
  );
}
