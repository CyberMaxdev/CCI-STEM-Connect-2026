import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, Link2, Plus, Trash2 } from 'lucide-react';
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
import { downloadCsv } from '../lib/export-utils';
import type { PerformanceGroupAggregate } from '../lib/performance-engine';

interface OutcomeEvidenceItem {
  id: string;
  assessmentId: string | null;
  assessmentTitle: string | null;
  projectId: string | null;
  projectTitle: string | null;
  evidenceWeight: number;
}

interface ImpactOutcome {
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
  mappings: OutcomeEvidenceItem[];
}

interface GrowthPairRow {
  postAssessmentId: string;
  postTitle: string;
  preTitle: string;
  pairedLearners: number;
  avgPrePct: number;
  avgPostPct: number;
  avgDelta: number;
  avgNormalizedGainPct: number;
  improvedPct: number;
}

interface ImpactResponse {
  programme: { id: string; code: string; title: string; status: string } | null;
  objectives: Array<{
    id: string;
    title: string;
    description: string | null;
    targetMetric: string | null;
    isConfirmed: boolean;
  }>;
  outcomes: ImpactOutcome[];
  growthByPair: GrowthPairRow[];
  performanceSummary: PerformanceGroupAggregate | null;
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

  // Evidence mapping state per outcome
  const [mappingOutcomeId, setMappingOutcomeId] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState<'assessment' | 'project'>('assessment');
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [evidenceWeight, setEvidenceWeight] = useState('100');
  const [savingMapping, setSavingMapping] = useState(false);

