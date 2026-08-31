/**
 * Encoding-review model — the pure, framework-free logic behind the Policy Encoding Review screen.
 *
 * Keeps ALL the risky behavior (attention routing, the accept/correct/reject state machine, sign-off
 * gating, and the correction capture that feeds the engine forward) out of React and under test, so
 * the UI shell is a thin renderer. Deterministic; no I/O, no time, no framework.
 */
import type { CoverageRole } from '@/lib/policy/dtr/questionnairePackage';
import type { RoutingHint } from './codeRouting';

export type ReviewConfidence = 'explicit' | 'mapped';
export type ReviewFlagSeverity = 'defect' | 'ambiguous' | 'verify';
export interface ReviewFlag {
  severity: ReviewFlagSeverity;
  message: string;
}
export type ReviewElementKind = 'procedure' | 'diagnosis' | 'bmi' | 'criterion' | 'gated';
export type ReviewDecisionState = 'open' | 'accepted' | 'edited' | 'rejected' | 'confirmed';

/** What a reviewer changed — captured for the audit trail and to teach the extractor/coding-map. */
export interface ReviewCorrection {
  /** Free-text reason the reviewer gave. */
  reason: string;
  /** Optional corrected code/role/label. */
  correctedTo?: string;
  /** Which engine this correction should improve. */
  improves: ('coding-map' | 'extractor')[];
}

export interface ReviewElementInput {
  id: string;
  kind: ReviewElementKind;
  system?: string;
  code?: string;
  label: string;
  role?: CoverageRole;
  confidence: ReviewConfidence;
  gated?: boolean;
  flag?: ReviewFlag;
  /** Routing hint (WHERE the code's evidence sits) — never a coverage decision. See codeRouting.ts. */
  routing?: RoutingHint;
  /** Source-evidence snippet (provenance-anchored). */
  source?: string;
  /** WHERE in the document a procedure code was harvested — surfaced in the research drawer as the
   *  plain-English origin (and why it defaulted to a given disposition). Payer-agnostic. */
  sourceSection?: 'coding-appendix' | 'requirements-table' | 'inline-prose';
}

export interface ReviewElement extends ReviewElementInput {
  state: ReviewDecisionState;
  correction?: ReviewCorrection;
}

export interface ReviewSection {
  key: string;
  title: string;
  gated: boolean;
  elements: ReviewElement[];
}

export type ReviewFilter = 'review' | 'all' | 'explicit' | 'mapped' | 'gated';

const SECTION_TITLES: Record<ReviewElementKind, string> = {
  procedure: 'Procedure codes (determine whether PA applies)',
  diagnosis: 'Diagnosis codes (establish medical necessity)',
  bmi: 'Value thresholds',
  criterion: 'Medical-necessity criteria',
  gated: 'Human-gated — documentation, not codeable',
};
const SECTION_ORDER: ReviewElementKind[] = ['procedure', 'diagnosis', 'bmi', 'criterion', 'gated'];

/** Group coded elements into ordered review sections, each element starting `open`. */
export function buildEncodingReview(inputs: ReviewElementInput[]): ReviewSection[] {
  const byKind = new Map<ReviewElementKind, ReviewElement[]>();
  for (const input of inputs) {
    const arr = byKind.get(input.kind) ?? [];
    arr.push({ ...input, state: 'open' });
    byKind.set(input.kind, arr);
  }
  const sections: ReviewSection[] = [];
  for (const kind of SECTION_ORDER) {
    const elements = byKind.get(kind);
    if (!elements || elements.length === 0) continue;
    sections.push({
      key: kind,
      title: SECTION_TITLES[kind],
      gated: kind === 'gated',
      elements,
    });
  }
  return sections;
}

/** A decision a reviewer can take on one element. */
export type ReviewAction =
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'confirm' } // for gated (documentation) items
  | { type: 'correct'; correction: ReviewCorrection }
  | { type: 'reset' }; // reopen a finalized element back into the work queue (reversible pre-sign-off)

/**
 * Apply a decision to one element by id. PURE — returns a new sections array (structural copy of the
 * touched element only), never mutates the input. Unknown ids are a no-op (returns the same array).
 */
export function decide(
  sections: ReviewSection[],
  id: string,
  action: ReviewAction
): ReviewSection[] {
  let changed = false;
  const next = sections.map((section) => {
    let sectionChanged = false;
    const elements = section.elements.map((el) => {
      if (el.id !== id) return el;
      sectionChanged = true;
      changed = true;
      switch (action.type) {
        case 'accept':
          return { ...el, state: 'accepted' as const, correction: undefined };
        case 'reject':
          return { ...el, state: 'rejected' as const };
        case 'confirm':
          return { ...el, state: 'confirmed' as const };
        case 'correct':
          return {
            ...el,
            state: 'edited' as const,
            correction: action.correction,
          };
        case 'reset':
          return { ...el, state: 'open' as const, correction: undefined };
      }
    });
    return sectionChanged ? { ...section, elements } : section;
  });
  return changed ? next : sections;
}

