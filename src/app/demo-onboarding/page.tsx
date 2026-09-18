'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TooltipDef {
  id: string;
  label: string;
  body: string;
  anchor: 'top' | 'bottom' | 'left' | 'right';
}

interface DemoScreen {
  route: string;
  label: string;
  storyBeat: string;
}

interface Persona {
  id: string;
  role: string;
  title: string;
  question: string;
  color: string;
  bgLight: string;
  textColor: string;
  icon: string;
  initials: string;
  sidebarGroup: string;
  screens: DemoScreen[];
  sampleData: { label: string; value: string; highlight?: boolean }[];
  tooltips: TooltipDef[];
  keyInsight: string;
  handoffTo: string | null;
  timing: { full: number; half: number; quick: number };
}

// ─── Demo Track Step ──────────────────────────────────────────────────────────
interface DemoTrackStep {
  personaIndex: number;
  screenIndex: number;
  personaTitle: string;
  personaRole: string;
  personaInitials: string;
  personaColor: string;
  personaBgLight: string;
  personaTextColor: string;
  screenLabel: string;
  screenRoute: string;
  storyBeat: string;
  talkingPoints: string[];
  transitionNote: string | null;
}

// ─── 8-Persona Data ───────────────────────────────────────────────────────────
const PERSONAS: Persona[] = [
  {
    id: 'state-executive',
    role: 'Persona 1',
    title: 'State Medicaid Executive',
    question:
      '"What is this program delivering across clinical, BH, and social domains — and is it worth the investment?"',
    color: '#0043ce',
    bgLight: '#d0e2ff',
    textColor: '#001d6c',
    icon: 'BuildingOffice2Icon',
    initials: 'SE',
    sidebarGroup: 'RHTP Program',
    screens: [
      {
        route: '/contract-program-selection',
        label: 'RHTP Overview',
        storyBeat:
          'All-program view — Clinical / BH / Social program-type filter with multi-domain KPI strip',
      },
      {
        route: '/region-view',
        label: 'Regions',
        storyBeat:
          'Regional rollup — Clinical gap closure + Social screening rate + BH access rate benchmarked side-by-side',
      },
      {
        route: '/executive-outcomes-dashboard',
        label: 'Executive Dashboard',
        storyBeat:
          'Whole-person outcomes — care gaps closed, gain share earned, quality score improvement',
      },
      {
        route: '/financial-dashboard',
        label: 'Financial Dashboard (Braided Funding)',
        storyBeat:
          'Dollar story — shared savings model, braided funding streams, incentive realization',
      },
      {
        route: '/social-needs-dashboard',
        label: 'Social Needs Dashboard',
        storyBeat:
          'Social ROI — screening funnel, dual-need cohort, population-level social burden',
      },
      {
        route: '/outcomes-linkage',
        label: 'Outcomes Linkage',
        storyBeat: 'Housing → ED reduction, food → A1C — social-to-clinical ROI proof',
      },
    ],
    sampleData: [
      { label: 'Program Counties', value: '47 of 114', highlight: false },
      { label: 'Attributed Lives', value: '128,400', highlight: true },
      { label: 'Shared Savings YTD', value: '$4.2M', highlight: true },
      { label: 'Social Screening Rate', value: '61.2%', highlight: false },
      { label: 'BH Access Rate', value: '64.8%', highlight: false },
      { label: 'Quality Score Δ', value: '+8.3 pts', highlight: true },
    ],
    tooltips: [
      {
        id: 'tt-se-1',
        label: 'Multi-Domain KPI Strip',
        body: 'The RHTP Overview shows program-type filtered KPIs. Selecting "All Programs" shows Clinical gap closure, Social screening rate, and BH access rate side-by-side — giving the state executive a single-screen whole-person accountability view.',
        anchor: 'bottom',
      },
      {
        id: 'tt-se-2',
        label: 'Braided Funding',
        body: 'The Financial Dashboard shows how Medicaid capitation, FQHC grants, and social program funding are braided into a single payment model. Each funding stream is tracked separately for compliance while shared savings flow to the whole-person care team.',
        anchor: 'bottom',
      },
      {
        id: 'tt-se-3',
        label: 'Social-to-Clinical ROI',
        body: 'The Outcomes Linkage screen quantifies the clinical cost avoidance from social interventions: housing stability → 34% ED reduction, food security → A1C improvement. This is the financial proof point for continued social program investment.',
        anchor: 'top',
      },
    ],
    keyInsight:
      'The program delivers $4.2M in shared savings across 128,400 lives — with Clinical, BH, and Social programs all tracked in a single hierarchy from state to patient.',
    handoffTo: 'Network / Population Health Director',
    timing: { full: 12, half: 8, quick: 4 },
  },
  {
    id: 'network-director',
    role: 'Persona 2',
    title: 'Network / Population Health Director',
    question:
      '"How are my program networks and care team members performing across all three program types?"',
    color: '#6929c4',
    bgLight: '#f6f2ff',
    textColor: '#31135e',
    icon: 'MapPinIcon',
    initials: 'ND',
    sidebarGroup: 'RHTP Program',
    screens: [
      {
        route: '/provider-level',
        label: 'Program Networks',
        storyBeat:
          'Clinical / BH / CBO network tabs — org-level performance with domain-appropriate metrics per tab',
      },
      {
        route: '/physician-view',
        label: 'Care Team Members',
        storyBeat:
          'PCPs + BH counselors + CHW supervisors — role-typed metrics, not just physician gap closure',
      },
      {
        route: '/stars-hedis-mips',
        label: 'Quality Gaps & Attribution',
        storyBeat:
          'Clinical + BH + Social program quality measures — five tabs, one accountability framework',
      },
    ],
    sampleData: [
      { label: 'Active Regions', value: '4 Regions', highlight: false },
      { label: 'Top Region (Clinical)', value: 'West River — 73% gap closure', highlight: true },
      { label: 'At-Risk Region (BH)', value: 'Northeast SD — 49% BH access', highlight: false },
      { label: 'Program Networks', value: '16 Orgs (Clinical + BH + CBO)', highlight: true },
      { label: 'Care Team Members', value: 'PCPs + BH + CHW', highlight: false },
      { label: 'Quality Measures', value: 'Clinical + BH + Social', highlight: true },
    ],
    tooltips: [
      {
        id: 'tt-nd-1',
        label: 'Program Networks (renamed)',
        body: 'Program Networks replaces "Network Level" with three tabs: Clinical Network (FQHCs, hospitals, PCPs), BH Network (counseling centers, crisis orgs), and CBO Network (housing navigators, food banks). Each tab shows domain-appropriate metrics.',
        anchor: 'bottom',
      },
      {
        id: 'tt-nd-2',
        label: 'Care Team Members (renamed)',
        body: 'Care Team Members expands the old physician view to include BH Counselors (BH access rate, FUH/FUM) and CHW Supervisors (home visits, enrollment rate, screening rate) — all at the same NPI-equivalent accountability level.',
        anchor: 'bottom',
      },
      {
        id: 'tt-nd-3',
        label: 'Quality & Compliance (renamed)',
        body: 'Quality & Compliance replaces "STARS/HEDIS/MIPS" with five program tabs: STARS (payer bonus), HEDIS (clinical measures), MIPS (payment adjustment), BH Quality (FUH/FUM/AMM/SAA), and Social Programs (PRAPARE/SNAP/Housing/CHW).',
        anchor: 'top',
      },
    ],
    keyInsight:
      'The hierarchy now shows Clinical, BH, and Social programs as co-equal accountability chains — from state → region → program network → care team member → patient.',
    handoffTo: 'Primary Care Physician',
    timing: { full: 8, half: 5, quick: 3 },
  },
  {
    id: 'physician',
    role: 'Persona 3',
    title: 'Primary Care Physician',
    question:
      '"What do I need to act on for my patients today — and who else on the care team is accountable?"',
    color: '#007d79',
    bgLight: '#d9fbfb',
    textColor: '#004144',
    icon: 'UserIcon',
    initials: 'MD',
    sidebarGroup: 'Clinical',
    screens: [
      {
        route: '/md-smart-launch',
        label: 'MD Smart Launch',
        storyBeat: 'SMART on FHIR entry — platform ownership clear, embedded in EMR workflow',
      },
      {
        route: '/panel-cohort-view',
        label: 'Panel & Cohort (Medicaid RHTP Track 3)',
        storyBeat:
          'Attributed panel — three-column attribution: Clinical PCP / Assigned CHW / BH Provider per patient row',
      },
      {
        route: '/patient-detail',
        label: 'Patient Detail — Whole Person Care Plan',
        storyBeat:
          'Individual patient — AI care plan, explainability, Whole Person Care Plan tab, gain-share attribution per gap',
      },
    ],
    sampleData: [
      { label: 'Attributed Panel', value: '847 Patients', highlight: false },
      { label: 'High Risk (Tier 1)', value: '94 Patients', highlight: true },
      { label: 'Open Care Gaps', value: '312 Gaps', highlight: false },
      { label: 'Patients with CHW', value: '284 Assigned', highlight: true },
      { label: 'Patients with BH', value: '198 Enrolled', highlight: false },
      { label: 'Gain-Share Eligible', value: '$18,400', highlight: true },
    ],
    tooltips: [
      {
        id: 'tt-md-1',
        label: 'Three-Column Attribution',
        body: 'Each patient row in Panel & Cohort shows three attribution columns: 🩺 Clinical PCP (claims-based), 🤝 Assigned CHW (social program assignment), and 🧠 BH Provider (behavioral health enrollment). The physician sees the full accountability picture at a glance.',
        anchor: 'bottom',
      },
      {
        id: 'tt-md-2',
        label: 'Whole Person Care Plan Tab',
        body: 'The Patient Detail screen now has a Whole Person Care Plan tab showing clinical, BH, and social care plan goals in a single view — with status, responsible team member, and last update for each goal domain.',
        anchor: 'bottom',
      },
      {
        id: 'tt-md-3',
        label: 'Gain-Share Per Gap',
        body: "Each open care gap shows the physician's attributed gain-share value if closed this measurement year. The $18,400 represents the total opportunity across the panel — visible at the patient level.",
        anchor: 'top',
      },
    ],
    keyInsight:
      'Dr. Whitfield sees not just his 847 attributed patients, but which patients have an assigned CHW and BH provider — enabling coordinated whole-person care from a single panel view.',
    handoffTo: 'Care Manager',
    timing: { full: 8, half: 5, quick: 3 },
  },
  {
    id: 'care-manager',
    role: 'Persona 4',
    title: 'Care Manager',
    question:
      '"Who needs me today — and where are patients in their clinical episodes and whole-person care plans?"',
    color: '#da1e28',
    bgLight: '#fff1f1',
    textColor: '#750e13',
    icon: 'ClipboardDocumentListIcon',
    initials: 'CM',
    sidebarGroup: 'Care Management',
    screens: [
      {
        route: '/care-manager',
        label: 'Care Manager Worklist',
        storyBeat:
          'Smart priority queue — Clinical/BH/Social program filter, BH risk flags, CHW assignment, social needs status per row',
      },
      {
        route: '/patient-episode-summary',
        label: 'Patient Episode Summary',
        storyBeat: 'All episodes for a patient — active vs historical, cost vs target',
      },
      {
        route: '/episode-detail',
        label: 'Episode Detail',
        storyBeat: 'Episode deep-dive — care setting timeline, quality metrics, claim events',
      },
      {
        route: '/episodic-management-analytics',
        label: 'Episodic Analytics',
        storyBeat:
          'Portfolio view — Clinical + BH Episodes + Social Program Outcomes tabs; Medicaid RHTP Track 3',
      },
    ],
    sampleData: [
      { label: 'Assigned Patients', value: '156 Patients', highlight: false },
      { label: "Today's Priority Queue", value: '12 Patients', highlight: true },
      { label: 'ADT Alerts (New)', value: '4 Alerts', highlight: true },
      { label: 'Active Episodes', value: '38 Episodes', highlight: false },
      { label: 'BH Risk Flags', value: '9 Patients', highlight: false },
      { label: 'Social Needs Open', value: '14 Patients', highlight: true },
    ],
    tooltips: [
      {
        id: 'tt-cm-1',
        label: 'Clinical/BH/Social Filter',
        body: 'The worklist now has a program-type filter bar: Clinical / BH / Social / All. Each filter shows patient counts and surfaces domain-appropriate columns — BH Risk (condition, FUH/FUM status) and Social Needs (screening status, CHW assigned, SNAP status) appear alongside clinical episode data.',
        anchor: 'bottom',
      },
      {
        id: 'tt-cm-2',
        label: 'BH Episodes Tab',
        body: 'Episodic Analytics now has a BH Episodes tab showing HEDIS BH scorecard: FUH (Follow-Up After Hospitalization), FUM (Follow-Up After ED), AMM (Antidepressant Medication Management), IET (Initiation & Engagement of SUD Treatment), and CDF (Cardiovascular Monitoring for Patients with Schizophrenia).',
        anchor: 'bottom',
      },
      {
        id: 'tt-cm-3',
        label: 'Social Program Outcomes Tab',
        body: 'Episodic Analytics also has a Social Program Outcomes tab showing SNAP/Housing/LIHEAP/CHW/BH engagement completion rates, an SDOH cost impact line chart, and a cost avoidance summary — quantifying the social program ROI at the care manager portfolio level.',
        anchor: 'top',
      },
    ],
    keyInsight:
      "Angela Torres has 12 patients in today's priority queue, 4 new ADT alerts, 9 BH risk flags, and 14 open social needs — all visible in a single filtered worklist view.",
    handoffTo: 'Community Health Worker',
    timing: { full: 10, half: 6, quick: 3 },
  },
  {
    id: 'chw',
    role: 'Persona 5',
    title: 'Community Health Worker',
    question: '"Which patients need a home visit, and what social programs can I connect them to?"',
    color: '#198038',
    bgLight: '#defbe6',
    textColor: '#044317',
    icon: 'HomeIcon',
    initials: 'CW',
    sidebarGroup: 'Whole Person Care',
    screens: [
      {
        route: '/chw-workflow',
        label: 'CHW Workflow',
        storyBeat:
          'Home Visit Schedule — Start Visit (checklist + notes), Clinical context panel, Reschedule modal; Outreach Log; Resource Navigation',
      },
      {
        route: '/social-needs-screening',
        label: 'Social Needs Screening',
        storyBeat:
          'PRAPARE screening → social Task creation — feeds Quality & Compliance screening rate',
      },
      {
        route: '/program-eligibility',
        label: 'Program Eligibility',
        storyBeat: 'Eligible programs from screening results — SNAP, housing, food, transport',
      },
      {
        route: '/benefit-enrollment',
        label: 'Benefit Enrollment',
        storyBeat: 'SNAP enrolled, housing pending, gaps flagged — feeds enrollment rate metric',
      },
    ],
    sampleData: [
      { label: 'Assigned Patients', value: '198 Patients', highlight: false },
      { label: 'Home Visits (YTD)', value: '142 Visits', highlight: true },
      { label: 'PRAPARE Screenings', value: '91% Rate', highlight: true },
      { label: 'Benefit Enrollment Rate', value: '76%', highlight: false },
      { label: 'Dual-Need Patients', value: '48 Patients', highlight: true },
      { label: 'Start Visit Actions', value: 'Checklist + Notes', highlight: false },
    ],
    tooltips: [
      {
        id: 'tt-chw-1',
        label: 'Start Visit Workflow',
        body: 'The Start Visit button opens a visit checklist (home safety, medication review, vitals, SDOH screening, care plan goals, referral confirmation) plus a free-text notes field. Completing the visit logs it to the outreach record and notifies the care manager.',
        anchor: 'bottom',
      },
      {
        id: 'tt-chw-2',
        label: 'Reschedule Modal',
        body: 'The Reschedule button opens a date/time picker with a required reason dropdown (patient request, CHW conflict, not home, transportation, medical conflict, weather/safety, other). The rescheduled visit updates the visit schedule and sends a notification.',
        anchor: 'bottom',
      },
      {
        id: 'tt-chw-3',
        label: 'Screening Rate → Quality & Compliance',
        body: "Every PRAPARE screening completed by a CHW feeds the Social Programs tab in Quality & Compliance. The CHW's 91% screening rate directly contributes to the PRAPARE measure completion rate tracked at the program level.",
        anchor: 'top',
      },
    ],
    keyInsight:
      'The CHW workflow now has fully functional action buttons — Start Visit (checklist + notes), Clinical (episode context panel), and Reschedule (date/time + reason) — making the home visit schedule a live workflow tool.',
    handoffTo: 'BH & Crisis Specialist',
    timing: { full: 10, half: 6, quick: 3 },
  },
  {
    id: 'bh-crisis',
    role: 'Persona 6',
    title: 'BH & Crisis Specialist',
    question:
      '"How do I dispatch the right crisis response and ensure the patient gets connected to ongoing BH care?"',
    color: '#9f1853',
    bgLight: '#fff0f7',
    textColor: '#740937',
    icon: 'ExclamationTriangleIcon',
    initials: 'BH',
    sidebarGroup: 'Whole Person Care + Care Management',
    screens: [
      {
        route: '/crisis-pathway',
        label: 'Crisis Pathway',
        storyBeat:
          'Active crisis events — SDOH context panel per patient, dispatch (988/CSU/Mobile/ED), post-crisis care plan linkage',
      },
      {
        route: '/crisis-pathway',
        label: 'Patient Pathway — Dorothy Simmons',
        storyBeat:
          'PRAPARE screening → SNAP enrollment → 12-week BH engagement → A1C 9.2% → 7.1% — the connected story',
      },
      {
        route: '/cbo-directory',
        label: 'CBO Directory',
        storyBeat: 'Community org network — domain-tagged, capacity status, linked patients',
      },
    ],
    sampleData: [
      { label: 'Active Crisis Events', value: '3 Events', highlight: true },
      { label: 'ED Diversions (30d)', value: '8 Diversions', highlight: true },
      { label: 'SDOH Context Panels', value: 'Per Patient', highlight: false },
      { label: 'Post-Crisis BH Tasks', value: '5 Open', highlight: false },
      { label: 'Patient Pathway', value: 'Dorothy Simmons', highlight: true },
      { label: 'A1C Improvement', value: '9.2% → 7.1%', highlight: true },
    ],
    tooltips: [
      {
        id: 'tt-bh-1',
        label: 'SDOH Context Panel',
        body: 'Each crisis patient has an SDOH Context slide-out showing housing/food/safety risk, active social needs, CHW/CBO enrollments, crisis history, and a care manager note. This gives the crisis dispatcher the social context needed for the right dispatch decision.',
        anchor: 'bottom',
      },
      {
        id: 'tt-bh-2',
        label: 'Patient Pathway (Dorothy Simmons)',
        body: "The Patient Pathway panel shows Dorothy Simmons' 4-stage journey: PRAPARE Screening (food insecurity, A1C 9.2%) → SNAP Enrollment at Tri-County Food Bank ($234/mo) → 12-Week BH Engagement + 8 CHW home visits (94% med adherence) → A1C improvement 9.2% → 7.1%. This is the single most compelling connected story in the platform.",
        anchor: 'bottom',
      },
      {
        id: 'tt-bh-3',
        label: 'Post-Crisis Care Plan Linkage',
        body: "After a crisis dispatch, the Crisis Pathway creates a BH follow-up task linked to the patient's care manager worklist. The care manager sees the crisis event, the dispatch type, and the BH task status — closing the loop between crisis response and ongoing care management.",
        anchor: 'top',
      },
    ],
    keyInsight:
      'The Crisis Pathway is the BH anchor screen — SDOH context per patient, 988/CSU/Mobile/ED dispatch, post-crisis care plan linkage, and the Dorothy Simmons Patient Pathway showing the full social → clinical improvement arc.',
    handoffTo: 'Specialist / Care Team',
    timing: { full: 10, half: 6, quick: 3 },
  },
  {
    id: 'specialist',
    role: 'Persona 7',
    title: 'Specialist / Care Team',
    question:
      '"What\'s been sent to me and why does it matter for this patient\'s whole-person care?"',
    color: '#f1620a',
    bgLight: '#fff2e8',
    textColor: '#8a3800',
    icon: 'InboxIcon',
    initials: 'SP',
    sidebarGroup: 'Clinical + Network',
    screens: [
      {
        route: '/care-team-inbox',
        label: 'Care Team Inbox',
        storyBeat: 'Universal task inbox — clinical, BH, and social program tasks in one view',
      },
      {
        route: '/specialist-inbox',
        label: 'Specialist Inbox',
        storyBeat: 'Assigned tasks — intervention, gain-share value, quality measure impact',
      },
      {
        route: '/referral-tracking',
        label: 'Referral Tracking',
        storyBeat: 'Referrals in flight — status, referring provider, due dates',
      },
      {
        route: '/referral-journey-tracker',
        label: 'Referral Journey Tracker',
        storyBeat: 'End-to-end referral journey — 7 stages, timestamps, responsible party',
      },
    ],
    sampleData: [
      { label: 'Pending Tasks', value: '3 Tasks', highlight: true },
      { label: 'Urgent / STAT', value: '2 Patients', highlight: true },
      { label: 'Total Gain-Share Value', value: '$487', highlight: false },
      { label: 'Quality Measures Impacted', value: 'CBP, CDC, COL', highlight: false },
      { label: 'Referrals In Flight', value: '11 Referrals', highlight: false },
      { label: 'Avg Referral Age', value: '6.2 Days', highlight: false },
    ],
    tooltips: [
      {
        id: 'tt-sp-1',
        label: 'Gain-Share Attribution',
        body: 'Each specialist task shows the gain-share value attributed to the referring physician if the intervention closes the associated HEDIS measure. This creates a shared financial incentive between PCP and specialist.',
        anchor: 'bottom',
      },
      {
        id: 'tt-sp-2',
        label: 'Quality Measure Impact',
        body: "The inbox links each task to the specific HEDIS or STARS measure it closes. Dorothy Simmons' cardiology evaluation closes CBP-236 (Controlling Hypertension) — worth $195 in gain-share to the referring PCP.",
        anchor: 'bottom',
      },
      {
        id: 'tt-sp-3',
        label: 'Referral Journey Stages',
        body: 'The journey tracker shows 7 stages: Ordered → Scheduled → Seen → Report Sent → PCP Reviewed → Gap Closed → Claim Submitted. Each stage has a timestamp and responsible party for full audit trail.',
        anchor: 'top',
      },
    ],
    keyInsight:
      'The specialist inbox surfaces 3 pending tasks with clinical context, gain-share value, and quality measure impact — giving specialists the "why" behind each referral, not just the "what".',
    handoffTo: 'Quality / Compliance Analyst',
    timing: { full: 8, half: 5, quick: 2 },
  },
  {
    id: 'analyst',
    role: 'Persona 8',
    title: 'Quality / Compliance Analyst',
    question:
      '"Can we prove the gap was closed across all three program types and report it to the state?"',
    color: '#8a3ffc',
    bgLight: '#f6f2ff',
    textColor: '#31135e',
    icon: 'ChartBarIcon',
    initials: 'QA',
    sidebarGroup: 'Clinical + Analytics',
    screens: [
      {
        route: '/care-gap-closure-verification',
        label: 'Care Gap Closure & Verification',
        storyBeat:
          'Evidence submitted — procedure, provenance, FHIR resource, EDW submission timeline',
      },
      {
        route: '/stars-hedis-mips',
        label: 'Quality Gaps & Attribution',
        storyBeat:
          'Five-tab quality framework: STARS + HEDIS + MIPS + BH Quality + Social Programs',
      },
      {
        route: '/outcomes-linkage',
        label: 'Outcomes Linkage',
        storyBeat: 'Social ROI — executive closing proof for whole-person program investment',
      },
      {
        route: '/executive-outcomes-dashboard',
        label: 'Executive Dashboard',
        storyBeat:
          'Closed loop — one patient intervention rolling up to network and state-level outcomes',
      },
    ],
    sampleData: [
      { label: 'Gaps Submitted (Clinical)', value: '14,220 Gaps', highlight: false },
      { label: 'FHIR Resources Validated', value: '98.7% Pass Rate', highlight: true },
      { label: 'BH Measures Tracked', value: 'FUH · FUM · AMM · SAA', highlight: true },
      { label: 'Social Measures Tracked', value: 'PRAPARE · SNAP · Housing', highlight: false },
      { label: 'HEDIS Hybrid Rate', value: '74.2% → 82.5%', highlight: true },
      { label: 'CMS Reporting Deadline', value: '14 Days', highlight: false },
    ],
    tooltips: [
      {
        id: 'tt-qa-1',
        label: 'Quality & Compliance (5 Tabs)',
        body: 'Quality & Compliance has five program tabs: STARS (payer bonus journey), HEDIS (clinical measure documentation), MIPS (payment adjustment), BH Quality (FUH/FUM/AMM/SAA rates vs targets), and Social Programs (PRAPARE/SNAP/Housing/CHW/BH engagement completion rates).',
        anchor: 'bottom',
      },
      {
        id: 'tt-qa-2',
        label: 'Social Program Measures',
        body: 'The Social Programs tab tracks PRAPARE screening completion (61% vs 80% target), SNAP enrollment (74% vs 85%), housing referral completion (48% vs 70%), CHW home visit rate (82% vs 85%), and dual-need care plan completion (56% vs 75%).',
        anchor: 'bottom',
      },
      {
        id: 'tt-qa-3',
        label: 'Closed Loop Reporting',
        body: "The executive dashboard shows the full loop: one patient intervention (Dorothy Simmons' BP control + housing stability) → clinical gap closed + social measure hit → HEDIS numerator + PRAPARE measure → regional score improvement → state-level outcome reported.",
        anchor: 'top',
      },
    ],
    keyInsight:
      'Quality & Compliance closes the loop across all three program types — 14,220 clinical gaps, 4 BH HEDIS measures, and 5 social program measures all tracked in a single accountability framework.',
    handoffTo: null,
    timing: { full: 8, half: 5, quick: 2 },
  },
];

