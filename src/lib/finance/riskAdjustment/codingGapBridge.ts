// CONTRACT: C1  // CONTRACT: C10  // SEAM: graph  // HW-FIN / DP-1  (P1a RADV enrichment)
/**
 * Coding-gap → RADV candidate-capture bridge (P1a).
 *
 * A CONSENT-SAFE, TWO-HOP read over the projected graph that turns a member's
 * CLOSED coding gaps into candidate `HccCapture`s the RADV defensibility gate can
 * score. It is the read-model the SINGLE-HOP whole-person lens cannot provide: that
 * lens surfaces the CodingGap off the member, but not the second hop to the cited
 * evidence and the clinical nodes that evidence joins back to. This bridge walks:
 *
 *   (Member)-[:HAS_CODING_GAP]->(CodingGap)-[:SUPPORTED_BY]->(Evidence ⇒ Condition|Encounter)
 *
 * THREE invariants make it safe (each is a red-team target):
 *
 *  1. CODING-INTENSITY FIREWALL. Only a gap whose `evidenceStatus` is `closed-gap`
 *     is eligible. An `open-gap` / `pending` (suspected / net-new-without-evidence)
 *     gap is a payer HYPOTHESIS — it is NEVER materialized as a submittable capture,
 *     which would be exactly the coding-intensity abuse the graph firewall exists to
 *     prevent. This bridge only CITES clinical evidence that already exists; it never
 *     mints a diagnosis and never writes to the graph (a pure read).
 *
 *  2. CONSENT ON EVERY HOP (C1). `scopeCovers` is re-applied at EACH hop: the
 *     CodingGap node, the Evidence citation node, AND the joined clinical
 *     (Condition / Encounter) node. The joined clinical node is a SEPARATE node with
 *     its OWN restriction label, so it must be gated independently — a restricted
 *     42 CFR Part 2 Condition cited by a gap is dropped unless the caller's scope
 *     covers it. The second hop cannot leak what a first-hop lens read would gate.
 *
 *  3. NON-DEFENSIBLE IS SURFACED, NOT DROPPED. A closed gap that resolves to a
 *     diagnosis but no valid face-to-face encounter still yields a candidate —
 *     flagged with its RADV `deficiencies` — so a reviewer sees the remediation
 *     rather than the gap silently vanishing. Nothing here submits; the bridge only
 *     SCORES via `assessRadvDefensibility`. The submit decision stays with the human
 *     maker-checker and the existing scrub gate.
 *
 * PHI-minimal: codes / NPIs / booleans / opaque refs only — never a narrative.
 */
import type { ConsentScope } from '@/lib/graph/lens/types';
import { NO_CONSENT } from '@/lib/graph/lens/types';
import { scopeCovers } from '@/lib/graph/lens/lenses';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import { HAS_CODING_GAP, SUPPORTED_BY, CODING_GAP_KIND } from '@/lib/graph/mapping/codingGap';
import { CONDITION_KIND } from '@/lib/graph/mapping/conditions';
import type { GraphNodeRecord, GraphStore, PropVal } from '@/lib/graph/types';
import { assessRadvDefensibility, type HccCapture, type RadvDefensibility } from './meat';

/** The graph-derived candidate capture: what the gap resolves to + its RADV score. */
export interface CandidateCapture {
  /** The source CodingGap node key (for traceability, PHI-safe). */
  gapRef: string;
  /** Risk model + version the gap was reported under (e.g. 'CMS-HCC' / 'V28'). */
  model: string;
  modelVersion: string;
  /** The cited Condition node key the diagnosis came from. */
  conditionRef: string;
  /** The cited Encounter node key the F2F evidence came from, or null when none was cited. */
  encounterRef: string | null;
  /** The assembled capture (codes / DOS / NPI / MEAT), never a narrative. */
  capture: HccCapture;
  /** The RADV defensibility score + deficiencies — surfaced, not used to drop. */
  defensibility: RadvDefensibility;
}

const ENCOUNTER_KIND = 'Encounter';
const CLOSED_GAP = 'closed-gap';

