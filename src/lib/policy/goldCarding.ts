/**
 * Gold carding (increment GC).
 *
 * A "gold card" exempts a provider from prior authorization for a specific
 * service when their recent approval rate is high enough. It attaches to a
 * provider **NPI**, per **procedure code**, per **payer**, and is earned by a
 * ≥ threshold approval rate over a look-back window with a minimum submission
 * volume; it is time-boxed and revocable.
 *
 * Regulatory grounding: state-law-driven — Texas HB 3459 (2021) pioneered it;
 * Louisiana, West Virginia, Vermont, Colorado, and Michigan have versions — plus
 * voluntary payer programs (e.g. UnitedHealthcare, Cigna). It is NOT a federal
 * CMS-0057-F mandate. Thresholds/windows vary by program, so they are
 * parameters here, not constants.
 *
 * Pure + deterministic: callers pass `asOf` (no wall-clock reads) so expiry and
 * qualification are reproducible and testable. Produces a `GoldCardEvidence`
 * that the Evidence Record accepts, and a status the determination layer uses to
 * skip PA (outcome `pa-exempt-gold-card`).
 */
import type { GoldCardEvidence } from '@/lib/evidence';

/** Program parameters. Defaults reflect the common ≥90% / 6–12 month pattern. */
export interface GoldCardProgram {
  name: string; // e.g. "Texas HB 3459" | "UHC voluntary gold card"
  approvalRateThreshold: number; // e.g. 0.9
  minSubmissions: number; // volume floor for statistical validity (e.g. 5)
  lookbackMonths: number; // e.g. 12
  exemptionMonths: number; // duration before re-qualification (e.g. 12)
}

export const DEFAULT_PROGRAM: GoldCardProgram = {
  name: 'Default gold-card program',
  approvalRateThreshold: 0.9,
  minSubmissions: 5,
  lookbackMonths: 12,
  exemptionMonths: 12,
};

/** A provider's PA outcome history for one (NPI, code, payer) over a window. */
export interface ProviderPaHistory {
  providerNpi: string;
  code: string;
  payer: string;
  submissions: number;
  approvals: number;
  windowMonths: number;
}

/** An explicitly granted gold card (already earned), with an expiry date. */
export interface GrantedGoldCard {
  providerNpi: string;
  code: string;
  payer: string;
  program: string;
  approvalRate: number;
  sampleSize: number;
  lookbackMonths: number;
  grantedOn: string; // ISO
  expiresOn: string; // ISO
  revoked?: boolean;
}

export interface GoldCardKey {
  providerNpi: string;
  code: string;
  payer: string;
}

export interface GoldCardContext {
  roster?: GrantedGoldCard[]; // explicitly granted cards
  histories?: ProviderPaHistory[]; // raw stats to compute qualification
  program?: GoldCardProgram;
  asOf: string; // ISO; expiry + "now" reference
}

export interface GoldCardStatus {
  applied: boolean; // qualified AND active (not expired/revoked)
  providerNpi: string;
  code: string;
  payer: string;
  program: string;
  approvalRate?: number;
  sampleSize?: number;
  lookbackMonths?: number;
  threshold: number;
  expiresOn?: string | null;
  reason: string;
}

