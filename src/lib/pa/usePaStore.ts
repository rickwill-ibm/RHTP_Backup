/**
 * Central Zustand store for the PA workflow.
 * Ported from PA-Standalone-SmartApp; SmartContext dependency removed.
 * Patient context is pre-populated from RHTP's useAppContext (activePatientId).
 */
'use client';

import { create } from 'zustand';
import type {
  CrdResultEntry,
  DtrResultEntry,
  DtrGroup,
  PaCase,
  PaOrder,
  PatientBanner,
  SubmissionChannel,
  PaStatus,
} from '@/lib/pa/pa-types';
import {
  buildCdexDocumentReference,
  summarizeDocumentReference,
  type UploadedFileMeta,
} from '@/lib/pa/cdexDocumentReference';
import { getPatientContextByMemberId } from '@/lib/pa/patientContext';

export type AppView = 'order' | 'checklist' | 'dtr' | 'review' | 'portal' | 'case';

interface PaStore {
  // Navigation
  view: AppView;
  setView: (v: AppView) => void;
  patientRecordOpen: boolean;
  openPatientRecord: () => void;
  closePatientRecord: () => void;

  // Order
  order: PaOrder | null;
  patient: PatientBanner | null;
  patientLoading: boolean;
  patientError: string | null;
  setOrder: (o: PaOrder) => void;
  setPatient: (p: PatientBanner) => void;
  setPatientLoading: (v: boolean) => void;
  setPatientError: (e: string | null) => void;

  // CRD
  crdLoading: boolean;
  crdResults: CrdResultEntry[] | null;
  crdError: string | null;
  setCrdLoading: (v: boolean) => void;
  setCrdResults: (r: CrdResultEntry[]) => void;
  setCrdError: (e: string) => void;

  // DTR
  dtrLoading: boolean;
  dtrResults: DtrResultEntry[] | null;
  dtrError: string | null;
  setDtrLoading: (v: boolean) => void;
  setDtrResults: (r: DtrResultEntry[]) => void;
  setDtrError: (e: string) => void;
  resolveDtrGap: (cptCode: string, groupId: number, file: UploadedFileMeta) => void;

  // Submission
  channel: SubmissionChannel;
  setChannel: (c: SubmissionChannel) => void;
  submitLoading: boolean;
  setSubmitLoading: (v: boolean) => void;
  submittedCase: PaCase | null;
  setSubmittedCase: (c: PaCase) => void;

  // PA Portal
  cases: PaCase[];
  addCase: (c: PaCase) => void;
  updateCaseStatus: (authId: string, status: PaStatus) => void;
  activePortalTab: string;
  setActivePortalTab: (t: string) => void;

  // Case Detail
  activeCaseId: string | null;
  setActiveCaseId: (id: string) => void;
  activeCaseTab: string;
  setActiveCaseTab: (t: string) => void;

  // Reset
  resetWorkflow: () => void;
}

// ── Seed mock cases ───────────────────────────────────────────────────────────

