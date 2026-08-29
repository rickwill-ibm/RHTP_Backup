'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useAppContext, PHYSICIAN_PROFILES } from '@/lib/appContext';
import type { PhysicianPersona } from '@/lib/appContext';
import { useFhirModeSync } from '@/lib/hooks/useFhirModeSync';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import { DEMO_USERS, navItems, groupOrder } from './AppLayout.nav';
import AppTopBarActions from '@/components/AppTopBarActions';

// ─── Authorship ────────────────────────────────────────────────────────────────
// Author: Richard Hennessy — TCOC Total Cost of Care Clinical Platform
// All rights reserved. Authorship is non-transferable and permanently attributed.
// ──────────────────────────────────────────────────────────────────────────────

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  contextBanner?: React.ReactNode;
}

export default function AppLayout({
  children,
  pageTitle,
  breadcrumbs,
  contextBanner,
}: AppLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [backupCollapsed, setBackupCollapsed] = useState(true);
  const [agenticCollapsed, setAgenticCollapsed] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const {
    user,
    setUser,
    entryContext,
    setEntryContext,
    physicianPersona,
    setPhysicianPersona,
    activePhysician,
    activePatientId,
    setActivePatientId,
  } = useAppContext();
  useFhirModeSync(); // keeps fhirClient singleton in sync with the UI toggle

  // Ref for nav container to enable scrollIntoView
  const navRef = useRef<HTMLElement>(null);

  // Auto-expand Backup and Agentic sections if active item is inside
  useEffect(() => {
    const normalizedPathname =
      pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;

    const activeItem = navItems.find((item) => {
      const normalizedHref =
        item.href.endsWith('/') && item.href !== '/' ? item.href.slice(0, -1) : item.href;
      return normalizedPathname === normalizedHref;
    });

    if (activeItem && activeItem.group === 'Backup' && backupCollapsed) {
      setBackupCollapsed(false);
    }

    if (activeItem && activeItem.group === 'Agentic_Orchestrate-Screens' && agenticCollapsed) {
      setAgenticCollapsed(false);
    }
  }, [pathname, backupCollapsed, agenticCollapsed]);

  // Scroll active menu item and its section into view on navigation
  useEffect(() => {
    // Skip on initial mount to avoid unwanted scrolling on page load
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }

    if (!navRef.current) return;

    // Delay to ensure DOM updates and Backup section expands if needed
    const timer = setTimeout(() => {
      const activeLink = navRef.current?.querySelector('.sidebar-item-active');
      if (activeLink) {
        // Find the section header (parent group div)
        const sectionDiv = activeLink.closest('div[class*="mb-4"]');
        const sectionHeader = sectionDiv?.querySelector('p, button');

        // Scroll section header to top for better context
        if (sectionHeader) {
          sectionHeader.scrollIntoView({
            behavior: 'smooth',
            block: 'start', // Scroll section to top
            inline: 'nearest',
          });
        } else {
          // Fallback: scroll active item into view
          activeLink.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [pathname, isInitialMount]);

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
        <div
          className={`flex items-center gap-3 px-4 py-4 border-b border-carbon-gray-80 min-h-[56px] ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <AppLogo size={28} />
          {!collapsed && (
            <div>
              <span className="font-semibold text-white text-sm tracking-tight">RHTP</span>
              <p className="text-2xs text-carbon-gray-30 leading-none">
                Rural Health Transformation
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto py-4 scrollbar-thin">
          {grouped.map(({ group, items }) =>
            items.length === 0 ? null : (
              <div key={`group-${group}`} className="mb-4">
                {!collapsed && (group === 'Backup' || group === 'Agentic_Orchestrate-Screens') ? (
                  <button
                    onClick={() =>
                      group === 'Backup'
                        ? setBackupCollapsed(!backupCollapsed)
                        : setAgenticCollapsed(!agenticCollapsed)
                    }
                    className="w-full flex items-center justify-between px-4 mb-1 text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest hover:text-carbon-gray-30 transition-colors"
                  >
                    <span>
                      {group === 'Agentic_Orchestrate-Screens' ? 'AGENTIC ORCHESTRATE' : group}
                    </span>
                    <Icon
                      name={
                        (group === 'Backup' ? backupCollapsed : agenticCollapsed)
                          ? 'ChevronRightIcon'
                          : 'ChevronDownIcon'
                      }
                      size={14}
                    />
                  </button>
                ) : !collapsed ? (
                  <p className="px-4 mb-1 text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest">
                    {group === 'Agentic_Orchestrate-Screens' ? 'AGENTIC ORCHESTRATE' : group}
                  </p>
                ) : null}
                {(group !== 'Backup' || !backupCollapsed) &&
                  (group !== 'Agentic_Orchestrate-Screens' || !agenticCollapsed) &&
                  items.map((item) => {
                    // Improved path matching with normalization
                    const normalizedPathname =
                      pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
                    // For the MD Smart Launch nav item, append the active patient's FHIR ID
                    // so the SMART App always launches with the patient currently selected
                    // in the RHTP patient switcher dropdown.
                    const resolvedHref =
                      item.key === 'nav-md-smart-launch'
                        ? `/md-smart-launch?patientId=${PLATFORM_TO_FHIR_ID_MAP[activePatientId] ?? activePatientId}`
                        : item.href;
                    const normalizedHref =
                      resolvedHref.split('?')[0].endsWith('/') && resolvedHref.split('?')[0] !== '/'
                        ? resolvedHref.split('?')[0].slice(0, -1)
                        : resolvedHref.split('?')[0];
                    const isActive = normalizedPathname === normalizedHref;

                    return (
                      <Link
                        key={item.key}
                        href={resolvedHref}
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
          {/* Physician persona switcher — Rick (PCP) vs Jon (Specialist) */}
          {!collapsed && (
            <div className="space-y-1.5">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-widest font-semibold px-1">
                Physician View
              </p>
              <div className="flex gap-1">
                {(
                  Object.values(
                    PHYSICIAN_PROFILES
                  ) as (typeof PHYSICIAN_PROFILES)[PhysicianPersona][]
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPhysicianPersona(p.id)}
                    style={physicianPersona === p.id ? { background: p.color } : {}}
                    className={`flex-1 text-2xs py-1.5 px-1.5 font-semibold transition-colors ${
                      physicianPersona === p.id
                        ? 'text-white'
                        : 'bg-carbon-gray-80 text-carbon-gray-30 hover:bg-carbon-gray-70'
                    }`}
                    title={`${p.displayName} — ${p.role}`}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
              <p className="text-2xs px-1" style={{ color: activePhysician.color }}>
                {activePhysician.displayName} · {activePhysician.role} · {activePhysician.specialty}
              </p>
            </div>
          )}

          {/* Role switcher */}
          {!collapsed && (
            <div className="space-y-1.5">
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-widest font-semibold px-1">
                Demo Role
              </p>
              <div className="flex gap-1">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => setUser(u)}
                    className={`flex-1 text-2xs py-1 px-1.5 font-medium transition-colors ${
                      user.userId === u.userId
                        ? 'bg-carbon-blue text-white'
                        : 'bg-carbon-gray-80 text-carbon-gray-30 hover:bg-carbon-gray-70'
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
          <div
            className={`flex items-center gap-2 px-2 py-2 mt-1 ${collapsed ? 'justify-center' : ''}`}
          >
            <div
              className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center flex-shrink-0`}
            >
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
                        <Link href={b.href} className="hover:text-carbon-blue">
                          {b.label}
                        </Link>
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
          <AppTopBarActions roleColor={roleColor} />
        </header>

        {/* Context banner */}
        {contextBanner && <div className="flex-shrink-0">{contextBanner}</div>}

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 py-6">{children}</div>
          {/* Immutable authorship attribution */}
          {/* © Richard Hennessy — Austin, Texas 78726. All rights reserved. TCOC Total Cost of Care Clinical Platform. */}
        </main>
      </div>
    </div>
  );
}
