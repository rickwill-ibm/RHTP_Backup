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
  const { getDataMode } = await import('@/lib/config/dataMode');
  if (getDataMode('evidence') !== 'production') return;
  const { registerProductionEvidenceStore } = await import('@/lib/evidence/store/composition');
  registerProductionEvidenceStore();
}
