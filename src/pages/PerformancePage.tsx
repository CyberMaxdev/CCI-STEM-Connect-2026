import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  createDefaultScoringModel,
  round2,
  validateScoringModelConfig,
  type ParticipantPerformanceResult,
  type PerformanceGroupAggregate,
  type ScoringIndicatorConfig,
  type ScoringModelConfig,
  type ScoringThresholdConfig,
} from '../lib/performance-engine';

interface CohortReport {
  cohortId: string;
  cohortName: string;
  status: string;
  summary: PerformanceGroupAggregate;
}

interface PerformanceReportResponse {
  scope: string;
  report: {
    programme: { id: string; code: string; title: string; status: string };
    scoringModel: ScoringModelConfig;
    programmeSummary: PerformanceGroupAggregate;
    cohortSummaries: CohortReport[];
    participants: ParticipantPerformanceResult[];
  } | null;
  filterOptions: {
    programmes: Array<{ id: string; code: string; title: string }>;
    cohorts: Array<{ id: string; name: string; programmeId: string }>;
    tracks: Array<{ id: string; name: string; programmeId: string }>;
  };
}

interface ConfigHistoryItem {
  id: string;
  name: string;
  isActive: boolean;
  isDefaultProposal: boolean;
  createdAt: string;
}

type EngineTab = 'scorecard' | 'configure' | 'formulas';

function formatScore(val: number | null | undefined, suffix = '%'): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val}${suffix}`;
}

function formatGrowth(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val >= 0 ? '+' : ''}${val} pts`;
}

function getClassificationColor(classification: string): string {
  const lower = classification.toLowerCase();
  if (lower.includes('insufficient')) return 'text-slate-500';
  if (lower.includes('distinction') || lower.includes('exemplary')) return 'text-[#8F0E15]';
  if (lower.includes('proficient')) return 'text-teal-700';
  if (lower.includes('developing')) return 'text-amber-700';
  return 'text-rose-700';
}

function getBarFill(categoryName: string, index: number): string {
  if (categoryName === 'Insufficient Data') return '#94A3B8';
  const palette = ['#B5121B', '#0F766E', '#D97706', '#64748B', '#475569'];
  return palette[index % palette.length];
}

