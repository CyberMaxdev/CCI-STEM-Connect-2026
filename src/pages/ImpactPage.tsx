import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Plus, Trash2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api';

interface ImpactResponse {
  programme: {
    id: string;
    code: string;
    title: string;
    status: string;
  } | null;
  objectives: Array<{
    id: string;
    title: string;
    description: string | null;
    targetMetric: string | null;
    isConfirmed: boolean;
  }>;
  outcomes: Array<{
    id: string;
    code: string;
    statement: string;
    objectiveId: string | null;
    objectiveTitle: string | null;
    targetProficiencyPct: number;
    achievedAvgPct: number | null;
    evaluatedCount: number;
    meetingTargetCount: number;
    attainmentRatePct: number | null;
    mappings: Array<{
      id: string;
      assessmentId: string | null;
      assessmentTitle: string | null;
      projectId: string | null;
      projectTitle: string | null;
      evidenceWeight: number;
    }>;
  }>;
  growthByPair: Array<{
    postAssessmentId: string;
    postTitle: string;
    preTitle: string;
    pairedLearners: number;
    avgPrePct: number;
    avgPostPct: number;
    avgDelta: number;
    avgNormalizedGainPct: number;
    improvedPct: number;
  }>;
  performanceSummary: {
    totalParticipants: number;
    scoredParticipants: number;
    averageOverallScore: number | null;
    averageAttendanceRate: number | null;
    averageLearningGrowthDelta: number | null;
    averageNormalizedGainPct: number | null;
  } | null;
  availableAssessments: Array<{ id: string; title: string; category: string }>;
  availableProjects: Array<{ id: string; title: string }>;
  filterOptions: {
    programmes: Array<{ id: string; code: string; title: string }>;
    cohorts: Array<{ id: string; name: string }>;
  };
}

