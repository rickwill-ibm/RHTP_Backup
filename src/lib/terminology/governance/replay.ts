/**
 * Version replay (I8A-iii Wave A) — reproduce a past adjudication.
 *
 * Given a code and a CHOSEN historical version, evaluate membership against THAT
 * version via the 8A-ii validateCode data layer (membersForVersion), NOT the
 * current bound version. This reproduces what a past adjudication would have seen:
 * a code retired in the current version can still be a valid member of the older
 * version it was originally bound to.
 *
 * E9 (hard invariant): replay MUST NOT fall back to the current version. When the
 * chosen version is not modeled, `reproduced` is false with status
 * 'version-not-modeled' — never a current-version answer dressed up as historical.
 */
import { isGovernedSystem, membersForVersion } from '../validateCode';
import type { TerminologySystem } from '../types';

export interface ReplayInput {
  system: TerminologySystem | string;
  code: string;
  /** The historical version to bind against (e.g. 'FY2025'). */
  version: string;
}

export type ReplayStatus =
  | 'valid'
  | 'unknown-code'
  | 'unsupported-system'
  | 'version-not-modeled';

export interface ReplayResult {
  system: TerminologySystem | string;
  code: string;
  /** The version replay was asked to bind against. */
  version: string;
  valid: boolean;
  status: ReplayStatus;
  /** The version the answer actually came from — always the chosen version, or null. */
  boundVersion: string | null;
  /** True only when the chosen version's membership was found and evaluated. */
  reproduced: boolean;
  stub: true;
}

/**
 * Evaluate `code` against the membership of the CHOSEN `version`. Deterministic
 * and PHI-free. Uses membersForVersion(system, version) so the bound set is the
 * historical one; if that version is unmodeled it returns not-reproduced (E9),
 * never the current membership.
 */
export function replayAgainstVersion(input: ReplayInput): ReplayResult {
  const { system, code, version } = input;

  if (!isGovernedSystem(system)) {
    return {
      system,
      code,
      version,
      valid: false,
      status: 'unsupported-system',
      boundVersion: null,
      reproduced: false,
      stub: true,
    };
  }

  const members = membersForVersion(system, version);
  if (members === undefined) {
    // E9: the chosen version is not modeled — do NOT fall back to current.
    return {
      system,
      code,
      version,
      valid: false,
      status: 'version-not-modeled',
      boundVersion: null,
      reproduced: false,
      stub: true,
    };
  }

  const isMember = members.includes(code);
  return {
    system,
    code,
    version,
    valid: isMember,
    status: isMember ? 'valid' : 'unknown-code',
    boundVersion: version,
    reproduced: true,
    stub: true,
  };
}
