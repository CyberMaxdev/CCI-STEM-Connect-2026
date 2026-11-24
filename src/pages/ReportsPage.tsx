import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, FileText } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { downloadCsv, downloadProgrammeReportPdf } from '../lib/export-utils';
import type {
  ParticipantPerformanceResult,
  PerformanceGroupAggregate,
  ScoringModelConfig,
} from '../lib/performance-engine';

type ReportType =
  | 'executive_programme_summary'
  | 'cohort_performance_report'
  | 'participant_scorecards_export'
  | 'impact_and_outcomes_report';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  executive_programme_summary: 'Executive Programme Summary',
  cohort_performance_report: 'Cohort Performance Report',
  participant_scorecards_export: 'Participant Scorecards Export',
  impact_and_outcomes_report: 'Impact & Outcomes Report',
};

interface ReportPreviewResponse {
  report: {
    programme: { id: string; code: string; title: string; status: string };
    scoringModel: ScoringModelConfig;
    programmeSummary: PerformanceGroupAggregate;
    cohortSummaries: Array<{
      cohortId: string;
      cohortName: string;
      status: string;
      summary: PerformanceGroupAggregate;
    }>;
    participants: ParticipantPerformanceResult[];
  } | null;
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
  }>;
  history: Array<{
    id: string;
    reportType: string;
    programmeId: string | null;
    programmeTitle: string | null;
    reportingPeriodStart: string | null;
    reportingPeriodEnd: string | null;
    generatedByName: string;
    generatedAt: string;
  }>;
  filterOptions: {
    programmes: Array<{ id: string; code: string; title: string }>;
    cohorts: Array<{ id: string; name: string }>;
    tracks: Array<{ id: string; name: string }>;
  };
}

