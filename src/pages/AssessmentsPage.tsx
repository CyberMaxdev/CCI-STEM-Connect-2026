import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  type AssessmentCategory,
  CATEGORY_LABELS,
  DOMAIN_LABELS,
  type IndicatorDomain,
} from '../types';

interface AssessmentSummary {
  id: string;
  programmeId: string;
  cohortId: string | null;
  trackId: string | null;
  title: string;
  category: AssessmentCategory;
  indicatorDomain: IndicatorDomain;
  maxScore: number;
  pairedPreAssessmentId: string | null;
  dueDate: string | null;
  programmeTitle: string;
  cohortName: string;
  trackName: string | null;
  criteriaCount: number;
  gradedCount: number;
  eligibleCount: number;
  completionRate: number | null;
  averagePct: number | null;
}

interface RubricCriterion {
  id: string;
  criterionName: string;
  description: string | null;
  maxPoints: number;
}

interface GradingRosterRow {
  participantId: string;
  participantCode: string;
  fullName: string;
  participantStatus: string;
  result: {
    id: string;
    rawScore: number;
    percentageScore: number;
    feedback: string | null;
    gradedAt: string;
  } | null;
  learningGrowth: {
    prePct: number | null;
    absoluteDelta: number | null;
    relativePct: number | null;
    trend: 'improved' | 'declined' | 'unchanged' | 'incomplete';
  } | null;
}

interface AssessmentDetail {
  assessment: {
    id: string;
    programmeId: string;
    title: string;
    category: AssessmentCategory;
    indicatorDomain: IndicatorDomain;
    maxScore: number;
    pairedPreAssessmentId: string | null;
    dueDate: string | null;
    programmeTitle: string;
    cohortName: string;
  };
  criteria: RubricCriterion[];
  roster: GradingRosterRow[];
  metrics: {
    totalRoster: number;
    gradedCount: number;
    completionRate: number | null;
    averagePct: number | null;
  };
}

interface AssessmentLookups {
  programmes: Array<{ id: string; title: string; code: string }>;
  cohorts: Array<{ id: string; name: string; programmeId: string }>;
  tracks: Array<{ id: string; name: string; programmeId: string }>;
  sessions: Array<{ id: string; title: string; programmeId: string; cohortId: string }>;
}

export function AssessmentsPage() {
  const { user } = useAuth();

  if (user?.role === 'participant') {
    return <ParticipantAssessmentsView />;
  }

  return <StaffAssessmentsView />;
}

