// storyNarrative.genChapters.ts — per-patient chapter interstitials for Story Mode.
//
// Regenerates the SAME five-chapter arc authored for Maria, with every asserted
// fact rewritten from THAT patient's real registry data. Ch.1 (system-level) and
// Ch.5 (the compliance mandate) are patient-independent and returned verbatim.

import type { RegistryPatient } from '../../lib/patientRegistry.types';
import type { ChapterCard } from './storyNarrative.types';
import { MARIA_CHAPTERS } from './storyNarrative.maria';
import {
  buildProfile,
  caregiverClause,
  dependentClause,
  socialBarrierPhrase,
  labFriendly,
  condMetricNice,
  niceGap,
  joinList,
} from './storyNarrative.profile';

export function genChapters(p: RegistryPatient): ChapterCard[] {
  const f = buildProfile(p);
  const nameHeadline =
    f.P.subj === 'she' ? `Her name is ${f.name}.`
    : f.P.subj === 'he' ? `His name is ${f.name}.`
    : `Their name is ${f.name}.`;

  // Ch.2 subline — emotional anchor. Only real facts; only real barriers.
  const localeSentence = f.isRural
    ? `At ${f.age}, ${f.first} lives in ${f.place} — ${f.ruralText}.`
    : `At ${f.age}, ${f.first} lives in ${f.place}.`;
  let clinicalSentence = f.diseasesStr
    ? `${f.P.Subj} is living with ${f.diseasesStr}.`
    : '';
  if (f.anchorLab)
    clinicalSentence += ` ${f.P.Adj} most recent ${labFriendly(f.anchorLab.name)} was ${f.anchorLab.result}.`;
  else if (f.condMetric) clinicalSentence += ` ${f.P.Adj} ${condMetricNice(f.condMetric)} is part of the clinical picture.`;
  else if (f.topGap) clinicalSentence += ` ${f.P.Adj} ${niceGap(f.topGap.name)} is ${f.topGap.daysOpen} days overdue.`;

  const cg = caregiverClause(f);
  const dep = cg ? null : dependentClause(f);
  const familySentence = cg ? `${cg}.` : dep ? `${dep}.` : '';

  const barrier = socialBarrierPhrase(f);
  // For a rural transportation barrier the locale sentence already carries the
  // distance — don't restate it. Non-distance barriers get their own line.
  const barrierSentence = barrier
    ? f.transport
      ? f.isRural
        ? ''
        : ' And getting to care is a barrier of its own.'
      : ` The platform has already flagged ${barrier}.`
    : '';
  const bhSentence = f.bhOn ? ` A screen came back showing ${f.bhText}${/not referred/i.test(p.bhReferralStatus || '') ? ', not yet acted on' : ''}.` : '';

  const ch2Sub = [localeSentence, clinicalSentence.trim(), familySentence, barrierSentence.trim(), bhSentence.trim()]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Ch.3 subline — community / home visit.
  const ch3Sub = `A Community Health Worker pulls up to ${f.possFirst} home in ${f.place}. On the phone: ${f.P.adj} visit checklist, ${f.P.adj} clinical context, and the PRAPARE screening questions — all pre-loaded.`;

  // Ch.4 subline — the three tracked gaps (real, across domains).
  const clinicalGapName = f.topGap ? f.topGap.name : (p.careGaps || [])[0]?.name || 'a clinical gap';
  const bhGap = (p.careGaps || []).find((g) => g.domain === 'BH');
  const socialGap = (p.careGaps || []).find((g) => g.domain === 'Social');
  const ch4Items = joinList([
    clinicalGapName,
    bhGap ? bhGap.name : '',
    socialGap ? socialGap.name : '',
  ].filter(Boolean));
  const ch4Sub = `${ch4Items}. Each gap tracked to closure with a FHIR provenance chain — every one traceable from ${f.possFirst} record to the state's dashboard.`;

  return [
    { ...MARIA_CHAPTERS[0] }, // Ch.1 is system-level and patient-independent — verbatim.
    {
      chapter: `Ch.2 · Meet ${f.first}`,
      color: '#007d79',
      headline: nameHeadline,
      subline: ch2Sub,
      reflectionPrompt: `${f.first} is not an edge case. ${f.P.Subj} is 38% of your attributed population. The question is whether your platform can see the whole person.`,
    },
    {
      chapter: 'Ch.3 · In the Community',
      color: '#198038',
      headline: "Care doesn't live in the clinic.",
      subline: ch3Sub,
      reflectionPrompt: MARIA_CHAPTERS[2].reflectionPrompt,
    },
    {
      chapter: 'Ch.4 · The Closed Loop',
      color: '#8a3ffc',
      headline: 'What gets measured, gets closed.',
      subline: ch4Sub,
      reflectionPrompt: MARIA_CHAPTERS[3].reflectionPrompt,
    },
    { ...MARIA_CHAPTERS[4] }, // Ch.5 is the compliance mandate — patient-independent — verbatim.
  ];
}
