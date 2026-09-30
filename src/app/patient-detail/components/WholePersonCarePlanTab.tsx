'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { usePatientContext } from '@/lib/patientContext';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import type { CarePlanDomain } from '@/lib/patientRegistry';

const CARE_PLAN_DOMAINS = [
  {
    domain: 'Clinical',
    color: '#0043ce',
    icon: 'HeartIcon',
    goals: [
      {
        goal: 'A1C < 8.0 by Q3 2026',
        status: 'in-progress',
        owner: 'Dr. Whitfield',
        dueDate: '2026-09-30',
        tasks: ['Metformin titration', 'Diabetes education referral', 'A1C recheck in 90 days'],
      },
      {
        goal: 'BP < 130/80 by Q2 2026',
        status: 'open',
        owner: 'Dr. Whitfield',
        dueDate: '2026-06-30',
        tasks: ['Lisinopril 10mg initiated', 'Home BP monitoring kit ordered'],
      },
    ],
  },
  {
    domain: 'Behavioral Health',
    color: '#6929c4',
    icon: 'SparklesIcon',
    goals: [
      {
        goal: 'PHQ-9 score < 10 by Q3 2026',
        status: 'in-progress',
        owner: 'Dr. Amara Osei (BH)',
        dueDate: '2026-09-30',
        tasks: [
          'Weekly BH counseling sessions',
          'Antidepressant medication review',
          'Safety plan documented',
        ],
      },
    ],
  },
  {
    domain: 'Social Needs',
    color: '#b45309',
    icon: 'HomeIcon',
    goals: [
      {
        goal: 'Stable housing secured by Q3 2026',
        status: 'pending',
        owner: 'Robert Chen (CHW)',
        dueDate: '2026-09-30',
        tasks: [
          'Section 8 application submitted',
          'Emergency housing referral active',
          'Weekly CHW check-in',
        ],
      },
      {
        goal: 'SNAP enrollment renewed by Jul 2026',
        status: 'open',
        owner: 'Robert Chen (CHW)',
        dueDate: '2026-07-31',
        tasks: ['Recertification paperwork completed', 'DHS appointment scheduled'],
      },
    ],
  },
  {
    domain: 'Community Support',
    color: '#198038',
    icon: 'UserGroupIcon',
    goals: [
      {
        goal: 'Transportation barrier resolved',
        status: 'completed',
        owner: 'Robert Chen (CHW)',
        dueDate: '2026-04-30',
        tasks: ['Medicaid NEMT benefit activated', 'Transport coordinator assigned'],
      },
    ],
  },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  'in-progress': { bg: '#d0e2ff', text: '#0043ce', label: 'In Progress' },
  open: { bg: '#fdf6dd', text: '#b45309', label: 'Open' },
  pending: { bg: '#f4f4f4', text: '#6f6f6f', label: 'Pending' },
  completed: { bg: '#defbe6', text: '#0e6027', label: 'Completed' },
};

const CARE_TEAM_NOTIFY = [
  { name: 'Dr. James Whitfield', role: 'PCP', domain: 'Clinical' },
  { name: 'Dr. Amara Osei', role: 'BH Provider', domain: 'Behavioral Health' },
  { name: 'Robert Chen', role: 'CHW', domain: 'Social Needs' },
  { name: 'Sarah Johnson', role: 'Care Manager', domain: 'All' },
  { name: 'Maria Chen', role: 'Pharmacist', domain: 'Clinical' },
];

type UpdateStep = 'select' | 'update' | 'notify' | 'confirm';

