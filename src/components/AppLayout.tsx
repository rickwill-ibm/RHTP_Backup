'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useAppContext } from '@/lib/appContext';
import type { UserSession } from '@/lib/appContext';
import DemoNavigator from '@/components/DemoNavigator';

// ─── Authorship ────────────────────────────────────────────────────────────────
// Author: Richard Hennessy — TCOC Total Cost of Care Clinical Platform
// All rights reserved. Authorship is non-transferable and permanently attributed.
// ──────────────────────────────────────────────────────────────────────────────

const DEMO_USERS: UserSession[] = [
  { userId: 'user-001', name: 'Sarah Johnson', initials: 'SJ', role: 'care_manager', email: 'sarah.johnson@rhtp-health.org' },
  { userId: 'user-002', name: 'Dr. James Whitfield', initials: 'JW', role: 'physician', email: 'james.whitfield@tcoc-health.org' },
];

interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  group?: string;
}

const navItems: NavItem[] = [
  // RHTP Program
  { key: 'nav-contracts', label: 'RHTP Overview', icon: 'BuildingOffice2Icon', href: '/contract-program-selection', group: 'RHTP Program' },
  { key: 'nav-regions', label: 'Regions', icon: 'MapPinIcon', href: '/region-view', group: 'RHTP Program' },
  { key: 'nav-providers', label: 'Program Networks', icon: 'BuildingOffice2Icon', href: '/provider-level', group: 'RHTP Program' },
  { key: 'nav-panel', label: 'Panel & Cohort', icon: 'UserGroupIcon', href: '/panel-cohort-view', badge: 38, group: 'RHTP Program' },
  { key: 'nav-stars', label: 'Care Manager Attribution', icon: 'StarIcon', href: '/stars-hedis-mips', group: 'RHTP Program' },
  { key: 'nav-social-dashboard-rhtp', label: 'Social Needs Dashboard', icon: 'ChartBarIcon', href: '/social-needs-dashboard', group: 'RHTP Program' },
  { key: 'nav-outcomes-linkage-rhtp', label: 'Outcomes Linkage', icon: 'ArrowTrendingDownIcon', href: '/outcomes-linkage', group: 'RHTP Program' },
  // Care Team Workflows
  { key: 'nav-care-team-inbox', label: 'Care Team Inbox', icon: 'InboxIcon', href: '/care-team-inbox', badge: 5, group: 'Care Team Workflows' },
  { key: 'nav-care-manager', label: 'Care Manager Dashboard', icon: 'ClipboardDocumentListIcon', href: '/care-manager', group: 'Care Team Workflows' },
  { key: 'nav-chw-workflow', label: 'CHW Workflow', icon: 'UserIcon', href: '/chw-workflow', group: 'Care Team Workflows' },
  { key: 'nav-specialist-inbox', label: 'Specialist Inbox', icon: 'EnvelopeIcon', href: '/specialist-inbox', group: 'Care Team Workflows' },
  // ⚠️  DO NOT CHANGE THIS ROUTE — /md-smart-launch serves the Cerner PowerChart
  // MD SmartApp (SMART on FHIR). Source: src/app/md-smart-launch/ + components/cerner/.
  // Backed up in GitHub RHTP_Backup branch: Cerner-MDSmartApp-090326.
  { key: 'nav-md-smart-launch', label: 'MD Smart Launch', icon: 'BoltIcon', href: '/md-smart-launch', group: 'Care Team Workflows' },
  // Whole Person Care
  { key: 'nav-whole-person-graph', label: 'Whole Person Care View', icon: 'CircleStackIcon', href: '/whole-person-care-summary', group: 'Whole Person Care' },
  { key: 'nav-patient', label: 'Citizen Detail', icon: 'UserIcon', href: '/patient-detail', group: 'Whole Person Care' },
  { key: 'nav-social-screening', label: 'Social Needs Screening', icon: 'ClipboardDocumentCheckIcon', href: '/social-needs-screening', group: 'Whole Person Care' },
  { key: 'nav-physicians', label: 'Care Team Members', icon: 'UserGroupIcon', href: '/physician-view', group: 'Whole Person Care' },
  { key: 'nav-program-eligibility', label: 'Program Eligibility', icon: 'CheckBadgeIcon', href: '/program-eligibility', group: 'Whole Person Care' },
  { key: 'nav-cbo-directory', label: 'CBO Directory', icon: 'BuildingStorefrontIcon', href: '/cbo-directory', group: 'Whole Person Care' },
  // Episodes & Quality
  { key: 'nav-episodic-management', label: 'Episodic Management Analytics', icon: 'ChartBarIcon', href: '/episodic-management-analytics', group: 'Episodes & Quality' },
  { key: 'nav-care-gap-closure', label: 'Care Gap Closure', icon: 'CheckCircleIcon', href: '/care-gap-closure-verification', group: 'Episodes & Quality' },
  // Analytics & Outcomes
  { key: 'nav-exec-dashboard', label: 'Executive Dashboard', icon: 'ChartBarIcon', href: '/executive-outcomes-dashboard', group: 'Analytics & Outcomes' },
  // Network
  { key: 'nav-referrals', label: 'Referral Tracking', icon: 'ArrowsRightLeftIcon', href: '/referral-tracking', group: 'Network' },
  // CDP & Agentic Automation
  { key: 'nav-cdp-assembly-new', label: 'CDP Assembly', icon: 'CircleStackIcon', href: '/cdp-assembly', group: 'CDP & Agentic Automation' },
  { key: 'nav-journey-aware-context', label: 'Journey-Aware Context', icon: 'MapIcon', href: '/journey-aware-context', group: 'CDP & Agentic Automation' },
  { key: 'nav-whole-person-intelligence', label: 'Whole Person Intelligence', icon: 'SparklesIcon', href: '/whole-person-intelligence', group: 'CDP & Agentic Automation' },
  { key: 'nav-signal-disposition-engine', label: 'Signal Disposition Engine', icon: 'BoltIcon', href: '/signal-disposition-engine', group: 'CDP & Agentic Automation' },

  { key: 'uhg-fragmentation', label: 'One Enterprise · Five Entities', icon: 'BuildingOffice2Icon', href: '/uhg-orchestrate/fragmentation-split-system-view', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-cdp-assembly', label: 'CDP Assembly', icon: 'CircleStackIcon', href: '/uhg-orchestrate/cdp-assembly-split', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-journey-aware', label: 'Journey-Aware Context', icon: 'MapIcon', href: '/uhg-orchestrate/consumer-360', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-whole-person', label: 'Whole Person Care Intelligence', icon: 'SparklesIcon', href: '/uhg-orchestrate/whole-person-care', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-signal-disposition', label: 'Signal Disposition Engine', icon: 'BoltIcon', href: '/uhg-orchestrate/signal-disposition-engine', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-super-orchestration', label: 'Agentic Super Orchestration', icon: 'CpuChipIcon', href: '/uhg-orchestrate/controller-agentic-super-orchestration-centerpiece', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-super-agent', label: 'Agentic Super Agent', icon: 'CpuChipIcon', href: '/uhg-orchestrate/agent-library', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-family-thread', label: 'Family Thread — Dependents', icon: 'HomeIcon', href: '/uhg-orchestrate/family-sofia', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-caregiver', label: 'Caregiver Intelligence — Elena', icon: 'UserIcon', href: '/uhg-orchestrate/caregiver-elena', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-agent-impact', label: 'Agent Impact Dashboard', icon: 'ChartBarIcon', href: '/uhg-orchestrate/agent-impact-dashboard', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-reporting', label: 'Agent Impact — Reporting', icon: 'ChartBarIcon', href: '/uhg-orchestrate/reporting-dashboard', group: 'UHG-Orchestrate-Screens' },
  { key: 'uhg-population-filter', label: 'Live Population Filter', icon: 'UserGroupIcon', href: '/uhg-orchestrate/portfolio-scale', group: 'UHG-Orchestrate-Screens' },
  // System
  { key: 'nav-settings', label: 'EHR Settings', icon: 'Cog6ToothIcon', href: '/settings', group: 'System' },
  { key: 'nav-fhir-tester', label: 'FHIR API Tester', icon: 'BeakerIcon', href: '/settings/fhir-tester', group: 'System' },
  { key: 'nav-demo-onboarding', label: 'Demo Onboarding', icon: 'PlayCircleIcon', href: '/demo-onboarding', group: 'System' },
  { key: 'nav-demo-deck', label: 'Demo Deck (PDF)', icon: 'DocumentArrowDownIcon', href: '/demo-deck', group: 'System' },
  // Backup
  { key: 'nav-cdp-assembly', label: 'CDP Assembly View', icon: 'CircleStackIcon', href: '/cdp-assembly-view', group: 'Backup' },
  { key: 'nav-consent-sovereignty', label: 'Consent & Sovereignty Panel', icon: 'ShieldCheckIcon', href: '/consent-sovereignty-panel', group: 'Backup' },
  { key: 'nav-household-view', label: 'Household View', icon: 'HomeIcon', href: '/household-view', group: 'Backup' },
  { key: 'nav-agent-coalition', label: 'Agent Coalition Monitor', icon: 'CpuChipIcon', href: '/agent-coalition-monitor', group: 'Backup' },
  { key: 'nav-episode-detail', label: 'Episode Detail', icon: 'FolderOpenIcon', href: '/episode-detail', group: 'Backup' },
  { key: 'nav-financial', label: 'Financial Dashboard', icon: 'CurrencyDollarIcon', href: '/financial-dashboard', group: 'Backup' },
  { key: 'nav-provider-dir', label: 'Provider Directory', icon: 'BuildingOffice2Icon', href: '/provider-selection', group: 'Backup' },
  { key: 'nav-journey', label: 'Referral Journey Tracker', icon: 'MapIcon', href: '/referral-journey-tracker', group: 'Backup' },
  { key: 'nav-submitted-referrals', label: 'Submitted Referrals', icon: 'ClipboardDocumentListIcon', href: '/submitted-referrals', group: 'Backup' },
  { key: 'nav-benefit-enrollment', label: 'Benefit Enrollment Tracker', icon: 'DocumentCheckIcon', href: '/benefit-enrollment', group: 'Backup' },
  { key: 'nav-patient-episode-summary', label: 'Patient Episode Summary', icon: 'DocumentTextIcon', href: '/patient-episode-summary', group: 'Backup' },
];