const MOCK_CASES: PaCase[] = [
  {
    authId: 'AUTH-88213',
    patient: 'Priya Natarajan',
    memberId: '5518820',
    service: 'CT Angiography, Chest',
    cpt: '71275',
    dateRequested: '07/28/2026',
    channel: 'FHIR',
    status: 'Approved',
    checklist: [
      { label: 'Patient Enrolled', detail: 'Active coverage verified', pass: true, source: 'pa' },
      { label: 'Patient Eligible', detail: 'Eligibility confirmed', pass: true, source: 'pa' },
      { label: 'Provider In-Network', detail: 'Confirmed in-network', pass: true, source: 'emr' },
      { label: 'Prior Authorization Required', detail: 'YES', pass: true, source: null },
    ],
    dtr: [
      {
        title: 'Clinical Indication Documented',
        status: 'met',
        evidence: 'Suspected PE, D-dimer elevated 07/20/2026',
        source: 'emr',
      },
      {
        title: 'Conservative Imaging Attempted First',
        status: 'met',
        evidence: 'Chest X-ray non-diagnostic 07/19/2026',
        source: 'emr',
      },
      {
        title: 'Ordering Specialty Match',
        status: 'met',
        evidence: 'Ordered by pulmonology',
        source: 'pa',
      },
    ],
    submission: {
      channel: 'fhir',
      paNumber: 'AUTH-88213',
      payloadType: 'FHIR PAS Bundle (Claim/$submit)',
      timestamp: '07/28/2026 9:14 AM',
      payerEndpoint: 'https://payer-fhir.example-payer.com/R4/Claim/$submit',
    },
    timeline: [
      { status: 'Submitted', ts: '07/28/2026 9:14 AM', color: 'blue' },
      { status: 'Pended', ts: '07/28/2026 9:15 AM', color: 'amber' },
      { status: 'Approved', ts: '07/29/2026 2:03 PM', color: 'green' },
    ],
  },
  {
    authId: 'AUTH-88190',
    patient: 'Marcus Bell',
    memberId: '4471902',
    service: 'MRI Lumbar Spine w/o Contrast',
    cpt: '72148',
    dateRequested: '07/21/2026',
    channel: 'EDI',
    status: 'Pended',
    checklist: [
      { label: 'Patient Enrolled', detail: 'Active coverage verified', pass: true, source: 'pa' },
      { label: 'Patient Eligible', detail: 'Eligibility confirmed', pass: true, source: 'pa' },
      { label: 'Provider In-Network', detail: 'Confirmed in-network', pass: true, source: 'emr' },
      { label: 'Prior Authorization Required', detail: 'YES', pass: true, source: null },
    ],
    dtr: [
      {
        title: '6 Weeks Conservative Therapy',
        status: 'met',
        evidence: 'PT notes on file 05/02–06/18/2026',
        source: 'emr',
      },
      {
        title: 'Neurological Deficit or Red Flag',
        status: 'attached',
        evidence: 'Neuro exam note attached 07/21/2026 — pending payer review',
        source: 'upload',
      },
    ],
    submission: {
      channel: 'edi',
      paNumber: 'AUTH-88190',
      payloadType: 'X12 275/278 (EDI)',
      timestamp: '07/21/2026 8:02 AM',
      payerEndpoint: 'Clearinghouse: Availity → Payer EDI Gateway (275/278)',
    },
    timeline: [
      { status: 'Submitted', ts: '07/21/2026 8:02 AM', color: 'blue' },
      { status: 'Pended', ts: '07/21/2026 8:10 AM', color: 'amber' },
    ],
  },
  {
    authId: 'AUTH-88175',
    patient: 'Wanda Brooks',
    memberId: '3390117',
    service: 'Total Knee Arthroplasty',
    cpt: '27447',
    dateRequested: '07/10/2026',
    channel: 'FHIR',
    status: 'Partially Approved / Modified',
    checklist: [
      { label: 'Patient Enrolled', detail: 'Active coverage verified', pass: true, source: 'pa' },
      { label: 'Patient Eligible', detail: 'Eligibility confirmed', pass: true, source: 'pa' },
      { label: 'Provider In-Network', detail: 'Confirmed in-network', pass: true, source: 'emr' },
      { label: 'Prior Authorization Required', detail: 'YES', pass: true, source: null },
    ],
    dtr: [
      {
        title: 'Radiographic Evidence of Joint Damage',
        status: 'met',
        evidence: 'Kellgren-Lawrence Grade 3, X-ray 06/28/2026',
        source: 'emr',
      },
      {
        title: 'Failed Conservative Treatment ≥ 3 Months',
        status: 'met',
        evidence: 'NSAIDs + PT 03/2026–06/2026',
        source: 'emr',
      },
      {
        title: 'Post-Acute Setting Requested',
        status: 'met',
        evidence: 'Inpatient rehab requested; approved for outpatient PT instead',
        source: 'pa',
      },
    ],
    submission: {
      channel: 'fhir',
      paNumber: 'AUTH-88175',
      payloadType: 'FHIR PAS Bundle (Claim/$submit)',
      timestamp: '07/10/2026 10:22 AM',
      payerEndpoint: 'https://payer-fhir.example-payer.com/R4/Claim/$submit',
    },
    timeline: [
      { status: 'Submitted', ts: '07/10/2026 10:22 AM', color: 'blue' },
      { status: 'Pended', ts: '07/10/2026 10:40 AM', color: 'amber' },
      { status: 'Partially Approved / Modified', ts: '07/12/2026 11:15 AM', color: 'teal' },
    ],
  },
  {
    authId: 'AUTH-88150',
    patient: 'Thomas Okafor',
    memberId: '2287744',
    service: 'Outpatient Sleep Study',
    cpt: '95810',
    dateRequested: '07/02/2026',
    channel: 'EDI',
    status: 'Denied',
    checklist: [
      { label: 'Patient Enrolled', detail: 'Active coverage verified', pass: true, source: 'pa' },
      { label: 'Patient Eligible', detail: 'Eligibility confirmed', pass: true, source: 'pa' },
      { label: 'Provider In-Network', detail: 'Confirmed in-network', pass: true, source: 'emr' },
      { label: 'Prior Authorization Required', detail: 'YES', pass: true, source: null },
    ],
    dtr: [
      {
        title: 'Epworth Sleepiness Scale ≥ 10',
        status: 'gap',
        evidence: 'Score of 6 — below threshold',
        source: 'emr',
      },
      {
        title: 'Home Sleep Test Attempted First',
        status: 'gap',
        evidence: 'No home sleep test on record',
        source: null,
      },
    ],
    submission: {
      channel: 'edi',
      paNumber: 'AUTH-88150',
      payloadType: 'X12 275/278 (EDI)',
      timestamp: '07/02/2026 1:05 PM',
      payerEndpoint: 'Clearinghouse: Availity → Payer EDI Gateway (275/278)',
    },
    timeline: [
      { status: 'Submitted', ts: '07/02/2026 1:05 PM', color: 'blue' },
      { status: 'Pended', ts: '07/02/2026 1:20 PM', color: 'amber' },
      { status: 'Denied', ts: '07/03/2026 9:47 AM', color: 'red' },
    ],
  },
];

