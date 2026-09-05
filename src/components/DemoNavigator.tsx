'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { useDemoStore } from '@/uhg/store/demoStore';
import { DEFAULT_CITIZEN } from '@/uhg/data/persona';

// ─── Demo Sequence Definition ─────────────────────────────────────────────────

interface DemoStep {
  route: string;
  label: string;
  storyBeat: string;
  stepNum: number;
  // If set, this patient ID is activated before navigating to this step
  activePatient?: string;
}

interface DemoPersona {
  id: string;
  role: string;
  title: string;
  color: string;
  bgLight: string;
  textColor: string;
  initials: string;
  steps: DemoStep[];
}

// ─── Full Sequence (10 personas · 54 steps — unchanged) ───────────────────────

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'state-executive',
    role: 'P1',
    title: 'State Medicaid Executive',
    color: '#0043ce',
    bgLight: '#d0e2ff',
    textColor: '#001d6c',
    initials: 'SE',
    steps: [
      {
        stepNum: 1,
        route: '/contract-program-selection',
        label: 'WPCO Overview',
        storyBeat: 'All-program view — Clinical + BH + Social KPIs',
      },
      {
        stepNum: 2,
        route: '/region-view',
        label: 'Regions',
        storyBeat: 'Regional rollup — Clinical + Social + BH benchmarking',
      },
      {
        stepNum: 3,
        route: '/executive-outcomes-dashboard',
        label: 'Executive Dashboard',
        storyBeat: 'Whole-person outcomes delivered',
      },
      {
        stepNum: 4,
        route: '/financial-dashboard',
        label: 'Financial Dashboard (Braided Funding)',
        storyBeat: 'Braided funding streams + shared savings model',
      },
      {
        stepNum: 5,
        route: '/social-needs-dashboard',
        label: 'Social Needs Dashboard',
        storyBeat: 'Population screening funnel + dual-need cohort',
      },
      {
        stepNum: 6,
        route: '/outcomes-linkage',
        label: 'Outcomes Linkage',
        storyBeat: 'Housing → ED reduction, food → A1C — ROI proof',
      },
    ],
  },
  {
    id: 'network-director',
    role: 'P2',
    title: 'Network / Population Health Director',
    color: '#6929c4',
    bgLight: '#f6f2ff',
    textColor: '#31135e',
    initials: 'ND',
    steps: [
      {
        stepNum: 7,
        route: '/provider-level',
        label: 'Program Networks',
        storyBeat: 'Clinical / BH / CBO network tabs — org-level performance',
      },
      {
        stepNum: 8,
        route: '/physician-view',
        label: 'Care Team Members',
        storyBeat: 'PCPs + BH counselors + CHW supervisors — role-typed metrics',
      },
      {
        stepNum: 9,
        route: '/stars-hedis-mips',
        label: 'Quality Gaps & Attribution',
        storyBeat: 'Clinical + BH + Social program quality measures — 5 tabs',
      },
    ],
  },
  {
    id: 'physician',
    role: 'P3',
    title: 'Primary Care Physician',
    color: '#007d79',
    bgLight: '#d9fbfb',
    textColor: '#004144',
    initials: 'MD',
    steps: [
      {
        stepNum: 10,
        route: '/md-smart-launch',
        label: 'MD Smart Launch',
        storyBeat: 'SMART on FHIR entry — embedded in EMR',
      },
      {
        stepNum: 11,
        route: '/panel-cohort-view',
        label: 'Panel & Cohort (Medicaid Whole Person Care Track 3)',
        storyBeat: 'Attributed panel — PCP / CHW / BH three-column attribution',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 12,
        route: '/patient-detail',
        label: 'Patient Detail — Whole Person Care Plan',
        storyBeat: 'Whole Person Care Plan tab + AI care plan + gain-share',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 13,
        route: '/prior-auth',
        label: 'Prior Authorization — CRD · DTR · PAS',
        storyBeat: "Maria's lumbar MRI: CRD ✓ → DTR two-column policy match → HITL PAS submission",
        activePatient: 'MARIA_SD_001',
      },
    ],
  },
  {
    id: 'care-manager',
    role: 'P4',
    title: 'Care Manager',
    color: '#da1e28',
    bgLight: '#fff1f1',
    textColor: '#750e13',
    initials: 'CM',
    steps: [
      {
        stepNum: 14,
        route: '/care-manager',
        label: 'Care Manager Worklist',
        storyBeat: 'Clinical/BH/Social filter — BH risk flags + social needs per row',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 15,
        route: '/patient-episode-summary',
        label: 'Patient Episode Summary',
        storyBeat: 'All episodes for a patient',
      },
      {
        stepNum: 16,
        route: '/episode-detail',
        label: 'Episode Detail',
        storyBeat: 'Episode deep-dive — care setting timeline',
      },
      {
        stepNum: 17,
        route: '/episodic-management-analytics',
        label: 'Episodic Analytics',
        storyBeat: 'Clinical + BH Episodes + Social Program Outcomes tabs',
      },
    ],
  },
  {
    id: 'chw',
    role: 'P5',
    title: 'Community Health Worker',
    color: '#198038',
    bgLight: '#defbe6',
    textColor: '#044317',
    initials: 'CW',
    steps: [
      {
        stepNum: 18,
        route: '/chw-workflow',
        label: 'CHW Workflow',
        storyBeat: 'Home Visit Schedule — Start Visit, Clinical, Reschedule actions',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 19,
        route: '/social-needs-screening',
        label: 'Social Needs Screening',
        storyBeat: 'PRAPARE screening → social Task creation',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 20,
        route: '/program-eligibility',
        label: 'Program Eligibility',
        storyBeat: 'Eligible programs from screening results',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 21,
        route: '/benefit-enrollment',
        label: 'Benefit Enrollment',
        storyBeat: 'SNAP enrolled, housing pending, gaps flagged',
        activePatient: 'MARIA_SD_001',
      },
    ],
  },
  {
    id: 'bh-crisis',
    role: 'P6',
    title: 'BH & Crisis Specialist',
    color: '#9f1853',
    bgLight: '#fff0f7',
    textColor: '#740937',
    initials: 'BH',
    steps: [
      {
        stepNum: 22,
        route: '/crisis-pathway',
        label: 'Crisis Pathway',
        storyBeat: 'SDOH context + 988/CSU/Mobile/ED dispatch + post-crisis linkage',
      },
      {
        stepNum: 23,
        route: '/crisis-pathway',
        label: 'Patient Pathway — Dorothy Simmons',
        storyBeat: 'PRAPARE → SNAP → BH engagement → A1C 9.2% → 7.1%',
      },
      {
        stepNum: 24,
        route: '/cbo-directory',
        label: 'CBO Directory',
        storyBeat: 'Community org network — domain-tagged, capacity status',
      },
    ],
  },
  {
    id: 'specialist',
    role: 'P7',
    title: 'Specialist / Care Team',
    color: '#f1620a',
    bgLight: '#fff2e8',
    textColor: '#8a3800',
    initials: 'SP',
    steps: [
      {
        stepNum: 25,
        route: '/care-team-inbox',
        label: 'Care Team Inbox',
        storyBeat: 'Universal task inbox — all programs',
      },
      {
        stepNum: 26,
        route: '/specialist-inbox',
        label: 'Specialist Inbox',
        storyBeat: 'Clinical specialist role view + gain-share value',
      },
      {
        stepNum: 27,
        route: '/referral-tracking',
        label: 'Referral Tracking',
        storyBeat: 'Referrals in flight + multi-program tasks',
      },
      {
        stepNum: 28,
        route: '/referral-journey-tracker',
        label: 'Referral Journey Tracker',
        storyBeat: 'End-to-end journey — 7 stages + audit trail',
      },
    ],
  },
  {
    id: 'analyst',
    role: 'P8',
    title: 'Quality / Compliance Analyst',
    color: '#8a3ffc',
    bgLight: '#f6f2ff',
    textColor: '#31135e',
    initials: 'QA',
    steps: [
      {
        stepNum: 29,
        route: '/care-gap-closure-verification',
        label: 'Care Gap Closure & Verification',
        storyBeat: 'Multi-program evidence chain — FHIR provenance',
      },
      {
        stepNum: 30,
        route: '/stars-hedis-mips',
        label: 'Quality Gaps & Attribution',
        storyBeat: 'Clinical + BH + Social program quality measures — 5 tabs',
      },
      {
        stepNum: 31,
        route: '/outcomes-linkage',
        label: 'Outcomes Linkage',
        storyBeat: 'Social ROI — executive closing proof',
      },
      {
        stepNum: 32,
        route: '/executive-outcomes-dashboard',
        label: 'Executive Dashboard',
        storyBeat: 'Closed loop — patient → network → state outcome',
      },
      {
        stepNum: 33,
        route: '/api-explorer',
        label: 'CMS-0057-F API Explorer',
        storyBeat:
          'Live BFF endpoint testing — 5 provision tabs, 14 endpoints, compliance annotations',
      },
    ],
  },
  {
    id: 'agentic-maria',
    role: 'P9',
    title: 'Agentic Story — Maria Redhawk',
    color: '#4f46e5',
    bgLight: '#ede9fe',
    textColor: '#2e1065',
    initials: 'AM',
    steps: [
      {
        stepNum: 34,
        route: '/uhg-orchestrate/fragmentation-split-system-view',
        label: 'One Enterprise · Five Entities',
        storyBeat: "Why fragmentation breaks Maria's care across UHC, Optum, Surest, UMR, Rally",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 35,
        route: '/uhg-orchestrate/cdp-assembly-split',
        label: 'CDP Assembly',
        storyBeat:
          "52 data dimensions unified — Maria's consent-governed citizen profile assembled",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 36,
        route: '/whole-person-care-summary',
        label: 'Whole Person Care View',
        storyBeat:
          "All 52 dimensions of Maria's life visible in one knowledge graph — 4 roles, 14 streams, 4 consent layers",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 37,
        route: '/uhg-orchestrate/consumer-360',
        label: 'Journey-Aware Context',
        storyBeat: "Maria's live episode window — milestones, expected vs. unexpected signals",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 38,
        route: '/uhg-orchestrate/whole-person-care',
        label: 'Whole Person Care Intelligence',
        storyBeat:
          'SDOH amplifiers: Financial 82, Caregiver Burden 88, Transport blocker → care plan mods',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 39,
        route: '/uhg-orchestrate/signal-disposition-engine',
        label: 'Signal Disposition Engine',
        storyBeat: "Live signals from Maria's care events — agents dispatched in real-time",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 40,
        route: '/uhg-orchestrate/controller-agentic-super-orchestration-centerpiece',
        label: 'Agentic Super Orchestration',
        storyBeat: 'Controller agent coordinates CHW + Clinical + BH + Social agents for Maria',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 41,
        route: '/uhg-orchestrate/agent-library',
        label: 'Agentic Marketplace',
        storyBeat: "Agents activated for Maria's case — roles, triggers, outcomes",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 42,
        route: '/uhg-orchestrate/family-sofia',
        label: 'Family Thread',
        storyBeat:
          "Maria's dependent Sofia — pediatric gaps surfaced and orchestrated in the household loop",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 43,
        route: '/uhg-orchestrate/caregiver-elena',
        label: 'Caregiver Intelligence',
        storyBeat: "Maria as caregiver — Elena's INR, polypharmacy, Martin Pharmacy refill sync",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 44,
        route: '/uhg-orchestrate/portfolio-scale',
        label: 'Live Population Filter',
        storyBeat: "Maria's profile at population scale — cohort, risk tier, at-scale impact",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 45,
        route: '/uhg-orchestrate/agent-impact-dashboard',
        label: 'Agent Impact Dashboard',
        storyBeat: 'What agents achieved for Maria — A1C, appointments, SDOH tasks, cost avoidance',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 46,
        route: '/uhg-orchestrate/reporting-dashboard',
        label: 'Agent Impact — Reporting',
        storyBeat: "Closed loop — Maria's case as proof-point for enterprise agentic ROI",
        activePatient: 'MARIA_SD_001',
      },
    ],
  },
  {
    id: 'watsonx-demo',
    role: 'P10',
    title: 'watsonx 3-Minute Demo',
    color: '#007d79',
    bgLight: '#d9fbfb',
    textColor: '#004144',
    initials: 'WX',
    steps: [
      {
        stepNum: 47,
        route: '/uhg-orchestrate/cdp-assembly-split',
        label: '1 · CDP Assembly',
        storyBeat: '4 systems, 4 records → one unified identity — knowledge graph assembly (0:50)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 48,
        route: '/whole-person-care-summary',
        label: '2 · Whole Person Care View',
        storyBeat:
          "Knowledge graph — 52 dimensions of Maria's life; caregiver burden is the root cause (1:10)",
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 49,
        route: '/patient-detail',
        label: '3 · Patient Detail — 360°',
        storyBeat: 'Whole Person Care Plan tab — every dimension of her life (1:30)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 50,
        route: '/md-smart-launch',
        label: '4 · MD Smart Launch — Care Plan',
        storyBeat: 'Cerner SmartApp — tiered care plan, respite first → click Approve (1:55)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 51,
        route: '/cbo-directory',
        label: '5 · CBO Directory',
        storyBeat: 'Community referrals — digital, tracked, closed-loop (2:10)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 52,
        route: '/care-gap-closure-verification',
        label: '6 · Gap Closure Verification',
        storyBeat: 'All 3 gaps CLOSED — evidence chain verified (2:25)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 53,
        route: '/executive-outcomes-dashboard',
        label: '7 · Executive Outcomes',
        storyBeat: '6,842 gaps closed · ED ↓18% · $1.1M reinvested — close here (2:45)',
        activePatient: 'MARIA_SD_001',
      },
      {
        stepNum: 54,
        route: '/md-smart-launch',
        label: '8 · MD SmartApp — Encore',
        storyBeat: 'Cerner PowerChart view — FHIR-native, write-back orders (3:00)',
        activePatient: 'MARIA_SD_001',
      },
    ],
  },
];