// ─── Talking Points per screen ────────────────────────────────────────────────
const SCREEN_TALKING_POINTS: Record<string, string[]> = {
  'state-executive-0': [
    'Open with the program-type filter — switch from "All" to "Clinical", "BH", and "Social" to show each domain has its own KPI accountability.',
    'Point to the KPI strip: 128,400 attributed lives, $4.2M shared savings YTD, 61.2% social screening rate — three domains, one strip.',
    'Ask: "Where else can a state executive see clinical, behavioral, and social program performance in a single view?"',
  ],
  'state-executive-1': [
    'Show the regional map — four regions benchmarked side-by-side on Clinical gap closure, Social screening rate, and BH access rate.',
    'Highlight Northeast SD at 49% BH access — this is an actionable gap the state can fund and track.',
    'Transition: "The state executive can drill from region to program network to individual care team member — all in the same hierarchy."',
  ],
  'state-executive-2': [
    'Show the whole-person outcomes dashboard — care gaps closed, gain share earned, quality score improvement all on one screen.',
    'Point to the gain-share waterfall: which interventions generated the most shared savings.',
    'This is the "is it working?" screen — the state executive\'s closing proof point.',
  ],
  'state-executive-3': [
    'Open the Braided Funding view — show Medicaid capitation, FQHC grants, and social program funding as separate tracked streams.',
    'Highlight: each funding stream is compliance-tracked separately, but shared savings flow to the whole-person care team.',
    'Key message: "The platform handles the accounting complexity so the care team doesn\'t have to."',
  ],
  'state-executive-4': [
    'Show the social screening funnel — PRAPARE administered → needs identified → CBO referral → enrollment → outcome.',
    'Point to the dual-need cohort: patients with both clinical and social needs have 2.3x higher cost — and 3.1x higher ROI from intervention.',
    'This screen answers: "Is the social investment reaching the right patients?"',
  ],
  'state-executive-5': [
    'This is the ROI proof screen — housing stability → 34% ED reduction, food security → A1C improvement.',
    'Show the Dorothy Simmons pathway: food insecurity + SNAP enrollment + BH engagement → A1C 9.2% → 7.1%.',
    'Closing line: "This is what whole-person care looks like when it\'s measured end-to-end."',
  ],
  'network-director-0': [
    'Show the three network tabs: Clinical (FQHCs, hospitals, PCPs), BH (counseling centers, crisis orgs), CBO (housing navigators, food banks).',
    'Each tab has domain-appropriate metrics — not just gap closure rates for every org type.',
    'Point to the at-risk orgs: which networks are underperforming and why.',
  ],
  'network-director-1': [
    'Show the expanded care team view — PCPs, BH Counselors, and CHW Supervisors all at the same accountability level.',
    'BH Counselors show FUH/FUM rates; CHW Supervisors show home visit completion and enrollment rates.',
    'Key message: "Every member of the whole-person care team is accountable — not just the physician."',
  ],
  'network-director-2': [
    'Walk through all five tabs: STARS → HEDIS → MIPS → BH Quality → Social Programs.',
    'BH Quality tab: FUH, FUM, AMM, SAA rates vs targets — these are the BH HEDIS measures that drive shared savings.',
    'Social Programs tab: PRAPARE 61% vs 80% target — this is the gap the CHW team needs to close.',
  ],
  'physician-0': [
    'Show the SMART on FHIR launch — the physician enters from their EMR and lands directly in their attributed panel.',
    'Point to the platform ownership badge — this is a care management platform, not a clinical documentation tool.',
    'Key message: "The physician doesn\'t change their workflow — the platform meets them where they are."',
  ],
  'physician-1': [
    'Show the three attribution columns per patient row: Clinical PCP, Assigned CHW, BH Provider.',
    'Filter to Tier 1 (high risk) — 94 patients, 284 with CHW assigned, 198 with BH enrolled.',
    'Ask: "Which of your patients have a CHW assigned but no BH provider? That\'s the coordination gap."',
  ],
  'physician-2': [
    'Open Dorothy Simmons — navigate to the Whole Person Care Plan tab.',
    'Show clinical, BH, and social care plan goals in a single view with status and responsible team member.',
    'Point to the gain-share value per open gap — the physician sees the financial incentive to close each gap.',
  ],
  'care-manager-0': [
    'Show the program-type filter bar — switch between Clinical, BH, Social, and All.',
    'In BH view: BH Risk column shows condition and FUH/FUM status per patient.',
    'In Social view: Social Needs column shows screening status, CHW assigned, SNAP status.',
    'Key message: "One worklist, three program lenses — the care manager doesn\'t need three separate systems."',
  ],
  'care-manager-1': [
    "Open a patient's episode summary — show active vs historical episodes, cost vs target.",
    'Point to the episode type: CHF, COPD, Hip Replacement — these are the ETG episode categories.',
    'Transition: "The care manager can drill into any episode to see the care setting timeline."',
  ],
  'care-manager-2': [
    'Show the episode detail — care setting timeline (acute → SNF → home health), quality metrics, claim events.',
    'Point to the cost variance: this episode is $2,400 over target — what drove it?',
    'Key message: "The care manager can see exactly where cost variance occurred and intervene before the next episode."',
  ],
  'care-manager-3': [
    'Show the three analytics tabs: Clinical Episodes, BH Episodes, Social Program Outcomes.',
    "BH Episodes tab: FUH 67% vs 85% target — this is the care manager's BH accountability metric.",
    'Social Program Outcomes: SNAP enrollment 74%, cost avoidance $4,200 — the social ROI at the portfolio level.',
  ],
  'chw-0': [
    'Show the Home Visit Schedule — click "Start Visit" to open the checklist modal.',
    'Walk through the 6 checklist items: home safety, medication review, vitals, SDOH screening, care plan goals, referral confirmation.',
    'Click "Clinical" to show the clinical context panel — episode type, open care gaps, comorbidities.',
    'Show "Reschedule" — date/time picker with required reason dropdown.',
  ],
  'chw-1': [
    'Open the PRAPARE screening tool — show the 10-domain social needs assessment.',
    'Complete a screening for Dorothy Simmons — food insecurity and housing instability flagged.',
    'Show how the completed screening creates a social task and feeds the Quality & Compliance screening rate.',
  ],
  'chw-2': [
    'Show the program eligibility results from the PRAPARE screening — SNAP, housing assistance, food bank, transportation.',
    'Point to the eligibility criteria met vs not met — the CHW sees exactly which programs the patient qualifies for.',
    'Key message: "The CHW doesn\'t need to know every program\'s eligibility rules — the platform does."',
  ],
  'chw-3': [
    'Show the benefit enrollment status — SNAP enrolled ($234/mo), housing application pending, food bank referral confirmed.',
    "Point to the enrollment rate metric: 76% — this feeds the CHW Supervisor's performance dashboard.",
    'Transition: "Every enrollment the CHW completes rolls up to the network-level Social Programs quality measure."',
  ],
  'bh-crisis-0': [
    'Show the active crisis events — 3 events, acuity levels (High/Medium/Low), dispatch status.',
    'Click the SDOH Context panel for a patient — housing instability, food insecurity, prior crisis history.',
    'Show the dispatch options: 988, CSU, Mobile Crisis, ED — and how SDOH context informs the right choice.',
    "Show the post-crisis care plan linkage — BH follow-up task created and linked to the care manager's worklist.",
  ],
  'bh-crisis-1': [
    'Scroll to the Patient Pathway panel — this is the Dorothy Simmons story.',
    'Walk through the 4 stages: PRAPARE Screening → SNAP Enrollment → 12-Week BH Engagement → A1C Improvement.',
    'Point to the outcome: A1C 9.2% → 7.1%, 94% medication adherence, $4,200 estimated cost avoidance.',
    'Key message: "This is what the platform is designed to produce — a measurable, connected whole-person outcome."',
  ],
  'bh-crisis-2': [
    'Show the CBO directory — domain-tagged (housing, food, BH, transportation, legal), capacity status.',
    'Filter by domain — show how the CHW or crisis specialist finds the right CBO for a specific need.',
    'Point to linked patients — the CBO sees which patients are enrolled and their status.',
  ],
  'specialist-0': [
    'Show the universal task inbox — clinical, BH, and social program tasks in one view.',
    'Point to the task types: care gap closure, BH follow-up, social program referral — all in one queue.',
    'Key message: "The care team inbox is the coordination hub — every team member sees their tasks in one place."',
  ],
  'specialist-1': [
    'Show the specialist inbox — 3 pending tasks, 2 urgent/STAT.',
    "Click a task — show the gain-share value ($195 for Dorothy Simmons' cardiology evaluation) and the HEDIS measure it closes.",
    'Key message: "The specialist sees the \'why\' behind each referral — not just the clinical need, but the quality and financial impact."',
  ],
  'specialist-2': [
    'Show the referral tracking table — 11 referrals in flight, status, referring provider, due dates.',
    'Point to the overdue referrals — these are the coordination gaps that drive cost variance.',
    'Transition: "Let\'s see the full journey for one of these referrals."',
  ],
  'specialist-3': [
    'Show the referral journey tracker — 7 stages: Ordered → Scheduled → Seen → Report Sent → PCP Reviewed → Gap Closed → Claim Submitted.',
    'Point to the timestamps and responsible party at each stage — full audit trail.',
    'Closing line: "Every referral has a complete chain of custody — from order to claim submission."',
  ],
  'analyst-0': [
    'Show the care gap closure verification screen — procedure code, provenance, FHIR resource, EDW submission timeline.',
    'Point to the 98.7% FHIR validation pass rate — this is the data quality story.',
    'Key message: "The platform doesn\'t just close gaps — it proves they were closed with auditable evidence."',
  ],
  'analyst-1': [
    'Walk through all five Quality & Compliance tabs.',
    'BH Quality: FUH 67% vs 85% target, FUM 71% vs 80% — these are the BH HEDIS measures driving shared savings.',
    'Social Programs: PRAPARE 61% vs 80%, SNAP 74% vs 85% — the social program accountability framework.',
    'Key message: "Clinical, BH, and Social quality measures in one framework — one report to the state."',
  ],
  'analyst-2': [
    'Show the Outcomes Linkage screen — the social-to-clinical ROI proof.',
    'Housing stability → 34% ED reduction, food security → A1C improvement — quantified at the population level.',
    'This is the closing argument for continued social program investment.',
  ],
  'analyst-3': [
    'Show the executive dashboard — the closed loop from one patient intervention to state-level outcome.',
    'Dorothy Simmons: BP control + housing stability → clinical gap closed + social measure hit → HEDIS numerator → regional score improvement → state outcome reported.',
    'Final line: "One patient. Four program domains. One connected story. That\'s the RHTP platform."',
  ],
};

