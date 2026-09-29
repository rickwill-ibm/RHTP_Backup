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
  /**
   * Shell theme. `dark` is the uhg-orchestrate shell (the original three callers);
   * `light` is the Carbon shell that patient-detail uses. Without this the guard is a
   * dark panel inside a light page, which reads as a rendering bug — and a guard that
   * looks broken is a guard someone "fixes" back.
   */
  theme?: 'dark' | 'light';
  ageSex?: string;
  location?: string;
  program?: string;
  /** Human name of the screen, used in the message. */
  view?: string;
}

export default function MemberScopeNotice({
  name,
  id,
  theme = 'dark',
  ageSex,
  location,
  program,
  view = 'This view',
}: Props) {
  const t =
    theme === 'light'
      ? {
          page: 'min-h-[60vh] bg-[#f4f4f4] text-[#161616] p-4 space-y-4 font-sans',
          card: 'rounded border border-[#e0e0e0] bg-white',
          id: 'font-mono text-[#0f62fe] font-bold text-sm tracking-widest',
          dot: 'w-2 h-2 rounded-full bg-[#0f62fe]',
          name: 'text-[#161616] font-semibold text-base',
          meta: 'text-[#525252] text-xs ml-2',
          prog: 'text-[#6f6f6f] text-xs ml-auto',
          ring: 'w-10 h-10 rounded-full border border-[#c6c6c6] flex items-center justify-center text-[#8d8d8d] text-lg',
          lead: 'text-[#161616] text-sm font-semibold',
          body: 'text-[#525252] text-xs max-w-md leading-relaxed',
          foot: 'text-[#8d8d8d] text-[11px] font-mono',
        }
      : {
          page: 'min-h-[60vh] bg-[#0a0f1e] text-white p-4 space-y-4 font-sans',
          card: 'rounded-xl border border-slate-700/60 bg-[#0f172a]',
          id: 'font-mono text-[#4493f8] font-bold text-sm tracking-widest',
          dot: 'w-2 h-2 rounded-full bg-[#4493f8]',
          name: 'text-white font-semibold text-base',
          meta: 'text-slate-400 text-xs ml-2',
          prog: 'text-slate-500 text-xs ml-auto',
          ring: 'w-10 h-10 rounded-full border border-slate-600/50 flex items-center justify-center text-slate-500 text-lg',
          lead: 'text-slate-200 text-sm font-semibold',
          body: 'text-slate-500 text-xs max-w-md leading-relaxed',
          foot: 'text-slate-600 text-[11px] font-mono',
        };

  return (
    <div className={t.page}>
      {/* Correct member identity — never another member's */}
      <div className={`${t.card} px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2`}>
        <div className="flex items-center gap-2">
          <div className={t.dot} />
          <span className={t.id}>{id}</span>
        </div>
        <div>
          <span className={t.name}>{name}</span>
          {ageSex && (
            <span className={t.meta}>
              {ageSex}
              {location ? ` · ${location}` : ''}
            </span>
          )}
        </div>
        {program && <span className={t.prog}>{program}</span>}
      </div>

      {/* Fail-closed notice */}
      <div className={`${t.card} px-6 py-12 flex flex-col items-center text-center gap-3`}>
        <div className={t.ring}>&#9677;</div>
        <p className={t.lead}>Member-derived detail is not yet available for {name}</p>
        <p className={t.body}>
          {view} has not been wired to this member&apos;s own record yet. To avoid showing another
          member&apos;s clinical or family data, no detail is displayed here. The identity above is
          confirmed for {id}.
        </p>
        <p className={t.foot}>scope-guard &middot; member-derived source pending</p>
      </div>
    </div>
  );
}
