'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';

export interface ReferralPanelItem {
  id: string;
  specialty: string;
  reason: string;
  orderedBy: string;
  orderedDate: string;
  status: 'Pending' | 'Submitted' | 'Scheduled' | 'In Progress' | 'Completed';
  priority: 'stat' | 'urgent' | 'routine';
  providerName: string;
  dueDate: string;
  source: string;
  networkTier?: string;
  qualityScore?: number;
  waitDays?: number;
}

const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  Submitted: 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
  Scheduled: 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]',
  'In Progress': 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  Completed: 'bg-[#defbe6] text-[#24a148] border-[#a7f0ba]',
};

const PRIORITY_STYLE: Record<string, string> = {
  stat: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  urgent: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  routine: 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20',
};

interface ReferralCardListProps {
  items: ReferralPanelItem[];
}

export default function ReferralCardList({ items }: ReferralCardListProps) {
  if (items.length === 0) {
    return (
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-5 py-4 flex items-center gap-3 text-xs text-carbon-gray-50">
        <Icon name="InformationCircleIcon" size={16} />
        <span>
          No referrals signed during this visit yet. Sign orders or confirm care team assignments to
          see them here.
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
          This Visit
        </span>
        <span className="px-1.5 py-0.5 text-2xs font-bold bg-[#6929c4] text-white">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((ref) => (
          <div key={ref.id} className="bg-white border border-[#d4bbff] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-[#f6f2ff] border border-[#d4bbff] flex items-center justify-center flex-shrink-0">
                  <Icon name="ArrowTopRightOnSquareIcon" size={14} className="text-[#6929c4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-carbon-gray-100">
                      {ref.specialty}
                    </span>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 border ${STATUS_STYLE[ref.status] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                    >
                      {ref.status}
                    </span>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 border ${PRIORITY_STYLE[ref.priority] || 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20'}`}
                    >
                      {ref.priority.toUpperCase()}
                    </span>
                    <span className="text-2xs px-1.5 py-0.5 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
                      ⚡ This Visit
                    </span>
                  </div>
                  <p className="text-xs text-carbon-gray-50 mb-1.5">{ref.reason}</p>
                  <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                    <span>
                      Provider:{' '}
                      <span className="font-medium text-carbon-gray-70">{ref.providerName}</span>
                    </span>
                    {ref.networkTier && (
                      <span>
                        Network:{' '}
                        <span className="font-medium text-carbon-gray-70">{ref.networkTier}</span>
                      </span>
                    )}
                    {ref.qualityScore && (
                      <span>
                        Quality:{' '}
                        <span className="font-medium text-[#24a148]">{ref.qualityScore}/100</span>
                      </span>
                    )}
                    {ref.waitDays && (
                      <span>
                        Wait:{' '}
                        <span className="font-medium text-carbon-gray-70">{ref.waitDays}d</span>
                      </span>
                    )}
                    <span>Ordered by: {ref.orderedBy}</span>
                    <span>Date: {ref.orderedDate}</span>
                  </div>
                </div>
              </div>
              <Icon
                name="CheckCircleIcon"
                size={16}
                className="text-[#24a148] flex-shrink-0 mt-0.5"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
