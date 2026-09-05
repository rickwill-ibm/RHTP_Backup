// storyNarrative.maria.ts — typed loader for the authored Maria keynote.
//
// The authored keynote (five chapter interstitials + fifteen narrated steps) is
// data, not logic, so it lives in storyNarrative.maria.json (a data/*.json file,
// exempt from the file-size ratchet — AI-CODING-CONVENTIONS §2). This module casts
// it once to the shared shapes so every consumer sees typed arrays. It is the
// VERBATIM copy returned for Maria (MARIA_SD_001) and for any unknown / unresolvable
// id — never a half-filled template, never another member's identity.

import maria from './storyNarrative.maria.json';
import type { ChapterCard, StoryStep } from './storyNarrative.types';

export const MARIA_CHAPTERS: ChapterCard[] = maria.chapters as ChapterCard[];
export const MARIA_STEPS: StoryStep[] = maria.steps as StoryStep[];