const DECIDED: ReadonlySet<ReviewDecisionState> = new Set([
  'accepted',
  'rejected',
  'edited',
  'confirmed',
]);

function isOpenDefect(el: ReviewElement): boolean {
  return el.flag?.severity === 'defect' && el.state === 'open';
}

export interface ReviewProgress {
  total: number;
  decided: number;
  openDefects: number;
  openAmbiguities: number;
  /** The minimum number of elements that must be decided to submit (the canonical 60% threshold),
   *  exposed so the UI can show an honest "decide N more" gate without re-deriving the fraction. */
  minDecided: number;
  /** Maker may submit only when no defect is unresolved and enough of the set is decided. */
  canSubmit: boolean;
}

/** Sign-off gating: NO unresolved defect, and at least `minDecidedFraction` of elements decided. */
export function reviewProgress(
  sections: ReviewSection[],
  minDecidedFraction = 0.6
): ReviewProgress {
  let total = 0;
  let decided = 0;
  let openDefects = 0;
  let openAmbiguities = 0;
  for (const section of sections) {
    for (const el of section.elements) {
      total += 1;
      if (DECIDED.has(el.state)) decided += 1;
      if (isOpenDefect(el)) openDefects += 1;
      if (el.flag?.severity === 'ambiguous' && el.state === 'open') openAmbiguities += 1;
    }
  }
  const minDecided = Math.ceil(total * minDecidedFraction);
  const canSubmit = total > 0 && openDefects === 0 && decided >= minDecided;
  return {
    total,
    decided,
    openDefects,
    openAmbiguities,
    minDecided,
    canSubmit,
  };
}

/**
 * Two-list routing. The reviewer sees ONE list of genuine exceptions to decide, and ONE list of
 * everything the AI resolved (to sample-check). Human-gated documentation and real exceptions
 * (defect/ambiguous) go to `needs-review`; everything else the AI decided — clean explicit codes,
 * AI-mapped codes, and the generic "assign coverage role" verify — is `ai-decided`.
 */
export type ReviewBucket = 'needs-review' | 'ai-decided';
export function reviewBucket(el: ReviewElement, gatedSection: boolean): ReviewBucket {
  if (gatedSection || el.gated === true) return 'needs-review';
  if (el.flag?.severity === 'defect' || el.flag?.severity === 'ambiguous') return 'needs-review';
  // A code named in a not-medically-necessary / investigational statement is a genuine coverage
  // decision (covered vs investigational) — the human makes that call, not the AI.
  if (el.routing?.bucket === 'excluded') return 'needs-review';
  return 'ai-decided';
}

/** Pre-accept every still-open AI-decided element (the editor sample-checks rather than clicking each).
 *  Pure; genuine exceptions (needs-review) are left OPEN for a human decision. */
export function acceptAiDecided(sections: ReviewSection[]): ReviewSection[] {
  let changed = false;
  const next = sections.map((section) => {
    let secChanged = false;
    const elements = section.elements.map((el) => {
      if (el.state === 'open' && reviewBucket(el, section.gated) === 'ai-decided') {
        secChanged = true;
        changed = true;
        return { ...el, state: 'accepted' as const };
      }
      return el;
    });
    return secChanged ? { ...section, elements } : section;
  });
  return changed ? next : sections;
}

/** Two-list submit gate: the editor may submit the whole policy once there are NO open defects and
 *  every needs-review exception is decided. (The panel additionally requires an explicit
 *  "I've reviewed the AI-decided items" acknowledgement.) */
