import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  ExternalLink,
  FolderKanban,
  MessageSquare,
  Plus,
  Send,
  Square,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { downloadCsv } from '../lib/export-utils';

interface ProjectMilestone {
  title: string;
  dueDate?: string;
  completed: boolean;
}

interface ProjectListItem {
  id: string;
  programmeId: string;
  programmeCode: string;
  programmeTitle: string;
  cohortId: string;
  cohortName: string;
  trackId: string | null;
  trackName: string | null;
  title: string;
  objectives: string;
  expectedDeliverables: string;
  milestones: ProjectMilestone[];
  isTeamProject: boolean;
  maxScore: number;
  deadline: string;
  submittedCount: number;
  evaluatedCount: number;
  totalSubmissions: number;
}

interface LookupOption {
  id: string;
  name?: string;
  title?: string;
  code?: string;
  programmeId?: string;
}

interface TeamContributionDetail {
  participantId: string;
  fullName: string;
  individualScore: number;
  collaborationScore: number | null;
  notes: string | null;
}

interface SubmissionDetail {
  id: string;
  submissionUrl: string | null;
  status: 'not_started' | 'in_progress' | 'submitted' | 'evaluated' | 'revision_requested';
  qualityScore: number | null;
  feedback: string | null;
  evaluatedByName: string | null;
  submittedAt: string | null;
  evaluatedAt: string | null;
  contributions?: TeamContributionDetail[];
}

interface ProjectTeamDetail {
  id: string;
  name: string;
  members: Array<{
    participantId: string;
    participantCode: string;
    fullName: string;
  }>;
  submission: SubmissionDetail | null;
}

interface ProjectParticipantDetail {
  participantId: string;
  participantCode: string;
  fullName: string;
  status: string;
  submission: SubmissionDetail | null;
}

interface ProjectDetailResponse {
  project: {
    id: string;
    programmeId: string;
    programmeCode: string;
    programmeTitle: string;
    cohortId: string;
    cohortName: string;
    trackId: string | null;
    trackName: string | null;
    title: string;
    objectives: string;
    expectedDeliverables: string;
    milestones: ProjectMilestone[];
    isTeamProject: boolean;
    maxScore: number;
    deadline: string;
  };
  teams: ProjectTeamDetail[];
  participants: ProjectParticipantDetail[];
  allEligibleLearners: Array<{
    id: string;
    participantCode: string;
    fullName: string;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'text-slate-500' },
  in_progress: { label: 'In Progress', color: 'text-slate-700' },
  submitted: { label: 'Submitted', color: 'text-amber-700' },
  revision_requested: { label: 'Revision Requested', color: 'text-[#B5121B]' },
  evaluated: { label: 'Evaluated', color: 'text-teal-700' },
};

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://');
}