// ─── Reference Panel Data ─────────────────────────────────────────────────────
interface ScreenRef {
  stepNum: number;
  globalIndex: number;
  personaId: string;
  personaTitle: string;
  personaRole: string;
  personaColor: string;
  personaBgLight: string;
  personaInitials: string;
  screenLabel: string;
  screenRoute: string;
  storyBeat: string;
  talkingPoints: string[];
  keyDataPoints: { label: string; value: string }[];
  walkthroughCues: string[];
}

const KEY_DATA_POINTS: Record<string, { label: string; value: string }[]> = {
  'state-executive-0': [
    { label: 'Attributed Lives', value: '128,400' },
    { label: 'Shared Savings YTD', value: '$4.2M' },
    { label: 'Social Screening Rate', value: '61.2%' },
    { label: 'BH Access Rate', value: '64.8%' },
    { label: 'Quality Score Δ', value: '+8.3 pts' },
  ],
  'state-executive-1': [
    { label: 'Regions', value: '4 Active' },
    { label: 'Top Clinical Region', value: 'West River 73%' },
    { label: 'At-Risk BH Region', value: 'Northeast SD 49%' },
    { label: 'Social Screening Δ', value: '+12.4 pts' },
  ],
  'state-executive-2': [
    { label: 'Care Gaps Closed', value: '14,220' },
    { label: 'Gain Share Earned', value: '$4.2M' },
    { label: 'Quality Score', value: '74.2 → 82.5' },
    { label: 'ED Diversions', value: '8 (30d)' },
  ],
  'state-executive-3': [
    { label: 'Medicaid Capitation', value: 'Stream 1' },
    { label: 'FQHC Grants', value: 'Stream 2' },
    { label: 'Social Program Funding', value: 'Stream 3' },
    { label: 'Shared Savings Split', value: '60/40 Network/State' },
  ],
  'state-executive-4': [
    { label: 'PRAPARE Administered', value: '78,500' },
    { label: 'Needs Identified', value: '48,200' },
    { label: 'CBO Referrals', value: '31,400' },
    { label: 'Dual-Need Cost Multiplier', value: '2.3×' },
    { label: 'Dual-Need ROI', value: '3.1×' },
  ],
  'state-executive-5': [
    { label: 'Housing → ED Reduction', value: '34%' },
    { label: 'Food → A1C Improvement', value: '9.2% → 7.1%' },
    { label: 'Dorothy Simmons Savings', value: '$4,200 cost avoidance' },
    { label: 'BH Engagement Duration', value: '12 weeks' },
  ],
  'network-director-0': [
    { label: 'Clinical Orgs', value: 'FQHCs + Hospitals + PCPs' },
    { label: 'BH Orgs', value: 'Counseling + Crisis' },
    { label: 'CBO Orgs', value: 'Housing + Food Banks' },
    { label: 'Total Networks', value: '16 Orgs' },
  ],
  'network-director-1': [
    { label: 'PCPs', value: 'Gap closure rate' },
    { label: 'BH Counselors', value: 'FUH/FUM rates' },
    { label: 'CHW Supervisors', value: 'Visit + enrollment rates' },
    { label: 'Accountability Level', value: 'NPI-equivalent' },
  ],
  'network-director-2': [
    { label: 'STARS', value: 'Payer bonus journey' },
    { label: 'HEDIS', value: 'Clinical measures' },
    { label: 'MIPS', value: 'Payment adjustment' },
    { label: 'BH Quality', value: 'FUH/FUM/AMM/SAA' },
    { label: 'Social Programs', value: 'PRAPARE/SNAP/Housing' },
  ],
  'physician-0': [
    { label: 'EMR Entry', value: 'SMART on FHIR' },
    { label: 'Platform Type', value: 'Care Management' },
    { label: 'Workflow Impact', value: 'Zero change to EMR' },
  ],
  'physician-1': [
    { label: 'Attributed Panel', value: '847 Patients' },
    { label: 'High Risk (Tier 1)', value: '94 Patients' },
    { label: 'With CHW Assigned', value: '284 Patients' },
    { label: 'With BH Enrolled', value: '198 Patients' },
    { label: 'Gain-Share Eligible', value: '$18,400' },
  ],
  'physician-2': [
    { label: 'Patient', value: 'Dorothy Simmons' },
    { label: 'Care Plan Domains', value: 'Clinical + BH + Social' },
    { label: 'Open Gaps', value: '312 Panel-wide' },
    { label: 'Gain-Share Per Gap', value: 'Visible at patient level' },
  ],
  'care-manager-0': [
    { label: 'Assigned Patients', value: '156' },
    { label: "Today's Priority Queue", value: '12 Patients' },
    { label: 'ADT Alerts', value: '4 New' },
    { label: 'BH Risk Flags', value: '9 Patients' },
    { label: 'Social Needs Open', value: '14 Patients' },
  ],
  'care-manager-1': [
    { label: 'Active Episodes', value: '38' },
    { label: 'Episode Types', value: 'CHF, COPD, Hip Replacement' },
    { label: 'Cost vs Target', value: 'Visible per episode' },
  ],
  'care-manager-2': [
    { label: 'Care Settings', value: 'Acute → SNF → Home Health' },
    { label: 'Cost Variance', value: '+$2,400 over target' },
    { label: 'Quality Metrics', value: 'Per episode' },
    { label: 'Claim Events', value: 'Timeline view' },
  ],
  'care-manager-3': [
    { label: 'FUH Rate', value: '67% vs 85% target' },
    { label: 'FUM Rate', value: '71% vs 80% target' },
    { label: 'SNAP Enrollment', value: '74%' },
    { label: 'Cost Avoidance', value: '$4,200 portfolio' },
    { label: 'Contract', value: 'Medicaid RHTP Track 3' },
  ],
  'chw-0': [
    { label: 'Assigned Patients', value: '198' },
    { label: 'Home Visits YTD', value: '142' },
    { label: 'Checklist Items', value: '6 (safety, meds, vitals, SDOH, goals, referrals)' },
    { label: 'Reschedule Reasons', value: '7 options' },
  ],
  'chw-1': [
    { label: 'PRAPARE Domains', value: '10 Social Needs' },
    { label: 'Screening Rate', value: '91%' },
    { label: 'Quality Feed', value: 'Social Programs tab' },
    { label: 'Task Creation', value: 'Automatic on completion' },
  ],
  'chw-2': [
    { label: 'Programs Checked', value: 'SNAP, Housing, Food Bank, Transport' },
    { label: 'Eligibility Logic', value: 'Platform-managed' },
    { label: 'Criteria Display', value: 'Met vs Not Met' },
  ],
  'chw-3': [
    { label: 'SNAP Enrolled', value: '$234/mo' },
    { label: 'Housing', value: 'Application Pending' },
    { label: 'Food Bank', value: 'Referral Confirmed' },
    { label: 'Enrollment Rate', value: '76%' },
  ],
  'bh-crisis-0': [
    { label: 'Active Crisis Events', value: '3' },
    { label: 'ED Diversions (30d)', value: '8' },
    { label: 'Dispatch Options', value: '988 / CSU / Mobile / ED' },
    { label: 'Post-Crisis BH Tasks', value: '5 Open' },
  ],
  'bh-crisis-1': [
    { label: 'Patient', value: 'Dorothy Simmons' },
    { label: 'Stage 1', value: 'PRAPARE — food insecurity, A1C 9.2%' },
    { label: 'Stage 2', value: 'SNAP — $234/mo Tri-County Food Bank' },
    { label: 'Stage 3', value: '12-week BH + 8 CHW visits, 94% adherence' },
    { label: 'Stage 4', value: 'A1C 9.2% → 7.1%, $4,200 cost avoidance' },
  ],
  'bh-crisis-2': [
    { label: 'CBO Domains', value: 'Housing, Food, BH, Transport, Legal' },
    { label: 'Capacity Status', value: 'Live per org' },
    { label: 'Linked Patients', value: 'Visible per CBO' },
  ],
  'specialist-0': [
    { label: 'Task Types', value: 'Clinical + BH + Social' },
    { label: 'Inbox Scope', value: 'Universal — all programs' },
    { label: 'Coordination Hub', value: 'All team members' },
  ],
  'specialist-1': [
    { label: 'Pending Tasks', value: '3' },
    { label: 'Urgent / STAT', value: '2 Patients' },
    { label: 'Gain-Share Value', value: '$195 (Dorothy Simmons cardiology)' },
    { label: 'HEDIS Measure', value: 'CBP-236 Controlling Hypertension' },
  ],
  'specialist-2': [
    { label: 'Referrals In Flight', value: '11' },
    { label: 'Avg Referral Age', value: '6.2 Days' },
    { label: 'Overdue Referrals', value: 'Highlighted' },
  ],
  'specialist-3': [
    { label: 'Journey Stages', value: '7 (Ordered → Claim Submitted)' },
    { label: 'Audit Trail', value: 'Timestamp + responsible party' },
    { label: 'Chain of Custody', value: 'Order to claim' },
  ],
  'analyst-0': [
    { label: 'Gaps Submitted', value: '14,220 Clinical' },
    { label: 'FHIR Validation', value: '98.7% Pass Rate' },
    { label: 'Evidence Type', value: 'Procedure + Provenance + FHIR' },
  ],
  'analyst-1': [
    { label: 'BH Measures', value: 'FUH · FUM · AMM · SAA' },
    { label: 'FUH Rate', value: '67% vs 85% target' },
    { label: 'Social Measures', value: 'PRAPARE · SNAP · Housing' },
    { label: 'PRAPARE Rate', value: '61% vs 80% target' },
    { label: 'HEDIS Hybrid Rate', value: '74.2% → 82.5%' },
  ],
  'analyst-2': [
    { label: 'Housing → ED', value: '34% reduction' },
    { label: 'Food → A1C', value: 'Population-level improvement' },
    { label: 'Social ROI', value: 'Quantified at population level' },
  ],
  'analyst-3': [
    { label: 'Loop', value: 'Patient → Network → State' },
    { label: 'Patient', value: 'Dorothy Simmons' },
    { label: 'Domains Closed', value: '4 (Clinical + BH + Social + Financial)' },
    { label: 'Final Message', value: 'One patient. Four domains. One story.' },
  ],
};