// Flat list of all steps for prev/next navigation
const ALL_STEPS: (DemoStep & { personaId: string; personaColor: string })[] = DEMO_PERSONAS.flatMap(
  (p) => p.steps.map((s) => ({ ...s, personaId: p.id, personaColor: p.color }))
);

// ─── Story Mode (15 steps · ~20–25 min curated narrative) ────────────────────
// Each step references an existing route. stepNum is local to story mode (1–15).

interface StoryStep extends DemoStep {
  chapter: string;
  chapterColor: string;
  // Storytelling overlay extensions
  narratorLines: string[]; // Reveal one at a time — the presenter's spoken voice
  pausePrompt?: string; // Optional "pause and reflect" cue shown after all lines
  chapterIntro?: string; // First step of a chapter gets a chapter-transition card
  metric?: { label: string; value: string }; // Hero stat shown on the right side
  persona?: string; // Who is "speaking" from — shown as attribution
  mood?: 'neutral' | 'tense' | 'hopeful' | 'decisive'; // Visual accent
}

// ── Chapter intro cards — shown as a full-screen interstitial before the first step ──
interface ChapterCard {
  chapter: string;
  color: string;
  headline: string;
  subline: string;
  reflectionPrompt: string;
}

const CHAPTER_CARDS: ChapterCard[] = [
  {
    chapter: 'Ch.1 · The Problem',
    color: '#0043ce',
    headline: 'The system sees programs. Not people.',
    subline:
      'A State Medicaid Executive opens her dashboard. She has 47 counties, 128,000 members, and three separate systems that have never spoken to each other.',
    reflectionPrompt:
      'Before we go further — what does it cost when clinical, behavioral, and social data live in separate silos?',
  },
  {
    chapter: 'Ch.2 · Meet Maria',
    color: '#007d79',
    headline: 'Her name is Maria Redhawk.',
    subline:
      "She lives in Pine Ridge — 90 miles from the nearest specialist. Her A1C is 9.2. She hasn't eaten a full meal in three days. Her doctor doesn't know either of those last two facts.",
    reflectionPrompt:
      'Maria is not an edge case. She is 38% of your attributed population. The question is whether your platform can see the whole person.',
  },
  {
    chapter: 'Ch.3 · In the Community',
    color: '#198038',
    headline: "Care doesn't live in the clinic.",
    subline:
      "Marcus, the Community Health Worker, pulls up to Maria's home. On his phone: her visit checklist, her clinical context, and the PRAPARE screening questions — all pre-loaded.",
    reflectionPrompt:
      'The last mile of care is a home visit. Does your platform equip the person standing at the door?',
  },
  {
    chapter: 'Ch.4 · The Closed Loop',
    color: '#8a3ffc',
    headline: 'What gets measured, gets closed.',
    subline:
      "Three gaps: A1C, behavioral health engagement, food security. All three closed. All three evidenced by FHIR provenance chains. All three traceable to the governor's dashboard.",
    reflectionPrompt:
      "Closing a gap is not the same as proving it was closed. Here's what proof looks like.",
  },
  {
    chapter: 'Ch.5 · The Mandate',
    color: '#0369a1',
    headline: 'The auditor is also in the room.',
    subline:
      "Every CMS-0057-F compliance endpoint, live and callable. Because the state doesn't just need outcomes — it needs evidence the system earned them.",
    reflectionPrompt:
      "This is not a slideshow. Every number you've seen tonight is drawn from a live FHIR-compliant platform. The API is open right now.",
  },
];

