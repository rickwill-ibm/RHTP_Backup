// Crash-recovery sentinel for the E13 mutation sampler (check-mutation.mjs).
// Framework v1.6 §6: crash-safe restore. Extracted from check-mutation.mjs at W9
// under the size ratchet (AI-CODING-CONVENTIONS §2/§3) — behaviour preserved,
// ordering invariant STRENGTHENED (see ORDERING below).
//
// A JS `finally` does NOT run when the process is killed by a signal, which can leave
// a MUTANT on disk masquerading as real code. Two layers, because the first one is not
// enough and used to claim it was.
//
// LAYER 1 (in-process): restore on any terminating signal we can HANDLE.
//
// LAYER 2 (on-disk sentinel): SIGINT/SIGTERM/SIGHUP are handleable; SIGKILL IS NOT,
// and neither is a container stop or an OOM kill. The old header asserted that with
// layer 1 alone "an interrupted run can never corrupt the tree". That claim was FALSE
// and it cost a real incident: a 2-minute harness cap SIGKILLed a run mid-mutant and
// left `src/lib/agents/dispatch/disclosureGate.ts:178` as
// `if (signal.part2Restricted) return false;` — the inverse of the fail-closed check
// guarding 42 CFR Part 2 material, sitting in the tree reading as authored code. It
// was caught by a failing test, not by any gate, and only because someone looked past
// "my last change must have broken this".
//
// So before the FIRST mutant of a target is written, the pristine bytes go to a
// sentinel file on disk. A later run finding that sentinel restores from it, says so
// loudly, and EXITS NON-ZERO — a tree that was silently wrong deserves a stop, not a
// silent heal, because anything that ran in between got a green or red it did not earn.
// The sentinel is removed only after the target's final restore has succeeded.
// FOUR CONTAINMENTS, each closing a hole an adversarial seat found in the first cut of
// this sentinel. The first cut read `rec.file` from the sentinel and wrote to it with no
// validation, at module top level BEFORE argv was parsed — an arbitrary-path file-write
// primitive inside a blocking CI step. A committed sentinel naming `~/.npmrc` got that
// file overwritten, and the tool printed "file restored" over it. Pointed at
// `disclosureGate.ts` with `return false` it would have RE-CREATED the 42 CFR Part 2
// fail-open that motivated this sentinel's existence, and called the write a restore.
//
//   1. CONTAINMENT: `rec.file` must resolve inside the repo root AND be a declared
//      mutation target. Nothing else is ever written.
//   2. PROVENANCE: the sentinel records the MUTANT's sha256 as well as the pristine
//      bytes, and a restore happens only when the on-disk bytes hash to that mutant.
//      "on disk differs from pristine" is not evidence THIS tool caused the difference —
//      it is equally a developer's unsaved edit.
//   3. OWNERSHIP: the sentinel is per-PID. A live PID means a CONCURRENT run, not a
//      crashed one, so we refuse rather than reverting a peer's in-flight mutant
//      mid-test (which made the peer report a false SURVIVED and left it unprotected).
//   4. ORDERING: recovery may never run before the declared target set is known —
//      otherwise containment has nothing to check against and the sentinel degrades to
//      the arbitrary-path write primitive described above.
//
// HOW ORDERING IS ENFORCED HERE (register G-009). In the single-file version this was a
// STATEMENT-ORDER convention: a module-level `let DECLARED_TARGETS = null` that a later
// line assigned, with `isRecoverable()` returning false while it was null. One line moved
// above `loadTargets()` reverted the tool to the write primitive. ESM makes that worse,
// not better: imports are hoisted and an imported module's body runs BEFORE the
// importer's, so an import-time side effect here would run before argv is even parsed.
//
// So this module has NO import-time side effects — no recovery, no signal handlers, no
// filesystem access — and exposes NO way to recover without targets. `recover()` is only
// reachable through the object `createSentinelGuard(declaredTargets)` returns, and that
// factory REQUIRES a non-null Set. The only producer of that Set is `loadTargets()` in
// the harness, which exits 2 on a usage error. The ordering invariant is therefore a DATA
// DEPENDENCY, not a line order: you cannot call recovery before the targets exist because
// you cannot obtain the object that carries it. Reordering the harness's lines makes the
// program throw, not write.

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const SENTINEL_DIR = 'docs/build-provenance';
export const SENTINEL_PREFIX = '.mutation-inflight';
export const sentinelPath = (pid) => join(SENTINEL_DIR, `${SENTINEL_PREFIX}.${String(pid)}.json`);
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Is that PID a process that still exists? A live one is a peer, not a corpse. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

/**
 * Build the crash-recovery guard. `declaredTargets` is the set of repo-relative,
 * forward-slashed paths this run is allowed to touch — the CONTAINMENT allow-list. It is
 * REQUIRED and must be a Set: that requirement is the ordering invariant (see header).
 */