function keyEq(a: GoldCardKey, b: { providerNpi: string; code: string; payer: string }): boolean {
  return a.providerNpi === b.providerNpi && a.code === b.code && a.payer === b.payer;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Decide whether an order is gold-card exempt. Precedence: an explicit granted
 * card (honored unless expired/revoked) wins; otherwise qualification is
 * computed from history against the program thresholds.
 */
export function evaluateGoldCard(key: GoldCardKey, ctx: GoldCardContext): GoldCardStatus {
  const program = ctx.program ?? DEFAULT_PROGRAM;
  const threshold = program.approvalRateThreshold;

  // 1) explicit grant
  const grant = (ctx.roster ?? []).find((g) => keyEq(key, g));
  if (grant) {
    const expired = ctx.asOf > grant.expiresOn;
    const active = !grant.revoked && !expired;
    return {
      applied: active,
      providerNpi: key.providerNpi,
      code: key.code,
      payer: key.payer,
      program: grant.program,
      approvalRate: grant.approvalRate,
      sampleSize: grant.sampleSize,
      lookbackMonths: grant.lookbackMonths,
      threshold,
      expiresOn: grant.expiresOn,
      reason: grant.revoked
        ? 'gold card revoked'
        : expired
          ? `gold card expired ${grant.expiresOn}`
          : `granted gold card active (approval ${pct(grant.approvalRate)} ≥ ${pct(threshold)}, n=${grant.sampleSize})`,
    };
  }

  // 2) compute from history
  const hist = (ctx.histories ?? []).find((h) => keyEq(key, h));
  if (hist) {
    const rate = hist.submissions > 0 ? hist.approvals / hist.submissions : 0;
    const enoughVolume = hist.submissions >= program.minSubmissions;
    const meetsRate = rate >= threshold;
    const qualifies = enoughVolume && meetsRate;
    let reason: string;
    if (qualifies)
      reason = `qualifies: approval ${pct(rate)} ≥ ${pct(threshold)} over ${hist.windowMonths}mo (n=${hist.submissions})`;
    else if (!enoughVolume)
      reason = `insufficient volume: n=${hist.submissions} < ${program.minSubmissions}`;
    else reason = `below threshold: approval ${pct(rate)} < ${pct(threshold)}`;
    return {
      applied: qualifies,
      providerNpi: key.providerNpi,
      code: key.code,
      payer: key.payer,
      program: program.name,
      approvalRate: rate,
      sampleSize: hist.submissions,
      lookbackMonths: hist.windowMonths,
      threshold,
      expiresOn: null,
      reason,
    };
  }

  // 3) no card, no history
  return {
    applied: false,
    providerNpi: key.providerNpi,
    code: key.code,
    payer: key.payer,
    program: program.name,
    threshold,
    expiresOn: null,
    reason: 'no gold card on file and no PA history to qualify from',
  };
}

/** Map a status to the Evidence Record's gold-card evidence shape. */
export function toEvidence(status: GoldCardStatus): GoldCardEvidence {
  return {
    applied: status.applied,
    providerNpi: status.providerNpi,
    code: status.code,
    payer: status.payer,
    approvalRate: status.approvalRate,
    lookbackMonths: status.lookbackMonths,
    sampleSize: status.sampleSize,
    basis: status.program,
    expiresOn: status.expiresOn ?? null,
    reason: status.reason,
  };
}

/**
 * Demo roster + histories (mock). Maria's imaging provider is gold-carded for
 * lumbar MRI (72148) with UHC; a second provider does not qualify.
 */
export const MOCK_GOLD_CARD_CONTEXT: Omit<GoldCardContext, 'asOf'> = {
  program: {
    name: 'UHC voluntary gold card',
    approvalRateThreshold: 0.9,
    minSubmissions: 5,
    lookbackMonths: 12,
    exemptionMonths: 12,
  },
  roster: [
    {
      providerNpi: '1730154782', // Maria's imaging provider
      code: '72148',
      payer: 'UnitedHealthcare Community Plan',
      program: 'UHC voluntary gold card',
      approvalRate: 0.97,
      sampleSize: 42,
      lookbackMonths: 12,
      grantedOn: '2026-01-01',
      expiresOn: '2027-01-01',
    },
  ],
  histories: [
    {
      providerNpi: '1518998765', // a different provider, not qualified
      code: '72148',
      payer: 'UnitedHealthcare Community Plan',
      submissions: 21,
      approvals: 13, // ~62%
      windowMonths: 12,
    },
    {
      providerNpi: '1043321987', // qualifies purely on history
      code: '72148',
      payer: 'UnitedHealthcare Community Plan',
      submissions: 18,
      approvals: 17, // ~94%
      windowMonths: 12,
    },
  ],
};
