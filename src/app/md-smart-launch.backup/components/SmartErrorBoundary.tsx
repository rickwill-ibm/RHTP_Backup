'use client';
import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

// ─── Error Types ──────────────────────────────────────────────────────────────
export type SmartErrorCode =
  | 'SMART_LAUNCH_FAILED'
  | 'FHIR_TIMEOUT'
  | 'MISSING_PATIENT_DATA'
  | 'TOKEN_EXPIRED'
  | 'ORDER_VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export interface SmartError {
  code: SmartErrorCode;
  message: string;
  detail?: string;
  retryable?: boolean;
  timestamp?: string;
}

// ─── Error config map ─────────────────────────────────────────────────────────
export const SMART_ERROR_CONFIG: Record<
  SmartErrorCode,
  {
    title: string;
    description: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    retryLabel?: string;
    fallbackAction?: string;
  }
> = {
  SMART_LAUNCH_FAILED: {
    title: 'SMART Launch Failed',
    description:
      'The SMART on FHIR launch sequence could not be completed. The Cerner launch token may be invalid, expired, or the authorization server is unreachable.',
    icon: 'BoltSlashIcon',
    color: 'text-[#da1e28]',
    bgColor: 'bg-[#fff1f1]',
    borderColor: 'border-[#da1e28]',
    retryLabel: 'Retry Launch',
    fallbackAction: 'Return to Cerner and re-launch from the patient chart.',
  },
  FHIR_TIMEOUT: {
    title: 'FHIR Server Timeout',
    description:
      'The FHIR R4 server did not respond within the expected time. This may be due to network latency, server load, or a temporary outage.',
    icon: 'ClockIcon',
    color: 'text-[#f1c21b]',
    bgColor: 'bg-[#fffbeb]',
    borderColor: 'border-[#f1c21b]',
    retryLabel: 'Retry FHIR Request',
    fallbackAction: 'If the issue persists, contact your system administrator.',
  },
  MISSING_PATIENT_DATA: {
    title: 'Patient Data Unavailable',
    description:
      'Required patient context could not be loaded from the FHIR server. The patient record may be incomplete, restricted, or not yet available in the system.',
    icon: 'UserMinusIcon',
    color: 'text-[#ff832b]',
    bgColor: 'bg-[#fff4ec]',
    borderColor: 'border-[#ff832b]',
    retryLabel: 'Reload Patient Data',
    fallbackAction: 'Verify the patient record in Cerner and re-launch.',
  },
  TOKEN_EXPIRED: {
    title: 'Session Token Expired',
    description:
      'Your OAuth 2.0 access token has expired. For security, SMART sessions are time-limited. You must re-authenticate to continue.',
    icon: 'LockClosedIcon',
    color: 'text-[#6929c4]',
    bgColor: 'bg-[#f6f2ff]',
    borderColor: 'border-[#6929c4]',
    retryLabel: 'Re-authenticate',
    fallbackAction: 'Return to Cerner and re-launch to obtain a fresh token.',
  },
  ORDER_VALIDATION_FAILED: {
    title: 'Order Validation Failed',
    description:
      'One or more orders failed FHIR R4 validation before submission. Orders have not been sent to Cerner. Review the validation errors and correct before signing.',
    icon: 'ClipboardDocumentCheckIcon',
    color: 'text-[#da1e28]',
    bgColor: 'bg-[#fff1f1]',
    borderColor: 'border-[#da1e28]',
    retryLabel: 'Review Orders',
    fallbackAction: 'Correct the flagged fields and re-submit.',
  },
  UNKNOWN_ERROR: {
    title: 'Unexpected Error',
    description:
      'An unexpected error occurred in the SMART application. This has been logged for review.',
    icon: 'ExclamationTriangleIcon',
    color: 'text-[#da1e28]',
    bgColor: 'bg-[#fff1f1]',
    borderColor: 'border-[#da1e28]',
    retryLabel: 'Reload Application',
    fallbackAction: 'If the issue persists, contact support.',
  },
};

