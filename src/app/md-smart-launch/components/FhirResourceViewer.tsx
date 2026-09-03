'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

interface FhirResourceViewerProps {
  resourceType: string;
  resourceId: string;
  label?: string;
  onClose: () => void;
}

// Highlighted top-level FHIR fields shown prominently
const PROMINENT_KEYS = ['resourceType', 'id', 'status', 'code', 'subject', 'effectiveDateTime',
  'valueQuantity', 'valueString', 'clinicalStatus', 'category', 'onset', 'encounter',
  'payor', 'beneficiary', 'subscriber', 'subscriberId', 'scope', 'provision'];

export default function FhirResourceViewer({ resourceType, resourceId, label, onClose }: FhirResourceViewerProps) {
  const [resource, setResource] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMock = getFhirMockMode();
  const fhirBase = process.env.NEXT_PUBLIC_FHIR_BASE_URL ?? 'http://localhost:8080/fhir';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFhirClient().read<Record<string, unknown>>(resourceType, resourceId)
      .then(r => { if (!cancelled) { setResource(r); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [resourceType, resourceId]);

  const prominent = resource
    ? PROMINENT_KEYS.filter(k => k in resource).map(k => ({ key: k, value: resource[k] }))
    : [];
  const rest = resource
    ? Object.entries(resource).filter(([k]) => !PROMINENT_KEYS.includes(k))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div className="relative bg-white border border-[#dddbda] shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col rounded-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#dddbda] bg-[#14304a] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="ServerIcon" size={14} className="text-[#f0ab00] flex-shrink-0" />
            <span className="text-sm font-semibold text-white truncate">
              {label ?? resourceType} <span className="font-mono font-normal opacity-70 text-xs">· {resourceId}</span>
            </span>
            {isMock && (
              <span className="text-2xs font-bold px-2 py-0.5 bg-[#fce8b2] text-[#7c4c00] border border-[#f0c56c] rounded-sm flex-shrink-0">
                MOCK
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors flex-shrink-0 ml-3">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[#706e6b] py-8 justify-center">
              <Icon name="ArrowPathIcon" size={16} className="animate-spin text-[#0070d2]" />
              Loading FHIR resource…
            </div>
          )}

          {error && (
            <div className="bg-[#fce9e9] border border-[#f5a9a9] px-4 py-3 text-sm text-[#c23934]">
              <span className="font-semibold">Error loading resource:</span> {error}
            </div>
          )}

          {resource && !loading && (
            <>
              {/* Key fields */}
              {prominent.length > 0 && (
                <div className="bg-[#e8f4fb] border border-[#b3d6f5] rounded-sm p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-[#16325c] mb-2">Key Fields</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {prominent.map(({ key, value }) => (
                      <div key={key}>
                        <p className="text-2xs text-[#706e6b] uppercase tracking-wide">{key}</p>
                        <p className="text-xs font-medium text-[#3e3e3c] font-mono break-all">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full JSON */}
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-[#706e6b] mb-1.5">Full Resource (FHIR R4)</p>
                <pre className="bg-[#f4f6f9] border border-[#dddbda] rounded-sm p-3 text-2xs font-mono text-[#3e3e3c] overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(resource, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#dddbda] bg-[#f4f6f9] flex-shrink-0">
          <span className="text-2xs text-[#706e6b] font-mono truncate">{fhirBase}/{resourceType}/{resourceId}</span>
          <a
            href={`${fhirBase}/${resourceType}/${resourceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-2xs font-semibold text-[#0070d2] hover:text-[#005fb2] transition-colors flex-shrink-0 ml-3"
          >
            Open in HAPI <Icon name="ArrowTopRightOnSquareIcon" size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
