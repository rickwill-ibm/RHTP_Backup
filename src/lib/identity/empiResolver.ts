/**
 * EMPI-backed identity resolver (the litmus-test wiring).
 *
 * Bridges the REAL match engine (matchEngine.ts deterministic rules +
 * probabilistic scoring, thresholds autoLink 90 / possibleMatch 60) to the
 * pipeline's IdentityResolver seam, so inbound records are matched to the right
 * person by the actual MPI/EMPI logic instead of a djb2 hash stub.
 *
 * Decision, per resolved subject:
 *   deterministic rule hit OR probabilistic score >= autoLinkMin (90)
 *        -> LINKED to the anchored member id for the matched person.
 *   score in the possible-match band [60, 90)
 *        -> HELD for review (throws HeldIdentityError). NEVER auto-linked — a
 *           wrong-person match must not silently corrupt the whole-person record.
 *   no demographics, or score < possibleMatchMin (60)
 *        -> MINT a new anchored member id, deterministically, with provenance.
 *
 * Scoring is NOT reimplemented here: findBestMatch (resolveIdentity.ts) drives
 * runDeterministicRules + scoreProbabilisticMatch + tierForScore. Candidates come
 * from the IdentitySource seam (identitySource.ts) — the same mock-vs-real EMPI
 * boundary the platform already defines; swap it for HCA's MPI in production.
 */
import type { DemographicTraits, IdentityResolver, ResolveIdentityTraits } from '@/lib/pipeline/types';
import { HeldIdentityError } from '@/lib/pipeline/heldIdentity';
import { MATCH_THRESHOLDS } from './matchEngine';
import { findBestMatch } from './resolveIdentity';
import { getIdentitySource, mockIdentitySource, type IdentitySource } from './identitySource';
import type { IdentityMatchResult, IdentityTraits, MatchTier, SourceIdentityRecord, SourceSystem } from './mpiTypes';
import type { XrefIndex, XrefReader } from './crossReference/xref';

const ALL_SOURCE_SYSTEMS: SourceSystem[] = ['emr', 'payer', 'state-agency'];

export type EmpiOutcome = 'linked' | 'held' | 'minted';

export interface EmpiResolution {
  /** Anchored member id ('' only when held). */
  memberId: string;
  outcome: EmpiOutcome;
  matchTier: MatchTier | 'id-only';
  confidence: number;
  /** Structured, PHI-safe. e.g. 'identity-possible-match', 'empi-linked'. */
  reasonCode: string;
  /** How the id was established (audit provenance). */
  provenance: string;
  /**
   * A cross-reference link the caller SHOULD record (source id -> member id), set
   * whenever a concrete member id was established for this source id. Recording it
   * is what closes F3 fragmentation: the next feed carrying this source id resolves
   * to the SAME member instead of minting a new one.
   */
  link?: { sourceId: string; memberId: string };
  /** PHI-free one-line summary safe for an audit record (no name/dob/SSN). */
  auditSummary: string;
}

/** Stable non-crypto content hash (djb2, 8 hex) — same family as the pipeline stub. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** DemographicTraits (all optional) -> the engine's IdentityTraits (name/dob required). */
function toIdentityTraits(d: DemographicTraits): IdentityTraits {
  return {
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    dob: d.dob ?? '',
    sex: d.sex,
    ssnLast4: d.ssnLast4,
    medicaidId: d.medicaidId,
    zip: d.zip,
    phone: d.phone,
  };
}

/**
 * The person key an anchored id is derived from — chosen so every source record
 * for one person collapses to the SAME anchored member id (enterprise identity),
 * strongest stable trait first. Falls back to the candidate's own record id.
 */
