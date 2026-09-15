'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface AccessDeniedProps {
  section: string;
  role: string;
}

/**
 * Standard access-denied card for Admin Console sections
 * Rendered when canView() returns false for the active role
 */
export default function AccessDenied({ section, role }: AccessDeniedProps) {
  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-white border border-carbon-gray-20 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-carbon-gray-10 mb-4">
          <Icon name="LockClosedIcon" size={32} className="text-carbon-gray-50" />
        </div>
        <h2 className="text-lg font-semibold text-carbon-gray-100 mb-2">Access Denied</h2>
        <p className="text-sm text-carbon-gray-70 mb-4">
          Your role <strong>{role}</strong> does not have permission to access{' '}
          <strong>{section}</strong>.
        </p>
        <p className="text-xs text-carbon-gray-50">
          Contact your administrator if you believe you should have access to this section.
        </p>
      </div>
    </div>
  );
}
