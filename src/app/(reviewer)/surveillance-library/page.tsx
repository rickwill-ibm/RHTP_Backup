/**
 * Surveillance / FWA Library — Phase D. The program-integrity algorithm catalog that runs
 * ON the shared, tamper-evident evidence record: payer, provider-counter, and neutral-arbiter
 * tiers, each held to the same Twin-Ladder evidence/autonomy discipline. Server page →
 * client catalog (`SurveillanceLibrary`) over the pure `library` data model.
 *
 * Behind `goldenThreadE2E`. No data fetch, no PHI — a governed capability catalog.
 */
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';
import { EditorialShell } from '@/components/editorial/EditorialShell';
import { SurveillanceLibrary } from '@/components/surveillance/SurveillanceLibrary';
import { ALGO_COUNT, CATEGORY_COUNT, PLAN_HEADLINE_COUNT } from '@/lib/surveillance/library';

export const dynamic = 'force-dynamic';

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AppLayout
      pageTitle="Surveillance / FWA Library"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Surveillance / FWA Library' }]}
    >
      {children}
    </AppLayout>
  );
}

export default function SurveillanceLibraryPage(): React.ReactElement {
  if (!flag('goldenThreadE2E')) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">
            The Surveillance / FWA Library is not enabled.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <AppLayout
      pageTitle="Surveillance / FWA Library"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Surveillance / FWA Library' }]}
      fullBleed
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorialShell
          eyebrow="Program integrity · Checks & balances"
          title="Surveillance / FWA Library"
          subtitle={
            <>
              The program-integrity analytics layer that runs <em>on</em> the shared, append-only,
              per-party-signed evidence record. Symmetry is the product: every payer-on-provider
              algorithm has a named provider-on-payer counterpart, and a neutral arbiter tier
              reproduces findings neither side can run against the other. Authority never outruns
              evidence —{' '}
              <span className="mono">permittedRung = min(manifestAutonomy, tierCeiling)</span>, then
              the adverse-action gradient caps adverse action at A2.
            </>
          }
          badge="Capability catalog — governed library, not a live detection run · licensed criteria never enter the record"
        >
          {/* Counts + Twin-Ladder governance summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-carbon-gray-20 bg-white p-4 text-center">
              <p className="text-3xl font-semibold">{ALGO_COUNT}</p>
              <p className="text-xs text-carbon-gray-60">algorithms cataloged</p>
            </div>
            <div className="rounded-lg border border-carbon-gray-20 bg-white p-4 text-center">
              <p className="text-3xl font-semibold">{CATEGORY_COUNT}</p>
              <p className="text-xs text-carbon-gray-60">categories</p>
            </div>
            <div className="rounded-lg border border-carbon-gray-20 bg-white p-4 text-center">
              <p className="text-3xl font-semibold">3</p>
              <p className="text-xs text-carbon-gray-60">
                tiers · payer / provider-counter / neutral
              </p>
            </div>
          </div>

          {ALGO_COUNT !== PLAN_HEADLINE_COUNT ? (
            <p className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2 text-[11px] text-carbon-gray-60">
              Source note: the library plan’s prose headlines “{PLAN_HEADLINE_COUNT} algorithms
              (rebuild from 28),” but its Section-3 catalog names {ALGO_COUNT} distinct algorithms.
              This surface encodes all {ALGO_COUNT} named — nothing dropped — and shows the live
              count; the headline figure is flagged here for reconciliation.
            </p>
          ) : null}

          <div className="rounded-lg border border-carbon-gray-20 bg-white p-4">
            <h2 className="text-sm font-semibold">
              Twin-Ladder discipline (enforced per algorithm)
            </h2>
            <div className="mt-2 grid gap-3 text-xs text-carbon-gray-80 sm:grid-cols-2">
              <div>
                <p className="font-semibold">Evidence tiers</p>
                <p>
                  D0 self-asserted · D1 single-party signed · D2 dual-party reconciled · D3 fully
                  reconciled + policy-version-bound + in-window. Ceiling D0→A0 … D3→A3.
                </p>
              </div>
              <div>
                <p className="font-semibold">Authority rungs + gradient</p>
                <p>
                  A0 observe · A1 flag · A2 draft-for-approval · A3 autonomous. Adverse action
                  subtracts a rung and caps at A2 (no autonomous harm, ever); arithmetic, undisputed
                  corrections run the mutual-consent lane at A3.
                </p>
              </div>
            </div>
          </div>

          <SurveillanceLibrary />
        </EditorialShell>
      </div>
    </AppLayout>
  );
}
