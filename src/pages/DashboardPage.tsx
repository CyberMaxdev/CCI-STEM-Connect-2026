import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  round2,
  type AttendanceMetrics,
  type DomainEvaluation,
  type LearningGrowthMetrics,
} from '../lib/performance-engine';
import type { NavSection } from '../types';

interface ClassificationBucket {
  categoryName: string;
  count: number;
  percentage: number;
  minScore: number | null;
  maxScore: number | null;
}

interface DomainAverageItem {
  domain: string;
  label: string;
  configuredWeightPct: number;
  averageScore: number | null;
  sampleSize: number;
  coveragePct: number;
}

interface SessionTrendItem {
  sessionId: string;
  title: string;
  shortTitle: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  cohortName: string;
  trackName: string | null;
  status: string;
  recordedCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  approvedAbsenceCount: number;
  attendanceRate: number | null;
  engagementPct: number | null;
}

interface ParticipantRecordSummary {
  participantId: string;
  participantCode: string;
  fullName: string;
  cohortName: string;
  trackName: string | null;
  status: string;
  attendanceRate: number | null;
  averageAssessmentPct: number | null;
  projectsCompleted: number;
  projectsExpected: number;
  learningGrowthDelta: number | null;
  dataCompletenessPct: number;
  overallScore: number | null;
  observedPartialScore: number | null;
  classification: string;
  classificationDisplay: string;
  dataStatus: 'complete' | 'provisional' | 'insufficient_data';
  dataQualityNotice: string | null;
  attendance: AttendanceMetrics;
  learningGrowth: LearningGrowthMetrics;
  domains: DomainEvaluation[];
}

interface DashboardResponse {
  scope: string;
  scoringModelName: string;
  kpis: {
    totalParticipants: number;
    activeParticipants: number;
    completedParticipants: number;
    scoredParticipants: number;
    insufficientDataParticipants: number;
    attendanceRate: number | null;
    sessionWeightedAttendanceRate: number | null;
    programmeCompletionRate: number | null;
    assessmentCompletionRate: number | null;
    projectCompletionRate: number | null;
    completedProjectsCount: number;
    expectedProjectsCount: number;
    averageAssessmentScore: number | null;
    averagePerformanceScore: number | null;
    finalOnlyPerformanceScore: number | null;
    averageLearningGrowth: number | null;
    averageNormalizedGainPct: number | null;
    averageCompletenessPct: number | null;
    confirmedObjectivesCount: number;
    totalObjectivesCount: number;
    totalProgrammes: number;
    totalSessions: number;
  };
  performanceDistribution: ClassificationBucket[];
  domainAverages: DomainAverageItem[];
  learningGrowthSummary: {
    pairedRecordsCount: number;
    averagePrePct: number | null;
    averagePostPct: number | null;
    averageDelta: number | null;
    averageNormalizedGainPct: number | null;
  };
  sessionTrend: SessionTrendItem[];
  cohortBreakdown: Array<{
    cohortId: string;
    name: string;
    status: string;
    participants: number;
    active: number;
    scoredParticipants: number;
    insufficientDataParticipants: number;
    attendanceRate: number;
    attendanceRateNullable: number | null;
    averagePerformanceScore: number | null;
    averageLearningGrowth: number | null;
    projectCompletionRate: number | null;
  }>;
  assessmentBreakdown: Array<{
    id: string;
    title: string;
    fullTitle: string;
    category: string;
    indicatorDomain: string;
    averagePct: number | null;
    gradedCount: number;
  }>;
  trackBreakdown: Array<{ name: string; count: number }>;
  objectives: Array<{
    id: string;
    title: string;
    targetMetric: string | null;
    isConfirmed: boolean;
  }>;
  learningOutcomes: Array<{
    id: string;
    code: string;
    statement: string;
    targetProficiencyPct: string;
    achievedAvgPct: number | null;
    evaluatedCount: number;
    meetingTargetCount: number;
  }>;
  upcomingSessions: Array<{
    id: string;
    title: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  participantRecords: ParticipantRecordSummary[];
  filterOptions: {
    programmes: Array<{ id: string; title: string; code: string }>;
    cohorts: Array<{ id: string; name: string; programmeId: string }>;
    tracks: Array<{ id: string; name: string; programmeId: string }>;
    sessions: Array<{
      id: string;
      title: string;
      sessionDate: string;
      programmeId: string;
      cohortId: string;
    }>;
  };
}

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
}

