'use client';
/**
 * DtrLaunchModal — Prior Authorization DTR (Documentation Templates & Rules)
 *
 * Launched from a CDS Hooks SMART link card returned by the order-sign hook.
 * Renders an inline questionnaire frame (or opens a new tab for a true SMART app).
 *
 * Flow:
 *   1. CDS card returns a `links[].type === 'smart'` card for PA requirements.
 *   2. OrderEntryModule renders this modal with the SMART link URL.
 *   3. User completes the questionnaire; onComplete fires with a QuestionnaireResponse.
 *   4. ProviderViewDocument enables the "Submit PA" button with the QR attached.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { CdsLink } from '@/lib/smartFhirTypes';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

export interface DtrLaunchModalProps {
  smartLink: CdsLink;
  patientId: string;
  encounterId?: string;
  practitionerId?: string;
  /** ServiceRequest id from the order that triggered CRD */
  serviceRequestId?: string;
  /** Coverage id to attach to the QR */
  coverageId?: string;
  onComplete: (questionnaireResponse: Record<string, unknown>) => void;
  onDismiss: () => void;
}

/** Build a minimal QuestionnaireResponse stub for mock mode. */
function buildMockQR(params: {
  patientId: string;
  serviceRequestId?: string;
  coverageId?: string;
}): Record<string, unknown> {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: { reference: `Patient/${params.patientId}` },
    authored: new Date().toISOString(),
    item: [
      {
        linkId: 'q-clinical-indication',
        text: 'Clinical indication',
        answer: [{ valueString: 'Patient meets criteria per clinical guidelines.' }],
      },
      {
        linkId: 'q-alternative-tried',
        text: 'Conservative treatment tried?',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'q-urgency',
        text: 'Is this urgent?',
        answer: [{ valueBoolean: false }],
      },
    ],
  };
}