function canonicalPersonKey(c: SourceIdentityRecord): string {
  const t = c.traits;
  if (t.medicaidId && t.medicaidId.trim()) return `mid:${t.medicaidId.trim().toLowerCase()}`;
  if (t.ssnLast4 && t.dob) return `ssn:${t.ssnLast4}:${t.dob}`;
  if (t.lastName && t.dob) return `nm:${t.lastName.trim().toLowerCase()}:${(t.firstName ?? '').trim().toLowerCase()}:${t.dob}`;
  return `rec:${c.sourceRecordId}`;
}

/** Anchored member id for a matched person — stable across their source records. */
function anchoredIdFor(c: SourceIdentityRecord): string {
  return `mem-${hash(canonicalPersonKey(c))}`;
}

/** A freshly minted anchored id, deterministic per (feed, source id) so replays are idempotent. */
function mintedIdFor(sourceMemberId: string, feed: string): string {
  return `mem-${hash(`mint:${feed}:${sourceMemberId}`)}`;
}

function auditSummary(outcome: EmpiOutcome, match: IdentityMatchResult | null): string {
  const rules = (match?.ruleHits ?? []).map((h) => h.rule).join(',') || 'none';
  const tier = match?.tier ?? 'id-only';
  const conf = match?.confidence ?? 0;
  return `empi outcome=${outcome} tier=${tier} confidence=${conf} rules=[${rules}]`;
}

/** Every candidate across every source system the EMPI knows about. */
function allCandidates(source: IdentitySource): SourceIdentityRecord[] {
  return ALL_SOURCE_SYSTEMS.flatMap((s) => source.recordsFor(s));
}

/**
 * Resolve one subject through the real match engine. Pure and directly testable:
 * returns the full decision (link / hold / mint) without throwing.
 */
export function resolveEmpi(
  sourceMemberId: string,
  traits: ResolveIdentityTraits | undefined,
  source: IdentitySource = mockIdentitySource,
  xref?: XrefReader,
): EmpiResolution {
  const feed = traits?.feed ?? 'unknown-feed';
  const demographics = traits?.demographics;

  // Id-only (no demographics): nothing to match probabilistically. F3 fix — consult
  // the cross-reference FIRST so a source id already linked (by an earlier feed)
  // resolves to the EXISTING member instead of minting a fresh, fragmenting id.
  if (!demographics) {
    if (xref) {
      const look = xref.lookup(sourceMemberId);
      // E9: distinct members claim this source id with no merge relating them —
      // HOLD for review, never fail open by picking one wrong member.
      if (look.status === 'ambiguous') {
        return {
          memberId: '',
          outcome: 'held',
          matchTier: 'id-only',
          confidence: 0,
          reasonCode: 'identity-xref-ambiguous',
          provenance: 'empi-held-xref-ambiguous',
          auditSummary: auditSummary('held', null),
        };
      }
      if (look.status === 'linked') {
        return {
          memberId: look.memberId,
          outcome: 'linked',
          matchTier: 'id-only',
          confidence: 0,
          reasonCode: 'empi-xref-linked',
          provenance: 'empi-linked-xref',
          auditSummary: auditSummary('linked', null),
        };
      }
    }
    // Genuinely new source id: mint deterministically AND record the xref link.
    const minted = mintedIdFor(sourceMemberId, feed);
    return {
      memberId: minted,
      outcome: 'minted',
      matchTier: 'id-only',
      confidence: 0,
      reasonCode: 'empi-minted-id-only',
      provenance: 'empi-minted-new',
      link: { sourceId: sourceMemberId, memberId: minted },
      auditSummary: auditSummary('minted', null),
    };
  }

  const input = toIdentityTraits(demographics);
  const match = findBestMatch(input, allCandidates(source));

  // Deterministic hit or probabilistic score at/above the auto-link threshold.
  if (match.candidate && (match.tier === 'deterministic' || match.confidence >= MATCH_THRESHOLDS.autoLinkMin)) {
    const memberId = anchoredIdFor(match.candidate);
    return {
      memberId,
      outcome: 'linked',
      matchTier: match.tier,
      confidence: match.confidence,
      reasonCode: 'empi-linked',
      provenance: match.tier === 'deterministic' ? 'empi-linked-deterministic' : 'empi-linked-probabilistic',
      // Link the raw source id to the anchored member so later id-only records for
      // the same id resolve here rather than fragmenting.
      link: { sourceId: sourceMemberId, memberId },
      auditSummary: auditSummary('linked', match),
    };
  }

  // Possible-match band [60, 90): HELD for review — never auto-linked.
  if (match.confidence >= MATCH_THRESHOLDS.possibleMatchMin) {
    return {
      memberId: '',
      outcome: 'held',
      matchTier: match.tier,
      confidence: match.confidence,
      reasonCode: 'identity-possible-match',
      provenance: 'empi-held-for-review',
      auditSummary: auditSummary('held', match),
    };
  }

  // No usable match -> mint a new anchored member id with provenance, and link it.
  const minted = mintedIdFor(sourceMemberId, feed);
  return {
    memberId: minted,
    outcome: 'minted',
    matchTier: match.tier,
    confidence: match.confidence,
    reasonCode: 'empi-minted-no-match',
    provenance: 'empi-minted-new',
    link: { sourceId: sourceMemberId, memberId: minted },
    auditSummary: auditSummary('minted', match),
  };
}

