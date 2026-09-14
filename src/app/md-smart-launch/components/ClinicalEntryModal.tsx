'use client';
/**
 * ClinicalEntryModal — reusable Cerner-styled modal wrapper for point-of-care
 * clinical entry forms (Condition, AllergyIntolerance, MedicationRequest).
 *
 * Accepts the form as children. Handles overlay, keyboard (Escape to close),
 * saving spinner, and inline error display. Each domain form owns its own
 * submit logic; this component owns presentation only.
 */
import React, { useEffect } from 'react';

interface ClinicalEntryModalProps {
  title: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: React.ReactNode;
}

export default function ClinicalEntryModal({
  title,
  saving,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Save to FHIR',
  submitDisabled = false,
  children,
}: ClinicalEntryModalProps) {
  // Escape key closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        aria-label="Close modal"
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      {/* Panel */}
      <div className="relative bg-white border border-[#b7c1ca] rounded-sm shadow-xl w-full max-w-lg">
        {/* Cerner-style header */}
        <div className="bg-[#2d4a63] text-white px-4 py-2.5 flex items-center justify-between">
          <span className="text-[13px] font-bold">{title}</span>
          <button
            className="text-white/70 hover:text-white text-lg leading-none"
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form body */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">{children}</div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 bg-[#fdecea] border border-[#f5c2c7] text-[#c8102e] text-[12px] rounded-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#e2e7eb] flex justify-end gap-2 bg-[#f4f6f8]">
          <button
            onClick={onCancel}
            className="text-[12px] px-4 py-1.5 border border-[#b7c1ca] rounded-sm hover:bg-white bg-white"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitDisabled || saving}
            className="text-[12px] px-4 py-1.5 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77] disabled:opacity-50"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
