/**
 * Gain-Share (VBC) — Phase B payer/provider dashboards. The two approved gain-share mocks
 * (`m2_glide_*` interactive glide path, `m3_money_*` follow-the-money chart) built for real
 * inside the app: how shift-left connects to value-based arrangements over time, dual-party,
 * and where the dollars go along the risk-transfer ladder.
 *
 * Server page → two self-contained client boards. No data fetch, no PHI: every figure is
 * ILLUSTRATIVE (shape-and-magnitude for the VBC story), and the page carries that disclaimer
 * verbatim — live values would bind to the shared evidence record. Behind `goldenThreadE2E`.
 */
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';
import { GainShareStandalone } from '@/components/gainShare/GainShareStandalone';

export const dynamic = 'force-dynamic';

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AppLayout
      pageTitle="Gain-Share — VBC glide path"
      breadcrumbs={[{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Gain-Share' }]}
    >
      {children}
    </AppLayout>
  );
}

export default function GainSharePage(): React.ReactElement {
  if (!flag('goldenThreadE2E')) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">The Gain-Share view is not enabled.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">
            Gain-Share — real payment integrity + modelled VBC
          </h1>
          <p className="mt-1 text-sm text-carbon-gray-70">
            Two money stories, kept separate: a <strong>real</strong> payment-integrity ROI computed
            live over the sealed reconciliation sub-ledger, and a <strong>modelled</strong>{' '}
            value-based shared-savings scenario on a risk-adjusted benchmark. Recovery dollars never
            enter the savings split. The payer never surrenders adjudication.
          </p>
        </header>

        <GainShareStandalone />
      </div>
    </Shell>
  );
}
