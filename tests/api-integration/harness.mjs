/**
 * Test harness for the RHTP API integration suite.
 *
 * Extracted verbatim from tests/api-integration.test.mjs — colour helpers,
 * the pass/fail counters, the ok/section/subsection reporters, and the final
 * summary print + process exit.
 *
 * Counters live as module-level state here and are only ever mutated through
 * ok(); summary() reads them from the same module scope, so no primitive is
 * exported by value.
 */

// ── Colour helpers ────────────────────────────────────────────────────────────
export const G = (s) => `\x1b[32m${s}\x1b[0m`;
export const R = (s) => `\x1b[31m${s}\x1b[0m`;
export const Y = (s) => `\x1b[33m${s}\x1b[0m`;
export const B = (s) => `\x1b[36m${s}\x1b[0m`;
export const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

let passed = 0,
  failed = 0,
  warned = 0;
const failures = [];

export function ok(label, check, detail = '') {
  try {
    check();
    console.log(`  ${G('✓')} ${label}${detail ? DIM(' — ' + detail) : ''}`);
    passed++;
  } catch (e) {
    console.log(`  ${R('✗')} ${label}`);
    console.log(`      ${R(e.message)}${detail ? DIM(' | ' + detail) : ''}`);
    failed++;
    failures.push({ label, error: e.message });
  }
}

export function section(title) {
  console.log(`\n${B('━'.repeat(60))}`);
  console.log(`${B('▶')} ${title}`);
  console.log(`${B('━'.repeat(60))}`);
}

export function subsection(title) {
  console.log(`\n  ${Y('┄'.repeat(50))}`);
  console.log(`  ${Y('▷')} ${title}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
export function summary() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ${G('Passed:')} ${passed}`);
  console.log(`  ${R('Failed:')} ${failed}`);
  if (failures.length > 0) {
    console.log(`\n  ${R('FAILURES:')}`);
    for (const f of failures) {
      console.log(`  ${R('✗')} ${f.label}`);
      console.log(`      ${DIM(f.error)}`);
    }
  }
  console.log(`\n  Total: ${passed + failed} checks`);
  console.log(`${'═'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}
