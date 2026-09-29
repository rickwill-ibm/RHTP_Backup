/**
 * EditorialShell (consulting-grade design system, shared with the designed HTML mocks).
 *
 * Wraps a reviewer screen's content in the SAME editorial visual language as the approved
 * golden_thread_recovery / gain_share_modeler experiences: the Fraunces display serif, the
 * IBM-Plex-Mono eyebrow, a navy gradient banner header with an optional "mock for approval"
 * pill, and the shared-ledger palette. Scoped under `.ed` so it never leaks into the rest of
 * the Carbon app. Server component (no hooks) — pure presentation.
 */

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const SCOPED_CSS = `
.ed h1,.ed h2,.ed h3{font-family:'Fraunces',Georgia,'Times New Roman',serif;letter-spacing:-.01em;font-weight:600}
.ed .eyebrow{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,monospace}
.ed .mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,monospace;font-variant-numeric:tabular-nums}
.ed .num{font-family:'Fraunces',Georgia,serif;font-variant-numeric:tabular-nums}
.ed .ed-card{background:#fff;border:1px solid #dbe3ea;border-radius:14px;box-shadow:0 1px 2px rgba(16,33,43,.05),0 10px 28px -18px rgba(16,33,43,.22)}
`;

export function EditorialShell({
  eyebrow,
  title,
  subtitle,
  badge,
  wideSubtitle = false,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  badge?: string;
  /** When true, the subtitle spans the full banner width instead of the default reading measure. */
  wideSubtitle?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ed h-full overflow-y-auto" style={{ background: '#f6f8fa' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONT_LINK} />
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      <header
        className="px-6 py-6 text-white sm:px-8"
        style={{ background: 'linear-gradient(135deg,#00243f,#004a80)' }}
      >
        <p
          className="eyebrow text-[11px] font-semibold uppercase"
          style={{ letterSpacing: '.14em', color: '#9fc2e0' }}
        >
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-[26px]">{title}</h1>
        {subtitle ? (
          <p
            className={`mt-2 text-sm ${wideSubtitle ? 'max-w-none' : 'max-w-3xl'}`}
            style={{ color: '#d6e4f2', lineHeight: 1.55 }}
          >
            {subtitle}
          </p>
        ) : null}
        {badge ? (
          <span
            className="mt-3 inline-block rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              border: '1px solid rgba(255,255,255,.28)',
              background: 'rgba(255,255,255,.12)',
              color: '#eaf2fb',
            }}
          >
            {badge}
          </span>
        ) : null}
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 sm:px-8">{children}</div>
    </div>
  );
}
