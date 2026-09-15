/**
 * Golden Thread — Recovery (the DESIGNED end-to-end experience). Embeds the approved
 * `golden_thread_recovery` executive walkthrough verbatim (served from /public/mocks) inside
 * the app shell — the navigable, editorial experience: sticky section-nav, the Twin-Ladder
 * card, the bidirectional payer/provider/ledger flow lanes, the recovery beat. This is the
 * designed surface; the live-wired order→cash pipeline lives at /golden-thread.
 *
 * Full-bleed iframe so the designed page owns its own layout/scroll. Behind `goldenThreadE2E`.
 */
import { flag } from '@/lib/flags/flags';
import AppLayout from '@/components/AppLayout';

export const dynamic = 'force-dynamic';

const CRUMBS = [{ label: 'CMS-0057-F', href: '/cms' }, { label: 'Golden Thread — Recovery' }];

export default function GoldenThreadRecoveryPage(): React.ReactElement {
  if (!flag('goldenThreadE2E')) {
    return (
      <AppLayout pageTitle="Golden Thread — Recovery" breadcrumbs={CRUMBS}>
        <div className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-carbon-gray-70">
            The Golden Thread recovery walkthrough is not enabled.
          </p>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout pageTitle="Golden Thread — Recovery" breadcrumbs={CRUMBS} fullBleed>
      <div className="min-h-0 flex-1">
        <iframe
          src="/mocks/golden-thread-recovery.html"
          title="Golden Thread — Recovery walkthrough"
          className="h-full w-full border-0"
        />
      </div>
    </AppLayout>
  );
}