const STORY_STEPS: StoryStep[] = [
  // ── Chapter 1: The Problem ──────────────────────────────────────────────────
  {
    stepNum: 1,
    chapter: 'Ch.1 · The Problem',
    chapterColor: '#0043ce',
    route: '/contract-program-selection',
    label: 'WPCO Overview',
    storyBeat:
      'Every program, every dollar — one view. This is what a State Medicaid Executive sees on day one.',
    chapterIntro: 'Ch.1 · The Problem',
    persona: 'State Medicaid Executive',
    mood: 'neutral',
    metric: { label: 'Attributed Lives', value: '128,400' },
    narratorLines: [
      "This is the view she's been waiting three years to see.",
      'One screen. 47 counties. Three program types — Clinical, Behavioral Health, and Social. $4.2 million in shared savings, tracked in real time.',
      'Before this platform, she had three reports, two spreadsheets, and a lot of faith.',
      'Point to the program-type filter. Switch from "All" to "Clinical." Then to "BH." Then to "Social." Each switch redraws the KPI strip. Every domain has its own accountability — and all three live in the same hierarchy.',
    ],
    pausePrompt:
      'Pause here. Ask the room: where else can you see clinical, behavioral, and social accountability side by side — at the state level — without opening a second system?',
  },
  {
    stepNum: 2,
    chapter: 'Ch.1 · The Problem',
    chapterColor: '#0043ce',
    route: '/region-view',
    label: 'Region View',
    storyBeat:
      "Those red counties in the southwest corner — Pine Ridge, Rosebud. No specialists within 90 miles. That's where Maria lives.",
    persona: 'State Medicaid Executive',
    mood: 'tense',
    metric: { label: 'BH Access Rate — NE South Dakota', value: '49%' },
    narratorLines: [
      'Now we drill down. Four regions, benchmarked side by side on three domains.',
      "See that northeast quadrant — 49% BH access rate. That's not a rounding error. That's a population that can't get to a behavioral health provider.",
      'And see Pine Ridge, Rosebud, in the southwest. Red on clinical gap closure. Red on social screening. No specialists within 90 miles.',
      "This is where Maria lives. She's not a data point yet — but she's about to become one.",
    ],
    pausePrompt:
      "Let the map sit for a moment. Those red counties represent real people who are already enrolled in this program — and the platform already knows they're underserved.",
  },
  // ── Chapter 2: Meet Maria ───────────────────────────────────────────────────
  {
    stepNum: 3,
    chapter: 'Ch.2 · Meet Maria',
    chapterColor: '#007d79',
    route: '/panel-cohort-view',
    label: 'Panel & Cohort',
    storyBeat:
      "Dr. Chen's panel — Maria flagged: BH risk, food gap, overdue A1C. The platform surfaces all three, not just the clinical one.",
    chapterIntro: 'Ch.2 · Meet Maria',
    activePatient: 'MARIA_SD_001',
    persona: 'Primary Care Physician — Dr. Chen',
    mood: 'neutral',
    metric: { label: 'Tier 1 High-Risk Patients', value: '94' },
    narratorLines: [
      "Dr. Chen opens his panel. 847 patients. He doesn't have time to review all of them — so the platform ranked them.",
      'Maria Redhawk. Row three. Three flags: BH risk. Food insecurity. A1C overdue.',
      "Old system: he'd see one of those. Maybe two, if he was lucky. The platform shows all three — because it knows that if you only treat the A1C and miss the food insecurity, the A1C comes back in six weeks.",
      "Notice the three attribution columns. Clinical PCP: Dr. Chen. Assigned CHW: Marcus. BH Provider: none yet. That's the gap.",
    ],
    pausePrompt:
      "Which of your patients have a CHW assigned but no BH provider? That's a coordination gap that costs you — and them — more than you think.",
  },
  {
    stepNum: 4,
    chapter: 'Ch.2 · Meet Maria',
    chapterColor: '#007d79',
    route: '/patient-detail',
    label: 'Patient Detail — Whole Person Care Plan',
    storyBeat:
      "Every dimension of Maria's life — clinical, behavioral, social, caregiver burden — unified in one plan.",
    activePatient: 'MARIA_SD_001',
    persona: 'Primary Care Physician — Dr. Chen',
    mood: 'hopeful',
    metric: { label: 'Gain-Share Eligible Per Gap Closed', value: '$18,400' },
    narratorLines: [
      "Open Maria's record. Navigate to the Whole Person Care Plan tab.",
      'Clinical goals: A1C below 8, hypertension controlled. BH goals: 12-week engagement initiated, follow-up after ED visit. Social goals: SNAP enrolled, housing application submitted.',
      'Three domains. One plan. One responsible care team. Every goal has a status, a due date, and a name attached to it.',
      "And at the bottom — the gain-share value per open gap. $18,400 is the total financial incentive available to Dr. Chen's panel if these gaps close this measurement year.",
      'This is the financial alignment that makes whole-person care sustainable, not just aspirational.',
    ],
    pausePrompt:
      'Pause here. What does it mean when a physician can see — in the same view — the clinical need, the social barrier, and the financial incentive to close both?',
  },
  {
    stepNum: 5,
    chapter: 'Ch.2 · Meet Maria',
    chapterColor: '#007d79',
    route: '/md-smart-launch',
    label: 'MD Smart Launch',
    storyBeat: 'The same data, inside Cerner — SMART on FHIR. Dr. Chen never leaves the EHR.',
    activePatient: 'MARIA_SD_001',
    persona: 'Primary Care Physician — Dr. Chen',
    mood: 'neutral',
    metric: { label: 'EHR Integration', value: 'SMART on FHIR' },
    narratorLines: [
      'Now here\'s the question every physician asks: "Does this mean I have to log into another system?"',
      'No. Open the MD Smart Launch screen. This is what Dr. Chen sees inside Cerner — same patient, same data, embedded.',
      "SMART on FHIR. The platform doesn't ask him to change his workflow. It meets him where he already is.",
      'The care plan, the risk flags, the CHW assignment, the social needs — all surfaced inside the EHR he already uses, every day.',
    ],
  },
  {
    stepNum: 6,
    chapter: 'Ch.2 · Meet Maria',
    chapterColor: '#007d79',
    route: '/prior-auth',
    label: 'Prior Authorization — CRD · DTR · PAS',
    storyBeat:
      'Lumbar MRI ordered. AI prepares the PA. Dr. Chen reviews and approves — the AI never submits on its own.',
    activePatient: 'MARIA_SD_001',
    persona: 'Primary Care Physician — Dr. Chen',
    mood: 'decisive',
    metric: { label: 'PA Decision Time (AI-Assisted)', value: '< 90 sec' },
    narratorLines: [
      "Dr. Chen orders a lumbar MRI for Maria's back pain. Historically, that order would sit in a PA queue for 3 to 5 days.",
      "Watch what happens. CRD fires instantly — coverage requirement detected. DTR launches — the AI interrogates Maria's record and pre-fills the clinical justification. PAS submits the prior authorization request.",
      "Dr. Chen sees a review screen. He reads the AI's work. He approves — or he overrides.",
      'Important: the AI never submits on its own. Human in the loop. Always.',
      'Total elapsed time: under 90 seconds. From order to submitted PA.',
    ],
    pausePrompt:
      'This is CMS-0057-F compliance in action. The AI works for the physician — not instead of the physician.',
  },
  // ── Chapter 3: In the Community ────────────────────────────────────────────
  {
    stepNum: 7,
    chapter: 'Ch.3 · In the Community',
    chapterColor: '#198038',
    route: '/chw-workflow',
    label: 'CHW Workflow',
    storyBeat:
      "Marcus arrives at Maria's home — visit scheduled, clinical questions loaded. This is the last mile of care.",
    chapterIntro: 'Ch.3 · In the Community',
    activePatient: 'MARIA_SD_001',
    persona: 'Community Health Worker — Marcus',
    mood: 'hopeful',
    metric: { label: 'Home Visits This Month', value: '18 Scheduled' },
    narratorLines: [
      "Dr. Chen's care plan has a home visit task. Marcus gets it on his phone.",
      "He drives out to Pine Ridge. He pulls up Maria's record before he knocks on the door.",
      'Six checklist items load automatically: home safety assessment, medication review, vitals, SDOH screening, care plan goals, referral confirmation.',
      "The platform has told him exactly what to do — and exactly why he's there.",
      'Click "Start Visit." Marcus is now documenting in real time, at the kitchen table, on a phone.',
    ],
    pausePrompt:
      "The last mile of care is a CHW with a phone, standing at someone's door. Does your platform equip that moment — or stop at the clinic's edge?",
  },
  {
    stepNum: 8,
    chapter: 'Ch.3 · In the Community',
    chapterColor: '#198038',
    route: '/social-needs-screening',
    label: 'Social Needs Screening',
    storyBeat:
      'PRAPARE completed at the kitchen table — housing instability and food insecurity confirmed and coded in FHIR.',
    activePatient: 'MARIA_SD_001',
    persona: 'Community Health Worker — Marcus',
    mood: 'tense',
    metric: { label: 'Domains Flagged for Maria', value: '2 — Food + Housing' },
    narratorLines: [
      'Marcus opens the PRAPARE screening. Ten social domains. Maria answers quietly — yes to food insecurity, yes to unstable housing, no to transportation barriers.',
      'As she answers, the platform codes each response in FHIR. This is not a paper form that gets scanned later.',
      "When Marcus completes the screening, two social Tasks are auto-created and linked to her care plan. Her care manager gets a notification. The CHW's supervisor sees the screening completion rate tick up by one.",
      'And somewhere, the Quality & Compliance analyst sees the PRAPARE measure numerator increase by one.',
      'One conversation at a kitchen table. Four downstream systems updated. Zero manual data entry.',
    ],
    pausePrompt:
      'How much does a missed SDOH screening cost? Ask the room. Then show them the funnel on the next screen.',
  },
  {
    stepNum: 9,
    chapter: 'Ch.3 · In the Community',
    chapterColor: '#198038',
    route: '/crisis-pathway',
    label: 'Crisis Pathway',
    storyBeat:
      "Maria calls 988. The BH specialist sees her SDOH context instantly — CSU dispatched, not the ED. That's $4,200 saved, one visit.",
    persona: 'BH & Crisis Specialist',
    mood: 'tense',
    metric: { label: 'ED Diversions — Last 30 Days', value: '8' },
    narratorLines: [
      "Two weeks after Marcus's visit, Maria calls 988.",
      "The BH crisis specialist opens her record. Instantly — not after a search — she sees Maria's SDOH context: housing instability, food insecurity, prior self-harm history, no BH provider assigned.",
      'That context changes the dispatch decision. Not the ED — the Community Stabilization Unit. CSU can address the mental health crisis without a $4,200 emergency room bill.',
      "The specialist clicks Dispatch. A BH follow-up task is created automatically and lands in Angela's — the care manager's — worklist.",
      "Maria didn't fall through the cracks. The platform caught her — and closed the loop back to the care team.",
    ],
    pausePrompt:
      'Eight ED diversions in 30 days. Each one $4,000 to $6,000 saved. The SDOH context panel is not a nice-to-have. It is the dispatch decision.',
  },
  // ── Chapter 4: The Closed Loop ─────────────────────────────────────────────
  {
    stepNum: 10,
    chapter: 'Ch.4 · The Closed Loop',
    chapterColor: '#8a3ffc',
    route: '/care-gap-closure-verification',
    label: 'Care Gap Closure & Verification',
    storyBeat:
      'All 3 gaps closed — A1C, BH engagement, food security. Each one evidenced by a FHIR provenance chain.',
    chapterIntro: 'Ch.4 · The Closed Loop',
    activePatient: 'MARIA_SD_001',
    persona: 'Quality / Compliance Analyst',
    mood: 'decisive',
    metric: { label: 'FHIR Validation Pass Rate', value: '98.7%' },
    narratorLines: [
      "Three months pass. Let's see what happened.",
      "Maria's A1C: closed. Evidence: lab result, FHIR Observation resource, provenance chain intact.",
      'BH engagement: closed. Evidence: 12-week enrollment, session attendance records, FUH measure numerator hit.',
      'Food security: closed. Evidence: SNAP enrollment, $234/month benefit, PRAPARE re-screen showing need resolved.',
      'Each closure is not a checkbox. It is a FHIR resource with a provenance trail — auditable, queryable, reportable.',
      '98.7% of resources passed automated validation before submission. The 1.3% were flagged and corrected by the analyst.',
    ],
    pausePrompt:
      'Closing a gap is not the same as proving it was closed. The auditor in the room needs evidence, not assertions. Here it is.',
  },
  {
    stepNum: 11,
    chapter: 'Ch.4 · The Closed Loop',
    chapterColor: '#8a3ffc',
    route: '/outcomes-linkage',
    label: 'Outcomes Linkage',
    storyBeat:
      'Housing stability → ED visits down 18%. Food security → A1C from 9.2 to 7.1. This is the ROI the governor needs.',
    persona: 'Quality / Compliance Analyst',
    mood: 'hopeful',
    metric: { label: "Maria's A1C", value: '9.2 → 7.1' },
    narratorLines: [
      'Now we make the argument the governor cares about.',
      'Housing stability reduces ED visits by 34% across the population. Food security improves A1C by an average of 1.8 points.',
      "Maria's A1C went from 9.2 to 7.1. That's not anecdote — that's a data point in a cohort of 2,400.",
      "Every dollar invested in social program intervention generates $2.80 in avoided medical cost. That's the ROI number.",
      'This screen is the closing argument for continued social program funding. Show it slowly.',
    ],
    pausePrompt:
      'Pause here. This is the screen that changes the conversation from "social programs are nice to have" to "social programs are cost-effective medicine."',
  },
  {
    stepNum: 12,
    chapter: 'Ch.4 · The Closed Loop',
    chapterColor: '#8a3ffc',
    route: '/social-needs-dashboard',
    label: 'Social Needs Dashboard',
    storyBeat:
      "2,400 members screened. 38% have overlapping housing and food gaps. Maria wasn't an edge case — she was the pattern.",
    persona: 'State Medicaid Executive',
    mood: 'decisive',
    metric: { label: 'Members with Dual Social Needs', value: '38% of Panel' },
    narratorLines: [
      'The executive asks: "Is Maria an outlier, or is she the pattern?"',
      'Open the Social Needs Dashboard. 2,400 members screened. 38% have overlapping housing and food gaps — the same combination Maria had.',
      'The dual-need cohort has 2.3 times higher medical cost than single-need patients — and 3.1 times higher ROI from social intervention.',
      'Maria was not an edge case. She was the pattern. The platform knew it before the physician did.',
    ],
  },
  {
    stepNum: 13,
    chapter: 'Ch.4 · The Closed Loop',
    chapterColor: '#8a3ffc',
    route: '/executive-outcomes-dashboard',
    label: 'Executive Dashboard',
    storyBeat:
      "From Maria's kitchen table to the governor's dashboard — one closed loop. 6,842 gaps closed, $1.1M reinvested.",
    persona: 'State Medicaid Executive',
    mood: 'hopeful',
    metric: { label: 'Care Gaps Closed YTD', value: '6,842' },
    narratorLines: [
      "Back to the top. From Maria's kitchen table to the executive's screen.",
      '6,842 care gaps closed. $1.1 million in shared savings reinvested into the program. Quality score up 8.3 points.',
      'Each of those numbers has a Maria behind it. A CHW visit. A PRAPARE screening. A BH crisis diverted. A care plan completed.',
      "The platform doesn't just track the numbers — it traces the story behind them.",
    ],
    pausePrompt:
      "This is the closed loop. One patient. One kitchen table. One care team. One line item on the executive dashboard. That's what whole-person care looks like when it's measured end-to-end.",
  },
  // ── Chapter 5: The Mandate ─────────────────────────────────────────────────
  {
    stepNum: 14,
    chapter: 'Ch.5 · The Mandate',
    chapterColor: '#0369a1',
    route: '/stars-hedis-mips',
    label: 'Quality Gaps & Attribution',
    storyBeat:
      'HEDIS, BH, Social — all green because the gaps were actually closed. Attribution tells you which team did it.',
    chapterIntro: 'Ch.5 · The Mandate',
    persona: 'Quality / Compliance Analyst',
    mood: 'decisive',
    metric: { label: 'HEDIS Hybrid Rate (YoY)', value: '74.2% → 82.5%' },
    narratorLines: [
      "Here's the accountability screen.",
      'Five tabs: STARS, HEDIS, MIPS, BH Quality, Social Programs. One framework.',
      'Walk through each tab. STARS — the payer bonus journey. HEDIS — clinical measure documentation. BH Quality — FUH 67% vs 85% target. Social Programs — PRAPARE 61% vs 80% target.',
      'The gaps are visible. The gaps have owners. The gaps have deadlines.',
      'And attribution — which care team member closed which gap — is tracked at the individual level. This is how you reward the right behavior.',
    ],
  },
  {
    stepNum: 15,
    chapter: 'Ch.5 · The Mandate',
    chapterColor: '#0369a1',
    route: '/api-explorer',
    label: 'CMS-0057-F API Explorer',
    storyBeat:
      "Every compliance endpoint, live — 5 provisions, 14 endpoints. For the auditor in the room: here's the technical proof.",
    persona: 'Technical Audience / CMS Auditor',
    mood: 'decisive',
    metric: { label: 'CMS-0057-F Endpoints', value: '14 Live' },
    narratorLines: [
      "One more screen. For the person in the back of the room who isn't impressed by dashboards.",
      'This is the API explorer. Every CMS-0057-F compliance endpoint — live, callable, documented.',
      'Member access. Provider directory. Prior authorization status. Payer-to-payer exchange. Formulary.',
      'Five provisions. Fourteen endpoints. All of them returning real FHIR resources right now.',
      "We built the platform. We also built the compliance proof. Because passing an audit isn't a nice-to-have — it's the contract.",
    ],
    pausePrompt:
      "This is not a slideshow. Every number you've seen tonight is drawn from a live FHIR-compliant platform. Open an endpoint. The data is there.",
  },
];