export function ProjectsPage() {
  const { user } = useAuth();
  const isStaff = user?.role !== 'participant';

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [lookups, setLookups] = useState<{
    programmes: LookupOption[];
    cohorts: LookupOption[];
    tracks: LookupOption[];
  }>({ programmes: [], cohorts: [], tracks: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New Project Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projProgrammeId, setProjProgrammeId] = useState('');
  const [projCohortId, setProjCohortId] = useState('');
  const [projTrackId, setProjTrackId] = useState('');
  const [projTitle, setProjTitle] = useState('');
  const [projObjectives, setProjObjectives] = useState('');
  const [projDeliverables, setProjDeliverables] = useState('');
  const [projIsTeam, setProjIsTeam] = useState(false);
  const [projMaxScore, setProjMaxScore] = useState('100');
  const [projDeadline, setProjDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [projMilestones, setProjMilestones] = useState<Array<{ title: string; dueDate: string }>>([
    { title: 'Architecture & Plan Sign-off', dueDate: '' },
    { title: 'Working Prototype Demonstration', dueDate: '' },
  ]);

  // Team Builder Modal
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);

  // Submission Modal
  const [submitTarget, setSubmitTarget] = useState<{
    label: string;
    participantId?: string;
    teamId?: string;
    existingUrl: string;
  } | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'in_progress' | 'submitted'>('submitted');
  const [savingSubmission, setSavingSubmission] = useState(false);

  // Evaluation & Participant Feedback Modal
  const [evalTarget, setEvalTarget] = useState<{
    label: string;
    participantId?: string;
    teamId?: string;
    members?: Array<{ participantId: string; fullName: string }>;
    existing: SubmissionDetail | null;
  } | null>(null);
  const [evalStatus, setEvalStatus] = useState<'evaluated' | 'revision_requested'>('evaluated');
  const [evalScore, setEvalScore] = useState('');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalContributions, setEvalContributions] = useState<
    Record<string, { individualScore: string; collaborationScore: string; notes: string }>
  >({});
  const [savingEval, setSavingEval] = useState(false);

  const loadProjects = useCallback(async (preferredId?: string) => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await apiFetch<{
        projects: ProjectListItem[];
        lookups: { programmes: LookupOption[]; cohorts: LookupOption[]; tracks: LookupOption[] };
      }>('/api/projects');
      setProjects(data.projects);
      setLookups(data.lookups);
      setSelectedId((prev) => {
        const candidate = preferredId ?? prev;
        if (candidate && data.projects.some((p) => p.id === candidate)) {
          return candidate;
        }
        return data.projects[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load STEM projects.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const data = await apiFetch<ProjectDetailResponse>(`/api/projects/${projectId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project details.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const cohortsForFormProgramme = useMemo(
    () => lookups.cohorts.filter((c) => c.programmeId === projProgrammeId),
    [lookups.cohorts, projProgrammeId]
  );

  const tracksForFormProgramme = useMemo(
    () => lookups.tracks.filter((t) => t.programmeId === projProgrammeId),
    [lookups.tracks, projProgrammeId]
  );

  const openCreateModal = () => {
    const defaultProg = lookups.programmes[0]?.id ?? '';
    setProjProgrammeId(defaultProg);
    const matchingCohorts = lookups.cohorts.filter((c) => c.programmeId === defaultProg);
    setProjCohortId(matchingCohorts[0]?.id ?? '');
    setProjTrackId('');
    setProjTitle('');
    setProjObjectives('');
    setProjDeliverables('');
    setProjIsTeam(false);
    setProjMaxScore('100');
    setProjMilestones([
      { title: 'Architecture & Plan Sign-off', dueDate: '' },
      { title: 'Working Prototype Demonstration', dueDate: '' },
    ]);
    setShowCreateModal(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProject(true);
    setError(null);
    setNotice(null);
    try {
      const cleanMilestones = projMilestones
        .filter((m) => m.title.trim().length >= 2)
        .map((m) => ({
          title: m.title.trim(),
          dueDate: m.dueDate || undefined,
          completed: false,
        }));

      const res = await apiFetch<{ project: { id: string } }>('/api/projects', {
        method: 'POST',
        body: {
          programmeId: projProgrammeId,
          cohortId: projCohortId,
          trackId: projTrackId || null,
          title: projTitle.trim(),
          objectives: projObjectives.trim(),
          expectedDeliverables: projDeliverables.trim(),
          isTeamProject: projIsTeam,
          maxScore: Number(projMaxScore) || 100,
          deadline: new Date(`${projDeadline}T23:59:00Z`).toISOString(),
          milestones: cleanMilestones,
        },
      });
      setShowCreateModal(false);
      setNotice('STEM project created and linked to the cohort.');
      await loadProjects(res.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSavingProject(false);
    }
  };

  const handleToggleMilestone = async (index: number) => {
    if (!detail || !isStaff) return;
    const updated = detail.project.milestones.map((m, idx) =>
      idx === index ? { ...m, completed: !m.completed } : m
    );
    try {
      await apiFetch(`/api/projects/${detail.project.id}/milestones`, {
        method: 'PATCH',
        body: { milestones: updated },
      });
      setDetail({
        ...detail,
        project: { ...detail.project, milestones: updated },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update milestone.');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || selectedTeamMembers.length === 0) return;
    setSavingTeam(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/projects/${detail.project.id}/teams`, {
        method: 'POST',
        body: {
          name: teamName.trim(),
          participantIds: selectedTeamMembers,
        },
      });
      setShowTeamModal(false);
      setTeamName('');
      setSelectedTeamMembers([]);
      setNotice('Project team created with assigned cohort members.');
      await loadDetail(detail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project team.');
    } finally {
      setSavingTeam(false);
    }
  };

  const openSubmitModal = (target: {
    label: string;
    participantId?: string;
    teamId?: string;
    existingUrl: string;
  }) => {
    setSubmitTarget(target);
    setSubmissionUrl(target.existingUrl);
    setSubmissionStatus('submitted');
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !submitTarget) return;
    setSavingSubmission(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/projects/${detail.project.id}/submit`, {
        method: 'POST',
        body: {
          participantId: submitTarget.participantId,
          teamId: submitTarget.teamId,
          submissionUrl: submissionUrl.trim() || null,
          status: submissionStatus,
        },
      });
      setSubmitTarget(null);
      setNotice('Project deliverable recorded.');
      await Promise.all([loadDetail(detail.project.id), loadProjects(detail.project.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project deliverable.');
    } finally {
      setSavingSubmission(false);
    }
  };

  const openEvaluateModal = (target: {
    label: string;
    participantId?: string;
    teamId?: string;
    members?: Array<{ participantId: string; fullName: string }>;
    existing: SubmissionDetail | null;
  }) => {
    setEvalTarget(target);
    setEvalStatus(
      target.existing?.status === 'revision_requested' ? 'revision_requested' : 'evaluated'
    );
    setEvalScore(
      target.existing?.qualityScore !== null && target.existing?.qualityScore !== undefined
        ? String(target.existing.qualityScore)
        : ''
    );
    setEvalFeedback(target.existing?.feedback ?? '');

    if (target.members) {
      const nextMap: Record<
        string,
        { individualScore: string; collaborationScore: string; notes: string }
      > = {};
      for (const m of target.members) {
        const prev = target.existing?.contributions?.find((c) => c.participantId === m.participantId);
        nextMap[m.participantId] = {
          individualScore: prev ? String(prev.individualScore) : '80',
          collaborationScore:
            prev && prev.collaborationScore !== null ? String(prev.collaborationScore) : '80',
          notes: prev?.notes ?? '',
        };
      }
      setEvalContributions(nextMap);
    } else {
      setEvalContributions({});
    }
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !evalTarget) return;
    setSavingEval(true);
    setError(null);
    setNotice(null);
    try {
      const contributions = evalTarget.members
        ? evalTarget.members.map((m) => {
            const entry = evalContributions[m.participantId];
            return {
              participantId: m.participantId,
              individualScore: Number(entry?.individualScore ?? 0),
              collaborationScore:
                entry?.collaborationScore !== '' ? Number(entry.collaborationScore) : null,
              notes: entry?.notes?.trim() || null,
            };
          })
        : undefined;

      await apiFetch(`/api/projects/${detail.project.id}/evaluate`, {
        method: 'POST',
        body: {
          participantId: evalTarget.participantId,
          teamId: evalTarget.teamId,
          status: evalStatus,
          qualityScore: evalScore !== '' ? Number(evalScore) : null,
          feedback: evalFeedback.trim() || null,
          contributions,
        },
      });
      setEvalTarget(null);
      setNotice('Project evaluation and participant feedback saved to database.');
      await Promise.all([loadDetail(detail.project.id), loadProjects(detail.project.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project evaluation.');
    } finally {
      setSavingEval(false);
    }
  };

  const handleExportSubmissionsCsv = () => {
    if (!detail) return;
    const maxScore = detail.project.maxScore;
    if (detail.project.isTeamProject) {
      downloadCsv(
        `CCI-Project-Teams-${detail.project.title.replace(/[^A-Za-z0-9_-]/g, '_')}.csv`,
        ['Team', 'Members', 'Status', 'Quality Score', 'Max Score', 'Deliverable URL', 'Feedback'],
        detail.teams.map((t) => [
          t.name,
          t.members.map((m) => m.fullName).join('; '),
          t.submission?.status ?? 'not_started',
          t.submission?.qualityScore ?? '',
          maxScore,
          t.submission?.submissionUrl ?? '',
          t.submission?.feedback ?? '',
        ])
      );
    } else {
      downloadCsv(
        `CCI-Project-Submissions-${detail.project.title.replace(/[^A-Za-z0-9_-]/g, '_')}.csv`,
        [
          'Participant ID',
          'Full Name',
          'Status',
          'Quality Score',
          'Max Score',
          'Deliverable URL',
          'Facilitator Feedback',
        ],
        detail.participants.map((p) => [
          p.participantCode,
          p.fullName,
          p.submission?.status ?? 'not_started',
          p.submission?.qualityScore ?? '',
          maxScore,
          p.submission?.submissionUrl ?? '',
          p.submission?.feedback ?? '',
        ])
      );
    }
  };

  const completedMilestones = detail
    ? detail.project.milestones.filter((m) => m.completed).length
    : 0;
  const totalMilestones = detail ? detail.project.milestones.length : 0;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">STEM Projects & Participant Feedback</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Track individual and team STEM deliverables, milestones, evaluations, and collaboration scores.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {detail && isStaff && (
            <button
              type="button"
              onClick={handleExportSubmissionsCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              onClick={openCreateModal}
              disabled={lookups.programmes.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New STEM Project
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

      {/* Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Project List */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Active Projects</h3>
            <span className="text-xs text-slate-500 tabular-nums">{projects.length} total</span>
          </div>

          {loadingList ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center">
              <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-800">No STEM projects yet</p>
              <p className="text-xs text-slate-500 mt-1">
                {isStaff
                  ? 'Create an individual or team project to track deliverables and feedback.'
                  : 'Assigned STEM projects for your cohort will appear here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {projects.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                      active ? 'bg-red-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          active ? 'text-[#B5121B]' : 'text-slate-900'
                        }`}
                      >
                        {p.title}
                      </p>
                      <span className="text-xs font-medium text-slate-500 shrink-0">
                        {p.isTeamProject ? 'Team' : 'Individual'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {p.programmeCode} · {p.cohortName}
                      {p.trackName ? ` · ${p.trackName}` : ''}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-2 tabular-nums">
                      <span>Due {new Date(p.deadline).toLocaleDateString()}</span>
                      <span>
                        {p.evaluatedCount} evaluated · {p.submittedCount} submitted
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Detail Panel */}
        <section className="lg:col-span-8 space-y-6">
          {loadingDetail ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="h-6 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !detail ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-sm text-slate-500">Select a STEM project to inspect deliverables, teams, and evaluations.</p>
            </div>
          ) : (
            <>
              {/* Project Overview & Milestones */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-700">{detail.project.programmeCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{detail.project.cohortName}</span>
                      {detail.project.trackName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{detail.project.trackName}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{detail.project.isTeamProject ? 'Team Project' : 'Individual Project'}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{detail.project.title}</h3>
                  </div>
                  <div className="text-left sm:text-right text-xs text-slate-500 shrink-0 tabular-nums">
                    <p className="font-medium text-slate-800">
                      Max Score: {detail.project.maxScore} pts
                    </p>
                    <p className="mt-0.5">
                      Deadline: {new Date(detail.project.deadline).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Project Objectives
                    </h4>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {detail.project.objectives}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Expected Deliverables
                    </h4>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {detail.project.expectedDeliverables}
                    </p>
                  </div>
                </div>

                {/* Milestones Checklist */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Project Milestones</h4>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {completedMilestones} of {totalMilestones} completed
                    </span>
                  </div>
                  {detail.project.milestones.length === 0 ? (
                    <p className="text-xs text-slate-500">No milestones configured for this project.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {detail.project.milestones.map((m, idx) => (
                        <li key={`${m.title}-${idx}`} className="py-2 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            disabled={!isStaff}
                            onClick={() => handleToggleMilestone(idx)}
                            className={`flex items-center gap-2.5 text-left text-sm ${
                              isStaff ? 'cursor-pointer hover:text-slate-950' : 'cursor-default'
                            } ${m.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}
                          >
                            {m.completed ? (
                              <CheckSquare className="w-4 h-4 text-teal-700 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span>{m.title}</span>
                          </button>
                          {m.dueDate && (
                            <span className="text-xs text-slate-500 tabular-nums shrink-0">
                              {m.dueDate}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Team Submissions OR Individual Submissions */}
              {detail.project.isTeamProject ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Project Teams, Submissions & Contribution Scoring
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Individual contribution and collaboration scores feed directly into the Performance Engine.
                      </p>
                    </div>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamName('');
                          setSelectedTeamMembers([]);
                          setShowTeamModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Users className="w-3.5 h-3.5" />
                        Create Team
                      </button>
                    )}
                  </div>

                  {detail.teams.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-slate-600">No project teams formed yet.</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isStaff
                          ? 'Create teams and assign cohort participants to start tracking team deliverables.'
                          : 'Your facilitator will assign you to a team for this project.'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {detail.teams.map((team) => {
                        const sub = team.submission;
                        const statusInfo = STATUS_LABELS[sub?.status ?? 'not_started'];
                        return (
                          <div key={team.id} className="p-6 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <h5 className="text-sm font-semibold text-slate-900">{team.name}</h5>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className={`text-xs font-medium ${statusInfo.color}`}>
                                    {statusInfo.label}
                                  </span>
                                  {sub?.qualityScore !== null && sub?.qualityScore !== undefined && (
                                    <>
                                      <span className="text-xs text-slate-400">·</span>
                                      <span className="text-xs font-semibold text-slate-900 tabular-nums">
                                        {sub.qualityScore} / {detail.project.maxScore}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 mt-1">
                                  Members: {team.members.map((m) => m.fullName).join(', ')}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSubmitModal({
                                      label: team.name,
                                      teamId: team.id,
                                      existingUrl: sub?.submissionUrl ?? '',
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  {sub?.submissionUrl ? 'Update Link' : 'Submit Work'}
                                </button>
                                {isStaff && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEvaluateModal({
                                        label: team.name,
                                        teamId: team.id,
                                        members: team.members,
                                        existing: sub,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Evaluate & Feedback
                                  </button>
                                )}
                              </div>
                            </div>

                            {isSafeHttpUrl(sub?.submissionUrl) && (
                              <a
                                href={sub!.submissionUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B5121B] hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {sub!.submissionUrl}
                              </a>
                            )}

                            {sub?.feedback && (
                              <div className="pt-2 text-xs text-slate-700 bg-slate-50 rounded-lg p-3">
                                <p className="font-medium text-slate-900 mb-1">
                                  Facilitator Feedback
                                  {sub.evaluatedByName ? ` · ${sub.evaluatedByName}` : ''}
                                </p>
                                <p className="whitespace-pre-line">{sub.feedback}</p>
                              </div>
                            )}

                            {sub?.contributions && sub.contributions.length > 0 && (
                              <div className="overflow-x-auto pt-2">
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                      <th className="py-1.5 pr-3 font-medium">Team Member</th>
                                      <th className="py-1.5 px-3 font-medium text-right">Individual</th>
                                      <th className="py-1.5 px-3 font-medium text-right">Collaboration</th>
                                      <th className="py-1.5 pl-3 font-medium">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sub.contributions.map((c) => (
                                      <tr key={c.participantId}>
                                        <td className="py-1.5 pr-3 font-medium text-slate-800">
                                          {c.fullName}
                                        </td>
                                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-900">
                                          {c.individualScore}%
                                        </td>
                                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-900">
                                          {c.collaborationScore !== null ? `${c.collaborationScore}%` : '—'}
                                        </td>
                                        <td className="py-1.5 pl-3 text-slate-600">
                                          {c.notes || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Individual Deliverables & Participant Feedback
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluated project scores update the Project & Task Completion indicator automatically.
                    </p>
                  </div>

                  {detail.participants.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      No cohort participants found for this project scope.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                            <th className="px-5 py-3">Participant</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Deliverable</th>
                            <th className="px-4 py-3 text-right">Score</th>
                            <th className="px-4 py-3">Feedback</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.participants.map((p) => {
                            const sub = p.submission;
                            const statusInfo = STATUS_LABELS[sub?.status ?? 'not_started'];
                            return (
                              <tr key={p.participantId} className="hover:bg-slate-50/60">
                                <td className="px-5 py-3.5">
                                  <p className="font-medium text-slate-900">{p.fullName}</p>
                                  <p className="text-xs text-slate-500 font-mono">
                                    {p.participantCode}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-xs font-medium ${statusInfo.color}`}>
                                    {statusInfo.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5">
                                  {isSafeHttpUrl(sub?.submissionUrl) ? (
                                    <a
                                      href={sub!.submissionUrl!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-[#B5121B] hover:underline"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      View Link
                                    </a>
                                  ) : (
                                    <span className="text-xs text-slate-400">Not submitted</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right tabular-nums font-medium text-slate-900">
                                  {sub?.qualityScore !== null && sub?.qualityScore !== undefined
                                    ? `${sub.qualityScore} / ${detail.project.maxScore}`
                                    : '—'}
                                </td>
                                <td className="px-4 py-3.5 max-w-[240px]">
                                  <p className="text-xs text-slate-600 line-clamp-2">
                                    {sub?.feedback || '—'}
                                  </p>
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openSubmitModal({
                                          label: p.fullName,
                                          participantId: p.participantId,
                                          existingUrl: sub?.submissionUrl ?? '',
                                        })
                                      }
                                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                      {sub?.submissionUrl ? 'Edit Link' : 'Submit'}
                                    </button>
                                    {isStaff && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openEvaluateModal({
                                            label: p.fullName,
                                            participantId: p.participantId,
                                            existing: sub,
                                          })
                                        }
                                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#B5121B] rounded-md hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap shrink-0"
                                      >
                                        Evaluate
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create STEM Project</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Programme</label>
                  <select
                    required
                    value={projProgrammeId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setProjProgrammeId(pid);
                      const cs = lookups.cohorts.filter((c) => c.programmeId === pid);
                      setProjCohortId(cs[0]?.id ?? '');
                      setProjTrackId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                  >
                    {lookups.programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cohort</label>
                  <select
                    required
                    value={projCohortId}
                    onChange={(e) => setProjCohortId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                  >
                    {cohortsForFormProgramme.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    STEM Track (Optional)
                  </label>
                  <select
                    value={projTrackId}
                    onChange={(e) => setProjTrackId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                  >
                    <option value="">All Tracks</option>
                    {tracksForFormProgramme.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Max Score</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={projMaxScore}
                    onChange={(e) => setProjMaxScore(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deadline</label>
                  <input
                    type="date"
                    required
                    value={projDeadline}
                    onChange={(e) => setProjDeadline(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={projTitle}
                  onChange={(e) => setProjTitle(e.target.value)}
                  placeholder="e.g., Smart Solar Irrigation Controller Prototype"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Objectives</label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={projObjectives}
                  onChange={(e) => setProjObjectives(e.target.value)}
                  placeholder="Describe the engineering problem and technical outcomes."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Deliverables
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={projDeliverables}
                  onChange={(e) => setProjDeliverables(e.target.value)}
                  placeholder="e.g., GitHub repository, circuit diagram PDF, and 3-minute demo video link."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={projIsTeam}
                  onChange={(e) => setProjIsTeam(e.target.checked)}
                  className="rounded border-slate-300 text-[#B5121B] focus:ring-[#B5121B]"
                />
                <span>Team-based STEM project (enables team formation & collaboration scoring)</span>
              </label>

              {/* Dynamic Milestones */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Milestones</span>
                  <button
                    type="button"
                    onClick={() =>
                      setProjMilestones((prev) => [...prev, { title: '', dueDate: '' }])
                    }
                    className="text-xs font-medium text-[#B5121B] hover:underline cursor-pointer"
                  >
                    + Add Milestone
                  </button>
                </div>
                {projMilestones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={m.title}
                      onChange={(e) =>
                        setProjMilestones((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                        )
                      }
                      placeholder="Milestone description"
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                    />
                    <input
                      type="date"
                      value={m.dueDate}
                      onChange={(e) =>
                        setProjMilestones((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, dueDate: e.target.value } : item
                          )
                        )
                      }
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setProjMilestones((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-slate-400 hover:text-[#B5121B] cursor-pointer"
                      aria-label="Remove milestone"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProject || !projCohortId}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {savingProject ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Creation Modal */}
      {showTeamModal && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create Project Team</h3>
              <button
                type="button"
                onClick={() => setShowTeamModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTeam} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Team Alpha Robotics"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Select Cohort Members ({selectedTeamMembers.length} selected)
                </label>
                <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {detail.allEligibleLearners.map((learner) => {
                    const checked = selectedTeamMembers.includes(learner.id);
                    return (
                      <label
                        key={learner.id}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedTeamMembers((prev) =>
                              checked ? prev.filter((id) => id !== learner.id) : [...prev, learner.id]
                            )
                          }
                          className="rounded border-slate-300 text-[#B5121B]"
                        />
                        <span className="font-medium text-slate-800">{learner.fullName}</span>
                        <span className="text-xs text-slate-400 font-mono ml-auto">
                          {learner.participantCode}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTeam || selectedTeamMembers.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {savingTeam ? 'Saving...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deliverable Submission Modal */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Submit Deliverable · {submitTarget.label}
              </h3>
              <button
                type="button"
                onClick={() => setSubmitTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitDeliverable} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deliverable URL (https://...)
                </label>
                <input
                  type="url"
                  required
                  value={submissionUrl}
                  onChange={(e) => setSubmissionUrl(e.target.value)}
                  placeholder="https://github.com/cci-stem/project-repo"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Submission State
                </label>
                <select
                  value={submissionStatus}
                  onChange={(e) =>
                    setSubmissionStatus(e.target.value as 'in_progress' | 'submitted')
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="submitted">Submitted for Evaluation</option>
                  <option value="in_progress">Work In Progress</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmitTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSubmission}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {savingSubmission ? 'Saving...' : 'Save Deliverable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Evaluation & Participant Feedback Modal */}
      {evalTarget && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Evaluate & Provide Feedback · {evalTarget.label}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Maximum score: {detail.project.maxScore} points
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvalTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEvaluation} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Evaluation Outcome
                  </label>
                  <select
                    value={evalStatus}
                    onChange={(e) =>
                      setEvalStatus(e.target.value as 'evaluated' | 'revision_requested')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="evaluated">Evaluated (Finalized)</option>
                    <option value="revision_requested">Revision Requested</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quality Score (0 – {detail.project.maxScore})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={detail.project.maxScore}
                    step="0.5"
                    required={evalStatus === 'evaluated'}
                    value={evalScore}
                    onChange={(e) => setEvalScore(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Structured Facilitator Feedback
                </label>
                <textarea
                  rows={3}
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  placeholder="Highlight strengths, technical quality, and concrete recommendations for growth..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {evalTarget.members && evalTarget.members.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      Individual & Collaboration Scores (0 – 100%)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Feeds directly into each participant&apos;s Project Completion and Collaboration & Problem-Solving indicators.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {evalTarget.members.map((m) => {
                      const entry = evalContributions[m.participantId] ?? {
                        individualScore: '80',
                        collaborationScore: '80',
                        notes: '',
                      };
                      return (
                        <div
                          key={m.participantId}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2"
                        >
                          <p className="text-xs font-semibold text-slate-900">{m.fullName}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-0.5">
                                Individual (%)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                required
                                value={entry.individualScore}
                                onChange={(e) =>
                                  setEvalContributions((prev) => ({
                                    ...prev,
                                    [m.participantId]: { ...entry, individualScore: e.target.value },
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-0.5">
                                Collaboration (%)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={entry.collaborationScore}
                                onChange={(e) =>
                                  setEvalContributions((prev) => ({
                                    ...prev,
                                    [m.participantId]: {
                                      ...entry,
                                      collaborationScore: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-0.5">
                                Role / Note
                              </label>
                              <input
                                type="text"
                                value={entry.notes}
                                onChange={(e) =>
                                  setEvalContributions((prev) => ({
                                    ...prev,
                                    [m.participantId]: { ...entry, notes: e.target.value },
                                  }))
                                }
                                placeholder="e.g., Firmware lead"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEvalTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEval}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {savingEval ? 'Saving...' : 'Save Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
