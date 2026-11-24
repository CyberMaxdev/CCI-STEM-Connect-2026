import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'signin' | 'signup';
type SignUpRole = 'programme_manager' | 'facilitator' | 'participant';

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

const SIGNUP_ROLES: { value: SignUpRole; title: string; scope: string; requiresApproval: boolean }[] =
  [
    {
      value: 'programme_manager',
      title: 'Programme Manager',
      scope:
        'Programmes, cohorts, STEM tracks, configurable objectives, learning outcomes, sessions, and analytics.',
      requiresApproval: true,
    },
    {
      value: 'facilitator',
      title: 'Facilitator / Mentor',
      scope:
        'Assigned sessions, participant attendance registers, engagement observations, and rubric assessment grading.',
      requiresApproval: true,
    },
    {
      value: 'participant',
      title: 'Participant',
      scope:
        'Personal profile, scheduled sessions, assessment progress, project history, and eligible certificates.',
      requiresApproval: false,
    },
  ];

export function SignInView() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, signingIn, error, clearError } =
    useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [selectedRole, setSelectedRole] = useState<SignUpRole>('participant');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || error;
  const activeRoleMeta = SIGNUP_ROLES.find((r) => r.value === selectedRole)!;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    clearError();
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Please enter your email address and password.');
      return;
    }

    await signInWithEmail(email.trim(), password);
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (fullName.trim().length < 2) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter a valid email address.');
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
      selectedRole,
      inviteCode: inviteCode.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Panel */}
      <div className="lg:col-span-6 xl:col-span-7 bg-[#B5121B] text-white px-8 py-10 lg:px-14 lg:py-14 flex flex-col justify-between">
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

          <div className="mt-12 max-w-xl">
            <p className="text-sm font-medium text-red-100">
              Programme Management &amp; Impact Intelligence
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Manage programme delivery, participant development, and measurable STEM outcomes from
              one system.
            </h1>
            <p className="mt-4 text-base text-red-50/90 leading-relaxed">
              Centralise cohorts, STEM tracks, sessions, attendance registers, rubric-based
              assessments, and evidence-backed reporting with role-based access enforced on the
              server.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/20">
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
      <div className="lg:col-span-6 xl:col-span-5 flex items-center justify-center px-6 py-10 sm:px-10 bg-white">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 text-[#B5121B] text-sm font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Authenticated Workspace Access</span>
          </div>

          <h2 className="mt-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            {mode === 'signin' ? 'Sign in to CCI STEM Connect' : 'Create your role account'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {mode === 'signin'
              ? 'Sign in with your account email and password, or continue with your institutional Google account.'
              : 'Select your role below to register for Programme Manager, Facilitator / Mentor, or Participant access.'}
          </p>

          {/* Mode Switcher */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mt-6 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => switchMode('signin')}
              className={`py-2 px-3 rounded-md text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`py-2 px-3 rounded-md text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          {displayedError && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{displayedError}</span>
            </div>
          )}

          {mode === 'signin' ? (
            <form onSubmit={handleSignInSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@organization.org"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                />
              </div>

              <div>
                <label
                  htmlFor="signin-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full h-11 flex items-center justify-center gap-2.5 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <span>{signingIn ? 'Signing in...' : 'Sign In'}</span>
                {!signingIn && <ArrowRight className="w-4 h-4 shrink-0" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUpSubmit} className="mt-5 space-y-4" noValidate>
              {/* Role Selector */}
              <fieldset>
                <legend className="block text-xs font-semibold text-slate-700 mb-2">
                  Account Role
                </legend>
                <div className="space-y-2">
                  {SIGNUP_ROLES.map((roleOpt) => {
                    const isSelected = selectedRole === roleOpt.value;
                    return (
                      <label
                        key={roleOpt.value}
                        className={`block p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[#B5121B] bg-red-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name="selectedRole"
                            value={roleOpt.value}
                            checked={isSelected}
                            onChange={() => setSelectedRole(roleOpt.value)}
                            className="mt-0.5 accent-[#B5121B]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {roleOpt.title}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                {roleOpt.requiresApproval
                                  ? 'Invite or Approval'
                                  : 'Instant Access'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                              {roleOpt.scope}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ada@example.org"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Password (8+ chars)
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create password"
                      className="w-full h-10 pl-3 pr-9 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="signup-confirm"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                  />
                </div>
              </div>

              {activeRoleMeta.requiresApproval && (
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <KeyRound className="w-3.5 h-3.5 text-[#B5121B] shrink-0" />
                    <label htmlFor="signup-invite-code">
                      Super Admin Invite Code (optional for immediate activation)
                    </label>
                  </div>
                  <input
                    id="signup-invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder={
                      selectedRole === 'programme_manager'
                        ? 'e.g. CCI-PM-XXXX-XXXX'
                        : 'e.g. CCI-FM-XXXX-XXXX'
                    }
                    className="w-full h-9 px-3 rounded-md border border-slate-300 bg-white text-xs font-mono tracking-wider text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/15"
                  />
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Enter an invite code from your Super Administrator to activate{' '}
                    <span className="font-medium text-slate-800">{activeRoleMeta.title}</span>{' '}
                    access right away, or leave blank to submit a request for Super Administrator
                    approval.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="w-full h-11 flex items-center justify-center gap-2.5 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>{signingIn ? 'Creating account...' : `Sign Up as ${activeRoleMeta.title}`}</span>
              </button>
            </form>
          )}

          {/* Divider + Google Sign-In */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={signingIn}
              className="w-full h-10 flex items-center justify-center gap-2.5 px-4 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4 shrink-0 text-slate-500" />
            </button>
          </div>

          <p className="mt-5 text-xs text-slate-500 leading-relaxed">
            Super Administrators sign in with their authorized institutional account and can
            provision, invite, or approve Programme Managers, Facilitators, and Participants in{' '}
            <span className="font-medium text-slate-700">Users &amp; Access</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