const WALKTHROUGH_CUES: Record<string, string[]> = {
  'state-executive-0': [
    '🖱 Click program-type filter: All → Clinical → BH → Social',
    '🖱 Point to KPI strip — three domains, one view',
    '🗣 "Where else can a state executive see all three program types in one strip?"',
  ],
  'state-executive-1': [
    '🖱 Show regional map — four regions side-by-side',
    '🖱 Click Northeast SD — highlight 49% BH access gap',
    '🗣 "This is an actionable gap the state can fund and track."',
  ],
  'state-executive-2': [
    '🖱 Show gain-share waterfall — which interventions generated most savings',
    '🖱 Point to quality score improvement trend',
    '🗣 "This is the \'is it working?\' screen."',
  ],
  'state-executive-3': [
    '🖱 Open Braided Funding view — show three separate funding streams',
    '🖱 Show shared savings distribution',
    '🗣 "The platform handles the accounting complexity."',
  ],
  'state-executive-4': [
    '🖱 Show PRAPARE funnel — administered → needs → referral → enrollment → outcome',
    '🖱 Click dual-need cohort — 2.3× cost, 3.1× ROI',
    '🗣 "Is the social investment reaching the right patients?"',
  ],
  'state-executive-5': [
    '🖱 Show housing → ED reduction chart',
    '🖱 Click Dorothy Simmons pathway — walk all 4 stages',
    '🗣 "This is what whole-person care looks like when it\'s measured end-to-end."',
  ],
  'network-director-0': [
    '🖱 Click Clinical tab → BH tab → CBO tab',
    '🖱 Point to domain-appropriate metrics per tab',
    '🖱 Highlight at-risk orgs in red',
  ],
  'network-director-1': [
    '🖱 Show PCP row → BH Counselor row → CHW Supervisor row',
    '🖱 Point to FUH/FUM on BH Counselor row',
    '🗣 "Every member of the whole-person care team is accountable."',
  ],
  'network-director-2': [
    '🖱 Click all 5 tabs: STARS → HEDIS → MIPS → BH Quality → Social Programs',
    '🖱 On BH Quality: point to FUH 67% vs 85% target',
    '🖱 On Social Programs: point to PRAPARE 61% vs 80% gap',
  ],
  'physician-0': [
    '🖱 Show SMART on FHIR launch animation',
    '🖱 Point to platform ownership badge',
    '🗣 "The physician doesn\'t change their workflow."',
  ],
  'physician-1': [
    '🖱 Show three attribution columns: Clinical PCP / CHW / BH Provider',
    '🖱 Filter to Tier 1 — 94 high-risk patients',
    '🗣 "Which patients have a CHW but no BH provider? That\'s the coordination gap."',
  ],
  'physician-2': [
    '🖱 Open Dorothy Simmons → click Whole Person Care Plan tab',
    '🖱 Show Clinical + BH + Social goals in one view',
    '🖱 Point to gain-share value per open gap',
  ],
  'care-manager-0': [
    '🖱 Click Clinical filter → BH filter → Social filter → All',
    '🖱 In BH: point to BH Risk column (condition + FUH/FUM)',
    '🖱 In Social: point to Social Needs column (screening + CHW + SNAP)',
    '🗣 "One worklist, three program lenses."',
  ],
  'care-manager-1': [
    '🖱 Open a patient — show active vs historical episodes',
    '🖱 Point to cost vs target per episode',
    '🗣 "The care manager can drill into any episode."',
  ],
  'care-manager-2': [
    '🖱 Show care setting timeline: Acute → SNF → Home Health',
    '🖱 Point to cost variance: +$2,400 over target',
    '🗣 "Where did cost variance occur and how do we intervene?"',
  ],
  'care-manager-3': [
    '🖱 Click Clinical Episodes → BH Episodes → Social Program Outcomes',
    '🖱 On BH: point to FUH 67% vs 85% target',
    '🖱 On Social: point to SNAP 74% + $4,200 cost avoidance',
  ],
  'chw-0': [
    '🖱 Click "Start Visit" — walk through 6-item checklist',
    '🖱 Click "Clinical" — show episode context panel',
    '🖱 Click "Reschedule" — show date/time picker + reason dropdown',
    '🗣 "The home visit schedule is now a live workflow tool."',
  ],
  'chw-1': [
    '🖱 Open PRAPARE screening for Dorothy Simmons',
    '🖱 Flag food insecurity + housing instability',
    '🖱 Show auto-created social task + Quality & Compliance feed',
  ],
  'chw-2': [
    '🖱 Show eligibility results: SNAP ✓, Housing ✓, Food Bank ✓, Transport ✓',
    '🖱 Point to criteria met vs not met',
    '🗣 "The CHW doesn\'t need to know every program\'s rules."',
  ],
  'chw-3': [
    '🖱 Show SNAP enrolled ($234/mo), Housing pending, Food Bank confirmed',
    '🖱 Point to enrollment rate: 76%',
    '🗣 "Every enrollment rolls up to the network-level Social Programs measure."',
  ],
  'bh-crisis-0': [
    '🖱 Show 3 active crisis events — acuity levels',
    '🖱 Click SDOH Context panel — housing + food + prior crisis history',
    '🖱 Show dispatch options: 988 / CSU / Mobile / ED',
    '🖱 Show post-crisis care plan linkage → CM worklist',
  ],
  'bh-crisis-1': [
    '🖱 Scroll to Patient Pathway panel',
    '🖱 Click Stage 1 → Stage 2 → Stage 3 → Stage 4',
    '🖱 Point to A1C 9.2% → 7.1% outcome badge',
    '🗣 "This is what the platform is designed to produce."',
  ],
  'bh-crisis-2': [
    '🖱 Show CBO directory — domain tags visible',
    '🖱 Filter by domain (e.g., Housing)',
    '🖱 Click a CBO — show linked patients + capacity status',
  ],
  'specialist-0': [
    '🖱 Show task inbox — Clinical + BH + Social tasks mixed',
    '🖱 Point to task type badges',
    '🗣 "The care team inbox is the coordination hub."',
  ],
  'specialist-1': [
    '🖱 Click Dorothy Simmons task — show gain-share value ($195)',
    '🖱 Point to HEDIS measure: CBP-236',
    '🗣 "The specialist sees the \'why\' — not just the clinical need."',
  ],
  'specialist-2': [
    '🖱 Show referral table — 11 in flight',
    '🖱 Sort by age — highlight overdue',
    '🗣 "These are the coordination gaps that drive cost variance."',
  ],
  'specialist-3': [
    '🖱 Click a referral — show 7-stage journey',
    '🖱 Point to timestamps + responsible party at each stage',
    '🗣 "Every referral has a complete chain of custody."',
  ],
  'analyst-0': [
    '🖱 Show procedure code + FHIR resource + EDW submission timeline',
    '🖱 Point to 98.7% FHIR validation pass rate',
    '🗣 "The platform doesn\'t just close gaps — it proves they were closed."',
  ],
  'analyst-1': [
    '🖱 Click all 5 tabs: STARS → HEDIS → MIPS → BH Quality → Social Programs',
    '🖱 On BH Quality: FUH 67% vs 85%, FUM 71% vs 80%',
    '🖱 On Social Programs: PRAPARE 61% vs 80%, SNAP 74% vs 85%',
    '🗣 "One framework. Three program types. One report to the state."',
  ],
  'analyst-2': [
    '🖱 Show housing → ED reduction chart (34%)',
    '🖱 Show food → A1C improvement at population level',
    '🗣 "This is the closing argument for social program investment."',
  ],
  'analyst-3': [
    '🖱 Show closed-loop diagram: patient → network → state',
    '🖱 Trace Dorothy Simmons: BP control + housing → HEDIS numerator → regional score → state outcome',
    '🗣 "One patient. Four program domains. One connected story. That\'s the RHTP platform."',
  ],
};