export default function DtrLaunchModal({
  smartLink,
  patientId,
  encounterId,
  practitionerId,
  serviceRequestId,
  coverageId,
  onComplete,
  onDismiss,
}: DtrLaunchModalProps) {
  const [mode, setMode] = useState<'loading' | 'inline' | 'external' | 'mock' | 'submitted'>(
    getFhirMockMode() ? 'mock' : 'loading'
  );
  const [mockAnswers, setMockAnswers] = useState({
    indication: 'Patient meets criteria per clinical guidelines.',
    alternativeTried: true,
    urgent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [savedQrId, setSavedQrId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the launch URL — append SMART context params
  const launchUrl = React.useMemo(() => {
    try {
      const u = new URL(smartLink.url);
      u.searchParams.set('patientId', patientId);
      if (encounterId) u.searchParams.set('encounterId', encounterId);
      if (practitionerId) u.searchParams.set('practitionerId', practitionerId);
      if (serviceRequestId) u.searchParams.set('serviceRequestId', serviceRequestId);
      if (coverageId) u.searchParams.set('coverageId', coverageId);
      return u.toString();
    } catch {
      return smartLink.url;
    }
  }, [smartLink.url, patientId, encounterId, practitionerId, serviceRequestId, coverageId]);

  useEffect(() => {
    if (mode !== 'loading') return;
    // Try to render inline; if the URL is cross-origin we fall back to external tab
    const isSameOrigin =
      typeof window !== 'undefined' && launchUrl.startsWith(window.location.origin);
    setMode(isSameOrigin ? 'inline' : 'external');
  }, [mode, launchUrl]);

  async function handleMockSubmit() {
    setSubmitting(true);
    const qr = {
      ...buildMockQR({ patientId, serviceRequestId, coverageId }),
      item: [
        {
          linkId: 'q-clinical-indication',
          text: 'Clinical indication',
          answer: [{ valueString: mockAnswers.indication }],
        },
        {
          linkId: 'q-alternative-tried',
          text: 'Conservative treatment tried?',
          answer: [{ valueBoolean: mockAnswers.alternativeTried }],
        },
        {
          linkId: 'q-urgency',
          text: 'Is this urgent?',
          answer: [{ valueBoolean: mockAnswers.urgent }],
        },
      ],
    };
    try {
      const saved = await getFhirClient().create<{ id?: string }>(qr);
      setSavedQrId(saved.id ?? null);
      setMode('submitted');
      onComplete({ ...qr, id: saved.id });
    } catch {
      // Even if save fails, pass the unsaved QR — pasService will carry it
      setMode('submitted');
      onComplete(qr);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button aria-label="Close DTR" className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div className="relative bg-white border border-[#b7c1ca] rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#2d4a63] text-white px-4 py-2 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[13px] font-bold">
              Prior Authorization — Documentation Templates & Rules
            </p>
            <p className="text-[11px] text-white/70">
              CRD → DTR Step 2 of 3 &nbsp;·&nbsp; Complete questionnaire to proceed to PA submission
            </p>
          </div>
          <button
            className="text-white/80 hover:text-white text-lg leading-none"
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'loading' && (
            <div className="text-[13px] text-[#5b6770] text-center py-8">
              Loading questionnaire…
            </div>
          )}

          {mode === 'inline' && (
            <iframe
              ref={iframeRef}
              src={launchUrl}
              className="w-full h-[60vh] border-0"
              title="DTR Questionnaire"
            />
          )}

          {mode === 'external' && (
            <div className="text-center py-6">
              <p className="text-[13px] text-[#1a1a1a] mb-3">
                The DTR questionnaire opens in a new tab (cross-origin SMART app).
              </p>
              <a
                href={launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-[#2d4a63] text-white text-[12.5px] rounded-sm hover:bg-[#3a5a77] mb-4"
              >
                Open DTR Questionnaire →
              </a>
              <p className="text-[11.5px] text-[#5b6770] mb-4">
                Once complete, click below to confirm you have submitted the questionnaire.
              </p>
              <button
                className="px-4 py-1.5 bg-[#1e7e34] text-white text-[12.5px] rounded-sm hover:bg-[#176228]"
                onClick={() => {
                  onComplete(buildMockQR({ patientId, serviceRequestId, coverageId }));
                }}
              >
                ✓ Questionnaire Submitted — Continue to PA
              </button>
            </div>
          )}

          {mode === 'mock' && (
            <div>
              <div className="bg-[#fff4e5] border border-[#e8a33d] text-[#8a5300] px-3 py-1.5 text-[11.5px] mb-4 rounded-sm">
                Mock mode — simulated DTR questionnaire
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#1a1a1a] mb-1">
                    Clinical indication for service
                  </label>
                  <textarea
                    className="w-full border border-[#b7c1ca] rounded-sm p-2 text-[12.5px] min-h-[80px] focus:outline-none focus:border-[#2d4a63]"
                    value={mockAnswers.indication}
                    onChange={(e) => setMockAnswers((a) => ({ ...a, indication: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="dtr-alt"
                    type="checkbox"
                    checked={mockAnswers.alternativeTried}
                    onChange={(e) =>
                      setMockAnswers((a) => ({ ...a, alternativeTried: e.target.checked }))
                    }
                    className="w-4 h-4"
                  />
                  <label htmlFor="dtr-alt" className="text-[12.5px]">
                    Conservative/alternative treatment has been tried or is not appropriate
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="dtr-urgent"
                    type="checkbox"
                    checked={mockAnswers.urgent}
                    onChange={(e) => setMockAnswers((a) => ({ ...a, urgent: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <label htmlFor="dtr-urgent" className="text-[12.5px]">
                    This is an urgent request
                  </label>
                </div>
              </div>
            </div>
          )}

          {mode === 'submitted' && (
            <div className="text-center py-6">
              <div className="text-[#1e7e34] text-2xl mb-2">✓</div>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Questionnaire completed</p>
              {savedQrId && (
                <p className="text-[11.5px] text-[#5b6770] mt-1">
                  QuestionnaireResponse/{savedQrId} saved to FHIR
                </p>
              )}
              <p className="text-[12px] text-[#5b6770] mt-2">
                Return to the Document column to submit Prior Authorization.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'mock' && (
          <div className="shrink-0 px-4 pb-4 pt-2 border-t border-[#e2e7eb] flex justify-end gap-2">
            <button
              className="text-[12px] px-3 py-1.5 border border-[#b7c1ca] rounded-sm hover:bg-[#f7f9fa]"
              onClick={onDismiss}
            >
              Cancel
            </button>
            <button
              className="text-[12px] px-4 py-1.5 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77] disabled:opacity-50"
              disabled={submitting || !mockAnswers.indication.trim()}
              onClick={handleMockSubmit}
            >
              {submitting ? 'Saving…' : 'Complete Questionnaire → FHIR'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
