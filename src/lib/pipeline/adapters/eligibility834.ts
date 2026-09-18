// CONTRACT: C9  // CONTRACT: C10
/**
 * 834 eligibility BATCH adapter (arrival mode: batch). Proves the X12 batch path.
 * Parses a small realistic 834-ish payload (segment-per-line, `*`-delimited
 * elements) into normalized Coverage records at tier T1. Generic over records:
 * no member is hardcoded; identity is resolved through the injected seam so the
 * Coverage attaches to the anchored member, never the raw subscriber id.
 *
 * C9.2 yield: 834 -> coverage T1 (+ demographics T1, out of this adapter's scope).
 */
import type {
  DomainAdapter,
  NormalizedRecord,
  PipelineDeps,
  RawRecord,
  ValidationResult,
} from '../types';

interface X12Member {
  segments: string[][]; // parsed INS-loop segments
}

const SOURCE = { system: 'state-medicaid', feed: 'x12-834' } as const;

/** Split an 834 payload into INS-loop raw records (one per enrolled member). */
function parse(payload: string): RawRecord<X12Member>[] {
  const segments = payload
    .split(/[~\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split('*'));
  const loops: string[][][] = [];
  let current: string[][] | null = null;
  for (const seg of segments) {
    if (seg[0] === 'INS') {
      if (current) loops.push(current);
      current = [seg];
    } else if (current) {
      current.push(seg);
    }
  }
  if (current) loops.push(current);
  return loops.map((segs, i) => ({
    sourceRef: subscriberId(segs) ?? `ins-loop-${i + 1}`,
    data: { segments: segs },
  }));
}

function seg(member: X12Member, id: string): string[] | undefined {
  return member.segments.find((s) => s[0] === id);
}
function subscriberId(segs: string[][]): string | undefined {
  const ref = segs.find((s) => s[0] === 'REF' && s[1] === '0F');
  return ref?.[2];
}

/**
 * INS-3 maintenance-type code -> coverage disposition (X12 834 companion norms).
 * The add-vs-term distinction is the load-bearing one: a termination MUST produce
 * a disenrolled/terminated coverage record, never an `active` re-enrollment. This
 * covers the four codes the companion guide names; ANY other INS-3 value is
 * fail-closed (quarantined `unknown-maintenance-type`) rather than silently passed
 * as active — the register R3 requirement. Full 834 code-set fidelity (e.g. 025
 * reinstatement, 002 audit-compare, retro-term span handling) is DEFERRED; those
 * codes quarantine today instead of being mis-processed.
 */
const MAINTENANCE: Readonly<
  Record<
    string,
    { status: 'active' | 'terminated'; event: string; disenrolled: boolean; terminating: boolean }
  >
> = Object.freeze({
  '021': { status: 'active', event: 'coverage.enrolled', disenrolled: false, terminating: false }, // add
  '001': { status: 'active', event: 'coverage.changed', disenrolled: false, terminating: false }, // change
  '024': {
    status: 'terminated',
    event: 'coverage.terminated',
    disenrolled: true,
    terminating: true,
  }, // termination
  '030': {
    status: 'terminated',
    event: 'coverage.cancelled',
    disenrolled: true,
    terminating: true,
  }, // cancellation/equivalent
});

function maintenanceOf(m: X12Member): (typeof MAINTENANCE)[string] | undefined {
  const code = (seg(m, 'INS')?.[3] ?? '').trim();
  return MAINTENANCE[code];
}
/** DTP*348 = coverage begin (add/change); DTP*349 = coverage end (termination). */
function coverageBegin(m: X12Member): string {
  return d8ToIso(m.segments.find((s) => s[0] === 'DTP' && s[1] === '348')?.[3]);
}
function coverageEnd(m: X12Member): string {
  return d8ToIso(m.segments.find((s) => s[0] === 'DTP' && s[1] === '349')?.[3]);
}

/** X12 gender code (DMG-3) -> canonical sex, for probabilistic matching only. */
const X12_SEX: Record<string, 'male' | 'female' | 'other' | 'unknown'> = {
  M: 'male',
  F: 'female',
  U: 'unknown',
};

/**
 * Demographic traits parsed from the INS loop (NM1*IL name + optional DMG
 * dob/sex), carried into identity resolution for probabilistic matching. Used
 * ONLY at the seam — never stored on the record (the subscriber has these, per
 * task; a source without a DMG simply yields name-only, a thinner match).
 */
function demographicsOf(m: X12Member): import('../types').DemographicTraits {
  const nm1 = m.segments.find((s) => s[0] === 'NM1' && s[1] === 'IL');
  const dmg = seg(m, 'DMG');
  return {
    lastName: nm1?.[3],
    firstName: nm1?.[4],
    dob: d8ToIso(dmg?.[1] === 'D8' ? dmg?.[2] : undefined) || undefined,
    sex: dmg ? X12_SEX[(dmg[3] ?? '').toUpperCase()] : undefined,
  };
}

function validate(raw: RawRecord<X12Member>): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const m = raw.data;
  if (!seg(m, 'INS')) issues.push({ reasonCode: 'missing-ins-segment', fieldPath: 'INS' });
  if (!subscriberId(m.segments))
    issues.push({ reasonCode: 'missing-subscriber-id', fieldPath: 'REF*0F' });
  if (!seg(m, 'HD')) issues.push({ reasonCode: 'missing-coverage', fieldPath: 'HD' });
  // INS-3 maintenance type must be a code we can process; an unknown code is
  // fail-closed (never silently treated as an active enrollment).
  const maint = maintenanceOf(m);
  if (seg(m, 'INS') && !maint) {
    issues.push({ reasonCode: 'unknown-maintenance-type', fieldPath: 'INS*3' });
  }
  // Date anchor depends on the action: a termination needs the coverage END
  // (DTP*349); an add/change needs the coverage BEGIN (DTP*348).
  if (maint?.terminating) {
    if (!coverageEnd(m)) issues.push({ reasonCode: 'missing-coverage-end', fieldPath: 'DTP*349' });
  } else if (maint) {
    if (!coverageBegin(m))
      issues.push({ reasonCode: 'missing-coverage-begin', fieldPath: 'DTP*348' });
  }
  return { ok: issues.length === 0, issues };
}