export const usePaStore = create<PaStore>((set, get) => ({
  // Navigation
  view: 'order',
  setView: (v) => set({ view: v }),
  patientRecordOpen: false,
  openPatientRecord: () => set({ patientRecordOpen: true }),
  closePatientRecord: () => set({ patientRecordOpen: false }),

  // Order
  order: null,
  patient: null,
  patientLoading: false,
  patientError: null,
  setOrder: (o) => set({ order: o }),
  setPatient: (p) => set({ patient: p, patientError: null }),
  setPatientLoading: (v) => set({ patientLoading: v }),
  setPatientError: (e) => set({ patientError: e, patientLoading: false }),

  // CRD
  crdLoading: false,
  crdResults: null,
  crdError: null,
  setCrdLoading: (v) => set({ crdLoading: v }),
  setCrdResults: (r) => set({ crdResults: r, crdError: null }),
  setCrdError: (e) => set({ crdError: e, crdLoading: false }),

  // DTR
  dtrLoading: false,
  dtrResults: null,
  dtrError: null,
  setDtrLoading: (v) => set({ dtrLoading: v }),
  setDtrResults: (r) => set({ dtrResults: r, dtrError: null }),
  setDtrError: (e) => set({ dtrError: e, dtrLoading: false }),
  resolveDtrGap: (cptCode, groupId, file) =>
    set((s) => {
      if (!s.dtrResults) return {};
      const dtrResults = s.dtrResults.map((dtr) => {
        if (dtr.cptCode !== cptCode) return dtr;
        const groups: DtrGroup[] = dtr.groups.map((g) => {
          if (g.id !== groupId) return g;
          const ctx = s.patient ? getPatientContextByMemberId(s.patient.memberId) : undefined;
          const documentReference = buildCdexDocumentReference(file, {
            patientId: ctx?.patientId ?? s.patient?.memberId ?? 'unknown',
            groupId: g.id,
            groupTitle: g.title,
          });
          // An upload does NOT satisfy the coded criterion (M1/E1): it marks the gap ATTACHED —
          // pending payer review. `status: 'pending'` + a DocumentReference = resolved for SUBMISSION
          // (see dtrReadiness.isGroupResolved), but never rendered or reported as "Met".
          return {
            ...g,
            status: 'pending' as const,
            uploadedDocumentReference: documentReference,
            uploadedEvidence: summarizeDocumentReference(documentReference),
          };
        });
        // allMet stays STRICT (every group actually met); attachments don't flip it to true.
        return { ...dtr, groups, allMet: groups.every((g) => g.status === 'met') };
      });
      return { dtrResults };
    }),

  // Submission
  channel: 'fhir',
  setChannel: (c) => set({ channel: c }),
  submitLoading: false,
  setSubmitLoading: (v) => set({ submitLoading: v }),
  submittedCase: null,
  setSubmittedCase: (c) =>
    set((s) => ({
      submittedCase: c,
      cases: [c, ...s.cases.filter((x) => x.authId !== c.authId)],
    })),

  // PA Portal
  cases: MOCK_CASES,
  addCase: (c) => set((s) => ({ cases: [c, ...s.cases.filter((x) => x.authId !== c.authId)] })),
  updateCaseStatus: (authId, status) =>
    set((s) => ({ cases: s.cases.map((c) => (c.authId === authId ? { ...c, status } : c)) })),
  activePortalTab: 'All',
  setActivePortalTab: (t) => set({ activePortalTab: t }),

  // Case Detail
  activeCaseId: 'AUTH-88213',
  setActiveCaseId: (id) => set({ activeCaseId: id }),
  activeCaseTab: 'checklist',
  setActiveCaseTab: (t) => set({ activeCaseTab: t }),

  // Reset
  resetWorkflow: () =>
    set({
      view: 'order',
      order: null,
      patientLoading: false,
      patientError: null,
      crdLoading: false,
      crdResults: null,
      crdError: null,
      dtrLoading: false,
      dtrResults: null,
      dtrError: null,
      channel: 'fhir',
      submitLoading: false,
      submittedCase: null,
    }),
}));