export function ReportsPage() {
  const [programmeId, setProgrammeId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [reportType, setReportType] = useState<ReportType>('executive_programme_summary');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const [data, setData] = useState<ReportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadPreview = useCallback(async (prog: string, coh: string, trk: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (prog) params.set('programmeId', prog);
      if (coh) params.set('cohortId', coh);
      if (trk) params.set('trackId', trk);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch<ReportPreviewResponse>(`/api/reports/preview${query}`);
      setData(res);
      if (!prog && res.report?.programme.id) {
        setProgrammeId(res.report.programme.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load programme report preview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreview(programmeId, cohortId, trackId);
  }, [programmeId, cohortId, trackId, loadPreview]);

  const logReportExport = async (format: 'pdf' | 'csv_scorecards' | 'csv_cohorts') => {
    if (!data?.report) return;
    try {
      await apiFetch('/api/reports/log', {
        method: 'POST',
        body: {
          reportType,
          programmeId: data.report.programme.id,
          filtersApplied: {
            cohortId: cohortId || 'all',
            trackId: trackId || 'all',
            exportFormat: format,
          },
          reportingPeriodStart: periodStart || null,
          reportingPeriodEnd: periodEnd || null,
          methodologySnapshot: {
            scoringModel: data.report.scoringModel.name,
            totalParticipants: data.report.programmeSummary.totalParticipants,
            scoredParticipants: data.report.programmeSummary.scoredParticipants,
            averageOverallScore: data.report.programmeSummary.averageOverallScore,
          },
        },
      });
      await loadPreview(programmeId, cohortId, trackId);
    } catch (err) {
      console.error('Failed to log report history:', err);
    }
  };

  const handleExportPdf = async () => {
    if (!data?.report) return;
    try {
      setExporting(true);
      const cohortLabel =
        data.filterOptions.cohorts.find((c) => c.id === cohortId)?.name ?? 'All Cohorts';
      const trackLabel =
        data.filterOptions.tracks.find((t) => t.id === trackId)?.name ?? 'All STEM Tracks';

      downloadProgrammeReportPdf({
        reportTitle: REPORT_TYPE_LABELS[reportType],
        programmeCode: data.report.programme.code,
        programmeTitle: data.report.programme.title,
        cohortLabel,
        trackLabel,
        generatedAt: new Date().toISOString(),
        scoringModel: data.report.scoringModel,
        summary: data.report.programmeSummary,
        cohorts: data.report.cohortSummaries,
        objectives: data.objectives,
        participants: data.report.participants,
      });

      await logReportExport('pdf');
      showToast('PDF programme report downloaded and logged to audit history.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportScorecardsCsv = async () => {
    if (!data?.report) return;
    try {
      setExporting(true);
      downloadCsv(
        `CCI-Scorecards-${data.report.programme.code}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Participant Code',
          'Full Name',
          'Cohort',
          'STEM Track',
          'Status',
          'Attendance %',
          'Learning Growth (pts)',
          'Hake Gain %',
          'Evidence Completeness %',
          'Weighted Score %',
          'Standing',
          'Data Status',
        ],
        data.report.participants.map((p) => [
          p.participantCode,
          p.fullName,
          p.cohortName,
          p.trackName ?? '',
          p.participantStatus,
          p.attendance.rawAttendanceRate !== null ? p.attendance.rawAttendanceRate : '',
          p.learningGrowth.averageAbsoluteDelta !== null
            ? p.learningGrowth.averageAbsoluteDelta
            : '',
          p.learningGrowth.averageNormalizedGainPct !== null
            ? p.learningGrowth.averageNormalizedGainPct
            : '',
          p.dataCompletenessPct,
          p.overallScore !== null ? p.overallScore : 'Withheld',
          p.classificationDisplay,
          p.dataStatus,
        ])
      );
      await logReportExport('csv_scorecards');
      showToast('Participant scorecards CSV downloaded and logged.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCohortsCsv = async () => {
    if (!data?.report) return;
    try {
      setExporting(true);
      downloadCsv(
        `CCI-Cohorts-${data.report.programme.code}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Cohort',
          'Status',
          'Total Learners',
          'Scored Learners',
          'Insufficient Data',
          'Avg Attendance %',
          'Avg Growth (pts)',
          'Weighted Avg Score %',
          'Final-Only Avg %',
          'Avg Completeness %',
        ],
        data.report.cohortSummaries.map((c) => [
          c.cohortName,
          c.status,
          c.summary.totalParticipants,
          c.summary.scoredParticipants,
          c.summary.insufficientDataParticipants,
          c.summary.averageAttendanceRate ?? '',
          c.summary.averageLearningGrowthDelta ?? '',
          c.summary.averageOverallScore ?? '',
          c.summary.finalOnlyAverageScore ?? '',
          c.summary.averageCompletenessPct ?? '',
        ])
      );
      await logReportExport('csv_cohorts');
      showToast('Cohort comparison CSV downloaded and logged.');
    } finally {
      setExporting(false);
    }
  };

  const report = data?.report;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Programme Reporting & Institutional Exports
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Generate audit-ready executive PDF reports and CSV datasets reconciled 1-to-1 with the
            Performance Measurement Engine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Export PDF Report</span>
          </button>

          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportScorecardsCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>Scorecards CSV</span>
          </button>

          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportCohortsCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>Cohort Rollup CSV</span>
          </button>
        </div>
      </div>

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

      {/* Report Configuration Filters */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Programme</label>
          <select
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value);
              setCohortId('');
              setTrackId('');
            }}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
          >
            {data?.filterOptions.programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Cohort</label>
          <select
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
          >
            <option value="">All Cohorts</option>
            {data?.filterOptions.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">STEM Track</label>
          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
          >
            <option value="">All Tracks</option>
            {data?.filterOptions.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
          >
            {Object.entries(REPORT_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Period Start</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Period End</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
          />
        </div>
      </section>

      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : !report ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          Create a programme first to generate executive reports and CSV exports.
        </div>
      ) : (
        <>
          {/* Live Executive Preview KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Total Participants</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {report.programmeSummary.totalParticipants}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {report.programmeSummary.scoredParticipants} scored ·{' '}
                {report.programmeSummary.insufficientDataParticipants} insufficient data
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Weighted Score Average</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#8F0E15]">
                {report.programmeSummary.averageOverallScore !== null
                  ? `${report.programmeSummary.averageOverallScore}%`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Final-only:{' '}
                {report.programmeSummary.finalOnlyAverageScore !== null
                  ? `${report.programmeSummary.finalOnlyAverageScore}%`
                  : '—'}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Average Attendance</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {report.programmeSummary.averageAttendanceRate !== null
                  ? `${report.programmeSummary.averageAttendanceRate}%`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Excludes approved absences</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Evidence Completeness</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {report.programmeSummary.averageCompletenessPct !== null
                  ? `${report.programmeSummary.averageCompletenessPct}%`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Model: {report.scoringModel.name}
              </p>
            </div>
          </div>

          {/* Domain & Classification Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">
                  Five-Domain Performance Summary
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-slate-500">
                      <th className="py-2.5 px-6 font-medium">Indicator Domain</th>
                      <th className="py-2.5 px-3 text-right font-medium">Weight</th>
                      <th className="py-2.5 px-3 text-right font-medium">Mean Score</th>
                      <th className="py-2.5 px-6 text-right font-medium">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {report.programmeSummary.domainAverages.map((d) => (
                      <tr key={d.domain}>
                        <td className="py-2.5 px-6 font-sans font-medium text-slate-800">
                          {d.label}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {d.configuredWeightPct}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                          {d.averageScore !== null ? `${d.averageScore}%` : '—'}
                        </td>
                        <td className="py-2.5 px-6 text-right text-slate-500">
                          {d.sampleSize}/{report.programmeSummary.totalParticipants} ({d.coveragePct}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">
                  Classification Distribution
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-slate-500">
                      <th className="py-2.5 px-6 font-medium">Standing Band</th>
                      <th className="py-2.5 px-3 text-right font-medium">Range</th>
                      <th className="py-2.5 px-3 text-right font-medium">Learners</th>
                      <th className="py-2.5 px-6 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {report.programmeSummary.classificationDistribution.map((b) => (
                      <tr key={b.categoryName}>
                        <td className="py-2.5 px-6 font-sans font-medium text-slate-800">
                          {b.categoryName}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {b.minScore !== null && b.maxScore !== null
                            ? `${b.minScore}–${b.maxScore}`
                            : '< 50% gate'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                          {b.count}
                        </td>
                        <td className="py-2.5 px-6 text-right text-slate-600">{b.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Cohort Comparison Table */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Cohort Performance Rollup</h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {report.cohortSummaries.length} cohorts
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Cohort</th>
                    <th className="py-3 px-3 text-right">Learners</th>
                    <th className="py-3 px-3 text-right">Scored</th>
                    <th className="py-3 px-3 text-right">Attendance</th>
                    <th className="py-3 px-3 text-right">Growth (Δ)</th>
                    <th className="py-3 px-6 text-right">Weighted Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-xs">
                  {report.cohortSummaries.map((c) => (
                    <tr key={c.cohortId}>
                      <td className="py-3 px-6 font-sans font-medium text-slate-900">
                        {c.cohortName}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {c.summary.totalParticipants}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {c.summary.scoredParticipants}/{c.summary.totalParticipants}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {c.summary.averageAttendanceRate !== null
                          ? `${c.summary.averageAttendanceRate}%`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {c.summary.averageLearningGrowthDelta !== null
                          ? `${c.summary.averageLearningGrowthDelta >= 0 ? '+' : ''}${c.summary.averageLearningGrowthDelta} pts`
                          : '—'}
                      </td>
                      <td className="py-3 px-6 text-right font-semibold text-slate-900">
                        {c.summary.averageOverallScore !== null
                          ? `${c.summary.averageOverallScore}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Generated Reports Audit History */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Generated Reports Audit History
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {(data?.history ?? []).length} logged exports
              </span>
            </div>
            {(data?.history ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No exports logged yet. Export a PDF or CSV report above to record an audit trail
                entry.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-slate-500">
                      <th className="py-2.5 px-6 font-medium">Timestamp</th>
                      <th className="py-2.5 px-4 font-medium">Report Type</th>
                      <th className="py-2.5 px-4 font-medium">Programme</th>
                      <th className="py-2.5 px-4 font-medium">Reporting Period</th>
                      <th className="py-2.5 px-6 text-right font-medium">Generated By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.history.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 px-6 font-mono tabular-nums text-slate-600">
                          {new Date(h.generatedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {REPORT_TYPE_LABELS[h.reportType as ReportType] ?? h.reportType}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{h.programmeTitle ?? '—'}</td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                          {h.reportingPeriodStart || h.reportingPeriodEnd
                            ? `${h.reportingPeriodStart ?? '…'} → ${h.reportingPeriodEnd ?? '…'}`
                            : 'Full Programme'}
                        </td>
                        <td className="py-2.5 px-6 text-right text-slate-700">
                          {h.generatedByName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