const groupOrder = ['RHTP Program', 'Care Team Workflows', 'Whole Person Care', 'Episodes & Quality', 'Analytics & Outcomes', 'Network', 'CDP & Agentic Automation', 'UHG-Orchestrate-Screens', 'System', 'Backup'];

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  contextBanner?: React.ReactNode;
}

export default function AppLayout({ children, pageTitle, breadcrumbs, contextBanner }: AppLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, setUser, entryContext, setEntryContext } = useAppContext();

  const grouped = groupOrder.map((g) => ({
    group: g,
    items: navItems.filter((n) => n.group === g),
  }));

  const roleColor = user.role === 'physician' ? 'bg-[#6929c4]' : 'bg-carbon-blue';
  const roleLabel = user.role === 'physician' ? 'Physician' : 'Care Mgr';

  return (
    <div className="flex h-screen overflow-hidden bg-carbon-gray-10">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${collapsed ? 'w-16' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:relative inset-y-0 left-0 z-50
          bg-carbon-sidebar flex flex-col flex-shrink-0
          transition-all duration-300 ease-in-out
        `}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-4 border-b border-carbon-gray-80 min-h-[56px] ${collapsed ? 'justify-center px-2' : ''}`}>
          <AppLogo size={28} />
          {!collapsed && (
            <div>
              <span className="font-semibold text-white text-sm tracking-tight">RHTP</span>
              <p className="text-2xs text-carbon-gray-30 leading-none">Rural Health Transformation</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-4 scrollbar-thin">
          {grouped.map(({ group, items }) =>
            items.length === 0 ? null : (
              <div key={`group-${group}`} className="mb-4">
                {!collapsed && (
                  <p className="px-4 mb-1 text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest">
                    {group}
                  </p>
                )}
                {items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      title={item.label}
                      className={`
                        flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 text-sm font-medium
                        transition-colors duration-150 relative group
                        ${isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}
                        ${collapsed ? 'justify-center px-2' : ''}
                      `}
                    >
                      <Icon name={item.icon as any} size={18} />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {!collapsed && item.badge && item.badge > 0 ? (
                        <span className="bg-carbon-red text-white text-2xs font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                          {item.badge}
                        </span>
                      ) : null}
                      {collapsed && item.badge && item.badge > 0 ? (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-carbon-red rounded-full" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )
          )}
        </nav>

        {/* Bottom — role/context switcher + user */}
        <div className="border-t border-carbon-gray-80 p-3 space-y-2">
          {/* Role switcher */}
          {!collapsed && (
            <div className="space-y-1.5">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-widest font-semibold px-1">Demo Role</p>
              <div className="flex gap-1">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => setUser(u)}
                    className={`flex-1 text-2xs py-1 px-1.5 font-medium transition-colors ${
                      user.userId === u.userId
                        ? 'bg-carbon-blue text-white' :'bg-carbon-gray-80 text-carbon-gray-30 hover:bg-carbon-gray-70'
                    }`}
                    title={u.email}
                  >
                    {u.role === 'physician' ? 'MD' : 'CM'}
                  </button>
                ))}
              </div>
              {/* Entry context switcher */}
              <div className="flex gap-1">
                {(['browse', 'cerner-launch'] as const).map((ctx) => (
                  <button
                    key={ctx}
                    onClick={() => setEntryContext(ctx)}
                    className={`flex-1 text-2xs py-1 px-1.5 font-medium transition-colors ${
                      entryContext === ctx
                        ? 'bg-[#6929c4] text-white'
                        : 'bg-carbon-gray-80 text-carbon-gray-30 hover:bg-carbon-gray-70'
                    }`}
                  >
                    {ctx === 'cerner-launch' ? 'Cerner' : 'Browse'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex items-center gap-2 w-full px-2 py-2 text-carbon-gray-30 hover:text-white hover:bg-carbon-gray-80 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'} size={16} />
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
          <div className={`flex items-center gap-2 px-2 py-2 mt-1 ${collapsed ? 'justify-center' : ''}`}>
            <div className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white text-xs font-semibold">{user.initials}</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.name}</p>
                <p className="text-2xs text-carbon-gray-50 truncate">{roleLabel}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-carbon-gray-20 px-6 py-0 flex items-center justify-between h-14 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-1 text-carbon-gray-70 hover:text-carbon-gray-100"
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="Bars3Icon" size={20} />
            </button>
            <div>
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className="flex items-center gap-1 text-xs text-carbon-gray-50 mb-0.5">
                  {breadcrumbs.map((b, i) => (
                    <React.Fragment key={`bc-${i}`}>
                      {i > 0 && <span>/</span>}
                      {b.href ? (
                        <Link href={b.href} className="hover:text-carbon-blue">{b.label}</Link>
                      ) : (
                        <span className="text-carbon-gray-70">{b.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              )}
              {pageTitle && (
                <h1 className="text-base font-semibold text-carbon-gray-100">{pageTitle}</h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Role + context indicator */}
            <div className="hidden md:flex items-center gap-1.5 mr-2">
              <span className={`text-2xs font-semibold px-2 py-1 ${user.role === 'physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}>
                {user.role === 'physician' ? 'Physician' : 'Care Manager'}
              </span>
              <span className={`text-2xs font-medium px-2 py-1 ${entryContext === 'cerner-launch' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-carbon-gray-10 text-carbon-gray-50'}`}>
                {entryContext === 'cerner-launch' ? '⚡ Cerner' : 'Browse'}
              </span>
            </div>
            <button className="p-2 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors relative">
              <Icon name="BellIcon" size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-carbon-red rounded-full" />
            </button>
            <button className="p-2 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors">
              <Icon name="QuestionMarkCircleIcon" size={18} />
            </button>
            <div className="w-px h-6 bg-carbon-gray-20 mx-1" />
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center`}>
                <span className="text-white text-xs font-semibold">{user.initials}</span>
              </div>
              <span className="text-carbon-gray-70 text-xs hidden md:block">{user.name}</span>
            </div>
          </div>
        </header>

        {/* Context banner */}
        {contextBanner && (
          <div className="flex-shrink-0">{contextBanner}</div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 py-6">
            {children}
          </div>
          {/* Immutable authorship attribution */}
          {/* © Richard Hennessy — Austin, Texas 78726. All rights reserved. TCOC Total Cost of Care Clinical Platform. */}
        </main>
      </div>
      {/* Floating Demo Navigator — visible on all screens */}
      <DemoNavigator />
    </div>
  );
}