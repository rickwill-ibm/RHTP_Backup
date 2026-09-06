'use client';
/**
 * AuditLogPanel — HIPAA-compliant session audit log viewer.
 * Type definitions, event config and filter groups are in auditLogTypes.ts.
 */
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type AuditEventType,
  type FilterType,
  EVENT_CONFIG,
  OUTCOME_CONFIG,
  FILTER_GROUPS,
  isCdsEvent,
  isOrderEvent,
  formatTimestamp,
} from './auditLogTypes';

export type { AuditEventType } from './auditLogTypes';
export type { AuditEvent } from './auditLogTypes';

interface AuditLogPanelProps {
  events: import('./auditLogTypes').AuditEvent[];
}

export default function AuditLogPanel({ events }: AuditLogPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = events.filter((e) => {
    if (filter !== 'all') {
      if (filter === 'cds-card-acknowledged') {
        if (!isCdsEvent(e.eventType)) return false;
      } else if (filter === 'order-signed') {
        if (!isOrderEvent(e.eventType)) return false;
      } else {
        if (e.eventType !== filter) return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        e.action.toLowerCase().includes(q) ||
        e.userName.toLowerCase().includes(q) ||
        e.eventType.toLowerCase().includes(q) ||
        Object.values(e.details).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return true;
  });

  const sortedEvents = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="bg-white border border-carbon-gray-20 flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-carbon-gray-20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Icon name="ClipboardDocumentListIcon" size={16} className="text-[#6929c4]" />
          <div>
            <p className="text-sm font-semibold text-carbon-gray-100">HIPAA Audit Log</p>
            <p className="text-2xs text-carbon-gray-50">
              {events.length} event{events.length !== 1 ? 's' : ''} captured this session
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold px-2 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            HIPAA COMPLIANT
          </span>
          <span className="text-2xs text-carbon-gray-50 font-mono">
            Session: {events[0]?.encounterId ?? '—'}
          </span>
        </div>
      </div>

      {/* Filter + Search bar */}
      <div className="px-5 py-2.5 border-b border-carbon-gray-20 flex items-center gap-3 flex-shrink-0 bg-carbon-gray-10">
        <div className="flex items-center gap-1">
          {FILTER_GROUPS.map((fg) => (
            <button
              key={fg.value}
              onClick={() => setFilter(fg.value)}
              className={`px-2.5 py-1 text-2xs font-medium transition-colors ${
                filter === fg.value
                  ? 'bg-[#6929c4] text-white'
                  : 'bg-white text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-20'
              }`}
            >
              {fg.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-white border border-carbon-gray-20 px-2.5 py-1">
          <Icon name="MagnifyingGlassIcon" size={12} className="text-carbon-gray-50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="text-xs text-carbon-gray-100 outline-none w-36 placeholder-carbon-gray-50 bg-transparent"
          />
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {sortedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="ClipboardDocumentListIcon" size={32} className="text-carbon-gray-30 mb-3" />
            <p className="text-sm text-carbon-gray-50">No audit events match the current filter</p>
          </div>
        ) : (
          <div className="divide-y divide-carbon-gray-10">
            {sortedEvents.map((event) => {
              const cfg = EVENT_CONFIG[event.eventType];
              const outcomeCfg = OUTCOME_CONFIG[event.outcome];
              const isExpanded = expandedId === event.id;
              const detailEntries = Object.entries(event.details).filter(
                ([, v]) => v !== undefined && v !== ''
              );

              return (
                <div key={event.id} className="hover:bg-carbon-gray-10 transition-colors">
                  <button
                    className="w-full text-left px-5 py-3 flex items-start gap-3"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  >
                    <div
                      className={`w-7 h-7 flex-shrink-0 flex items-center justify-center border ${cfg.bg} ${cfg.border} mt-0.5`}
                    >
                      <Icon name={cfg.icon as never} size={13} className={cfg.color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-carbon-gray-100">
                          {event.action}
                        </span>
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 ${outcomeCfg.bg} ${outcomeCfg.color}`}
                        >
                          {outcomeCfg.label}
                        </span>
                        <span
                          className={`text-2xs px-1.5 py-0.5 ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-2xs text-carbon-gray-50 flex items-center gap-1">
                          <Icon name="UserIcon" size={10} className="text-carbon-gray-40" />
                          {event.userName}
                        </span>
                        <span className="text-2xs text-carbon-gray-50 flex items-center gap-1">
                          <Icon name="ClockIcon" size={10} className="text-carbon-gray-40" />
                          {formatTimestamp(event.timestamp)}
                        </span>
                        <span className="text-2xs font-mono text-carbon-gray-40">
                          Enc: {event.encounterId}
                        </span>
                      </div>
                    </div>

                    <Icon
                      name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                      size={12}
                      className="text-carbon-gray-40 flex-shrink-0 mt-1"
                    />
                  </button>

                  {isExpanded && detailEntries.length > 0 && (
                    <div className="px-5 pb-3 ml-10">
                      <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-3 py-2.5">
                        <p className="text-2xs font-semibold text-carbon-gray-70 mb-2 uppercase tracking-wide">
                          Event Details
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                          {detailEntries.map(([key, val]) => (
                            <div key={key} className="flex items-start gap-1.5">
                              <span className="text-2xs text-carbon-gray-50 capitalize min-w-[90px] flex-shrink-0">
                                {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}:
                              </span>
                              <span className="text-2xs font-medium text-carbon-gray-100 font-mono break-all">
                                {String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-carbon-gray-20">
                          <div className="flex items-center gap-4">
                            <div className="flex items-start gap-1.5">
                              <span className="text-2xs text-carbon-gray-50 min-w-[90px]">
                                Patient ID:
                              </span>
                              <span className="text-2xs font-mono font-medium text-carbon-gray-100">
                                {event.patientId}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-2xs text-carbon-gray-50 min-w-[90px]">
                                User ID:
                              </span>
                              <span className="text-2xs font-mono font-medium text-carbon-gray-100">
                                {event.userId}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-2xs text-carbon-gray-50 min-w-[90px]">
                                Event ID:
                              </span>
                              <span className="text-2xs font-mono font-medium text-carbon-gray-100">
                                {event.id}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-carbon-gray-20 bg-carbon-gray-10 flex items-center justify-between flex-shrink-0">
        <p className="text-2xs text-carbon-gray-50">
          Showing {sortedEvents.length} of {events.length} events · Retained per HIPAA §164.312(b)
        </p>
        <div className="flex items-center gap-1.5 text-2xs text-carbon-gray-50">
          <Icon name="LockClosedIcon" size={10} className="text-[#0e6027]" />
          <span>Tamper-evident · Encrypted at rest</span>
        </div>
      </div>
    </div>
  );
}
