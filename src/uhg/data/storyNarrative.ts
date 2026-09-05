// storyNarrative.ts — Per-patient "Story Mode" keynote narrative (public entry).
//
// Story Mode (StoryTellingOverlay in components/DemoNavigator.tsx) is a curated,
// fullscreen keynote: five chapter interstitials + fifteen narrated steps. It was
// authored end-to-end for Maria Redhawk. This module makes it patient-contextual:
//
//   • For Maria (MARIA_SD_001) OR any unknown / unresolvable id, it returns the
//     EXACT authored keynote verbatim (fail closed to the curated copy — never a
//     half-filled template, never another member's identity).
//   • For every other registry patient it regenerates the SAME arc — same chapters,
//     same 15 routes / order / personas / moods / metric intent — with every asserted
//     fact rewritten from THAT patient's real registry data: name, gender-correct
//     pronouns, age, location, primary condition + a REAL metric, top care gap, and
//     ONLY the SDOH barriers that actually exist. No fabricated clinical claims.
//
// Pure, deterministic, side-effect free. The implementation is split by responsibility
// (AI-CODING-CONVENTIONS §2): authored data → storyNarrative.maria.json, derived
// facts → storyNarrative.profile.ts, generators → storyNarrative.gen*.ts. This file
// stays the single import surface — DemoNavigator imports from here.

import { getPatientById } from '../../lib/patientRegistry';
import { MARIA_CHAPTERS, MARIA_STEPS } from './storyNarrative.maria';
import { genChapters } from './storyNarrative.genChapters';
import { genSteps } from './storyNarrative.genSteps';

export type { StoryStep, ChapterCard } from './storyNarrative.types';

const MARIA_ID = 'MARIA_SD_001';

/**
 * Chapter interstitials for the selected patient. Maria (or any unknown /
 * unresolvable id) returns the exact authored keynote cards.
 */
export function getStoryChapters(citizenId: string) {
  if (!citizenId || citizenId === MARIA_ID) return MARIA_CHAPTERS;
  const p = getPatientById(citizenId);
  if (!p || p.platformId === MARIA_ID) return MARIA_CHAPTERS;
  return genChapters(p);
}

/**
 * The fifteen narrated steps for the selected patient. Same arc, routes, order,
 * personas, moods and metric intent as the authored keynote; every asserted fact
 * rewritten from the patient's real registry data. Maria / unknown ids fail closed
 * to the authored keynote verbatim.
 */
export function getStorySteps(citizenId: string) {
  if (!citizenId || citizenId === MARIA_ID) return MARIA_STEPS;
  const p = getPatientById(citizenId);
  if (!p || p.platformId === MARIA_ID) return MARIA_STEPS;
  return genSteps(p);
}