export function ImpactPage() {
  const [programmeId, setProgrammeId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Inline evidence mapping form state
  const [mappingOutcomeId, setMappingOutcomeId] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState<'assessment' | 'project'>('assessment');
  const [evidenceId, setEvidenceId] = useState('');
  const [evidenceWeight, setEvidenceWeight] = useState('100');
  const [savingMapping, setSavingMapping] = useState(false);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadImpact = useCallback(async (progId: string, cohId: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (progId) params.set('programmeId', progId);
      if (cohId) params.set('cohortId', cohId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch<ImpactResponse>(`/api/impact${query}`);
      setData(res);
      if (!progId && res.programme?.id) {
        setProgrammeId(res.programme.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load programme impact analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImpact(programmeId, cohortId);
  }, [programmeId, cohortId, loadImpact]);

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingOutcomeId || !evidenceId) return;
    try {
      setSavingMapping(true);
      setError(null);
      await apiFetch('/api/impact/mappings', {
        method: 'POST',
        body: {
          learningOutcomeId: mappingOutcomeId,
          assessmentId: evidenceType === 'assessment' ? evidenceId : null,
          projectId: evidenceType === 'project' ? evidenceId : null,
          evidenceWeight: Number(evidenceWeight) || 100,
        },
      });
      setMappingOutcomeId(null);
      setEvidenceId('');
      showToast('Evidence linked to learning outcome. Attainment recalculated.');
      await loadImpact(programmeId, cohortId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to map evidence.');
    } finally {
      setSavingMapping(false);
    }
  };

  const handleRemoveMapping = async (mappingId: string) => {
    try {
      setError(null);
      await apiFetch(`/api/impact/mappings/${mappingId}`, { method: 'DELETE' });
      showToast('Evidence mapping removed.');
      await loadImpact(programmeId, cohortId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove mapping.');
    }
  };

  const confirmedObjectives = data?.objectives.filter((o) => o.isConfirmed).length ?? 0;
  const totalObjectives = data?.objectives.length ?? 0;
  const mappedOutcomes = data?.outcomes.filter((o) => o.mappings.length > 0).length ?? 0;
  const totalOutcomes = data?.outcomes.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Programme Impact & Learning Outcome Attainment
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Map assessments and STEM projects to measurable learning outcomes and evaluate
            pre-to-post learning growth across cohorts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select Programme"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value);
              setCohortId('');
            }}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
          >
            {data?.filterOptions.programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Cohort"
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
          >
            <option value="">All Cohorts</option>
            {data?.filterOptions.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !data?.programme ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
          Create a programme with objectives and learning outcomes first to measure impact.
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Confirmed Objectives</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {confirmedObjectives}/{totalObjectives}
              </p>
              <p className="mt-1 text-xs text-slate-500">Institutional delivery benchmarks</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Outcomes with Mapped Evidence</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {mappedOutcomes}/{totalOutcomes}
              </p>
              <p className="mt-1 text-xs text-slate-500">Linked to assessments or projects</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Pre-to-Post Learning Growth</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#8F0E15]">
                {data.performanceSummary?.averageLearningGrowthDelta !== null &&
                data.performanceSummary?.averageLearningGrowthDelta !== undefined
                  ? `${data.performanceSummary.averageLearningGrowthDelta >= 0 ? '+' : ''}${data.performanceSummary.averageLearningGrowthDelta} pts`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Hake Gain:{' '}
                {data.performanceSummary?.averageNormalizedGainPct !== null &&
                data.performanceSummary?.averageNormalizedGainPct !== undefined
                  ? `${data.performanceSummary.averageNormalizedGainPct}%`
                  : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500">Weighted Performance Average</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {data.performanceSummary?.averageOverallScore !== null &&
                data.performanceSummary?.averageOverallScore !== undefined
                  ? `${data.performanceSummary.averageOverallScore}%`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {data.performanceSummary?.scoredParticipants ?? 0} of{' '}
                {data.performanceSummary?.totalParticipants ?? 0} participants scored
              </p>
            </div>
          </div>

          {/* Pre-to-Post Learning Growth Breakdown */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Paired Pre-to-Post Learning Growth
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Measured strictly from learners with both pre-programme and paired post-programme
                  assessment scores.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {data.growthByPair.length} paired evaluations
              </span>
            </div>

            {data.growthByPair.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                No paired pre/post assessment scores recorded yet. Link a Post-Programme assessment
                to a Pre-Programme baseline in the Assessments module to track learning growth.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.growthByPair}
                      margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="postTitle" tick={{ fontSize: 12, fill: '#475569' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} unit="%" />
                      <Tooltip formatter={(val) => [`${val ?? 0}%`, '']} />
                      <Legend />
                      <Bar dataKey="avgPrePct" name="Avg Pre-Assessment %" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgPostPct" name="Avg Post-Assessment %" fill="#B5121B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Pre → Post Assessment Pair</th>
                        <th className="py-2.5 px-3 text-right">Paired Learners</th>
                        <th className="py-2.5 px-3 text-right">Avg Pre</th>
                        <th className="py-2.5 px-3 text-right">Avg Post</th>
                        <th className="py-2.5 px-3 text-right">Mean Growth (Δ)</th>
                        <th className="py-2.5 px-3 text-right">Hake Gain</th>
                        <th className="py-2.5 px-4 text-right">Learners Improved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.growthByPair.map((g) => (
                        <tr key={g.postAssessmentId}>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{g.postTitle}</p>
                            <p className="text-xs text-slate-500">Baseline: {g.preTitle}</p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                            {g.pairedLearners}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                            {g.avgPrePct}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                            {g.avgPostPct}%
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${
                              g.avgDelta >= 0 ? 'text-teal-700' : 'text-rose-700'
                            }`}
                          >
                            {g.avgDelta >= 0 ? '+' : ''}
                            {g.avgDelta} pts
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                            {g.avgNormalizedGainPct}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                            {g.improvedPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Learning Outcomes & Evidence Mapping */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Measurable Learning Outcomes & Evidence Mapping
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Link assessments or evaluated STEM projects to calculate real proficiency
                  attainment rates.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {data.outcomes.length} outcomes
              </span>
            </div>

            {data.outcomes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No learning outcomes defined for this programme. Add learning outcomes in the
                Programmes module.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.outcomes.map((lo) => {
                  const isAddingHere = mappingOutcomeId === lo.id;
                  return (
                    <div key={lo.id} className="p-6 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-[#8F0E15]">{lo.code}</span>
                            {lo.objectiveTitle && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Objective: {lo.objectiveTitle}</span>
                              </>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-900">{lo.statement}</p>
                        </div>

                        <div className="flex items-center gap-6 shrink-0 text-right font-mono tabular-nums">
                          <div>
                            <p className="text-xs text-slate-400">Target</p>
                            <p className="text-sm font-semibold text-slate-700">
                              {lo.targetProficiencyPct}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Achieved Avg</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {lo.achievedAvgPct !== null ? `${lo.achievedAvgPct}%` : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Meeting Target</p>
                            <p
                              className={`text-sm font-semibold ${
                                lo.attainmentRatePct !== null && lo.attainmentRatePct >= 70
                                  ? 'text-teal-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {lo.evaluatedCount > 0
                                ? `${lo.meetingTargetCount}/${lo.evaluatedCount} (${lo.attainmentRatePct}%)`
                                : 'No evidence'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Mapped Evidence List */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                          {lo.mappings.length === 0 ? (
                            <span className="text-slate-400">
                              No assessments or projects mapped yet.
                            </span>
                          ) : (
                            lo.mappings.map((m) => (
                              <span key={m.id} className="inline-flex items-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-800">
                                  {m.assessmentTitle
                                    ? `Assessment: ${m.assessmentTitle}`
                                    : `Project: ${m.projectTitle}`}
                                </span>
                                <span className="font-mono text-slate-400">
                                  (w:{m.evidenceWeight})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMapping(m.id)}
                                  aria-label="Remove mapped evidence"
                                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isAddingHere) {
                              setMappingOutcomeId(null);
                            } else {
                              setMappingOutcomeId(lo.id);
                              setEvidenceType('assessment');
                              setEvidenceId(data.availableAssessments[0]?.id ?? '');
                              setEvidenceWeight('100');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAddingHere ? 'Close' : 'Link Evidence'}</span>
                        </button>
                      </div>

                      {isAddingHere && (
                        <form
                          onSubmit={handleAddMapping}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100 items-end"
                        >
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Source Type
                            </label>
                            <select
                              value={evidenceType}
                              onChange={(e) => {
                                const next = e.target.value as 'assessment' | 'project';
                                setEvidenceType(next);
                                setEvidenceId(
                                  next === 'assessment'
                                    ? (data.availableAssessments[0]?.id ?? '')
                                    : (data.availableProjects[0]?.id ?? '')
                                );
                              }}
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                            >
                              <option value="assessment">Assessment</option>
                              <option value="project">STEM Project</option>
                            </select>
                          </div>

                          <div className="sm:col-span-5">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Select {evidenceType === 'assessment' ? 'Assessment' : 'STEM Project'}
                            </label>
                            <select
                              required
                              value={evidenceId}
                              onChange={(e) => setEvidenceId(e.target.value)}
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                            >
                              {(evidenceType === 'assessment'
                                ? data.availableAssessments
                                : data.availableProjects
                              ).length === 0 ? (
                                <option value="">None available in programme</option>
                              ) : (
                                (evidenceType === 'assessment'
                                  ? data.availableAssessments
                                  : data.availableProjects
                                ).map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.title}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Weight
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              required
                              value={evidenceWeight}
                              onChange={(e) => setEvidenceWeight(e.target.value)}
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <button
                              type="submit"
                              disabled={savingMapping || !evidenceId}
                              className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              {savingMapping ? 'Linking...' : 'Save Link'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Programme Objectives Status */}
          {data.objectives.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  Programme Objectives Benchmark
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                      <th className="py-3 px-6">Objective</th>
                      <th className="py-3 px-4">Target Metric</th>
                      <th className="py-3 px-6 text-right">Governance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.objectives.map((obj) => (
                      <tr key={obj.id}>
                        <td className="py-3 px-6">
                          <p className="font-medium text-slate-900">{obj.title}</p>
                          {obj.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{obj.description}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {obj.targetMetric || '—'}
                        </td>
                        <td className="py-3 px-6 text-right text-xs font-medium whitespace-nowrap">
                          <span className={obj.isConfirmed ? 'text-teal-700' : 'text-amber-700'}>
                            {obj.isConfirmed ? 'Confirmed' : 'Pending Confirmation'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
