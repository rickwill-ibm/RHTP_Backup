'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import {
  buildCareTeamInboxTasks,
  PROGRAM_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
  PRIORITY_CONFIG,
  PATIENT_CARE_TEAM,
} from '@/lib/fhirCareTeamData';
import type {
  CareTeamInboxTask,
  TaskProgramType,
  TaskStatus,
  TaskPriority,
} from '@/lib/fhirCareTeamData';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { getPatientById, PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { effectiveMemberId } from '@/lib/careTeam/identity';
import { getMemberName } from '@/lib/careTeam/members';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

// ─── Role filter config ───────────────────────────────────────────────────────

const ROLE_VIEWS = [
  { key: 'all', label: 'All Tasks', icon: 'InboxIcon', color: 'text-carbon-gray-70' },
  { key: 'clinical', label: 'Clinical / Specialist', icon: 'HeartIcon', color: 'text-[#0043ce]' },
  { key: 'bh', label: 'Behavioral Health', icon: 'UserCircleIcon', color: 'text-[#6929c4]' },
  { key: 'social', label: 'Community & Social', icon: 'UserGroupIcon', color: 'text-[#0e6027]' },
  {
    key: 'care-manager',
    label: 'Care Management',
    icon: 'ClipboardDocumentListIcon',
    color: 'text-[#da1e28]',
  },
];

const ROLE_PROGRAM_MAP: Record<string, TaskProgramType[]> = {
  all: [
    'Clinical',
    'Behavioral Health',
    'Food Security',
    'Housing',
    'Transportation',
    'Social Isolation',
  ],
  clinical: ['Clinical'],
  bh: ['Behavioral Health'],
  social: ['Food Security', 'Housing', 'Transportation', 'Social Isolation'],
  'care-manager': [
    'Clinical',
    'Behavioral Health',
    'Food Security',
    'Housing',
    'Transportation',
    'Social Isolation',
  ],
};

// ─── Message Thread Types ─────────────────────────────────────────────────────

interface ThreadMessage {
  id: string;
  author: string;
  role: string;
  avatar: string;
  body: string;
  timestamp: string;
  isOwn?: boolean;
  attachment?: string;
}

interface MessageThread {
  taskId: string;
  messages: ThreadMessage[];
}

// Seed threads for active patient tasks
const INITIAL_THREADS: Record<string, ThreadMessage[]> = {
  'task-fhir-001': [
    {
      id: 'm-001',
      author: 'Dr. James Whitfield',
      role: 'PCP',
      avatar: 'JW',
      body: 'Referring Maria for cardiology eval — BP 158/96 on 3 meds. JNC 8 resistant HTN criteria met. Please prioritize given 147-mile travel distance.',
      timestamp: '2026-04-10 09:02',
      isOwn: false,
    },
    {
      id: 'm-002',
      author: 'Dr. Amara Osei',
      role: 'Cardiologist',
      avatar: 'AO',
      body: 'Received. Scheduling echo + Holter. Will coordinate with Sarah Johnson on NEMT. Can we do telehealth pre-visit to reduce travel burden?',
      timestamp: '2026-04-11 14:15',
      isOwn: false,
    },
    {
      id: 'm-003',
      author: 'Sarah Johnson',
      role: 'Care Manager',
      avatar: 'SJ',
      body: 'NEMT arranged for in-person echo. Telehealth pre-visit confirmed for 04/18. Maria has been notified.',
      timestamp: '2026-04-12 10:30',
      isOwn: true,
    },
  ],
  'task-fhir-002': [
    {
      id: 'm-004',
      author: 'Dr. James Whitfield',
      role: 'PCP',
      avatar: 'JW',
      body: 'HEDIS EED gap — Maria has not had a diabetic eye exam in 18 months. Referring to Dr. Chen at Avera Sacred Heart.',
      timestamp: '2026-04-14 10:05',
      isOwn: false,
    },
    {
      id: 'm-005',
      author: 'Sarah Johnson',
      role: 'Care Manager',
      avatar: 'SJ',
      body: 'Confirmed referral sent. Will follow up with patient on scheduling. HEDIS deadline is 09/30.',
      timestamp: '2026-04-14 11:20',
      isOwn: true,
    },
  ],
  'task-fhir-003': [
    {
      id: 'm-006',
      author: 'Sarah Johnson',
      role: 'Care Manager',
      avatar: 'SJ',
      body: 'PHQ-9 score 14 at last visit — moderate depression. Requesting integrated BH assessment. Maria is open to counseling.',
      timestamp: '2026-04-15 11:05',
      isOwn: true,
    },
    {
      id: 'm-007',
      author: 'Dr. Sarah Nakamura',
      role: 'BH Counselor',
      avatar: 'SN',
      body: 'Accepted. Scheduling intake for next week. Will use telehealth given distance. Sending consent forms to patient portal.',
      timestamp: '2026-04-16 09:10',
      isOwn: false,
    },
  ],
};

// ─── Care Plan Goal Types ─────────────────────────────────────────────────────

interface CarePlanGoal {
  id: string;
  category: string;
  description: string;
  target: string;
  status: 'active' | 'achieved' | 'on-hold' | 'cancelled';
  dueDate: string;
  owner: string;
  lastUpdated: string;
}

const INITIAL_CARE_PLAN_GOALS: CarePlanGoal[] = [
  {
    id: 'cpg-001',
    category: 'Clinical',
    description: 'Achieve HbA1c < 8.0% — HEDIS CDC measure',
    target: 'HbA1c < 8.0%',
    status: 'active',
    dueDate: '2026-09-30',
    owner: 'Dr. James Whitfield',
    lastUpdated: '2026-04-10',
  },
  {
    id: 'cpg-002',
    category: 'Clinical',
    description: 'Control blood pressure to < 140/90 mmHg',
    target: 'BP < 140/90',
    status: 'active',
    dueDate: '2026-06-30',
    owner: 'Dr. Amara Osei',
    lastUpdated: '2026-04-12',
  },
  {
    id: 'cpg-003',
    category: 'Behavioral Health',
    description: 'Reduce PHQ-9 score from 14 to < 10 through integrated BH counseling',
    target: 'PHQ-9 < 10',
    status: 'active',
    dueDate: '2026-07-15',
    owner: 'Dr. Sarah Nakamura',
    lastUpdated: '2026-04-16',
  },
  {
    id: 'cpg-004',
    category: 'Social',
    description: 'Enroll in SNAP and establish consistent food access',
    target: 'SNAP enrolled + food box delivery',
    status: 'active',
    dueDate: '2026-05-10',
    owner: 'Angela Torres',
    lastUpdated: '2026-04-20',
  },
  {
    id: 'cpg-005',
    category: 'Social',
    description: 'Stabilize housing — SDHDA rental assistance application submitted',
    target: 'Rental assistance approved',
    status: 'on-hold',
    dueDate: '2026-06-01',
    owner: 'Lisa Fontaine, LCSW',
    lastUpdated: '2026-04-21',
  },
];

// ─── Evidence upload modal ────────────────────────────────────────────────────

function EvidenceModal({ task, onClose }: { task: CareTeamInboxTask; onClose: () => void }) {
  const [evidenceType, setEvidenceType] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const progCfg = PROGRAM_TYPE_CONFIG[task.programType];

  const evidenceOptions: Record<string, string[]> = {
    Clinical: ['Procedure Note', 'Encounter Summary', 'Lab Result', 'Imaging Report'],
    'Behavioral Health': ['PHQ-9 Score', 'GAD-7 Score', 'Assessment Summary', 'Care Plan Update'],
    'Food Security': [
      'SNAP Enrollment Confirmation',
      'Food Box Delivery Receipt',
      'WIC Enrollment',
      'Pantry Visit Record',
    ],
    Housing: [
      'Voucher Issued',
      'Case Reference Number',
      'Move-In Date Confirmed',
      'Shelter Placement',
    ],
    Transportation: ['Trip Confirmation', 'NEMT Receipt', 'Ride Completion Record'],
    'Social Isolation': ['Wellness Check Log', 'Community Program Enrollment', 'Check-In Record'],
  };

  const options = evidenceOptions[task.programType] ?? ['Documentation'];

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-carbon-gray-20 w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-[#defbe6] border border-[#a7f0ba] flex items-center justify-center mx-auto mb-4">
            <Icon name="CheckCircleIcon" size={32} className="text-[#24a148]" />
          </div>
          <h3 className="text-lg font-bold text-carbon-gray-100 mb-2">Task Completed</h3>
          <p className="text-sm text-carbon-gray-50 mb-1">Evidence submitted and loop closed.</p>
          <p className="text-xs font-mono text-carbon-gray-30 mb-6">
            Task/{task.id} → status: completed
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#0043ce] text-white text-sm font-medium hover:bg-[#0035a8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-carbon-gray-20 w-full max-w-lg">
        <div
          className={`px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between ${progCfg.bg}`}
        >
          <div className="flex items-center gap-3">
            <Icon name="DocumentArrowUpIcon" size={18} className={progCfg.color} />
            <div>
              <h3 className={`text-sm font-semibold ${progCfg.color}`}>
                Complete Task — Upload Evidence
              </h3>
              <p className="text-xs text-carbon-gray-50">
                {task.programType} · {task.patientName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
              Task
            </p>
            <p className="text-sm text-carbon-gray-100">{task.description}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-1">
              Evidence Type *
            </label>
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value)}
              className="w-full border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce] bg-white"
            >
              <option value="">Select evidence type…</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-1">
              Completion Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe the intervention performed and outcome…"
              className="w-full border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce] resize-none"
            />
          </div>
          <div className="flex items-center gap-2 p-3 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
            <Icon name="InformationCircleIcon" size={14} />
            Evidence will be attached to FHIR Task output and submitted to EDW provenance chain.
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                if (!evidenceType) return;
                // PUT Task status → completed in live mode (with required `for` field)
                if (!getFhirMockMode()) {
                  const fhirPatId = PLATFORM_TO_FHIR_ID_MAP[task.patientId] ?? task.patientId;
                  getFhirClient()
                    .update({
                      id: task.id,
                      resourceType: 'Task',
                      status: 'completed',
                      intent: 'order',
                      for: { reference: `Patient/${fhirPatId}` },
                      lastModified: new Date().toISOString(),
                      output: [{ type: { text: evidenceType }, valueString: notes }],
                    })
                    .catch(() => {
                      /* silent */
                    });
                }
                setSubmitted(true);
              }}
              disabled={!evidenceType}
              className="flex-1 px-4 py-2.5 bg-[#24a148] text-white text-sm font-medium hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Complete Task & Submit Evidence
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-carbon-gray-20 text-sm text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Message Thread Panel ─────────────────────────────────────────────────────

