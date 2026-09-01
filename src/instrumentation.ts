/**
 * Next.js instrumentation hook (composition root). Runs once at server startup.
 *
 * U4 fix — when the evidence seam is in production mode, register the real
 * append-only Postgres ledger factory so getEvidenceStore() selects it (and
 * fails loud on a missing connection) instead of the dead in-memory Map. Guarded
 * to the nodejs runtime and to production mode, so the mock demo and the edge
 * runtime are never touched.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Composition root (WPC hardening): register the projected-graph holistic
  // aggregator and SCHEDULE the projection drain at process start — not lazily off
  // the /api/ops/health route. Without this, production /api/wpc/context could 503
  // (aggregator unregistered) and the drain never ran until health was first hit.
  // Dynamic import keeps the Node-only reliability graph out of the edge bundle;
  // bootstrapReliability() is idempotent, and runs in every data mode (nodejs).
  const { bootstrapReliability } = await import('@/lib/reliability/bootstrap');
  bootstrapReliability();

  const { getDataMode } = await import('@/lib/config/dataMode');
  if (getDataMode('evidence') !== 'production') return;
  const { registerProductionEvidenceStore } = await import('@/lib/evidence/store/composition');
  registerProductionEvidenceStore();
}