function str(v: PropVal | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function bool(v: PropVal | undefined): boolean {
  return v === true;
}
/** 'Condition/abc' -> the resource type ('Condition'). The node KEY is the full ref. */
function kindOfRef(ref: string): string {
  const t = ref.split('/')[0];
  return t && /^[A-Za-z]+$/.test(t) ? t : '';
}
/** 'Encounter/enc-1' -> 'enc-1' (the bare id, for the capture's encounterId field). */
function idOfRef(ref: string): string {
  return ref.split('/').slice(1).join('/') || ref;
}

/**
 * Materialize a member's CLOSED coding gaps into candidate RADV captures, scored for
 * defensibility. Consent-safe on every hop (see module header). A member absent from
 * the graph yields `[]` (the caller decides 404 vs empty; this is a pure read and does
 * not fabricate). The store is INJECTED, so this is unit-testable on both backends with
 * no globals.
 */
export async function materializeCandidateCaptures(
  store: GraphStore,
  memberId: string,
  scope: ConsentScope = NO_CONSENT
): Promise<CandidateCapture[]> {
  const member = await store.getNode(MEMBER_KIND, memberId);
  if (!member) return [];

  // MEMBERSHIP GUARD (cross-member citation defense). A gap's evidence reference is
  // authored text; Evidence nodes are keyed GLOBALLY by that ref, so two members could
  // cite the same ref and the joined clinical node belongs to whoever projected it. We
  // therefore only accept a joined Condition/Encounter that is ACTUALLY this member's —
  // linked by the member's own HAS_PROBLEM / HAD_ENCOUNTER edge. A mis-authored or
  // hostile MeasureReport citing ANOTHER member's diagnosis cannot surface it here.
  const memberEdges = await store.listEdges({ fromKey: memberId });
  const ownedConditions = new Set(
    memberEdges.filter((e) => e.type === 'HAS_PROBLEM').map((e) => e.to.key)
  );
  const ownedEncounters = new Set(
    memberEdges.filter((e) => e.type === 'HAD_ENCOUNTER').map((e) => e.to.key)
  );
  const gapEdges = memberEdges.filter((e) => e.type === HAS_CODING_GAP);
  const out: CandidateCapture[] = [];

  for (const ge of gapEdges) {
    // Hop 1 — the CodingGap node, consent-gated on its OWN restriction.
    const gap = await store.getNode(ge.to.kind || CODING_GAP_KIND, ge.to.key);
    if (!gap) continue;
    if (!scopeCovers(gap, scope)) continue;
    // FIREWALL: only a closed gap is eligible to become a capture. A suspected / open /
    // pending gap is a hypothesis and must NEVER be materialized as submittable.
    if (str(gap.properties.evidenceStatus) !== CLOSED_GAP) continue;

    // Hop 2 — walk SUPPORTED_BY to the Evidence citation nodes, then JOIN each back to
    // its real clinical node. Consent is re-checked on BOTH the Evidence node and the
    // joined clinical node (the leak guard: the joined node has its own restriction), and
    // the membership guard drops any node that is not THIS member's.
    const supEdges = await store.listEdges({ fromKey: gap.key, type: SUPPORTED_BY });
    const conditions: GraphNodeRecord[] = [];
    const seenCondition = new Set<string>();
    let encounter: GraphNodeRecord | null = null;

    for (const se of supEdges) {
      const evidence = await store.getNode(se.to.kind, se.to.key);
      if (!evidence) continue;
      if (!scopeCovers(evidence, scope)) continue; // consent: the citation node
      const ref = str(evidence.properties.evidenceRef) || se.to.key;
      const kind = kindOfRef(ref);
      if (!kind) continue;
      const clinical = await store.getNode(kind, ref);
      if (!clinical) continue; // a citation with no materialized clinical node — skip
      if (!scopeCovers(clinical, scope)) continue; // consent: the JOINED clinical node
      if (kind === CONDITION_KIND) {
        if (!ownedConditions.has(ref) || seenCondition.has(ref)) continue; // membership + dedupe
        seenCondition.add(ref);
        conditions.push(clinical);
      } else if (kind === ENCOUNTER_KIND && !encounter) {
        if (!ownedEncounters.has(ref)) continue; // membership
        encounter = clinical;
      }
    }

    // A diagnosis is required to form a capture (an encounter alone is not a dx). Each
    // visible cited Condition yields one candidate, paired with the cited F2F encounter.
    for (const cond of conditions) {
      out.push(buildCandidate(memberId, gap, cond, encounter));
    }
  }
  return out;
}

/** Assemble + score ONE candidate from a resolved (gap, condition, encounter) triple. */
function buildCandidate(
  memberId: string,
  gap: GraphNodeRecord,
  cond: GraphNodeRecord,
  enc: GraphNodeRecord | null
): CandidateCapture {
  const capture: HccCapture = {
    hccCode: str(gap.properties.conditionCategory),
    icdCode: str(cond.properties.code),
    memberId,
    encounterId: enc ? idOfRef(enc.key) : '',
    dateOfService: enc ? str(enc.properties.dateOfService) : '',
    providerNpi: enc ? str(enc.properties.providerNpi) : '',
    meat: {
      monitored: bool(cond.properties.meatMonitored),
      evaluated: bool(cond.properties.meatEvaluated),
      assessed: bool(cond.properties.meatAssessed),
      treated: bool(cond.properties.meatTreated),
    },
    sourceDocumentRef: enc ? str(enc.properties.sourceDocumentRef) || undefined : undefined,
    status: 'active',
  };
  return {
    gapRef: gap.key,
    model: str(gap.properties.model),
    modelVersion: str(gap.properties.modelVersion),
    conditionRef: cond.key,
    encounterRef: enc ? enc.key : null,
    capture,
    defensibility: assessRadvDefensibility(capture),
  };
}
