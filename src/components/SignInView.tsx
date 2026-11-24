import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { type SignUpRole, useAuth } from '../contexts/AuthContext';

const ROLE_OVERVIEW = [
  {
    title: 'Super Administrator',
    scope:
      'Platform governance, user accounts, role permissions, scoring weights, and full data visibility.',
  },
  {
    title: 'Programme Manager',
    scope:
      'Programmes, cohorts, STEM tracks, configurable objectives, learning outcomes, sessions, and analytics.',
  },
  {
    title: 'Facilitator / Mentor',
    scope:
      'Assigned sessions, participant attendance registers, engagement observations, and rubric assessment grading.',
  },
  {
    title: 'Participant',
    scope:
      'Personal profile, scheduled sessions, assessment progress, project history, and eligible certificates.',
  },
];

const SIGNUP_ROLES: Array<{ value: SignUpRole; label: string; description: string }> = [
  {
    value: 'programme_manager',
    label: 'Programme Manager',
    description:
      'Programmes, cohorts, STEM tracks, configurable objectives, learning outcomes, sessions, and analytics.',
  },
  {
    value: 'facilitator',
    label: 'Facilitator / Mentor',
    description:
      'Assigned sessions, participant attendance registers, engagement observations, and rubric assessment grading.',
  },
  {
    value: 'participant',
    label: 'Participant',
    description:
      'Personal profile, scheduled sessions, assessment progress, project history, and eligible certificates.',
  },
];

type AuthTab = 'signin' | 'signup' | 'reset';

export function SignInView() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    clearError,
    signingIn,
    error,
  } = useAuth();

  const [tab, setTab] = useState<AuthTab>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<SignUpRole>('participant');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setLocalError(null);
    setResetSent(false);
    clearError();
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Enter both your email address and password.');
      return;
    }
    await signInWithEmail(email, password);
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (fullName.trim().length < 2) {
      setLocalError('Enter your full name (at least 2 characters).');
      return;
    }
    if (!email.trim().includes('@')) {
      setLocalError('Enter a valid Gmail or institutional email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    await signUpWithEmail({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      role: selectedRole,
    });
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSent(false);
    if (!email.trim().includes('@')) {
      setLocalError('Enter the email address associated with your account.');
      return;
    }
    const ok = await sendPasswordReset(email);
    if (ok) {
      setResetSent(true);
    }
  };

  const activeError = localError || error;

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Panel */}
      <div className="lg:col-span-6 xl:col-span-7 bg-[#B5121B] text-white px-8 py-12 lg:px-14 xl:px-16 lg:py-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/Celebration_Church_International_3_9816efbc.jpg"
              alt="CCI STEM Connect logo"
              referrerPolicy="no-referrer"
              className="h-10 w-auto rounded-md object-contain ring-1 ring-white/25 shrink-0"
            />
            <span className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
              CCI STEM Connect
            </span>
          </div>

          <div className="mt-14 max-w-xl">
            <p className="text-sm font-medium text-red-100">
              Programme Management & Impact Intelligence
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Manage programme delivery, participant development, and measurable STEM outcomes from
              one system.
            </h1>
            <p className="mt-5 text-base text-red-50/90 leading-relaxed">
              Centralise cohorts, STEM tracks, sessions, attendance registers, rubric-based
              assessments, and evidence-backed reporting with role-based access enforced on the
              server.
            </p>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/20">
          <p className="text-xs font-medium text-red-100/90 mb-5">Role-Based Access Governance</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {ROLE_OVERVIEW.map((item) => (
              <div key={item.title}>
                <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                <p className="mt-1 text-xs text-red-100/85 leading-relaxed">{item.scope}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:col-span-6 xl:col-span-5 flex items-center justify-center px-6 py-10 sm:px-12 bg-white">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 text-[#B5121B] text-sm font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Authenticated Workspace Access</span>
          </div>

          <h2 className="mt-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            {tab === 'signin'
              ? 'Sign in to CCI STEM Connect'
              : tab === 'signup'
                ? 'Create your role account'
                : 'Reset your password'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {tab === 'signin'
              ? 'Sign in with your Gmail and password or institutional Google account.'
              : tab === 'signup'
                ? 'Register as a Programme Manager, Facilitator / Mentor, or Participant using your Gmail and password.'
                : 'Enter your registered email address to receive a password reset link.'}
          </p>

          {/* Segmented Mode Switcher */}
          {tab !== 'reset' && (
            <div className="mt-6 grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/70">
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchTab('signup')}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {activeError && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{activeError}</span>
            </div>
          )}

          {resetSent && (
            <div className="mt-5 p-3.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-900 text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-teal-700" />
              <span>
                Password reset instructions have been sent to <strong>{email}</strong>. Check your
                inbox and spam folder.
              </span>
            </div>
          )}

          {/* SIGN IN FORM */}
          {tab === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Gmail / Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="signin-password" className="text-xs font-medium text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchTab('reset')}
                    className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-10 pr-10 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <span>{signingIn ? 'Signing in...' : 'Sign In with Email'}</span>
                {!signingIn && <ArrowRight className="w-4 h-4 shrink-0" />}
              </button>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-500">or continue with Google</span>
                </div>
              </div>

              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <span>Continue with Google</span>
              </button>
            </form>
          )}

          {/* SIGN UP FORM */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">Select Your Role</p>
                <div className="space-y-2">
                  {SIGNUP_ROLES.map((item) => {
                    const active = selectedRole === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSelectedRole(item.value)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-[#B5121B] bg-red-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              active ? 'text-[#8F0E15]' : 'text-slate-900'
                            }`}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              active ? 'text-[#B5121B]' : 'text-slate-400'
                            }`}
                          >
                            {active ? 'Selected' : 'Choose'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Grace Adeyemi"
                    className="w-full h-10 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Gmail / Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="w-full h-10 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Password (min 8 chars)
                  </label>
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-confirm"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded border-slate-300 accent-[#B5121B]"
                />
                <span>Show password</span>
              </label>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <span>{signingIn ? 'Creating account...' : 'Create Account & Sign In'}</span>
                {!signingIn && <ArrowRight className="w-4 h-4 shrink-0" />}
              </button>
            </form>
          )}

          {/* PASSWORD RESET FORM */}
          {tab === 'reset' && (
            <form onSubmit={handleResetSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={signingIn}
                  className="flex-1 px-5 py-2.5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {signingIn ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            Super Administrator access is managed exclusively by Celebration Church International
            governance. All role permissions are verified on the backend.
          </p>
        </div>
      </div>
    </div>
  );
}
