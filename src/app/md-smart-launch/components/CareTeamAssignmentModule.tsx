'use client';
import React, { useState } from 'react';
import type { CareTeamAssignment } from '@/lib/smartFhirTypes';
import { mockCareTeamCandidates } from '@/lib/smartFhirMockData';
import Icon from '@/components/ui/AppIcon';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

interface CareTeamAssignmentModuleProps {
  patientId: string;
  encounterId: string;
  practitionerId?: string; // requester (Dr. Rick's FHIR ID)
  onAssignmentConfirmed: (assignments: CareTeamAssignment[]) => void;
}

const NETWORK_CONFIG = {
  Preferred: { bg: 'bg-[#defbe6]', text: 'text-[#0e6027]', border: 'border-[#a7f0ba]' },
  'In-Network': { bg: 'bg-[#d0e2ff]', text: 'text-[#0043ce]', border: 'border-[#97c1ff]' },
  'Out-of-Network': { bg: 'bg-[#fff1f1]', text: 'text-[#da1e28]', border: 'border-[#ffb3b8]' },
};

export default function CareTeamAssignmentModule({
  patientId,
  encounterId,
  practitionerId = 'practitioner-rick',
  onAssignmentConfirmed,
}: CareTeamAssignmentModuleProps) {
  const [candidates, setCandidates] = useState<CareTeamAssignment[]>(mockCareTeamCandidates);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    mockCareTeamCandidates.filter((c) => c.autoSelected).map((c) => c.id)
  );
  const [step, setStep] = useState<'select' | 'confirm' | 'submitting' | 'confirmed'>('select');
  const [confirmId, setConfirmId] = useState('');
  const [confirmedAt, setConfirmedAt] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedCandidates = candidates.filter((c) => selectedIds.includes(c.id));

  const handleConfirm = () => {
    setStep('submitting');

    const ts = new Date().toISOString();
    const cid = `CTA-${Date.now().toString(36).toUpperCase()}`;

    const confirmed = selectedCandidates.map((c) => ({
      ...c,
      status: 'confirmed' as const,
      confirmedAt: ts,
      fhirServiceRequestId: `SR-${c.id.toUpperCase()}`,
    }));

    // ── FHIR writes: ServiceRequest + Task per specialist (fire-and-forget) ──
    if (!getFhirMockMode()) {
      const client = getFhirClient();
      selectedCandidates.forEach((specialist) => {
        // 1. POST ServiceRequest (the referral order)
        client
          .create({
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            priority: 'routine',
            category: [
              {
                coding: [
                  {
                    system: 'http://snomed.info/sct',
                    code: '3457005',
                    display: 'Patient referral',
                  },
                ],
              },
            ],
            code: { text: `${specialist.specialty} Referral — Care Team Assignment` },
            subject: { reference: `Patient/${patientId}` },
            encounter: { reference: `Encounter/${encounterId}` },
            requester: {
              reference: `Practitioner/${practitionerId}`,
              display: 'Dr. Rick Williams',
            },
            performer: [
              {
                reference: `Practitioner/${specialist.providerId}`,
                display: specialist.providerName,
              },
            ],
            authoredOn: ts,
            note: [
              {
                text:
                  specialist.selectionReason ??
                  `${specialist.specialty} referral — care team assignment`,
              },
            ],
            extension: [
              {
                url: 'http://tcoc.example.org/fhir/StructureDefinition/network-tier',
                valueString: specialist.networkTier,
              },
              {
                url: 'http://tcoc.example.org/fhir/StructureDefinition/quality-score',
                valueInteger: specialist.qualityScore,
              },
            ],
          })
          .then((sr: unknown) => {
            const srId = (sr as { id?: string })?.id ?? `SR-${specialist.id}`;
            console.info(
              `[CareTeamAssignment] ServiceRequest ${srId} created for ${specialist.providerName}`
            );

            // 2. POST Task owned by the specialist so their inbox receives it
            client
              .create({
                resourceType: 'Task',
                status: 'requested',
                intent: 'order',
                priority: 'routine',
                code: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/CodeSystem/task-code',
                      code: 'fulfill',
                      display: 'Fulfill the focal request',
                    },
                  ],
                  text: 'Specialist Referral',
                },
                description: `${specialist.specialty} referral — care team assignment from Dr. Rick Williams`,
                focus: { reference: `ServiceRequest/${srId}` },
                for: { reference: `Patient/${patientId}` },
                encounter: { reference: `Encounter/${encounterId}` },
                authoredOn: ts,
                lastModified: ts,
                requester: {
                  reference: `Practitioner/${practitionerId}`,
                  display: 'Dr. Rick Williams',
                },
                owner: {
                  reference: `Practitioner/${specialist.providerId}`,
                  display: specialist.providerName,
                },
                note: [
                  {
                    text: `NPI: ${specialist.providerNpi} · Network: ${specialist.networkTier} · Quality: ${specialist.qualityScore}`,
                  },
                ],
                extension: [
                  {
                    url: 'http://tcoc.example.org/fhir/StructureDefinition/care-gap-domain',
                    valueString: 'Clinical',
                  },
                  {
                    url: 'http://tcoc.example.org/fhir/StructureDefinition/specialist-specialty',
                    valueString: specialist.specialty,
                  },
                ],
              })
              .then((task: unknown) =>
                console.info(
                  `[CareTeamAssignment] Task ${(task as { id?: string })?.id} created → owner: ${specialist.providerName}`
                )
              )
              .catch((err) =>
                console.warn(
                  `[CareTeamAssignment] Task POST failed for ${specialist.providerName}:`,
                  err
                )
              );
          })
          .catch((err) =>
            console.warn(
              `[CareTeamAssignment] ServiceRequest POST failed for ${specialist.providerName}:`,
              err
            )
          );
      });
    }

    setConfirmedAt(ts);
    setConfirmId(cid);
    setStep('confirmed');
    onAssignmentConfirmed(confirmed);
  };

  if (step === 'submitting') {
    return (
      <div className="bg-white border border-carbon-gray-20 p-8 flex flex-col items-center justify-center min-h-[180px]">
        <div className="w-8 h-8 border-2 border-[#6929c4] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-carbon-gray-100">
          Submitting care team assignments…
        </p>
        <p className="text-xs text-carbon-gray-50 mt-1">
          Writing FHIR ServiceRequest resources to Cerner
        </p>
      </div>
    );
  }

  if (step === 'confirmed') {
    return (
      <div className="bg-white border border-[#a7f0ba]">
        <div className="bg-[#defbe6] px-5 py-4 flex items-center gap-3">
          <Icon name="CheckCircleIcon" size={20} className="text-[#0e6027]" />
          <div>
            <p className="text-sm font-semibold text-[#0e6027]">Care team assignments confirmed</p>
            <p className="text-xs text-[#0e6027]/70">
              FHIR ServiceRequest resources created · {new Date(confirmedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-carbon-gray-50 mb-3">
            Confirmation:{' '}
            <span className="font-mono font-semibold text-carbon-gray-100">{confirmId}</span>
          </p>
          <div className="space-y-2">
            {selectedCandidates.map((c) => {
              const netCfg = NETWORK_CONFIG[c.networkTier];
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-carbon-gray-10 border border-carbon-gray-20"
                >
                  <div className="w-8 h-8 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">
                      {c.providerName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-carbon-gray-100">{c.providerName}</p>
                    <p className="text-2xs text-carbon-gray-50">
                      {c.specialty} · {c.role}
                    </p>
                  </div>
                  <span
                    className={`text-2xs font-semibold px-1.5 py-0.5 border ${netCfg.bg} ${netCfg.text} ${netCfg.border}`}
                  >
                    {c.networkTier}
                  </span>
                  <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-carbon-gray-20">
      {/* Header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="UserGroupIcon" size={16} className="text-carbon-gray-70" />
          <span className="text-sm font-semibold text-carbon-gray-100">Care Team Assignment</span>
          <span className="text-2xs text-carbon-gray-50 bg-carbon-gray-10 px-2 py-0.5">
            Auto-selected from provider network
          </span>
        </div>
        {step === 'select' && selectedIds.length > 0 && (
          <button
            onClick={() => setStep('confirm')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors"
          >
            <Icon name="CheckIcon" size={13} />
            Confirm ({selectedIds.length})
          </button>
        )}
        {step === 'confirm' && (
          <button
            onClick={() => setStep('select')}
            className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            ← Back
          </button>
        )}
      </div>

      {step === 'select' && (
        <div className="p-4">
          {/* Auto-select explanation */}
          <div className="bg-[#f6f2ff] border border-[#d4bbff] px-4 py-2.5 mb-4 flex items-start gap-2">
            <Icon name="SparklesIcon" size={14} className="text-[#6929c4] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#6929c4]">
              Auto-selected based on: preferred network tier, quality score, accepting new patients,
              proximity to patient, and wait time.
            </p>
          </div>

          <div className="space-y-2">
            {candidates.map((c) => {
              const isSelected = selectedIds.includes(c.id);
              const netCfg = NETWORK_CONFIG[c.networkTier];
              const qualColor =
                c.qualityScore >= 90
                  ? 'text-[#24a148]'
                  : c.qualityScore >= 80
                    ? 'text-[#b45309]'
                    : 'text-[#da1e28]';

              return (
                <div
                  key={c.id}
                  onClick={() => toggleSelect(c.id)}
                  className={`border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#6929c4] bg-[#f6f2ff]'
                      : 'border-carbon-gray-20 bg-white hover:border-carbon-gray-40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div
                      className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? 'border-[#6929c4] bg-[#6929c4]' : 'border-carbon-gray-30'
                      }`}
                    >
                      {isSelected && <Icon name="CheckIcon" size={10} className="text-white" />}
                    </div>

                    {/* Provider avatar */}
                    <div className="w-9 h-9 bg-carbon-gray-90 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">
                        {c.providerName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-carbon-gray-100">
                          {c.providerName}
                        </p>
                        {c.autoSelected && (
                          <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#e8daff] text-[#6929c4]">
                            ✦ Auto-selected
                          </span>
                        )}
                        <span
                          className={`text-2xs font-semibold px-1.5 py-0.5 border ${netCfg.bg} ${netCfg.text} ${netCfg.border}`}
                        >
                          {c.networkTier}
                        </span>
                      </div>
                      <p className="text-xs text-carbon-gray-70 mb-2">
                        {c.specialty} · {c.role}
                      </p>

                      {/* Metrics row */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Icon name="StarIcon" size={12} className={qualColor} />
                          <span className={`text-xs font-mono font-semibold ${qualColor}`}>
                            {c.qualityScore}
                          </span>
                          <span className="text-2xs text-carbon-gray-50">quality</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Icon name="ClockIcon" size={12} className="text-carbon-gray-50" />
                          <span className="text-xs text-carbon-gray-70">{c.waitDays}d wait</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Icon name="MapPinIcon" size={12} className="text-carbon-gray-50" />
                          <span className="text-xs text-carbon-gray-70">{c.distance} mi</span>
                        </div>
                      </div>

                      {/* Selection reason */}
                      {c.autoSelected && (
                        <p className="text-2xs text-carbon-gray-50 mt-1.5 italic">
                          {c.selectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="p-5">
          <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3 mb-4 flex items-start gap-2">
            <Icon
              name="ExclamationTriangleIcon"
              size={15}
              className="text-[#b45309] flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-[#b45309]">
              Confirming will write care team assignments to Cerner as FHIR ServiceRequest resources
              and notify the selected providers.
            </p>
          </div>
          <div className="space-y-2 mb-5">
            {selectedCandidates.map((c) => {
              const netCfg = NETWORK_CONFIG[c.networkTier];
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 bg-carbon-gray-10 border border-carbon-gray-20"
                >
                  <div className="w-8 h-8 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">
                      {c.providerName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-carbon-gray-100">{c.providerName}</p>
                    <p className="text-xs text-carbon-gray-50">
                      {c.specialty} · NPI: {c.providerNpi}
                    </p>
                  </div>
                  <span
                    className={`text-2xs font-semibold px-1.5 py-0.5 border ${netCfg.bg} ${netCfg.text} ${netCfg.border}`}
                  >
                    {c.networkTier}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#6929c4] text-white text-sm font-semibold hover:bg-[#491d8b] transition-colors"
            >
              <Icon name="CheckIcon" size={15} />
              Confirm & Submit to Cerner
            </button>
            <button
              onClick={() => setStep('select')}
              className="px-4 py-2.5 border border-carbon-gray-20 text-sm text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              Edit Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
