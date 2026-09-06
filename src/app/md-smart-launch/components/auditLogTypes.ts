/**
 * Audit log type definitions, event config, and filter groups.
 * Extracted from AuditLogPanel.tsx to keep the component under the 400-line cap.
 */

export type AuditEventType =
  | 'smart-launch'
  | 'cds-card-viewed'
  | 'cds-card-dismissed'
  | 'cds-card-snoozed'
  | 'cds-card-acknowledged'
  | 'cds-suggestion-accepted'
  | 'order-added'
  | 'order-removed'
  | 'order-signed'
  | 'team-assignment-confirmed'
  | 'cerner-return-initiated'
  | 'patient-chart-viewed'
  | 'care-gap-closed'
  | 'condition-added'
  | 'allergy-added'
  | 'medication-added';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  timestamp: string;
  userId: string;
  userName: string;
  patientId: string;
  encounterId: string;
  action: string;
  details: Record<string, string | number | boolean | undefined>;
  outcome: 'success' | 'failure' | 'info';
}

export const EVENT_CONFIG: Record<
  AuditEventType,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  'smart-launch': {
    label: 'SMART Launch',
    icon: 'BoltIcon',
    color: 'text-[#6929c4]',
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#d4bbff]',
  },
  'cds-card-viewed': {
    label: 'CDS Card Viewed',
    icon: 'EyeIcon',
    color: 'text-[#0043ce]',
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
  },
  'cds-card-dismissed': {
    label: 'CDS Card Dismissed',
    icon: 'XMarkIcon',
    color: 'text-carbon-gray-70',
    bg: 'bg-carbon-gray-10',
    border: 'border-carbon-gray-20',
  },
  'cds-card-snoozed': {
    label: 'CDS Card Snoozed',
    icon: 'ClockIcon',
    color: 'text-[#b45309]',
    bg: 'bg-[#fdf6dd]',
    border: 'border-[#f1c21b]',
  },
  'cds-card-acknowledged': {
    label: 'CDS Critical Acknowledged',
    icon: 'ShieldExclamationIcon',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#ffb3b8]',
  },
  'cds-suggestion-accepted': {
    label: 'CDS Suggestion Accepted',
    icon: 'CheckCircleIcon',
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
  },
  'order-added': {
    label: 'Order Added',
    icon: 'PlusCircleIcon',
    color: 'text-[#0043ce]',
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
  },
  'order-removed': {
    label: 'Order Removed',
    icon: 'TrashIcon',
    color: 'text-carbon-gray-70',
    bg: 'bg-carbon-gray-10',
    border: 'border-carbon-gray-20',
  },
  'order-signed': {
    label: 'Orders Signed',
    icon: 'ClipboardDocumentCheckIcon',
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
  },
  'team-assignment-confirmed': {
    label: 'Team Assignment Confirmed',
    icon: 'UserGroupIcon',
    color: 'text-[#6929c4]',
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#d4bbff]',
  },
  'cerner-return-initiated': {
    label: 'Return to Cerner',
    icon: 'ArrowRightOnRectangleIcon',
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
  },
  'patient-chart-viewed': {
    label: 'Chart Reviewed',
    icon: 'EyeIcon',
    color: 'text-[#0043ce]',
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
  },
  'care-gap-closed': {
    label: 'Care Gap Addressed',
    icon: 'CheckCircleIcon',
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
  },
  'condition-added': {
    label: 'Problem Added',
    icon: 'PlusCircleIcon',
    color: 'text-[#6929c4]',
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#d4bbff]',
  },
  'allergy-added': {
    label: 'Allergy Recorded',
    icon: 'ShieldExclamationIcon',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#ffb3b8]',
  },
  'medication-added': {
    label: 'Medication Added',
    icon: 'ClipboardDocumentCheckIcon',
    color: 'text-[#0043ce]',
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
  },
};

export const OUTCOME_CONFIG = {
  success: { label: 'Success', color: 'text-[#0e6027]', bg: 'bg-[#defbe6]' },
  failure: { label: 'Failure', color: 'text-[#da1e28]', bg: 'bg-[#fff1f1]' },
  info: { label: 'Info', color: 'text-[#0043ce]', bg: 'bg-[#edf5ff]' },
};

export type FilterType = 'all' | AuditEventType;

export const FILTER_GROUPS: Array<{ label: string; value: FilterType }> = [
  { label: 'All Events', value: 'all' },
  { label: 'SMART Launch', value: 'smart-launch' },
  { label: 'CDS Interactions', value: 'cds-card-acknowledged' },
  { label: 'Orders', value: 'order-signed' },
  { label: 'Team', value: 'team-assignment-confirmed' },
];

export function isCdsEvent(type: AuditEventType): boolean {
  return type.startsWith('cds-');
}

export function isOrderEvent(type: AuditEventType): boolean {
  return type.startsWith('order-');
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
