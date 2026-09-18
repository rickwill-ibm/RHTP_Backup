import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AppContextProvider } from '@/lib/appContext';
import { WorkflowMachineProvider } from '@/lib/workflowMachine';
import { GapClosureStoreProvider } from '@/lib/patientContext';
import DemoNavigator from '@/components/DemoNavigator';
import FhirModeSyncMount from '@/components/FhirModeSyncMount';

// ─── Authorship ────────────────────────────────────────────────────────────────
// Author: Richard Hennessy
// Application: TCOC — Total Cost of Care Clinical Platform
// All rights reserved. Authorship is non-transferable and permanently attributed.
// ──────────────────────────────────────────────────────────────────────────────

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'TCOC — Total Cost of Care Clinical Platform',
  description:
    'Enterprise population health and value-based care management platform for care managers and physicians managing risk-stratified patient panels.',
  authors: [{ name: 'Richard Hennessy' }],
  creator: 'Richard Hennessy',
  publisher: 'Richard Hennessy',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Author: Richard Hennessy — TCOC Clinical Platform */}
        <meta name="author" content="Richard Hennessy" />
        <meta name="application-name" content="TCOC — Total Cost of Care Clinical Platform" />
        <meta name="copyright" content="Richard Hennessy" />
      </head>
      <body>
        <AppContextProvider>
          <FhirModeSyncMount />
          <WorkflowMachineProvider>
            <GapClosureStoreProvider>
              {children}
              <DemoNavigator />
            </GapClosureStoreProvider>
          </WorkflowMachineProvider>
        </AppContextProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '14px',
              borderRadius: '0px',
              border: '1px solid #e0e0e0',
            },
          }}
        />
      </body>
    </html>
  );
}