function MessageThreadPanel({ task, onClose }: { task: CareTeamInboxTask; onClose: () => void }) {
  const [threads, setThreads] = useState<Record<string, ThreadMessage[]>>(INITIAL_THREADS);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const progCfg = PROGRAM_TYPE_CONFIG[task.programType];
  const taskMessages = threads[task.id] ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [taskMessages.length]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    setSending(true);
    const body = newMessage.trim();
    const msg: ThreadMessage = {
      id: `m-new-${Date.now()}`,
      author: 'Sarah Johnson',
      role: 'Care Manager',
      avatar: 'SJ',
      body,
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      isOwn: true,
    };
    setTimeout(() => {
      setThreads((prev) => ({
        ...prev,
        [task.id]: [...(prev[task.id] ?? []), msg],
      }));
      setNewMessage('');
      setSending(false);
    }, 400);
    // ── FHIR Communication POST (fire-and-forget) ─────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatId = PLATFORM_TO_FHIR_ID_MAP[task.patientId] ?? task.patientId;
      getFhirClient()
        .create({
          resourceType: 'Communication',
          status: 'completed',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                  code: 'alert',
                  display: 'Alert',
                },
              ],
            },
          ],
          subject: { reference: `Patient/${fhirPatId}` },
          about: [{ reference: `Task/${task.id}` }],
          sender: { display: 'Sarah Johnson — Care Manager' },
          recipient: [{ display: task.owner.display }],
          sent: new Date().toISOString(),
          payload: [{ contentString: body }],
          note: [{ text: `Thread on Task: ${task.description} · Patient: ${task.patientName}` }],
        })
        .catch((err) => console.warn('[Communication] POST failed:', err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div
        className="bg-white border border-carbon-gray-20 w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between flex-shrink-0 ${progCfg.bg}`}
        >
          <div className="flex items-center gap-3">
            <Icon name="ChatBubbleLeftRightIcon" size={18} className={progCfg.color} />
            <div>
              <h3 className={`text-sm font-semibold ${progCfg.color}`}>Message Thread</h3>
              <p className="text-xs text-carbon-gray-50 truncate max-w-xs">{task.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-carbon-gray-50">
              {task.patientName} · {task.patientId}
            </span>
            <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>
        </div>

        {/* Participants strip */}
        <div className="px-5 py-2.5 border-b border-carbon-gray-20 flex items-center gap-2 flex-shrink-0 bg-carbon-gray-10">
          <span className="text-2xs text-carbon-gray-50 uppercase tracking-wide mr-1">
            Participants:
          </span>
          {[
            { name: task.requester.display, role: task.requester.role },
            { name: task.owner.display, role: task.owner.role },
            { name: 'Sarah Johnson', role: 'Care Manager' },
          ].map((p, i) => (
            <span
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 bg-white border border-carbon-gray-20 text-xs text-carbon-gray-70"
            >
              <span className="w-4 h-4 rounded-full bg-[#0043ce] text-white text-2xs flex items-center justify-center font-bold">
                {p.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              {p.name}
              <span className="text-carbon-gray-30">·</span>
              <span className="text-carbon-gray-50">{p.role}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1 text-2xs text-[#24a148]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#24a148] inline-block"></span>
            Live
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {taskMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-carbon-gray-50">
              <Icon name="ChatBubbleLeftRightIcon" size={28} className="mb-2 text-carbon-gray-30" />
              <p className="text-sm">No messages yet — start the thread</p>
            </div>
          ) : (
            taskMessages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.isOwn ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${msg.isOwn ? 'bg-[#0043ce]' : 'bg-carbon-gray-70'}`}
                >
                  {msg.avatar}
                </div>
                <div
                  className={`max-w-sm ${msg.isOwn ? 'items-end' : 'items-start'} flex flex-col`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-carbon-gray-100">{msg.author}</span>
                    <span className="text-2xs text-carbon-gray-30">{msg.role}</span>
                    <span className="text-2xs font-mono text-carbon-gray-30">{msg.timestamp}</span>
                  </div>
                  <div
                    className={`px-4 py-2.5 text-sm text-carbon-gray-100 ${msg.isOwn ? 'bg-[#d0e2ff] border border-[#97c1ff]' : 'bg-carbon-gray-10 border border-carbon-gray-20'}`}
                  >
                    {msg.body}
                  </div>
                  {msg.attachment && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-[#0043ce]">
                      <Icon name="PaperClipIcon" size={12} />
                      {msg.attachment}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose */}
        <div className="px-5 py-4 border-t border-carbon-gray-20 flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              className="flex-1 border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce] resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="px-4 py-2 bg-[#0043ce] text-white text-sm font-medium hover:bg-[#0035a8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 self-end"
            >
              <Icon name="PaperAirplaneIcon" size={14} />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="text-2xs text-carbon-gray-30 mt-1.5 flex items-center gap-1">
            <Icon name="LockClosedIcon" size={10} />
            HIPAA-compliant · FHIR Communication resource · Audit logged
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Care Plan Edit Panel ─────────────────────────────────────────────────────

function CarePlanEditPanel({
  patientName,
  patientId,
  onClose,
}: {
  patientName: string;
  patientId: string;
  onClose: () => void;
}) {
  const [goals, setGoals] = useState<CarePlanGoal[]>(INITIAL_CARE_PLAN_GOALS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<CarePlanGoal>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<CarePlanGoal>>({
    category: 'Clinical',
    status: 'active',
  });
  const [saved, setSaved] = useState(false);

  const statusColors: Record<string, string> = {
    active: 'text-[#0043ce] bg-[#d0e2ff] border-[#97c1ff]',
    achieved: 'text-[#0e6027] bg-[#defbe6] border-[#a7f0ba]',
    'on-hold': 'text-[#b45309] bg-[#fdf6dd] border-[#f1c21b]',
    cancelled: 'text-carbon-gray-50 bg-carbon-gray-10 border-carbon-gray-20',
  };

  const startEdit = (goal: CarePlanGoal) => {
    setEditingId(goal.id);
    setEditDraft({ ...goal });
  };

  const saveEdit = () => {
    const updated = goals.find((g) => g.id === editingId);
    if (!updated) {
      setEditingId(null);
      setEditDraft({});
      return;
    }
    const merged = { ...updated, ...editDraft, lastUpdated: new Date().toISOString().slice(0, 10) };
    setGoals((prev) => prev.map((g) => (g.id === editingId ? merged : g)));
    setEditingId(null);
    setEditDraft({});

    // ── FHIR Goal PUT (fire-and-forget) ──────────────────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatId = PLATFORM_TO_FHIR_ID_MAP[patientId] ?? patientId;
      getFhirClient()
        .update({
          resourceType: 'Goal',
          id: merged.id,
          lifecycleStatus:
            merged.status === 'active'
              ? 'active'
              : merged.status === 'achieved'
                ? 'completed'
                : merged.status === 'on-hold'
                  ? 'on-hold'
                  : 'cancelled',
          description: { text: merged.description },
          subject: { reference: `Patient/${fhirPatId}` },
          ...(merged.dueDate ? { target: [{ dueDate: merged.dueDate }] } : {}),
          note: [{ text: `Target: ${merged.target}` }],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/goal-owner',
              valueString: merged.owner,
            },
          ],
        })
        .then(() => console.info(`[Goal] ${merged.id} updated`))
        .catch((err) => console.warn('[Goal] PUT failed:', err));
    }
  };

  const saveNewGoal = () => {
    if (!newGoal.description || !newGoal.target) return;
    const goal: CarePlanGoal = {
      id: `cpg-${Date.now()}`,
      category: newGoal.category ?? 'Clinical',
      description: newGoal.description ?? '',
      target: newGoal.target ?? '',
      status: (newGoal.status as CarePlanGoal['status']) ?? 'active',
      dueDate: newGoal.dueDate ?? '',
      owner: newGoal.owner ?? 'Sarah Johnson',
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
    setGoals((prev) => [...prev, goal]);
    setAddingNew(false);
    setNewGoal({ category: 'Clinical', status: 'active' });

    // ── FHIR Goal POST (fire-and-forget) ─────────────────────────────────────
    if (!getFhirMockMode()) {
      const fhirPatId = PLATFORM_TO_FHIR_ID_MAP[patientId] ?? patientId;
      getFhirClient()
        .create({
          resourceType: 'Goal',
          id: goal.id,
          lifecycleStatus: 'active',
          description: { text: goal.description },
          subject: { reference: `Patient/${fhirPatId}` },
          ...(goal.dueDate ? { target: [{ dueDate: goal.dueDate }] } : {}),
          note: [{ text: `Target: ${goal.target}` }],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/goal-owner',
              valueString: goal.owner,
            },
          ],
        })
        .then(() => console.info(`[Goal] ${goal.id} created`))
        .catch((err) => console.warn('[Goal] POST failed:', err));
    }
  };

  const handleSaveAll = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white border border-carbon-gray-20 w-full max-w-3xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between flex-shrink-0 bg-[#d0e2ff]">
          <div className="flex items-center gap-3">
            <Icon name="ClipboardDocumentListIcon" size={18} className="text-[#0043ce]" />
            <div>
              <h3 className="text-sm font-semibold text-[#0043ce]">Care Plan — Active Goals</h3>
              <p className="text-xs text-carbon-gray-50">
                {patientName} · {patientId} · FHIR CarePlan resource
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Goals list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {goals.map((goal) => (
            <div key={goal.id} className="border border-carbon-gray-20 bg-white">
              {editingId === goal.id ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                        Category
                      </label>
                      <select
                        value={editDraft.category}
                        onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                        className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 bg-white focus:outline-none focus:border-[#0043ce]"
                      >
                        {['Clinical', 'Behavioral Health', 'Social', 'Functional'].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                        Status
                      </label>
                      <select
                        value={editDraft.status}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            status: e.target.value as CarePlanGoal['status'],
                          }))
                        }
                        className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 bg-white focus:outline-none focus:border-[#0043ce]"
                      >
                        {['active', 'achieved', 'on-hold', 'cancelled'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                      Goal Description
                    </label>
                    <input
                      value={editDraft.description ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                        Target
                      </label>
                      <input
                        value={editDraft.target ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, target: e.target.value }))}
                        className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                      />
                    </div>
                    <div>
                      <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={editDraft.dueDate ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, dueDate: e.target.value }))}
                        className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                      />
                    </div>
                    <div>
                      <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                        Owner
                      </label>
                      <input
                        value={editDraft.owner ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, owner: e.target.value }))}
                        className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveEdit}
                      className="px-4 py-1.5 bg-[#0043ce] text-white text-xs font-medium hover:bg-[#0035a8] transition-colors"
                    >
                      Save Goal
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 border border-carbon-gray-20 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
                        {goal.category}
                      </span>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 border ${statusColors[goal.status]}`}
                      >
                        {goal.status}
                      </span>
                      {goal.dueDate && (
                        <span className="text-2xs font-mono text-carbon-gray-30">
                          Due {goal.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-carbon-gray-100">{goal.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-carbon-gray-50">
                      <span>
                        Target:{' '}
                        <span className="font-medium text-carbon-gray-70">{goal.target}</span>
                      </span>
                      <span>
                        Owner: <span className="font-medium text-carbon-gray-70">{goal.owner}</span>
                      </span>
                      <span className="font-mono text-carbon-gray-30">
                        Updated {goal.lastUpdated}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(goal)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-carbon-gray-20 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                  >
                    <Icon name="PencilSquareIcon" size={12} />
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add new goal */}
          {addingNew ? (
            <div className="border border-[#0043ce] bg-[#edf5ff] p-4 space-y-3">
              <p className="text-xs font-semibold text-[#0043ce]">New Care Plan Goal</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                    Category
                  </label>
                  <select
                    value={newGoal.category}
                    onChange={(e) => setNewGoal((d) => ({ ...d, category: e.target.value }))}
                    className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 bg-white focus:outline-none focus:border-[#0043ce]"
                  >
                    {['Clinical', 'Behavioral Health', 'Social', 'Functional'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                    Status
                  </label>
                  <select
                    value={newGoal.status}
                    onChange={(e) =>
                      setNewGoal((d) => ({
                        ...d,
                        status: e.target.value as CarePlanGoal['status'],
                      }))
                    }
                    className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 bg-white focus:outline-none focus:border-[#0043ce]"
                  >
                    {['active', 'on-hold'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                  Goal Description *
                </label>
                <input
                  value={newGoal.description ?? ''}
                  onChange={(e) => setNewGoal((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Describe the care goal…"
                  className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                    Target *
                  </label>
                  <input
                    value={newGoal.target ?? ''}
                    onChange={(e) => setNewGoal((d) => ({ ...d, target: e.target.value }))}
                    placeholder="e.g. HbA1c < 8%"
                    className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                  />
                </div>
                <div>
                  <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newGoal.dueDate ?? ''}
                    onChange={(e) => setNewGoal((d) => ({ ...d, dueDate: e.target.value }))}
                    className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                  />
                </div>
                <div>
                  <label className="text-2xs text-carbon-gray-50 uppercase tracking-wide block mb-1">
                    Owner
                  </label>
                  <input
                    value={newGoal.owner ?? ''}
                    onChange={(e) => setNewGoal((d) => ({ ...d, owner: e.target.value }))}
                    placeholder="Provider name"
                    className="w-full border border-carbon-gray-30 text-xs px-2 py-1.5 focus:outline-none focus:border-[#0043ce]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveNewGoal}
                  disabled={!newGoal.description || !newGoal.target}
                  className="px-4 py-1.5 bg-[#0043ce] text-white text-xs font-medium hover:bg-[#0035a8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Goal
                </button>
                <button
                  onClick={() => setAddingNew(false)}
                  className="px-4 py-1.5 border border-carbon-gray-20 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingNew(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-carbon-gray-30 text-xs text-carbon-gray-50 hover:border-[#0043ce] hover:text-[#0043ce] transition-colors"
            >
              <Icon name="PlusIcon" size={14} />
              Add Care Plan Goal
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-carbon-gray-20 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1.5 px-5 py-2 bg-[#0043ce] text-white text-sm font-medium hover:bg-[#0035a8] transition-colors"
          >
            {saved ? (
              <>
                <Icon name="CheckIcon" size={14} /> Saved to FHIR CarePlan
              </>
            ) : (
              <>
                <Icon name="CloudArrowUpIcon" size={14} /> Save Care Plan
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 border border-carbon-gray-20 text-sm text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
          >
            Close
          </button>
          <span className="ml-auto text-2xs text-carbon-gray-30 flex items-center gap-1">
            <Icon name="LockClosedIcon" size={10} />
            FHIR CarePlan · Versioned · Audit logged
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Task Assignment Panel ────────────────────────────────────────────────────

function TaskAssignmentPanel({
  task,
  onClose,
  onReassigned,
}: {
  task: CareTeamInboxTask;
  onClose: () => void;
  onReassigned: (
    taskId: string,
    newOwner: { display: string; role: string; organization: string }
  ) => void;
}) {
  const participants = PATIENT_CARE_TEAM.participants;
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const progCfg = PROGRAM_TYPE_CONFIG[task.programType];

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId);

  const handleAssign = () => {
    if (!selectedParticipant) return;
    onReassigned(task.id, {
      display: selectedParticipant.name,
      role: selectedParticipant.roleDisplay,
      organization: selectedParticipant.organization,
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-carbon-gray-20 w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-[#d0e2ff] border border-[#97c1ff] flex items-center justify-center mx-auto mb-4">
            <Icon name="UserPlusIcon" size={32} className="text-[#0043ce]" />
          </div>
          <h3 className="text-lg font-bold text-carbon-gray-100 mb-2">Task Reassigned</h3>
          <p className="text-sm text-carbon-gray-70 mb-1">
            Assigned to <span className="font-semibold">{selectedParticipant?.name}</span>
          </p>
          <p className="text-xs text-carbon-gray-50 mb-1">
            {selectedParticipant?.roleDisplay} · {selectedParticipant?.organization}
          </p>
          <p className="text-xs font-mono text-carbon-gray-30 mb-6">
            Task/{task.id} → owner updated · FHIR Task.owner patched
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#0043ce] text-white text-sm font-medium hover:bg-[#0035a8] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-carbon-gray-20 w-full max-w-xl">
        {/* Header */}
        <div
          className={`px-5 py-4 border-b border-carbon-gray-20 flex items-center justify-between ${progCfg.bg}`}
        >
          <div className="flex items-center gap-3">
            <Icon name="UserPlusIcon" size={18} className={progCfg.color} />
            <div>
              <h3 className={`text-sm font-semibold ${progCfg.color}`}>Assign / Reassign Task</h3>
              <p className="text-xs text-carbon-gray-50 truncate max-w-xs">{task.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-carbon-gray-50 hover:text-carbon-gray-100">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current owner */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-carbon-gray-10 border border-carbon-gray-20">
            <Icon name="UserCircleIcon" size={16} className="text-carbon-gray-50" />
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Current Owner</p>
              <p className="text-sm font-medium text-carbon-gray-100">
                {task.owner.display}{' '}
                <span className="text-carbon-gray-50 font-normal">· {task.owner.role}</span>
              </p>
              <p className="text-xs text-carbon-gray-50">{task.owner.organization}</p>
            </div>
          </div>

          {/* Select new assignee */}
          <div>
            <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-2">
              Assign To *
            </label>
            <div className="space-y-1.5 max-h-52 overflow-y-auto border border-carbon-gray-20 p-2">
              {participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedParticipantId(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border ${
                    selectedParticipantId === p.id
                      ? 'border-[#0043ce] bg-[#edf5ff]'
                      : 'border-transparent hover:bg-carbon-gray-10'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#0043ce] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {p.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-carbon-gray-100">{p.name}</p>
                    <p className="text-xs text-carbon-gray-50 truncate">
                      {p.roleDisplay} · {p.organization}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-2xs px-1.5 py-0.5 border ${p.status === 'active' ? 'text-[#0e6027] bg-[#defbe6] border-[#a7f0ba]' : 'text-carbon-gray-50 bg-carbon-gray-10 border-carbon-gray-20'}`}
                    >
                      {p.activeTaskCount} tasks
                    </span>
                    {selectedParticipantId === p.id && (
                      <Icon name="CheckCircleIcon" size={16} className="text-[#0043ce]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Priority + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce] bg-white"
              >
                {(['routine', 'urgent', 'asap', 'stat'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce]"
              />
            </div>
          </div>

          {/* Assignment note */}
          <div>
            <label className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide block mb-1">
              Assignment Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Reason for reassignment or additional context…"
              className="w-full border border-carbon-gray-30 text-sm px-3 py-2 focus:outline-none focus:border-[#0043ce] resize-none"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-carbon-gray-10 border border-carbon-gray-20 text-xs text-carbon-gray-50">
            <Icon name="InformationCircleIcon" size={14} />
            Assignment updates FHIR Task.owner, triggers notification to new assignee, and logs to
            audit trail.
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAssign}
              disabled={!selectedParticipantId}
              className="flex-1 px-4 py-2.5 bg-[#0043ce] text-white text-sm font-medium hover:bg-[#0035a8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Icon name="UserPlusIcon" size={14} />
              Assign Task
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-carbon-gray-20 text-sm text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onComplete,
  onOpenThread,
  onAssign,
}: {
  task: CareTeamInboxTask;
  onComplete: (t: CareTeamInboxTask) => void;
  onOpenThread: (t: CareTeamInboxTask) => void;
  onAssign: (t: CareTeamInboxTask) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localStatus, setLocalStatus] = useState<TaskStatus>(task.status);
  const [localOwner, setLocalOwner] = useState(task.owner);
  const progCfg = PROGRAM_TYPE_CONFIG[task.programType];
  const statusCfg = TASK_STATUS_CONFIG[localStatus];
  const priorityCfg = PRIORITY_CONFIG[task.priority];

  const isActionable =
    localStatus === 'requested' || localStatus === 'accepted' || localStatus === 'in-progress';
  const threadCount = (INITIAL_THREADS[task.id] ?? []).length;

  return (
    <div
      className={`bg-white border transition-shadow ${
        task.priority === 'stat'
          ? 'border-l-4 border-l-[#da1e28] border-carbon-gray-20'
          : task.priority === 'asap'
            ? 'border-l-4 border-l-[#b45309] border-carbon-gray-20'
            : 'border border-carbon-gray-20'
      } hover:shadow-sm`}
    >
      {/* Header row */}
      <div className="px-5 py-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 px-2 py-1 ${progCfg.bg} border ${progCfg.border} flex items-center gap-1.5`}
          >
            <Icon name={progCfg.icon as any} size={12} className={progCfg.color} />
            <span className={`text-2xs font-semibold ${progCfg.color}`}>{task.programType}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-carbon-gray-100 leading-tight">
                  {task.description}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-carbon-gray-70">
                    <span className="font-medium">{task.patientName}</span>
                    <span className="text-carbon-gray-30 mx-1">·</span>
                    <span className="font-mono text-carbon-gray-50">{task.patientId}</span>
                  </span>
                  <span className={`text-2xs font-semibold ${priorityCfg.color}`}>
                    {priorityCfg.label}
                  </span>
                  <span className="text-2xs font-mono text-carbon-gray-30">Due {task.dueDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {threadCount > 0 && (
                  <span className="flex items-center gap-1 text-2xs text-[#0043ce] bg-[#d0e2ff] px-1.5 py-0.5 border border-[#97c1ff]">
                    <Icon name="ChatBubbleLeftRightIcon" size={10} />
                    {threadCount}
                  </span>
                )}
                <span
                  className={`text-2xs font-semibold px-2 py-0.5 ${statusCfg.bg} ${statusCfg.color}`}
                >
                  {statusCfg.label}
                </span>
                <Icon
                  name={expanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                  size={14}
                  className="text-carbon-gray-30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Requester / Owner row */}
        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-carbon-gray-50">
          <span>
            <span className="text-2xs uppercase tracking-wide mr-1">From:</span>
            <span className="font-medium text-carbon-gray-70">{task.requester.display}</span>
            <span className="text-carbon-gray-30 mx-1">·</span>
            <span>{task.requester.role}</span>
          </span>
          <span>
            <span className="text-2xs uppercase tracking-wide mr-1">To:</span>
            <span className="font-medium text-carbon-gray-70">{localOwner.display}</span>
            <span className="text-carbon-gray-30 mx-1">·</span>
            <span>{localOwner.organization}</span>
          </span>
          {task.gainShareValue && (
            <span className="text-[#24a148] font-semibold">{task.gainShareValue} gain share</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-carbon-gray-20 px-5 py-4 space-y-4">
          {/* FHIR resource info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Task ID', value: task.id, mono: true },
              { label: 'Intent', value: task.intent },
              { label: 'Authored', value: task.authoredOn.split('T')[0], mono: true },
              { label: 'Reason', value: task.reasonCode ?? '—', mono: true },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  {f.label}
                </p>
                <p
                  className={`text-xs font-medium text-carbon-gray-100 ${f.mono ? 'font-mono' : ''}`}
                >
                  {f.value}
                </p>
              </div>
            ))}
          </div>

          {task.reasonDisplay && (
            <div
              className={`flex items-center gap-2 px-3 py-2 ${progCfg.bg} border ${progCfg.border}`}
            >
              <Icon name="InformationCircleIcon" size={14} className={progCfg.color} />
              <span className={`text-xs ${progCfg.color}`}>{task.reasonDisplay}</span>
            </div>
          )}

          {task.note && (
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-3 py-2">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                Clinical Note
              </p>
              <p className="text-xs text-carbon-gray-70">{task.note}</p>
            </div>
          )}

          {task.output && (
            <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
                <p className="text-xs font-semibold text-[#0e6027]">Completion Evidence</p>
              </div>
              <p className="text-xs text-[#0e6027]">{task.output.description}</p>
              <p className="text-2xs font-mono text-[#0e6027] mt-1">
                {task.output.type}/{task.output.valueReference} · {task.output.date}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Message thread button — always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenThread(task);
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#97c1ff] bg-[#d0e2ff] text-xs font-medium text-[#0043ce] hover:bg-[#b8d4ff] transition-colors"
            >
              <Icon name="ChatBubbleLeftRightIcon" size={13} />
              Thread {threadCount > 0 ? `(${threadCount})` : ''}
            </button>

            {/* Assign button — always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAssign(task);
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-carbon-gray-20 text-xs font-medium text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              <Icon name="UserPlusIcon" size={13} />
              Assign
            </button>

            {isActionable && (
              <>
                {localStatus === 'requested' && (
                  <>
                    <button
                      onClick={() => setLocalStatus('accepted')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#24a148] text-white text-xs font-medium hover:bg-[#1a7a38] transition-colors"
                    >
                      <Icon name="CheckIcon" size={13} />
                      Accept
                    </button>
                    <button
                      onClick={() => setLocalStatus('rejected')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#da1e28] text-white text-xs font-medium hover:bg-[#a81e28] transition-colors"
                    >
                      <Icon name="XMarkIcon" size={13} />
                      Decline
                    </button>
                  </>
                )}
                {(localStatus === 'accepted' || localStatus === 'in-progress') && (
                  <button
                    onClick={() => onComplete(task)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0043ce] text-white text-xs font-medium hover:bg-[#0035a8] transition-colors"
                  >
                    <Icon name="DocumentArrowUpIcon" size={13} />
                    Complete + Upload Evidence
                  </button>
                )}
              </>
            )}

            {task.qualityMeasureImpact && (
              <span className="text-xs text-carbon-gray-50 ml-auto">
                <Icon name="StarIcon" size={12} className="inline mr-1 text-[#f1c21b]" />
                {task.qualityMeasureImpact}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CareTeamInboxPage() {
  const { activeCitizenId: activePatientId } = useActiveCitizen();
  const { assignments, useMockData } = useAppContext();
  const activePatient = getPatientById(activePatientId);

  // ── FHIR Task fetch ──────────────────────────────────────────────────────────
  const [fhirTasks, setFhirTasks] = useState<CareTeamInboxTask[]>([]);
  const [fhirTaskLoading, setFhirTaskLoading] = useState(false);

  useEffect(() => {
    if (useMockData) {
      setFhirTasks([]);
      return;
    }
    setFhirTaskLoading(true);
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[activePatientId];
    if (!fhirId) {
      setFhirTaskLoading(false);
      return;
    }
    getFhirClient()
      .search('Task', { patient: `Patient/${fhirId}`, _count: 100 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((bundle: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries: any[] = bundle.entry ?? [];
        const tasks: CareTeamInboxTask[] = entries
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.resource)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => r?.resourceType === 'Task')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((t: any) => {
            const reg = activePatient;
            const domainExt =
              t.extension?.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (ex: any) =>
                  ex.url === 'http://tcoc.example.org/fhir/StructureDefinition/care-gap-domain'
              )?.valueString ?? 'Clinical';
            const progTypeMap: Record<string, TaskProgramType> = {
              Clinical: 'Clinical',
              BH: 'Behavioral Health',
              Social: 'Social Isolation',
            };
            return {
              id: t.id,
              resourceType: 'Task' as const,
              status: (t.status ?? 'requested') as TaskStatus,
              intent: 'order' as const,
              priority: (t.priority ?? 'routine') as TaskPriority,
              programType: progTypeMap[domainExt] ?? 'Clinical',
              code: t.code?.text ?? domainExt,
              description: t.description ?? t.code?.text ?? 'Care Gap Task',
              for: { reference: `Patient/${fhirId}`, display: reg?.name ?? fhirId },
              patientName: reg?.name ?? fhirId,
              patientId: activePatientId,
              patientDob: reg?.dob ?? '—',
              riskTier: reg?.riskTier ?? 'Moderate',
              requester: {
                reference: 'Practitioner/practitioner-rick',
                display: reg?.pcp ?? 'Dr. Rick',
                role: 'PCP',
              },
              owner: {
                reference: `Practitioner/${t.owner?.reference?.split('/')[1] ?? 'practitioner-rick'}`,
                display: t.owner?.display ?? reg?.careManager ?? 'Care Manager',
                role: domainExt === 'Social' ? 'CHW' : 'Care Manager',
                organization: reg?.organization ?? 'RHTP Network',
              },
              authoredOn: t.authoredOn ?? new Date().toISOString(),
              lastModified: t.lastModified ?? new Date().toISOString(),
              dueDate: t.executionPeriod?.end?.split('T')[0] ?? '—',
              gainShareValue:
                domainExt === 'Clinical' ? '$185' : domainExt === 'BH' ? '$140' : '$95',
              qualityMeasureImpact: `HEDIS — ${domainExt} Care Gap`,
              note: t.note?.[0]?.text,
              reasonCode: t.reasonCode?.text,
              reasonDisplay: t.reasonReference?.display,
            } as unknown as CareTeamInboxTask;
          });
        if (tasks.length > 0) setFhirTasks(tasks);
      })
      .catch(() => setFhirTasks([]))
      .finally(() => setFhirTaskLoading(false));
  }, [activePatientId, useMockData, activePatient]);

  const CARE_TEAM_INBOX_TASKS = useMemo(() => {
    if (!useMockData && fhirTasks.length > 0) return fhirTasks;
    return buildCareTeamInboxTasks(
      activePatient?.name ?? 'Unknown Patient',
      activePatient?.platformId ?? activePatientId,
      activePatient?.dob ?? '—',
      activePatient?.riskTier ?? 'Moderate'
    );
  }, [activePatientId, activePatient, useMockData, fhirTasks]);

  const [roleView, setRoleView] = useState('all');
  const [programFilter, setProgramFilter] = useState<TaskProgramType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [evidenceTask, setEvidenceTask] = useState<CareTeamInboxTask | null>(null);
  const [threadTask, setThreadTask] = useState<CareTeamInboxTask | null>(null);
  const [assignTask, setAssignTask] = useState<CareTeamInboxTask | null>(null);
  const [showCarePlan, setShowCarePlan] = useState(false);

  const allowedPrograms = ROLE_PROGRAM_MAP[roleView] ?? [];

  const filtered = useMemo(() => {
    return CARE_TEAM_INBOX_TASKS.filter((t) => {
      const programMatch = allowedPrograms.includes(t.programType);
      const filterProgram = programFilter === 'All' || t.programType === programFilter;
      const filterStatus = statusFilter === 'All' || t.status === statusFilter;
      const filterPriority = priorityFilter === 'All' || t.priority === priorityFilter;
      const searchMatch =
        !searchQuery ||
        t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.owner.display.toLowerCase().includes(searchQuery.toLowerCase());
      return programMatch && filterProgram && filterStatus && filterPriority && searchMatch;
    });
  }, [
    roleView,
    programFilter,
    statusFilter,
    priorityFilter,
    searchQuery,
    allowedPrograms,
    CARE_TEAM_INBOX_TASKS,
  ]);

  const kpis = useMemo(() => {
    const all = CARE_TEAM_INBOX_TASKS;
    return {
      total: all.length,
      open: all.filter((t) => t.status === 'requested' || t.status === 'accepted').length,
      inProgress: all.filter((t) => t.status === 'in-progress').length,
      completed: all.filter((t) => t.status === 'completed').length,
      stat: all.filter((t) => t.priority === 'stat' || t.priority === 'asap').length,
    };
  }, [CARE_TEAM_INBOX_TASKS]);

  const programCounts = useMemo(() => {
    const counts: Partial<Record<TaskProgramType, number>> = {};
    CARE_TEAM_INBOX_TASKS.forEach((t) => {
      if (t.status !== 'completed' && t.status !== 'cancelled') {
        counts[t.programType] = (counts[t.programType] ?? 0) + 1;
      }
    });
    return counts;
  }, [CARE_TEAM_INBOX_TASKS]);

  const handleReassigned = useCallback(
    (taskId: string, newOwner: { display: string; role: string; organization: string }) => {
      if (!getFhirMockMode()) {
        // PUT Task with updated owner (fire-and-forget)
        getFhirClient()
          .update({
            id: taskId,
            resourceType: 'Task',
            status: 'in-progress',
            intent: 'order',
            owner: { display: newOwner.display },
            lastModified: new Date().toISOString(),
          })
          .catch(() => {
            /* silent */
          });
        // AuditEvent: task reassigned
        getFhirClient()
          .create({
            resourceType: 'AuditEvent',
            type: {
              system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
              code: 'rest',
              display: 'RESTful Operation',
            },
            subtype: [
              {
                system: 'http://hl7.org/fhir/restful-interaction',
                code: 'update',
                display: 'update',
              },
            ],
            action: 'U',
            recorded: new Date().toISOString(),
            outcome: '0',
            agent: [{ who: { display: newOwner.display }, requestor: true }],
            source: { observer: { display: 'TCOC Platform — Care Team Inbox' } },
            entity: [
              {
                what: { reference: `Task/${taskId}` },
                description: `Task reassigned to ${newOwner.display} (${newOwner.role}) — ${newOwner.organization}`,
              },
            ],
          })
          .catch(() => {
            /* non-fatal */
          });
      }
    },
    []
  );

  return (
    <AppLayout
      pageTitle="Care Team Inbox — Universal Task Queue"
      breadcrumbs={[
        { label: 'RHTP Platform', href: '/contract-program-selection' },
        { label: 'Care Team Inbox' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">
            FHIR Task-Based Closed-Loop Referral
          </span>
          <span className="text-xs text-[#0043ce]">{kpis.open} Open Tasks</span>
          <span className="text-xs text-[#0043ce]">{kpis.inProgress} In Progress</span>
          {kpis.stat > 0 && (
            <span className="text-xs font-bold text-[#da1e28]">⚠ {kpis.stat} STAT/ASAP</span>
          )}
          {fhirTaskLoading && (
            <span className="text-xs text-[#0043ce] flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border border-[#0043ce] border-t-transparent animate-spin inline-block" />
              Loading FHIR tasks…
            </span>
          )}
          {!useMockData && fhirTasks.length > 0 && (
            <span className="text-xs font-medium text-[#198038]">
              ✓ {fhirTasks.length} FHIR tasks
            </span>
          )}
          <span className="text-xs text-[#0043ce] font-medium">
            {activePatient?.name ?? 'Active Patient'} ·{' '}
            {activePatient?.platformId ?? activePatientId}
          </span>
          {(() => {
            const cm = getMemberName(
              effectiveMemberId(activePatient?.platformId ?? activePatientId, assignments) ?? ''
            );
            return cm ? (
              <span className="text-xs text-[#0043ce] inline-flex items-center gap-1">
                <Icon name="UserCircleIcon" size={12} />
                CM: <span className="font-semibold">{cm}</span>
              </span>
            ) : null;
          })()}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShowCarePlan(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-[#0043ce] bg-white border border-[#97c1ff] px-3 py-1 hover:bg-[#edf5ff] transition-colors"
            >
              <Icon name="ClipboardDocumentListIcon" size={12} />
              Edit Care Plan
            </button>
            <Link
              href="/specialist-inbox"
              className="text-xs text-[#0043ce] hover:underline flex items-center gap-1"
            >
              <Icon name="FunnelIcon" size={12} />
              Specialist View →
            </Link>
          </div>
        </div>
      }
    >
      {/* KPI Strip */}
      <div className="mx-6 mt-4 mb-4 bg-white border border-carbon-gray-20 grid grid-cols-5 divide-x divide-carbon-gray-20">
        {[
          { label: 'Total Tasks', value: kpis.total, color: 'text-carbon-gray-100' },
          { label: 'Open / Pending', value: kpis.open, color: 'text-[#da1e28]' },
          { label: 'In Progress', value: kpis.inProgress, color: 'text-[#0043ce]' },
          { label: 'Completed', value: kpis.completed, color: 'text-[#24a148]' },
          { label: 'STAT / ASAP', value: kpis.stat, color: 'text-[#da1e28]' },
        ].map((k) => (
          <div key={k.label} className="px-5 py-4">
            <p className="carbon-label">{k.label}</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* Sync status strip */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#24a148] animate-pulse"></span>
            <span className="text-xs font-medium text-[#0e6027]">Live Sync Active</span>
          </div>
          <span className="text-xs text-carbon-gray-50">
            Message threads · Care plan edits · Task assignments — synchronized across all providers
          </span>
          <div className="ml-auto flex items-center gap-3 text-2xs text-carbon-gray-30">
            <span className="flex items-center gap-1">
              <Icon name="ChatBubbleLeftRightIcon" size={11} />{' '}
              {Object.values(INITIAL_THREADS).flat().length} messages
            </span>
            <span className="flex items-center gap-1">
              <Icon name="ClipboardDocumentListIcon" size={11} /> {INITIAL_CARE_PLAN_GOALS.length}{' '}
              care plan goals
            </span>
            <span className="flex items-center gap-1">
              <Icon name="UserGroupIcon" size={11} /> {PATIENT_CARE_TEAM.participants.length} team
              members
            </span>
          </div>
        </div>

        {/* Program type summary strip */}
        <div className="bg-white border border-carbon-gray-20 px-4 py-3">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-2">
            Open Tasks by Program
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(PROGRAM_TYPE_CONFIG).map(([prog, cfg]) => {
              const count = programCounts[prog as TaskProgramType] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={prog}
                  onClick={() =>
                    setProgramFilter(
                      programFilter === (prog as TaskProgramType)
                        ? 'All'
                        : (prog as TaskProgramType)
                    )
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors ${
                    programFilter === prog
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : 'bg-white border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10'
                  }`}
                >
                  <Icon name={cfg.icon as any} size={12} />
                  {cfg.label}
                  <span className="font-bold font-mono">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Role view tabs */}
        <div className="bg-white border border-carbon-gray-20">
          <div className="flex items-stretch overflow-x-auto border-b border-carbon-gray-20">
            {ROLE_VIEWS.map((rv) => (
              <button
                key={rv.key}
                onClick={() => setRoleView(rv.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  roleView === rv.key
                    ? 'border-b-[#0043ce] text-[#0043ce] bg-[#edf5ff]'
                    : 'border-b-transparent text-carbon-gray-70 hover:bg-carbon-gray-10'
                }`}
              >
                <Icon
                  name={rv.icon as any}
                  size={14}
                  className={roleView === rv.key ? 'text-[#0043ce]' : rv.color}
                />
                {rv.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap border-b border-carbon-gray-20">
            <input
              type="text"
              placeholder="Search patient, task, provider…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-carbon-gray-30 text-xs px-3 py-1.5 w-52 focus:outline-none focus:border-[#0043ce]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border border-carbon-gray-30 text-xs px-3 py-1.5 focus:outline-none focus:border-[#0043ce] bg-white"
            >
              <option value="All">All Statuses</option>
              {(
                ['requested', 'accepted', 'in-progress', 'completed', 'rejected'] as TaskStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="border border-carbon-gray-30 text-xs px-3 py-1.5 focus:outline-none focus:border-[#0043ce] bg-white"
            >
              <option value="All">All Priorities</option>
              {(['stat', 'asap', 'urgent', 'routine'] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
            {(statusFilter !== 'All' ||
              priorityFilter !== 'All' ||
              programFilter !== 'All' ||
              searchQuery) && (
              <button
                onClick={() => {
                  setStatusFilter('All');
                  setPriorityFilter('All');
                  setProgramFilter('All');
                  setSearchQuery('');
                }}
                className="text-xs text-[#0043ce] hover:underline"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-carbon-gray-50">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Task list */}
          <div className="p-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-carbon-gray-50">
                <Icon name="InboxIcon" size={32} className="mb-3 text-carbon-gray-30" />
                <p className="text-sm font-medium">No tasks match current filters</p>
                <p className="text-xs mt-1">Try adjusting the role view or filters above</p>
              </div>
            ) : (
              filtered.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={(t) => setEvidenceTask(t)}
                  onOpenThread={(t) => setThreadTask(t)}
                  onAssign={(t) => setAssignTask(t)}
                />
              ))
            )}
          </div>
        </div>

        {/* FHIR Task pipeline status */}
        <div className="bg-white border border-carbon-gray-20 px-5 py-4">
          <h3 className="text-sm font-semibold text-carbon-gray-100 mb-3 flex items-center gap-2">
            <Icon name="ArrowsRightLeftIcon" size={15} className="text-[#0043ce]" />
            Task Status Pipeline — Closed-Loop View
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {(
              ['requested', 'accepted', 'in-progress', 'completed', 'rejected'] as TaskStatus[]
            ).map((status) => {
              const count = CARE_TEAM_INBOX_TASKS.filter((t) => t.status === status).length;
              const cfg = TASK_STATUS_CONFIG[status];
              return (
                <div key={status} className={`p-3 border text-center ${cfg.bg}`}>
                  <p className={`text-xl font-bold font-mono ${cfg.color}`}>{count}</p>
                  <p className={`text-2xs font-medium mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-carbon-gray-50">
            <Icon name="InformationCircleIcon" size={13} />
            Tasks transition: requested → accepted → in-progress → completed. Evidence attached on
            completion closes the loop.
          </div>
        </div>
      </div>

      {/* Modals */}
      {evidenceTask && <EvidenceModal task={evidenceTask} onClose={() => setEvidenceTask(null)} />}
      {threadTask && <MessageThreadPanel task={threadTask} onClose={() => setThreadTask(null)} />}
      {assignTask && (
        <TaskAssignmentPanel
          task={assignTask}
          onClose={() => setAssignTask(null)}
          onReassigned={handleReassigned}
        />
      )}
      {showCarePlan && (
        <CarePlanEditPanel
          patientName={activePatient?.name ?? 'Active Patient'}
          patientId={activePatient?.platformId ?? activePatientId}
          onClose={() => setShowCarePlan(false)}
        />
      )}
    </AppLayout>
  );
}
