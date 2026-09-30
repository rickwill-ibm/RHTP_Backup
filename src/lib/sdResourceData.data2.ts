// ─── sdResourceData.data2.ts ──────────────────────────────────────────────────
// Transport resources, Maria Redhawk's confirmed PRAPARE domains,
// SD domain recommendations, and care team contacts.

// ─── SD Transport Resources ───────────────────────────────────────────────────
export const SD_TRANSPORT = {
  NEMT: {
    name: 'SD Medicaid Non-Emergency Medical Transport (NEMT)',
    phone: '(800) 555-0190',
    address: '410 Prairie Ridge Rd, Martin, SD 57551',
    description: 'Free medical transport for Medicaid members to covered appointments',
    eligibility: 'Active SD Medicaid enrollment required',
    bookingLead: '3 business days advance notice',
  },
  BENNETT_ACTION: {
    name: 'Frontier Community Action CBO — Transport Coordination',
    phone: '(605) 555-0166',
    address: '212 Frontier Way, Martin, SD 57551',
    description: 'Volunteer driver coordination for Bennett County residents',
    eligibility: 'Bennett County residents',
    bookingLead: '48 hours advance notice',
  },
  SD_MEDICAID_TRANSPORT: {
    name: 'State Medicaid Transport Benefit',
    phone: '(605) 555-0173',
    address: '700 Statehouse Dr, Pierre, SD 57501',
    description: 'Statewide Medicaid transport coordination',
    eligibility: 'Active SD Medicaid enrollment',
    bookingLead: '5 business days advance notice',
  },
};

// ─── Maria Redhawk Confirmed PRAPARE Domains ──────────────────────────────────
// Pre-populated from confirmed PRAPARE screening results per PDF
// Used by Social Needs Screening and other screens when Maria is active patient

export const MARIA_CONFIRMED_PRAPARE = {
  patientId: 'MARIA_SD_001',
  screeningDate: '2026-04-15',
  screener: 'Sarah Johnson (Care Manager)',
  instrument: 'PRAPARE / findhelp 13-Domain',

  // Confirmed HIGH risk domains
  transportation: {
    status: 'HIGH' as const,
    confirmed: true,
    detail: '47 miles to nearest specialist, no vehicle — BLOCKER for HbA1c, Well-Child, Edinburgh',
    questionResponses: { t1: 2 }, // Yes, most of the time
    recommendedCBO: 'Medicaid NEMT — Bennett County',
    cboPhone: '(800) 555-0190',
    uniteUsTask: true,
  },
  childcare: {
    status: 'HIGH' as const,
    confirmed: true,
    detail:
      'No childcare coverage — blocks all daytime appointments. Sophia (24mo) has no provider.',
    questionResponses: { su1: 2 },
    recommendedCBO: 'State Benefits Office — Frontier District (CCAP)',
    cboPhone: '(605) 555-0168',
    monthlyValue: '$487/mo',
    uniteUsTask: true,
  },
  food: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'SNAP active (current), WIC lapsed — household food security at risk',
    questionResponses: { f1: 2, f2: 2 }, // Often true
    recommendedCBO: 'Regional WIC Office',
    cboPhone: '(605) 555-0168',
    uniteUsTask: true,
  },
  financial: {
    status: 'HIGH' as const,
    confirmed: true,
    detail: 'Very hard to pay for basics — single parent, early shift employment',
    questionResponses: { fi1: 3, fi2: 1 }, // Very hard
    recommendedCBO: 'Frontier Community Action CBO',
    cboPhone: '(605) 555-0166',
    uniteUsTask: true,
  },
  housing: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'Worried about losing housing — rental assistance waitlist #47, est. 18 months',
    questionResponses: { h1: 2, h2: 0 }, // Worried about losing housing
    recommendedCBO: 'State Housing Finance Agency',
    cboPhone: '(605) 555-0174',
    uniteUsTask: false,
  },
  utilities: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'LIHEAP eligible but not yet applied — West Central Electric Cooperative service area',
    questionResponses: { u1: 1 }, // Yes, some of the time
    recommendedCBO: 'Highland Community Action Partnership',
    cboPhone: '(605) 555-0165',
    uniteUsTask: false,
  },
  mentalHealth: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail:
      'Edinburgh PND 11 — Moderate risk. BH referral open, not yet accepted. Postpartum unmanaged.',
    questionResponses: { mh1: 2, mh2: 2, mh3: 3 }, // More than half the days / fairly often
    recommendedCBO: 'Prairie Health Services — Postpartum Support Group',
    cboPhone: '(605) 555-0168',
    bhGated: true, // Requires BH consent
    uniteUsTask: true,
  },
  employment: {
    status: 'STABLE' as const,
    confirmed: true,
    detail: 'Part-time employment — Frontier School District, early shift',
    questionResponses: { e1: 1 }, // Part-time
    recommendedCBO: null,
    uniteUsTask: false,
  },

  // Unconfirmed domains (need current screening)
  unconfirmedDomains: ['physical_activity', 'substance_use', 'education', 'safety', 'disabilities'],

  // Summary
  totalConfirmedUnmet: 5,
  totalConfirmedModerate: 3,
  totalConfirmedHigh: 3,
  primaryBlocker:
    'Transportation — 47 miles, no vehicle. Blocks HbA1c, Well-Child, Edinburgh screening.',
  secondaryBlocker: 'Childcare — no coverage. Blocks all daytime appointments.',
  aiCopilotNote:
    "Transport barrier is the primary blocker — affects HbA1c, Well-Child, and Edinburgh. Childcare subsidy ($487/mo) resolves appointment barrier. Bundle Sophia's well-child + Maria's HbA1c — one trip to Winner. Edinburgh 427 days — BH referral sent, not yet accepted. SMS 3pm–7pm only.",
};

