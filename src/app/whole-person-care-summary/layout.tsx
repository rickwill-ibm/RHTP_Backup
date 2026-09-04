'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function WholePersionCareSummaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      pageTitle="Whole Person Care View"
      breadcrumbs={[{ label: 'Whole Person Care' }, { label: 'Whole Person Care View' }]}
      fullBleed
    >
      {children}
    </AppLayout>
  );
}