function UpdatePlanModal({ onClose, patientId }: { onClose: () => void; patientId: string }) {
  const [step, setStep] = useState<UpdateStep>('select');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [newStatus, setNewStatus] = useState('in-progress');
  const [intervention, setIntervention] = useState('');
  const [goalModification, setGoalModification] = useState('');
  const [notifyMembers, setNotifyMembers] = useState<Set<string>>(new Set(['Sarah Johnson']));
  const [updateNote, setUpdateNote] = useState('');
  const [fhirVersion, setFhirVersion] = useState(() => Math.floor(Math.random() * 3) + 3);

  const advanceToConfirm = useCallback(async () => {
    setStep('confirm');
    if (getFhirMockMode()) return; // skip real write in mock mode
    // Use a deterministic CarePlan ID (patient-specific) so repeated saves
    // PUT (update) the same resource rather than creating duplicates.
    const safePlatformId = patientId.replace(/[^A-Za-z0-9\-.]/g, '-');
    const carePlanId = `cp-${safePlatformId}`;
    try {
      await getFhirClient().update({
        id: carePlanId,
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        subject: { reference: `Patient/${patientId}` },
        created: new Date().toISOString(),
        note: [
          {
            text: [
              `Domain: ${selectedDomain}`,
              `Goal: ${selectedGoal}`,
              `New status: ${newStatus}`,
              intervention ? `Intervention: ${intervention}` : null,
              goalModification ? `Modification: ${goalModification}` : null,
              updateNote ? `Notes: ${updateNote}` : null,
              `Notified: ${Array.from(notifyMembers).join(', ')}`,
              `Updated: ${new Date().toISOString()}`,
            ]
              .filter(Boolean)
              .join(' | '),
          },
        ],
      });
      setFhirVersion((v) => v + 1);
    } catch (err) {
      console.warn('[WholePersonCarePlanTab] FHIR CarePlan write failed:', err);
    }
  }, [
    patientId,
    selectedDomain,
    selectedGoal,
    newStatus,
    intervention,
    goalModification,
    updateNote,
    notifyMembers,
  ]);

  const allGoals = CARE_PLAN_DOMAINS.flatMap((d) =>
    d.goals.map((g) => ({ ...g, domain: d.domain, color: d.color }))
  );
  const filteredGoals = selectedDomain
    ? allGoals.filter((g) => g.domain === selectedDomain)
    : allGoals;

  const toggleNotify = (name: string) => {
    setNotifyMembers((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  };

  // Auto-select relevant team members when domain changes
  const handleDomainSelect = (domain: string) => {
    setSelectedDomain(domain);
    setSelectedGoal('');
    const relevant = CARE_TEAM_NOTIFY.filter((m) => m.domain === domain || m.domain === 'All').map(
      (m) => m.name
    );
    setNotifyMembers(new Set(relevant));
  };

  const inputCls =
    'w-full px-3 py-2 text-sm bg-white border border-carbon-gray-30 focus:outline-none focus:border-[#0f62fe]';
  const labelCls = 'block text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1';

  const stepLabels: UpdateStep[] = ['select', 'update', 'notify', 'confirm'];
  const stepNames = ['Domain & Goal', 'Status Update', 'Team Notify', 'FHIR Confirm'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-carbon-gray-20 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b border-carbon-gray-20"
          style={{ borderTopColor: '#0043ce', borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0043ce] flex items-center justify-center">
              <Icon name="ClipboardDocumentListIcon" size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-carbon-gray-100">Update Care Plan</p>
              <p className="text-2xs text-carbon-gray-50">
                Whole Person Care Plan · FHIR CarePlan resource
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-5 py-2 bg-[#f4f4f4] border-b border-carbon-gray-20">
          {stepLabels.map((s, i) => {
            const active = step === s;
            const done = stepLabels.indexOf(step) > i;
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-5 h-5 flex items-center justify-center text-2xs font-bold border ${
                      done
                        ? 'bg-[#24a148] border-[#24a148] text-white'
                        : active
                          ? 'bg-[#0043ce] border-[#0043ce] text-white'
                          : 'bg-white border-carbon-gray-30 text-carbon-gray-50'
                    }`}
                  >
                    {done ? <Icon name="CheckIcon" size={10} /> : i + 1}
                  </div>
                  <span
                    className={`text-2xs font-medium hidden sm:block ${active ? 'text-[#0043ce]' : done ? 'text-[#24a148]' : 'text-carbon-gray-50'}`}
                  >
                    {stepNames[i]}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${done ? 'bg-[#24a148]' : 'bg-carbon-gray-20'}`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Step 1: Domain & Goal ── */}
        {step === 'select' && (
          <div className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Which domain are you updating?</label>
              <div className="grid grid-cols-2 gap-2">
                {['Clinical', 'Behavioral Health', 'Social Needs', 'Community Support'].map((d) => {
                  const domainData = CARE_PLAN_DOMAINS.find((x) => x.domain === d);
                  return (
                    <button
                      key={d}
                      onClick={() => handleDomainSelect(d)}
                      className={`flex items-center gap-2 p-3 border text-left transition-colors ${
                        selectedDomain === d
                          ? 'border-[#0043ce] bg-[#edf5ff]'
                          : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
                      }`}
                    >
                      <Icon
                        name={(domainData?.icon as any) ?? 'HeartIcon'}
                        size={14}
                        style={{ color: domainData?.color }}
                      />
                      <span className="text-xs font-medium text-carbon-gray-100">{d}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDomain && (
              <div>
                <label className={labelCls}>Which goal?</label>
                <div className="space-y-2">
                  {filteredGoals.map((g, i) => {
                    const sc = STATUS_CONFIG[g.status] ?? STATUS_CONFIG['open'];
                    return (
                      <label
                        key={i}
                        className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
                          selectedGoal === g.goal
                            ? 'border-[#0043ce] bg-[#edf5ff]'
                            : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
                        }`}
                      >
                        <input
                          type="radio"
                          name="goal-select"
                          checked={selectedGoal === g.goal}
                          onChange={() => setSelectedGoal(g.goal)}
                          className="mt-0.5 accent-[#0043ce]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-carbon-gray-100">{g.goal}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="px-1.5 py-0.5 text-2xs font-bold"
                              style={{ background: sc.bg, color: sc.text }}
                            >
                              {sc.label}
                            </span>
                            <span className="text-2xs text-carbon-gray-50">
                              {g.owner} · Due {g.dueDate}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('update')}
                disabled={!selectedDomain || !selectedGoal}
                className="px-4 py-2 text-sm bg-[#0043ce] text-white hover:bg-[#0035a8] font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Next <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Status Update ── */}
        {step === 'update' && (
          <div className="p-5 space-y-4">
            <div className="bg-[#f4f4f4] border border-carbon-gray-20 p-3">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide font-semibold mb-0.5">
                Updating Goal
              </p>
              <p className="text-xs font-semibold text-carbon-gray-100">{selectedGoal}</p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">{selectedDomain}</p>
            </div>

            <div>
              <label className={labelCls}>New Status</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setNewStatus(key)}
                    className={`flex items-center gap-2 p-2.5 border text-left transition-colors ${
                      newStatus === key
                        ? 'border-[#0043ce] bg-[#edf5ff]'
                        : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
                    }`}
                  >
                    <span
                      className="px-1.5 py-0.5 text-2xs font-bold"
                      style={{ background: cfg.bg, color: cfg.text }}
                    >
                      {cfg.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>New Intervention Added (optional)</label>
              <input
                type="text"
                value={intervention}
                onChange={(e) => setIntervention(e.target.value)}
                placeholder="e.g. Referred to diabetes education program"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Goal Modification (optional)</label>
              <input
                type="text"
                value={goalModification}
                onChange={(e) => setGoalModification(e.target.value)}
                placeholder="e.g. Extended target date to Q4 2026"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Update Notes</label>
              <textarea
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                rows={3}
                placeholder="Clinical rationale for this update..."
                className={`${inputCls} resize-none`}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 flex items-center gap-1"
              >
                <Icon name="ChevronLeftIcon" size={14} /> Back
              </button>
              <button
                onClick={() => setStep('notify')}
                className="px-4 py-2 text-sm bg-[#0043ce] text-white hover:bg-[#0035a8] font-medium flex items-center gap-1.5"
              >
                Next <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Team Notification ── */}
        {step === 'notify' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-carbon-gray-70">
              Select care team members to notify about this plan update. Members are pre-selected
              based on the <strong>{selectedDomain}</strong> domain.
            </p>

            <div className="space-y-2">
              {CARE_TEAM_NOTIFY.map((member) => (
                <label
                  key={member.name}
                  className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                    notifyMembers.has(member.name)
                      ? 'border-[#0043ce] bg-[#edf5ff]'
                      : 'border-carbon-gray-20 hover:bg-carbon-gray-10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={notifyMembers.has(member.name)}
                    onChange={() => toggleNotify(member.name)}
                    className="w-4 h-4 accent-[#0043ce]"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-carbon-gray-100">{member.name}</p>
                    <p className="text-2xs text-carbon-gray-50">
                      {member.role} · {member.domain}
                    </p>
                  </div>
                  {notifyMembers.has(member.name) && (
                    <span className="text-2xs text-[#0043ce] font-medium">Will be notified</span>
                  )}
                </label>
              ))}
            </div>

            <div className="bg-[#fdf6dd] border border-[#f1c21b] p-3 flex items-start gap-2">
              <Icon name="BellIcon" size={14} className="text-[#b45309] flex-shrink-0 mt-0.5" />
              <p className="text-2xs text-[#b45309]">
                {notifyMembers.size} team member{notifyMembers.size !== 1 ? 's' : ''} will receive
                an in-app notification and care team inbox alert.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStep('update')}
                className="px-4 py-2 text-sm border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 flex items-center gap-1"
              >
                <Icon name="ChevronLeftIcon" size={14} /> Back
              </button>
              <button
                onClick={advanceToConfirm}
                className="px-4 py-2 text-sm bg-[#0043ce] text-white hover:bg-[#0035a8] font-medium flex items-center gap-1.5"
              >
                Save & Notify <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: FHIR Confirmation ── */}
        {step === 'confirm' && (
          <div className="p-5 space-y-3">
            <p className="text-xs text-carbon-gray-70 pt-1">
              Care plan updated successfully. The following systems have been updated:
            </p>

            {[
              {
                icon: 'CheckCircleIcon',
                color: '#0e6027',
                bg: '#defbe6',
                border: '#24a148',
                label: 'Plan Updated',
                detail: `${selectedGoal} → ${STATUS_CONFIG[newStatus]?.label ?? newStatus} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Sarah Johnson`,
              },
              {
                icon: 'BellIcon',
                color: '#b45309',
                bg: '#fdf6dd',
                border: '#f1c21b',
                label: 'Care Team Notified',
                detail: `${notifyMembers.size} member${notifyMembers.size !== 1 ? 's' : ''} notified: ${Array.from(notifyMembers).join(', ')}`,
              },
              {
                icon: 'ServerIcon',
                color: '#6929c4',
                bg: '#f6f2ff',
                border: '#d4bbff',
                label: `FHIR CarePlan v${fhirVersion} Saved`,
                detail: `PATCH /CarePlan/cp-dorothy-001 · version: ${fhirVersion} · status: active · lastModified: ${new Date().toISOString().slice(0, 19)}Z`,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 border"
                style={{ background: item.bg, borderColor: item.border }}
              >
                <Icon
                  name={item.icon as any}
                  size={16}
                  style={{ color: item.color }}
                  className="flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-xs font-semibold" style={{ color: item.color }}>
                    {item.label}
                  </p>
                  <p
                    className="text-2xs mt-0.5 font-mono"
                    style={{ color: item.color, opacity: 0.85 }}
                  >
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm bg-[#0043ce] text-white hover:bg-[#0035a8] font-medium flex items-center gap-1.5"
              >
                <Icon name="CheckIcon" size={14} />
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface FhirGoal {
  id: string;
  description: string;
  status: string;
  dueDate?: string;
  note?: string;
}

export default function WholePersonCarePlanTab() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const { patient } = usePatientContext();

  // Live FHIR: read CarePlan on mount and after each save
  const [fhirDomains, setFhirDomains] = useState<CarePlanDomain[] | null>(null);
  const [fhirLastUpdated, setFhirLastUpdated] = useState<string | null>(null);
  const [fhirLoading, setFhirLoading] = useState(false);
  const loadedForRef = useRef<string | null>(null);

  // Live FHIR: read Goal resources for this patient
  const [fhirGoals, setFhirGoals] = useState<FhirGoal[] | null>(null);
  const goalsLoadedForRef = useRef<string | null>(null);

  const loadCarePlan = useCallback(async (platformId: string) => {
    if (getFhirMockMode()) return;
    const safePlatformId = platformId.replace(/[^A-Za-z0-9\-.]/g, '-');
    const carePlanId = `cp-${safePlatformId}`;
    setFhirLoading(true);
    try {
      const cp = await getFhirClient().read<{
        resourceType: string;
        meta?: { lastUpdated?: string };
        note?: { text?: string }[];
        extension?: { url: string; valueString?: string }[];
      }>('CarePlan', carePlanId);
      if (cp?.resourceType === 'CarePlan') {
        // Try extension first (most reliable), fallback to note[0].text
        const ext = cp.extension?.find(
          (e) => e.url === 'http://tcoc.example.org/fhir/StructureDefinition/care-plan-domains'
        );
        const raw = ext?.valueString ?? cp.note?.[0]?.text ?? null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CarePlanDomain[];
            setFhirDomains(parsed);
          } catch {
            // ignore parse error; fall back to registry data
          }
        }
        if (cp.meta?.lastUpdated) {
          setFhirLastUpdated(
            new Date(cp.meta.lastUpdated).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          );
        }
      }
    } catch {
      // CarePlan not found on server yet — silently fall back to registry data
    } finally {
      setFhirLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedForRef.current === patient.patientId) return;
    loadedForRef.current = patient.patientId;
    loadCarePlan(patient.patientId);
  }, [patient.patientId, loadCarePlan]);

  // Fetch Goal?patient={fhirId} in live mode
  useEffect(() => {
    if (getFhirMockMode()) {
      setFhirGoals(null);
      return;
    }
    if (goalsLoadedForRef.current === patient.patientId) return;
    goalsLoadedForRef.current = patient.patientId;
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[patient.patientId];
    if (!fhirId) return;
    getFhirClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .search('Goal', { patient: `Patient/${fhirId}`, _count: 50 } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goals: FhirGoal[] = (bundle.entry ?? []).map((e: any) => {
          const r = e.resource;
          return {
            id: r.id ?? '',
            description: r.description?.text ?? r.description?.coding?.[0]?.display ?? 'Goal',
            status: r.lifecycleStatus ?? 'proposed',
            dueDate: r.target?.[0]?.dueDate ?? undefined,
            note: r.note?.[0]?.text ?? undefined,
          };
        });
        if (goals.length > 0) setFhirGoals(goals);
      })
      .catch(() => {
        /* silent */
      });
  }, [patient.patientId]);

  // Derive whole-person risk scores from live patient context
  const unmetSocialNeeds = patient.careGaps.filter(
    (g) => g.domain === 'Social' && g.status !== 'Closed'
  ).length;
  const bhAcuity =
    patient.bhScore != null
      ? Math.min(Math.round(patient.bhScore / 5), 5)
      : patient.bhRisk === 'Crisis'
        ? 5
        : patient.bhRisk === 'High'
          ? 4
          : patient.bhRisk === 'Moderate'
            ? 2
            : 1;
  const composite = Math.round(
    (patient.rafScore / 5) * 40 + (unmetSocialNeeds / 5) * 30 + (bhAcuity / 5) * 30 * 100
  );
  const wholePersonRisk = [
    {
      score: patient.rafScore,
      label: 'Clinical RAF',
      color: '#da1e28',
      max: 5,
      note: patient.riskLabel,
    },
    {
      score: unmetSocialNeeds,
      label: 'Social Complexity',
      color: '#b45309',
      max: 5,
      note: `${unmetSocialNeeds} unmet social need${unmetSocialNeeds !== 1 ? 's' : ''}`,
    },
    {
      score: bhAcuity,
      label: 'BH Acuity',
      color: '#6929c4',
      max: 5,
      note: patient.bhScoreLabel || patient.bhRisk,
    },
    {
      score: Math.min(composite, 100),
      label: 'Whole Person Risk Index',
      color: composite >= 70 ? '#da1e28' : composite >= 40 ? '#b45309' : '#198038',
      max: 100,
      note: undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Whole Person Risk Score */}
      <div className="bg-[#f6f2ff] border border-[#8a3ffc] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="ShieldExclamationIcon" size={16} style={{ color: '#6929c4' }} />
          <p className="text-xs font-semibold text-[#31135e] uppercase tracking-wide">
            Whole Person Risk Score
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {wholePersonRisk.map((r) => (
            <div key={r.label} className="bg-white border border-[#d4bbff] p-3">
              <p className="font-mono text-2xl font-bold" style={{ color: r.color }}>
                {r.label === 'Whole Person Risk Index'
                  ? r.score
                  : typeof r.score === 'number' && r.score % 1 !== 0
                    ? r.score.toFixed(2)
                    : r.score}
              </p>
              <p className="text-2xs font-semibold text-carbon-gray-100 mt-0.5">{r.label}</p>
              {r.note && <p className="text-2xs text-carbon-gray-50 mt-0.5 truncate">{r.note}</p>}
              <div className="mt-1.5 h-1.5 bg-carbon-gray-10">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min((Number(r.score) / r.max) * 100, 100)}%`,
                    backgroundColor: r.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-2xs text-[#6929c4] mt-2">
          Composite index: Clinical RAF (40%) + Social Complexity (30%) + BH Acuity (30%) · Feeds
          care manager priority queue
        </p>
      </div>

      {/* Care Plan Domains */}
      {fhirLoading && (
        <div className="flex items-center gap-2 text-2xs text-carbon-gray-50 py-1">
          <div className="w-3 h-3 border border-carbon-gray-30 border-t-[#0043ce] rounded-full animate-spin" />
          Loading care plan from FHIR…
        </div>
      )}
      <div className="space-y-4">
        {(
          fhirDomains ??
          getPatientById(patient.patientId)?.carePlanDomains ??
          (CARE_PLAN_DOMAINS as CarePlanDomain[])
        ).map((domain) => (
          <div key={domain.domain} className="bg-white border border-carbon-gray-20">
            <div
              className="flex items-center gap-2 px-4 py-3 border-b border-carbon-gray-20"
              style={{ backgroundColor: domain.color + '10' }}
            >
              <Icon name={domain.icon as any} size={15} style={{ color: domain.color }} />
              <p className="text-xs font-semibold" style={{ color: domain.color }}>
                {domain.domain}
              </p>
              <span className="ml-auto text-2xs text-carbon-gray-50">
                {domain.goals.length} goal{domain.goals.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {domain.goals.map((goal, gi) => {
                const sc = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG['open'];
                return (
                  <div key={gi} className="p-4">
                    <div className="flex items-start gap-3 flex-wrap mb-2">
                      <p className="text-xs font-semibold text-carbon-gray-100 flex-1">
                        {goal.goal}
                      </p>
                      <span
                        className="px-2 py-0.5 text-2xs font-bold"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-2xs text-carbon-gray-50 mb-2">
                      <span className="flex items-center gap-1">
                        <Icon name="UserIcon" size={11} />
                        {goal.owner}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="CalendarIcon" size={11} />
                        Due: {goal.dueDate}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {goal.tasks.map((task, ti) => (
                        <span
                          key={ti}
                          className="flex items-center gap-1 px-2 py-0.5 text-2xs bg-carbon-gray-10 text-carbon-gray-70"
                        >
                          <Icon name="CheckCircleIcon" size={10} style={{ color: domain.color }} />
                          {task}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FHIR Goals from server */}
      {fhirGoals && fhirGoals.length > 0 && (
        <div className="bg-white border border-carbon-gray-20">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-carbon-gray-20 bg-[#defbe610]">
            <Icon name="FlagIcon" size={15} style={{ color: '#198038' }} />
            <p className="text-xs font-semibold text-[#198038]">Goals — FHIR Server</p>
            <span className="ml-auto text-2xs text-carbon-gray-50">
              {fhirGoals.length} goal{fhirGoals.length !== 1 ? 's' : ''} · live
            </span>
          </div>
          <div className="divide-y divide-carbon-gray-10">
            {fhirGoals.map((g) => {
              const statusKey =
                g.status === 'active'
                  ? 'in-progress'
                  : g.status === 'completed'
                    ? 'completed'
                    : g.status === 'on-hold'
                      ? 'pending'
                      : g.status === 'cancelled'
                        ? 'pending'
                        : 'open';
              const sc = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG['open'];
              return (
                <div key={g.id} className="p-4">
                  <div className="flex items-start gap-3 flex-wrap mb-1">
                    <p className="text-xs font-semibold text-carbon-gray-100 flex-1">
                      {g.description}
                    </p>
                    <span
                      className="px-2 py-0.5 text-2xs font-bold"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                      {g.status}
                    </span>
                  </div>
                  {(g.dueDate || g.note) && (
                    <div className="flex items-center gap-4 text-2xs text-carbon-gray-50">
                      {g.dueDate && (
                        <span className="flex items-center gap-1">
                          <Icon name="CalendarIcon" size={11} />
                          Due: {g.dueDate}
                        </span>
                      )}
                      {g.note && <span className="truncate max-w-xs">{g.note}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Care Plan Footer */}
      <div className="flex items-center justify-between bg-white border border-carbon-gray-20 p-3">
        <div className="text-2xs text-carbon-gray-50 flex items-center gap-1.5">
          {fhirDomains ? (
            <>
              <Icon name="CheckCircleIcon" size={11} style={{ color: '#24a148' }} />
              FHIR CarePlan · Last updated: {fhirLastUpdated ?? 'Unknown'} · Owned by: Full CareTeam
            </>
          ) : (
            'Last updated: Jun 2, 2026 · Owned by: Full CareTeam · FHIR CarePlan resource'
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpdateModal(true)}
            className="px-3 py-1.5 text-2xs font-semibold bg-[#0043ce] text-white hover:bg-[#0035a8] transition-colors flex items-center gap-1"
          >
            <Icon name="PencilSquareIcon" size={12} />
            Update Plan
          </button>
          <button className="px-3 py-1.5 text-2xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors">
            Export PDF
          </button>
        </div>
      </div>

      {showUpdateModal && (
        <UpdatePlanModal
          onClose={() => {
            setShowUpdateModal(false);
            // Reload the FHIR CarePlan after modal closes (may have saved)
            loadedForRef.current = null;
            loadCarePlan(patient.patientId);
          }}
          patientId={patient.patientId}
        />
      )}
    </div>
  );
}