// ─── SD Recommendations by Domain ────────────────────────────────────────────
// Used by Social Needs Screening recommendations panel
export const SD_RECOMMENDATIONS: Record<
  string,
  { name: string; org: string; phone: string; address: string; city: string; connected: boolean }[]
> = {
  housing: [
    {
      name: 'Rental Assistance Waitlist',
      org: 'State Housing Finance Agency',
      phone: '(605) 555-0174',
      address: '500 Capitol Plaza',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Emergency Housing',
      org: 'Frontier Community Action CBO',
      phone: '(605) 555-0166',
      address: '212 Frontier Way',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Section 8 Voucher Program',
      org: 'State Housing Finance Agency',
      phone: '(605) 555-0174',
      address: '500 Capitol Plaza',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'Transitional Housing',
      org: 'Prairie Roots Food Network',
      phone: '(605) 555-0183',
      address: '45 Cottonwood Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
    {
      name: 'Rapid Rehousing',
      org: 'SD Community Action Partnership',
      phone: '(605) 555-0165',
      address: '601 Highland St',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
  ],
  food: [
    {
      name: 'Food Pantry & SNAP Assistance',
      org: 'Prairie Roots Food Network',
      phone: '(605) 555-0183',
      address: '45 Cottonwood Dr',
      city: 'Pine Ridge, SD 57770',
      connected: true,
    },
    {
      name: 'WIC — Women, Infants & Children',
      org: 'Regional WIC Office',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'SNAP Enrollment',
      org: 'State Benefits Office — Frontier District',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Regional Food Bank',
      org: 'South Dakota Food Bank',
      phone: '(605) 555-0163',
      address: '4701 N Metro Ave',
      city: 'Sioux Falls, SD 57107',
      connected: false,
    },
    {
      name: 'Meals on Wheels',
      org: 'State Area Agency on Aging',
      phone: '(605) 555-0177',
      address: '700 Statehouse Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
  ],
  transportation: [
    {
      name: 'Medical Transportation (NEMT)',
      org: 'Medicaid NEMT — Bennett County',
      phone: '(800) 555-0190',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Volunteer Driver Program',
      org: 'Frontier Community Action CBO',
      phone: '(605) 555-0166',
      address: '212 Frontier Way',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'State Medicaid Transport Benefit',
      org: 'SD Medicaid',
      phone: '(605) 555-0173',
      address: '700 Statehouse Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Senior Ride Program',
      org: 'State Area Agency on Aging',
      phone: '(605) 555-0177',
      address: '700 Statehouse Dr',
      city: 'Pierre, SD 57501',
      connected: false,
    },
  ],
  utility: [
    {
      name: 'LIHEAP Energy Assistance',
      org: 'Highland Community Action Partnership',
      phone: '(605) 555-0165',
      address: '601 Highland St',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
    {
      name: 'Utility Assistance',
      org: 'Frontier Community Action CBO',
      phone: '(605) 555-0166',
      address: '212 Frontier Way',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'West Central Electric Cooperative',
      org: 'West Central Electric Cooperative',
      phone: '(605) 555-0167',
      address: 'PO Box 37',
      city: 'Murdo, SD 57559',
      connected: false,
    },
  ],
  safety: [
    {
      name: 'Crisis & Safety Services',
      org: 'Summit Regional Crisis Line',
      phone: '(605) 555-0172',
      address: '1450 Summit Ridge Rd',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
    {
      name: 'Domestic Violence Services',
      org: 'Safe Harbor Center — Domestic Violence',
      phone: '(605) 555-0180',
      address: '820 Cedar Bluff Dr',
      city: 'Winner, SD 57580',
      connected: true,
    },
    {
      name: 'State DV Hotline',
      org: 'SD Coalition Against Domestic Violence',
      phone: '(800) 555-0188',
      address: 'Statewide',
      city: 'South Dakota',
      connected: false,
    },
  ],
  financial: [
    {
      name: 'Benefit Enrollment Assistance',
      org: 'Frontier Community Action CBO',
      phone: '(605) 555-0166',
      address: '212 Frontier Way',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'TANF — Cash Assistance',
      org: 'State Benefits Office — Frontier District',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Financial Counseling',
      org: 'Statewide Credit Counseling Service',
      phone: '(605) 555-0162',
      address: '4901 E Metro St',
      city: 'Sioux Falls, SD 57110',
      connected: false,
    },
  ],
  employment: [
    {
      name: 'Employment & Job Training',
      org: 'State Workforce Office — Frontier District',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: false,
    },
    {
      name: 'WIOA Job Services',
      org: 'SD Workforce Development',
      phone: '(605) 555-0178',
      address: '700 Statehouse Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Tribal Employment Rights',
      org: 'Tribal Employment Program',
      phone: '(605) 555-0183',
      address: '45 Cottonwood Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
  ],
  support: [
    {
      name: 'Postpartum Support Group',
      org: 'Prairie Health Services',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Caregiver Support',
      org: 'State Area Agency on Aging',
      phone: '(605) 555-0177',
      address: '700 Statehouse Dr',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'Adult Day Services',
      org: 'Cedar Valley Critical Access Hospital',
      phone: '(605) 555-0181',
      address: '820 Cedar Bluff Dr',
      city: 'Winner, SD 57580',
      connected: false,
    },
  ],
  education: [
    {
      name: 'Education & Literacy',
      org: 'Statewide Literacy Council',
      phone: '(605) 555-0160',
      address: '104 N Statewide Ave',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'GED Programs',
      org: 'Frontier School District',
      phone: '(605) 555-0170',
      address: '101 W 1st St',
      city: 'Martin, SD 57551',
      connected: false,
    },
    {
      name: 'Adult Education',
      org: 'SD Board of Regents',
      phone: '(605) 555-0176',
      address: '306 E Statewide Ave',
      city: 'Pierre, SD 57501',
      connected: true,
    },
  ],
  physical_activity: [
    {
      name: 'Physical Activity & Wellness',
      org: 'Riverside Medical Associates',
      phone: '(605) 555-0179',
      address: '400 Park St',
      city: 'Burke, SD 57523',
      connected: false,
    },
    {
      name: 'Tribal Wellness Programs',
      org: 'Tribal Health Program Administration',
      phone: '(605) 555-0182',
      address: '45 Cottonwood Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
  ],
  substance_use: [
    {
      name: 'Substance Use Treatment',
      org: 'Riverbend Health Services',
      phone: '(605) 555-0171',
      address: '1201 Riverbend Hwy',
      city: 'Hot Springs, SD 57747',
      connected: true,
    },
    {
      name: 'State Substance Use Counseling',
      org: 'Cedar Valley Behavioral Health',
      phone: '(605) 555-0161',
      address: '3900 S Statewide Ave',
      city: 'Sioux Falls, SD 57105',
      connected: false,
    },
    {
      name: 'AA / NA Meetings',
      org: 'SD AA Intergroup',
      phone: '(605) 555-0164',
      address: 'Multiple Locations',
      city: 'South Dakota',
      connected: false,
    },
  ],
  mental_health: [
    {
      name: 'Postpartum Support Group',
      org: 'Prairie Health Services',
      phone: '(605) 555-0168',
      address: '410 Prairie Ridge Rd',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Behavioral Health Services',
      org: 'Cedar Valley BH',
      phone: '(605) 555-0181',
      address: '820 Cedar Bluff Dr',
      city: 'Winner, SD 57580',
      connected: false,
    },
    {
      name: 'SD 988 Crisis Line',
      org: 'SD 988 Network',
      phone: '988',
      address: 'Statewide',
      city: 'South Dakota',
      connected: false,
    },
  ],
  disabilities: [
    {
      name: 'Disability & Independent Living',
      org: 'Statewide Disability Advocacy Services',
      phone: '(605) 555-0159',
      address: '221 S Regional Ave',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Disability Benefits',
      org: 'SSA — SD Field Office',
      phone: '(800) 555-0189',
      address: '2525 Highland Main St',
      city: 'Rapid City, SD 57702',
      connected: false,
    },
    {
      name: 'ADA Services',
      org: 'Statewide Disability Advocacy Services',
      phone: '(605) 555-0159',
      address: '221 S Regional Ave',
      city: 'Pierre, SD 57501',
      connected: true,
    },
  ],
};

// ─── SD Care Team Contacts ────────────────────────────────────────────────────
export const SD_CARE_TEAM = {
  SARAH_JOHNSON: {
    name: 'Sarah Johnson',
    role: 'Care Manager',
    org: 'Prairie Health RHTP',
    phone: '(605) 555-0168',
    email: 'sjohnson@prairie-health.example.org',
  },
  ANGELA_TORRES: {
    name: 'Angela Torres',
    role: 'CHW Supervisor',
    org: 'Frontier Community Action CBO',
    phone: '(605) 555-0166',
    email: 'atorres@frontier-action.example.org',
  },
  DR_MENDEZ: {
    name: 'Dr. Carlos Mendez-Ruiz',
    role: 'PCP',
    org: 'Prairie Health Services',
    phone: '(605) 555-0168',
    email: 'cmendez@prairie-health.example.org',
  },
  DR_NAKAMURA: {
    name: 'Dr. Sarah Nakamura',
    role: 'Behavioral Health',
    org: 'Cedar Valley Behavioral Health — Winner',
    phone: '(605) 555-0181',
    email: 'snakamura@cedar-valley.example.org',
  },
};
