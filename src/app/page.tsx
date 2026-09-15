'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

// ─── Authorship ────────────────────────────────────────────────────────────────
// Author: Richard Hennessy
// Application: TCOC — Total Cost of Care Clinical Platform
// All rights reserved. Authorship is non-transferable and permanently attributed.
// ──────────────────────────────────────────────────────────────────────────────

interface DemoRoute {
  path: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

const DEMO_ROUTES: DemoRoute[] = [
  {
    path: '/demo-deck',
    title: 'Demo Deck Navigator',
    description: 'Guided demo presentation with persona-based workflows',
    category: 'Demo Tools',
    icon: 'presentation-chart-bar',
  },
  {
    path: '/contract-program-selection',
    title: 'RHTP Program Overview',
    description: 'State Medicaid executive view of Rural Health Transformation Program',
    category: 'Executive',
    icon: 'chart-bar',
  },
  {
    path: '/panel-cohort-view',
    title: 'Patient Panel & Cohorts',
    description: 'Care manager view of assigned patient panels',
    category: 'Care Management',
    icon: 'users',
  },
  {
    path: '/patient-detail',
    title: 'Patient Detail View',
    description: 'Comprehensive patient record with whole-person context',
    category: 'Care Management',
    icon: 'user',
  },
  {
    path: '/md-smart-launch',
    title: 'SMART on FHIR Launch',
    description: 'EHR-integrated physician workflow with CDS Hooks',
    category: 'Clinical',
    icon: 'clipboard-document-check',
  },
  {
    path: '/care-gap-closure-verification',
    title: 'Care Gap Closure',
    description: 'Quality measure gap identification and closure workflow',
    category: 'Quality',
    icon: 'check-circle',
  },
  {
    path: '/financial-dashboard',
    title: 'Financial Dashboard',
    description: 'PMPM trends, RAF scores, and cost envelope analysis',
    category: 'Financial',
    icon: 'currency-dollar',
  },
  {
    path: '/social-needs-dashboard',
    title: 'Social Needs Dashboard',
    description: 'SDOH screening and community resource coordination',
    category: 'Social',
    icon: 'home',
  },
  {
    path: '/whole-person-care-summary',
    title: 'Whole Person Care',
    description: 'Integrated clinical, behavioral, and social context',
    category: 'Care Management',
    icon: 'heart',
  },
  {
    path: '/stars-hedis-mips',
    title: 'STARS/HEDIS/MIPS',
    description: 'Quality measure tracking and payment adjustment workflows',
    category: 'Quality',
    icon: 'star',
  },
];

const CATEGORIES = [
  'Demo Tools',
  'Executive',
  'Care Management',
  'Clinical',
  'Quality',
  'Financial',
  'Social',
];

export default function HomePage() {
  const router = useRouter();

  const groupedRoutes = CATEGORIES.map((category) => ({
    category,
    routes: DEMO_ROUTES.filter((route) => route.category === category),
  })).filter((group) => group.routes.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center">
              <Icon name="squares-2x2" className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TCOC Platform</h1>
              <p className="text-sm text-gray-600 mt-1">
                Total Cost of Care Clinical Platform — Demo Navigator
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <Icon name="information-circle" className="w-5 h-5" />
            <span>Select a demo screen below to begin</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {groupedRoutes.map((group) => (
          <div key={group.category} className="mb-10">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-blue-600 rounded"></div>
              {group.category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.routes.map((route) => (
                <button
                  key={route.path}
                  onClick={() => router.push(route.path)}
                  className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                      <Icon name={route.icon as any} className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                        {route.title}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-2">{route.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="max-w-7xl mx-auto px-6 py-8 mt-12">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <Icon name="light-bulb" className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Getting Started</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>
                  • Start with <strong>Demo Deck Navigator</strong> for a guided presentation flow
                </li>
                <li>• Or explore individual screens directly from the categories above</li>
                <li>• All screens use mock data and don&apos;t require backend services</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Attribution Footer */}
      <div className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-xs text-gray-500 text-center">
            Author: Richard Hennessy — TCOC Clinical Platform © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
