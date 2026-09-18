'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

// ─── Demo Sequence Data ───────────────────────────────────────────────────────

interface DemoSlide {
  stepNum: number;
  route: string;
  screenLabel: string;
  storyBeat: string;
  speakerNotes: string;
  keyTalkingPoints: string[];
  demoActions: string[];
}

interface DemoPersona {
  id: string;
  role: string;
  title: string;
  color: string;
  bgLight: string;
  textColor: string;
  initials: string;
  personaContext: string;
  slides: DemoSlide[];
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'state-executive',
    role: 'P1',
    title: 'State Medicaid Executive',
    color: '#0043ce',
    bgLight: '#d0e2ff',
    textColor: '#001d6c',
    initials: 'SE',
    personaContext:
      'South Dakota DHSS Deputy Director reviewing RHTP program performance across all regions and funding streams.',
    slides: [
      {
        stepNum: 1,
        route: '/contract-program-selection',
        screenLabel: 'RHTP Overview',
        storyBeat: 'All-program view — Clinical + BH + Social KPIs',
        speakerNotes:
          'Open with the RHTP Overview as the state executive landing page. This is the first thing the Deputy Director sees when they log in — a unified view across all three program pillars.',
        keyTalkingPoints: [
          'Single platform for Clinical, Behavioral Health, and Social programs — no siloed dashboards',
          'Contract KPI strip shows shared savings target vs. actual in real time',
          'Network participants panel shows 45% CBO connectivity — the "trusted provider" story starts here',
          'Rural Health KPIs surface access gaps that drive the RHTP value proposition',
        ],
        demoActions: [
          'Click on the Medicaid RHTP Track 3 contract card',
          'Point to the KPI strip — highlight shared savings and PMPM trend',
          'Show the Network Participants panel — 45% connected CBOs',
        ],
      },
      {
        stepNum: 2,
        route: '/region-view',
        screenLabel: 'Regions',
        storyBeat: 'Regional rollup — Clinical + Social + BH benchmarking',
        speakerNotes:
          'Drill from the state level to regional performance. This is where the executive identifies which regions are driving outcomes and which need intervention.',
        keyTalkingPoints: [
          'Regional benchmarking across Clinical, BH, and Social domains simultaneously',
          'Color-coded performance tiers — green/yellow/red at a glance',
          'CHW deployment density correlates with social gap closure rates',
          'Region 4 (St. Louis) shows highest BH utilization — drives resource allocation decisions',
        ],
        demoActions: [
          'Click into Region 4 to show the drill-down',
          'Compare two regions side by side on BH metrics',
          'Point to the CHW density overlay',
        ],
      },
      {
        stepNum: 3,
        route: '/executive-outcomes-dashboard',
        screenLabel: 'Executive Dashboard',
        storyBeat: 'Whole-person outcomes delivered',
        speakerNotes:
          'The executive outcomes dashboard is the proof point — this is what you show legislators and CMS. Whole-person outcomes with attribution back to program interventions.',
        keyTalkingPoints: [
          'ED utilization down 18% for patients with closed social gaps — the ROI story',
          'A1C improvement for dual-need (clinical + social) cohort vs. clinical-only cohort',
          'BH engagement rate tied to FUH/FUM measure compliance',
          'Shared savings attribution by program pillar — Clinical, BH, Social each get credit',
        ],
        demoActions: [
          'Show the ED reduction trend chart — point to the inflection point after CHW deployment',
          'Click the dual-need cohort filter to isolate whole-person patients',
          'Show the shared savings waterfall by program',
        ],
      },
      {
        stepNum: 4,
        route: '/financial-dashboard',
        screenLabel: 'Financial Dashboard (Braided Funding)',
        storyBeat: 'Braided funding streams + shared savings model',
        speakerNotes:
          'The financial dashboard shows how RHTP braids Medicaid, CHIP, Title IV-E, and CCBHC funding into a unified cost envelope. This is the CFO conversation.',
        keyTalkingPoints: [
          'Braided funding view — Medicaid + BH block grant + social services funding in one PMPM',
          'RAF score trending drives revenue capture — HCC suspects surfaced automatically',
          'PMPM cost vs. target by risk tier — high-risk patients are the shared savings opportunity',
          'Gain-share model: every closed care gap generates attributed savings back to the network',
        ],
        demoActions: [
          'Show the PMPM trend chart — highlight the bend in the cost curve',
          'Click into the high-cost patient table — these are the intervention targets',
          'Show the RAF revenue panel — HCC suspects represent $2.3M in uncaptured revenue',
        ],
      },
      {
        stepNum: 5,
        route: '/social-needs-dashboard',
        screenLabel: 'Social Needs Dashboard',
        storyBeat: 'Population screening funnel + dual-need cohort',
        speakerNotes:
          'The social needs dashboard shows the population-level SDOH picture. This is where the state executive sees the screening funnel and the dual-need cohort that drives the whole-person model.',
        keyTalkingPoints: [
          'Screening funnel: 12,400 screened → 8,200 with identified needs → 4,100 enrolled in programs',
          'Dual-need cohort (clinical + social) has 2.4x higher ED utilization than clinical-only',
          'Top SDOH domains: food insecurity (34%), housing instability (28%), transportation (22%)',
          'CBO referral completion rate: 67% for connected CBOs vs. 31% for unconnected',
        ],
        demoActions: [
          'Show the screening funnel — point to the drop-off between screened and enrolled',
          'Filter to the dual-need cohort — show the ED utilization differential',
          'Show the domain breakdown — food and housing are the top two targets',
        ],
      },
      {
        stepNum: 6,
        route: '/outcomes-linkage',
        screenLabel: 'Outcomes Linkage',
        storyBeat: 'Housing → ED reduction, food → A1C — ROI proof',
        speakerNotes:
          'The outcomes linkage screen is the closing argument for the state executive. It shows the causal chain from social intervention to clinical outcome — the evidence base for continued RHTP investment.',
        keyTalkingPoints: [
          'Housing intervention → 34% ED reduction within 90 days — statistically significant',
          'Food security enrollment → A1C improvement from 9.2% to 7.1% over 6 months',
          'BH engagement → 28% reduction in crisis pathway activations',
          'ROI: every $1 invested in social programs returns $3.40 in avoided clinical costs',
        ],
        demoActions: [
          'Show the housing → ED reduction chart — point to the 90-day inflection',
          'Show the food → A1C improvement for Dorothy Simmons cohort',
          'Show the ROI summary — $3.40 return per dollar invested',
        ],
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
    personaContext:
      'RHTP Network Director responsible for clinical, BH, and CBO network performance across all participating organizations.',
    slides: [
      {
        stepNum: 7,
        route: '/provider-level',
        screenLabel: 'Program Networks',
        storyBeat: 'Clinical / BH / CBO network tabs — org-level performance',
        speakerNotes:
          'The network director sees all three program networks in one view. Clinical providers, BH counselors, and CBOs are all managed from this screen.',
        keyTalkingPoints: [
          'Three-tab network view: Clinical, Behavioral Health, Community-Based Organizations',
          'Org-level performance metrics: quality scores, referral completion, gain-share attribution',
          'Network adequacy indicators — coverage gaps by county and specialty',
          'CBO registration status: 45% connected, 55% unregistered — growth opportunity',
        ],
        demoActions: [
          'Toggle between Clinical, BH, and CBO tabs',
          'Click into a low-performing org to show the drill-down',
          'Show the network adequacy map — highlight coverage gaps',
        ],
      },
      {
        stepNum: 8,
        route: '/physician-view',
        screenLabel: 'Care Team Members',
        storyBeat: 'PCPs + BH counselors + CHW supervisors — role-typed metrics',
        speakerNotes:
          'Individual care team member performance — not just physicians, but BH counselors and CHW supervisors. Each role has role-appropriate metrics.',
        keyTalkingPoints: [
          'Role-typed metrics: PCPs see RAF/HCC, BH counselors see PHQ-9/GAD-7 completion, CHWs see visit completion and social gap closure',
          'Attribution accuracy by provider — disputes flagged automatically',
          'Gain-share attribution at the individual provider level',
          'Outlier detection: providers with high HCC suspect rates or low gap closure rates',
        ],
        demoActions: [
          'Filter to BH counselors — show the FUH/FUM compliance rate',
          "Click into a CHW supervisor — show their team's social gap closure rate",
          'Show the gain-share attribution column — each provider sees their contribution',
        ],
      },
      {
        stepNum: 9,
        route: '/stars-hedis-mips',
        screenLabel: 'Quality Gaps & Attribution',
        storyBeat: 'Clinical + BH + Social program quality measures — 5 tabs',
        speakerNotes:
          "The quality and compliance screen covers all five measure sets: STARS, HEDIS, MIPS, BH-specific measures, and Social program outcomes. This is the compliance officer's home screen.",
        keyTalkingPoints: [
          'Five measure tabs: STARS (payer bonus), HEDIS (documentation), MIPS (payment adjustment), BH (FUH/FUM/FBOM), Social (SDOH closure rates)',
          'Measure-level drill-down: which patients are contributing to each gap',
          'Documentation journey: evidence chain from clinical encounter to measure credit',
          'Gain-share calculation: each measure closure has a dollar value attached',
        ],
        demoActions: [
          'Show the STARS payer bonus journey — point to the gap between current and target star rating',
          'Click into HEDIS — show the documentation evidence chain',
          'Show the BH tab — FUH/FUM compliance rate and the patients driving the gap',
        ],
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
    personaContext:
      'Dr. James Whitfield, PCP at a rural FQHC, accessing the RHTP platform via SMART on FHIR launch from Cerner.',
    slides: [
      {
        stepNum: 10,
        route: '/md-smart-launch',
        screenLabel: 'MD Smart Launch',
        storyBeat: 'SMART on FHIR entry — embedded in EMR',
        speakerNotes:
          'The physician enters the RHTP platform via SMART on FHIR launch from Cerner. The platform receives the patient context automatically — no re-login, no re-search.',
        keyTalkingPoints: [
          'SMART on FHIR launch: patient context passed from Cerner automatically',
          "CDS Hooks cards surface in the physician's workflow — no context switching",
          'Whole-person summary visible alongside the clinical record',
          'Return to Cerner button — physician never loses their EMR workflow',
        ],
        demoActions: [
          'Show the SMART launch handler — patient context auto-populated',
          'Show the CDS Hooks cards — HCC suspect and care gap alerts',
          'Click "Return to Cerner" — show the seamless handoff',
        ],
      },
      {
        stepNum: 11,
        route: '/panel-cohort-view',
        screenLabel: 'Panel & Cohort (Medicaid RHTP Track 3)',
        storyBeat: 'Attributed panel — PCP / CHW / BH three-column attribution',
        speakerNotes:
          "The physician's attributed panel under Medicaid RHTP Track 3. Three-column attribution shows which patients are assigned to the PCP, which CHW is covering them, and which BH counselor is engaged.",
        keyTalkingPoints: [
          'Medicaid RHTP Track 3 attribution — not Medicare MSSP',
          'Three-column attribution: PCP + CHW + BH counselor for each patient',
          'Risk tier color coding: Critical (red), High (orange), Moderate (yellow), Low (green)',
          'Open care gaps and HCC suspects surfaced per patient row',
          'Cohort filters: by risk tier, open gaps, BH flag, social needs flag',
        ],
        demoActions: [
          'Filter to Critical risk tier — show the 6 patients needing immediate attention',
          'Click on Dorothy Simmons — navigate to patient detail',
          'Show the CHW and BH counselor attribution columns',
        ],
      },
      {
        stepNum: 12,
        route: '/patient-detail',
        screenLabel: 'Patient Detail — Whole Person Care Plan',
        storyBeat: 'Whole Person Care Plan tab + AI care plan + gain-share',
        speakerNotes:
          'The patient detail screen is the heart of the whole-person model. The Whole Person Care Plan tab shows clinical, BH, and social goals in a unified care plan with AI-generated recommendations.',
        keyTalkingPoints: [
          'Whole Person Care Plan: Clinical + BH + Social goals in one view',
          'AI-generated care plan recommendations based on FHIR data',
          'Gain-share attribution: each closed gap shows the dollar value attributed to this provider',
          'Close Gap drawer: domain-aware evidence capture (Clinical/BH/Social) with FHIR PATCH confirmation',
          'FHIR CarePlan resource updated in real time — provenance chain visible',
        ],
        demoActions: [
          'Click the Whole Person Care Plan tab',
          'Show the AI care plan recommendations panel',
          'Click "Close Gap" on the HbA1c gap — walk through the 3-step evidence capture',
          'Show the gain-share attribution — $340 attributed to this encounter',
        ],
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
    personaContext:
      'Sarah Johnson, Care Manager at RHTP, managing a panel of high-risk Medicaid patients across clinical, BH, and social domains.',
    slides: [
      {
        stepNum: 13,
        route: '/care-manager',
        screenLabel: 'Care Manager Worklist',
        storyBeat: 'Clinical/BH/Social filter — BH risk flags + social needs per row',
        speakerNotes:
          "The care manager worklist is Angela's daily starting point. Every patient row shows clinical risk, BH flags, and social needs simultaneously — no toggling between systems.",
        keyTalkingPoints: [
          'Unified worklist: Clinical + BH + Social needs visible per patient row',
          'BH risk flags: PHQ-9 ≥10, active crisis pathway, FUH/FUM due',
          'Social needs flags: food insecurity, housing instability, transportation barrier',
          'Priority queue: patients sorted by composite risk score across all three domains',
          'One-click actions: Schedule Outreach, Create BH Referral, Assign CHW',
        ],
        demoActions: [
          'Filter to patients with both BH flag and social needs flag — the dual-need cohort',
          'Click on a patient with PHQ-9 ≥10 and food insecurity',
          'Show the one-click "Create BH Referral" action',
        ],
      },
      {
        stepNum: 14,
        route: '/patient-episode-summary',
        screenLabel: 'Patient Episode Summary',
        storyBeat: 'All episodes for a patient',
        speakerNotes:
          'The episode summary shows all clinical episodes for a patient — inpatient, ED, SNF, and outpatient — in a unified timeline. This is where the care manager identifies utilization patterns.',
        keyTalkingPoints: [
          'All episode types in one timeline: IP, ED, SNF, OP, BH, Social program',
          'Episode cost vs. target — variance flagged for high-cost episodes',
          'Readmission risk score per episode — 30-day readmission prediction',
          'Care gap linkage: which episodes are associated with open care gaps',
        ],
        demoActions: [
          'Show the episode timeline — point to the ED visit pattern',
          'Click into the most recent ED episode',
          'Show the readmission risk score — 72% 30-day readmission risk',
        ],
      },
      {
        stepNum: 15,
        route: '/episode-detail',
        screenLabel: 'Episode Detail',
        storyBeat: 'Episode deep-dive — care setting timeline',
        speakerNotes:
          'The episode detail screen shows the full care setting timeline for a single episode — from admission through discharge and post-acute care.',
        keyTalkingPoints: [
          'Care setting timeline: ED → IP → SNF → Home Health → Outpatient',
          'Length of stay vs. benchmark — days over target flagged',
          'Discharge disposition and post-acute care plan',
          'Social determinants contributing to this episode — housing instability linked to readmission risk',
        ],
        demoActions: [
          'Walk through the care setting timeline',
          'Point to the LOS variance — 2.3 days over benchmark',
          'Show the social determinants panel — housing instability flagged',
        ],
      },
      {
        stepNum: 16,
        route: '/episodic-management-analytics',
        screenLabel: 'Episodic Analytics',
        storyBeat: 'Clinical + BH Episodes + Social Program Outcomes tabs',
        speakerNotes:
          'The episodic analytics screen shows population-level episode patterns across clinical, BH, and social program domains. This is where the care manager identifies systemic issues.',
        keyTalkingPoints: [
          'Three-tab analytics: Clinical Episodes, BH Episodes, Social Program Outcomes',
          'Episode cost distribution by DRG and risk tier',
          'BH episode patterns: crisis pathway activations, inpatient BH days, step-down compliance',
          'Social program outcomes: enrollment → completion → clinical impact chain',
        ],
        demoActions: [
          'Toggle between Clinical, BH, and Social tabs',
          'Show the BH episode tab — crisis pathway activation trend',
          'Show the Social tab — SNAP enrollment → A1C improvement correlation',
        ],
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
    personaContext:
      'Marcus Johnson, CHW conducting home visits and social needs screenings for high-risk Medicaid patients in rural South Dakota.',
    slides: [
      {
        stepNum: 17,
        route: '/chw-workflow',
        screenLabel: 'CHW Workflow',
        storyBeat: 'Home Visit Schedule — Start Visit, Clinical, Reschedule actions',
        speakerNotes:
          "The CHW workflow is Marcus's mobile-first daily schedule. Home visits are prioritized by risk score and social need urgency. Each visit has structured actions tied to the care plan.",
        keyTalkingPoints: [
          'Mobile-optimized visit schedule — GPS-ordered by proximity',
          'Visit actions: Start Visit, Log Contact Attempt, Reschedule, Escalate to Care Manager',
          'Clinical data collection during visit: vitals, medication adherence, social screening',
          'Visit completion triggers FHIR Observation resources — data flows to care team automatically',
        ],
        demoActions: [
          'Show the visit schedule — 6 visits today, ordered by priority',
          'Click "Start Visit" for Dorothy Simmons',
          'Show the visit data collection form — vitals + medication adherence',
        ],
      },
      {
        stepNum: 18,
        route: '/social-needs-screening',
        screenLabel: 'Social Needs Screening',
        storyBeat: 'PRAPARE screening → social Task creation',
        speakerNotes:
          'The CHW conducts the PRAPARE social needs screening during the home visit. Each positive screen automatically creates a FHIR Task for the appropriate program or CBO.',
        keyTalkingPoints: [
          'PRAPARE / AHC-HRSN screening instrument — 13 domains',
          'Positive screen → FHIR Task created automatically → routed to appropriate CBO',
          'Screening results feed into the Social Needs Dashboard population funnel',
          'Patient consent captured and stored — HIPAA-compliant data sharing with CBOs',
        ],
        demoActions: [
          'Walk through the PRAPARE screening for Dorothy Simmons',
          'Show the food insecurity and housing instability positive screens',
          'Show the automatic FHIR Task creation — routed to food bank and housing CBO',
        ],
      },
      {
        stepNum: 19,
        route: '/program-eligibility',
        screenLabel: 'Program Eligibility',
        storyBeat: 'Eligible programs from screening results',
        speakerNotes:
          'Based on the PRAPARE screening results, the platform automatically calculates program eligibility across SNAP, Medicaid, housing assistance, and other programs.',
        keyTalkingPoints: [
          'Automatic eligibility calculation from screening results — no manual lookup',
          'Programs ranked by impact potential and enrollment ease',
          "Pre-populated enrollment forms — CHW doesn't re-enter data",
          'Eligibility confidence score — based on income, household size, and SDOH factors',
        ],
        demoActions: [
          'Show the eligibility results for Dorothy Simmons — 4 programs eligible',
          'Click into SNAP eligibility — show the pre-populated form',
          'Show the impact potential ranking — SNAP has highest A1C impact score',
        ],
      },
      {
        stepNum: 20,
        route: '/benefit-enrollment',
        screenLabel: 'Benefit Enrollment',
        storyBeat: 'SNAP enrolled, housing pending, gaps flagged',
        speakerNotes:
          'The benefit enrollment screen shows the enrollment status across all programs for this patient. SNAP is enrolled, housing is pending, and two gaps are flagged for follow-up.',
        keyTalkingPoints: [
          'Enrollment status dashboard: Enrolled, Pending, Denied, Expired',
          'SNAP enrolled — benefit start date and monthly amount shown',
          'Housing assistance pending — estimated wait time 45 days',
          'Two gaps flagged: transportation benefit not applied for, childcare subsidy eligible but not enrolled',
          'Enrollment completion triggers FHIR Task closure — care team notified',
        ],
        demoActions: [
          'Show the enrollment status dashboard — SNAP enrolled, housing pending',
          'Click on the transportation gap — show the one-click enrollment action',
          'Show the FHIR Task closure notification — care team sees the update',
        ],
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
    personaContext:
      'Dr. Sarah Chen, BH Specialist managing crisis pathway activations and BH referral coordination for the RHTP network.',
    slides: [
      {
        stepNum: 21,
        route: '/crisis-pathway',
        screenLabel: 'Crisis Pathway',
        storyBeat: 'SDOH context + 988/CSU/Mobile/ED dispatch + post-crisis linkage',
        speakerNotes:
          'The crisis pathway screen shows the BH specialist the full SDOH context for a patient in crisis — not just the clinical presentation, but the social determinants driving the crisis.',
        keyTalkingPoints: [
          'SDOH context panel: housing instability, food insecurity, social isolation — all visible during crisis',
          'Dispatch options: 988 Lifeline, CSU (Crisis Stabilization Unit), Mobile Crisis Team, ED',
          'Dispatch decision support: recommended pathway based on acuity and SDOH context',
          'Post-crisis linkage: automatic BH referral creation and CHW follow-up task',
        ],
        demoActions: [
          'Show the SDOH context panel — housing instability is the primary driver',
          'Show the dispatch options — recommend Mobile Crisis Team over ED',
          'Show the post-crisis linkage — BH referral and CHW follow-up created automatically',
        ],
      },
      {
        stepNum: 22,
        route: '/crisis-pathway',
        screenLabel: 'Patient Pathway — Dorothy Simmons',
        storyBeat: 'PRAPARE → SNAP → BH engagement → A1C 9.2% → 7.1%',
        speakerNotes:
          "Dorothy Simmons is the demo's anchor patient — her journey from PRAPARE screening through SNAP enrollment, BH engagement, and clinical improvement tells the whole-person story.",
        keyTalkingPoints: [
          "Dorothy's journey: PRAPARE screening (food insecurity + housing) → SNAP enrolled → BH engagement → A1C 9.2% → 7.1%",
          'Timeline shows the causal chain: social intervention → BH engagement → clinical improvement',
          'Each intervention is linked to a FHIR resource — full provenance chain',
          'This is the ROI story: $340 in social program costs → $4,200 in avoided clinical costs',
        ],
        demoActions: [
          "Show Dorothy's full pathway timeline",
          'Point to the A1C inflection — 6 months after SNAP enrollment',
          'Show the cost avoidance calculation — $4,200 in avoided ED visits',
        ],
      },
      {
        stepNum: 23,
        route: '/cbo-directory',
        screenLabel: 'CBO Directory',
        storyBeat: 'Community org network — domain-tagged, capacity status',
        speakerNotes:
          'The CBO directory shows the full community organization network — domain-tagged by SDOH area, with real-time capacity status and registration tier.',
        keyTalkingPoints: [
          'Domain-tagged CBOs: Food, Housing, Transportation, BH, Legal, Employment, Education',
          'Two tiers: Connected (45%) with FHIR integration vs. Unregistered (55%) with manual referral',
          'Real-time capacity status: Available, Limited, Waitlist, Closed',
          'Connected CBOs receive FHIR Tasks directly — closed-loop referral tracking',
          '"Register with RHTP" CTA for unregistered CBOs — the growth pathway',
        ],
        demoActions: [
          'Filter to Food domain — show the connected vs. unregistered CBOs',
          'Click on a connected CBO — show the FHIR Task inbox',
          'Show the "Register with RHTP" CTA for an unregistered CBO',
        ],
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
    personaContext:
      'Dr. Michael Park, Endocrinologist receiving referrals through the RHTP platform and managing specialist inbox tasks.',
    slides: [
      {
        stepNum: 24,
        route: '/care-team-inbox',
        screenLabel: 'Care Team Inbox',
        storyBeat: 'Universal task inbox — all programs',
        speakerNotes:
          'The care team inbox is the universal task management hub — clinical tasks, BH referrals, social program tasks, and administrative tasks all in one place.',
        keyTalkingPoints: [
          'Universal inbox: Clinical + BH + Social + Administrative tasks in one view',
          'Task priority: Urgent, High, Normal — color-coded',
          'FHIR Task resources — every task has a provenance chain',
          'Task assignment and delegation — route to the right team member',
          '8 open tasks shown — badge count matches the sidebar indicator',
        ],
        demoActions: [
          'Show the unified task list — point to the mix of clinical and social tasks',
          'Filter to Urgent tasks — show the 2 urgent items',
          'Click on a task — show the FHIR Task detail and action options',
        ],
      },
      {
        stepNum: 25,
        route: '/specialist-inbox',
        screenLabel: 'Specialist Inbox',
        storyBeat: 'Clinical specialist role view + gain-share value',
        speakerNotes:
          'The specialist inbox is the role-filtered view for clinical specialists. Each referral shows the gain-share value attributed to the specialist for completing the consultation.',
        keyTalkingPoints: [
          "Role-filtered view: only referrals relevant to this specialist's specialty",
          'Gain-share value per referral — specialist sees their financial contribution to the network',
          'Referral urgency and clinical context — ICD codes, referring provider, patient risk tier',
          'Accept/Decline/Redirect actions — specialist manages their own queue',
          '3 open referrals shown — badge count matches sidebar',
        ],
        demoActions: [
          'Show the specialist inbox — 3 open referrals',
          'Point to the gain-share value column — $180 per completed consultation',
          'Click "Accept" on the endocrinology referral for Dorothy Simmons',
        ],
      },
      {
        stepNum: 26,
        route: '/referral-tracking',
        screenLabel: 'Referral Tracking',
        storyBeat: 'Referrals in flight + multi-program tasks',
        speakerNotes:
          'The referral tracking screen shows all referrals in flight across the network — clinical, BH, and social program referrals in a unified view.',
        keyTalkingPoints: [
          'All referral types: Clinical specialist, BH counselor, CBO/social program',
          'Status pipeline: Pending → Submitted → Scheduled → Completed → Closed',
          'Days open tracking — SLA compliance flagged for overdue referrals',
          'Outcome metrics: acceptance rate, completion rate, time-to-appointment',
        ],
        demoActions: [
          'Show the active referrals table — mix of clinical and social referrals',
          'Filter to overdue referrals — show the SLA breach flags',
          'Show the outcome metrics panel — 78% completion rate',
        ],
      },
      {
        stepNum: 27,
        route: '/referral-journey-tracker',
        screenLabel: 'Referral Journey Tracker',
        storyBeat: 'End-to-end journey — 7 stages + audit trail',
        speakerNotes:
          'The referral journey tracker shows the end-to-end lifecycle of a single referral — 7 stages from creation to outcome with a full audit trail.',
        keyTalkingPoints: [
          '7-stage journey: Created → Submitted → Acknowledged → Scheduled → Completed → Documented → Closed',
          'Each stage has a timestamp and responsible party',
          'Audit trail: every status change logged with user, timestamp, and FHIR resource ID',
          'Bottleneck identification: which stage has the longest average dwell time',
        ],
        demoActions: [
          "Show the 7-stage journey for Dorothy's endocrinology referral",
          'Point to the bottleneck — Scheduled stage averages 8.2 days',
          'Show the audit trail — full provenance chain',
        ],
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
    personaContext:
      'Jennifer Walsh, Quality Analyst responsible for HEDIS measure compliance, care gap closure verification, and outcomes reporting for South Dakota DHSS.',
    slides: [
      {
        stepNum: 28,
        route: '/care-gap-closure-verification',
        screenLabel: 'Care Gap Closure & Verification',
        storyBeat: 'Multi-program evidence chain — FHIR provenance',
        speakerNotes:
          "The care gap closure verification screen is the quality analyst's audit tool. Every closed gap has a full evidence chain — clinical encounter, FHIR resource, measure credit, and gain-share attribution.",
        keyTalkingPoints: [
          'Multi-program evidence chain: Clinical + BH + Social gaps all verifiable',
          'FHIR provenance: every gap closure linked to a FHIR resource with timestamp and author',
          'Measure credit confirmation: gap closure → HEDIS/STARS measure credit → gain-share',
          'EDW submission status: confirmed, pending, rejected — real-time sync',
          'Dispute workflow: flag a gap closure for review with evidence resubmission',
        ],
        demoActions: [
          'Show the gap closure verification table — mix of clinical, BH, and social gaps',
          'Click into a closed HbA1c gap — show the full evidence chain',
          'Show the FHIR provenance panel — resource ID, timestamp, author',
          'Show the EDW submission confirmation',
        ],
      },
      {
        stepNum: 29,
        route: '/stars-hedis-mips',
        screenLabel: 'Quality Gaps & Attribution',
        storyBeat: 'Clinical + BH + Social program quality measures — 5 tabs',
        speakerNotes:
          'The quality analyst reviews all five measure sets — STARS, HEDIS, MIPS, BH-specific, and Social program outcomes — to identify compliance gaps and prioritize interventions.',
        keyTalkingPoints: [
          'STARS: current star rating vs. target — bonus threshold analysis',
          'HEDIS: measure-level compliance rates — which measures are below benchmark',
          'MIPS: payment adjustment calculation — positive/negative adjustment by provider',
          'BH measures: FUH (7-day follow-up), FUM (30-day follow-up), FBOM (BH outcome monitoring)',
          'Social measures: SDOH screening rate, program enrollment rate, gap closure rate',
        ],
        demoActions: [
          'Show the HEDIS tab — point to the 3 measures below benchmark',
          'Click into Diabetes HbA1c — show the patient-level drill-down',
          'Show the BH tab — FUH compliance at 67% vs. 75% target',
        ],
      },
      {
        stepNum: 30,
        route: '/outcomes-linkage',
        screenLabel: 'Outcomes Linkage',
        storyBeat: 'Social ROI — executive closing proof',
        speakerNotes:
          "The outcomes linkage screen provides the analyst with the statistical evidence base for the RHTP program's ROI. This is the data that goes into the CMS annual report.",
        keyTalkingPoints: [
          'Causal analysis: social intervention → clinical outcome with statistical significance',
          'Cohort comparison: intervention group vs. matched control group',
          'ROI calculation: program cost vs. avoided clinical cost — $3.40 return per dollar',
          'CMS reporting: outcomes formatted for RHTP annual report submission',
        ],
        demoActions: [
          'Show the housing → ED reduction analysis — p < 0.001',
          'Show the cohort comparison — intervention vs. control group',
          'Show the ROI summary — ready for CMS annual report',
        ],
      },
      {
        stepNum: 31,
        route: '/executive-outcomes-dashboard',
        screenLabel: 'Executive Dashboard',
        storyBeat: 'Closed loop — patient → network → state outcome',
        speakerNotes:
          "The demo closes where it started — the executive outcomes dashboard. But now the analyst can show the closed loop: Dorothy Simmons's individual journey aggregated into the population-level outcome that the state executive sees.",
        keyTalkingPoints: [
          'Closed loop: individual patient journey → network performance → state-level outcome',
          "Dorothy Simmons's A1C improvement is one data point in the 18% ED reduction trend",
          'Every CHW visit, SNAP enrollment, and BH session contributes to this dashboard',
          'This is the RHTP value proposition: whole-person care at population scale',
          'Shared savings generated: $2.1M in Year 1 — reinvested into network expansion',
        ],
        demoActions: [
          'Return to the Executive Dashboard — show the same screen as Step 3',
          'Point to the ED reduction trend — "Dorothy is one of these data points"',
          'Show the shared savings total — $2.1M generated, reinvested into CBO registration',
          'Close with: "This is the RHTP platform — whole-person care, measurable outcomes, shared savings"',
        ],
      },
    ],
  },
];

// ─── PDF Generation ───────────────────────────────────────────────────────────

function generateDemoDeckPDF(selectedPersonas: string[]) {
  const personas =
    selectedPersonas.length > 0
      ? DEMO_PERSONAS.filter((p) => selectedPersonas.includes(p.id))
      : DEMO_PERSONAS;

  const totalSlides = personas.reduce((sum, p) => sum + p.slides.length, 0);

  const slideHTML = personas
    .map((persona) => {
      const personaHeader = `
      <div class="persona-header" style="background:${persona.bgLight}; border-left: 6px solid ${persona.color};">
        <div class="persona-badge" style="background:${persona.color};">${persona.initials}</div>
        <div class="persona-info">
          <div class="persona-role" style="color:${persona.color};">${persona.role} — ${persona.title}</div>
          <div class="persona-context">${persona.personaContext}</div>
        </div>
      </div>
    `;

      const slidesHTML = persona.slides
        .map(
          (slide) => `
      <div class="slide">
        <div class="slide-header" style="border-top: 4px solid ${persona.color};">
          <div class="slide-meta">
            <span class="step-badge" style="background:${persona.color};">Step ${slide.stepNum}</span>
            <span class="slide-route">${slide.route}</span>
          </div>
          <h2 class="slide-title">${slide.screenLabel}</h2>
          <p class="story-beat">${slide.storyBeat}</p>
        </div>

        <div class="slide-body">
          <div class="slide-screen-placeholder" style="border: 2px dashed ${persona.color}; background: ${persona.bgLight};">
            <div class="screen-placeholder-inner">
              <div class="screen-icon" style="color:${persona.color};">⬛</div>
              <div class="screen-label" style="color:${persona.color};">${slide.screenLabel}</div>
              <div class="screen-url">${slide.route}</div>
            </div>
          </div>

          <div class="slide-notes">
            <div class="notes-section">
              <h4 class="notes-heading" style="color:${persona.color};">Speaker Notes</h4>
              <p class="notes-text">${slide.speakerNotes}</p>
            </div>

            <div class="notes-section">
              <h4 class="notes-heading" style="color:${persona.color};">Key Talking Points</h4>
              <ul class="talking-points">
                ${slide.keyTalkingPoints.map((pt) => `<li>${pt}</li>`).join('')}
              </ul>
            </div>

            <div class="notes-section">
              <h4 class="notes-heading" style="color:${persona.color};">Demo Actions</h4>
              <ol class="demo-actions">
                ${slide.demoActions.map((a) => `<li>${a}</li>`).join('')}
              </ol>
            </div>
          </div>
        </div>
      </div>
    `
        )
        .join('');

      return personaHeader + slidesHTML;
    })
    .join('<div class="persona-break"></div>');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>RHTP Platform — Demo Deck</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #161616; background: #f4f4f4; }

    /* Cover page */
    .cover {
      background: #0043ce;
      color: white;
      padding: 60px 48px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      page-break-after: always;
    }
    .cover-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.7; margin-bottom: 16px; }
    .cover-title { font-size: 36px; font-weight: 700; line-height: 1.2; margin-bottom: 12px; }
    .cover-subtitle { font-size: 16px; opacity: 0.85; margin-bottom: 40px; }
    .cover-meta { font-size: 12px; opacity: 0.6; }
    .cover-stats { display: flex; gap: 40px; margin: 32px 0; }
    .cover-stat { }
    .cover-stat-num { font-size: 32px; font-weight: 700; }
    .cover-stat-label { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    .cover-personas { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 8px; }
    .cover-persona-chip { background: rgba(255,255,255,0.15); padding: 6px 12px; font-size: 11px; font-weight: 600; }

    /* TOC */
    .toc {
      background: white;
      padding: 40px 48px;
      page-break-after: always;
    }
    .toc h2 { font-size: 20px; font-weight: 700; color: #0043ce; margin-bottom: 24px; border-bottom: 2px solid #0043ce; padding-bottom: 8px; }
    .toc-persona { margin-bottom: 20px; }
    .toc-persona-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    .toc-steps { display: flex; flex-wrap: wrap; gap: 4px; }
    .toc-step { font-size: 10px; padding: 3px 8px; color: white; font-weight: 600; }

    /* Persona header */
    .persona-header {
      padding: 16px 20px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin: 24px 0 0 0;
      page-break-before: always;
    }
    .persona-header:first-child { page-break-before: avoid; }
    .persona-badge {
      width: 40px; height: 40px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 13px;
      flex-shrink: 0;
    }
    .persona-role { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
    .persona-context { font-size: 11px; color: #525252; }

    /* Slide */
    .slide {
      background: white;
      margin: 12px 0;
      page-break-inside: avoid;
      border: 1px solid #e0e0e0;
    }
    .slide-header { padding: 16px 20px 12px; border-bottom: 1px solid #f4f4f4; }
    .slide-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .step-badge { color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; }
    .slide-route { font-size: 10px; color: #6f6f6f; font-family: monospace; }
    .slide-title { font-size: 16px; font-weight: 700; color: #161616; margin-bottom: 4px; }
    .story-beat { font-size: 11px; color: #525252; font-style: italic; }

    .slide-body { display: flex; gap: 0; }

    /* Screen placeholder */
    .slide-screen-placeholder {
      width: 340px;
      min-height: 220px;
      flex-shrink: 0;
      margin: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .screen-placeholder-inner { text-align: center; padding: 20px; }
    .screen-icon { font-size: 32px; margin-bottom: 8px; }
    .screen-label { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
    .screen-url { font-size: 10px; font-family: monospace; opacity: 0.6; }

    /* Notes */
    .slide-notes { flex: 1; padding: 16px 16px 16px 0; }
    .notes-section { margin-bottom: 14px; }
    .notes-heading { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .notes-text { font-size: 11px; color: #393939; line-height: 1.5; }
    .talking-points { padding-left: 16px; }
    .talking-points li { font-size: 11px; color: #393939; line-height: 1.5; margin-bottom: 3px; }
    .demo-actions { padding-left: 16px; }
    .demo-actions li { font-size: 11px; color: #393939; line-height: 1.5; margin-bottom: 3px; }

    .persona-break { page-break-before: always; height: 0; }

    /* Footer */
    .footer { margin-top: 32px; padding: 16px 48px; background: #161616; color: #a8a8a8; font-size: 10px; display: flex; justify-content: space-between; }

    @media print {
      body { background: white; }
      .cover { min-height: auto; }
      .slide { page-break-inside: avoid; }
      .persona-header { page-break-before: always; }
    }
  </style>
</head>
<body>

  <!-- Cover -->
  <div class="cover">
    <div class="cover-eyebrow">South Dakota DHSS · RHTP Platform</div>
    <div class="cover-title">Total Cost of Care Platform&lt;br/&gt;Demo Walkthrough</div>
    <div class="cover-subtitle">8-Persona Demo Sequence · Whole-Person Care · Shared Savings Model</div>
    <div class="cover-stats">
      <div class="cover-stat">
        <div class="cover-stat-num">8</div>
        <div class="cover-stat-label">Personas</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">${totalSlides}</div>
        <div class="cover-stat-label">Demo Steps</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">3</div>
        <div class="cover-stat-label">Program Pillars</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">$3.40</div>
        <div class="cover-stat-label">ROI per $1 invested</div>
      </div>
    </div>
    <div class="cover-personas">
      ${personas.map((p) => `<div class="cover-persona-chip">${p.role} · ${p.title}</div>`).join('')}
    </div>
    <div class="cover-meta" style="margin-top:32px;">
      Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · TCOC Platform · Confidential
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2>Demo Sequence Overview</h2>
    ${personas
      .map(
        (p) => `
      <div class="toc-persona">
        <div class="toc-persona-title" style="color:${p.color};">${p.role} — ${p.title}</div>
        <div class="toc-steps">
          ${p.slides.map((s) => `<div class="toc-step" style="background:${p.color};">Step ${s.stepNum}: ${s.screenLabel}</div>`).join('')}
        </div>
      </div>
    `
      )
      .join('')}
  </div>

  <!-- Slides -->
  ${slideHTML}

  <!-- Footer -->
  <div class="footer">
    <span>TCOC Total Cost of Care Platform — Demo Deck</span>
    <span>Confidential · For authorized demo use only · Richard Hennessy</span>
  </div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 600);
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function DemoDeckPage() {
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const togglePersona = (id: string) => {
    setSelectedPersonas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedPersonas(DEMO_PERSONAS.map((p) => p.id));
  const clearAll = () => setSelectedPersonas([]);

  const activePersonas =
    selectedPersonas.length > 0
      ? DEMO_PERSONAS.filter((p) => selectedPersonas.includes(p.id))
      : DEMO_PERSONAS;

  const totalSlides = activePersonas.reduce((sum, p) => sum + p.slides.length, 0);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateDemoDeckPDF(selectedPersonas);
      setGenerating(false);
    }, 100);
  };

  return (
    <AppLayout
      pageTitle="Demo Deck Generator"
      breadcrumbs={[{ label: 'System' }, { label: 'Demo Deck Generator' }]}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white border border-carbon-gray-20 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-carbon-gray-100 mb-1">Demo Deck Generator</h1>
              <p className="text-sm text-carbon-gray-60">
                Generate a printable PDF walkthrough of the full 8-persona demo sequence with
                speaker notes, talking points, and demo actions for each step.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 bg-carbon-blue text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Icon name="DocumentArrowDownIcon" size={16} />
              {generating ? 'Generating…' : `Generate PDF (${totalSlides} slides)`}
            </button>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-carbon-gray-20">
            <div className="text-center">
              <div className="text-2xl font-bold text-carbon-blue">{activePersonas.length}</div>
              <div className="text-xs text-carbon-gray-50 uppercase tracking-wide">Personas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-carbon-blue">{totalSlides}</div>
              <div className="text-xs text-carbon-gray-50 uppercase tracking-wide">Slides</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-carbon-blue">3</div>
              <div className="text-xs text-carbon-gray-50 uppercase tracking-wide">
                Program Pillars
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#198038]">$3.40</div>
              <div className="text-xs text-carbon-gray-50 uppercase tracking-wide">ROI per $1</div>
            </div>
            <div className="ml-auto">
              <p className="text-xs text-carbon-gray-50">
                Each slide includes speaker notes, key talking points, and step-by-step demo
                actions. Print or save as PDF from the browser print dialog.
              </p>
            </div>
          </div>
        </div>

        {/* Persona selector */}
        <div className="bg-white border border-carbon-gray-20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-carbon-gray-100 uppercase tracking-wide">
              Select Personas to Include
            </h2>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 border border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
              >
                Clear (All)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEMO_PERSONAS.map((persona) => {
              const isSelected =
                selectedPersonas.length === 0 || selectedPersonas.includes(persona.id);
              const isExplicitlySelected = selectedPersonas.includes(persona.id);
              return (
                <button
                  key={persona.id}
                  onClick={() => togglePersona(persona.id)}
                  className={`flex items-start gap-3 p-4 border-2 text-left transition-all ${
                    isExplicitlySelected
                      ? 'border-current'
                      : selectedPersonas.length === 0
                        ? 'border-carbon-gray-20 hover:border-carbon-gray-30'
                        : 'border-carbon-gray-20 opacity-50 hover:opacity-75'
                  }`}
                  style={isExplicitlySelected ? { borderColor: persona.color } : {}}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                    style={{ backgroundColor: persona.color }}
                  >
                    {persona.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-bold uppercase tracking-wide"
                        style={{ color: persona.color }}
                      >
                        {persona.role}
                      </span>
                      <span className="text-sm font-semibold text-carbon-gray-100">
                        {persona.title}
                      </span>
                    </div>
                    <p className="text-xs text-carbon-gray-60 mb-2">{persona.personaContext}</p>
                    <div className="flex flex-wrap gap-1">
                      {persona.slides.map((s) => (
                        <span
                          key={s.stepNum}
                          className="text-2xs px-1.5 py-0.5 text-white font-semibold"
                          style={{ backgroundColor: persona.color }}
                        >
                          {s.stepNum}
                        </span>
                      ))}
                      <span className="text-2xs text-carbon-gray-50 self-center ml-1">
                        {persona.slides.length} slides
                      </span>
                    </div>
                  </div>
                  {isExplicitlySelected && (
                    <Icon
                      name="CheckCircleIcon"
                      size={18}
                      style={{ color: persona.color } as React.CSSProperties}
                      className="flex-shrink-0 mt-0.5"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slide preview */}
        <div className="bg-white border border-carbon-gray-20 p-6">
          <h2 className="text-sm font-semibold text-carbon-gray-100 uppercase tracking-wide mb-4">
            Slide Preview
          </h2>
          <div className="space-y-6">
            {activePersonas.map((persona) => (
              <div key={persona.id}>
                {/* Persona header */}
                <div
                  className="flex items-center gap-3 p-3 mb-3"
                  style={{
                    backgroundColor: persona.bgLight,
                    borderLeft: `4px solid ${persona.color}`,
                  }}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: persona.color }}
                  >
                    {persona.initials}
                  </div>
                  <div>
                    <span
                      className="text-xs font-bold uppercase tracking-wide mr-2"
                      style={{ color: persona.color }}
                    >
                      {persona.role}
                    </span>
                    <span className="text-sm font-semibold text-carbon-gray-100">
                      {persona.title}
                    </span>
                    <p className="text-xs text-carbon-gray-60 mt-0.5">{persona.personaContext}</p>
                  </div>
                </div>

                {/* Slides */}
                <div className="space-y-3 ml-4">
                  {persona.slides.map((slide) => (
                    <div
                      key={slide.stepNum}
                      className="border border-carbon-gray-20 overflow-hidden"
                    >
                      {/* Slide header */}
                      <div
                        className="px-4 py-3"
                        style={{ borderTop: `3px solid ${persona.color}` }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-bold text-white px-2 py-0.5"
                            style={{ backgroundColor: persona.color }}
                          >
                            Step {slide.stepNum}
                          </span>
                          <span className="text-xs text-carbon-gray-50 font-mono">
                            {slide.route}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-carbon-gray-100">
                          {slide.screenLabel}
                        </h3>
                        <p className="text-xs text-carbon-gray-60 italic">{slide.storyBeat}</p>
                      </div>

                      {/* Slide body */}
                      <div className="flex gap-0 border-t border-carbon-gray-20">
                        {/* Screen placeholder */}
                        <div
                          className="w-48 flex-shrink-0 flex items-center justify-center m-3 border-2 border-dashed"
                          style={{
                            borderColor: persona.color,
                            backgroundColor: persona.bgLight,
                            minHeight: 100,
                          }}
                        >
                          <div className="text-center p-3">
                            <Icon
                              name="ComputerDesktopIcon"
                              size={24}
                              style={{ color: persona.color } as React.CSSProperties}
                              className="mx-auto mb-1"
                            />
                            <p className="text-xs font-semibold" style={{ color: persona.color }}>
                              {slide.screenLabel}
                            </p>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="flex-1 p-3 space-y-3">
                          <div>
                            <p
                              className="text-2xs font-bold uppercase tracking-wide mb-1"
                              style={{ color: persona.color }}
                            >
                              Speaker Notes
                            </p>
                            <p className="text-xs text-carbon-gray-70 leading-relaxed">
                              {slide.speakerNotes}
                            </p>
                          </div>
                          <div>
                            <p
                              className="text-2xs font-bold uppercase tracking-wide mb-1"
                              style={{ color: persona.color }}
                            >
                              Key Talking Points
                            </p>
                            <ul className="space-y-0.5">
                              {slide.keyTalkingPoints.map((pt, i) => (
                                <li key={i} className="text-xs text-carbon-gray-70 flex gap-1.5">
                                  <span
                                    className="flex-shrink-0 mt-0.5"
                                    style={{ color: persona.color }}
                                  >
                                    •
                                  </span>
                                  <span>{pt}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p
                              className="text-2xs font-bold uppercase tracking-wide mb-1"
                              style={{ color: persona.color }}
                            >
                              Demo Actions
                            </p>
                            <ol className="space-y-0.5">
                              {slide.demoActions.map((action, i) => (
                                <li key={i} className="text-xs text-carbon-gray-70 flex gap-1.5">
                                  <span
                                    className="flex-shrink-0 font-bold"
                                    style={{ color: persona.color }}
                                  >
                                    {i + 1}.
                                  </span>
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Generate button (bottom) */}
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-6 py-3 bg-carbon-blue text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Icon name="DocumentArrowDownIcon" size={16} />
            {generating ? 'Generating…' : `Generate & Print PDF (${totalSlides} slides)`}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
