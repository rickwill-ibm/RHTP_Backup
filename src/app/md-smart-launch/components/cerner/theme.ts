/**
 * Cerner PowerChart visual language tokens.
 * Conventions only (colors, chrome, density) — no Oracle Health assets.
 */
export const cerner = {
  // Chrome
  bannerBg: '#2d4a63', // top patient banner
  bannerBg2: '#3a5a77', // banner second row
  menuBg: '#eef1f4', // left Menu background
  menuActiveBg: '#ffffff',
  menuActiveBorder: '#2d4a63',
  componentHeaderBg: '#4b6a87', // MPage component header bars
  componentHeaderText: '#ffffff',
  pageBg: '#dfe4e8', // workspace background behind components
  cardBg: '#ffffff',
  border: '#b7c1ca',

  // Text
  text: '#1a1a1a',
  textMuted: '#5b6770',
  link: '#00539b',

  // Clinical semantics
  allergyRed: '#b30000',
  criticalRed: '#c8102e',
  criticalRowBg: '#fdecea',
  highRed: '#c8102e',
  lowBlue: '#0057b8',
  abnormalAmber: '#b45309',
  pendingAmber: '#b45309',
  normalGreen: '#1e7e34',
  flagChipBg: '#fff4e5',
  flagChipBorder: '#e8a33d',
  flagChipText: '#8a5300',
} as const;

/** Map Observation.interpretation code → chip classes (Tailwind arbitrary values). */
export function interpChip(code?: string): { label: string; cls: string } | null {
  switch (code) {
    case 'H':
    case 'HH':
      return { label: code, cls: 'bg-[#fdecea] text-[#c8102e] border border-[#c8102e] font-bold' };
    case 'L':
    case 'LL':
      return { label: code, cls: 'bg-[#e8f0fb] text-[#0057b8] border border-[#0057b8] font-bold' };
    case 'A':
      return { label: 'A', cls: 'bg-[#fff4e5] text-[#b45309] border border-[#b45309] font-bold' };
    case 'C':
      return { label: 'C', cls: 'bg-[#c8102e] text-white border border-[#c8102e] font-bold' };
    default:
      return null;
  }
}

/** Med / order status → Cerner text convention classes. */
export function statusTextCls(status?: string): string {
  switch (status) {
    case 'active':
    case 'in-progress':
    case 'current':
      return 'text-[#1a1a1a]';
    case 'draft':
    case 'pending':
    case 'scheduled':
    case 'not-started':
      return 'italic text-[#b45309]';
    case 'stopped':
    case 'cancelled':
    case 'revoked':
    case 'completed':
    case 'finished':
      return 'text-[#5b6770]';
    case 'entered-in-error':
      return 'line-through text-[#5b6770]';
    default:
      return 'text-[#1a1a1a]';
  }
}
