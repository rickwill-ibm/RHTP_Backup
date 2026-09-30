/**
 * THE LEDGER ROW AND ITS SEAL — the record shape, the hashed field set, and the hash itself.
 *
 * Extracted from `flowSim.ts` by responsibility (conventions §2), and because `flowSim.ts` is frozen
 * in `quality-baseline.json` so it may not grow. It is also the right seam on its own terms: three
 * functions in `flowSim` hash a ledger row (`seal`, `verifyEntryDetail`, `ledgerIntact`) and they
 * were three hand-copied field literals that had already drifted once. One module, one field set.
 *
 * HONEST LIMIT, restated so no reader has to infer it. `mixHash` is an unkeyed FNV-style mix. It
 * makes the chain TAMPER-EVIDENT ONLY against an editor who does not re-run it: anyone who can
 * rewrite a row can recompute every hash after it. That is chain CONSISTENCY, not cryptographic
 * evidence, and a production seal is keyed (HMAC) or signed with an externally anchored head. The
 * demo surface is labelled accordingly; see FAKE_FIDELITY.md.
 *
 * Pure and deterministic: no clock, no rng, no I/O.
 */
import type { NistFn, Oversight } from '@/lib/goldenThread/nistMap';

export interface LedgerEntry {
  seq: number;
  tick: number;
  actor: string;
  human: boolean;
  fired: string;
  version: string;
  tier: string;
  rung: string;
  decision: string;
  nistFn: NistFn; // AI-RMF FUNCTION this act contributes to (single-sourced from NIST_SPEC)
  nistChar: string; // trustworthiness CHARACTERISTIC it supports (illustrative alignment)
  oversight: Oversight; // human-oversight mode on this act (HITL / HOTL / none)
  prevHash: number;
  hash: number;
  reproducible: boolean;
  /** The earned-and-granted autonomy ceiling in force when this act was sealed (0-3). */
  earnedCeiling: number;
  /** This act exercised more autonomous authority than the fleet had earned. See ceilingRecord.ts. */
  overCeiling: boolean;
}

/** Everything a ledger row asserts, minus the chain links that are derived FROM it. */
export type LedgerHashable = Omit<LedgerEntry, 'prevHash' | 'hash'>;
/**
 * THE HASHED FIELD SET — every key of a ledger row, each explicitly decided.
 *
 * INVARIANT: seal, `verifyEntryDetail` and `ledgerIntact` hash the SAME fields. They were three
 * hand-copied 14-element literals, and adding one field to the sealing copy silently broke both
 * verifiers: every row's recomputed hash omitted a field the stored hash included, so the whole
 * tamper-evidence surface would have read "tampered" on untouched records. A control that cries wolf
 * is a control that gets ignored.
 *
 * INVARIANT: the set is EXHAUSTIVE over `LedgerHashable`, not a list someone maintains. The typed
 * `Record<keyof LedgerHashable, true>` is what makes that true: a 15th field on `LedgerEntry` fails
 * `tsc --noEmit` here until someone decides about it, rather than shipping displayed-but-unhashed —
 * which is a field an editor changes for free. Deriving the parts from `Object.keys` of this witness
 * means there is no second place to forget. Every field the record DISPLAYS or ASSERTS is in it:
 * `human` (who decided), `earnedCeiling` and `overCeiling` (what the fleet had earned, and whether
 * this act exceeded it). `prevHash` is covered as the mix seed; `hash` is the output.
 */
const HASHED_LEDGER_FIELDS: Record<keyof LedgerHashable, true> = {
  seq: true,
  tick: true,
  actor: true,
  human: true,
  fired: true,
  version: true,
  tier: true,
  rung: true,
  decision: true,
  nistFn: true,
  nistChar: true,
  oversight: true,
  reproducible: true,
  earnedCeiling: true,
  overCeiling: true,
};
/** Sorted so the order is a property of the key set, not of declaration order in two places. */
const HASHED_KEYS = (Object.keys(HASHED_LEDGER_FIELDS) as (keyof LedgerHashable)[]).sort();
export function ledgerHashParts(e: LedgerHashable): Array<string | number | boolean> {
  return HASHED_KEYS.map((k) => e[k]);
}

export function mixHash(prev: number, parts: Array<string | number | boolean>): number {
  let h = prev | 0;
  const push = (n: number): void => {
    h = Math.imul(h ^ n, 0x01000193) | 0;
  };
  push(0x9e3779b1);
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i += 1) push(str.charCodeAt(i));
  }
  return h >>> 0;
}

/**
 * INVARIANT: a `GRANT·`/`REVOKE·` version is an authority change and must declare it. `kind` is
 * optional so the 22 act call sites stay quiet, and "omitted means act" is itself an inference — so
 * this closes the only direction that inference can be wrong. Throws rather than warning: a
 * misdeclared record is a corrupted safety record, and it is cheaper to fail the seal than to reason
 * about one later.
 */
export function assertSealGrammar(
  version: string,
  declared?: 'act' | 'authority-change'
): 'act' | 'authority-change' {
  const kind = declared ?? 'act';
  if (/^(GRANT|REVOKE)·/.test(version) && kind !== 'authority-change')
    throw new Error(
      `seal: version "${version}" is an authority change but declares kind "${kind}"`
    );
  return kind;
}
