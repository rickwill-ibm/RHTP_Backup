'use client';
// CDI DX Evidence accordion detail — extracted from MdPatientSummary.
// Satisfies AI-CODING-CONVENTIONS v2 §2 size ratchet.
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { SOURCE_BADGE } from '../data/cdiData';

interface CdiOpportunity {
  id: string;
  condition: string;
  icd: string;
  hcc: string;
  confidence: number;
  rafDelta: string;
  revenueDelta: string;
  evidenceSources: string[];
  justification: string;
  icd10Guidance: string;
  signals: { label: string; value: string; source: string; flagged: boolean }[];
}

interface CdiEvidencePanelProps {
  cdi: CdiOpportunity;
}

/** Expanded DX Evidence accordion body for a single CDI opportunity. */
export default function CdiEvidencePanel({ cdi }: CdiEvidencePanelProps) {
  return (
    <div className="bg-[#fdf6dd] border-t border-[#f1c21b] px-4 py-3 space-y-3">
      {/* Evidence sources */}
      <div>
        <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1.5">
          Evidence Sources
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {cdi.evidenceSources.map((src) => (
            <span
              key={src}
              className={`text-2xs font-semibold px-2 py-0.5 ${SOURCE_BADGE[src] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
            >
              {src}
            </span>
          ))}
        </div>
        <div className="space-y-1">
          {cdi.signals.map((sig, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2 py-1 text-2xs border ${sig.flagged ? 'bg-[#fff8f8] border-[#ffb3b8]' : 'bg-white border-carbon-gray-20'}`}
            >
              <span
                className={`font-semibold px-1.5 py-0.5 text-2xs ${SOURCE_BADGE[sig.source] || 'bg-carbon-gray-20 text-carbon-gray-70'}`}
              >
                {sig.source}
              </span>
              <span className="text-carbon-gray-70">{sig.label}:</span>
              <span
                className={`font-medium ${sig.flagged ? 'text-[#da1e28]' : 'text-carbon-gray-100'}`}
              >
                {sig.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical justification */}
      <div>
        <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
          Clinical Justification
        </p>
        <p className="text-2xs text-carbon-gray-70 leading-relaxed bg-white border border-carbon-gray-20 px-3 py-2">
          {cdi.justification}
        </p>
      </div>

      {/* Confidence breakdown */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Confidence
          </p>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-carbon-gray-20">
              <div
                className={`h-full ${cdi.confidence >= 85 ? 'bg-[#24a148]' : cdi.confidence >= 70 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                style={{ width: `${cdi.confidence}%` }}
              />
            </div>
            <span
              className={`text-sm font-bold font-mono ${cdi.confidence >= 85 ? 'text-[#24a148]' : cdi.confidence >= 70 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
            >
              {cdi.confidence}%
            </span>
          </div>
        </div>
        <div>
          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            RAF Delta
          </p>
          <p className="text-sm font-bold font-mono text-[#0e6027]">{cdi.rafDelta}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
            Revenue at Risk
          </p>
          <p className="text-sm font-bold font-mono text-[#b45309]">{cdi.revenueDelta}</p>
        </div>
      </div>

      {/* ICD-10 guidance */}
      <div>
        <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
          ICD-10 Specificity Guidance
        </p>
        <div className="bg-[#d0e2ff] border border-[#97c1ff] px-3 py-2 flex items-start gap-2">
          <Icon
            name="InformationCircleIcon"
            size={12}
            className="text-[#0043ce] flex-shrink-0 mt-0.5"
          />
          <p className="text-2xs text-[#0043ce] leading-relaxed">{cdi.icd10Guidance}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button className="text-xs font-semibold px-3 py-1.5 bg-[#0e6027] text-white hover:bg-[#0a4d1e] transition-colors flex items-center gap-1.5">
          <Icon name="CheckIcon" size={12} />
          Confirm & Document
        </button>
        <button className="text-xs font-semibold px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
          Defer
        </button>
        <span className="text-2xs text-carbon-gray-50 ml-auto">
          Submission deadline: Dec 31, 2026
        </span>
      </div>
    </div>
  );
}