export function PerformancePage() {
  const { user } = useAuth();
  const canConfigure = user?.role === 'super_admin' || user?.role === 'programme_manager';
  const isParticipant = user?.role === 'participant';

  const [activeTab, setActiveTab] = useState<EngineTab>('scorecard');
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState('');

  const [data, setData] = useState<PerformanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [auditParticipant, setAuditParticipant] = useState<ParticipantPerformanceResult | null>(
    null
  );

  // Configuration form state
  const [configName, setConfigName] = useState('');
  const [editIndicators, setEditIndicators] = useState<ScoringIndicatorConfig[]>([]);
  const [editThresholds, setEditThresholds] = useState<ScoringThresholdConfig[]>([]);
  const [configHistory, setConfigHistory] = useState<ConfigHistoryItem[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedProgrammeId) params.set('programmeId', selectedProgrammeId);
      if (selectedCohortId) params.set('cohortId', selectedCohortId);
      if (selectedTrackId) params.set('trackId', selectedTrackId);
      const qs = params.toString();

      const res = await apiFetch<PerformanceReportResponse>(
        `/api/performance/report${qs ? `?${qs}` : ''}`
      );
      setData(res);

      if (res.report) {
        if (!selectedProgrammeId) {
          setSelectedProgrammeId(res.report.programme.id);
        }
        setConfigName(
          res.report.scoringModel.isDefaultProposal
            ? `${res.report.programme.code} Official Scoring Model`
            : res.report.scoringModel.name
        );
        setEditIndicators(res.report.scoringModel.indicators.map((i) => ({ ...i })));
        setEditThresholds(
          [...res.report.scoringModel.thresholds]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => ({ ...t }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load performance calculations.');
    } finally {
      setLoading(false);
    }
  }, [selectedProgrammeId, selectedCohortId, selectedTrackId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const activeProgrammeId = data?.report?.programme.id ?? selectedProgrammeId;

  const loadConfigHistory = useCallback(async () => {
    if (!activeProgrammeId || isParticipant) return;
    try {
      const res = await apiFetch<{ history: ConfigHistoryItem[] }>(
        `/api/performance/config/${activeProgrammeId}`
      );
      setConfigHistory(res.history);
    } catch {
      // History is supplementary; main error handling is in loadReport
    }
  }, [activeProgrammeId, isParticipant]);

  useEffect(() => {
    if (activeTab === 'configure' && activeProgrammeId) {
      loadConfigHistory();
    }
  }, [activeTab, activeProgrammeId, loadConfigHistory]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const configValidation = useMemo(
    () => validateScoringModelConfig(editIndicators, editThresholds),
    [editIndicators, editThresholds]
  );

  const totalConfiguredWeight = useMemo(
    () => round2(editIndicators.reduce((sum, ind) => sum + (Number(ind.weightPct) || 0), 0)),
    [editIndicators]
  );

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProgrammeId) return;
    if (!configValidation.valid) {
      setError(configValidation.errors[0]);
      return;
    }

    try {
      setSavingConfig(true);
      setError(null);
      await apiFetch(`/api/performance/config/${activeProgrammeId}`, {
        method: 'POST',
        body: {
          name: configName.trim() || 'Programme Scoring Model',
          indicators: editIndicators.map((ind) => ({
            domain: ind.domain,
            label: ind.label.trim(),
            weightPct: Number(ind.weightPct),
            isRequired: ind.isRequired,
          })),
          thresholds: editThresholds.map((t, idx) => ({
            categoryName: t.categoryName.trim(),
            minScore: Number(t.minScore),
            maxScore: Number(t.maxScore),
            sortOrder: idx + 1,
          })),
        },
      });
      showToast('Scoring weights and performance bands saved and activated.');
      await loadReport();
      await loadConfigHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save scoring configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetDefaults = () => {
    const defaults = createDefaultScoringModel();
    setEditIndicators(defaults.indicators);
    setEditThresholds(defaults.thresholds);
  };

  const report = data?.report ?? null;
  const summary = report?.programmeSummary ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Performance Measurement Engine
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Weighted multi-domain scoring, attendance credit, pre-to-post learning growth, and
            missing-data safeguards across participants, cohorts, and programmes.
          </p>
        </div>

        {/* Segmented Navigation */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          {(
            [
              { id: 'scorecard', label: isParticipant ? 'My Scorecard' : 'Scorecard & Cohorts' },
              { id: 'configure', label: 'Scoring Model' },
              { id: 'formulas', label: 'Formulas & Policy' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters (Staff only) */}
      {!isParticipant && data && data.filterOptions.programmes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mr-1">
            <Sliders className="w-3.5 h-3.5 text-[#B5121B]" />
            <span>Scope</span>
          </div>
          <select
            aria-label="Select programme"
            value={selectedProgrammeId}
            onChange={(e) => {
              setSelectedProgrammeId(e.target.value);
              setSelectedCohortId('');
              setSelectedTrackId('');
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800"
          >
            {data.filterOptions.programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by cohort"
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
          >
            <option value="">All Cohorts</option>
            {data.filterOptions.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by STEM track"
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
          >
            <option value="">All STEM Tracks</option>
            {data.filterOptions.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {report && (
            <div className="ml-auto text-xs text-slate-500">
              Model:{' '}
              <span className="font-medium text-slate-800">{report.scoringModel.name}</span>
              {report.scoringModel.isDefaultProposal && (
                <span className="text-amber-700"> · Proposed Default</span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-900 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : !report ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {isParticipant
              ? 'No participant profile linked to your account yet'
              : 'No programmes available to evaluate'}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            {isParticipant
              ? 'Once a Programme Manager registers your email in a cohort, your domain scores, attendance, and learning growth will appear here automatically.'
              : 'Create a programme, enroll participants, and record attendance or assessments to run live performance intelligence.'}
          </p>
        </div>
      ) : (
        <>
          {/* Proposed Default Advisory Strip */}
          {report.scoringModel.isDefaultProposal && canConfigure && activeTab === 'scorecard' && (
            <div className="px-5 py-3.5 rounded-xl border border-amber-200 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-amber-900">
                <span className="font-semibold">Proposed Scoring Weights Active:</span> This
                programme is currently evaluated using the standard CCI STEM Connect proposal (20%
                Attendance, 25% Knowledge, 25% Practical STEM, 20% Projects, 10% Collaboration).
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('configure')}
                className="text-xs font-semibold text-[#B5121B] hover:text-[#8F0E15] underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Customize &amp; Confirm Weights
              </button>
            </div>
          )}

          {/* TAB 1: SCORECARD & COHORTS */}
          {activeTab === 'scorecard' && summary && (
            <div className="space-y-6">
              {/* Top KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">
                    {isParticipant ? 'Weighted Overall Score' : 'Average Weighted Score'}
                  </p>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatScore(summary.averageOverallScore)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {summary.scoredParticipants} of {summary.totalParticipants} meet 50% evidence
                    gate
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Attendance Rate</p>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatScore(summary.averageAttendanceRate)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Excludes approved absences · Late = 75% credit
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Learning Growth (Pre → Post)
                  </p>
                  <p
                    className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                      summary.averageLearningGrowthDelta !== null &&
                      summary.averageLearningGrowthDelta >= 0
                        ? 'text-teal-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {formatGrowth(summary.averageLearningGrowthDelta)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {summary.averageNormalizedGainPct !== null
                      ? `Normalized Gain: ${summary.averageNormalizedGainPct}%`
                      : 'Requires paired pre & post scores'}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Data Sufficiency</p>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatScore(summary.averageCompletenessPct)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {summary.completeParticipants} complete · {summary.provisionalParticipants}{' '}
                    provisional · {summary.insufficientDataParticipants} insufficient
                  </p>
                </div>
              </div>

              {/* Distribution Chart + Domain Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Performance Classification Distribution
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Participants below 50% weighted evidence remain in Insufficient Data.
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      n = {summary.totalParticipants}
                    </span>
                  </div>

                  {summary.totalParticipants === 0 ? (
                    <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                      No participants enrolled in the selected scope yet.
                    </div>
                  ) : (
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={summary.classificationDistribution}
                          margin={{ top: 8, right: 16, left: -12, bottom: 4 }}
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
                              fontSize: '12px',
                              borderRadius: '8px',
                              borderColor: '#E2E8F0',
                            }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {summary.classificationDistribution.map((entry, idx) => (
                              <Cell
                                key={entry.categoryName}
                                fill={getBarFill(entry.categoryName, idx)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Domain Performance Averages
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Each domain average includes only participants with recorded evidence.
                    </p>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {summary.domainAverages.map((dom) => (
                      <li key={dom.domain} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {dom.label}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              Weight {dom.configuredWeightPct}% · n = {dom.sampleSize}/
                              {summary.totalParticipants} ({dom.coveragePct}%)
                            </p>
                          </div>
                          <span className="text-sm font-bold font-mono tabular-nums text-slate-900 shrink-0">
                            {formatScore(dom.averageScore)}
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
              </div>

              {/* Cohort Comparison Table (Staff view) */}
              {!isParticipant && report.cohortSummaries.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Cohort Performance Rollup
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Identical weighted scoring rules aggregated consistently per cohort.
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {report.cohortSummaries.length} cohort(s)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                          <th className="py-3 px-6">Cohort</th>
                          <th className="py-3 px-4 text-right">Enrolled</th>
                          <th className="py-3 px-4 text-right">Scored / Insuff.</th>
                          <th className="py-3 px-4 text-right">Attendance</th>
                          <th className="py-3 px-4 text-right">Learning Growth</th>
                          <th className="py-3 px-4 text-right">Avg Weighted Score</th>
                          <th className="py-3 px-6 text-right">Avg Completeness</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.cohortSummaries.map((c) => (
                          <tr key={c.cohortId} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-6">
                              <p className="font-medium text-slate-900">{c.cohortName}</p>
                              <p className="text-xs capitalize text-slate-500">{c.status}</p>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                              {c.summary.totalParticipants}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                              {c.summary.scoredParticipants} /{' '}
                              <span className="text-slate-500">
                                {c.summary.insufficientDataParticipants}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                              {formatScore(c.summary.averageAttendanceRate)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-teal-700">
                              {formatGrowth(c.summary.averageLearningGrowthDelta)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                              {formatScore(c.summary.averageOverallScore)}
                            </td>
                            <td className="py-3.5 px-6 text-right font-mono tabular-nums text-xs text-slate-600">
                              {formatScore(c.summary.averageCompletenessPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Individual Participant Performance Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Individual Participant Scorecards
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select any participant row to inspect domain weights, evidence counts, and
                      missing-data handling.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {report.participants.length} participant(s)
                  </span>
                </div>

                {report.participants.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No participants found for this programme filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                          <th className="py-3 px-6">Participant</th>
                          <th className="py-3 px-4">Cohort / Track</th>
                          <th className="py-3 px-4 text-right">Attendance</th>
                          <th className="py-3 px-4 text-right">Growth (Δ)</th>
                          <th className="py-3 px-4 text-right">Completeness</th>
                          <th className="py-3 px-4 text-right">Weighted Score</th>
                          <th className="py-3 px-6 text-right">Classification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.participants.map((p) => (
                          <tr
                            key={p.participantId}
                            onClick={() => setAuditParticipant(p)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          >
                            <td className="py-3.5 px-6">
                              <p className="font-medium text-slate-900">{p.fullName}</p>
                              <p className="text-xs font-mono text-slate-500">
                                {p.participantCode}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-700">
                              <p className="font-medium text-slate-800">{p.cohortName}</p>
                              <p className="text-slate-500">{p.trackName ?? 'No track'}</p>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                              {formatScore(p.attendance.rawAttendanceRate)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-teal-700">
                              {formatGrowth(p.learningGrowth.averageAbsoluteDelta)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                              {p.dataCompletenessPct}%
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                              {p.overallScore !== null ? `${p.overallScore}%` : 'Withheld'}
                            </td>
                            <td className="py-3.5 px-6 text-right text-xs font-semibold">
                              <span className={getClassificationColor(p.classification)}>
                                {p.classificationDisplay}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONFIGURE SCORING MODEL */}
          {activeTab === 'configure' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleSaveConfig}
                className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Configurable Scoring Categories &amp; Thresholds
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Programme: <span className="font-medium text-slate-700">{report.programme.title}</span>.
                      Weights must sum to exactly 100.00%.
                    </p>
                  </div>
                  {canConfigure && (
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Load Proposed Defaults</span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Scoring Configuration Name *
                  </label>
                  <input
                    required
                    disabled={!canConfigure}
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    placeholder="CCI STEM Connect 2026 Official Scoring Model"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm disabled:bg-slate-50 focus:outline-none focus:border-[#B5121B]"
                  />
                </div>

                {/* Indicator Weights */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Performance Indicator Weights
                    </h4>
                    <span
                      className={`text-xs font-mono font-semibold tabular-nums ${
                        Math.abs(totalConfiguredWeight - 100) <= 0.01
                          ? 'text-teal-700'
                          : 'text-rose-700'
                      }`}
                    >
                      Total: {totalConfiguredWeight.toFixed(2)}% / 100.00%
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Indicator Label</th>
                          <th className="py-2.5 px-4 w-32">Weight (%)</th>
                          <th className="py-2.5 px-4 w-28 text-center">Required</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editIndicators.map((ind, idx) => (
                          <tr key={ind.domain}>
                            <td className="py-2.5 px-4">
                              <input
                                disabled={!canConfigure}
                                value={ind.label}
                                onChange={(e) => {
                                  const next = [...editIndicators];
                                  next[idx] = { ...ind, label: e.target.value };
                                  setEditIndicators(next);
                                }}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm disabled:bg-slate-50"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="number"
                                step="0.5"
                                min={0}
                                max={100}
                                disabled={!canConfigure}
                                value={ind.weightPct}
                                onChange={(e) => {
                                  const next = [...editIndicators];
                                  next[idx] = {
                                    ...ind,
                                    weightPct: Number(e.target.value),
                                  };
                                  setEditIndicators(next);
                                }}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm font-mono tabular-nums disabled:bg-slate-50"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <input
                                type="checkbox"
                                disabled={!canConfigure}
                                checked={ind.isRequired}
                                onChange={(e) => {
                                  const next = [...editIndicators];
                                  next[idx] = { ...ind, isRequired: e.target.checked };
                                  setEditIndicators(next);
                                }}
                                className="rounded border-slate-300"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Classification Thresholds */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Performance Classification Bands (0 – 100)
                    </h4>
                    {canConfigure && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditThresholds([
                            ...editThresholds,
                            {
                              categoryName: 'Custom Band',
                              minScore: 0,
                              maxScore: 0,
                              sortOrder: editThresholds.length + 1,
                            },
                          ])
                        }
                        className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Band</span>
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Classification Name</th>
                          <th className="py-2.5 px-4 w-32">Min Score</th>
                          <th className="py-2.5 px-4 w-32">Max Score</th>
                          {canConfigure && <th className="py-2.5 px-4 w-12" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editThresholds.map((band, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-4">
                              <input
                                disabled={!canConfigure}
                                value={band.categoryName}
                                onChange={(e) => {
                                  const next = [...editThresholds];
                                  next[idx] = { ...band, categoryName: e.target.value };
                                  setEditThresholds(next);
                                }}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm disabled:bg-slate-50"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                disabled={!canConfigure}
                                value={band.minScore}
                                onChange={(e) => {
                                  const next = [...editThresholds];
                                  next[idx] = { ...band, minScore: Number(e.target.value) };
                                  setEditThresholds(next);
                                }}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm font-mono tabular-nums disabled:bg-slate-50"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={100}
                                disabled={!canConfigure}
                                value={band.maxScore}
                                onChange={(e) => {
                                  const next = [...editThresholds];
                                  next[idx] = { ...band, maxScore: Number(e.target.value) };
                                  setEditThresholds(next);
                                }}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm font-mono tabular-nums disabled:bg-slate-50"
                              />
                            </td>
                            {canConfigure && (
                              <td className="py-2.5 px-4 text-right">
                                {editThresholds.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditThresholds(editThresholds.filter((_, i) => i !== idx))
                                    }
                                    aria-label="Remove threshold band"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {!configValidation.valid && (
                  <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1">
                    {configValidation.errors.map((msg, idx) => (
                      <p key={idx}>• {msg}</p>
                    ))}
                  </div>
                )}

                {canConfigure ? (
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingConfig || !configValidation.valid}
                      className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingConfig ? 'Saving Model...' : 'Save & Activate Model'}</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Read-only view. Only Super Administrators and Programme Managers may modify
                    scoring weights and classification bands.
                  </p>
                )}
              </form>

              {/* Configuration History Panel */}
              <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Saved Model Versions
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every update saves a timestamped configuration for auditability in reports.
                  </p>
                </div>

                {configHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No custom scoring model saved yet for this programme. The proposed CCI STEM
                    Connect baseline is currently active.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {configHistory.map((item) => (
                      <li key={item.id} className="py-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-slate-500 font-mono tabular-nums mt-0.5">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`font-semibold shrink-0 ${
                            item.isActive ? 'text-teal-700' : 'text-slate-400'
                          }`}
                        >
                          {item.isActive ? 'Active' : 'Archived'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FORMULAS & DATA POLICY */}
          {activeTab === 'formulas' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  Scoring Formulas &amp; Missing-Data Safeguards
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  All individual scorecards, cohort rollups, and programme reports execute this
                  exact deterministic specification.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-900">
                    1. Attendance Rate &amp; Engagement Domain
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Approved absences are excluded from the denominator so excused absences neither
                    inflate nor penalize scores. Late arrivals count in raw attendance but receive
                    75% credit in the weighted attendance domain.
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 space-y-1">
                    <p>Raw Attendance = (Present + Late) / Countable × 100</p>
                    <p>Weighted Attendance = (Present + 0.75 × Late) / Countable × 100</p>
                    <p>Domain Score = 0.70 × Weighted Attendance + 0.30 × Engagement%</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-900">
                    2. Pre-to-Post Learning Growth
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Measured strictly on paired pre-programme and post-programme assessments where
                    both scores exist. Once a paired post-test is graded, the diagnostic pre-test is
                    excluded from final Knowledge Acquisition mastery so growth is never penalized.
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 space-y-1">
                    <p>Absolute Growth (Δ) = Post% − Pre%</p>
                    <p>Hake Normalized Gain = (Post% − Pre%) / (100 − Pre%) × 100</p>
                    <p>Normalized Loss (if Post &lt; Pre) = (Post% − Pre%) / Pre% × 100</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-900">
                    3. Weighted Composite &amp; Proportional Re-Weighting
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Missing domains are never zero-filled (zero-filling would falsely depress
                    mid-programme learners before final projects are graded). Instead, weights are
                    proportionally normalized across domains with recorded evidence:
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 space-y-1">
                    <p>Weighted Score = Σ(Score_d × Weight_d) / Σ(Available Weight_d)</p>
                    <p>Effective Weight_d = (Weight_d / Available Weight) × 100</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-900">
                    4. Anti-Misleading-Score Sufficiency Gate
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    To prevent a single 100% quiz or one attended session from producing a false
                    &ldquo;Distinction&rdquo;, overall scores are governed by three explicit states:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>
                      <span className="font-semibold text-slate-900">Insufficient Data (&lt; 50% weight coverage):</span>{' '}
                      Overall score is withheld (null) and excluded from cohort/programme averages.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">Provisional (50%–99% coverage):</span>{' '}
                      Proportional score is shown clearly labeled &ldquo;(Provisional)&rdquo; with
                      missing required domains itemized.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-900">Complete (100% coverage):</span>{' '}
                      Final official score eligible for certification and final impact reports.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Participant Calculation Audit Drawer */}
      {auditParticipant && (
        <ParticipantAuditDrawer
          participant={auditParticipant}
          onClose={() => setAuditParticipant(null)}
        />
      )}
    </div>
  );
}

function ParticipantAuditDrawer({
  participant,
  onClose,
}: {
  participant: ParticipantPerformanceResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs font-mono text-[#B5121B]">{participant.participantCode}</p>
            <h3 className="text-lg font-bold text-slate-900">{participant.fullName}</h3>
            <p className="text-xs text-slate-500">
              {participant.cohortName}
              {participant.trackName ? ` · ${participant.trackName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-4 pb-5 border-b border-slate-200">
            <div>
              <p className="text-xs text-slate-500">Weighted Score</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {participant.overallScore !== null ? `${participant.overallScore}%` : 'Withheld'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Classification</p>
              <p
                className={`mt-1 text-sm font-semibold ${getClassificationColor(
                  participant.classification
                )}`}
              >
                {participant.classificationDisplay}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Evidence Coverage</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {participant.dataCompletenessPct}%
              </p>
            </div>
          </div>

          {participant.dataQualityNotice && (
            <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
              <p className="font-semibold">Data Sufficiency Notice</p>
              <p className="mt-0.5">{participant.dataQualityNotice}</p>
              {participant.dataStatus === 'insufficient_data' &&
                participant.observedPartialScore !== null && (
                  <p className="mt-1 font-mono tabular-nums text-amber-800">
                    Observed partial average (not issued): {participant.observedPartialScore}%
                  </p>
                )}
            </div>
          )}

          {/* Domain Calculation Trace */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">
              Domain-by-Domain Calculation Trace
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2.5 px-3">Domain</th>
                    <th className="py-2.5 px-3 text-right">Config Wt</th>
                    <th className="py-2.5 px-3 text-right">Effective Wt</th>
                    <th className="py-2.5 px-3 text-right">Evidence</th>
                    <th className="py-2.5 px-3 text-right">Domain Score</th>
                    <th className="py-2.5 px-3 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participant.domains.map((dom) => (
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
                        {dom.weightedContribution !== null ? `+${dom.weightedContribution}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attendance Breakdown */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Attendance Breakdown</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Present</span>
                <p className="font-mono font-semibold tabular-nums text-teal-700">
                  {participant.attendance.presentCount}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Late (75% credit)</span>
                <p className="font-mono font-semibold tabular-nums text-amber-700">
                  {participant.attendance.lateCount}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Absent</span>
                <p className="font-mono font-semibold tabular-nums text-rose-700">
                  {participant.attendance.absentCount}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Approved (Excluded)</span>
                <p className="font-mono font-semibold tabular-nums text-slate-600">
                  {participant.attendance.approvedAbsenceCount}
                </p>
              </div>
            </div>
          </div>

          {/* Pre-to-Post Learning Growth */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">
              Paired Pre-to-Post Learning Growth ({participant.learningGrowth.pairedCount})
            </h4>
            {participant.learningGrowth.pairs.length === 0 ? (
              <p className="text-xs text-slate-500">
                No completed paired pre-programme and post-programme assessments yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs">
                {participant.learningGrowth.pairs.map((pair) => (
                  <li
                    key={pair.postAssessmentId}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{pair.postAssessmentTitle}</p>
                      <p className="text-slate-500">
                        Paired with {pair.preAssessmentTitle} ({pair.prePct}% → {pair.postPct}%)
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p
                        className={`font-semibold ${
                          pair.absoluteDelta >= 0 ? 'text-teal-700' : 'text-rose-700'
                        }`}
                      >
                        {formatGrowth(pair.absoluteDelta)}
                      </p>
                      <p className="text-slate-500">Gain {pair.normalizedGainPct}%</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
