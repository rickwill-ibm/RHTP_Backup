// storyNarrative.types.ts — shared shapes for the per-patient "Story Mode" keynote.
//
// Extracted from the former monolithic storyNarrative.ts so the authored data
// (storyNarrative.maria.json), the profile/generator logic, and the public entry
// can all reference one canonical definition without a runtime cycle. These are
// re-exported from ./storyNarrative, which stays the module DemoNavigator imports.

export interface StoryStep {
  stepNum: number;
  route: string;
  label: string;
  storyBeat: string;
  activePatient?: string;
  chapter: string;
  chapterColor: string;
  narratorLines: string[];
  pausePrompt?: string;
  chapterIntro?: string;
  metric?: { label: string; value: string };
  persona?: string;
  mood?: 'neutral' | 'tense' | 'hopeful' | 'decisive';
}

export interface ChapterCard {
  chapter: string;
  color: string;
  headline: string;
  subline: string;
  reflectionPrompt: string;
}