export interface SubmitReadiness {
  needsReviewTotal: number;
  needsReviewOpen: number;
  aiDecidedTotal: number;
  /** AI-recommended items the maker has not personally accepted/modified/rejected yet. Every AI call
   *  is a RECOMMENDATION, not a pre-accepted decision — this is what "Accept all safe" and the per-row
   *  Accept/Reject controls clear. */
  aiDecidedOpen: number;
  openDefects: number;
  /** No open defect and no undecided exception — the exceptions the AI could not resolve are cleared.
   *  (Retained for callers that only care about the exception queue; the submit gate is stricter.) */
  exceptionsCleared: boolean;
  /** Every element in BOTH lists that no human has decided. The real submit blocker: nothing ships on
   *  the AI's say-so — the maker personally dispositions (accept / modify / reject) every item. */
  openTotal: number;
  /** No open element anywhere AND no open defect. Replaces the old "tick one box" gate. */
  everyItemDecided: boolean;
}
export function submitReadiness(sections: ReviewSection[]): SubmitReadiness {
  let needsReviewTotal = 0;
  let needsReviewOpen = 0;
  let aiDecidedTotal = 0;
  let aiDecidedOpen = 0;
  let openDefects = 0;
  let openTotal = 0;
  for (const section of sections) {
    for (const el of section.elements) {
      if (reviewBucket(el, section.gated) === 'needs-review') {
        needsReviewTotal += 1;
        if (el.state === 'open') needsReviewOpen += 1;
      } else {
        aiDecidedTotal += 1;
        if (el.state === 'open') aiDecidedOpen += 1;
      }
      if (el.state === 'open') openTotal += 1;
      if (isOpenDefect(el)) openDefects += 1;
    }
  }
  return {
    needsReviewTotal,
    needsReviewOpen,
    aiDecidedTotal,
    aiDecidedOpen,
    openDefects,
    exceptionsCleared: openDefects === 0 && needsReviewOpen === 0,
    openTotal,
    // Guard total>0 so an EMPTY review set never reads as "all decided" and opens the gate on nothing
    // (mirrors reviewProgress.canSubmit). A promotable policy that extracted no reviewable element
    // stays un-submittable rather than failing open.
    everyItemDecided: needsReviewTotal + aiDecidedTotal > 0 && openDefects === 0 && openTotal === 0,
  };
}

/**
 * Explicit, affirmative bulk accept of the SAFE remainder — high-confidence (explicit), unflagged,
 * AI-decided-bucket items only. Low-confidence (mapped) codes and anything the policy text conflicts
 * with (routed `excluded` → needs-review) are deliberately LEFT OPEN so a human dispositions them one
 * at a time. This is the pressure valve that keeps "decide every item" usable at 40+ codes WITHOUT
 * letting the risky ones through on a single click. Pure.
 */
export function bulkAcceptRecommended(sections: ReviewSection[]): {
  sections: ReviewSection[];
  count: number;
} {
  let count = 0;
  const next = sections.map((section) => {
    if (section.gated) return section;
    const elements = section.elements.map((el) => {
      if (
        el.state === 'open' &&
        reviewBucket(el, section.gated) === 'ai-decided' &&
        el.confidence === 'explicit' &&
        !el.flag
      ) {
        count += 1;
        return { ...el, state: 'accepted' as const };
      }
      return el;
    });
    return elements === section.elements ? section : { ...section, elements };
  });
  return { sections: count > 0 ? next : sections, count };
}

/** An element "needs review" when it is flagged (defect/ambiguous) or is an undecided mapped/verify
 *  item — the attention-routing that keeps clean explicit codes out of the reviewer's way. */
export function needsReview(el: ReviewElement): boolean {
  if (el.state !== 'open') return false;
  if (el.flag?.severity === 'defect' || el.flag?.severity === 'ambiguous') return true;
  if (el.flag?.severity === 'verify') return true;
  return el.confidence === 'mapped';
}

/** Whether an element is shown under the given filter. */
export function isVisible(el: ReviewElement, gatedSection: boolean, filter: ReviewFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'review':
      return needsReview(el);
    case 'explicit':
      return el.confidence === 'explicit';
    case 'mapped':
      return el.confidence === 'mapped';
    case 'gated':
      return gatedSection || el.gated === true;
  }
}

/** One-click bulk accept of the clean explicit codes (no flag, still open) — the productivity lever. */
export function bulkAcceptCleanExplicit(sections: ReviewSection[]): {
  sections: ReviewSection[];
  count: number;
} {
  let count = 0;
  const next = sections.map((section) => {
    if (section.gated) return section;
    const elements = section.elements.map((el) => {
      if (el.state === 'open' && el.confidence === 'explicit' && !el.flag) {
        count += 1;
        return { ...el, state: 'accepted' as const };
      }
      return el;
    });
    return elements === section.elements ? section : { ...section, elements };
  });
  return { sections: count > 0 ? next : sections, count };
}

/** Collect the corrections captured this session, split by which engine they should improve —
 *  the payload for the feedback loop (append-only into the evidence ledger). */
export function collectCorrections(sections: ReviewSection[]): {
  element: ReviewElement;
  correction: ReviewCorrection;
}[] {
  const out: { element: ReviewElement; correction: ReviewCorrection }[] = [];
  for (const section of sections) {
    for (const el of section.elements) {
      if (el.state === 'edited' && el.correction)
        out.push({ element: el, correction: el.correction });
    }
  }
  return out;
}
