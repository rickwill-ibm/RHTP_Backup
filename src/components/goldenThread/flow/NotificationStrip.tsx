'use client';
/**
 * NotificationStrip — the "someone was told" pillar. A compact feed of the workflow notifications the
 * engine fires (assigned / approval-needed / released / response-received / sla-warning / resolved),
 * each addressed to a named seat. Dismissible. CLIENT-SAFE.
 */
import { ROLE_LABEL } from '@/lib/goldenThread/e2eFlow';
import type { NotificationKind } from '@/lib/goldenThread/workflow';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

const KIND_COLOR: Record<NotificationKind, string> = {
  assigned: '#24427e',
  'approval-needed': '#b45309',
  released: '#0e7490',
  'response-received': '#24a148',
  resolved: '#57534e',
  'sla-warning': '#da1e28',
};
const KIND_LABEL: Record<NotificationKind, string> = {
  assigned: 'ASSIGNED',
  'approval-needed': 'ACTION NEEDED',
  released: 'RELEASED',
  'response-received': 'RESPONSE',
  resolved: 'RESOLVED',
  'sla-warning': 'SLA',
};
const seatLabel = (id: string): string =>
  (ROLE_LABEL as Record<string, string>)[id] ?? id.replace(/^human:/, '').replace(/-/g, ' ');

export function NotificationStrip({ op }: { op: OperatingSim }): React.ReactElement | null {
  const open = op.sim.notifications.filter((n) => !n.read).slice(0, 6);
  if (open.length === 0) return null;
  return (
    <div className="ed-card p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Notifications
        </span>
        <span className="mono rounded-full bg-carbon-blue px-1.5 text-[9px] font-bold text-white">
          {open.length}
        </span>
      </div>
      <div className="space-y-1">
        {open.map((n) => (
          <div
            key={n.id}
            className="flex items-center gap-2 rounded border border-carbon-gray-20 bg-white px-2 py-1"
          >
            <span
              className="mono rounded px-1 py-0.5 text-[8px] font-bold text-white"
              style={{ background: KIND_COLOR[n.kind] }}
            >
              {KIND_LABEL[n.kind]}
            </span>
            <span className="text-[10px] font-semibold text-carbon-gray-80">
              → {seatLabel(n.to)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-carbon-gray-60">
              {n.text}
            </span>
            <span className="mono text-[9px] text-carbon-gray-40">t{n.tick}</span>
            <button
              type="button"
              onClick={() => op.dismissNotif(n.id)}
              className="text-[10px] text-carbon-gray-40 hover:text-carbon-gray-70"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
