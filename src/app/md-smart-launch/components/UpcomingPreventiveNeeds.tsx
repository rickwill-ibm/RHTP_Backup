'use client';
// UpcomingPreventiveNeeds — extracted from ActiveReferralsPanel.
// Satisfies AI-CODING-CONVENTIONS v2 §2 size ratchet.
import React from 'react';
import Icon from '@/components/ui/AppIcon';

const ITEMS = [
  {
    id: 'upcoming-001',
    title: 'Annual Wellness Visit',
    detail: 'Coming due for scheduling; not currently counted as an open care gap.',
    owner: 'Primary Care',
    dueDate: '2026-10-15',
  },
  {
    id: 'upcoming-002',
    title: 'Diabetic Eye Exam',
    detail: 'Coming due for scheduling; not currently counted as an open care gap.',
    owner: 'Ophthalmology',
    dueDate: '2026-09-30',
  },
  {
    id: 'upcoming-003',
    title: 'COPD Follow-up',
    detail:
      'Monitor and schedule if clinically indicated; not currently counted as an open care gap.',
    owner: 'Primary Care',
    dueDate: '2026-11-01',
  },
];

export const UPCOMING_PREVENTIVE_NEEDS = ITEMS;

export default function UpcomingPreventiveNeeds() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
          Upcoming / Schedule Next
        </span>
        <span className="px-1.5 py-0.5 text-2xs font-bold bg-carbon-gray-70 text-white">
          {ITEMS.length}
        </span>
      </div>
      <div className="space-y-2">
        {ITEMS.map((item) => (
          <div key={item.id} className="bg-white border border-carbon-gray-20 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-carbon-gray-10 border border-carbon-gray-20 flex items-center justify-center flex-shrink-0">
                  <Icon name="CalendarDaysIcon" size={14} className="text-carbon-gray-50" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-carbon-gray-100">{item.title}</span>
                    <span className="text-2xs font-medium px-1.5 py-0.5 border bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20">
                      COMING DUE
                    </span>
                  </div>
                  <p className="text-xs text-carbon-gray-50 mb-1.5">{item.detail}</p>
                  <div className="flex items-center gap-4 text-xs text-carbon-gray-50 flex-wrap">
                    <span>
                      Owner: <span className="font-medium text-carbon-gray-70">{item.owner}</span>
                    </span>
                    <span>
                      Due: <span className="font-medium text-[#b45309]">{item.dueDate}</span>
                    </span>
                  </div>
                </div>
              </div>
              <Icon name="ClockIcon" size={16} className="text-[#b45309] flex-shrink-0 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
