// ─── sdResourceData.data2.ts ──────────────────────────────────────────────────
// Transport resources, Maria Redhawk's confirmed PRAPARE domains,
// SD domain recommendations, and care team contacts.

// ─── SD Transport Resources ───────────────────────────────────────────────────
export const SD_TRANSPORT = {
  NEMT: {
    name: 'SD Medicaid Non-Emergency Medical Transport (NEMT)',
    phone: '(800) 843-8394',
    address: '102 N Van Buren St, Martin, SD 57551',
    description: 'Free medical transport for Medicaid members to covered appointments',
    eligibility: 'Active SD Medicaid enrollment required',
    bookingLead: '3 business days advance notice',
  },
  BENNETT_ACTION: {
    name: 'Bennett County Action CBO — Transport Coordination',
    phone: '(605) 685-6100',
    address: '204 W 3rd St, Martin, SD 57551',
    description: 'Volunteer driver coordination for Bennett County residents',
    eligibility: 'Bennett County residents',
    bookingLead: '48 hours advance notice',
  },
  SD_MEDICAID_TRANSPORT: {
    name: 'SD Medicaid Transport Benefit',
    phone: '(605) 773-3165',
    address: '700 Governors Dr, Pierre, SD 57501',
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
    cboPhone: '(800) 843-8394',
    uniteUsTask: true,
  },
  childcare: {
    status: 'HIGH' as const,
    confirmed: true,
    detail:
      'No childcare coverage — blocks all daytime appointments. Sophia (24mo) has no provider.',
    questionResponses: { su1: 2 },
    recommendedCBO: 'SD DSS Bennett County Office (CCAP)',
    cboPhone: '(605) 685-6622',
    monthlyValue: '$487/mo',
    uniteUsTask: true,
  },
  food: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'SNAP active (current), WIC lapsed — household food security at risk',
    questionResponses: { f1: 2, f2: 2 }, // Often true
    recommendedCBO: 'Bennett County WIC Office',
    cboPhone: '(605) 685-6622',
    uniteUsTask: true,
  },
  financial: {
    status: 'HIGH' as const,
    confirmed: true,
    detail: 'Very hard to pay for basics — single parent, early shift employment',
    questionResponses: { fi1: 3, fi2: 1 }, // Very hard
    recommendedCBO: 'Bennett County Action CBO',
    cboPhone: '(605) 685-6100',
    uniteUsTask: true,
  },
  housing: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'Worried about losing housing — rental assistance waitlist #47, est. 18 months',
    questionResponses: { h1: 2, h2: 0 }, // Worried about losing housing
    recommendedCBO: 'SD Housing Development Authority',
    cboPhone: '(605) 773-3181',
    uniteUsTask: false,
  },
  utilities: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail: 'LIHEAP eligible but not yet applied — West Central Electric Cooperative service area',
    questionResponses: { u1: 1 }, // Yes, some of the time
    recommendedCBO: 'Community Action Partnership of the Black Hills',
    cboPhone: '(605) 348-0820',
    uniteUsTask: false,
  },
  mentalHealth: {
    status: 'MODERATE' as const,
    confirmed: true,
    detail:
      'Edinburgh PND 11 — Moderate risk. BH referral open, not yet accepted. Postpartum unmanaged.',
    questionResponses: { mh1: 2, mh2: 2, mh3: 3 }, // More than half the days / fairly often
    recommendedCBO: 'Bennett County Health Services — Postpartum Support Group',
    cboPhone: '(605) 685-6622',
    bhGated: true, // Requires BH consent
    uniteUsTask: true,
  },
  employment: {
    status: 'STABLE' as const,
    confirmed: true,
    detail: 'Part-time employment — Bennett County School District, early shift',
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
      org: 'SD Housing Development Authority',
      phone: '(605) 773-3181',
      address: '3060 E Elizabeth St',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Emergency Housing',
      org: 'Bennett County Action CBO',
      phone: '(605) 685-6100',
      address: '204 W 3rd St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Section 8 Voucher Program',
      org: 'SD Housing Development Authority',
      phone: '(605) 773-3181',
      address: '3060 E Elizabeth St',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'Transitional Housing',
      org: 'Oglala Sioux Tribe Community Services',
      phone: '(605) 867-5821',
      address: '1 Crazy Horse Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
    {
      name: 'Rapid Rehousing',
      org: 'SD Community Action Partnership',
      phone: '(605) 348-0820',
      address: '601 E St Joseph St',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
  ],
  food: [
    {
      name: 'Food Pantry & SNAP Assistance',
      org: 'Oglala Sioux Tribe Community Services',
      phone: '(605) 867-5821',
      address: '1 Crazy Horse Dr',
      city: 'Pine Ridge, SD 57770',
      connected: true,
    },
    {
      name: 'WIC — Women, Infants & Children',
      org: 'Bennett County WIC Office',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'SNAP Enrollment',
      org: 'SD DSS Bennett County Office',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'SD Food Bank',
      org: 'South Dakota Food Bank',
      phone: '(605) 335-0364',
      address: '4701 N Westport Ave',
      city: 'Sioux Falls, SD 57107',
      connected: false,
    },
    {
      name: 'Meals on Wheels',
      org: 'SD Area Agency on Aging',
      phone: '(605) 773-3656',
      address: '700 Governors Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
  ],
  transportation: [
    {
      name: 'Medical Transportation (NEMT)',
      org: 'Medicaid NEMT — Bennett County',
      phone: '(800) 843-8394',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Volunteer Driver Program',
      org: 'Bennett County Action CBO',
      phone: '(605) 685-6100',
      address: '204 W 3rd St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'SD Medicaid Transport Benefit',
      org: 'SD Medicaid',
      phone: '(605) 773-3165',
      address: '700 Governors Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Senior Ride Program',
      org: 'SD Area Agency on Aging',
      phone: '(605) 773-3656',
      address: '700 Governors Dr',
      city: 'Pierre, SD 57501',
      connected: false,
    },
  ],
  utility: [
    {
      name: 'LIHEAP Energy Assistance',
      org: 'Community Action Partnership of the Black Hills',
      phone: '(605) 348-0820',
      address: '601 E St Joseph St',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
    {
      name: 'Utility Assistance',
      org: 'Bennett County Action CBO',
      phone: '(605) 685-6100',
      address: '204 W 3rd St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'West Central Electric Cooperative',
      org: 'West Central Electric Cooperative',
      phone: '(605) 685-6581',
      address: 'PO Box 37',
      city: 'Murdo, SD 57559',
      connected: false,
    },
  ],
  safety: [
    {
      name: 'Crisis & Safety Services',
      org: 'Monument Health Crisis Line',
      phone: '(605) 755-1000',
      address: '677 Cathedral Dr',
      city: 'Rapid City, SD 57701',
      connected: true,
    },
    {
      name: 'Domestic Violence Services',
      org: 'Sacred Heart Center — DV',
      phone: '(605) 842-1234',
      address: '501 Summit St',
      city: 'Winner, SD 57580',
      connected: true,
    },
    {
      name: 'SD DV Hotline',
      org: 'SD Coalition Against Domestic Violence',
      phone: '(800) 430-7233',
      address: 'Statewide',
      city: 'South Dakota',
      connected: false,
    },
  ],
  financial: [
    {
      name: 'Benefit Enrollment Assistance',
      org: 'Bennett County Action CBO',
      phone: '(605) 685-6100',
      address: '204 W 3rd St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'TANF — Cash Assistance',
      org: 'SD DSS Bennett County Office',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Financial Counseling',
      org: 'SD Consumer Credit Counseling',
      phone: '(605) 334-6004',
      address: '4901 E 26th St',
      city: 'Sioux Falls, SD 57110',
      connected: false,
    },
  ],
  employment: [
    {
      name: 'Employment & Job Training',
      org: 'SD Department of Labor — Bennett County',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: false,
    },
    {
      name: 'WIOA Job Services',
      org: 'SD Workforce Development',
      phone: '(605) 773-5017',
      address: '700 Governors Dr',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Tribal Employment Rights',
      org: 'Oglala Sioux Tribe Employment',
      phone: '(605) 867-5821',
      address: '1 Crazy Horse Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
  ],
  support: [
    {
      name: 'Postpartum Support Group',
      org: 'Bennett County Health Services',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Caregiver Support',
      org: 'SD Area Agency on Aging',
      phone: '(605) 773-3656',
      address: '700 Governors Dr',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'Adult Day Services',
      org: 'Avera Sacred Heart CAH',
      phone: '(605) 842-7100',
      address: '501 Summit St',
      city: 'Winner, SD 57580',
      connected: false,
    },
  ],
  education: [
    {
      name: 'Education & Literacy',
      org: 'SD Literacy Council',
      phone: '(605) 224-9738',
      address: '104 N Euclid Ave',
      city: 'Pierre, SD 57501',
      connected: false,
    },
    {
      name: 'GED Programs',
      org: 'Bennett County School District',
      phone: '(605) 685-6996',
      address: '101 W 1st St',
      city: 'Martin, SD 57551',
      connected: false,
    },
    {
      name: 'Adult Education',
      org: 'SD Board of Regents',
      phone: '(605) 773-3455',
      address: '306 E Capitol Ave',
      city: 'Pierre, SD 57501',
      connected: true,
    },
  ],
  physical_activity: [
    {
      name: 'Physical Activity & Wellness',
      org: 'Gregory County Medical Associates',
      phone: '(605) 835-8394',
      address: '400 Park St',
      city: 'Burke, SD 57523',
      connected: false,
    },
    {
      name: 'Tribal Wellness Programs',
      org: 'Oglala Sioux Tribe Health Administration',
      phone: '(605) 867-5131',
      address: '1 Crazy Horse Dr',
      city: 'Pine Ridge, SD 57770',
      connected: false,
    },
  ],
  substance_use: [
    {
      name: 'Substance Use Treatment',
      org: 'Fall River Health Services',
      phone: '(605) 745-3159',
      address: '1201 Highway 71',
      city: 'Hot Springs, SD 57747',
      connected: true,
    },
    {
      name: 'SD Substance Use Counseling',
      org: 'Avera Behavioral Health',
      phone: '(605) 322-4065',
      address: '3900 S Kiwanis Ave',
      city: 'Sioux Falls, SD 57105',
      connected: false,
    },
    {
      name: 'AA / NA Meetings',
      org: 'SD AA Intergroup',
      phone: '(605) 336-0624',
      address: 'Multiple Locations',
      city: 'South Dakota',
      connected: false,
    },
  ],
  mental_health: [
    {
      name: 'Postpartum Support Group',
      org: 'Bennett County Health Services',
      phone: '(605) 685-6622',
      address: '102 N Van Buren St',
      city: 'Martin, SD 57551',
      connected: true,
    },
    {
      name: 'Behavioral Health Services',
      org: 'Avera Sacred Heart CAH — BH',
      phone: '(605) 842-7100',
      address: '501 Summit St',
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
      org: 'SD Advocacy Services',
      phone: '(605) 224-8294',
      address: '221 S Central Ave',
      city: 'Pierre, SD 57501',
      connected: true,
    },
    {
      name: 'Disability Benefits',
      org: 'SSA — SD Field Office',
      phone: '(800) 772-1213',
      address: '2525 W Main St',
      city: 'Rapid City, SD 57702',
      connected: false,
    },
    {
      name: 'ADA Services',
      org: 'SD Disability Rights',
      phone: '(605) 224-8294',
      address: '221 S Central Ave',
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
    org: 'Bennett County Health RHTP',
    phone: '(605) 685-6622',
    email: 'sjohnson@bennettcountyhealth.org',
  },
  ANGELA_TORRES: {
    name: 'Angela Torres',
    role: 'CHW Supervisor',
    org: 'Bennett County Action CBO',
    phone: '(605) 685-6100',
    email: 'atorres@bennettcountyaction.org',
  },
  DR_MENDEZ: {
    name: 'Dr. Carlos Mendez-Ruiz',
    role: 'PCP',
    org: 'Bennett County Health Services',
    phone: '(605) 685-6622',
    email: 'cmendez@bennettcountyhealth.org',
  },
  DR_NAKAMURA: {
    name: 'Dr. Sarah Nakamura',
    role: 'Behavioral Health',
    org: 'Avera Behavioral Health — Winner',
    phone: '(605) 842-7100',
    email: 'snakamura@avera.org',
  },
};