function buildScreenRefs(): ScreenRef[] {
  const refs: ScreenRef[] = [];
  let globalIndex = 0;
  PERSONAS.forEach((persona, pi) => {
    persona.screens.forEach((screen, si) => {
      const key = `${persona.id}-${si}`;
      refs.push({
        stepNum: globalIndex + 1,
        globalIndex,
        personaId: persona.id,
        personaTitle: persona.title,
        personaRole: persona.role,
        personaColor: persona.color,
        personaBgLight: persona.bgLight,
        personaInitials: persona.initials,
        screenLabel: screen.label,
        screenRoute: screen.route,
        storyBeat: screen.storyBeat,
        talkingPoints: SCREEN_TALKING_POINTS[key] ?? [screen.storyBeat],
        keyDataPoints: KEY_DATA_POINTS[key] ?? [],
        walkthroughCues: WALKTHROUGH_CUES[key] ?? [],
      });
      globalIndex++;
    });
  });
  return refs;
}

const ALL_SCREEN_REFS = buildScreenRefs();

// ─── Build DEMO_TRACK_STEPS from PERSONAS ─────────────────────────────────────
const DEMO_TRACK_STEPS: DemoTrackStep[] = [];
PERSONAS.forEach((persona, pi) => {
  persona.screens.forEach((screen, si) => {
    const key = `${persona.id}-${si}`;
    const isLastScreenOfPersona = si === persona.screens.length - 1;
    const nextPersona = isLastScreenOfPersona ? PERSONAS[pi + 1] : null;
    DEMO_TRACK_STEPS.push({
      personaIndex: pi,
      screenIndex: si,
      personaTitle: persona.title,
      personaRole: persona.role,
      personaInitials: persona.initials,
      personaColor: persona.color,
      personaBgLight: persona.bgLight,
      personaTextColor: persona.textColor,
      screenLabel: screen.label,
      screenRoute: screen.route,
      storyBeat: screen.storyBeat,
      talkingPoints: SCREEN_TALKING_POINTS[key] ?? [screen.storyBeat],
      transitionNote:
        isLastScreenOfPersona && nextPersona
          ? `Hand off to ${persona.handoffTo ?? nextPersona.title} — ${nextPersona.role}`
          : null,
    });
  });
});