type PeriodPreset = 'all' | '30d' | '90d' | 'ytd' | 'custom';
type OpsTableTab = 'cohorts' | 'sessions';

function getDistributionFill(categoryName: string, index: number): string {
  if (categoryName === 'Insufficient Data') return '#94A3B8';
  const palette = ['#B5121B', '#0F766E', '#D97706', '#64748B', '#475569'];
  return palette[index % palette.length];
}

function getClassificationColor(classification: string): string {
  const lower = classification.toLowerCase();
  if (lower.includes('insufficient')) return 'text-slate-500';
  if (lower.includes('distinction') || lower.includes('exemplary')) return 'text-[#8F0E15]';
  if (lower.includes('proficient')) return 'text-teal-700';
  if (lower.includes('developing')) return 'text-amber-700';
  return 'text-rose-700';
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user } = useAuth();
  const isStaff = user?.role !== 'participant';

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 5-Facet Filters
  const [programmeId, setProgrammeId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Operational table switcher + participant search + audit drawer
  const [opsTab, setOpsTab] = useState<OpsTableTab>('cohorts');
  const [participantSearch, setParticipantSearch] = useState('');
  const [auditedParticipant, setAuditedParticipant] = useState<ParticipantRecordSummary | null>(
    null
  );

  const applyPeriodPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'custom') return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (preset === 'ytd') {
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(todayStr);
      return;
    }
    const days = preset === '30d' ? 30 : 90;
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(past.toISOString().slice(0, 10));
    setEndDate(todayStr);
  };

  const resetAllFilters = () => {
    setProgrammeId('');
    setCohortId('');
    setTrackId('');
    setSessionId('');
    setPeriodPreset('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = Boolean(
    programmeId || cohortId || trackId || sessionId || startDate || endDate
  );

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (programmeId) params.set('programmeId', programmeId);
      if (cohortId) params.set('cohortId', cohortId);
      if (trackId) params.set('trackId', trackId);
      if (sessionId) params.set('sessionId', sessionId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch<DashboardResponse>(`/api/dashboard${query}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard analytics.');
    } finally {
      setLoading(false);
    }
  }, [programmeId, cohortId, trackId, sessionId, startDate, endDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredParticipantRecords = useMemo(() => {
    const records = data?.participantRecords ?? [];
    const q = participantSearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter((p) =>
      `${p.fullName} ${p.participantCode} ${p.cohortName} ${p.trackName ?? ''} ${p.classificationDisplay}`
        .toLowerCase()
        .includes(q)
    );
  }, [data?.participantRecords, participantSearch]);

  // Direct row-level reconciliation footer proving 1-to-1 agreement with KPI cards above
  const reconciliationTotals = useMemo(() => {
    const rows = filteredParticipantRecords;
    const withAtt = rows.filter((r) => r.attendanceRate !== null);
    const withAss = rows.filter((r) => r.averageAssessmentPct !== null);
    const withGrowth = rows.filter((r) => r.learningGrowthDelta !== null);
    const withScore = rows.filter((r) => r.overallScore !== null);

    return {
      avgAttendance:
        withAtt.length > 0
          ? round2(withAtt.reduce((s, r) => s + (r.attendanceRate ?? 0), 0) / withAtt.length)
          : null,
      avgAssessment:
        withAss.length > 0
          ? round2(withAss.reduce((s, r) => s + (r.averageAssessmentPct ?? 0), 0) / withAss.length)
          : null,
      totalProjDone: rows.reduce((s, r) => s + r.projectsCompleted, 0),
      totalProjExpected: rows.reduce((s, r) => s + r.projectsExpected, 0),
      avgGrowth:
        withGrowth.length > 0
          ? round2(
              withGrowth.reduce((s, r) => s + (r.learningGrowthDelta ?? 0), 0) / withGrowth.length
            )
          : null,
      avgCompleteness:
        rows.length > 0
          ? round2(rows.reduce((s, r) => s + r.dataCompletenessPct, 0) / rows.length)
          : null,
      avgWeightedScore:
        withScore.length > 0
          ? round2(withScore.reduce((s, r) => s + (r.overallScore ?? 0), 0) / withScore.length)
          : null,
      scoredCount: withScore.length,
    };
  }, [filteredParticipantRecords]);

  const formatPct = (val: number | null | undefined) =>
    val !== null && val !== undefined ? `${val}%` : '—';

  const formatGrowth = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `${val >= 0 ? '+' : ''}${val} pts`;
  };

  const sessionChartData = useMemo(
    () =>
      (data?.sessionTrend ?? [])
        .filter((s) => s.attendanceRate !== null || s.engagementPct !== null)
        .slice(-12),
    [data?.sessionTrend]
  );

  const gradedAssessmentChartData = useMemo(
    () => (data?.assessmentBreakdown ?? []).filter((a) => a.gradedCount > 0 && a.averagePct !== null),
    [data?.assessmentBreakdown]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isStaff ? 'Performance Intelligence Dashboard' : 'My Learning & Performance Overview'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isStaff
              ? 'Live programme intelligence rolled up directly from participant attendance, assessments, STEM projects, and weighted scoring records.'
              : 'Your verified attendance rate, graded assessments, learning growth, and weighted performance standing.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Multi-Facet Intelligence Filter Bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {isStaff && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#B5121B]" />
              <span>Scope</span>
            </div>

            <select
              aria-label="Filter by programme"
              value={programmeId}
              onChange={(e) => {
                setProgrammeId(e.target.value);
                setCohortId('');
                setTrackId('');
                setSessionId('');
              }}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#B5121B]"
            >
              <option value="">All Programmes</option>
              {data?.filterOptions.programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.title}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by cohort"
              value={cohortId}
              onChange={(e) => {
                setCohortId(e.target.value);
                setSessionId('');
              }}
              disabled={!data || data.filterOptions.cohorts.length === 0}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#B5121B] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">All Cohorts</option>
              {data?.filterOptions.cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by STEM track"
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                setSessionId('');
              }}
              disabled={!data || data.filterOptions.tracks.length === 0}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#B5121B] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">All STEM Tracks</option>
              {data?.filterOptions.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={!data || data.filterOptions.sessions.length === 0}
              className="h-9 max-w-[240px] px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#B5121B] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">All Sessions</option>
              {data?.filterOptions.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionDate} · {s.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Reporting Period Row */}
        <div
          className={`flex flex-wrap items-center gap-2.5 ${
            isStaff ? 'pt-3 border-t border-slate-100' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-1">
            <Calendar className="w-3.5 h-3.5 text-[#B5121B]" />
            <span>Reporting Period</span>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'All Time' },
                { id: '30d', label: 'Last 30d' },
                { id: '90d', label: 'Last 90d' },
                { id: 'ytd', label: 'YTD' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPeriodPreset(preset.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === preset.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="date"
              aria-label="Reporting start date"
              value={startDate}
              onChange={(e) => {
                setPeriodPreset('custom');
                setStartDate(e.target.value);
              }}
              className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono tabular-nums text-slate-700"
            />
            <span>to</span>
            <input
              type="date"
              aria-label="Reporting end date"
              value={endDate}
              onChange={(e) => {
                setPeriodPreset('custom');
                setEndDate(e.target.value);
              }}
              className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono tabular-nums text-slate-700"
            />
          </div>

          {data?.scoringModelName && (
            <span className="ml-auto text-xs text-slate-500 hidden xl:inline">
              Active Model:{' '}
              <span className="font-medium text-slate-700">{data.scoringModelName}</span>
            </span>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            className="text-xs font-semibold text-rose-800 underline cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* Primary KPI Grid (8 Institutional Indicators) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading && !data ? (
          Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 p-5 h-[116px] animate-pulse"
            >
              <div className="h-3 w-28 bg-slate-200 rounded" />
              <div className="mt-4 h-7 w-20 bg-slate-200 rounded" />
              <div className="mt-2 h-3 w-36 bg-slate-100 rounded" />
            </div>
          ))
        ) : (
          <>
            <KpiCard
              label="Registered Participants"
              value={String(data?.kpis.totalParticipants ?? 0)}
              subtext={`${data?.kpis.activeParticipants ?? 0} active · ${data?.kpis.completedParticipants ?? 0} completed`}
            />
            <KpiCard
              label="Attendance Rate"
              value={formatPct(data?.kpis.attendanceRate)}
              subtext={`${data?.kpis.totalSessions ?? 0} session(s) · excludes approved`}
              tone={data?.kpis.attendanceRate !== null ? 'brand' : 'default'}
            />
            <KpiCard
              label="Weighted Performance Score"
              value={formatPct(data?.kpis.averagePerformanceScore)}
              subtext={`${data?.kpis.scoredParticipants ?? 0}/${data?.kpis.totalParticipants ?? 0} meet 50% evidence gate`}
              tone={data?.kpis.averagePerformanceScore !== null ? 'brand' : 'default'}
            />
            <KpiCard
              label="Learning Growth (Pre → Post)"
              value={formatGrowth(data?.kpis.averageLearningGrowth)}
              subtext={
                data?.kpis.averageNormalizedGainPct !== null &&
                data?.kpis.averageNormalizedGainPct !== undefined
                  ? `Hake Normalized Gain: ${data.kpis.averageNormalizedGainPct}%`
                  : 'Requires paired pre & post scores'
              }
              tone={
                data?.kpis.averageLearningGrowth !== null &&
                data?.kpis.averageLearningGrowth !== undefined &&
                data.kpis.averageLearningGrowth >= 0
                  ? 'positive'
                  : 'default'
              }
            />
            <KpiCard
              label="STEM Project Completion"
              value={formatPct(data?.kpis.projectCompletionRate)}
              subtext={`${data?.kpis.completedProjectsCount ?? 0} of ${data?.kpis.expectedProjectsCount ?? 0} expected deliverables`}
            />
            <KpiCard
              label="Assessment Completion"
              value={formatPct(data?.kpis.assessmentCompletionRate)}
              subtext={
                data?.kpis.averageAssessmentScore !== null
                  ? `Mean assessment score: ${data?.kpis.averageAssessmentScore}%`
                  : 'No graded assessments in scope'
              }
            />
            <KpiCard
              label="Programme Completion"
              value={formatPct(data?.kpis.programmeCompletionRate)}
              subtext="Participants marked completed"
            />
            <KpiCard
              label="Confirmed Impact Objectives"
              value={`${data?.kpis.confirmedObjectivesCount ?? 0} / ${data?.kpis.totalObjectivesCount ?? 0}`}
              subtext={
                data?.kpis.averageCompletenessPct !== null
                  ? `Avg evidence completeness: ${data?.kpis.averageCompletenessPct}%`
                  : 'Configure objectives in Programmes'
              }
            />
          </>
        )}
      </section>

      {/* Onboarding Action Bar when workspace has no programmes yet */}
      {!loading && isStaff && data && data.kpis.totalProgrammes === 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Start configuring your first CCI STEM Connect programme
            </h3>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              No programmes have been created yet. Create a programme, define cohorts, STEM tracks,
              learning objectives, and sessions, then register participants individually or via CSV.
            </p>
          </div>
          {(user?.role === 'super_admin' || user?.role === 'programme_manager') && (
            <button
              type="button"
              onClick={() => onNavigate('programmes')}
              className="px-4 py-2.5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Create First Programme</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </section>
      )}

      {/* Row 1 Analytics: Participant Performance Distribution + Programme Impact Indicators */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Participant Performance Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Classification bands computed directly from individual participant scorecards
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('performance')}
              className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
            >
              Performance Engine
            </button>
          </div>

          {data && data.kpis.totalParticipants > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.performanceDistribution}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="categoryName"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`${value ?? 0} participant(s)`, 'Count']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Participants" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {data.performanceDistribution.map((entry, idx) => (
                      <Cell
                        key={entry.categoryName}
                        fill={getDistributionFill(entry.categoryName, idx)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">No participant records in scope</p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Register participants and record attendance or assessments to populate performance
                classifications.
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Programme Impact Indicators
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live mean domain scores across configured scoring indicators
              </p>
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {(data?.domainAverages ?? []).map((dom) => (
              <li key={dom.domain} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{dom.label}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      Weight {dom.configuredWeightPct}% · n = {dom.sampleSize}/
                      {data?.kpis.totalParticipants ?? 0} ({dom.coveragePct}%)
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900 shrink-0">
                    {formatPct(dom.averageScore)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B5121B] rounded-full transition-all"
                    style={{ width: `${dom.averageScore ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Row 2 Analytics: Session Attendance & Engagement Trend + Assessment Outcomes & Growth */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Session Attendance &amp; Engagement Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Session-level attendance rate and engagement score (%) across reporting period
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
            >
              Attendance Register
            </button>
          </div>

          {sessionChartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sessionChartData}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="sessionDate"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [`${value ?? 0}%`, String(name)]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="attendanceRate"
                    name="Attendance %"
                    stroke="#B5121B"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#B5121B' }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="engagementPct"
                    name="Engagement %"
                    stroke="#0F766E"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#0F766E' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">No session attendance recorded</p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Mark session attendance in the Attendance module to plot attendance and engagement
                trends over time.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Assessment Outcomes &amp; Learning Growth
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mean score (%) across graded assessment instruments
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assessments')}
              className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
            >
              Open Grading
            </button>
          </div>

          {data && data.learningGrowthSummary.pairedRecordsCount > 0 && (
            <div className="mb-4 pb-3 border-b border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span className="text-slate-500">
                Paired Pre→Post ({data.learningGrowthSummary.pairedRecordsCount}):
              </span>
              <span className="font-mono tabular-nums text-slate-800">
                Pre {formatPct(data.learningGrowthSummary.averagePrePct)} → Post{' '}
                {formatPct(data.learningGrowthSummary.averagePostPct)}
              </span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  (data.learningGrowthSummary.averageDelta ?? 0) >= 0
                    ? 'text-teal-700'
                    : 'text-rose-700'
                }`}
              >
                {formatGrowth(data.learningGrowthSummary.averageDelta)}
              </span>
              {data.learningGrowthSummary.averageNormalizedGainPct !== null && (
                <span className="font-mono tabular-nums text-slate-600">
                  Gain {data.learningGrowthSummary.averageNormalizedGainPct}%
                </span>
              )}
            </div>
          )}

          {gradedAssessmentChartData.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={gradedAssessmentChartData}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="title"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`${value ?? 0}%`, 'Mean Score']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="averagePct"
                    name="Mean Score (%)"
                    fill="#B5121B"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">No graded assessments in scope</p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Create rubric-based assessments and grade learner submissions to populate assessment
                outcomes and pre-to-post learning growth.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Row 3: Cohort / Session Delivery Tables & Objectives / Learning Outcomes */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {isStaff && (
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {opsTab === 'cohorts'
                    ? 'Cohort Delivery & Project Completion'
                    : 'Session-Level Attendance & Engagement'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {opsTab === 'cohorts'
                    ? 'Cohort-level attendance, project delivery, growth, and weighted performance'
                    : 'Session-by-session register breakdown across the reporting period'}
                </p>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setOpsTab('cohorts')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    opsTab === 'cohorts'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cohorts ({data?.cohortBreakdown.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setOpsTab('sessions')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    opsTab === 'sessions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sessions ({data?.sessionTrend.length ?? 0})
                </button>
              </div>
            </div>

            {opsTab === 'cohorts' ? (
              data && data.cohortBreakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                        <th className="py-3 px-6">Cohort</th>
                        <th className="py-3 px-3 text-right">Learners</th>
                        <th className="py-3 px-3 text-right">Attendance</th>
                        <th className="py-3 px-3 text-right">Projects</th>
                        <th className="py-3 px-3 text-right">Growth</th>
                        <th className="py-3 px-6 text-right">Weighted Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.cohortBreakdown.map((c) => (
                        <tr key={c.cohortId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-6">
                            <p className="font-medium text-slate-900">{c.name}</p>
                            <p className="text-xs capitalize text-slate-500">{c.status}</p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-800">
                            {c.participants}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-800">
                            {formatPct(c.attendanceRateNullable)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-800">
                            {formatPct(c.projectCompletionRate)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-teal-700">
                            {formatGrowth(c.averageLearningGrowth)}
                          </td>
                          <td className="py-3 px-6 text-right font-mono font-semibold tabular-nums text-xs text-slate-900">
                            {formatPct(c.averagePerformanceScore)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-10 text-xs text-slate-500 text-center">
                  No cohorts found for the selected filter.
                </p>
              )
            ) : data && data.sessionTrend.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                      <th className="py-3 px-6">Session</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3 text-right">P / L / A</th>
                      <th className="py-3 px-3 text-right">Attendance</th>
                      <th className="py-3 px-6 text-right">Engagement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...data.sessionTrend].reverse().slice(0, 10).map((s) => (
                      <tr key={s.sessionId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-6">
                          <p className="font-medium text-slate-900 truncate max-w-[200px]">
                            {s.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {s.cohortName}
                            {s.trackName ? ` · ${s.trackName}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {s.sessionDate}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {s.recordedCount > 0
                            ? `${s.presentCount} / ${s.lateCount} / ${s.absentCount}`
                            : 'Not marked'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-xs text-slate-900">
                          {formatPct(s.attendanceRate)}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-xs text-teal-700">
                          {formatPct(s.engagementPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-10 text-xs text-slate-500 text-center">
                No sessions scheduled in the selected reporting period.
              </p>
            )}
          </div>
        )}

        <div
          className={`${
            isStaff ? 'lg:col-span-5' : 'lg:col-span-12'
          } bg-white rounded-xl border border-slate-200 p-6 space-y-5`}
        >
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Programme Objectives &amp; Outcomes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Official objectives and measured learning outcome attainment
              </p>
            </div>
            {isStaff && (
              <button
                type="button"
                onClick={() => onNavigate('programmes')}
                className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
              >
                Configure
              </button>
            )}
          </div>

          {data && data.objectives.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.objectives.slice(0, 5).map((obj) => (
                <li key={obj.id} className="py-2.5 first:pt-0 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{obj.title}</p>
                    {obj.targetMetric && (
                      <p className="text-xs text-slate-500 mt-0.5">Target: {obj.targetMetric}</p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${
                      obj.isConfirmed ? 'text-teal-700' : 'text-amber-700'
                    }`}
                  >
                    {obj.isConfirmed ? 'Confirmed' : 'Pending review'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-xs text-slate-500 text-center">
              No programme objectives configured yet.
            </p>
          )}

          {data && data.learningOutcomes.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Measurable Learning Outcomes ({data.learningOutcomes.length})
              </p>
              <ul className="divide-y divide-slate-100 text-xs">
                {data.learningOutcomes.slice(0, 4).map((lo) => (
                  <li key={lo.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-teal-700 mr-1.5">
                        {lo.code}
                      </span>
                      <span className="text-slate-700">{lo.statement}</span>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p className="text-slate-500">Target ≥ {Number(lo.targetProficiencyPct)}%</p>
                      {lo.achievedAvgPct !== null && (
                        <p
                          className={`font-semibold ${
                            lo.achievedAvgPct >= Number(lo.targetProficiencyPct)
                              ? 'text-teal-700'
                              : 'text-amber-700'
                          }`}
                        >
                          Actual {lo.achievedAvgPct}% ({lo.meetingTargetCount}/{lo.evaluatedCount})
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Row 4: Underlying Participant Records Verification Table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {isStaff ? 'Underlying Participant Records' : 'My Verified Performance Record'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any participant row to verify domain weights and evidence counts; footer totals
              reconcile directly with KPI cards above.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isStaff && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Filter learners..."
                  className="h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-xs w-48 focus:outline-none focus:border-[#B5121B]"
                />
              </div>
            )}
            <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
              {filteredParticipantRecords.length} record(s)
            </span>
          </div>
        </div>

        {filteredParticipantRecords.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No participant records match the current dashboard scope and filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Participant</th>
                  <th className="py-3 px-4">Cohort / Track</th>
                  <th className="py-3 px-4 text-right">Attendance</th>
                  <th className="py-3 px-4 text-right">Assessments</th>
                  <th className="py-3 px-4 text-right">Projects</th>
                  <th className="py-3 px-4 text-right">Growth (Δ)</th>
                  <th className="py-3 px-4 text-right">Completeness</th>
                  <th className="py-3 px-4 text-right">Weighted Score</th>
                  <th className="py-3 px-6 text-right">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParticipantRecords.map((p) => (
                  <tr
                    key={p.participantId}
                    onClick={() => setAuditedParticipant(p)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-6">
                      <p className="font-medium text-slate-900">{p.fullName}</p>
                      <p className="text-xs font-mono text-slate-500">{p.participantCode}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      <p className="font-medium text-slate-800">{p.cohortName}</p>
                      <p className="text-slate-500">{p.trackName ?? 'No track'}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                      {formatPct(p.attendanceRate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                      {formatPct(p.averageAssessmentPct)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                      {p.projectsExpected > 0
                        ? `${p.projectsCompleted}/${p.projectsExpected}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-teal-700">
                      {formatGrowth(p.learningGrowthDelta)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                      {p.dataCompletenessPct}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-xs text-slate-900">
                      {p.overallScore !== null ? `${p.overallScore}%` : 'Withheld'}
                    </td>
                    <td className="py-3 px-6 text-right text-xs font-semibold">
                      <span className={getClassificationColor(p.classification)}>
                        {p.classificationDisplay}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-800">
                  <td className="py-3 px-6" colSpan={2}>
                    Reconciled Table Average ({filteredParticipantRecords.length} learners ·{' '}
                    {reconciliationTotals.scoredCount} scored)
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatPct(reconciliationTotals.avgAttendance)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatPct(reconciliationTotals.avgAssessment)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {reconciliationTotals.totalProjExpected > 0
                      ? `${reconciliationTotals.totalProjDone}/${reconciliationTotals.totalProjExpected}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-700">
                    {formatGrowth(reconciliationTotals.avgGrowth)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatPct(reconciliationTotals.avgCompleteness)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#8F0E15]">
                    {formatPct(reconciliationTotals.avgWeightedScore)}
                  </td>
                  <td className="py-3 px-6 text-right text-slate-500 font-normal">
                    Matches KPIs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Click-to-Audit Participant Calculation Drawer */}
      {auditedParticipant && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <p className="text-xs font-mono text-[#B5121B]">
                  {auditedParticipant.participantCode}
                </p>
                <h3 className="text-lg font-bold text-slate-900">
                  {auditedParticipant.fullName}
                </h3>
                <p className="text-xs text-slate-500">
                  {auditedParticipant.cohortName}
                  {auditedParticipant.trackName ? ` · ${auditedParticipant.trackName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditedParticipant(null)}
                aria-label="Close audit drawer"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">
              <div className="grid grid-cols-3 gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">Weighted Score</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {auditedParticipant.overallScore !== null
                      ? `${auditedParticipant.overallScore}%`
                      : 'Withheld'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Classification</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${getClassificationColor(
                      auditedParticipant.classification
                    )}`}
                  >
                    {auditedParticipant.classificationDisplay}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Evidence Coverage</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {auditedParticipant.dataCompletenessPct}%
                  </p>
                </div>
              </div>

              {auditedParticipant.dataQualityNotice && (
                <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                  <p className="font-semibold">Data Sufficiency Notice</p>
                  <p className="mt-0.5">{auditedParticipant.dataQualityNotice}</p>
                  {auditedParticipant.dataStatus === 'insufficient_data' &&
                    auditedParticipant.observedPartialScore !== null && (
                      <p className="mt-1 font-mono tabular-nums text-amber-800">
                        Observed partial average (not issued):{' '}
                        {auditedParticipant.observedPartialScore}%
                      </p>
                    )}
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Domain-by-Domain Verification
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2.5 px-3">Domain</th>
                        <th className="py-2.5 px-3 text-right">Config Wt</th>
                        <th className="py-2.5 px-3 text-right">Effective Wt</th>
                        <th className="py-2.5 px-3 text-right">Evidence</th>
                        <th className="py-2.5 px-3 text-right">Score</th>
                        <th className="py-2.5 px-3 text-right">Contrib.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditedParticipant.domains.map((dom) => (
                        <tr key={dom.domain}>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">{dom.label}</p>
                            <p className="text-slate-500">
                              {dom.isRequired ? 'Required' : 'Optional'} ·{' '}
                              {dom.status === 'available' ? 'Recorded' : 'Missing'}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {dom.configuredWeightPct}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {dom.effectiveWeightPct}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {dom.evidenceCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {dom.score !== null ? `${dom.score}%` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-700">
                            {dom.weightedContribution !== null
                              ? `+${dom.weightedContribution}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Attendance Breakdown</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Present</span>
                    <p className="font-mono font-semibold tabular-nums text-teal-700">
                      {auditedParticipant.attendance.presentCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Late (75% credit)</span>
                    <p className="font-mono font-semibold tabular-nums text-amber-700">
                      {auditedParticipant.attendance.lateCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Absent</span>
                    <p className="font-mono font-semibold tabular-nums text-rose-700">
                      {auditedParticipant.attendance.absentCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Approved (Excluded)</span>
                    <p className="font-mono font-semibold tabular-nums text-slate-600">
                      {auditedParticipant.attendance.approvedAbsenceCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtext,
  tone = 'default',
}: {
  label: string;
  value: string;
  subtext: string;
  tone?: 'default' | 'brand' | 'positive';
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight font-mono tabular-nums ${
          tone === 'brand'
            ? 'text-[#B5121B]'
            : tone === 'positive'
              ? 'text-teal-700'
              : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{subtext}</p>
    </div>
  );
}