/** D8 (CCYYMMDD) -> ISO date. */
function d8ToIso(d8?: string): string {
  if (!d8 || d8.length < 8) return '';
  return `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;
}

function normalize(raw: RawRecord<X12Member>, deps: PipelineDeps): NormalizedRecord {
  const m = raw.data;
  const subId = subscriberId(m.segments)!;
  // Pass the subscriber demographics so a real EMPI resolver can match
  // probabilistically; the deterministic (demo) resolver ignores them.
  const memberId = deps.resolveIdentity(subId, {
    feed: SOURCE.feed,
    demographics: demographicsOf(m),
  });
  const hd = seg(m, 'HD');
  const ins = seg(m, 'INS');
  const planCode = hd?.[3] ?? 'UNK';
  const maintenanceType = (ins?.[3] ?? '').trim();
  // validate() guarantees a known INS-3 before normalize runs. Defence-in-depth:
  // if this is ever reached with an unknown code, FAIL CLOSED (throw) rather than
  // silently defaulting to an active enrollment — an unknown maintenance type must
  // never be mis-processed as an add. (transform.ts rethrows non-held errors.)
  const maint = MAINTENANCE[maintenanceType];
  if (!maint) {
    throw new Error(
      `834 normalize invariant: unhandled INS-3 maintenance type "${maintenanceType}"`
    );
  }
  const periodStart = coverageBegin(m);
  const periodEnd = coverageEnd(m);
  // The record's date anchor is the begin for an add/change, the end for a term.
  const anchorDate = maint.terminating ? periodEnd || periodStart : periodStart;
  const resourceKey = hashKey(`${subId}:${planCode}:${anchorDate}`);
  return {
    domain: 'coverage',
    memberId,
    resourceType: 'Coverage',
    fhirResourceId: `Coverage/cov-${resourceKey}`,
    eventType: maint.event,
    tier: 'T1',
    idempotencyKey: `834:cov:${subId}:${planCode}:${anchorDate}`,
    provenance: 'payer-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: SOURCE,
    occurredAt: anchorDate ? `${anchorDate}T00:00:00Z` : new Date(deps.now()).toISOString(),
    payload: {
      coverageRef: `Coverage/cov-${resourceKey}`,
      planCode,
      maintenanceTypeCode: maintenanceType,
      periodStart,
      periodEnd,
      status: maint.status,
      disenrolled: maint.disenrolled,
    },
  };
}

function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** The 834 eligibility batch adapter. */
export const eligibility834Adapter: DomainAdapter<X12Member> = {
  source: SOURCE,
  domain: 'coverage',
  format: 'x12-834',
  arrivalMode: 'batch',
  parse,
  validate,
  normalize,
};
