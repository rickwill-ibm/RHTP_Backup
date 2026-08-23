'use client';
import React, { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import { useRouter } from 'next/navigation';
import { getVisiblePatients, getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';
import { computeCaseloads } from '@/lib/careTeam/assignments';
import { CARE_TEAM_MEMBERS, cohortOwnerPool, getMember } from '@/lib/careTeam/members';

const RISK_STYLE: Record<string, string> = {
  Critical: 'bg-[#fff1f1] text-[#da1e28]',
  High: 'bg-[#fdf6dd] text-[#b45309]',
  Moderate: 'bg-[#d0e2ff] text-[#0043ce]',
  Low: 'bg-[#defbe6] text-[#0e6027]',
};

const CONF_STYLE: Record<string, string> = {
  High: 'bg-[#defbe6] text-[#0e6027]',
  Medium: 'bg-[#d0e2ff] text-[#0043ce]',
  Low: 'bg-carbon-gray-10 text-carbon-gray-70',
};

export default function CaseloadDashboard() {
  const { cohorts, assignments, reassignPatient, auditLog, activeCohortId, setActiveCohortId, activePatientId, setActivePatientId } =
    useAppContext();
  const router = useRouter();
  const registryCitizens = getVisiblePatients(getFhirMockMode());
  const featured = getPatientById(activePatientId);

  const [editing, setEditing] = useState<string | null>(null);
  const [draftMember, setDraftMember] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const caseloads = useMemo(
    () => computeCaseloads(assignments).filter((c) => c.member.function === 'CaseManager' || c.member.function === 'CHW'),
    [assignments]
  );

  // patientId -> {name, riskTier} from all cohorts
  const patientMeta = useMemo(() => {
    const map: Record<string, { name: string; riskTier: string; synthetic?: boolean }> = {};
    for (const c of cohorts) for (const p of c.patients) map[p.platformId] = { name: p.name, riskTier: p.riskTier, synthetic: p.synthetic };
    return map;
  }, [cohorts]);

  const totalUnique = Object.keys(assignments).length;
  const gapMemberships = cohorts.reduce((sum, c) => sum + c.patientIds.length, 0);
  const overCap = caseloads.filter((c) => c.overCapacity).length;

  const activeCohort = cohorts.find((c) => c.id === activeCohortId) ?? cohorts[0];

  if (cohorts.length === 0) {
    return (
      <div className="bg-white border border-carbon-gray-20 px-6 py-16 text-center">
        <Icon name="UserGroupIcon" size={32} className="text-carbon-gray-30 mx-auto mb-3" />
        <p className="text-sm font-semibold text-carbon-gray-100">No cohorts attributed yet</p>
        <p className="text-xs text-carbon-gray-50 mt-1 mb-4">
          Create a measure cohort to auto-assign patients across the care team.
        </p>
        <Link
          href="/stars-hedis-mips"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0043ce] text-white text-xs font-semibold hover:bg-[#002d9c]"
        >
          <Icon name="SparklesIcon" size={12} />
          Go to Quality &amp; Compliance
        </Link>
      </div>
    );
  }

  const startEdit = (patientId: string, currentMember: string) => {
    setEditing(patientId);
    setDraftMember(currentMember);
    setDraftReason('');
  };

  const writeCareTeamToFhir = useCallback(async (patientId: string, newMemberId: string) => {
    if (getFhirMockMode()) return;
    const fhirPatientId = PLATFORM_TO_FHIR_ID_MAP[patientId];
    if (!fhirPatientId) return;
    const newMember = getMember(newMemberId);
    const careTeamId = `${fhirPatientId}-careteam`;
    try {
      const client = getFhirClient();
      // Read existing CareTeam first so we don't lose other participants
      const existing = await client.read<Record<string, unknown>>('CareTeam', careTeamId).catch(() => null);
      const BASE_EXT = 'http://tcoc.example.org/fhir/StructureDefinition';
      const careManagerParticipant = {
        role: [{ coding: [{ system: 'http://snomed.info/sct', code: '768820003', display: 'Care Coordinator' }] }],
        member: { display: newMember?.name ?? newMemberId },
        extension: [{ url: `${BASE_EXT}/careteam-role`, valueString: 'CareManager' }],
      };
      const participants = existing
        ? [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...((existing.participant as any[]) ?? []).filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (p: any) => !p.extension?.some((e: any) => e.valueString === 'CareManager'),
            ),
            careManagerParticipant,
          ]
        : [careManagerParticipant];
      await client.update({
        ...(existing ?? {}),
        resourceType: 'CareTeam',
        id: careTeamId,
        status: 'active',
        participant: participants,
        subject: { reference: `Patient/${fhirPatientId}` },
      } as Record<string, unknown> & { id: string });

      // POST a routing Task for the new care manager so they see this patient in their queue
      client.create({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: 'routine',
        for: { reference: `Patient/${fhirPatientId}` },
        owner: { display: newMember?.name ?? newMemberId },
        requester: { display: 'Care Manager Portal — Caseload Dashboard' },
        description: `Care gap ownership transferred to ${newMember?.name ?? newMemberId}`,
        authoredOn: new Date().toISOString(),
        extension: [
          { url: `${BASE_EXT}/care-gap-domain`, valueString: 'Clinical' },
          { url: `${BASE_EXT}/assignment-reason`, valueString: 'Care manager reassignment via Caseload Dashboard' },
        ],
      }).catch((err) => console.warn('[CaseloadDashboard] Task POST failed (non-fatal):', err));

      // AuditEvent: care team reassignment
      client.create({
        resourceType: 'AuditEvent',
        type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'RESTful Operation' },
        subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'update', display: 'update' }],
        action: 'U',
        recorded: new Date().toISOString(),
        outcome: '0',
        agent: [{ who: { display: newMember?.name ?? newMemberId }, requestor: true }],
        source: { observer: { display: 'TCOC Platform — Care Manager Workspace' } },
        entity: [
          { what: { reference: `CareTeam/${careTeamId}` }, description: `Care manager reassigned to ${newMember?.name ?? newMemberId}` },
          { what: { reference: `Patient/${fhirPatientId}` }, description: `Patient: ${fhirPatientId}` },
        ],
      }).catch(() => { /* non-fatal */ });

    } catch (err) {
      console.warn('[CaseloadDashboard] FHIR CareTeam update failed (local state updated):', err);
    }
  }, []);

  const commitEdit = (patientId: string, fromMemberId: string) => {
    if (!draftMember || draftMember === fromMemberId) {
      if (!draftReason.trim()) {
        toast.error('Pick a different case manager or add a reason');
        return;
      }
    }
    reassignPatient(patientId, draftMember, draftReason.trim() || 'Manual reassignment', fromMemberId);
    // Fire-and-forget FHIR write
    writeCareTeamToFhir(patientId, draftMember);
    toast.success(`Reassigned to ${getMember(draftMember)?.name ?? draftMember}`, {
      description: 'Reason logged to audit trail · FHIR CareTeam updated',
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {/* Featured / active demo citizen — works for any registry citizen */}
      <div className="bg-[#001141] border border-[#003a75] px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-2xs font-semibold text-[#78a9ff] uppercase tracking-widest">Demo Citizen</span>
        <select
          value={activePatientId}
          onChange={(e) => setActivePatientId(e.target.value)}
          className="bg-[#0a2a5e] text-white text-xs font-semibold border border-[#003a75] px-2 py-1 focus:outline-none"
        >
          {registryCitizens.map((c) => (
            <option key={c.platformId} value={c.platformId}>{c.name}</option>
          ))}
        </select>
        {featured && (
          <>
            <span className="text-2xs font-mono text-[#a8c8e8]">{featured.ehrMrn}</span>
            <span className="text-2xs text-[#a8c8e8]">{featured.age}y {featured.gender}</span>
            <span className="text-2xs font-semibold px-2 py-0.5 bg-[#0a2a5e] text-[#78a9ff] border border-[#003a75]">
              {featured.episodeType} · {featured.riskTier}
            </span>
            <span className="text-2xs text-[#a8c8e8]">{featured.openCareGaps} open gaps</span>
            <button
              onClick={() => router.push('/patient-detail')}
              className="ml-auto flex items-center gap-1 text-2xs font-semibold text-white bg-[#0043ce] px-3 py-1 hover:bg-[#002d9c]"
            >
              Open record →
            </button>
          </>
        )}
      </div>

      {/* Dashboard KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Attributed Citizens', value: totalUnique, sub: 'unique citizens', icon: 'UserGroupIcon', color: 'text-[#0043ce]', bg: 'bg-[#d0e2ff]' },
          { label: 'Open Gap Memberships', value: gapMemberships, sub: 'across all cohorts', icon: 'RectangleStackIcon', color: 'text-[#6929c4]', bg: 'bg-[#f6f2ff]' },
          { label: 'Active Cohorts', value: cohorts.length, sub: 'measures worked', icon: 'Squares2X2Icon', color: 'text-[#007d79]', bg: 'bg-[#d9fbfb]' },
          { label: 'Over Capacity', value: overCap, sub: 'case managers', icon: 'ExclamationTriangleIcon', color: overCap > 0 ? 'text-[#da1e28]' : 'text-[#0e6027]', bg: overCap > 0 ? 'bg-[#fff1f1]' : 'bg-[#defbe6]' },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-carbon-gray-20 px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center flex-shrink-0 ${k.bg}`}>
              <Icon name={k.icon as any} size={18} className={k.color} />
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{k.label}</p>
              <p className={`text-2xl font-bold font-mono ${k.color}`}>{k.value}</p>
              <p className="text-2xs text-carbon-gray-30">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Member workload cards */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-4 py-3 border-b border-carbon-gray-20">
          <p className="text-sm font-semibold text-carbon-gray-100">Case Manager Workload</p>
          <p className="text-2xs text-carbon-gray-50">Click a case manager to see their attributed citizens · unique citizens counted once</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-carbon-gray-20">
          {caseloads.map((c) => (
            <button
              key={c.member.id}
              onClick={() => setSelectedMemberId((cur) => (cur === c.member.id ? null : c.member.id))}
              className={`text-left bg-white px-4 py-3 transition-colors hover:bg-carbon-gray-10 ${selectedMemberId === c.member.id ? 'ring-1 ring-inset ring-[#0043ce] bg-[#edf5ff]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-carbon-gray-100">{c.member.name}</p>
                  <p className="text-2xs text-carbon-gray-50">
                    {c.member.credential} · {c.member.specialties.join(', ')}
                  </p>
                </div>
                <span className={`text-2xs font-bold px-2 py-0.5 ${c.overCapacity ? 'bg-[#fff1f1] text-[#da1e28]' : 'bg-[#defbe6] text-[#0e6027]'}`}>
                  {c.utilizationPct}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-carbon-gray-10">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(c.utilizationPct, 100)}%`,
                    backgroundColor: c.overCapacity ? '#da1e28' : c.utilizationPct > 85 ? '#b45309' : '#0043ce',
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-2xs text-carbon-gray-50">
                <span>+{c.uniquePatients} attributed</span>
                <span>{c.totalWithBase}/{c.member.maxCaseload}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Selected case manager → attributed citizens */}
        {selectedMemberId && (() => {
          const member = getMember(selectedMemberId);
          const theirs = Object.values(assignments).filter((a) => a.memberId === selectedMemberId);
          return (
            <div className="border-t border-carbon-gray-20 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-carbon-gray-100">
                  {member?.name} — {theirs.length} attributed citizen{theirs.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => setSelectedMemberId(null)} className="text-2xs text-carbon-gray-50 hover:text-carbon-gray-100 flex items-center gap-1">
                  <Icon name="XMarkIcon" size={11} /> Close
                </button>
              </div>
              {theirs.length === 0 ? (
                <p className="text-2xs text-carbon-gray-50">No attributed citizens yet — create a cohort to auto-assign.</p>
              ) : (
                <div className="divide-y divide-carbon-gray-20">
                  {theirs.slice(0, 50).map((a) => {
                    const meta = patientMeta[a.patientId];
                    return (
                      <div key={a.patientId} className="py-1.5 flex items-center gap-2">
                        <span className={`text-2xs font-semibold px-1.5 py-0.5 ${RISK_STYLE[meta?.riskTier ?? 'Moderate']}`}>{meta?.riskTier ?? '—'}</span>
                        <span className="text-xs text-carbon-gray-100">{meta?.name ?? a.patientId}</span>
                        {meta?.synthetic && <span className="text-2xs text-carbon-gray-30">synthetic</span>}
                        <span className="ml-auto text-2xs text-carbon-gray-50 truncate max-w-[50%]">{a.rationale}</span>
                      </div>
                    );
                  })}
                  {theirs.length > 50 && <p className="py-1 text-2xs text-carbon-gray-50">Showing first 50 of {theirs.length}.</p>}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Cohort cards */}
      <div className="bg-white border border-carbon-gray-20">
        <div className="px-4 py-3 border-b border-carbon-gray-20">
          <p className="text-sm font-semibold text-carbon-gray-100">Measure Cohorts</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-carbon-gray-20">
          {cohorts.map((c) => {
            const active = c.id === (activeCohort?.id ?? '');
            return (
              <button
                key={c.id}
                onClick={() => setActiveCohortId(c.id)}
                className={`text-left px-4 py-3 transition-colors ${active ? 'bg-[#edf5ff]' : 'bg-white hover:bg-carbon-gray-10'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#0043ce]">{c.measureKey}</span>
                  <span className="text-2xs px-1.5 py-0.5 bg-carbon-gray-10 text-carbon-gray-70">{c.specialty}</span>
                </div>
                <p className="text-xs text-carbon-gray-100 mt-1 leading-tight">{c.measureName}</p>
                <p className="text-2xs text-carbon-gray-50 mt-1">{c.contractName}</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="font-mono text-lg font-bold text-carbon-gray-100">{c.patientIds.length}</span>
                  <span className="text-2xs text-carbon-gray-50">
                    in cohort{c.denominator > c.patientIds.length ? ` · ${c.denominator.toLocaleString()} denom` : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active cohort patient list */}
      {activeCohort && (
        <div className="bg-white border border-carbon-gray-20 overflow-x-auto">
          <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
            <p className="text-sm font-semibold text-carbon-gray-100">
              {activeCohort.measureName} — {activeCohort.patientIds.length} citizens
            </p>
            <span className="text-2xs text-carbon-gray-50">Assignment + rationale · Accept / Override</span>
          </div>
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {['Citizen', 'Risk', 'Assigned Case Manager', 'Confidence', 'Rationale', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {activeCohort.patientIds.slice(0, 50).map((pid) => {
                const a = assignments[pid];
                const meta = patientMeta[pid];
                if (!a || !meta) return null;
                const isEditing = editing === pid;
                return (
                  <tr key={pid} className="hover:bg-carbon-gray-10">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-carbon-gray-100">{meta.name}</span>
                      {meta.synthetic && <span className="ml-1.5 text-2xs text-carbon-gray-30">synthetic</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-2xs font-semibold px-2 py-0.5 ${RISK_STYLE[meta.riskTier]}`}>{meta.riskTier}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <select
                          value={draftMember}
                          onChange={(e) => setDraftMember(e.target.value)}
                          className="border border-carbon-gray-30 text-xs px-2 py-1 focus:outline-none focus:border-[#0043ce]"
                        >
                          {cohortOwnerPool().map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-carbon-gray-100">
                          {getMember(a.memberId)?.name ?? a.memberId}
                          {a.source === 'manual' && <span className="ml-1.5 text-2xs text-[#6929c4] font-semibold">(override)</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.source === 'manual' ? (
                        <span className="text-2xs text-carbon-gray-50">manual</span>
                      ) : (
                        <span className={`text-2xs font-semibold px-2 py-0.5 ${CONF_STYLE[(activeCohort.assignments[pid]?.confidence) ?? 'Low']}`}>
                          {activeCohort.assignments[pid]?.confidence ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-md">
                      {isEditing ? (
                        <input
                          value={draftReason}
                          onChange={(e) => setDraftReason(e.target.value)}
                          className="w-full border border-carbon-gray-30 text-xs px-2 py-1 focus:outline-none focus:border-[#0043ce]"
                        />
                      ) : (
                        <span className="text-2xs text-carbon-gray-50">{a.rationale}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => commitEdit(pid, a.memberId)} className="px-2 py-1 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c]">Save</button>
                          <button onClick={() => setEditing(null)} className="px-2 py-1 border border-carbon-gray-20 text-carbon-gray-70 text-2xs hover:bg-carbon-gray-10">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(pid, a.memberId)} className="flex items-center gap-1 px-2 py-1 border border-carbon-gray-20 text-carbon-gray-70 text-2xs font-semibold hover:bg-carbon-gray-10">
                          <Icon name="ArrowsRightLeftIcon" size={11} />
                          Reassign
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {activeCohort.patientIds.length > 50 && (
            <p className="px-4 py-2 text-2xs text-carbon-gray-50 border-t border-carbon-gray-20">
              Showing first 50 of {activeCohort.patientIds.length}.
            </p>
          )}
        </div>
      )}

      {/* Audit trail */}
      {auditLog.length > 0 && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-4 py-3 border-b border-carbon-gray-20">
            <p className="text-sm font-semibold text-carbon-gray-100">Reassignment Audit Trail</p>
          </div>
          <div className="divide-y divide-carbon-gray-20">
            {auditLog.slice(0, 8).map((e) => (
              <div key={e.id} className="px-4 py-2 text-2xs text-carbon-gray-70 flex items-center gap-2">
                <Icon name="ClockIcon" size={11} className="text-carbon-gray-30" />
                <span className="font-medium">{patientMeta[e.patientId]?.name ?? e.patientId}</span>
                <span className="text-carbon-gray-50">&rarr; {getMember(e.toMemberId)?.name ?? e.toMemberId}</span>
                <span className="text-carbon-gray-30">&middot;</span>
                <span className="italic text-carbon-gray-50">{e.reason}</span>
                <span className="ml-auto text-carbon-gray-30">{e.actor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
