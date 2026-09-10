// storyNarrative.genSteps.ts — the seventeen narrated Story Mode steps, per patient.
//
// Same arc, routes, order, personas, moods and metric intent as the authored Maria
// keynote; every asserted fact rewritten from the patient's real registry data.
// Steps 1, 16 and 17 are system/compliance-level and returned verbatim. The final
// re-map keeps each step's `chapter` in sync with the per-patient Ch.2 card so the
// overlay's chapters.find(c => c.chapter === step.chapter) never misses.

import type { RegistryPatient } from '../../lib/patientRegistry.types';
import type { StoryStep } from './storyNarrative.types';
import { MARIA_STEPS } from './storyNarrative.maria';
import {
  buildProfile,
  clinicalFlagPhrase,
  socialBarrierPhrase,
  joinList,
  poss,
  money,
  niceGap,
  outcomeMetric,
  flaggedMetric,
} from './storyNarrative.profile';

export function genSteps(p: RegistryPatient): StoryStep[] {
  const f = buildProfile(p);
  const id = f.id;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const clinicalFlag = clinicalFlagPhrase(f);
  const bhFlag = f.bhOn ? (/audit/i.test(p.bhScreeningLabel || '') ? 'an alcohol-use flag' : f.bhText.replace(/\s*\(.*\)$/, '')) : '';
  const socialFlagShort = socialBarrierPhrase(f) || '';
  const panelFlags = joinList([clinicalFlag, bhFlag, socialFlagShort].filter(Boolean));
  const flagCount = [clinicalFlag, bhFlag, socialFlagShort].filter(Boolean).length;

  // Care-plan goal summaries (real).
  const domGoals = (name: string) =>
    (p.carePlanDomains || [])
      .find((d) => d.domain === name)
      ?.goals.map((g) => g.goal.replace(/\s+by\s+.*$/i, '').trim()) || [];
  const clinicalGoals = domGoals('Clinical');
  const bhGoals = domGoals('Behavioral Health');
  const socialGoals = domGoals('Social Needs');

  const attribBH = !p.bhProvider || p.bhProvider === '—' ? 'not yet assigned' : p.bhProvider;

  // Step 8 PRAPARE answer summary — only truthful yes/no per domain.
  const prapareAnswers: string[] = [];
  prapareAnswers.push(
    f.food ? 'yes to food insecurity' : f.snap ? 'food support already active through SNAP' : 'no food barrier'
  );
  prapareAnswers.push(f.transport ? 'yes, transportation is a barrier' : 'no transportation barrier');
  prapareAnswers.push(f.housing ? 'yes to unstable housing' : `housing is stable`);
  const prapareSummary = joinList(prapareAnswers);
  const flagged = flaggedMetric(f);
  const socialTaskCount = f.prapare.length || (f.socialFlag ? 1 : 0);

  const step8Beat = f.prapare.length
    ? `PRAPARE completed at the kitchen table — ${joinList(f.prapare)} confirmed and coded in FHIR.`
    : f.socialFlag
      ? `PRAPARE completed — the ten domains come back clear, and the platform surfaces ${socialFlagShort} instead.`
      : `PRAPARE completed at the kitchen table — no acute social barrier, and that clean result is documented too.`;

  // Step 9 crisis — CAPABILITY framing, no fabricated crisis event.
  const crisisContext = joinList(
    [f.bhOn ? f.bhText : 'a behavioral-health baseline on file', socialFlagShort || `${f.place} access on record`, f.bhProv].filter(Boolean)
  );

  // Step 11 outcome metric.
  const outcome = outcomeMetric(f);

  // Step 12 pattern phrase.
  const patternPhrase = f.transport
    ? 'chronic disease compounded by a transportation barrier'
    : f.socialFlag === 'Medication Cost'
      ? 'chronic disease compounded by the cost of care'
      : f.socialFlag === 'Nutrition'
        ? 'chronic disease compounded by a nutrition-support need'
        : f.food
          ? 'chronic disease compounded by food insecurity'
          : 'overlapping medical and social need';

  // Household bundle line for the home-visit step (real dependent gap, else caregiver).
  const dep = f.dependent as any;
  const cg = f.caregiver as any;
  let householdLine = '';
  if (dep) {
    const depGap = dep.gaps && dep.gaps[0]?.label;
    householdLine = depGap
      ? `And because the platform sees the whole household, it surfaces ${dep.name}'s ${depGap.toLowerCase()} in the same visit — one trip, two needs addressed.`
      : `And because the platform sees the whole household, ${dep.name} is on the same coordinated outreach.`;
  } else if (cg) {
    householdLine = `And because ${f.first} is the caregiver for ${cg.name}, ${f.P.adj} ${String(cg.relation).toLowerCase()}, the platform keeps that burden visible to the care team.`;
  }

  const genArr: StoryStep[] = [
    // Step 1 — system-level, patient-independent — VERBATIM.
    { ...MARIA_STEPS[0] },

    // Step 2 — Region View.
    {
      ...MARIA_STEPS[1],
      storyBeat: f.isRural
        ? `Those red counties on the map — ${f.place} sits ${f.ruralText}. Specialty care is a long drive. That's where ${f.first} lives.`
        : `The map benchmarks every region on three domains. ${f.first} lives in ${f.place} — better access than the rural counties, but the same three-domain accountability applies.`,
      metric: { label: 'BH Access Rate — Rural SD', value: '49%' },
      narratorLines: [
        'Now we drill down. Four regions, benchmarked side by side on three domains.',
        "See that northeast quadrant — 49% BH access rate. That's not a rounding error. That's a population that can't get to a behavioral health provider.",
        f.isRural
          ? `And out where ${f.first} lives — ${f.ruralText}. That distance is a clinical variable, not a footnote.`
          : `${cap(f.place)} looks better on access — but the platform still holds every region to the same standard.`,
        `This is where ${f.first} lives. ${f.P.Subj} is not a data point yet — but ${f.P.subj} is about to become one.`,
      ],
      pausePrompt:
        "Let the map sit for a moment. Those regions represent real people already enrolled in this program — and the platform already knows where they're underserved.",
    },

    // Step 3 — Program Networks — network context; member name localized per patient.
    {
      ...MARIA_STEPS[2],
      narratorLines: [
        "Those red counties don't fix themselves. Someone is accountable for them — a provider network.",
        'This is the RHTP Track 3 network: the PCPs, community health workers, and behavioral-health providers who carry these attributed lives.',
        'Watch the coverage — some counties have depth, others rest on a single practice. That thin coverage is where members fall through.',
        `So before we open a single chart, we know who is supposed to be catching ${f.first}.`,
      ],
    },

    // Step 4 — Care Team Members — accountability layer; member name localized per patient.
    {
      ...MARIA_STEPS[3],
      narratorLines: [
        'Drill into one practice and you see the people, not just the network.',
        "Here's the concentration risk the platform flags: the clinical panel rests on very few providers.",
        `This is the accountability layer — the clinicians, CHWs, and BH providers who will act on ${f.possFirst} plan.`,
        'Now we have the system and the team. Time to meet the member they exist to serve.',
      ],
    },

    // Step 5 — Panel & Cohort.
    {
      ...MARIA_STEPS[4],
      chapterIntro: `Ch.2 · Meet ${f.first}`,
      activePatient: id,
      persona: `Primary Care Physician — ${f.pcp}`,
      storyBeat: `${poss(f.pcp)} panel — ${f.first} flagged: ${panelFlags}. The platform surfaces every domain, not just the clinical one.`,
      narratorLines: [
        `${f.pcp} opens the panel. Hundreds of patients — ranked, so the ones who need attention surface first.`,
        `${f.name}. Near the top. ${flagCount} flag${flagCount === 1 ? '' : 's'}: ${panelFlags}.`,
        `Old systems show one problem at a time. This one shows all of them — because treating ${f.diseases[0] ? f.diseases[0] : 'the clinical need'} while missing the social barrier means the clinical problem comes right back.`,
        `Notice the attribution columns. Clinical PCP: ${f.pcp}. Care Manager: ${f.cm}. BH Provider: ${attribBH}.`,
      ],
      pausePrompt: MARIA_STEPS[4].pausePrompt,
    },

    // Step 6 — Whole Person Care Plan.
    {
      ...MARIA_STEPS[5],
      activePatient: id,
      persona: `Primary Care Physician — ${f.pcp}`,
      storyBeat: `Every dimension of ${f.possFirst} life — clinical, behavioral, social${cg ? ', and the caregiving ' + f.P.subj + ' carries' : ''} — unified in one plan.`,
      metric: { label: 'HCC Value Documented', value: money(p.hccValue) },
      narratorLines: [
        `Open ${f.possFirst} record. Navigate to the Whole Person Care Plan tab.`,
        clinicalGoals.length
          ? `Clinical goals: ${joinList(clinicalGoals)}.`
          : `Clinical goals are tracked against ${f.possFirst} active conditions.`,
        `${bhGoals.length ? `BH goals: ${joinList(bhGoals)}. ` : ''}${socialGoals.length ? `Social goals: ${joinList(socialGoals)}.` : ''}`.trim() ||
          'Behavioral and social goals sit in the same plan, each with an owner and a due date.',
        `And at the bottom — ${money(p.hccValue)} in documented HCC value tied to ${f.possFirst} open gaps: the revenue at risk if they aren't captured and closed this measurement year.`,
        'This is the financial alignment that makes whole-person care sustainable, not just aspirational.',
      ],
      pausePrompt: MARIA_STEPS[5].pausePrompt,
    },

    // Step 7 — MD Smart Launch.
    {
      ...MARIA_STEPS[6],
      activePatient: id,
      persona: `Primary Care Physician — ${f.pcp}`,
      storyBeat: `The same data, inside the EHR — SMART on FHIR. ${f.pcp} never leaves ${f.org}'s system.`,
      narratorLines: [
        'Now here\'s the question every physician asks: "Does this mean I have to log into another system?"',
        `No. Open the MD Smart Launch screen. This is what ${f.pcp} sees inside the EHR — same patient, same data, embedded.`,
        `SMART on FHIR. The platform doesn't ask ${f.P.obj} to change ${f.P.adj} workflow. It meets ${f.P.obj} where ${f.P.subj} already is.`,
        `The care plan, the risk flags, the care-manager assignment, the social needs — all surfaced inside the EHR ${f.pcp} already uses, every day.`,
      ],
    },

    // Step 8 — Prior Authorization.
    {
      ...MARIA_STEPS[7],
      activePatient: id,
      persona: `Primary Care Physician — ${f.pcp}`,
      storyBeat: `${cap(f.paItem)} ordered. AI prepares the PA. ${f.pcp} reviews and approves — the AI never submits on its own.`,
      narratorLines: [
        `${f.pcp} orders ${f.paItem} for ${f.first}. Historically, that order would sit in a PA queue for 3 to 5 days.`,
        `Watch what happens. CRD fires instantly — coverage requirement detected. DTR launches — the AI interrogates ${f.possFirst} record and pre-fills the clinical justification. PAS submits the prior authorization request.`,
        `${f.pcp} sees a review screen. ${f.pcp} reads the AI's work, and approves — or overrides.`,
        'Important: the AI never submits on its own. Human in the loop. Always.',
        'Total elapsed time: under 90 seconds. From order to submitted PA.',
      ],
      pausePrompt: MARIA_STEPS[7].pausePrompt,
    },

    // Step 9 — CHW Workflow.
    {
      ...MARIA_STEPS[8],
      chapterIntro: 'Ch.3 · In the Community',
      activePatient: id,
      persona: 'Community Health Worker',
      storyBeat: `A Community Health Worker arrives at ${f.possFirst} home — visit scheduled, clinical questions loaded. This is the last mile of care.`,
      narratorLines: [
        `${poss(f.pcp)} care plan has a home-visit task. The community health worker gets it on a phone.`,
        `${f.P.Subj === 'They' ? 'They drive' : f.P.Subj + ' drives'} out to ${f.place} and pulls up ${f.possFirst} record before knocking on the door.`,
        'Six checklist items load automatically: home safety assessment, medication review, vitals, SDOH screening, care plan goals, referral confirmation.',
        householdLine || 'The platform has told the worker exactly what to do — and exactly why they are there.',
        'Click "Start Visit." Documentation begins in real time, at the kitchen table, on a phone.',
      ],
      pausePrompt: MARIA_STEPS[8].pausePrompt,
    },

    // Step 10 — Social Needs Screening.
    {
      ...MARIA_STEPS[9],
      activePatient: id,
      persona: 'Community Health Worker',
      storyBeat: step8Beat,
      metric: flagged,
      narratorLines: [
        `The community health worker opens the PRAPARE screening. Ten social domains. ${f.first} answers — ${prapareSummary}.`,
        `As ${f.P.subj} answers, the platform codes each response in FHIR. This is not a paper form that gets scanned later.`,
        socialTaskCount > 0
          ? `When the screening completes, ${socialTaskCount === 1 ? 'a social Task is' : socialTaskCount + ' social Tasks are'} auto-created and linked to ${f.possFirst} care plan. ${f.cm}, the care manager, gets a notification.`
          : `The clean screen is still recorded — ${f.cm}, the care manager, sees the completion, and the numerator ticks up.`,
        'And somewhere, the Quality & Compliance analyst sees the PRAPARE measure numerator increase by one.',
        'One conversation at a kitchen table. Downstream systems updated. Zero manual data entry.',
      ],
      pausePrompt: MARIA_STEPS[9].pausePrompt,
    },

    // Step 11 — Crisis Pathway (capability, not a fabricated event).
    {
      ...MARIA_STEPS[10],
      storyBeat: `If ${f.first} ever reaches a crisis line, the BH specialist sees ${f.possFirst} full context instantly — and that context changes the dispatch, away from a $4,200 ED visit.`,
      narratorLines: [
        'Behavioral health is where whole-person care gets tested.',
        `If ${f.first} calls 988, the specialist opens ${f.possFirst} record and — instantly, not after a search — sees the full picture: ${crisisContext}.`,
        'That context changes the dispatch decision — stabilization support instead of a $4,200 emergency-room bill.',
        `A behavioral-health follow-up task is created automatically and lands in ${poss(f.cm)} worklist.`,
        `${f.first} doesn't fall through the cracks. The platform holds the thread back to the care team.`,
      ],
      pausePrompt: MARIA_STEPS[10].pausePrompt,
    },

    // Step 12 — Care Gap Closure & Verification.
    {
      ...MARIA_STEPS[11],
      chapterIntro: 'Ch.4 · The Closed Loop',
      activePatient: id,
      storyBeat: `The tracked gaps close with FHIR provenance chains: ${joinList([f.topGap ? niceGap(f.topGap.name) : 'clinical', (p.careGaps || []).find((g) => g.domain === 'BH')?.name || '', (p.careGaps || []).find((g) => g.domain === 'Social')?.name || ''].filter(Boolean))}.`,
      narratorLines: (() => {
        const bhGap = (p.careGaps || []).find((g) => g.domain === 'BH');
        const socialGap = (p.careGaps || []).find((g) => g.domain === 'Social');
        const lines = ["Three months on. Let's see what happened."];
        if (f.topGap)
          lines.push(
            `${f.topGap.name}: closing. Evidence: the resulted order recorded as a FHIR Observation, provenance chain intact.`
          );
        if (bhGap)
          lines.push(
            `${bhGap.name}: in motion. Evidence: engagement records tied to the ${p.bhScreeningLabel || 'BH'} measure.`
          );
        if (socialGap)
          lines.push(
            `${socialGap.name}: tracked. Evidence: the linked referral resource${/unite us/i.test(p.transportStatus || '') ? ` (${(p.transportStatus.match(/#\S+/) || [''])[0]})` : ''}, coded and re-screened.`
          );
        lines.push(
          'Each closure is not a checkbox. It is a FHIR resource with a provenance trail — auditable, queryable, reportable.'
        );
        lines.push('98.7% of resources passed automated validation before submission. The 1.3% were flagged and corrected by the analyst.');
        return lines;
      })(),
      pausePrompt: MARIA_STEPS[11].pausePrompt,
    },

    // Step 13 — Outcomes Linkage.
    {
      ...MARIA_STEPS[12],
      storyBeat: `Social stability drives medical outcomes across a population. For ${f.first}: ${outcome.value}. This is the ROI the state needs.`,
      metric: outcome,
      narratorLines: [
        'Now we make the argument the state cares about.',
        'Housing stability reduces ED visits by 34% across the population. Food security improves A1C by an average of 1.8 points.',
        `For ${f.first}, the platform tracks the real number: ${outcome.label} — ${outcome.value}. Not an anecdote — a data point in a cohort of 2,400.`,
        "Every dollar invested in social program intervention generates $2.80 in avoided medical cost. That's the ROI number.",
        'This screen is the closing argument for continued social program funding. Show it slowly.',
      ],
      pausePrompt: MARIA_STEPS[12].pausePrompt,
    },

    // Step 14 — Social Needs Dashboard.
    {
      ...MARIA_STEPS[13],
      storyBeat: `2,400 members screened. ${f.first} wasn't an edge case — ${f.P.subj} was the pattern: ${patternPhrase}.`,
      narratorLines: [
        `The executive asks: "Is ${f.first} an outlier, or is ${f.P.subj} the pattern?"`,
        'Open the Social Needs Dashboard. 2,400 members screened. 38% carry overlapping medical and social need.',
        'The dual-need cohort has 2.3 times higher medical cost than single-need patients — and 3.1 times higher ROI from social intervention.',
        `${f.first} was not an edge case. ${f.P.Subj} was the pattern — ${patternPhrase}. The platform knew it before the physician did.`,
      ],
    },

    // Step 15 — Executive Dashboard.
    {
      ...MARIA_STEPS[14],
      storyBeat: `From ${f.possFirst} kitchen table in ${f.place} to the state's dashboard — one closed loop. 6,842 gaps closed, $1.1M reinvested.`,
      narratorLines: [
        `Back to the top. From ${f.possFirst} kitchen table to the executive's screen.`,
        '6,842 care gaps closed. $1.1 million in shared savings reinvested into the program. Quality score up 8.3 points.',
        `Each of those numbers has a ${f.first} behind it. A home visit. A PRAPARE screening. A behavioral-health safety net. A care plan completed.`,
        "The platform doesn't just track the numbers — it traces the story behind them.",
      ],
      pausePrompt: `This is the closed loop. One patient — ${f.first}. One kitchen table. One care team. One line item on the executive dashboard. That's what whole-person care looks like when it's measured end-to-end.`,
    },

    // Step 16 — Quality Gaps & Attribution — patient-independent — VERBATIM.
    { ...MARIA_STEPS[15] },

    // Step 17 — CMS-0057-F API Explorer — patient-independent — VERBATIM.
    { ...MARIA_STEPS[16] },
  ];
  // Keep each generated step's chapter label in sync with the per-patient chapter card — Ch.2
  // ("Meet {name}") is the only name-bearing chapter, and genSteps spreads the Maria template
  // without overriding `chapter`, so the overlay's chapters.find(c => c.chapter === step.chapter)
  // would otherwise miss and throw. Re-map here so step and card chapters always match.
  return genArr.map((s) =>
    s.chapter === 'Ch.2 · Meet Maria' ? { ...s, chapter: `Ch.2 · Meet ${f.first}` } : s
  );
}
