'use client';
// MemberScopeNotice — fail-closed P0 guard for patient-focused screens that are
// not yet wired to per-member data. Shows the CORRECT active member's identity
// plus an honest "detail not yet available for this member" state, so no other
// member's (golden-demo) clinical or family data can leak onto their screen.
//
// Safe with the golden demo: pages render normally when Maria is active; only a
// non-golden member is routed to this notice.
import React from 'react';

interface Props {
  name: string;
  id: string;
  ageSex?: string;
  location?: string;
  program?: string;
  /** Human name of the screen, used in the message. */
  view?: string;
}

export default function MemberScopeNotice({
  name,
  id,
  ageSex,
  location,
  program,
  view = 'This view',
}: Props) {
  return (
    <div className="min-h-[60vh] bg-[#0a0f1e] text-white p-4 space-y-4 font-sans">
      {/* Correct member identity — never another member's */}
      <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4493f8]" />
          <span className="font-mono text-[#4493f8] font-bold text-sm tracking-widest">{id}</span>
        </div>
        <div>
          <span className="text-white font-semibold text-base">{name}</span>
          {ageSex && (
            <span className="text-slate-400 text-xs ml-2">
              {ageSex}
              {location ? ` · ${location}` : ''}
            </span>
          )}
        </div>
        {program && <span className="text-slate-500 text-xs ml-auto">{program}</span>}
      </div>

      {/* Fail-closed notice */}
      <div className="rounded-xl border border-slate-700/60 bg-[#0f172a] px-6 py-12 flex flex-col items-center text-center gap-3">
        <div className="w-10 h-10 rounded-full border border-slate-600/50 flex items-center justify-center text-slate-500 text-lg">
          &#9677;
        </div>
        <p className="text-slate-200 text-sm font-semibold">
          Member-derived detail is not yet available for {name}
        </p>
        <p className="text-slate-500 text-xs max-w-md leading-relaxed">
          {view} has not been wired to this member&apos;s own record yet. To avoid showing another
          member&apos;s clinical or family data, no detail is displayed here. The identity above is
          confirmed for {id}.
        </p>
        <p className="text-slate-600 text-[11px] font-mono">
          scope-guard &middot; member-derived source pending
        </p>
      </div>
    </div>
  );
}
