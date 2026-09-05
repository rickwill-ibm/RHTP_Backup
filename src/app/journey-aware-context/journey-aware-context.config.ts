// journey-aware-context.config.ts — presentation-only outcome/type configs extracted
// from the page render layer (AI-CODING-CONVENTIONS §3: move additions into a module).

// Outcome / type configs (presentation-only — kept as module-level constants)
export type OutcomeType =
  'engaged' | 'ignored' | 'suppressed' | 'converted' | 'no_answer' | 'consent_check';
export type InteractionType =
  'outreach' | 'response' | 'escalation' | 'session' | 'inbound' | 'outbound' | 'visit';

export const OUTCOME_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  engaged: { color: '#84CC16', bg: '#84CC1633', label: 'Engaged' },
  converted: { color: '#a78bfa', bg: '#a78bfa33', label: 'Converted' },
  ignored: { color: '#94a3b8', bg: '#94a3b833', label: 'Ignored' },
  suppressed: { color: '#EF4444', bg: '#EF444433', label: 'Suppressed' },
  no_answer: { color: '#F59E0B', bg: '#F59E0B33', label: 'No Answer' },
  consent_check: { color: '#F59E0B', bg: '#F59E0B33', label: 'Consent Check' },
};

export const TYPE_CONFIG: Record<string, { label: string }> = {
  outreach: { label: 'Outreach' },
  response: { label: 'Response' },
  escalation: { label: 'Escalation' },
  session: { label: 'Session' },
  inbound: { label: 'Inbound' },
  outbound: { label: 'Outbound' },
  visit: { label: 'Visit' },
};
