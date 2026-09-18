/**
 * Admin Console — Role & Permission Matrix
 * Author: Richard Hennessy — IBM RHTP Team
 *
 * 5 admin roles × 8 sections.
 * Default-deny: anything not listed = 'none'.
 */

export type AdminRole =
  'platform_admin' | 'data_engineer' | 'security_compliance' | 'support_analyst' | 'auditor';

export type AdminSection =
  | 'home'
  | 'data-connections'
  | 'consent-governance'
  | 'system-health'
  | 'agent-oversight'
  | 'identity-access'
  | 'data-quality'
  | 'audit-compliance';

export type Permission = 'none' | 'view' | 'edit' | 'full';

export const ROLE_PERMISSIONS: Record<AdminRole, Record<AdminSection, Permission>> = {
  platform_admin: {
    home: 'full',
    'data-connections': 'full',
    'consent-governance': 'full',
    'system-health': 'full',
    'agent-oversight': 'full',
    'identity-access': 'full',
    'data-quality': 'full',
    'audit-compliance': 'full',
  },
  data_engineer: {
    home: 'view',
    'data-connections': 'full',
    'consent-governance': 'view',
    'system-health': 'view',
    'agent-oversight': 'view',
    'identity-access': 'none',
    'data-quality': 'full',
    'audit-compliance': 'view',
  },
  security_compliance: {
    home: 'view',
    'data-connections': 'view',
    'consent-governance': 'full',
    'system-health': 'view',
    'agent-oversight': 'full',
    'identity-access': 'full',
    'data-quality': 'view',
    'audit-compliance': 'full',
  },
  support_analyst: {
    home: 'view',
    'data-connections': 'edit',
    'consent-governance': 'none',
    'system-health': 'view',
    'agent-oversight': 'none',
    'identity-access': 'none',
    'data-quality': 'none',
    'audit-compliance': 'none',
  },
  auditor: {
    home: 'none',
    'data-connections': 'none',
    'consent-governance': 'view',
    'system-health': 'none',
    'agent-oversight': 'view',
    'identity-access': 'view',
    'data-quality': 'none',
    'audit-compliance': 'full',
  },
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  platform_admin: 'Platform Admin',
  data_engineer: 'Data / Integration Engineer',
  security_compliance: 'Security & Compliance',
  support_analyst: 'Support Analyst',
  auditor: 'Auditor',
};

export const ADMIN_ROLE_COLORS: Record<AdminRole, { bg: string; text: string }> = {
  platform_admin: { bg: '#d0e2ff', text: '#0043ce' },
  data_engineer: { bg: '#defbe6', text: '#0e6027' },
  security_compliance: { bg: '#f6f2ff', text: '#6929c4' },
  support_analyst: { bg: '#fff1e0', text: '#8a3800' },
  auditor: { bg: '#e5f6ff', text: '#0050a0' },
};

/** Returns the permission level for a given role + section. */
export function getPermission(role: AdminRole, section: AdminSection): Permission {
  return ROLE_PERMISSIONS[role]?.[section] ?? 'none';
}

/** True if the role can see the section at all. */
export function canView(role: AdminRole, section: AdminSection): boolean {
  const p = getPermission(role, section);
  return p === 'view' || p === 'edit' || p === 'full';
}

/** True if the role can perform write/action operations in the section. */
export function canEdit(role: AdminRole, section: AdminSection): boolean {
  const p = getPermission(role, section);
  return p === 'edit' || p === 'full';
}

/** True if the role has full control (all actions including destructive). */
export function canFull(role: AdminRole, section: AdminSection): boolean {
  return getPermission(role, section) === 'full';
}

/** The default demo admin role — Platform Admin sees everything. */
export const DEFAULT_ADMIN_ROLE: AdminRole = 'platform_admin';
