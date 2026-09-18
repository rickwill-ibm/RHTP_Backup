'use client';
import React, { useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import {
  buildTriageQueue,
  TIER_ORDER,
  DOMAIN_STYLE,
  type SignalDomain,
  type TriageTier,
  type AdtInput,
  type TaskInput,
  type TransitionInput,
  type TriagedItem,
} from '@/lib/careTeam/triage';

const TIER_STYLE: Record<TriageTier, { bar: string; label: string }> = {
  'Do Now': { bar: 'bg-[#da1e28]', label: 'text-[#da1e28]' },
  'This Week': { bar: 'bg-[#b45309]', label: 'text-[#b45309]' },
  Routine: { bar: 'bg-[#0e6027]', label: 'text-[#0e6027]' },
};

const DOMAINS: (SignalDomain | 'All')[] = ['All', 'Clinical', 'BH', 'Social', 'Administrative'];

export default function ActionQueue({
  adt,
  tasks,
  transitions,
  restrictDomain,
  title,
  subtitle,
  focusCitizenId,
  focusCitizenName,
  onViewCitizen,
  onClearFocus,
  citizenMeta,
}: {
  adt: AdtInput[];
  tasks: TaskInput[];
  transitions: TransitionInput[];
  restrictDomain?: SignalDomain;
  title?: string;
  subtitle?: string;
  focusCitizenId?: string | null;
  focusCitizenName?: string;
  onViewCitizen?: (patientId: string) => void;
  onClearFocus?: () => void;
  citizenMeta?: (patientId: string) => { age?: number; gender?: string; mrn?: string } | undefined;
}) {
  const [filter, setFilter] = useState<SignalDomain | 'All'>('All');
  const [done, setDone] = useState<Set<string>>(new Set());

  const all = useMemo(() => {
    const q = buildTriageQueue({ adt, tasks, transitions });
    return restrictDomain ? q.filter((i) => i.domain === restrictDomain) : q;
  }, [adt, tasks, transitions, restrictDomain]);
  const visible = all.filter(
    (i) =>
      !done.has(i.id) &&
      (filter === 'All' || i.domain === filter) &&
      (!focusCitizenId || i.patientId === focusCitizenId)
  );
  const citizenCount = new Set(all.filter((i) => i.patientId).map((i) => i.patientId)).size;

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: 0, Clinical: 0, BH: 0, Social: 0, Administrative: 0 };
    all.forEach((i) => {
      if (!done.has(i.id)) {
        c.All++;
        c[i.domain]++;
      }
    });
    return c;
  }, [all, done]);

  const act = (item: TriagedItem) => {
    toast.success(`Action taken: ${item.nextAction}`, {
      description: `${item.patientName} · routed to ${item.ownerName}`,
    });
    setDone((prev) => new Set(prev).add(item.id));
  };
  const reassign = (item: TriagedItem) => {
    toast(`Reassign ${item.patientName}`, {
      description: `${item.signalType} — currently ${item.ownerName}`,
    });
  };

  return (
    <div className="space-y-3">
      {/* Header + triage explainer */}
      <div className="bg-white border border-carbon-gray-20 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Icon name="BoltIcon" size={16} className="text-[#0043ce]" />
        <div>
          <p className="text-sm font-semibold text-carbon-gray-100">
            {title ?? 'Action Queue — Triaged Signals'}
          </p>
          <p className="text-2xs text-carbon-gray-50">
            {focusCitizenId
              ? `${visible.length} signal${visible.length !== 1 ? 's' : ''} for ${focusCitizenName ?? 'this citizen'}`
              : `${all.length} signals across ${citizenCount} caseload citizen${citizenCount !== 1 ? 's' : ''} · disposed to owner + next best action`}
          </p>
        </div>
        {focusCitizenId && onClearFocus && (
          <button
            onClick={onClearFocus}
            className="flex items-center gap-1 px-2 py-1 text-2xs font-semibold border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            <Icon name="XMarkIcon" size={11} /> Clear citizen filter
          </button>
        )}
        <div
          className={`ml-auto flex items-center gap-1.5 flex-wrap ${restrictDomain ? 'hidden' : ''}`}
        >
          {DOMAINS.map((d) => {
            const active = filter === d;
            return (
              <button
                key={d}
                onClick={() => setFilter(d)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold border transition-colors ${
                  active
                    ? 'bg-carbon-gray-100 text-white border-carbon-gray-100'
                    : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
                }`}
              >
                {d}
                <span
                  className={`px-1 py-0.5 font-bold ${active ? 'bg-white/20 text-white' : 'bg-carbon-gray-10 text-carbon-gray-70'}`}
                >
                  {counts[d]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouped by triage tier */}
      {TIER_ORDER.map((tier) => {
        const tierItems = visible.filter((i) => i.tier === tier);
        if (tierItems.length === 0) return null;
        return (
          <div key={tier} className="bg-white border border-carbon-gray-20">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-carbon-gray-20">
              <span className={`w-2 h-2 rounded-full ${TIER_STYLE[tier].bar}`} />
              <p className={`text-xs font-bold uppercase tracking-wide ${TIER_STYLE[tier].label}`}>
                {tier}
              </p>
              <span className="text-2xs text-carbon-gray-50">{tierItems.length}</span>
            </div>
            <div className="divide-y divide-carbon-gray-20">
              {tierItems.map((item) => {
                const ds = DOMAIN_STYLE[item.domain];
                return (
                  <div
                    key={item.id}
                    className="px-4 py-3 hover:bg-carbon-gray-10 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-2xs font-bold px-1.5 py-0.5 ${ds.bg} ${ds.text}`}>
                            {item.domain}
                          </span>
                          <span className="text-xs font-semibold text-carbon-gray-100">
                            {item.signalType}
                          </span>
                          <span className="text-2xs text-carbon-gray-50">· {item.patientName}</span>
                          {(() => {
                            const meta =
                              item.patientId && citizenMeta
                                ? citizenMeta(item.patientId)
                                : undefined;
                            return meta ? (
                              <span className="text-2xs text-carbon-gray-50 font-mono">
                                {meta.age != null ? `${meta.age}y` : ''}
                                {meta.gender ? ` ${meta.gender}` : ''}
                                {meta.mrn ? ` · ${meta.mrn}` : ''}
                              </span>
                            ) : null;
                          })()}
                          {item.isNew && (
                            <span className="text-2xs font-bold px-1 py-0.5 bg-[#da1e28] text-white">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-carbon-gray-70 mt-1">{item.summary}</p>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-2xs">
                          <span className="text-carbon-gray-50">
                            <span className="font-semibold text-carbon-gray-70">Why now:</span>{' '}
                            {item.whyNow}
                          </span>
                          <span className="text-carbon-gray-50">·</span>
                          <span className="inline-flex items-center gap-1 text-carbon-gray-50">
                            <Icon name="UserCircleIcon" size={11} /> {item.ownerName}
                          </span>
                          <span className="text-carbon-gray-50">·</span>
                          <span className="inline-flex items-center gap-1 text-[#6929c4]">
                            <Icon name="CpuChipIcon" size={11} /> {item.producedBy}
                          </span>
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1.5 text-2xs font-semibold text-[#0043ce] bg-[#edf5ff] border border-[#97c1ff] px-2 py-1">
                          <Icon name="SparklesIcon" size={11} />
                          Next best action: {item.nextAction}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => act(item)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-[#0043ce] text-white text-2xs font-semibold hover:bg-[#002d9c] whitespace-nowrap"
                        >
                          <Icon name="CheckIcon" size={11} /> Act
                        </button>
                        <button
                          onClick={() => reassign(item)}
                          className="flex items-center gap-1 px-2.5 py-1 border border-carbon-gray-20 text-carbon-gray-70 text-2xs font-semibold hover:bg-carbon-gray-10 whitespace-nowrap"
                        >
                          <Icon name="ArrowsRightLeftIcon" size={11} /> Reassign
                        </button>
                        {item.patientId && onViewCitizen && (
                          <button
                            onClick={() => onViewCitizen(item.patientId!)}
                            className="flex items-center gap-1 px-2.5 py-1 border border-carbon-gray-20 text-[#0043ce] text-2xs font-semibold hover:bg-[#edf5ff] whitespace-nowrap"
                          >
                            <Icon name="UserCircleIcon" size={11} /> View citizen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {visible.length === 0 && (
        <div className="bg-white border border-carbon-gray-20 px-6 py-10 text-center">
          <Icon name="CheckCircleIcon" size={28} className="text-[#0e6027] mx-auto mb-2" />
          <p className="text-sm font-semibold text-carbon-gray-100">Queue clear</p>
          <p className="text-2xs text-carbon-gray-50">No triaged signals for this filter.</p>
        </div>
      )}
    </div>
  );
}
