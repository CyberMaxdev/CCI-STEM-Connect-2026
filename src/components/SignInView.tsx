import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ROLE_OVERVIEW = [
  {
    title: 'Super Administrator',
    scope: 'Platform governance, user accounts, role permissions, scoring weights, and full data visibility.',
  },
  {
    title: 'Programme Manager',
    scope: 'Programmes, cohorts, STEM tracks, configurable objectives, learning outcomes, sessions, and analytics.',
  },
  {
    title: 'Facilitator / Mentor',
    scope: 'Assigned sessions, participant attendance registers, engagement observations, and rubric assessment grading.',
  },
  {
    title: 'Participant',
    scope: 'Personal profile, scheduled sessions, assessment progress, project history, and eligible certificates.',
  },
];

export function SignInView() {
  const { signInWithGoogle, signingIn, error } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Panel */}
      <div className="lg:col-span-7 bg-[#B5121B] text-white px-8 py-12 lg:px-16 lg:py-16 flex flex-col justify-between">
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
              Manage programme delivery, participant development, and measurable STEM outcomes from one system.
            </h1>
            <p className="mt-5 text-base text-red-50/90 leading-relaxed">
              Centralise cohorts, STEM tracks, sessions, attendance registers, rubric-based assessments,
              and evidence-backed reporting with role-based access enforced on the server.
            </p>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/20">
          <p className="text-xs font-medium text-red-100/90 mb-5">
            Role-Based Access Governance
          </p>
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
      <div className="lg:col-span-5 flex items-center justify-center px-6 py-12 sm:px-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 text-[#B5121B] text-sm font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Authenticated Workspace Access</span>
          </div>

          <h2 className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            Sign in to CCI STEM Connect
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Use your institutional Google account. Your role permissions are verified on the backend
            before loading programme records.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-8">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B5121B] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
              {!signingIn && <ArrowRight className="w-4 h-4 shrink-0" />}
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            New accounts default to Participant access until a Super Administrator assigns Programme
            Manager or Facilitator permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
