'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function UhgOrchestrateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      {/* Remove padding for agentic screens - they manage their own layout */}
      <div style={{ margin: '-24px -40px -24px -24px' }}>{children}</div>
    </AppLayout>
  );
}

// Made with Bob
