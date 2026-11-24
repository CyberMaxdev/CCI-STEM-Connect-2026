import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, History } from 'lucide-react';
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
    filtersApplied: Record<string, unknown>;
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
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reportType, setReportType] = useState<ReportType>('executive_programme_summary');

  const [data, setData] = useState<ReportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (programmeId) qs.set('programmeId', programmeId);
      if (cohortId) qs.set('cohortId', cohortId);
      if (trackId) qs.set('trackId', trackId);
      if (periodStart) qs.set('periodStart', periodStart);
      if (periodEnd) qs.set('periodEnd', periodEnd);
      const res = await apiFetch<ReportPreviewResponse>(
        `/api/reports/preview${qs.toString() ? `?${qs}` : ''}`
      );
      setData(res);
      if (!programmeId && res.report?.programme.id) {
        setProgrammeId(res.report.programme.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate report preview.');
    } finally {
      setLoading(false);
    }
  }, [programmeId, cohortId, trackId, periodStart, periodEnd]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const logExportEvent = async (format: 'PDF' | 'CSV_SCORECARDS' | 'CSV_COHORTS') => {
    if (!data?.report) return;
    try {
      await apiFetch('/api/reports/log', {
        method: 'POST',
        body: {
          reportType,
          programmeId: data.report.programme.id,
          reportingPeriodStart: periodStart || null,
          reportingPeriodEnd: periodEnd || null,
          filtersApplied: {
            format,
            cohortId: cohortId || 'all',
            trackId: trackId || 'all',
            periodStart: periodStart || null,
            periodEnd: periodEnd || null,
          },
          methodologySnapshot: {
            scoringModelName: data.report.scoringModel.name,
            totalParticipants: data.report.programmeSummary.totalParticipants,
            scoredParticipants: data.report.programmeSummary.scoredParticipants,
          },
        },
      });
      await loadPreview();
    } catch {
      // Download already succeeded; non-blocking log refresh
    }
  };

  const handleExportPdf = async () => {
    if (!data?.report) return;
    setExporting(true);
    setNotice(null);
    try {
      const cohortLabel = cohortId
        ? (data.filterOptions.cohorts.find((c) => c.id === cohortId)?.name ?? 'Selected Cohort')
        : 'All Cohorts';
      const trackLabel = trackId
        ? (data.filterOptions.tracks.find((t) => t.id === trackId)?.name ?? 'Selected Track')
        : 'All STEM Tracks';

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

      await logExportEvent('PDF');
      setNotice('Official PDF programme report downloaded and recorded in audit history.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportScorecardsCsv = async () => {
    if (!data?.report) return;
    setExporting(true);
    setNotice(null);
    try {
      downloadCsv(
        `CCI-Scorecards-${data.report.programme.code}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Participant ID',
          'Full Name',
          'Cohort',
          'STEM Track',
          'Status',
          'Attendance (%)',
          'Pre-Post Growth (pts)',
          'Hake Gain (%)',
          'Data Completeness (%)',
          'Data Status',
          'Weighted Score (%)',
          'Classification',
        ],
        data.report.participants.map((p) => [
          p.participantCode,
          p.fullName,
          p.cohortName,
          p.trackName ?? '',
          p.participantStatus,
          p.attendance.rawAttendanceRate ?? '',
          p.learningGrowth.averageAbsoluteDelta ?? '',
          p.learningGrowth.averageNormalizedGainPct ?? '',
          p.dataCompletenessPct,
          p.dataStatus,
          p.overallScore ?? '',
          p.classificationDisplay,
        ])
      );
      await logExportEvent('CSV_SCORECARDS');
      setNotice('Participant scorecards CSV downloaded and logged.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCohortsCsv = async () => {
    if (!data?.report) return;
    setExporting(true);
    setNotice(null);
    try {
      downloadCsv(
        `CCI-Cohort-Summary-${data.report.programme.code}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Cohort',
          'Status',
          'Total Learners',
          'Scored Learners',
          'Insufficient Data',
          'Attendance (%)',
          'Learning Growth (pts)',
          'Completeness (%)',
          'Weighted Average (%)',
        ],
        data.report.cohortSummaries.map((c) => [
          c.cohortName,
          c.status,
          c.summary.totalParticipants,
          c.summary.scoredParticipants,
          c.summary.insufficientDataParticipants,
          c.summary.averageAttendanceRate ?? '',
          c.summary.averageLearningGrowthDelta ?? '',
          c.summary.averageCompletenessPct ?? '',
          c.summary.averageOverallScore ?? '',
        ])
      );
      await logExportEvent('CSV_COHORTS');
      setNotice('Cohort comparison CSV downloaded and logged.');
    } finally {
      setExporting(false);
    }
  };

  const report = data?.report;

  return (
    <div className="space-y-6">
      {/* Header & Primary Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Programme Reporting & Institutional Exports
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Generate audit-ready executive PDFs and sanitized CSV datasets directly from verified PostgreSQL records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportCohortsCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Cohorts CSV
          </button>
          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportScorecardsCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Scorecards CSV
          </button>
          <button
            type="button"
            disabled={!report || exporting}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            Export PDF Report
          </button>
        </div>
      </div>

      {/* Report Configuration Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              {(Object.entries(REPORT_TYPE_LABELS) as Array<[ReportType, string]>).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Programme</label>
            <select
              value={programmeId}
              onChange={(e) => {
                setProgrammeId(e.target.value);
                setCohortId('');
                setTrackId('');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              {(data?.filterOptions.programmes ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cohort</label>
            <select
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">All Cohorts</option>
              {(data?.filterOptions.cohorts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">STEM Track</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">All STEM Tracks</option>
              {(data?.filterOptions.tracks ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-[#8F0E15]">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-800">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : !report ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Create a programme and enrol participants to preview and export institutional reports.
        </div>
      ) : (
        <>
          {/* Live Report Document Preview */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
              <div>
                <p className="text-xs font-medium text-[#B5121B]">
                  {REPORT_TYPE_LABELS[reportType]}
                </p>
                <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                  {report.programme.code} — {report.programme.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 tabular-nums">
                Scoring Model: {report.scoringModel.name}
                {periodStart || periodEnd
                  ? ` · Window: ${periodStart || 'Start'} to ${periodEnd || 'Present'}`
                  : ''}
              </p>
            </div>

            {/* Executive Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
              <div className="p-5">
                <p className="text-xs text-slate-500">Participants</p>
                <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {report.programmeSummary.totalParticipants}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {report.programmeSummary.scoredParticipants} scored
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Weighted Score Avg</p>
                <p className="text-xl font-semibold text-[#B5121B] mt-1 tabular-nums">
                  {report.programmeSummary.averageOverallScore !== null
                    ? `${report.programmeSummary.averageOverallScore}%`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  Median:{' '}
                  {report.programmeSummary.medianOverallScore !== null
                    ? `${report.programmeSummary.medianOverallScore}%`
                    : '—'}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Attendance Rate</p>
                <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {report.programmeSummary.averageAttendanceRate !== null
                    ? `${report.programmeSummary.averageAttendanceRate}%`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500">Excl. approved absences</p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Learning Growth (Δ)</p>
                <p className="text-xl font-semibold text-teal-700 mt-1 tabular-nums">
                  {report.programmeSummary.averageLearningGrowthDelta !== null
                    ? `${report.programmeSummary.averageLearningGrowthDelta >= 0 ? '+' : ''}${report.programmeSummary.averageLearningGrowthDelta} pts`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  Hake:{' '}
                  {report.programmeSummary.averageNormalizedGainPct !== null
                    ? `${report.programmeSummary.averageNormalizedGainPct}%`
                    : '—'}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Data Completeness</p>
                <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {report.programmeSummary.averageCompletenessPct !== null
                    ? `${report.programmeSummary.averageCompletenessPct}%`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {report.programmeSummary.insufficientDataParticipants} withheld
                </p>
              </div>
            </div>

            {/* Domain & Classification Tables Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
              <div className="p-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  5-Domain Performance Indicators
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Domain</th>
                        <th className="py-2 px-2 font-medium text-right">Weight</th>
                        <th className="py-2 px-2 font-medium text-right">Mean</th>
                        <th className="py-2 pl-2 font-medium text-right">Coverage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {report.programmeSummary.domainAverages.map((d) => (
                        <tr key={d.domain}>
                          <td className="py-2 pr-3 font-medium text-slate-800">{d.label}</td>
                          <td className="py-2 px-2 text-right text-slate-600">
                            {d.configuredWeightPct}%
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">
                            {d.averageScore !== null ? `${d.averageScore}%` : '—'}
                          </td>
                          <td className="py-2 pl-2 text-right text-slate-600">
                            {d.sampleSize}/{report.programmeSummary.totalParticipants} ({d.coveragePct}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Performance Classification Distribution
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Standing</th>
                        <th className="py-2 px-2 font-medium text-right">Range</th>
                        <th className="py-2 px-2 font-medium text-right">Count</th>
                        <th className="py-2 pl-2 font-medium text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {report.programmeSummary.classificationDistribution.map((b) => (
                        <tr key={b.categoryName}>
                          <td className="py-2 pr-3 font-medium text-slate-800">{b.categoryName}</td>
                          <td className="py-2 px-2 text-right text-slate-600">
                            {b.minScore !== null && b.maxScore !== null
                              ? `${b.minScore}–${b.maxScore}`
                              : '< 50% gate'}
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">
                            {b.count}
                          </td>
                          <td className="py-2 pl-2 text-right text-slate-600">{b.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Participant Scorecards Preview */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-900">
                  Underlying Participant Scorecards ({report.participants.length})
                </h4>
                <span className="text-xs text-slate-500">
                  Included in both PDF and Scorecards CSV exports
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-medium">ID</th>
                      <th className="py-2 px-3 font-medium">Participant</th>
                      <th className="py-2 px-3 font-medium">Cohort</th>
                      <th className="py-2 px-3 font-medium text-right">Attendance</th>
                      <th className="py-2 px-3 font-medium text-right">Growth (Δ)</th>
                      <th className="py-2 px-3 font-medium text-right">Evidence</th>
                      <th className="py-2 px-3 font-medium text-right">Weighted Score</th>
                      <th className="py-2 pl-3 font-medium">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {report.participants.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No participants match the selected report filters.
                        </td>
                      </tr>
                    ) : (
                      report.participants.map((p) => (
                        <tr key={p.participantId}>
                          <td className="py-2.5 pr-3 font-mono text-slate-600">
                            {p.participantCode}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{p.fullName}</td>
                          <td className="py-2.5 px-3 text-slate-600">{p.cohortName}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {p.attendance.rawAttendanceRate !== null
                              ? `${p.attendance.rawAttendanceRate}%`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {p.learningGrowth.averageAbsoluteDelta !== null
                              ? `${p.learningGrowth.averageAbsoluteDelta >= 0 ? '+' : ''}${p.learningGrowth.averageAbsoluteDelta}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {p.dataCompletenessPct}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                            {p.overallScore !== null ? `${p.overallScore}%` : 'Withheld'}
                          </td>
                          <td className="py-2.5 pl-3 text-slate-700">{p.classificationDisplay}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Generated Reports Audit History */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                Generated Reports Audit History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                    <th className="px-5 py-2.5 font-medium">Generated At</th>
                    <th className="px-4 py-2.5 font-medium">Report Type</th>
                    <th className="px-4 py-2.5 font-medium">Programme</th>
                    <th className="px-4 py-2.5 font-medium">Format</th>
                    <th className="px-4 py-2.5 font-medium">Period</th>
                    <th className="px-5 py-2.5 font-medium">Generated By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.history ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                        No report exports logged yet. Export a PDF or CSV report above to create an audit trail entry.
                      </td>
                    </tr>
                  ) : (
                    data!.history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-5 py-2.5 tabular-nums text-slate-600">
                          {new Date(h.generatedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {REPORT_TYPE_LABELS[h.reportType as ReportType] ?? h.reportType}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{h.programmeTitle ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">
                          {String(h.filtersApplied?.format ?? 'PDF')}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">
                          {h.reportingPeriodStart || h.reportingPeriodEnd
                            ? `${h.reportingPeriodStart ?? '...'} → ${h.reportingPeriodEnd ?? '...'}`
                            : 'Full Programme'}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">{h.generatedByName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