export function createSentinelGuard(declaredTargets) {
  if (!(declaredTargets instanceof Set)) {
    throw new TypeError(
      'createSentinelGuard: declaredTargets must be a Set of declared mutation targets. ' +
        'Recovery must never run before the targets are known (register G-009).'
    );
  }
  const MY_SENTINEL = sentinelPath(process.pid);
  let inflightFile = null;
  let inflightOriginal = null;
  let inflightMutantHash = null;

  /** True when `file` is inside the repo root AND a declared mutation target. */
  function isRecoverable(file) {
    if (typeof file !== 'string' || file.length === 0) return false;
    const root = resolve(process.cwd());
    const abs = resolve(root, file);
    if (abs !== root && !abs.startsWith(root + sep)) return false;
    return declaredTargets.has(relative(root, abs).split(sep).join('/'));
  }

  function clearSentinel() {
    try {
      if (existsSync(MY_SENTINEL)) unlinkSync(MY_SENTINEL);
    } catch {}
  }

  /**
   * Record the pristine bytes plus the hash of the mutant about to be written. Both are
   * needed: the pristine bytes to restore, the mutant hash to PROVE the tool caused what
   * is on disk before overwriting anything.
   */
  function arm(file, original, mutantText) {
    const mutantHash = sha256(mutantText);
    inflightFile = file;
    inflightOriginal = original;
    inflightMutantHash = mutantHash;
    try {
      writeFileSync(
        MY_SENTINEL,
        JSON.stringify({ v: 2, pid: process.pid, file, original, mutantHash, atMs: Date.now() })
      );
    } catch {
      // A sentinel we cannot write is a protection we do not have. Refuse rather than run
      // unprotected: the failure this guards produced a fail-open in a confidentiality
      // path, so "best effort" is not an acceptable posture here.
      console.error(
        `E13: cannot write the crash sentinel ${MY_SENTINEL} - refusing to mutate any file.`
      );
      process.exit(2);
    }
  }

  function disarm() {
    inflightFile = null;
    inflightOriginal = null;
    inflightMutantHash = null;
    clearSentinel(); // only after the final restore has actually been written
  }

  /**
   * Restore on a signal we CAN handle. Guarded by the same provenance check: only bytes
   * hashing to the mutant we wrote are overwritten, so a concurrent editor's save is never
   * clobbered by an exit handler.
   */
  function restoreInflight() {
    if (inflightFile != null && inflightOriginal != null) {
      try {
        const onDisk = existsSync(inflightFile) ? readFileSync(inflightFile, 'utf8') : null;
        if (
          onDisk !== null &&
          inflightMutantHash != null &&
          sha256(onDisk) === inflightMutantHash
        ) {
          writeFileSync(inflightFile, inflightOriginal);
        }
      } catch {}
    }
    clearSentinel();
  }

  /**
   * Recover from PREVIOUS runs killed un-handleably. Reachable only via this object, which
   * cannot exist before the declared target set does — so a usage error writes nothing.
   */
  function recover() {
    let stale = [];
    try {
      stale = readdirSync(SENTINEL_DIR).filter(
        (f) =>
          f.startsWith(SENTINEL_PREFIX + '.') &&
          f.endsWith('.json') &&
          join(SENTINEL_DIR, f) !== MY_SENTINEL
      );
    } catch {
      return;
    }

    let restored = 0;
    for (const name of stale) {
      const path = join(SENTINEL_DIR, name);
      let rec = null;
      try {
        rec = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        rec = null;
      }
      if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) {
        console.error(
          `E13: crash sentinel ${path} is unreadable or malformed. A prior run may have`
        );
        console.error(
          '     been killed mid-mutation with its pristine bytes lost. Restore the file it'
        );
        console.error(
          '     named from version control before trusting ANY test result on this tree.'
        );
        process.exit(2);
      }
      if (pidAlive(rec.pid)) {
        console.error(`E13: a CONCURRENT mutation run (pid ${String(rec.pid)}) holds ${path}.`);
        console.error(
          "     Two runs mutating one tree corrupt each other's results; refusing to start."
        );
        process.exit(2);
      }
      // CONTAINMENT + PROVENANCE, before any write.
      if (!isRecoverable(rec.file)) {
        console.error(
          `E13: crash sentinel ${path} names "${String(rec.file)}", which is not a declared`
        );
        console.error(
          '     mutation target inside this repo. REFUSING to write it. Delete the sentinel'
        );
        console.error('     after checking why it exists — this tool never wrote that path.');
        process.exit(2);
      }
      if (typeof rec.original !== 'string' || typeof rec.mutantHash !== 'string') {
        console.error(
          `E13: crash sentinel ${path} carries no pristine bytes or no mutant hash (v1 format?).`
        );
        console.error(
          `     REFUSING to write ${rec.file}; restore it from version control instead.`
        );
        process.exit(2);
      }
      const onDisk = existsSync(rec.file) ? readFileSync(rec.file, 'utf8') : null;
      if (onDisk === rec.original) {
        try {
          unlinkSync(path);
        } catch {}
        continue;
      }
      if (onDisk === null || sha256(onDisk) !== rec.mutantHash) {
        // Differs from pristine but is NOT the mutant we recorded: a developer's edit, a
        // rebase, another tool. Overwriting it would destroy real work.
        console.error(
          `E13: ${rec.file} differs from the pristine copy in ${path}, but does NOT match`
        );
        console.error(
          '     the mutant this tool wrote. Something else changed it. REFUSING to overwrite.'
        );
        process.exit(2);
      }
      writeFileSync(rec.file, rec.original);
      try {
        unlinkSync(path);
      } catch {}
      restored += 1;
      console.error('E13: A PRIOR MUTATION RUN WAS KILLED AND LEFT A MUTANT IN THE TREE.');
      console.error(`     file restored: ${rec.file}`);
      console.error(`     left at:       ${new Date(rec.atMs || 0).toISOString()}`);
    }
    if (restored > 0) {
      console.error('     Every test, gate and screenshot taken since then was taken against');
      console.error('     mutated source. Re-run the gates before trusting any of it.');
      process.exit(1);
    }
  }

  // LAYER 1 registration happens HERE, not at import time: nothing is armed before the
  // guard exists, so there is nothing for an earlier handler to restore.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      restoreInflight();
      process.exit(130);
    });
  }
  process.on('exit', restoreInflight);

  return { recover, arm, disarm, restoreInflight, isRecoverable, sentinelFile: MY_SENTINEL };
}