// ─── Timing Modes ─────────────────────────────────────────────────────────────
const TIMING_MODES: { key: 'full' | 'half' | 'quick'; label: string; color: string }[] = [
  { key: 'full', label: 'Full Demo (~60 min)', color: '#0043ce' },
  { key: 'half', label: 'Half Demo (~30 min)', color: '#6929c4' },
  { key: 'quick', label: 'Quick Overview (~15 min)', color: '#198038' },
];

// ─── Reference Panel Component ────────────────────────────────────────────────
function ReferencePanel({
  currentStepIndex,
  onJumpToStep,
}: {
  currentStepIndex: number;
  onJumpToStep: (idx: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(currentStepIndex);
  const [activeTab, setActiveTab] = useState<'notes' | 'data' | 'cues'>('notes');
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-expand current step when it changes
  useEffect(() => {
    setExpandedIndex(currentStepIndex);
  }, [currentStepIndex]);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Debounce search — wait 150ms after last keystroke before filtering
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const q = debouncedQuery.toLowerCase().trim();
  const filtered = q
    ? ALL_SCREEN_REFS.filter(
        (r) =>
          r.screenLabel.toLowerCase().includes(q) ||
          r.storyBeat.toLowerCase().includes(q) ||
          r.personaTitle.toLowerCase().includes(q) ||
          r.talkingPoints.some((tp) => tp.toLowerCase().includes(q)) ||
          r.walkthroughCues.some((c) => c.toLowerCase().includes(q)) ||
          r.keyDataPoints.some(
            (d) => d.label.toLowerCase().includes(q) || d.value.toLowerCase().includes(q)
          )
      )
    : ALL_SCREEN_REFS;

  // Group filtered results by persona
  const personaGroups = PERSONAS.map((p, pi) => ({
    persona: p,
    screens: filtered.filter((r) => r.personaId === p.id),
  })).filter((g) => g.screens.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search screens, notes, data points…"
            className="w-full bg-white/8 border border-white/15 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <Icon name="XMarkIcon" size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-2xs text-white/30">
            {filtered.length} of {ALL_SCREEN_REFS.length} screens
          </span>
          {/* Tab switcher for expanded view */}
          <div className="flex items-center gap-1">
            {(['notes', 'data', 'cues'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-0.5 text-2xs font-semibold rounded transition-colors ${
                  activeTab === tab ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'
                }`}
              >
                {tab === 'notes' ? 'Speaker Notes' : tab === 'data' ? 'Key Data' : 'Walkthrough'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {personaGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Icon name="MagnifyingGlassIcon" size={24} className="mb-2" />
            <p className="text-xs">No screens match &quot;{query}&quot;</p>
          </div>
        ) : (
          <div className="py-2">
            {personaGroups.map(({ persona, screens }) => (
              <div key={persona.id} className="mb-1">
                {/* Persona group header */}
                <div
                  className="flex items-center gap-2 px-4 py-1.5 sticky top-0 z-10"
                  style={{ backgroundColor: '#0f0f14' }}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: persona.color, fontSize: '8px', fontWeight: 700 }}
                  >
                    {PERSONAS.indexOf(persona) + 1}
                  </div>
                  <span
                    className="text-2xs font-bold uppercase tracking-widest"
                    style={{ color: persona.color }}
                  >
                    {persona.title}
                  </span>
                  <span className="text-2xs text-white/20 ml-auto">
                    {screens.length} screen{screens.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Screen rows */}
                {screens.map((ref) => {
                  const isCurrentStep = ref.globalIndex === currentStepIndex;
                  const isExpanded = expandedIndex === ref.globalIndex;

                  return (
                    <div
                      key={ref.globalIndex}
                      className="mx-2 mb-1 rounded-lg overflow-hidden border border-white/5"
                    >
                      {/* Screen header row */}
                      <button
                        onClick={() => setExpandedIndex(isExpanded ? null : ref.globalIndex)}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
                          isCurrentStep ? 'bg-white/8' : ''
                        }`}
                        style={isCurrentStep ? { backgroundColor: ref.personaColor + '18' } : {}}
                      >
                        {/* Step badge */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5"
                          style={{
                            backgroundColor: isCurrentStep
                              ? ref.personaColor
                              : 'rgba(255,255,255,0.1)',
                            fontSize: '9px',
                            fontWeight: 700,
                          }}
                        >
                          {ref.stepNum}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-xs font-semibold leading-tight ${isCurrentStep ? '' : 'text-white/70'}`}
                            style={isCurrentStep ? { color: ref.personaColor } : {}}
                          >
                            {ref.screenLabel}
                          </p>
                          <p className="text-2xs text-white/35 mt-0.5 leading-relaxed line-clamp-2">
                            {ref.storyBeat}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                          {isCurrentStep && (
                            <span
                              className="text-2xs font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: ref.personaColor + '30',
                                color: ref.personaColor,
                              }}
                            >
                              NOW
                            </span>
                          )}
                          <Icon
                            name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                            size={12}
                            className="text-white/25"
                          />
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-white/8 bg-white/3">
                          {/* Action row */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                            <button
                              onClick={() => onJumpToStep(ref.globalIndex)}
                              className="flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
                              style={{ backgroundColor: ref.personaColor }}
                            >
                              <Icon name="PlayIcon" size={10} />
                              Jump to Step {ref.stepNum}
                            </button>
                            <Link
                              href={ref.screenRoute}
                              target="_blank"
                              className="flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors"
                            >
                              <Icon name="ArrowTopRightOnSquareIcon" size={10} />
                              Open Screen
                            </Link>
                          </div>

                          {/* Tab content */}
                          {activeTab === 'notes' && (
                            <div className="px-3 py-2.5 space-y-2">
                              <p className="text-2xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Speaker Notes
                              </p>
                              {ref.talkingPoints.map((point, pi) => (
                                <div key={pi} className="flex gap-2">
                                  <div
                                    className="w-4 h-4 rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5"
                                    style={{
                                      backgroundColor: ref.personaColor + '60',
                                      fontSize: '8px',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {pi + 1}
                                  </div>
                                  <p className="text-2xs text-white/65 leading-relaxed">{point}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {activeTab === 'data' && (
                            <div className="px-3 py-2.5">
                              <p className="text-2xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Key Data Points
                              </p>
                              {ref.keyDataPoints.length > 0 ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {ref.keyDataPoints.map((d, di) => (
                                    <div
                                      key={di}
                                      className="rounded-lg px-2.5 py-2 border border-white/8"
                                      style={{ backgroundColor: ref.personaColor + '10' }}
                                    >
                                      <p className="text-2xs text-white/40 leading-tight">
                                        {d.label}
                                      </p>
                                      <p
                                        className="text-xs font-bold mt-0.5"
                                        style={{ color: ref.personaColor }}
                                      >
                                        {d.value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-2xs text-white/25 italic">
                                  No key data points defined for this screen.
                                </p>
                              )}
                            </div>
                          )}

                          {activeTab === 'cues' && (
                            <div className="px-3 py-2.5 space-y-1.5">
                              <p className="text-2xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Live-Click Walkthrough Cues
                              </p>
                              {ref.walkthroughCues.length > 0 ? (
                                ref.walkthroughCues.map((cue, ci) => (
                                  <div
                                    key={ci}
                                    className="flex gap-2 px-2.5 py-2 rounded-lg border border-white/8 bg-white/3"
                                  >
                                    <p className="text-2xs text-white/70 leading-relaxed">{cue}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-2xs text-white/25 italic">
                                  No walkthrough cues defined for this screen.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PersonaCard Component ────────────────────────────────────────────────────
function PersonaCard({
  persona,
  isActive,
  isCompleted,
  onClick,
  index,
}: {
  persona: Persona;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all flex-shrink-0 ${
        isActive ? 'bg-carbon-gray-10' : 'hover:bg-carbon-gray-10'
      }`}
      title={persona.title}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{
          backgroundColor: isCompleted && !isActive ? '#198038' : persona.color,
          opacity: isActive ? 1 : isCompleted ? 0.8 : 0.5,
        }}
      >
        {isCompleted && !isActive ? <Icon name="CheckIcon" size={14} /> : index + 1}
      </div>
      <span
        className="text-2xs font-semibold"
        style={{ color: isActive ? persona.color : '#6f6f6f' }}
      >
        {persona.initials}
      </span>
    </button>
  );
}

// ─── Tooltip Component ────────────────────────────────────────────────────────
function Tooltip({ tooltip, accentColor }: { tooltip: TooltipDef; accentColor: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-2xs font-semibold px-2 py-0.5 rounded-full border transition-colors"
        style={{
          borderColor: accentColor + '40',
          color: accentColor,
          backgroundColor: accentColor + '10',
        }}
      >
        {tooltip.label}
      </button>
      {open && (
        <div
          className={`absolute z-30 w-64 p-3 rounded-xl border border-white/20 shadow-xl text-xs text-white leading-relaxed ${
            tooltip.anchor === 'top'
              ? 'bottom-full mb-2'
              : tooltip.anchor === 'left'
                ? 'right-full mr-2 top-0'
                : tooltip.anchor === 'right'
                  ? 'left-full ml-2 top-0'
                  : 'top-full mt-2'
          }`}
          style={{ backgroundColor: '#1c1c24' }}
        >
          <p className="font-semibold mb-1" style={{ color: accentColor }}>
            {tooltip.label}
          </p>
          <p className="text-white/70">{tooltip.body}</p>
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-white/30 hover:text-white/60 transition-colors"
          >
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Demo Track Overlay ───────────────────────────────────────────────────────
function DemoTrackOverlay({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [talkingPointIndex, setTalkingPointIndex] = useState(0);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [refPanelOpen, setRefPanelOpen] = useState(false);

  // Lock body scroll while overlay is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const step = DEMO_TRACK_STEPS[stepIndex];
  const totalSteps = DEMO_TRACK_STEPS.length;
  const progressPct = Math.round((stepIndex / (totalSteps - 1)) * 100);

  // Group steps by persona for the mini-map
  const personaStepGroups = PERSONAS.map((p, pi) => ({
    persona: p,
    steps: DEMO_TRACK_STEPS.filter((s) => s.personaIndex === pi),
    startIndex: DEMO_TRACK_STEPS.findIndex((s) => s.personaIndex === pi),
  }));

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;
  const isPersonaStart = step.screenIndex === 0;

  function goNext() {
    setCompletedSteps((prev) => {
      const n = new Set(prev);
      n.add(stepIndex);
      return n;
    });
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
    setTalkingPointIndex(0);
    setShowAllPoints(false);
  }

  function goPrev() {
    setStepIndex((i) => Math.max(i - 1, 0));
    setTalkingPointIndex(0);
    setShowAllPoints(false);
  }

  function jumpToStep(idx: number) {
    if (idx < stepIndex) {
      setStepIndex(idx);
    } else {
      setCompletedSteps((prev) => {
        const n = new Set(prev);
        for (let i = stepIndex; i < idx; i++) n.add(i);
        return n;
      });
      setStepIndex(idx);
    }
    setTalkingPointIndex(0);
    setShowAllPoints(false);
  }

  function nextTalkingPoint() {
    if (talkingPointIndex < step.talkingPoints.length - 1) {
      setTalkingPointIndex((i) => i + 1);
    } else {
      setShowAllPoints(true);
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'Escape') onClose();
    },
    [stepIndex]
  ); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const currentPersona = PERSONAS[step.personaIndex];
  const screensInPersona = currentPersona.screens.length;
  const screenNum = step.screenIndex + 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#0f0f14' }}>
      {/* Top progress bar */}
      <div className="h-1 w-full bg-white/10 flex-shrink-0">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${progressPct}%`, backgroundColor: step.personaColor }}
        />
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: step.personaColor }}
          >
            {step.personaInitials}
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{step.personaTitle}</p>
            <p className="text-white/40 text-xs">
              {step.personaRole} · Screen {screenNum} of {screensInPersona}
            </p>
          </div>
        </div>

        {/* Persona mini-map */}
        <div className="hidden lg:flex items-center gap-1">
          {personaStepGroups.map(({ persona, steps: pSteps, startIndex }) => {
            const allDone = pSteps.every((_, i) => completedSteps.has(startIndex + i));
            return (
              <button
                key={persona.id}
                onClick={() => jumpToStep(startIndex)}
                title={persona.title}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                  PERSONAS[step.personaIndex].id === persona.id
                    ? 'text-white'
                    : allDone
                      ? 'text-white/50'
                      : 'text-white/25 hover:text-white/50'
                }`}
                style={
                  PERSONAS[step.personaIndex].id === persona.id
                    ? { backgroundColor: persona.color + '30', color: persona.color }
                    : {}
                }
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white"
                  style={{
                    backgroundColor: allDone ? '#198038' : persona.color,
                    opacity: PERSONAS[step.personaIndex].id === persona.id ? 1 : 0.5,
                  }}
                >
                  {allDone ? (
                    <Icon name="CheckIcon" size={8} />
                  ) : (
                    <span style={{ fontSize: '8px' }}>{PERSONAS.indexOf(persona) + 1}</span>
                  )}
                </div>
                <span className="hidden xl:inline">{persona.initials}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/40 text-xs font-mono">
            {stepIndex + 1} / {totalSteps}
          </span>
          <span className="text-white/20 text-xs hidden sm:inline">
            ← → to navigate · Esc to exit
          </span>
          {/* Reference Panel Toggle */}
          <button
            onClick={() => setRefPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
              refPanelOpen
                ? 'bg-white/15 text-white border-white/30'
                : 'text-white/60 hover:text-white border border-white/20 hover:border-white/40'
            }`}
          >
            <Icon name="BookOpenIcon" size={14} />
            <span className="hidden sm:inline">Reference</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-colors"
          >
            <Icon name="XMarkIcon" size={14} />
            Exit Track
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — screen info + talking points */}
        <div className="flex flex-col w-full lg:w-[420px] xl:w-[480px] flex-shrink-0 border-r border-white/10 overflow-y-auto">
          {/* Persona transition badge */}
          {isPersonaStart && (
            <div
              className="mx-5 mt-5 px-4 py-3 rounded-xl border flex items-center gap-3"
              style={{
                backgroundColor: step.personaColor + '18',
                borderColor: step.personaColor + '40',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: step.personaColor }}
              >
                {step.personaInitials}
              </div>
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: step.personaColor }}
                >
                  {step.personaRole} — New Persona
                </p>
                <p className="text-white text-sm font-semibold leading-tight">
                  {step.personaTitle}
                </p>
              </div>
            </div>
          )}

          {/* Screen card */}
          <div className="mx-5 mt-4 p-5 rounded-xl border border-white/10 bg-white/5">
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ backgroundColor: step.personaColor }}
              >
                {step.screenIndex + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-base leading-tight">
                  {step.screenLabel}
                </p>
                <p className="text-white/50 text-xs mt-1 leading-relaxed">{step.storyBeat}</p>
              </div>
            </div>
            <Link
              href={step.screenRoute}
              target="_blank"
              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg text-white transition-all hover:opacity-90 mt-1"
              style={{ backgroundColor: step.personaColor }}
            >
              <Icon name="ArrowTopRightOnSquareIcon" size={13} />
              Open Screen
            </Link>
          </div>

          {/* Talking points */}
          <div className="mx-5 mt-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                Talking Points
              </p>
              {!showAllPoints && (
                <button
                  onClick={() => setShowAllPoints(true)}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Show all
                </button>
              )}
            </div>

            <div className="space-y-2">
              {step.talkingPoints.map((point, pi) => {
                const isVisible = showAllPoints || pi <= talkingPointIndex;
                const isCurrent = !showAllPoints && pi === talkingPointIndex;
                if (!isVisible) return null;
                return (
                  <div
                    key={pi}
                    className={`flex gap-3 p-3 rounded-lg border transition-all ${
                      isCurrent
                        ? 'border-white/20 bg-white/8'
                        : 'border-white/5 bg-white/3 opacity-60'
                    }`}
                    style={
                      isCurrent
                        ? {
                            borderColor: step.personaColor + '50',
                            backgroundColor: step.personaColor + '12',
                          }
                        : {}
                    }
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-2xs font-bold flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: isCurrent ? step.personaColor : '#ffffff20' }}
                    >
                      {pi + 1}
                    </div>
                    <p className="text-white/80 text-sm leading-relaxed">{point}</p>
                  </div>
                );
              })}
            </div>

            {/* Reveal next talking point */}
            {!showAllPoints && talkingPointIndex < step.talkingPoints.length - 1 && (
              <button
                onClick={nextTalkingPoint}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
              >
                <Icon name="ChevronDownIcon" size={13} />
                Next talking point ({talkingPointIndex + 2} of {step.talkingPoints.length})
              </button>
            )}
          </div>

          {/* Transition note */}
          {step.transitionNote && (
            <div className="mx-5 mt-4 mb-2 p-3 rounded-lg border border-white/10 bg-white/5">
              <div className="flex items-start gap-2">
                <Icon
                  name="ArrowRightCircleIcon"
                  size={14}
                  className="text-white/40 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-white/40 text-2xs font-semibold uppercase tracking-widest mb-1">
                    Transition
                  </p>
                  <p className="text-white/60 text-xs leading-relaxed">{step.transitionNote}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom nav */}
          <div className="mx-5 mt-4 mb-5 flex items-center gap-3">
            <button
              onClick={goPrev}
              disabled={isFirstStep}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-20 disabled:cursor-not-allowed transition-colors rounded-lg"
            >
              <Icon name="ChevronLeftIcon" size={16} />
              Back
            </button>

            {isLastStep ? (
              <button
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
              >
                <Icon name="CheckCircleIcon" size={16} />
                Demo Complete
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors hover:opacity-90"
                style={{ backgroundColor: step.personaColor }}
              >
                Next
                <Icon name="ChevronRightIcon" size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Middle panel — step map (hidden when ref panel is open on smaller screens) */}
        <div
          className={`hidden lg:flex flex-col overflow-y-auto p-5 gap-4 transition-all ${refPanelOpen ? 'xl:flex w-[280px] flex-shrink-0' : 'flex-1'}`}
        >
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest flex-shrink-0">
            Full Sequence Map
          </p>
          <div className="space-y-3">
            {personaStepGroups.map(({ persona, steps: pSteps, startIndex }) => {
              const isCurrentPersona = PERSONAS[step.personaIndex].id === persona.id;
              return (
                <div
                  key={persona.id}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    isCurrentPersona ? 'border-white/20' : 'border-white/5'
                  }`}
                  style={isCurrentPersona ? { borderColor: persona.color + '50' } : {}}
                >
                  {/* Persona header */}
                  <div
                    className="flex items-center gap-2.5 px-4 py-2.5"
                    style={{
                      backgroundColor: isCurrentPersona
                        ? persona.color + '20'
                        : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-2xs font-bold flex-shrink-0"
                      style={{
                        backgroundColor: persona.color,
                        opacity: isCurrentPersona ? 1 : 0.5,
                      }}
                    >
                      {PERSONAS.indexOf(persona) + 1}
                    </div>
                    <p
                      className="text-xs font-semibold"
                      style={{ color: isCurrentPersona ? persona.color : 'rgba(255,255,255,0.35)' }}
                    >
                      {persona.title}
                    </p>
                    <span
                      className="ml-auto text-2xs"
                      style={{
                        color: isCurrentPersona ? persona.color + 'aa' : 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {pSteps.length} screens
                    </span>
                  </div>
                  {/* Screens */}
                  <div className="divide-y divide-white/5">
                    {pSteps.map((s, si) => {
                      const globalIdx = startIndex + si;
                      const isCurrent = globalIdx === stepIndex;
                      const isDone = completedSteps.has(globalIdx);
                      return (
                        <button
                          key={globalIdx}
                          onClick={() => jumpToStep(globalIdx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5 ${
                            isCurrent ? 'bg-white/8' : ''
                          }`}
                          style={isCurrent ? { backgroundColor: persona.color + '15' } : {}}
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0"
                            style={{
                              backgroundColor: isDone
                                ? '#198038'
                                : isCurrent
                                  ? persona.color
                                  : 'rgba(255,255,255,0.1)',
                            }}
                          >
                            {isDone ? (
                              <Icon name="CheckIcon" size={9} />
                            ) : (
                              <span style={{ fontSize: '9px' }}>{si + 1}</span>
                            )}
                          </div>
                          <p
                            className={`text-xs flex-1 min-w-0 truncate ${
                              isCurrent
                                ? 'font-semibold'
                                : isDone
                                  ? 'text-white/40'
                                  : 'text-white/50'
                            }`}
                            style={isCurrent ? { color: persona.color } : {}}
                          >
                            {s.screenLabel}
                          </p>
                          {isCurrent && (
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: persona.color }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completion state */}
          {completedSteps.size === totalSteps - 1 && stepIndex === totalSteps - 1 && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
              <Icon name="CheckCircleIcon" size={28} className="text-green-400 mx-auto mb-2" />
              <p className="text-green-300 text-sm font-bold">All {totalSteps} steps complete</p>
              <p className="text-green-400/60 text-xs mt-1">8 personas · whole-person story told</p>
            </div>
          )}
        </div>

        {/* Right panel — Searchable Reference Panel */}
        {refPanelOpen && (
          <div className="hidden lg:flex flex-col flex-1 border-l border-white/10 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="BookOpenIcon" size={15} className="text-white/50" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">
                  Presenter Reference
                </span>
                <span className="text-2xs text-white/25 bg-white/8 px-1.5 py-0.5 rounded-full">
                  {ALL_SCREEN_REFS.length} screens
                </span>
              </div>
              <button
                onClick={() => setRefPanelOpen(false)}
                className="p-1 text-white/30 hover:text-white/60 transition-colors rounded"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
            <ReferencePanel currentStepIndex={stepIndex} onJumpToStep={jumpToStep} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DemoOnboardingPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedSet, setCompletedSet] = useState<Set<number>>(new Set());
  const [timingMode, setTimingMode] = useState<'full' | 'half' | 'quick'>('full');
  const [demoTrackOpen, setDemoTrackOpen] = useState(false);

  const persona = PERSONAS[activeIndex];

  function goTo(index: number) {
    setCompletedSet((prev) => {
      const next = new Set(prev);
      next.add(activeIndex);
      return next;
    });
    setActiveIndex(index);
  }

  function goNext() {
    if (activeIndex < PERSONAS.length - 1) goTo(activeIndex + 1);
  }

  function goPrev() {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  }

  const progressPct = Math.round((completedSet.size / PERSONAS.length) * 100);
  const totalMinutes = PERSONAS.reduce((sum, p) => sum + p.timing[timingMode], 0);

  return (
    <AppLayout
      pageTitle="Demo Onboarding Guide"
      breadcrumbs={[{ label: 'System' }, { label: 'Demo Onboarding' }]}
    >
      {/* Demo Track Overlay */}
      {demoTrackOpen && <DemoTrackOverlay onClose={() => setDemoTrackOpen(false)} />}

      {/* Header strip */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-carbon-gray-100">8-Persona Demo Sequence</h2>
            <p className="text-sm text-carbon-gray-50 mt-0.5">
              State Executive → Network Director → Physician → Care Manager → CHW → BH &amp; Crisis
              → Specialist → Quality Analyst
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            {/* Demo Track CTA */}
            <button
              onClick={() => setDemoTrackOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg shadow-md hover:opacity-90 transition-all"
              style={{ background: 'linear-gradient(135deg, #0043ce 0%, #6929c4 100%)' }}
            >
              <Icon name="PlayCircleIcon" size={18} />
              Start Demo Track
            </button>
            <div className="text-right">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-widest font-semibold">
                Progress
              </p>
              <p className="text-sm font-bold text-carbon-gray-100">
                {completedSet.size} / {PERSONAS.length} complete
              </p>
            </div>
            <div className="w-24 h-2 bg-carbon-gray-20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, backgroundColor: '#0043ce' }}
              />
            </div>
          </div>
        </div>

        {/* Demo Track info banner */}
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
          <Icon name="PlayCircleIcon" size={18} className="text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">Demo Track Mode</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Step-by-step presenter guidance — {DEMO_TRACK_STEPS.length} steps across 8 personas
              with talking points, screen links, and transition cues. Use ← → arrow keys to advance.
            </p>
          </div>
          <button
            onClick={() => setDemoTrackOpen(true)}
            className="flex-shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 transition-colors"
          >
            Launch →
          </button>
        </div>

        {/* Timing mode selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest">
            Demo Format:
          </span>
          {TIMING_MODES.map((tm) => (
            <button
              key={tm.key}
              onClick={() => setTimingMode(tm.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors rounded-full ${
                timingMode === tm.key
                  ? 'text-white border-transparent'
                  : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
              }`}
              style={
                timingMode === tm.key ? { backgroundColor: tm.color, borderColor: tm.color } : {}
              }
            >
              <Icon name="ClockIcon" size={12} />
              {tm.label}
            </button>
          ))}
          <span className="text-2xs text-carbon-gray-50 ml-1">Total: ~{totalMinutes} min</span>
        </div>

        {/* Persona stepper */}
        <div className="bg-white border border-carbon-gray-20 rounded-xl p-4">
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
            {PERSONAS.map((p, i) => (
              <React.Fragment key={p.id}>
                <PersonaCard
                  persona={p}
                  isActive={i === activeIndex}
                  isCompleted={completedSet.has(i)}
                  onClick={() => goTo(i)}
                  index={i}
                />
                {i < PERSONAS.length - 1 && (
                  <div className="flex-1 h-px bg-carbon-gray-20 min-w-[8px] flex-shrink" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main content — two-column */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Persona detail */}
        <div className="xl:col-span-2 space-y-5">
          {/* Persona header */}
          <div
            className="rounded-xl p-6 border-2"
            style={{ backgroundColor: persona.bgLight, borderColor: persona.color + '40' }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ backgroundColor: persona.color }}
              >
                {persona.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: persona.color }}
                  >
                    {persona.role}
                  </span>
                  <span className="text-2xs font-medium text-carbon-gray-50 bg-white/70 px-2 py-0.5 rounded-full border border-carbon-gray-20">
                    {persona.sidebarGroup}
                  </span>
                  <span className="text-2xs font-medium text-carbon-gray-50 bg-white/70 px-2 py-0.5 rounded-full border border-carbon-gray-20 flex items-center gap-1">
                    <Icon name="ClockIcon" size={10} />
                    {persona.timing[timingMode]} min
                  </span>
                  {completedSet.has(activeIndex) && (
                    <span className="text-2xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Icon name="CheckCircleIcon" size={12} /> Reviewed
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold mb-1" style={{ color: persona.textColor }}>
                  {persona.title}
                </h3>
                <p className="text-sm italic" style={{ color: persona.color }}>
                  {persona.question}
                </p>
              </div>
            </div>

            {/* Key insight */}
            <div className="mt-4 p-3 bg-white/70 rounded-lg border border-white">
              <div className="flex items-start gap-2">
                <Icon
                  name="LightBulbIcon"
                  size={16}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: persona.color } as React.CSSProperties}
                />
                <p className="text-sm text-carbon-gray-70 leading-relaxed">{persona.keyInsight}</p>
              </div>
            </div>

            {/* Tooltips */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest self-center">
                Key Concepts:
              </span>
              {persona.tooltips.map((tt) => (
                <Tooltip key={tt.id} tooltip={tt} accentColor={persona.color} />
              ))}
            </div>
          </div>

          {/* Demo screens */}
          <div className="bg-white border border-carbon-gray-20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-carbon-gray-100">
                Demo Screens for This Persona
              </h4>
              <span className="text-2xs text-carbon-gray-50">
                {persona.screens.length} screens · ~{persona.timing[timingMode]} min
              </span>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {persona.screens.map((screen, si) => (
                <div
                  key={`${screen.route}-${si}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-carbon-gray-10 transition-colors group"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: persona.color }}
                  >
                    {si + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-carbon-gray-100">{screen.label}</p>
                    <p className="text-xs text-carbon-gray-50 mt-0.5">{screen.storyBeat}</p>
                  </div>
                  <Link
                    href={screen.route}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all opacity-0 group-hover:opacity-100"
                    style={{ backgroundColor: persona.color }}
                  >
                    Open <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={activeIndex === 0}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg"
            >
              <Icon name="ChevronLeftIcon" size={16} />
              Previous
            </button>

            <div className="flex items-center gap-1.5">
              {PERSONAS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    backgroundColor:
                      i === activeIndex
                        ? persona.color
                        : completedSet.has(i)
                          ? '#a8a8a8'
                          : '#e0e0e0',
                    transform: i === activeIndex ? 'scale(1.4)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            {activeIndex < PERSONAS.length - 1 ? (
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors"
                style={{ backgroundColor: persona.color }}
              >
                Next: {PERSONAS[activeIndex + 1].initials}
                <Icon name="ChevronRightIcon" size={16} />
              </button>
            ) : (
              <button
                onClick={() => setCompletedSet(new Set(PERSONAS.map((_, i) => i)))}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                <Icon name="CheckCircleIcon" size={16} />
                Complete Demo
              </button>
            )}
          </div>
        </div>

        {/* Right: Sample data + narrative arc */}
        <div className="space-y-5">
          {/* Sample data panel */}
          <div className="bg-white border border-carbon-gray-20 rounded-xl overflow-hidden">
            <div
              className="px-5 py-3 border-b"
              style={{ backgroundColor: persona.bgLight, borderColor: persona.color + '30' }}
            >
              <h4 className="text-sm font-semibold" style={{ color: persona.textColor }}>
                Pre-Populated Sample Data
              </h4>
              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                Representative values for this persona&apos;s view
              </p>
            </div>
            <div className="divide-y divide-carbon-gray-10">
              {persona.sampleData.map((d) => (
                <div
                  key={d.label}
                  className={`flex items-center justify-between px-5 py-3 ${d.highlight ? 'bg-carbon-gray-10' : ''}`}
                >
                  <span className="text-xs text-carbon-gray-50">{d.label}</span>
                  <span
                    className={`text-sm font-bold ${d.highlight ? '' : 'text-carbon-gray-100'}`}
                    style={d.highlight ? { color: persona.color } : {}}
                  >
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Handoff */}
          {persona.handoffTo && (
            <div className="bg-white border border-carbon-gray-20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="ArrowRightCircleIcon" size={16} className="text-carbon-gray-50" />
                <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest">
                  Hands Off To
                </span>
              </div>
              <p className="text-sm font-semibold text-carbon-gray-100">{persona.handoffTo}</p>
              <p className="text-xs text-carbon-gray-50 mt-1">
                The demo narrative continues — each persona&apos;s output becomes the next
                persona&apos;s input.
              </p>
            </div>
          )}

          {/* Narrative arc */}
          <div className="bg-white border border-carbon-gray-20 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-carbon-gray-100 mb-3">Full Narrative Arc</h4>
            <div className="space-y-1.5">
              {PERSONAS.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                    i === activeIndex ? 'bg-carbon-gray-10' : 'hover:bg-carbon-gray-10'
                  }`}
                  onClick={() => goTo(i)}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold text-white flex-shrink-0"
                    style={{
                      backgroundColor: completedSet.has(i) ? '#198038' : p.color,
                      opacity: i === activeIndex ? 1 : 0.7,
                    }}
                  >
                    {completedSet.has(i) && i !== activeIndex ? (
                      <Icon name="CheckIcon" size={10} />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${i === activeIndex ? 'text-carbon-gray-100' : 'text-carbon-gray-50'}`}
                    >
                      {p.title}
                    </p>
                    <p className="text-2xs text-carbon-gray-40 truncate">
                      {p.screens.length} screens · {p.timing[timingMode]}m
                    </p>
                  </div>
                  {i === activeIndex && (
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-carbon-gray-10 flex items-center justify-between">
              <span className="text-2xs text-carbon-gray-50">Total runtime</span>
              <span className="text-xs font-bold text-carbon-gray-100">~{totalMinutes} min</span>
            </div>
          </div>

          {/* All complete state */}
          {completedSet.size === PERSONAS.length && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <Icon name="CheckCircleIcon" size={32} className="text-green-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-green-800">Demo Sequence Complete</p>
              <p className="text-xs text-green-600 mt-1">
                All 8 personas reviewed. The platform tells a single connected whole-person story.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