// ─── Storytelling Overlay ─────────────────────────────────────────────────────

function StoryTellingOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);

  // Phase: 'chapter-card' shows the interstitial; 'step' shows the step itself
  type Phase = 'chapter-card' | 'step';
  const [phase, setPhase] = useState<Phase>('chapter-card');
  const [stepIndex, setStepIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [showAllLines, setShowAllLines] = useState(false);
  const [pauseVisible, setPauseVisible] = useState(false);

  const step = STORY_STEPS[stepIndex];
  const totalSteps = STORY_STEPS.length;
  const chapterCard = CHAPTER_CARDS.find((c) => c.chapter === step.chapter)!;

  // Determine if this step is the first step of its chapter
  const isChapterStart = stepIndex === 0 || STORY_STEPS[stepIndex - 1].chapter !== step.chapter;

  // Lock body scroll while overlay is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Navigate to the current step's route whenever we enter 'step' phase
  useEffect(() => {
    if (phase === 'step') {
      // Reset the active member on EVERY step — a step without an explicit
      // activePatient must not inherit the previously-selected member (wrong-patient
      // carry-over). Falls back to the canonical demo protagonist deterministically.
      setActiveCitizen(step.activePatient ?? DEFAULT_CITIZEN);
      router.push(step.route);
    }
  }, [phase, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        advanceNarrator();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goBack();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, stepIndex, lineIndex, showAllLines, pauseVisible]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  function advanceNarrator() {
    if (phase === 'chapter-card') {
      setPhase('step');
      setLineIndex(0);
      setShowAllLines(false);
      setPauseVisible(false);
      return;
    }
    // Inside a step
    if (!showAllLines && lineIndex < step.narratorLines.length - 1) {
      setLineIndex((i) => i + 1);
      return;
    }
    // All lines revealed — show pause prompt if present
    if (!showAllLines) setShowAllLines(true);
    if (step.pausePrompt && !pauseVisible) {
      setPauseVisible(true);
      return;
    }
    // Move to next step
    goNextStep();
  }

  function goBack() {
    if (phase === 'chapter-card') {
      if (stepIndex > 0) {
        const prevIdx = stepIndex - 1;
        setStepIndex(prevIdx);
        setPhase('step');
        setLineIndex(STORY_STEPS[prevIdx].narratorLines.length - 1);
        setShowAllLines(true);
        setPauseVisible(!!STORY_STEPS[prevIdx].pausePrompt);
      }
      return;
    }
    if (showAllLines || lineIndex > 0) {
      if (pauseVisible) {
        setPauseVisible(false);
        return;
      }
      if (showAllLines && lineIndex < step.narratorLines.length - 1) {
        setShowAllLines(false);
        return;
      }
      if (lineIndex > 0) {
        setLineIndex((i) => i - 1);
        setShowAllLines(false);
        return;
      }
    }
    // Go back to chapter card if this is chapter start, else previous step
    if (isChapterStart) {
      setPhase('chapter-card');
    } else {
      const prevIdx = stepIndex - 1;
      setStepIndex(prevIdx);
      setLineIndex(STORY_STEPS[prevIdx].narratorLines.length - 1);
      setShowAllLines(true);
      setPauseVisible(!!STORY_STEPS[prevIdx].pausePrompt);
    }
  }

  function goNextStep() {
    if (stepIndex >= totalSteps - 1) {
      onClose();
      return;
    }
    const nextIdx = stepIndex + 1;
    const nextStep = STORY_STEPS[nextIdx];
    const isNextChapterStart = nextStep.chapter !== step.chapter;
    setStepIndex(nextIdx);
    setLineIndex(0);
    setShowAllLines(false);
    setPauseVisible(false);
    if (isNextChapterStart) {
      setPhase('chapter-card');
    } else {
      setPhase('step');
    }
  }

  function jumpToStep(idx: number) {
    const target = STORY_STEPS[idx];
    setStepIndex(idx);
    setLineIndex(0);
    setShowAllLines(false);
    setPauseVisible(false);
    const isStart = idx === 0 || STORY_STEPS[idx - 1].chapter !== target.chapter;
    setPhase(isStart ? 'chapter-card' : 'step');
  }

  const progressPct = Math.round((stepIndex / (totalSteps - 1)) * 100);
  const moodAccent: Record<string, string> = {
    tense: '#da1e28',
    hopeful: '#198038',
    decisive: '#0043ce',
    neutral: '#6f6f6f',
  };
  const accent = step.mood ? (moodAccent[step.mood] ?? step.chapterColor) : step.chapterColor;

  // ── Chapter card interstitial ─────────────────────────────────────────────
  if (phase === 'chapter-card') {
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
        style={{ backgroundColor: '#0a0a10' }}
      >
        {/* Top progress */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            className="h-full transition-all duration-700"
            style={{ width: `${progressPct}%`, backgroundColor: chapterCard.color }}
          />
        </div>

        <div className="max-w-2xl w-full px-8 text-center flex flex-col items-center gap-6">
          {/* Chapter badge */}
          <div
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ border: `1px solid ${chapterCard.color}`, color: chapterCard.color }}
          >
            {chapterCard.chapter}
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            {chapterCard.headline}
          </h1>

          {/* Subline */}
          <p className="text-base text-white/60 leading-relaxed max-w-xl">{chapterCard.subline}</p>

          {/* Reflection prompt */}
          <div
            className="mt-2 px-6 py-4 border-l-4 text-left max-w-xl w-full"
            style={{ borderColor: chapterCard.color, backgroundColor: `${chapterCard.color}12` }}
          >
            <p
              className="text-2xs font-bold uppercase tracking-widest mb-1"
              style={{ color: chapterCard.color }}
            >
              Pause &amp; Reflect
            </p>
            <p className="text-sm text-white/70 leading-relaxed italic">
              {chapterCard.reflectionPrompt}
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => setPhase('step')}
            className="mt-2 flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: chapterCard.color }}
          >
            Begin Chapter
            <Icon name="ChevronRightIcon" size={16} />
          </button>

          <p className="text-white/20 text-2xs">Space / → to advance · Esc to exit</p>
        </div>

        {/* Step minimap */}
        <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-1 px-8">
          {STORY_STEPS.map((s, i) => (
            <button
              key={s.stepNum}
              onClick={() => jumpToStep(i)}
              title={s.label}
              className="transition-all"
              style={{
                width: i === stepIndex ? 20 : 8,
                height: 4,
                backgroundColor:
                  s.chapter === step.chapter
                    ? i <= stepIndex
                      ? chapterCard.color
                      : `${chapterCard.color}40`
                    : 'rgba(255,255,255,0.12)',
                borderRadius: 2,
              }}
            />
          ))}
        </div>

        {/* Esc to close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-white/30 hover:text-white/60 transition-colors"
        >
          <Icon name="XMarkIcon" size={18} />
        </button>
      </div>
    );
  }

  // ── Step narrative view ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#0a0a10' }}>
      {/* Top progress */}
      <div className="h-0.5 w-full bg-white/10 flex-shrink-0">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${progressPct}%`, backgroundColor: step.chapterColor }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Chapter badge */}
          <div
            className="px-2 py-0.5 text-2xs font-bold uppercase tracking-widest hidden sm:block"
            style={{ border: `1px solid ${step.chapterColor}`, color: step.chapterColor }}
          >
            {step.chapter.split(' · ')[1]}
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{step.label}</p>
            {step.persona && <p className="text-white/40 text-xs">Seen through: {step.persona}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs font-mono hidden sm:inline">
            Step {stepIndex + 1} / {totalSteps}
          </span>
          <span className="text-white/20 text-xs hidden md:inline">Space / → · Esc</span>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-white/20 text-white/50 hover:text-white hover:border-white/40 rounded transition-colors"
          >
            <Icon name="XMarkIcon" size={13} />
            Exit
          </button>
        </div>
      </div>

      {/* Main 2-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — narrator panel */}
        <div className="flex flex-col w-full lg:w-[520px] xl:w-[580px] flex-shrink-0 border-r border-white/10 overflow-y-auto px-8 py-8">
          {/* Story beat */}
          <p
            className="text-white/40 text-sm italic mb-6 leading-relaxed border-l-2 pl-4"
            style={{ borderColor: step.chapterColor }}
          >
            {step.storyBeat}
          </p>

          {/* Narrator lines */}
          <div className="space-y-4 flex-1">
            {step.narratorLines.map((line, li) => {
              const isVisible = showAllLines || li <= lineIndex;
              const isCurrent = !showAllLines && li === lineIndex;
              if (!isVisible) return null;
              return (
                <div
                  key={li}
                  className="flex gap-4 transition-all duration-300"
                  style={{ opacity: isCurrent ? 1 : 0.5 }}
                >
                  <div
                    className="w-6 h-6 flex items-center justify-center text-2xs font-bold flex-shrink-0 mt-0.5 transition-colors"
                    style={{
                      backgroundColor: isCurrent ? accent : 'rgba(255,255,255,0.08)',
                      color: isCurrent ? '#fff' : 'rgba(255,255,255,0.4)',
                      borderRadius: 0,
                    }}
                  >
                    {li + 1}
                  </div>
                  <p
                    className="text-white leading-relaxed flex-1"
                    style={{ fontSize: isCurrent ? '1rem' : '0.875rem' }}
                  >
                    {line}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Pause & Reflect */}
          {pauseVisible && step.pausePrompt && (
            <div
              className="mt-6 p-5 border-l-4"
              style={{ borderColor: accent, backgroundColor: `${accent}12` }}
            >
              <p
                className="text-2xs font-bold uppercase tracking-widest mb-2"
                style={{ color: accent }}
              >
                ✦ Pause &amp; Reflect
              </p>
              <p className="text-sm text-white/80 leading-relaxed italic">{step.pausePrompt}</p>
            </div>
          )}

          {/* Reveal next line cue */}
          {!showAllLines && lineIndex < step.narratorLines.length - 1 && (
            <button
              onClick={advanceNarrator}
              className="mt-6 flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <Icon name="ChevronDownIcon" size={14} />
              Next line ({lineIndex + 2} of {step.narratorLines.length})
            </button>
          )}

          {/* Bottom nav */}
          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={goBack}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-white/20 text-white/50 hover:text-white hover:border-white/40 rounded transition-colors"
            >
              <Icon name="ChevronLeftIcon" size={15} />
              Back
            </button>
            <button
              onClick={advanceNarrator}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded transition-all hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {stepIndex === totalSteps - 1 && showAllLines && (!step.pausePrompt || pauseVisible)
                ? 'Finish Story'
                : !showAllLines
                  ? `Narrator line ${lineIndex + 2} of ${step.narratorLines.length}`
                  : step.pausePrompt && !pauseVisible
                    ? 'Pause & Reflect'
                    : `Next — ${stepIndex < totalSteps - 1 ? STORY_STEPS[stepIndex + 1].label : 'End'}`}
              <Icon name="ChevronRightIcon" size={15} />
            </button>
          </div>
        </div>

        {/* Right — screen info + minimap */}
        <div className="hidden lg:flex flex-col flex-1 px-8 py-8 overflow-y-auto gap-6">
          {/* Open Screen card */}
          <div
            className="rounded border p-5"
            style={{
              borderColor: `${step.chapterColor}40`,
              backgroundColor: `${step.chapterColor}0d`,
            }}
          >
            <p
              className="text-2xs font-bold uppercase tracking-widest mb-2"
              style={{ color: step.chapterColor }}
            >
              Open Live Screen
            </p>
            <p className="text-white font-semibold text-base mb-1">{step.label}</p>
            <p className="text-white/50 text-xs mb-4 leading-relaxed">{step.storyBeat}</p>
            {step.metric && (
              <div className="mb-4 flex items-baseline gap-3">
                <span className="text-3xl font-bold" style={{ color: step.chapterColor }}>
                  {step.metric.value}
                </span>
                <span className="text-white/40 text-xs">{step.metric.label}</span>
              </div>
            )}
            <Link
              href={step.route}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: step.chapterColor }}
            >
              <Icon name="ArrowTopRightOnSquareIcon" size={13} />
              Open {step.label}
            </Link>
          </div>

          {/* Chapter overview */}
          <div className="flex-1">
            <p className="text-white/30 text-2xs font-bold uppercase tracking-widest mb-3">
              Story Track
            </p>
            <div className="space-y-0.5">
              {STORY_STEPS.map((s, i) => {
                const isCurr = i === stepIndex;
                const isPast = i < stepIndex;
                const chColor = s.chapterColor;
                const isChapterBreak = i === 0 || STORY_STEPS[i - 1].chapter !== s.chapter;
                return (
                  <React.Fragment key={s.stepNum}>
                    {isChapterBreak && (
                      <p
                        className="text-2xs font-bold uppercase tracking-widest pt-3 pb-1"
                        style={{ color: `${chColor}80` }}
                      >
                        {s.chapter.split(' · ')[1]}
                      </p>
                    )}
                    <button
                      onClick={() => jumpToStep(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 rounded ${isCurr ? 'bg-white/8' : ''}`}
                    >
                      <div
                        className="w-4 h-4 flex items-center justify-center text-2xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: isCurr
                            ? chColor
                            : isPast
                              ? `${chColor}40`
                              : 'rgba(255,255,255,0.08)',
                          color: isCurr ? '#fff' : isPast ? chColor : 'rgba(255,255,255,0.3)',
                          borderRadius: 0,
                        }}
                      >
                        {isPast && !isCurr ? <Icon name="CheckIcon" size={8} /> : s.stepNum}
                      </div>
                      <p
                        className={`text-xs truncate ${isCurr ? 'text-white font-semibold' : isPast ? 'text-white/30' : 'text-white/50'}`}
                      >
                        {s.label}
                      </p>
                      {s.activePatient === 'MARIA_SD_001' && !isCurr && (
                        <span
                          className="text-2xs ml-auto flex-shrink-0"
                          style={{ color: '#007d79' }}
                        >
                          Maria
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type DemoMode = 'full' | 'story';

export default function DemoNavigator() {
  const pathname = usePathname();
  const router = useRouter();
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  const [expanded, setExpanded] = useState(false);
  const [demoMode, setDemoMode] = useState<DemoMode>('full');
  const [storyTrackOpen, setStoryTrackOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track the last explicitly-navigated stepNum so duplicate-route pages
  // (e.g. /crisis-pathway appears at steps 22 AND 23) resolve to the right step.
  const lastStepNumRef = useRef<number | null>(null);

  // Active step list depends on mode
  const activeSteps = demoMode === 'story' ? STORY_STEPS : ALL_STEPS;
  const totalSteps = activeSteps.length;

  // Disambiguated lookup: if multiple steps share a pathname, prefer the one
  // whose stepNum matches the last navigation; otherwise fall back to first match.
  const currentStepIndex = (() => {
    const matches = activeSteps.reduce<number[]>((acc, s, i) => {
      if (s.route === pathname) acc.push(i);
      return acc;
    }, []);
    if (matches.length === 0) return -1;
    if (matches.length === 1) return matches[0];
    const preferred = matches.find((i) => activeSteps[i].stepNum === lastStepNumRef.current);
    return preferred ?? matches[0];
  })();

  const currentStep = currentStepIndex >= 0 ? activeSteps[currentStepIndex] : null;

  // For full mode — find the persona for colour
  const currentPersonaFull =
    currentStep && demoMode === 'full'
      ? (DEMO_PERSONAS.find((p) => p.steps.some((s) => s.stepNum === currentStep.stepNum)) ?? null)
      : null;

  // Pill colour: story mode uses chapter colour; full mode uses persona colour
  const pillColor =
    demoMode === 'story'
      ? ((currentStep as StoryStep | null)?.chapterColor ?? '#0043ce')
      : (currentPersonaFull?.color ?? '#0043ce');

  const prevStep = currentStepIndex > 0 ? activeSteps[currentStepIndex - 1] : null;
  const nextStep =
    currentStepIndex >= 0 && currentStepIndex < activeSteps.length - 1
      ? activeSteps[currentStepIndex + 1]
      : null;

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  // Switch mode — reset step tracking so disambiguation stays clean
  const switchMode = (mode: DemoMode) => {
    lastStepNumRef.current = null;
    setDemoMode(mode);
  };

  // Helper: navigate to a step, setting active patient if specified.
  const navigateToStep = (step: DemoStep) => {
    lastStepNumRef.current = step.stepNum;
    setActiveCitizen(step.activePatient ?? DEFAULT_CITIZEN);
    router.push(step.route);
    setExpanded(false);
  };

  const stepLabel = currentStep
    ? `${currentStep.stepNum} / ${totalSteps} — ${currentStep.label}`
    : 'Demo Navigator';

  // ── Story mode panel content ────────────────────────────────────────────────
  const StoryPanel = () => {
    // Group steps by chapter
    const chapters = STORY_STEPS.reduce<{ chapter: string; color: string; steps: StoryStep[] }[]>(
      (acc, step) => {
        const existing = acc.find((c) => c.chapter === step.chapter);
        if (existing) {
          existing.steps.push(step);
        } else {
          acc.push({ chapter: step.chapter, color: step.chapterColor, steps: [step] });
        }
        return acc;
      },
      []
    );

    return (
      <div className="flex-1 overflow-y-auto py-2">
        {chapters.map((ch) => (
          <div key={ch.chapter} className="mb-1">
            {/* Chapter header */}
            <div
              className="flex items-center gap-2 px-4 py-1.5"
              style={{ borderLeft: `3px solid ${ch.color}` }}
            >
              <span
                className="text-2xs font-bold uppercase tracking-wide"
                style={{ color: ch.color }}
              >
                {ch.chapter}
              </span>
            </div>
            {/* Steps */}
            {ch.steps.map((step) => {
              const isCurrentStep =
                step.route === pathname && step.stepNum === currentStep?.stepNum;
              return (
                <button
                  key={step.stepNum}
                  onClick={() => navigateToStep(step)}
                  className={`w-full flex items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-carbon-gray-10 ${
                    isCurrentStep ? 'bg-carbon-gray-10' : ''
                  }`}
                >
                  <div
                    className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-2xs font-bold"
                    style={{
                      backgroundColor: isCurrentStep ? ch.color : 'transparent',
                      color: isCurrentStep ? '#fff' : ch.color,
                      border: `1.5px solid ${ch.color}`,
                      borderRadius: 0,
                    }}
                  >
                    {step.stepNum}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium ${isCurrentStep ? 'text-carbon-gray-100' : 'text-carbon-gray-70'}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-2xs text-carbon-gray-50 truncate">{step.storyBeat}</p>
                    {step.activePatient === 'MARIA_SD_001' && (
                      <p className="text-2xs font-semibold mt-0.5" style={{ color: '#007d79' }}>
                        ↗ Maria Redhawk
                      </p>
                    )}
                  </div>
                  {isCurrentStep && (
                    <Icon
                      name="ChevronRightIcon"
                      size={12}
                      className="flex-shrink-0 mt-1"
                      style={{ color: ch.color } as React.CSSProperties}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // ── Full sequence panel content ─────────────────────────────────────────────
  const FullPanel = () => (
    <div className="flex-1 overflow-y-auto py-2">
      {DEMO_PERSONAS.map((persona) => {
        const isActivePersona = currentPersonaFull?.id === persona.id;
        return (
          <div key={persona.id} className="mb-1">
            {/* Persona header */}
            <div
              className="flex items-center gap-2 px-4 py-2"
              style={{ backgroundColor: isActivePersona ? persona.bgLight : undefined }}
            >
              <div
                className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-2xs font-bold text-white"
                style={{ backgroundColor: persona.color, borderRadius: 0 }}
              >
                {persona.initials}
              </div>
              <div className="min-w-0">
                <p
                  className="text-2xs font-semibold uppercase tracking-wide"
                  style={{ color: persona.color }}
                >
                  {persona.role}
                </p>
                <p className="text-xs font-medium text-carbon-gray-100 truncate">{persona.title}</p>
              </div>
            </div>
            {/* Steps */}
            {persona.steps.map((step) => {
              const isCurrentStep =
                step.route === pathname && step.stepNum === currentStep?.stepNum;
              return (
                <button
                  key={step.stepNum}
                  onClick={() => navigateToStep(step)}
                  className={`w-full flex items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-carbon-gray-10 ${
                    isCurrentStep ? 'bg-carbon-gray-10' : ''
                  }`}
                >
                  <div
                    className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-2xs font-bold"
                    style={{
                      backgroundColor: isCurrentStep ? persona.color : 'transparent',
                      color: isCurrentStep ? '#fff' : persona.color,
                      border: `1.5px solid ${persona.color}`,
                      borderRadius: 0,
                    }}
                  >
                    {step.stepNum}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium ${isCurrentStep ? 'text-carbon-gray-100' : 'text-carbon-gray-70'}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-2xs text-carbon-gray-50 truncate">{step.storyBeat}</p>
                    {step.activePatient === 'MARIA_SD_001' && (
                      <p className="text-2xs font-semibold mt-0.5" style={{ color: '#007d79' }}>
                        ↗ Maria Redhawk
                      </p>
                    )}
                  </div>
                  {isCurrentStep && (
                    <Icon
                      name="ChevronRightIcon"
                      size={12}
                      className="flex-shrink-0 mt-1"
                      style={{ color: persona.color } as React.CSSProperties}
                    />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Story Telling Overlay — fullscreen, above everything */}
      {storyTrackOpen && <StoryTellingOverlay onClose={() => setStoryTrackOpen(false)} />}

      <div ref={containerRef} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {/* Expanded panel */}
        {expanded && (
          <div
            className="bg-white border border-carbon-gray-20 shadow-2xl w-80 max-h-[70vh] overflow-y-auto flex flex-col"
            style={{ borderRadius: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20 bg-carbon-gray-10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="MapIcon" size={16} className="text-carbon-gray-70" />
                <span className="text-xs font-semibold text-carbon-gray-100 uppercase tracking-wide">
                  Demo Navigator
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex border-b border-carbon-gray-20 flex-shrink-0">
              <button
                onClick={() => switchMode('full')}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  demoMode === 'full'
                    ? 'bg-carbon-gray-100 text-white'
                    : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
                }`}
              >
                Full Sequence
                <span
                  className={`ml-1 text-2xs font-normal ${demoMode === 'full' ? 'text-white/70' : 'text-carbon-gray-50'}`}
                >
                  54 steps
                </span>
              </button>
              <button
                onClick={() => switchMode('story')}
                className={`flex-1 py-2 text-xs font-semibold transition-colors border-l border-carbon-gray-20 ${
                  demoMode === 'story'
                    ? 'bg-carbon-gray-100 text-white'
                    : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
                }`}
              >
                ▶ Story Mode
                <span
                  className={`ml-1 text-2xs font-normal ${demoMode === 'story' ? 'text-white/70' : 'text-carbon-gray-50'}`}
                >
                  15 steps
                </span>
              </button>
            </div>

            {/* Story Track launch button — only in Story Mode */}
            {demoMode === 'story' && (
              <div className="px-3 py-2.5 border-b border-carbon-gray-20 flex-shrink-0 bg-carbon-gray-10">
                <button
                  onClick={() => {
                    setExpanded(false);
                    setStoryTrackOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(90deg, #0043ce 0%, #007d79 50%, #8a3ffc 100%)',
                  }}
                >
                  <Icon name="BookOpenIcon" size={14} />✦ Launch Story Track
                </button>
                <p className="text-2xs text-carbon-gray-50 text-center mt-1.5">
                  Cinematic narrator · 5 chapters · pause &amp; reflect
                </p>
              </div>
            )}

            {/* Step list — switches by mode */}
            {demoMode === 'story' ? <StoryPanel /> : <FullPanel />}

            {/* Prev / Next footer */}
            <div className="border-t border-carbon-gray-20 flex items-stretch flex-shrink-0">
              <button
                disabled={!prevStep}
                onClick={() => prevStep && navigateToStep(prevStep)}
                className="flex-1 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-carbon-gray-20"
              >
                <Icon name="ChevronLeftIcon" size={13} />
                <span className="truncate">{prevStep ? prevStep.label : 'Start'}</span>
              </button>
              <button
                disabled={!nextStep}
                onClick={() => nextStep && navigateToStep(nextStep)}
                className="flex-1 flex items-center justify-end gap-1.5 px-3 py-2.5 text-xs font-medium text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <span className="truncate">{nextStep ? nextStep.label : 'End'}</span>
                <Icon name="ChevronRightIcon" size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Collapsed pill — three zones: ◀ · label (toggles panel) · ▶ · mode badge */}
        <div
          className="flex items-stretch shadow-lg text-white text-xs font-semibold"
          style={{ backgroundColor: pillColor, borderRadius: 0, minWidth: 200 }}
        >
          {/* ◀ Prev */}
          <button
            disabled={!prevStep}
            onClick={(e) => {
              e.stopPropagation();
              if (prevStep) navigateToStep(prevStep);
            }}
            className="flex items-center justify-center px-2.5 py-2 hover:bg-black/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-white/20 flex-shrink-0"
            title={prevStep ? `Back: ${prevStep.label}` : 'Start of sequence'}
          >
            <Icon name="ChevronLeftIcon" size={13} />
          </button>

          {/* Centre label — click to open/close panel */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0 hover:bg-black/10 transition-colors"
            title="Demo Navigator"
          >
            <Icon name="MapIcon" size={13} className="flex-shrink-0" />
            <span className="flex-1 text-left truncate">{stepLabel}</span>
            <Icon
              name={expanded ? 'ChevronDownIcon' : 'ChevronUpIcon'}
              size={11}
              className="flex-shrink-0"
            />
          </button>

          {/* Mode badge */}
          <div
            className="flex items-center justify-center px-2 text-2xs font-bold tracking-wide border-l border-white/20 flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.18)' }}
            title={demoMode === 'story' ? 'Story Mode — 15 steps' : 'Full Sequence — 54 steps'}
          >
            {demoMode === 'story' ? 'STORY' : 'FULL'}
          </div>

          {/* ▶ Next */}
          <button
            disabled={!nextStep}
            onClick={(e) => {
              e.stopPropagation();
              if (nextStep) navigateToStep(nextStep);
            }}
            className="flex items-center justify-center px-2.5 py-2 hover:bg-black/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-white/20 flex-shrink-0"
            title={nextStep ? `Next: ${nextStep.label}` : 'End of sequence'}
          >
            <Icon name="ChevronRightIcon" size={13} />
          </button>
        </div>
      </div>
    </>
  );
}