  const loadImpact = useCallback(async (progId: string, cohId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (progId) qs.set('programmeId', progId);
      if (cohId) qs.set('cohortId', cohId);
      const res = await apiFetch<ImpactResponse>(`/api/impact${qs.toString() ? `?${qs}` : ''}`);
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

  const openMappingForm = (outcomeId: string) => {
    setMappingOutcomeId(outcomeId);
    const hasAssessments = (data?.availableAssessments.length ?? 0) > 0;
    const defaultType = hasAssessments ? 'assessment' : 'project';
    setEvidenceType(defaultType);
    setSelectedEvidenceId(
      defaultType === 'assessment'
        ? (data?.availableAssessments[0]?.id ?? '')
        : (data?.availableProjects[0]?.id ?? '')
    );
    setEvidenceWeight('100');
  };

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingOutcomeId || !selectedEvidenceId) return;
    setSavingMapping(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/impact/mappings', {
        method: 'POST',
        body: {
          learningOutcomeId: mappingOutcomeId,
          assessmentId: evidenceType === 'assessment' ? selectedEvidenceId : null,
          projectId: evidenceType === 'project' ? selectedEvidenceId : null,
          evidenceWeight: Number(evidenceWeight) || 100,
        },
      });
      setMappingOutcomeId(null);
      setNotice('Evidence source linked to learning outcome and attainment recalculated.');
      await loadImpact(programmeId, cohortId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to link evidence.');
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/impact/mappings/${mappingId}`, { method: 'DELETE' });
      setNotice('Evidence link removed.');
      await loadImpact(programmeId, cohortId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove evidence mapping.');
    }
  };

  const handleExportImpactCsv = () => {
    if (!data?.programme) return;
    downloadCsv(
      `CCI-Impact-Outcomes-${data.programme.code}.csv`,
      [
        'Outcome Code',
        'Learning Outcome',
        'Linked Objective',
        'Target Proficiency (%)',
        'Achieved Mean (%)',
        'Evaluated Learners',
        'Meeting Target',
        'Attainment Rate (%)',
        'Mapped Evidence',
      ],
      data.outcomes.map((o) => [
        o.code,
        o.statement,
        o.objectiveTitle ?? '',
        o.targetProficiencyPct,
        o.achievedAvgPct ?? '',
        o.evaluatedCount,
        o.meetingTargetCount,
        o.attainmentRatePct ?? '',
        o.mappings
          .map((m) => m.assessmentTitle ?? m.projectTitle ?? '')
          .filter(Boolean)
          .join('; '),
      ])
    );
  };

  const confirmedObjectives = data?.objectives.filter((o) => o.isConfirmed).length ?? 0;
  const mappedOutcomes = data?.outcomes.filter((o) => o.mappings.length > 0).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Programme Impact & Learning Outcome Attainment
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Map assessments and STEM projects to learning outcomes to measure proficiency attainment and pre-to-post learning gain.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Select Programme"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value);
              setCohortId('');
            }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
          >
            {(data?.filterOptions.programmes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Cohort"
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
          >
            <option value="">All Cohorts</option>
            {(data?.filterOptions.cohorts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {data?.programme && (
            <button
              type="button"
              onClick={handleExportImpactCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Export Outcomes CSV
            </button>
          )}
        </div>
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !data?.programme ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">No programme data available yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Create a programme with objectives and learning outcomes to begin impact evaluation.
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Confirmed Objectives</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {confirmedObjectives} / {data.objectives.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Programme alignment benchmarks</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Outcomes with Mapped Evidence</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {mappedOutcomes} / {data.outcomes.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Linked to assessments or projects</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Average Learning Growth (Δ)</p>
              <p className="text-2xl font-semibold text-teal-700 mt-1 tabular-nums">
                {data.performanceSummary?.averageLearningGrowthDelta !== null &&
                data.performanceSummary?.averageLearningGrowthDelta !== undefined
                  ? `${data.performanceSummary.averageLearningGrowthDelta >= 0 ? '+' : ''}${data.performanceSummary.averageLearningGrowthDelta} pts`
                  : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Hake Gain:{' '}
                {data.performanceSummary?.averageNormalizedGainPct !== null &&
                data.performanceSummary?.averageNormalizedGainPct !== undefined
                  ? `${data.performanceSummary.averageNormalizedGainPct}%`
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Mean Weighted Performance</p>
              <p className="text-2xl font-semibold text-[#B5121B] mt-1 tabular-nums">
                {data.performanceSummary?.averageOverallScore !== null &&
                data.performanceSummary?.averageOverallScore !== undefined
                  ? `${data.performanceSummary.averageOverallScore}%`
                  : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {data.performanceSummary?.scoredParticipants ?? 0} of{' '}
                {data.performanceSummary?.totalParticipants ?? 0} participants scored
              </p>
            </div>
          </div>

          {/* Pre-to-Post Learning Growth Analysis */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Pre-to-Post Assessment Learning Growth
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Paired diagnostic comparisons computed strictly for learners graded on both pre- and post-programme assessments.
              </p>
            </div>

            {data.growthByPair.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                No paired pre/post assessment results recorded yet. Link a Post-Programme assessment to its Pre-Programme baseline in the Assessments module to measure learning growth.
              </p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-5 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.growthByPair}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="postTitle" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                      <Tooltip
                        formatter={(value) => [`${value ?? 0}%`, '']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="avgPrePct" name="Pre-Assessment %" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgPostPct" name="Post-Assessment %" fill="#B5121B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="xl:col-span-7 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 pr-4">Paired Assessment</th>
                        <th className="py-2.5 px-3 text-right">Paired</th>
                        <th className="py-2.5 px-3 text-right">Pre Mean</th>
                        <th className="py-2.5 px-3 text-right">Post Mean</th>
                        <th className="py-2.5 px-3 text-right">Delta (Δ)</th>
                        <th className="py-2.5 px-3 text-right">Hake Gain</th>
                        <th className="py-2.5 pl-3 text-right">Improved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.growthByPair.map((g) => (
                        <tr key={g.postAssessmentId}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-900">{g.postTitle}</p>
                            <p className="text-xs text-slate-500">vs. {g.preTitle}</p>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                            {g.pairedLearners}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                            {g.avgPrePct}%
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums font-semibold text-slate-900">
                            {g.avgPostPct}%
                          </td>
                          <td
                            className={`py-3 px-3 text-right tabular-nums font-semibold ${
                              g.avgDelta >= 0 ? 'text-teal-700' : 'text-[#B5121B]'
                            }`}
                          >
                            {g.avgDelta >= 0 ? '+' : ''}
                            {g.avgDelta}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                            {g.avgNormalizedGainPct}%
                          </td>
                          <td className="py-3 pl-3 text-right tabular-nums text-slate-700">
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
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Learning Outcomes & Evidence Mapping
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Link graded assessments or evaluated STEM projects to calculate real attainment against proficiency targets.
              </p>
            </div>

            {data.outcomes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No learning outcomes defined for this programme yet. Add measurable outcomes in Programme Management.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.outcomes.map((lo) => {
                  const isAdding = mappingOutcomeId === lo.id;
                  const targetMet =
                    lo.achievedAvgPct !== null && lo.achievedAvgPct >= lo.targetProficiencyPct;
                  return (
                    <div key={lo.id} className="p-6 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                            <span className="font-mono font-semibold text-slate-800">{lo.code}</span>
                            {lo.objectiveTitle && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Objective: {lo.objectiveTitle}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              Target: {lo.targetProficiencyPct}%
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900">{lo.statement}</p>
                        </div>

                        <div className="flex items-center gap-6 shrink-0 tabular-nums">
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Achieved Mean</p>
                            <p
                              className={`text-base font-semibold ${
                                lo.achievedAvgPct === null
                                  ? 'text-slate-400'
                                  : targetMet
                                    ? 'text-teal-700'
                                    : 'text-[#B5121B]'
                              }`}
                            >
                              {lo.achievedAvgPct !== null ? `${lo.achievedAvgPct}%` : '—'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Meeting Target</p>
                            <p className="text-base font-semibold text-slate-900">
                              {lo.evaluatedCount > 0
                                ? `${lo.meetingTargetCount}/${lo.evaluatedCount} (${lo.attainmentRatePct}%)`
                                : '0'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openMappingForm(lo.id)}
                            disabled={
                              data.availableAssessments.length === 0 &&
                              data.availableProjects.length === 0
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Map Evidence
                          </button>
                        </div>
                      </div>

                      {/* Mapped Evidence List */}
                      {lo.mappings.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          {lo.mappings.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-3 py-1.5 px-3 bg-slate-50 rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-700">
                                  {m.assessmentTitle ? 'Assessment' : 'STEM Project'}:
                                </span>
                                <span className="text-slate-900 truncate">
                                  {m.assessmentTitle ?? m.projectTitle}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-600 tabular-nums shrink-0">
                                  Weight {m.evidenceWeight}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteMapping(m.id)}
                                className="p-1 text-slate-400 hover:text-[#B5121B] cursor-pointer shrink-0"
                                aria-label="Remove evidence link"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline Add Mapping Form */}
                      {isAdding && (
                        <form
                          onSubmit={handleAddMapping}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-end gap-3"
                        >
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Evidence Source Type
                            </label>
                            <select
                              value={evidenceType}
                              onChange={(e) => {
                                const nextType = e.target.value as 'assessment' | 'project';
                                setEvidenceType(nextType);
                                setSelectedEvidenceId(
                                  nextType === 'assessment'
                                    ? (data.availableAssessments[0]?.id ?? '')
                                    : (data.availableProjects[0]?.id ?? '')
                                );
                              }}
                              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                            >
                              <option value="assessment" disabled={data.availableAssessments.length === 0}>
                                Assessment
                              </option>
                              <option value="project" disabled={data.availableProjects.length === 0}>
                                STEM Project
                              </option>
                            </select>
                          </div>

                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              {evidenceType === 'assessment' ? 'Select Assessment' : 'Select STEM Project'}
                            </label>
                            <select
                              required
                              value={selectedEvidenceId}
                              onChange={(e) => setSelectedEvidenceId(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                            >
                              {evidenceType === 'assessment'
                                ? data.availableAssessments.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.title}
                                    </option>
                                  ))
                                : data.availableProjects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.title}
                                    </option>
                                  ))}
                            </select>
                          </div>

                          <div className="w-24">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Weight
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              required
                              value={evidenceWeight}
                              onChange={(e) => setEvidenceWeight(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md tabular-nums"
                            />
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setMappingOutcomeId(null)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={savingMapping || !selectedEvidenceId}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-[#B5121B] rounded-md hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                            >
                              {savingMapping ? 'Linking...' : 'Link Evidence'}
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
        </>
      )}
    </div>
  );
}