function StaffAssessmentsView() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [lookups, setLookups] = useState<AssessmentLookups>({
    programmes: [],
    cohorts: [],
    tracks: [],
    sessions: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [gradingRow, setGradingRow] = useState<GradingRosterRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoadingList(true);
      setError(null);
      const res = await apiFetch<{
        assessments: AssessmentSummary[];
        lookups: AssessmentLookups;
      }>('/api/assessments');
      setAssessments(res.assessments);
      setLookups(res.lookups);
      setSelectedId((prev) => {
        if (prev && res.assessments.some((a) => a.id === prev)) return prev;
        return res.assessments[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessments.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await apiFetch<AssessmentDetail>(`/api/assessments/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessment grading view.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Assessments & Rubric Grading
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Create pre/post assessments, quizzes, and practical STEM rubrics, then grade
            participants with strict maximum score validation and automatic learning growth
            tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="h-10 px-4 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Assessment</span>
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Assessments</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {assessments.length}
            </span>
          </div>

          {loadingList ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : assessments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No assessments created yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create an assessment with configurable rubric criteria to start grading
                participants.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {assessments.map((a) => {
                const isSelected = a.id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#B5121B] font-medium truncate">
                          {CATEGORY_LABELS[a.category]}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {a.gradedCount}/{a.eligibleCount}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-sm font-semibold truncate ${
                          isSelected ? 'text-[#8F0E15]' : 'text-slate-800'
                        }`}
                      >
                        {a.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {a.cohortName} · Max {a.maxScore} pts
                        {a.criteriaCount > 0 ? ` · ${a.criteriaCount} rubric criteria` : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Grading Workspace */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {!selectedId || !detail ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                {loadingDetail
                  ? 'Loading assessment rubric and roster...'
                  : 'Select an assessment to grade'}
              </p>
            </div>
          ) : (
            <div>
              <div className="p-6 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-[#B5121B]">
                    {CATEGORY_LABELS[detail.assessment.category]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{DOMAIN_LABELS[detail.assessment.indicatorDomain]}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {detail.assessment.programmeTitle} ({detail.assessment.cohortName})
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {detail.assessment.title}
                </h3>

                {/* Assessment Metrics Strip */}
                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Maximum Score</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                      {detail.assessment.maxScore} pts
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Graded Roster</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                      {detail.metrics.gradedCount} / {detail.metrics.totalRoster}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Completion Rate</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                      {detail.metrics.completionRate !== null
                        ? `${detail.metrics.completionRate}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Mean Score</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-teal-700">
                      {detail.metrics.averagePct !== null ? `${detail.metrics.averagePct}%` : '—'}
                    </p>
                  </div>
                </div>

                {/* Rubric Criteria Summary */}
                {detail.criteria.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Configured Rubric Criteria ({detail.criteria.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      {detail.criteria.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-baseline justify-between gap-2 py-1 border-b border-slate-100"
                        >
                          <span className="text-slate-800 font-medium truncate">
                            {c.criterionName}
                          </span>
                          <span className="font-mono tabular-nums text-slate-500 shrink-0">
                            {c.maxPoints} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Participant Grading Table */}
              {detail.roster.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No participants enrolled in the programme/cohort scope for this assessment.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                        <th className="py-3 px-6">Participant</th>
                        <th className="py-3 px-4 text-right">Raw Score</th>
                        <th className="py-3 px-4 text-right">Percentage</th>
                        {detail.assessment.pairedPreAssessmentId && (
                          <th className="py-3 px-4 text-right">Learning Growth</th>
                        )}
                        <th className="py-3 px-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.roster.map((row) => (
                        <tr key={row.participantId} className="hover:bg-slate-50/60">
                          <td className="py-3.5 px-6">
                            <p className="font-medium text-slate-900">{row.fullName}</p>
                            <p className="text-xs font-mono text-slate-500">
                              {row.participantCode}
                              {row.result?.feedback ? ` · Feedback recorded` : ''}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                            {row.result
                              ? `${row.result.rawScore} / ${detail.assessment.maxScore}`
                              : 'Not graded'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-[#8F0E15]">
                            {row.result ? `${row.result.percentageScore}%` : '—'}
                          </td>
                          {detail.assessment.pairedPreAssessmentId && (
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                              {row.learningGrowth && row.learningGrowth.absoluteDelta !== null ? (
                                <span
                                  className={
                                    row.learningGrowth.trend === 'improved'
                                      ? 'text-teal-700 font-semibold'
                                      : row.learningGrowth.trend === 'declined'
                                        ? 'text-rose-700 font-semibold'
                                        : 'text-slate-600'
                                  }
                                >
                                  {row.learningGrowth.absoluteDelta > 0 ? '+' : ''}
                                  {row.learningGrowth.absoluteDelta} pts
                                  {row.learningGrowth.relativePct !== null
                                    ? ` (${row.learningGrowth.relativePct > 0 ? '+' : ''}${row.learningGrowth.relativePct}%)`
                                    : ''}
                                </span>
                              ) : (
                                <span className="text-slate-400">Incomplete</span>
                              )}
                            </td>
                          )}
                          <td className="py-3.5 px-6 text-right">
                            <button
                              type="button"
                              onClick={() => setGradingRow(row)}
                              className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:border-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
                            >
                              {row.result ? 'Edit Grade' : 'Grade'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Assessment Modal */}
      {showCreateModal && (
        <CreateAssessmentModal
          lookups={lookups}
          existingAssessments={assessments}
          onClose={() => setShowCreateModal(false)}
          onCreated={async (newId) => {
            setShowCreateModal(false);
            showToast('Assessment and rubric criteria saved.');
            await loadList();
            setSelectedId(newId);
            await loadDetail(newId);
          }}
        />
      )}

      {/* Rubric Grading Modal */}
      {gradingRow && detail && (
        <RubricGradeModal
          assessment={detail.assessment}
          criteria={detail.criteria}
          row={gradingRow}
          onClose={() => setGradingRow(null)}
          onSaved={async () => {
            const name = gradingRow.fullName;
            setGradingRow(null);
            showToast(`Saved assessment score for ${name}.`);
            await Promise.all([loadDetail(detail.assessment.id), loadList()]);
          }}
        />
      )}
    </div>
  );
}

function CreateAssessmentModal({
  lookups,
  existingAssessments,
  onClose,
  onCreated,
}: {
  lookups: AssessmentLookups;
  existingAssessments: AssessmentSummary[];
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [programmeId, setProgrammeId] = useState(lookups.programmes[0]?.id ?? '');
  const [cohortId, setCohortId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AssessmentCategory>('practical_stem');
  const [indicatorDomain, setIndicatorDomain] = useState<IndicatorDomain>('practical_stem_skills');
  const [maxScore, setMaxScore] = useState('100');
  const [pairedPreId, setPairedPreId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [criteria, setCriteria] = useState<
    Array<{ criterionName: string; description: string; maxPoints: string }>
  >([
    { criterionName: 'Technical Accuracy', description: 'Correct engineering method and calculations', maxPoints: '40' },
    { criterionName: 'Practical Execution', description: 'Working prototype or experimental setup', maxPoints: '40' },
    { criterionName: 'Documentation & Analysis', description: 'Clear findings and error analysis', maxPoints: '20' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const progCohorts = useMemo(
    () => lookups.cohorts.filter((c) => c.programmeId === programmeId),
    [lookups.cohorts, programmeId]
  );
  const progTracks = useMemo(
    () => lookups.tracks.filter((t) => t.programmeId === programmeId),
    [lookups.tracks, programmeId]
  );
  const preCandidates = useMemo(
    () =>
      existingAssessments.filter(
        (a) => a.programmeId === programmeId && a.category === 'pre_programme'
      ),
    [existingAssessments, programmeId]
  );

  const criteriaSum = criteria.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);

      const cleanCriteria = criteria
        .filter((c) => c.criterionName.trim().length > 0 && Number(c.maxPoints) > 0)
        .map((c) => ({
          criterionName: c.criterionName.trim(),
          description: c.description.trim() || null,
          maxPoints: Number(c.maxPoints),
        }));

      const finalMax = cleanCriteria.length > 0 ? criteriaSum : Number(maxScore);
      if (finalMax <= 0) {
        setErr('Maximum score must be greater than zero.');
        return;
      }

      const res = await apiFetch<{ assessment: { id: string } }>('/api/assessments', {
        method: 'POST',
        body: {
          programmeId,
          cohortId: cohortId || null,
          trackId: trackId || null,
          title,
          category,
          indicatorDomain,
          maxScore: finalMax,
          pairedPreAssessmentId: category === 'post_programme' && pairedPreId ? pairedPreId : null,
          dueDate: dueDate || null,
          criteria: cleanCriteria,
        },
      });
      await onCreated(res.assessment.id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to create assessment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold text-slate-900">
            Create Assessment & Rubric
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Assessment Title *
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Module 2 Practical Robotics Evaluation"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Programme *</label>
              <select
                required
                value={programmeId}
                onChange={(e) => {
                  setProgrammeId(e.target.value);
                  setCohortId('');
                  setTrackId('');
                }}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">Select programme</option>
                {lookups.programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cohort Scope</label>
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">All Cohorts</option>
                {progCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">STEM Track</label>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">All Tracks</option>
                {progTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Assessment Type *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AssessmentCategory)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Performance Engine Domain *
              </label>
              <select
                value={indicatorDomain}
                onChange={(e) => setIndicatorDomain(e.target.value as IndicatorDomain)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                {Object.entries(DOMAIN_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Max Score {criteria.length > 0 ? '(from rubric)' : '*'}
              </label>
              <input
                type="number"
                min={1}
                step="0.5"
                value={criteria.length > 0 ? String(criteriaSum) : maxScore}
                disabled={criteria.length > 0}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            {category === 'post_programme' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pair with Pre-Assessment
                </label>
                <select
                  value={pairedPreId}
                  onChange={(e) => setPairedPreId(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
                >
                  <option value="">None</option>
                  {preCandidates.map((pre) => (
                    <option key={pre.id} value={pre.id}>
                      {pre.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Rubric Criteria Builder */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-800">
                  Rubric Criteria (Optional)
                </h4>
                <p className="text-xs text-slate-500">
                  Facilitators grade criterion-by-criterion; criteria points sum to total max score.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setCriteria((prev) => [
                    ...prev,
                    { criterionName: '', description: '', maxPoints: '10' },
                  ])
                }
                className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] cursor-pointer whitespace-nowrap"
              >
                + Add Criterion
              </button>
            </div>

            {criteria.map((c, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  value={c.criterionName}
                  onChange={(e) =>
                    setCriteria((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, criterionName: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Criterion name"
                  className="col-span-4 h-9 px-2.5 rounded-lg border border-slate-200 text-xs"
                />
                <input
                  value={c.description}
                  onChange={(e) =>
                    setCriteria((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, description: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Evaluation guidance"
                  className="col-span-5 h-9 px-2.5 rounded-lg border border-slate-200 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={c.maxPoints}
                  onChange={(e) =>
                    setCriteria((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, maxPoints: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Pts"
                  className="col-span-2 h-9 px-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove criterion"
                  className="col-span-1 flex justify-center p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !programmeId}
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RubricGradeModal({
  assessment,
  criteria,
  row,
  onClose,
  onSaved,
}: {
  assessment: AssessmentDetail['assessment'];
  criteria: RubricCriterion[];
  row: GradingRosterRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hasRubric = criteria.length > 0;
  const [rawScoreInput, setRawScoreInput] = useState(
    row.result ? String(row.result.rawScore) : ''
  );
  const [criteriaInputs, setCriteriaInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of criteria) {
      map[c.id] = '';
    }
    return map;
  });
  const [feedback, setFeedback] = useState(row.result?.feedback ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const computedScore = useMemo(() => {
    if (!hasRubric) {
      const n = Number(rawScoreInput);
      return rawScoreInput.trim() !== '' && !Number.isNaN(n) ? n : null;
    }
    const vals = criteria.map((c) => criteriaInputs[c.id]);
    if (vals.some((v) => !v || v.trim() === '' || Number.isNaN(Number(v)))) {
      return null;
    }
    return Number(vals.reduce((sum, v) => sum + Number(v), 0).toFixed(2));
  }, [hasRubric, rawScoreInput, criteria, criteriaInputs]);

  const previewPct =
    computedScore !== null && assessment.maxScore > 0
      ? Number(((computedScore / assessment.maxScore) * 100).toFixed(2))
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (hasRubric) {
      const numericMap: Record<string, number> = {};
      for (const c of criteria) {
        const val = Number(criteriaInputs[c.id]);
        if (criteriaInputs[c.id].trim() === '' || Number.isNaN(val)) {
          setErr(`Enter a score for "${c.criterionName}".`);
          return;
        }
        if (val < 0 || val > c.maxPoints) {
          setErr(`"${c.criterionName}" must be between 0 and ${c.maxPoints}.`);
          return;
        }
        numericMap[c.id] = val;
      }

      try {
        setSubmitting(true);
        await apiFetch(`/api/assessments/${assessment.id}/results`, {
          method: 'POST',
          body: {
            participantId: row.participantId,
            criteriaScores: numericMap,
            feedback: feedback.trim() || null,
          },
        });
        await onSaved();
      } catch (error) {
        setErr(error instanceof Error ? error.message : 'Unable to save grade.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const numericRaw = Number(rawScoreInput);
    if (rawScoreInput.trim() === '' || Number.isNaN(numericRaw)) {
      setErr('Enter a valid numeric score.');
      return;
    }
    if (numericRaw < 0 || numericRaw > assessment.maxScore) {
      setErr(`Score must be between 0 and ${assessment.maxScore}.`);
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch(`/api/assessments/${assessment.id}/results`, {
        method: 'POST',
        body: {
          participantId: row.participantId,
          rawScore: numericRaw,
          feedback: feedback.trim() || null,
        },
      });
      await onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to save grade.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <p className="text-xs font-mono text-[#B5121B]">{row.participantCode}</p>
            <h3 className="text-base font-bold text-slate-900">Grade: {row.fullName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          <p className="text-xs text-slate-600">
            Assessment: <span className="font-semibold text-slate-900">{assessment.title}</span> ·
            Max {assessment.maxScore} pts
          </p>

          {hasRubric ? (
            <div className="space-y-3">
              {criteria.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{c.criterionName}</p>
                    {c.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      required
                      min={0}
                      max={c.maxPoints}
                      step="0.5"
                      value={criteriaInputs[c.id] ?? ''}
                      onChange={(e) =>
                        setCriteriaInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      className="w-20 h-9 px-2.5 rounded-lg border border-slate-200 text-sm font-mono tabular-nums text-right"
                    />
                    <span className="text-xs font-mono text-slate-500 w-12">
                      / {c.maxPoints}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Raw Score (0 – {assessment.maxScore}) *
              </label>
              <input
                type="number"
                required
                min={0}
                max={assessment.maxScore}
                step="0.5"
                value={rawScoreInput}
                onChange={(e) => setRawScoreInput(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
          )}

          {/* Computed Live Total */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Calculated Total</p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                {computedScore !== null ? `${computedScore} / ${assessment.maxScore}` : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Percentage</p>
              <p className="text-lg font-bold font-mono tabular-nums text-teal-700">
                {previewPct !== null ? `${previewPct}%` : '—'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Facilitator Feedback
            </label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Strengths observed, technical corrections, and recommended next steps..."
              className="w-full p-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Grade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ParticipantAssessmentsView() {
  const [results, setResults] = useState<
    Array<{
      id: string;
      assessmentTitle: string;
      category: AssessmentCategory | null;
      rawScore: number;
      maxScore: number | null;
      percentageScore: number;
      feedback: string | null;
      gradedAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{
      results: Array<{
        id: string;
        assessmentTitle: string;
        category: AssessmentCategory | null;
        rawScore: number;
        maxScore: number | null;
        percentageScore: number;
        feedback: string | null;
        gradedAt: string;
      }>;
    }>('/api/assessments/my/results')
      .then((res) => setResults(res.results))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          My Assessment Results
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Graded scores and facilitator feedback recorded for your participant profile.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading assessment results...</div>
        ) : results.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No graded assessments have been published for your profile yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Assessment</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-right">Percentage</th>
                <th className="py-3 px-6">Facilitator Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="py-3.5 px-6">
                    <p className="font-medium text-slate-900">{r.assessmentTitle}</p>
                    {r.category && (
                      <p className="text-xs text-slate-500">{CATEGORY_LABELS[r.category]}</p>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                    {r.rawScore} / {r.maxScore ?? '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-sm font-semibold text-teal-700">
                    {r.percentageScore}%
                  </td>
                  <td className="py-3.5 px-6 text-xs text-slate-600">{r.feedback ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