/**
 * The EMPI resolver as an IdentityResolver seam value. LINKED/MINTED return the
 * anchored id; HELD throws HeldIdentityError so runTransform diverts the record
 * to the held-for-review lane instead of attaching it to a member.
 *
 * U3 fix — the candidate source is resolved LAZILY per invocation via
 * getIdentitySource() when no explicit source is supplied. In production with no
 * real source registered this throws EmpiCandidateSourceNotConfiguredError (fail
 * loud) instead of scoring/minting against the 3 demo records. Resolving lazily
 * (not at module load) keeps import-time safe and the mock demo green. Passing an
 * explicit `source` (tests / a wired client) bypasses the selector.
 */
export function createEmpiResolver(source?: IdentitySource): IdentityResolver {
  return (sourceMemberId, traits) => {
    const src = source ?? getIdentitySource();
    const res = resolveEmpi(sourceMemberId, traits, src);
    if (res.outcome === 'held') {
      throw new HeldIdentityError({
        reasonCode: res.reasonCode,
        reason: res.auditSummary,
        matchTier: res.matchTier,
        confidence: res.confidence,
      });
    }
    return res.memberId;
  };
}

/**
 * The default EMPI resolver. Resolves its candidate source from the `identity`
 * data mode at call time: mock/seeded -> demo registry; production -> registered
 * source or a loud EmpiCandidateSourceNotConfiguredError.
 */
export const empiResolver: IdentityResolver = createEmpiResolver();

/**
 * The EMPI resolver WIRED to a cross-reference index — the F3 fragmentation fix.
 *
 * The synchronous xref index is consulted on every id-only record: an already
 * linked source id resolves to the EXISTING member (no per-feed fragmentation),
 * and a genuinely new id mints then records its link so the next feed follows it.
 * A demographic match likewise records its link. An ambiguous xref (E9) throws
 * HeldIdentityError rather than failing open to a wrong member. Each mutation the
 * index performs emits a memberId-partitioned C2 event (xref.events()) so the
 * graph rekeys by REPLAY (DP-7) — never an in-place key rewrite.
 */
export function createXrefEmpiResolver(
  xref: XrefIndex,
  source?: IdentitySource,
): IdentityResolver {
  return (sourceMemberId, traits) => {
    const src = source ?? getIdentitySource();
    const res = resolveEmpi(sourceMemberId, traits, src, xref);
    if (res.outcome === 'held') {
      throw new HeldIdentityError({
        reasonCode: res.reasonCode,
        reason: res.auditSummary,
        matchTier: res.matchTier,
        confidence: res.confidence,
      });
    }
    if (res.link) xref.link(res.link.sourceId, res.link.memberId, traits?.feed);
    return res.memberId;
  };
}
