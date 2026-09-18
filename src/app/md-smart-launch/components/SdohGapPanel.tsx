'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { toast } from 'sonner';

// ─── Gravity Project domain config ───────────────────────────────────────────

interface SdohDomainConfig {
  id: string;
  label: string;
  emoji: string;
  zCode: string;
  zDisplay: string;
  loincCode: string;
  serviceRequestSnomed: string;
  serviceRequestDisplay: string;
  procedureSnomed: string;
  procedureDisplay: string;
  cboName: string;
  hedisNumerator: string;
  color: string;
  bg: string;
}

const SDOH_DOMAINS: SdohDomainConfig[] = [
  {
    id: 'food',
    label: 'Food Insecurity',
    emoji: '🍎',
    zCode: 'Z59.41',
    zDisplay: 'Food insecurity',
    loincCode: '93031-3',
    serviceRequestSnomed: '710925007',
    serviceRequestDisplay: 'Provision of food',
    procedureSnomed: '431841000124104',
    procedureDisplay: 'Referral to food pantry program',
    cboName: 'Bennett County Action — Food Pantry',
    hedisNumerator: 'SNS-E Food',
    color: 'text-[#8a3800]',
    bg: 'bg-[#fff8e1]',
  },
  {
    id: 'housing',
    label: 'Housing Instability',
    emoji: '🏠',
    zCode: 'Z59.812',
    zDisplay: 'Housing instability',
    loincCode: '93030-5',
    serviceRequestSnomed: '308335008',
    serviceRequestDisplay: 'Arrangement of housing',
    procedureSnomed: '308335008',
    procedureDisplay: 'Housing assistance provided',
    cboName: 'SDHDA — South Dakota Housing Development Authority',
    hedisNumerator: 'SNS-E Housing',
    color: 'text-[#0043ce]',
    bg: 'bg-[#d0e2ff]',
  },
  {
    id: 'transportation',
    label: 'Transportation Insecurity',
    emoji: '🚗',
    zCode: 'Z59.82',
    zDisplay: 'Transportation insecurity',
    loincCode: '93034-7',
    serviceRequestSnomed: '308335008',
    serviceRequestDisplay: 'Arrangement of transportation',
    procedureSnomed: '308335008',
    procedureDisplay: 'Transportation assistance provided — ride completed',
    cboName: 'NEMT — Non-Emergency Medical Transport',
    hedisNumerator: 'SNS-E Transportation',
    color: 'text-[#198038]',
    bg: 'bg-[#defbe6]',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveSdohGap {
  conditionId: string;
  domain: SdohDomainConfig;
  onsetDate: string;
  serviceRequestId?: string;
  taskId?: string;
  procedureId?: string;
  status: 'open' | 'sent' | 'resolved';
}

interface Props {
  patientFhirId: string;
  practitionerFhirId: string;
  practitionerDisplay: string;
  onAuditEntry?: (action: string, details: Record<string, string>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SdohGapPanel({
  patientFhirId,
  practitionerFhirId,
  practitionerDisplay,
  onAuditEntry,
}: Props) {
  const [gaps, setGaps] = useState<ActiveSdohGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null); // conditionId being sent
  const [simulating, setSimulating] = useState<string | null>(null); // conditionId being simulated

  // ── Load active SDOH Conditions from FHIR ──────────────────────────────────
  const loadGaps = useCallback(async () => {
    if (getFhirMockMode() || !patientFhirId) return;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bundle: any = await getFhirClient().search('Condition', {
        subject: `Patient/${patientFhirId}`,
        category: 'problem-list-item',
        'clinical-status': 'active',
        _count: '50',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const found: ActiveSdohGap[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const entry of bundle?.entry ?? []) {
        const cond = entry?.resource;
        if (!cond || cond.resourceType !== 'Condition') continue;
        // Match by ICD-10 Z-code
        const condCode: string = cond.code?.coding?.[0]?.code ?? '';
        const domain = SDOH_DOMAINS.find((d) => d.zCode === condCode);
        if (!domain) continue;
        // Check if already sent (look for our extension)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sdohStatus =
          cond.extension?.find((e: any) => e.url?.includes('sdoh-status'))?.valueString ?? 'open';
        found.push({
          conditionId: cond.id,
          domain,
          onsetDate:
            cond.onsetDateTime?.slice(0, 10) ?? cond.meta?.lastUpdated?.slice(0, 10) ?? '—',
          status: sdohStatus === 'sent' ? 'sent' : sdohStatus === 'resolved' ? 'resolved' : 'open',
        });
      }
      setGaps(found);
    } catch (err) {
      console.warn('[SdohGapPanel] Failed to load SDOH Conditions:', err);
    } finally {
      setLoading(false);
    }
  }, [patientFhirId]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  // ── Step 2: Send to Unite Us — POST ServiceRequest + Task ──────────────────
  const sendToUniteUs = async (gap: ActiveSdohGap) => {
    setSending(gap.conditionId);
    try {
      const client = getFhirClient();
      const now = new Date().toISOString();

      // POST ServiceRequest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const srResult: any = await client.create({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'referral',
        priority: 'routine',
        category: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '306206005',
                display: 'Referral to service',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: gap.domain.serviceRequestSnomed,
              display: gap.domain.serviceRequestDisplay,
            },
          ],
          text: gap.domain.serviceRequestDisplay,
        },
        subject: { reference: `Patient/${patientFhirId}` },
        requester: {
          reference: `Practitioner/${practitionerFhirId}`,
          display: practitionerDisplay,
        },
        performer: [{ display: gap.domain.cboName }],
        reasonCode: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: gap.domain.zCode,
                display: gap.domain.zDisplay,
              },
            ],
          },
        ],
        reasonReference: [{ reference: `Condition/${gap.conditionId}` }],
        authoredOn: now,
        note: [
          {
            text: `SDOH referral — ${gap.domain.label}. Sent to Unite Us / ${gap.domain.cboName} by ${practitionerDisplay} on ${now.slice(0, 10)}.`,
          },
        ],
        extension: [
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: gap.domain.id,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/crn-platform',
            valueString: 'Unite Us',
          },
        ],
      } as Record<string, unknown>);

      const srId: string = srResult?.id ?? `sr-${gap.domain.id}-${Date.now()}`;

      // POST Task
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskResult: any = await client.create({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: 'routine',
        description: `${gap.domain.label} referral — ${gap.domain.cboName}`,
        focus: { reference: `ServiceRequest/${srId}` },
        for: { reference: `Patient/${patientFhirId}` },
        requester: {
          reference: `Practitioner/${practitionerFhirId}`,
          display: practitionerDisplay,
        },
        owner: { display: 'Unite Us CRN' },
        authoredOn: now,
        lastModified: now,
        note: [
          {
            text: `Task sent to Unite Us for ${gap.domain.label} intervention. CBO: ${gap.domain.cboName}.`,
          },
        ],
        extension: [
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: gap.domain.id,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/crn-platform',
            valueString: 'Unite Us',
          },
        ],
      } as Record<string, unknown>);

      const taskId: string = taskResult?.id ?? `task-${gap.domain.id}-${Date.now()}`;

      // PUT Condition — update sdoh-status extension to 'sent'
      await client.update({
        resourceType: 'Condition',
        id: gap.conditionId,
        clinicalStatus: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: gap.domain.zCode,
              display: gap.domain.zDisplay,
            },
          ],
          text: gap.domain.zDisplay,
        },
        subject: { reference: `Patient/${patientFhirId}` },
        onsetDateTime: gap.onsetDate,
        extension: [
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: gap.domain.id,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-status',
            valueString: 'sent',
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/unite-us-service-request',
            valueString: srId,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/unite-us-task',
            valueString: taskId,
          },
        ],
      });

      setGaps((prev) =>
        prev.map((g) =>
          g.conditionId === gap.conditionId
            ? { ...g, status: 'sent', serviceRequestId: srId, taskId }
            : g
        )
      );

      onAuditEntry?.('SDOH referral sent to Unite Us', {
        domain: gap.domain.label,
        zCode: gap.domain.zCode,
        serviceRequestId: srId,
        taskId,
        cbo: gap.domain.cboName,
      });

      toast.success(`${gap.domain.label} referral sent to Unite Us`, {
        description: `ServiceRequest/${srId} · Task/${taskId} · CBO: ${gap.domain.cboName}`,
      });
    } catch (err) {
      toast.error(`Failed to send ${gap.domain.label} referral`, { description: String(err) });
    } finally {
      setSending(null);
    }
  };

  // ── Step 3: Simulate Unite Us Resolution ──────────────────────────────────
  const simulateUniteUsResolution = async (gap: ActiveSdohGap) => {
    setSimulating(gap.conditionId);
    const uniteUsRef = `UU-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${gap.domain.id.slice(0, 3).toUpperCase()}`;
    try {
      const client = getFhirClient();
      const now = new Date().toISOString();

      // 1. POST Procedure — proof of service delivery (SNOMED intervention code)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procResult: any = await client.create({
        resourceType: 'Procedure',
        status: 'completed',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: gap.domain.procedureSnomed,
              display: gap.domain.procedureDisplay,
            },
          ],
          text: gap.domain.procedureDisplay,
        },
        subject: { reference: `Patient/${patientFhirId}` },
        performedDateTime: now,
        performer: [{ actor: { display: gap.domain.cboName } }],
        reasonCode: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: gap.domain.zCode,
                display: gap.domain.zDisplay,
              },
            ],
          },
        ],
        ...(gap.serviceRequestId
          ? { basedOn: [{ reference: `ServiceRequest/${gap.serviceRequestId}` }] }
          : {}),
        note: [
          {
            text: `Service delivered. ${gap.domain.label} intervention completed by ${gap.domain.cboName}. Unite Us ref: ${uniteUsRef}. Simulated callback on ${now.slice(0, 10)}.`,
          },
        ],
        extension: [
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/unite-us-ref',
            valueString: uniteUsRef,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: gap.domain.id,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/crn-platform',
            valueString: 'Unite Us (simulated)',
          },
        ],
      } as Record<string, unknown>);

      const procId: string = procResult?.id ?? `proc-${gap.domain.id}-${Date.now()}`;

      // 2. PUT Task → completed
      if (gap.taskId) {
        await client.update({
          resourceType: 'Task',
          id: gap.taskId,
          status: 'completed',
          intent: 'order',
          lastModified: now,
          output: [
            {
              type: { text: 'Procedure Evidence' },
              valueReference: { reference: `Procedure/${procId}` },
            },
          ],
          note: [
            {
              text: `Task completed by ${gap.domain.cboName} via Unite Us. Unite Us ref: ${uniteUsRef}. Procedure: ${procId}.`,
            },
          ],
        });
      }

      // 3. PUT ServiceRequest → completed
      if (gap.serviceRequestId) {
        await client.update({
          resourceType: 'ServiceRequest',
          id: gap.serviceRequestId,
          status: 'completed',
          intent: 'referral',
          priority: 'routine',
          code: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: gap.domain.serviceRequestSnomed,
                display: gap.domain.serviceRequestDisplay,
              },
            ],
            text: gap.domain.serviceRequestDisplay,
          },
          subject: { reference: `Patient/${patientFhirId}` },
          requester: {
            reference: `Practitioner/${practitionerFhirId}`,
            display: practitionerDisplay,
          },
          performer: [{ display: gap.domain.cboName }],
          authoredOn: gap.onsetDate,
          note: [
            { text: `Completed by Unite Us callback. Procedure: ${procId}. Ref: ${uniteUsRef}.` },
          ],
        });
      }

      // 4. PUT Condition → resolved (Z-code moves from active → resolved)
      await client.update({
        resourceType: 'Condition',
        id: gap.conditionId,
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'resolved',
              display: 'Resolved',
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: gap.domain.zCode,
              display: gap.domain.zDisplay,
            },
          ],
          text: gap.domain.zDisplay,
        },
        subject: { reference: `Patient/${patientFhirId}` },
        onsetDateTime: gap.onsetDate,
        abatementDateTime: now,
        extension: [
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-domain',
            valueString: gap.domain.id,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/sdoh-status',
            valueString: 'resolved',
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/unite-us-ref',
            valueString: uniteUsRef,
          },
          {
            url: 'http://tcoc.example.org/fhir/StructureDefinition/procedure-evidence',
            valueString: procId,
          },
        ],
      });

      // 5. POST MeasureReport — DEQM SNS-E numerator hit
      await client.create({
        resourceType: 'MeasureReport',
        status: 'complete',
        type: 'individual',
        measure: 'http://hl7.org/fhir/us/hedis/Measure/SNS-E',
        subject: { reference: `Patient/${patientFhirId}` },
        date: now,
        reporter: { display: 'TCOC Platform — DEQM Auto-Generated' },
        period: { start: gap.onsetDate, end: now.slice(0, 10) },
        group: [
          {
            code: { coding: [{ code: gap.domain.hedisNumerator }] },
            population: [
              {
                code: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/measure-population',
                      code: 'initial-population',
                    },
                  ],
                },
                count: 1,
              },
              {
                code: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/measure-population',
                      code: 'denominator',
                    },
                  ],
                },
                count: 1,
              },
              {
                code: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/measure-population',
                      code: 'numerator',
                    },
                  ],
                },
                count: 1,
              },
            ],
            measureScore: { value: 1 },
          },
        ],
        evaluatedResource: [
          { reference: `Condition/${gap.conditionId}` },
          { reference: `Procedure/${procId}` },
          ...(gap.serviceRequestId
            ? [{ reference: `ServiceRequest/${gap.serviceRequestId}` }]
            : []),
        ],
      } as Record<string, unknown>);

      setGaps((prev) =>
        prev.map((g) =>
          g.conditionId === gap.conditionId ? { ...g, status: 'resolved', procedureId: procId } : g
        )
      );

      onAuditEntry?.('SDOH gap closed via Unite Us simulation', {
        domain: gap.domain.label,
        zCode: gap.domain.zCode,
        procedureId: procId,
        uniteUsRef,
        snomedCode: gap.domain.procedureSnomed,
        hedisNumerator: gap.domain.hedisNumerator,
      });

      toast.success(`✓ ${gap.domain.label} gap closed`, {
        description: `Procedure/${procId} · Z-code resolved · MeasureReport posted · Unite Us ref: ${uniteUsRef}`,
      });
    } catch (err) {
      toast.error(`Simulation failed for ${gap.domain.label}`, { description: String(err) });
    } finally {
      setSimulating(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (getFhirMockMode()) {
    return (
      <div className="bg-[#fff8e1] border border-[#f1c21b] px-4 py-3 flex items-center gap-2 text-xs text-[#8a3800]">
        <Icon name="ExclamationTriangleIcon" size={14} />
        Switch to <strong>Live FHIR</strong> mode to see SDOH gap closure pipeline
      </div>
    );
  }

  return (
    <div className="bg-white border border-carbon-gray-20">
      {/* Header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 bg-[#f6f2ff] flex items-center gap-3">
        <Icon name="ShieldCheckIcon" size={16} className="text-[#6929c4]" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#6929c4]">
            SDOH Gap Closure — Gravity Project / Unite Us
          </p>
          <p className="text-2xs text-carbon-gray-50">
            Active Z-code Conditions from FHIR problem list · Food · Housing · Transportation
          </p>
        </div>
        <button
          onClick={loadGaps}
          disabled={loading}
          className="text-2xs text-[#6929c4] hover:underline disabled:opacity-40"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Body */}
      <div className="divide-y divide-carbon-gray-10">
        {loading && (
          <div className="px-5 py-6 text-xs text-carbon-gray-50 text-center animate-pulse">
            Reading SDOH Conditions from FHIR…
          </div>
        )}

        {!loading && gaps.length === 0 && (
          <div className="px-5 py-6 text-center space-y-2">
            <p className="text-xs text-carbon-gray-50">
              No active SDOH Z-code Conditions found for this patient.
            </p>
            <p className="text-2xs text-carbon-gray-30">
              Submit a PRAPARE screening on Screen 18 to generate Food / Housing / Transportation
              Z-codes.
            </p>
          </div>
        )}

        {gaps.map((gap) => {
          const isSending = sending === gap.conditionId;
          const isSimulating = simulating === gap.conditionId;

          return (
            <div key={gap.conditionId} className={`px-5 py-4 ${gap.domain.bg}`}>
              {/* Domain header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{gap.domain.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${gap.domain.color}`}>
                        {gap.domain.label}
                      </span>
                      <span className="font-mono text-2xs bg-white/70 px-1.5 py-0.5 border border-carbon-gray-20 text-carbon-gray-70">
                        {gap.domain.zCode}
                      </span>
                      <span className="text-2xs text-carbon-gray-50">Onset {gap.onsetDate}</span>
                    </div>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5">
                      LOINC <span className="font-mono">{gap.domain.loincCode}</span> · HEDIS{' '}
                      {gap.domain.hedisNumerator}
                    </p>
                  </div>
                </div>

                {/* Status badge */}
                {gap.status === 'resolved' ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-2xs font-bold bg-[#defbe6] text-[#198038] border border-[#a7f0ba]">
                    <Icon name="CheckCircleIcon" size={12} /> Resolved — Gap Closed
                  </span>
                ) : gap.status === 'sent' ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-2xs font-bold bg-[#fdf6dd] text-[#8a3800] border border-[#f1c21b]">
                    <Icon name="ClockIcon" size={12} /> Sent to Unite Us — Awaiting
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-2xs font-bold bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]">
                    <Icon name="ExclamationTriangleIcon" size={12} /> Open — Action Required
                  </span>
                )}
              </div>

              {/* CBO + SNOMED info */}
              <div className="mt-2 flex items-center gap-3 text-2xs text-carbon-gray-50 flex-wrap">
                <span>
                  CBO: <span className="font-medium text-carbon-gray-70">{gap.domain.cboName}</span>
                </span>
                <span>
                  Intervention: <span className="font-mono">{gap.domain.serviceRequestSnomed}</span>{' '}
                  {gap.domain.serviceRequestDisplay}
                </span>
              </div>

              {/* Resolved evidence */}
              {gap.status === 'resolved' && gap.procedureId && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#defbe6] border border-[#a7f0ba] text-xs text-[#0e6027]">
                  <Icon name="CheckCircleIcon" size={13} />
                  <span>
                    Procedure <span className="font-mono">{gap.procedureId}</span> · SNOMED{' '}
                    <span className="font-mono">{gap.domain.procedureSnomed}</span> · MeasureReport
                    posted · Z-code resolved
                  </span>
                </div>
              )}

              {/* Action buttons */}
              {gap.status !== 'resolved' && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {/* Step 2: Send to Unite Us */}
                  {gap.status === 'open' && (
                    <button
                      onClick={() => sendToUniteUs(gap)}
                      disabled={isSending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors disabled:opacity-50"
                    >
                      <Icon name="PaperAirplaneIcon" size={13} />
                      {isSending ? 'Sending…' : 'Send to Unite Us →'}
                    </button>
                  )}

                  {/* Step 3: Simulate Unite Us Resolution */}
                  {gap.status === 'sent' && (
                    <button
                      onClick={() => simulateUniteUsResolution(gap)}
                      disabled={isSimulating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#6929c4] text-white hover:bg-[#4f1f9a] transition-colors disabled:opacity-50"
                    >
                      <Icon name="SparklesIcon" size={13} />
                      {isSimulating ? 'Simulating…' : 'Simulate Unite Us Resolution'}
                    </button>
                  )}

                  {gap.serviceRequestId && (
                    <span className="text-2xs font-mono text-carbon-gray-50">
                      SR/{gap.serviceRequestId}
                    </span>
                  )}
                  {gap.taskId && (
                    <span className="text-2xs font-mono text-carbon-gray-50">
                      Task/{gap.taskId}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {gaps.length > 0 && (
        <div className="px-5 py-2.5 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center gap-4 text-2xs text-carbon-gray-50 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#da1e28] inline-block" /> Open:{' '}
            {gaps.filter((g) => g.status === 'open').length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#f1c21b] inline-block" /> Sent:{' '}
            {gaps.filter((g) => g.status === 'sent').length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#24a148] inline-block" /> Resolved:{' '}
            {gaps.filter((g) => g.status === 'resolved').length}
          </span>
          <span className="ml-auto">Gravity Project · Da Vinci DEQM · HEDIS SNS-E</span>
        </div>
      )}
    </div>
  );
}