// ─── Fallback Screen ──────────────────────────────────────────────────────────
interface SmartErrorFallbackProps {
  error: SmartError;
  onRetry?: () => void;
  onReturnToCerner?: () => void;
  compact?: boolean;
}

export function SmartErrorFallback({
  error,
  onRetry,
  onReturnToCerner,
  compact = false,
}: SmartErrorFallbackProps) {
  const cfg = SMART_ERROR_CONFIG[error.code] ?? SMART_ERROR_CONFIG.UNKNOWN_ERROR;
  const ts = error.timestamp ?? new Date().toISOString();

  if (compact) {
    return (
      <div className={`border ${cfg.borderColor} ${cfg.bgColor} p-4 flex items-start gap-3`}>
        <Icon name={cfg.icon as any} size={18} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.title}</p>
          <p className="text-xs text-carbon-gray-70 mt-0.5">{error.message || cfg.description}</p>
          {error.detail && (
            <p className="text-xs font-mono text-carbon-gray-50 mt-1 truncate">{error.detail}</p>
          )}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className={`text-xs font-medium px-3 py-1.5 border ${cfg.borderColor} ${cfg.color} hover:opacity-80 transition-opacity flex-shrink-0`}
          >
            {cfg.retryLabel ?? 'Retry'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-carbon-gray-10 p-6">
      {/* Header strip */}
      <div className="w-full max-w-lg mb-6 flex items-center gap-2">
        <div className="w-8 h-8 bg-[#6929c4] flex items-center justify-center flex-shrink-0">
          <Icon name="BoltIcon" size={16} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-carbon-gray-100">
            TCOC Clinical — SMART on FHIR
          </p>
          <p className="text-2xs text-carbon-gray-50">Cerner PowerChart</p>
        </div>
      </div>

      {/* Error card */}
      <div className={`w-full max-w-lg border-2 ${cfg.borderColor} bg-white`}>
        {/* Color bar */}
        <div className={`h-1.5 w-full ${cfg.borderColor.replace('border-', 'bg-')}`} />

        <div className="p-8">
          {/* Icon + title */}
          <div className="flex items-start gap-4 mb-5">
            <div
              className={`w-12 h-12 ${cfg.bgColor} border ${cfg.borderColor} flex items-center justify-center flex-shrink-0`}
            >
              <Icon name={cfg.icon as any} size={24} className={cfg.color} />
            </div>
            <div>
              <p className="text-xs font-mono text-carbon-gray-50 mb-1">Error Code: {error.code}</p>
              <h2 className={`text-lg font-bold ${cfg.color}`}>{cfg.title}</h2>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-carbon-gray-70 mb-4 leading-relaxed">
            {error.message || cfg.description}
          </p>

          {/* Detail (technical) */}
          {error.detail && (
            <div className="bg-carbon-gray-10 border border-carbon-gray-20 p-3 mb-4">
              <p className="text-2xs font-mono text-carbon-gray-70 break-all">{error.detail}</p>
            </div>
          )}

          {/* Fallback guidance */}
          <div className="flex items-start gap-2 mb-6 p-3 bg-carbon-gray-10 border border-carbon-gray-20">
            <Icon
              name="InformationCircleIcon"
              size={14}
              className="text-carbon-gray-50 flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-carbon-gray-70">{cfg.fallbackAction}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${cfg.borderColor.replace('border-', 'bg-')}`}
              >
                <Icon name="ArrowPathIcon" size={14} />
                {cfg.retryLabel ?? 'Retry'}
              </button>
            )}
            {onReturnToCerner && (
              <button
                onClick={onReturnToCerner}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-carbon-gray-70 border border-carbon-gray-30 hover:bg-carbon-gray-10 transition-colors"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                Return to Cerner
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-carbon-gray-20 px-8 py-3 flex items-center justify-between">
          <p className="text-2xs text-carbon-gray-50 font-mono">
            {new Date(ts).toLocaleString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
          <p className="text-2xs text-carbon-gray-50">SMART App v1.0.0 · FHIR R4</p>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Alert ─────────────────────────────────────────────────────────────
interface SmartInlineAlertProps {
  error: SmartError;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function SmartInlineAlert({
  error,
  onDismiss,
  onRetry,
  className = '',
}: SmartInlineAlertProps) {
  const cfg = SMART_ERROR_CONFIG[error.code] ?? SMART_ERROR_CONFIG.UNKNOWN_ERROR;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 border ${cfg.borderColor} ${cfg.bgColor} px-4 py-3 ${className}`}
    >
      <Icon name={cfg.icon as any} size={16} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.title}</p>
        <p className="text-xs text-carbon-gray-70 mt-0.5 leading-relaxed">
          {error.message || cfg.description}
        </p>
        {error.detail && (
          <p className="text-2xs font-mono text-carbon-gray-50 mt-1 truncate" title={error.detail}>
            {error.detail}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className={`text-2xs font-semibold px-2.5 py-1 border ${cfg.borderColor} ${cfg.color} hover:opacity-80 transition-opacity`}
          >
            {cfg.retryLabel ?? 'Retry'}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors"
            aria-label="Dismiss alert"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Token Expiry Banner ──────────────────────────────────────────────────────
interface TokenExpiryBannerProps {
  tokenExpiry: number; // Unix ms
  onReauth: () => void;
}

export function TokenExpiryBanner({ tokenExpiry, onReauth }: TokenExpiryBannerProps) {
  const [secondsLeft, setSecondsLeft] = React.useState<number>(() =>
    Math.max(0, Math.floor((tokenExpiry - Date.now()) / 1000))
  );

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((tokenExpiry - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [tokenExpiry, secondsLeft]);

  if (secondsLeft > 300) return null; // Only show when < 5 min left

  const isExpired = secondsLeft === 0;
  const isCritical = secondsLeft <= 60;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeLabel = isExpired
    ? 'Session expired'
    : `${mins}:${String(secs).padStart(2, '0')} remaining`;

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium ${
        isExpired
          ? 'bg-[#da1e28] text-white'
          : isCritical
            ? 'bg-[#ff832b] text-white'
            : 'bg-[#f1c21b] text-[#7d4e00]'
      }`}
    >
      <Icon name="LockClosedIcon" size={15} />
      <span className="flex-1">
        {isExpired
          ? 'Your SMART session has expired. Re-authenticate to continue.'
          : `OAuth token expiring — ${timeLabel}. Save your work and re-authenticate.`}
      </span>
      <button
        onClick={onReauth}
        className={`text-xs font-bold px-3 py-1 border ${
          isExpired || isCritical
            ? 'border-white/50 hover:bg-white/20'
            : 'border-[#7d4e00]/40 hover:bg-[#7d4e00]/10'
        } transition-colors`}
      >
        Re-authenticate
      </button>
    </div>
  );
}

// ─── React Error Boundary ─────────────────────────────────────────────────────
interface SmartErrorBoundaryProps {
  children: ReactNode;
  errorCode?: SmartErrorCode;
  onRetry?: () => void;
  onReturnToCerner?: () => void;
  fallbackMessage?: string;
}

interface SmartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SmartErrorBoundary extends Component<
  SmartErrorBoundaryProps,
  SmartErrorBoundaryState
> {
  constructor(props: SmartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SmartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production: send to error tracking service
    console.error('[SmartErrorBoundary] Caught error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const smartError: SmartError = {
        code: this.props.errorCode ?? 'UNKNOWN_ERROR',
        message: this.props.fallbackMessage ?? this.state.error?.message ?? '',
        detail: this.state.error?.stack?.split('\n')[0],
        timestamp: new Date().toISOString(),
      };
      return (
        <SmartErrorFallback
          error={smartError}
          onRetry={this.handleRetry}
          onReturnToCerner={this.props.onReturnToCerner}
        />
      );
    }
    return this.props.children;
  }
}

export default SmartErrorBoundary;
