/**
 * Gain-Share — Scenario Modeler. Ported from the static `/public/mocks` iframe to the real, sim-anchored
 * React board (`GainShareStandalone` → the modeler beside the real payment-integrity ROI), so the modeler
 * reads the same operating sim / pinned epoch as the rest of the Golden-Thread flow. Behind `goldenThreadE2E`.
 */
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';
import { GainShareStandalone } from '@/components/gainShare/GainShareStandalone';

export const dynamic = 'force-dynamic';

const CRUMBS = [{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Gain-Share — Modeler' }];

export default function GainShareModelerPage(): React.ReactElement {
  if (!flag('goldenThreadE2E')) {
    return (
      <AppLayout pageTitle="Gain-Share — Modeler" breadcrumbs={CRUMBS}>
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">The Gain-Share modeler is not enabled.</p>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout pageTitle="Gain-Share — Modeler" breadcrumbs={CRUMBS}>
      <div className="mx-auto max-w-6xl p-6">
        <GainShareStandalone />
      </div>
    </AppLayout>
  );
}
