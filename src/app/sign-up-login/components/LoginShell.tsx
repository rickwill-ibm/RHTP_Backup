'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import type { UserRole } from '@/lib/mockData';

interface LoginForm {
  email: string;
  password: string;
  remember: boolean;
}

const DEMO_PASSWORD = 'Demo@2026';

const demoCredentials = [
  {
    role: 'care_manager' as UserRole,
    label: 'Care Manager',
    email: 'angela.torres@tcoc-health.org',
    password: DEMO_PASSWORD,
    color: 'bg-[#d0e2ff] text-[#0043ce]',
  },
  {
    role: 'physician' as UserRole,
    label: 'Physician',
    email: 'james.whitfield@tcoc-health.org',
    password: DEMO_PASSWORD,
    color: 'bg-[#defbe6] text-[#0e6027]',
  },
];

export default function LoginShell() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole>('care_manager');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: { email: '', password: '', remember: false },
  });

  // Backend integration: replace with real auth API call
  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setLoginError('');
    await new Promise((r) => setTimeout(r, 1200));

    const validCred = demoCredentials.find(
      (c) => c.email === data.email && c.password === data.password
    );

    if (!validCred) {
      setLoginError('Invalid credentials — use the demo accounts below to sign in');
      setIsLoading(false);
      return;
    }

    toast.success(`Signed in as ${validCred.label}`);
    setIsLoading(false);
    router.push('/contract-program-selection');
  };

  const autofill = (cred: (typeof demoCredentials)[0]) => {
    setValue('email', cred.email);
    setValue('password', cred.password);
    setSelectedRole(cred.role);
    setLoginError('');
  };

  return (
    <div className="min-h-screen flex bg-carbon-gray-10">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[520px] xl:w-[600px] 2xl:w-[680px] flex-col bg-carbon-gray-100 relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 opacity-5">
          {Array.from({ length: 8 }, (_, ri) =>
            Array.from({ length: 8 }, (_, ci) => (
              <div
                key={`grid-${ri}-${ci}`}
                className="absolute border border-white"
                style={{
                  left: `${ci * 12.5}%`,
                  top: `${ri * 12.5}%`,
                  width: '12.5%',
                  height: '12.5%',
                }}
              />
            ))
          )}
        </div>
        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3 mb-16">
            <AppLogo size={36} />
            <div>
              <span className="font-bold text-white text-lg tracking-tight">TCOC</span>
              <p className="text-2xs text-carbon-gray-30">Total Cost of Care Platform</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Population Health.
              <br />
              <span className="text-[#0f62fe]">Value-Based Care.</span>
            </h1>
            <p className="text-carbon-gray-30 text-base leading-relaxed mb-10">
              Enterprise clinical platform for care managers and physicians managing risk-stratified
              patient panels under VBC contracts.
            </p>
            <div className="space-y-4">
              {[
                {
                  key: 'feat-hcc',
                  icon: 'DocumentMagnifyingGlassIcon',
                  title: 'HCC Capture & RAF Scoring',
                  desc: 'Surface, review, and confirm HCC suspects with evidence-backed workflows',
                },
                {
                  key: 'feat-gap',
                  icon: 'ClipboardDocumentCheckIcon',
                  title: 'Care Gap Management',
                  desc: 'HEDIS, STARS, and MIPS gap closure tracking with intervention workflows',
                },
                {
                  key: 'feat-cost',
                  icon: 'CurrencyDollarIcon',
                  title: 'Total Cost of Care Analytics',
                  desc: 'PMPM trend, cost envelope, and avoidable utilization monitoring',
                },
              ].map((f) => (
                <div key={f.key} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#0f62fe] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name={f.icon as any} size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-carbon-gray-50 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-2xs text-carbon-gray-50 mt-8">
            HIPAA compliant · SOC 2 Type II certified · 21st Century Cures Act compliant
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <AppLogo size={32} />
            <span className="font-bold text-carbon-gray-100 text-lg">TCOC</span>
          </div>

          <h2 className="text-2xl font-semibold text-carbon-gray-100 mb-1">Sign in to TCOC</h2>
          <p className="text-sm text-carbon-gray-50 mb-6">
            Access your attributed patient panels and VBC contracts
          </p>

          {/* Role selector */}
          <div className="mb-6">
            <p className="carbon-label mb-2">Sign in as</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  role: 'care_manager' as UserRole,
                  label: 'Care Manager',
                  icon: 'UserGroupIcon',
                  desc: 'Panel management & care coordination',
                },
                {
                  role: 'physician' as UserRole,
                  label: 'Physician',
                  icon: 'UserIcon',
                  desc: 'Clinical review & HCC confirmation',
                },
              ].map((r) => (
                <button
                  key={`role-${r.role}`}
                  onClick={() => setSelectedRole(r.role)}
                  className={`flex flex-col items-start p-3 border-2 text-left transition-colors ${selectedRole === r.role ? 'border-[#0f62fe] bg-[#edf5ff]' : 'border-carbon-gray-20 bg-white hover:border-carbon-gray-30'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      name={r.icon as any}
                      size={16}
                      className={selectedRole === r.role ? 'text-[#0f62fe]' : 'text-carbon-gray-50'}
                    />
                    <span
                      className={`text-sm font-semibold ${selectedRole === r.role ? 'text-[#0f62fe]' : 'text-carbon-gray-100'}`}
                    >
                      {r.label}
                    </span>
                  </div>
                  <p className="text-2xs text-carbon-gray-50">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="carbon-label">Email Address</label>
              <input
                type="email"
                autoComplete="email"
                className={`carbon-input ${errors.email ? 'border-[#da1e28]' : ''}`}
                placeholder="you@organization.org"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
              />
              {errors.email && (
                <p className="text-xs text-[#da1e28] mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="carbon-label mb-0">Password</label>
                <button type="button" className="text-xs text-carbon-blue hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`carbon-input pr-10 ${errors.password ? 'border-[#da1e28]' : ''}`}
                  placeholder="Your password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-carbon-gray-50 hover:text-carbon-gray-100"
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-[#da1e28] mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                className="accent-carbon-blue"
                {...register('remember')}
              />
              <label htmlFor="remember" className="text-sm text-carbon-gray-70 cursor-pointer">
                Remember this device for 30 days
              </label>
            </div>

            {/* Error */}
            {loginError && (
              <div className="bg-[#fff1f1] border border-[#ffb3b8] px-4 py-3 flex items-start gap-2">
                <Icon
                  name="ExclamationCircleIcon"
                  size={16}
                  className="text-[#da1e28] flex-shrink-0 mt-0.5"
                />
                <p className="text-xs text-[#da1e28]">{loginError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="carbon-btn-primary w-full justify-center py-3 text-sm font-semibold disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Icon name="ArrowRightOnRectangleIcon" size={16} />
                  Sign In to TCOC
                </>
              )}
            </button>

            {/* Cerner SSO */}
            {selectedRole === 'physician' && (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-carbon-gray-20 bg-white text-sm font-medium text-carbon-gray-70 hover:bg-carbon-gray-10 hover:border-carbon-gray-30 transition-colors"
                onClick={() => toast.info('Cerner SSO — redirecting to Cerner identity provider')}
              >
                <Icon name="ArrowTopRightOnSquareIcon" size={16} />
                Continue with Cerner SSO
              </button>
            )}
          </form>

          {/* Demo credentials */}
          <div className="mt-6 border border-carbon-gray-20 bg-carbon-gray-10">
            <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
              <Icon name="InformationCircleIcon" size={14} className="text-carbon-gray-50" />
              <p className="text-xs font-semibold text-carbon-gray-70 uppercase tracking-wide">
                Demo Credentials
              </p>
            </div>
            <div className="p-3 space-y-2">
              {demoCredentials.map((cred) => (
                <div
                  key={`cred-${cred.role}`}
                  className="flex items-center justify-between gap-3 bg-white border border-carbon-gray-20 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 mr-2 ${cred.color}`}>
                      {cred.label}
                    </span>
                    <span className="text-xs font-mono text-carbon-gray-70 truncate">
                      {cred.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => autofill(cred)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-carbon-gray-10 border border-carbon-gray-20 text-xs font-medium text-carbon-gray-70 hover:bg-carbon-gray-20 transition-colors flex-shrink-0"
                  >
                    <Icon name="ArrowDownOnSquareIcon" size={12} />
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* HIPAA notice */}
          <p className="text-2xs text-carbon-gray-50 mt-4 text-center leading-relaxed">
            This system contains Protected Health Information (PHI). Access is restricted to
            authorized personnel only. All activity is monitored and logged per HIPAA requirements.
          </p>
        </div>
      </div>
    </div>
  );
}
