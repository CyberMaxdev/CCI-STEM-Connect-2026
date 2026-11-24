import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  FolderKanban,
  MessageSquare,
  Plus,
  Send,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

interface MilestoneItem {
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
  milestones: MilestoneItem[];
  isTeamProject: boolean;
  maxScore: number;
  deadline: string;
  submittedCount: number;
  evaluatedCount: number;
  totalSubmissions: number;
}

interface ProjectSubmissionDetail {
  id: string;
  submissionUrl: string | null;
  status: 'not_started' | 'in_progress' | 'submitted' | 'evaluated' | 'revision_requested';
  qualityScore: number | null;
  feedback: string | null;
  evaluatedByName: string | null;
  submittedAt: string | null;
  evaluatedAt: string | null;
  contributions?: Array<{
    participantId: string;
    fullName: string;
    individualScore: number;
    collaborationScore: number | null;
    notes: string | null;
  }>;
}

interface ProjectTeamDetail {
  id: string;
  name: string;
  members: Array<{
    participantId: string;
    participantCode: string;
    fullName: string;
  }>;
  submission: ProjectSubmissionDetail | null;
}

interface ProjectParticipantDetail {
  participantId: string;
  participantCode: string;
  fullName: string;
  status: string;
  submission: ProjectSubmissionDetail | null;
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
    milestones: MilestoneItem[];
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

interface Lookups {
  programmes: Array<{ id: string; code: string; title: string }>;
  cohorts: Array<{ id: string; name: string; programmeId: string }>;
  tracks: Array<{ id: string; name: string; programmeId: string }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'text-slate-500' },
  in_progress: { label: 'In Progress', color: 'text-amber-700' },
  submitted: { label: 'Submitted', color: 'text-[#8F0E15]' },
  evaluated: { label: 'Evaluated', color: 'text-teal-700' },
  revision_requested: { label: 'Revision Requested', color: 'text-rose-700' },
};

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://');
}

export function ProjectsPage() {
  const { user } = useAuth();
  const isStaff =
    user?.role === 'super_admin' ||
    user?.role === 'programme_manager' ||
    user?.role === 'facilitator';

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ programmes: [], cohorts: [], tracks: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create Project Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formProgrammeId, setFormProgrammeId] = useState('');
  const [formCohortId, setFormCohortId] = useState('');
  const [formTrackId, setFormTrackId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formObjectives, setFormObjectives] = useState('');
  const [formDeliverables, setFormDeliverables] = useState('');
  const [formIsTeam, setFormIsTeam] = useState(false);
  const [formMaxScore, setFormMaxScore] = useState('100');
  const [formDeadline, setFormDeadline] = useState('');
  const [formMilestones, setFormMilestones] = useState<Array<{ title: string; dueDate: string }>>([
    { title: 'Proposal & Technical Design', dueDate: '' },
    { title: 'Working Prototype & Demo', dueDate: '' },
  ]);
  const [submittingForm, setSubmittingForm] = useState(false);

  // Create Team Modal
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);

  // Submit Deliverable Modal
  const [submitTarget, setSubmitTarget] = useState<{
    type: 'participant' | 'team';
    id: string;
    label: string;
    existingUrl: string;
    existingStatus: 'in_progress' | 'submitted';
  } | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'in_progress' | 'submitted'>('submitted');

  // Evaluate & Participant Feedback Modal
  const [evalTarget, setEvalTarget] = useState<{
    type: 'participant' | 'team';
    id: string;
    label: string;
    members: Array<{ participantId: string; fullName: string }>;
  } | null>(null);
  const [evalStatus, setEvalStatus] = useState<'evaluated' | 'revision_requested'>('evaluated');
  const [evalScore, setEvalScore] = useState('');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalContribs, setEvalContribs] = useState<
    Array<{
      participantId: string;
      fullName: string;
      individualScore: string;
      collaborationScore: string;
      notes: string;
    }>
  >([]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadList = useCallback(async () => {
    try {
      setLoadingList(true);
      setError(null);
      const res = await apiFetch<{ projects: ProjectListItem[]; lookups: Lookups }>('/api/projects');
      setProjects(res.projects);
      setLookups(res.lookups);
      setSelectedId((prev) => {
        if (prev && res.projects.some((p) => p.id === prev)) return prev;
        return res.projects[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load STEM projects.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await apiFetch<ProjectDetailResponse>(`/api/projects/${projectId}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project workspace.');
      setDetail(null);
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

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.programmeCode.toLowerCase().includes(q) ||
        p.cohortName.toLowerCase().includes(q)
    );
  }, [projects, searchTerm]);

  const formCohorts = useMemo(
    () => lookups.cohorts.filter((c) => c.programmeId === formProgrammeId),
    [lookups.cohorts, formProgrammeId]
  );

  const formTracks = useMemo(
    () => lookups.tracks.filter((t) => t.programmeId === formProgrammeId),
    [lookups.tracks, formProgrammeId]
  );

  const openCreateModal = () => {
    const defaultProg = lookups.programmes[0]?.id ?? '';
    const defaultCohort = lookups.cohorts.find((c) => c.programmeId === defaultProg)?.id ?? '';
    setFormProgrammeId(defaultProg);
    setFormCohortId(defaultCohort);
    setFormTrackId('');
    setFormTitle('');
    setFormObjectives('');
    setFormDeliverables('');
    setFormIsTeam(false);
    setFormMaxScore('100');
    setFormDeadline(new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10));
    setFormMilestones([
      { title: 'Proposal & Architecture', dueDate: '' },
      { title: 'Working Prototype & Presentation', dueDate: '' },
    ]);
    setShowCreateModal(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingForm(true);
      setError(null);
      const cleanMilestones = formMilestones
        .filter((m) => m.title.trim().length >= 2)
        .map((m) => ({
          title: m.title.trim(),
          dueDate: m.dueDate || undefined,
          completed: false,
        }));

      const res = await apiFetch<{ project: { id: string } }>('/api/projects', {
        method: 'POST',
        body: {
          programmeId: formProgrammeId,
          cohortId: formCohortId,
          trackId: formTrackId || null,
          title: formTitle.trim(),
          objectives: formObjectives.trim(),
          expectedDeliverables: formDeliverables.trim(),
          isTeamProject: formIsTeam,
          maxScore: Number(formMaxScore) || 100,
          deadline: formDeadline,
          milestones: cleanMilestones,
        },
      });
      setShowCreateModal(false);
      showToast('STEM project created and linked to cohort.');
      await loadList();
      setSelectedId(res.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleToggleMilestone = async (index: number) => {
    if (!detail || !isStaff) return;
    const updatedMilestones = detail.project.milestones.map((m, i) =>
      i === index ? { ...m, completed: !m.completed } : m
    );
    try {
      setError(null);
      await apiFetch(`/api/projects/${detail.project.id}/milestones`, {
        method: 'PATCH',
        body: { milestones: updatedMilestones },
      });
      await loadDetail(detail.project.id);
      showToast('Milestone status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update milestone.');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    try {
      setSubmittingForm(true);
      setError(null);
      await apiFetch(`/api/projects/${detail.project.id}/teams`, {
        method: 'POST',
        body: {
          name: teamName.trim(),
          participantIds: teamMemberIds,
        },
      });
      setShowTeamModal(false);
      setTeamName('');
      setTeamMemberIds([]);
      showToast('Project team created.');
      await loadDetail(detail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create team.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !submitTarget) return;
    try {
      setSubmittingForm(true);
      setError(null);
      await apiFetch(`/api/projects/${detail.project.id}/submit`, {
        method: 'POST',
        body: {
          participantId: submitTarget.type === 'participant' ? submitTarget.id : undefined,
          teamId: submitTarget.type === 'team' ? submitTarget.id : undefined,
          submissionUrl: submissionUrl.trim() || null,
          status: submissionStatus,
        },
      });
      setSubmitTarget(null);
      showToast('Project deliverable saved.');
      await Promise.all([loadList(), loadDetail(detail.project.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record project submission.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const openEvaluationModal = (
    type: 'participant' | 'team',
    id: string,
    label: string,
    existing: ProjectSubmissionDetail | null,
    members: Array<{ participantId: string; fullName: string }> = []
  ) => {
    setEvalTarget({ type, id, label, members });
    setEvalStatus(
      existing?.status === 'revision_requested' ? 'revision_requested' : 'evaluated'
    );
    setEvalScore(existing?.qualityScore !== null && existing?.qualityScore !== undefined ? String(existing.qualityScore) : '');
    setEvalFeedback(existing?.feedback ?? '');
    if (type === 'team') {
      setEvalContribs(
        members.map((m) => {
          const match = existing?.contributions?.find((c) => c.participantId === m.participantId);
          return {
            participantId: m.participantId,
            fullName: m.fullName,
            individualScore: match ? String(match.individualScore) : '80',
            collaborationScore:
              match && match.collaborationScore !== null ? String(match.collaborationScore) : '85',
            notes: match?.notes ?? '',
          };
        })
      );
    } else {
      setEvalContribs([]);
    }
  };

  const handleEvaluateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !evalTarget) return;
    try {
      setSubmittingForm(true);
      setError(null);
      const parsedScore = evalScore.trim() === '' ? null : Number(evalScore);
      await apiFetch(`/api/projects/${detail.project.id}/evaluate`, {
        method: 'POST',
        body: {
          participantId: evalTarget.type === 'participant' ? evalTarget.id : undefined,
          teamId: evalTarget.type === 'team' ? evalTarget.id : undefined,
          status: evalStatus,
          qualityScore: parsedScore,
          feedback: evalFeedback.trim() || null,
          contributions:
            evalTarget.type === 'team'
              ? evalContribs.map((c) => ({
                  participantId: c.participantId,
                  individualScore: Number(c.individualScore) || 0,
                  collaborationScore:
                    c.collaborationScore.trim() !== '' ? Number(c.collaborationScore) : null,
                  notes: c.notes.trim() || null,
                }))
              : undefined,
        },
      });
      setEvalTarget(null);
      showToast('Evaluation and participant feedback saved. Performance scores updated.');
      await Promise.all([loadList(), loadDetail(detail.project.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save evaluation.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const milestoneCompletedCount =
    detail?.project.milestones.filter((m) => m.completed).length ?? 0;
  const milestoneTotalCount = detail?.project.milestones.length ?? 0;
  const milestonePct =
    milestoneTotalCount > 0
      ? Math.round((milestoneCompletedCount / milestoneTotalCount) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            STEM Projects, Milestones & Feedback
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Track individual and team STEM deliverables, facilitator feedback, and per-member
            collaboration scores connected directly to the Performance Engine.
          </p>
        </div>

        {isStaff && (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={lookups.programmes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New STEM Project</span>
          </button>
        )}
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Project List */}
        <section className="xl:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Active Projects</h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {filteredProjects.length}
              </span>
            </div>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by title, programme, cohort..."
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#B5121B]"
            />
          </div>

          {loadingList ? (
            <div className="p-4 space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-8 text-center">
              <FolderKanban className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="mt-2.5 text-sm font-medium text-slate-700">No STEM projects yet</p>
              <p className="mt-1 text-xs text-slate-500">
                {isStaff
                  ? 'Create a project for a cohort to track milestones, team deliverables, and facilitator feedback.'
                  : 'Assigned cohort STEM projects will appear here once scheduled.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {filteredProjects.map((proj) => {
                const active = proj.id === selectedId;
                return (
                  <li key={proj.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(proj.id)}
                      className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                        active ? 'bg-red-50/55' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            active ? 'text-[#8F0E15]' : 'text-slate-900'
                          }`}
                        >
                          {proj.title}
                        </p>
                        <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                          {proj.maxScore} pts
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {proj.programmeCode} · {proj.cohortName}
                        {proj.trackName ? ` · ${proj.trackName}` : ''}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                        <span>{proj.isTeamProject ? 'Team Project' : 'Individual Project'}</span>
                        <span className="font-mono tabular-nums">
                          {proj.evaluatedCount} evaluated · Due{' '}
                          {new Date(proj.deadline).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right Detail Workspace */}
        <div className="xl:col-span-8 space-y-6">
          {loadingDetail ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="h-7 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-44 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !detail ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <p className="text-sm text-slate-600">
                Select a STEM project from the list to manage milestones, submissions, and
                participant feedback.
              </p>
            </div>
          ) : (
            <>
              {/* Project Overview & Milestones */}
              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">
                      {detail.project.programmeCode} — {detail.project.programmeTitle} ·{' '}
                      {detail.project.cohortName}
                      {detail.project.trackName ? ` · ${detail.project.trackName}` : ''}
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      {detail.project.title}
                    </h3>
                  </div>
                  <div className="text-xs text-slate-600 font-mono tabular-nums sm:text-right shrink-0">
                    <p>
                      {detail.project.isTeamProject ? 'Team Project' : 'Individual Project'} · Max{' '}
                      {detail.project.maxScore} pts
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      Deadline: {new Date(detail.project.deadline).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500">Project Objectives</h4>
                    <p className="mt-1.5 text-slate-700 leading-relaxed whitespace-pre-line">
                      {detail.project.objectives}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500">Expected Deliverables</h4>
                    <p className="mt-1.5 text-slate-700 leading-relaxed whitespace-pre-line">
                      {detail.project.expectedDeliverables}
                    </p>
                  </div>
                </div>

                {/* Milestones */}
                {detail.project.milestones.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-900">
                        Project Milestones
                      </h4>
                      <span className="text-xs font-mono tabular-nums text-slate-600">
                        {milestoneCompletedCount}/{milestoneTotalCount} completed ({milestonePct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-[#B5121B] transition-all"
                        style={{ width: `${milestonePct}%` }}
                      />
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {detail.project.milestones.map((ms, idx) => (
                        <li
                          key={`${ms.title}-${idx}`}
                          className="py-2 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            disabled={!isStaff}
                            onClick={() => handleToggleMilestone(idx)}
                            className={`flex items-center gap-2.5 text-sm text-left ${
                              isStaff ? 'cursor-pointer hover:text-[#8F0E15]' : 'cursor-default'
                            }`}
                          >
                            {ms.completed ? (
                              <CheckSquare className="w-4 h-4 text-teal-700 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span
                              className={
                                ms.completed ? 'line-through text-slate-400' : 'text-slate-800'
                              }
                            >
                              {ms.title}
                            </span>
                          </button>
                          {ms.dueDate && (
                            <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                              {ms.dueDate}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* Deliverables, Teams & Facilitator Feedback */}
              {detail.project.isTeamProject ? (
                <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">
                        Project Teams, Submissions & Feedback
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Each member&apos;s individual and collaboration scores feed directly into
                        their performance record.
                      </p>
                    </div>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamName('');
                          setTeamMemberIds([]);
                          setShowTeamModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Create Team</span>
                      </button>
                    )}
                  </div>

                  {detail.teams.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      {isStaff
                        ? 'No teams formed yet. Click "Create Team" to group cohort participants.'
                        : 'You have not been assigned to a team for this project yet.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {detail.teams.map((team) => {
                        const statusKey = team.submission?.status ?? 'not_started';
                        const statusMeta = STATUS_LABELS[statusKey] ?? STATUS_LABELS.not_started;
                        return (
                          <div key={team.id} className="p-6 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <h5 className="text-sm font-semibold text-slate-900">
                                    {team.name}
                                  </h5>
                                  <span className={`text-xs font-medium ${statusMeta.color}`}>
                                    · {statusMeta.label}
                                  </span>
                                  {team.submission?.qualityScore !== null &&
                                    team.submission?.qualityScore !== undefined && (
                                      <span className="text-xs font-mono tabular-nums font-semibold text-slate-800">
                                        · {team.submission.qualityScore}/{detail.project.maxScore}
                                      </span>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  Members:{' '}
                                  {team.members
                                    .map((m) => `${m.fullName} (${m.participantCode})`)
                                    .join(', ')}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubmitTarget({
                                      type: 'team',
                                      id: team.id,
                                      label: team.name,
                                      existingUrl: team.submission?.submissionUrl ?? '',
                                      existingStatus:
                                        team.submission?.status === 'in_progress'
                                          ? 'in_progress'
                                          : 'submitted',
                                    });
                                    setSubmissionUrl(team.submission?.submissionUrl ?? '');
                                    setSubmissionStatus('submitted');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Submit Link</span>
                                </button>
                                {isStaff && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEvaluationModal(
                                        'team',
                                        team.id,
                                        team.name,
                                        team.submission,
                                        team.members
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>Evaluate</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {isSafeHttpUrl(team.submission?.submissionUrl) && (
                              <div className="text-xs">
                                <a
                                  href={team.submission.submissionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[#B5121B] hover:text-[#8F0E15] font-medium underline underline-offset-2 break-all"
                                >
                                  <span>{team.submission.submissionUrl}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            )}

                            {team.submission?.feedback && (
                              <div className="text-xs text-slate-700 bg-slate-50 rounded-lg p-3">
                                <span className="font-semibold text-slate-900">
                                  Facilitator Feedback
                                  {team.submission.evaluatedByName
                                    ? ` (${team.submission.evaluatedByName})`
                                    : ''}
                                  :{' '}
                                </span>
                                {team.submission.feedback}
                              </div>
                            )}

                            {team.submission?.contributions &&
                              team.submission.contributions.length > 0 && (
                                <div className="overflow-x-auto pt-1">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-slate-500 border-b border-slate-100">
                                        <th className="py-1.5 pr-4 font-medium">Member</th>
                                        <th className="py-1.5 px-3 text-right font-medium">
                                          Individual Score
                                        </th>
                                        <th className="py-1.5 px-3 text-right font-medium">
                                          Collaboration
                                        </th>
                                        <th className="py-1.5 pl-3 font-medium">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {team.submission.contributions.map((c) => (
                                        <tr key={c.participantId}>
                                          <td className="py-1.5 pr-4 font-medium text-slate-800">
                                            {c.fullName}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                            {c.individualScore}%
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                            {c.collaborationScore !== null
                                              ? `${c.collaborationScore}%`
                                              : '—'}
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
                </section>
              ) : (
                <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-base font-semibold text-slate-900">
                      Individual Submissions & Facilitator Feedback
                    </h4>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {detail.participants.length} learners
                    </span>
                  </div>

                  {detail.participants.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      No eligible cohort participants found for this project.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                            <th className="py-3 px-6">Participant</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Deliverable & Feedback</th>
                            <th className="py-3 px-4 text-right">Score</th>
                            <th className="py-3 px-6 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.participants.map((p) => {
                            const statusKey = p.submission?.status ?? 'not_started';
                            const statusMeta =
                              STATUS_LABELS[statusKey] ?? STATUS_LABELS.not_started;
                            return (
                              <tr key={p.participantId} className="hover:bg-slate-50/60 align-top">
                                <td className="py-3.5 px-6">
                                  <p className="font-medium text-slate-900">{p.fullName}</p>
                                  <p className="text-xs font-mono text-slate-500">
                                    {p.participantCode}
                                  </p>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span className={`text-xs font-medium ${statusMeta.color}`}>
                                    {statusMeta.label}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-xs space-y-1 max-w-xs">
                                  {isSafeHttpUrl(p.submission?.submissionUrl) ? (
                                    <a
                                      href={p.submission.submissionUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[#B5121B] hover:text-[#8F0E15] font-medium underline underline-offset-2 break-all"
                                    >
                                      <span>Open Deliverable</span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">No link submitted</span>
                                  )}
                                  {p.submission?.feedback && (
                                    <p className="text-slate-600 leading-relaxed">
                                      <span className="font-semibold text-slate-800">
                                        Feedback:{' '}
                                      </span>
                                      {p.submission.feedback}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                                  {p.submission?.qualityScore !== null &&
                                  p.submission?.qualityScore !== undefined
                                    ? `${p.submission.qualityScore}/${detail.project.maxScore}`
                                    : '—'}
                                </td>
                                <td className="py-3.5 px-6 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSubmitTarget({
                                          type: 'participant',
                                          id: p.participantId,
                                          label: p.fullName,
                                          existingUrl: p.submission?.submissionUrl ?? '',
                                          existingStatus:
                                            p.submission?.status === 'in_progress'
                                              ? 'in_progress'
                                              : 'submitted',
                                        });
                                        setSubmissionUrl(p.submission?.submissionUrl ?? '');
                                        setSubmissionStatus('submitted');
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                                    >
                                      Submit
                                    </button>
                                    {isStaff && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openEvaluationModal(
                                            'participant',
                                            p.participantId,
                                            p.fullName,
                                            p.submission
                                          )
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap"
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
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-xl my-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create STEM Project</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Programme</label>
                  <select
                    required
                    value={formProgrammeId}
                    onChange={(e) => {
                      const nextProg = e.target.value;
                      setFormProgrammeId(nextProg);
                      const nextCohort =
                        lookups.cohorts.find((c) => c.programmeId === nextProg)?.id ?? '';
                      setFormCohortId(nextCohort);
                      setFormTrackId('');
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
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
                    value={formCohortId}
                    onChange={(e) => setFormCohortId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
                  >
                    {formCohorts.length === 0 ? (
                      <option value="">No cohorts available</option>
                    ) : (
                      formCohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    STEM Track (Optional)
                  </label>
                  <select
                    value={formTrackId}
                    onChange={(e) => setFormTrackId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
                  >
                    <option value="">All Tracks</option>
                    {formTracks.map((t) => (
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
                    value={formMaxScore}
                    onChange={(e) => setFormMaxScore(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deadline</label>
                  <input
                    type="date"
                    required
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Smart Solar Water Quality Monitor"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Project Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormIsTeam(false)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      !formIsTeam
                        ? 'border-[#B5121B] bg-red-50/50 text-[#8F0E15]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Individual Project
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormIsTeam(true)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      formIsTeam
                        ? 'border-[#B5121B] bg-red-50/50 text-[#8F0E15]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Team Project (with Collaboration Scoring)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Objectives</label>
                <textarea
                  rows={2}
                  required
                  value={formObjectives}
                  onChange={(e) => setFormObjectives(e.target.value)}
                  placeholder="Define technical and learning objectives..."
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Deliverables
                </label>
                <textarea
                  rows={2}
                  required
                  value={formDeliverables}
                  onChange={(e) => setFormDeliverables(e.target.value)}
                  placeholder="e.g., GitHub repository link, circuit schematic, and 5-minute demo video"
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              {/* Dynamic Milestones */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Milestones</label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormMilestones((prev) => [...prev, { title: '', dueDate: '' }])
                    }
                    className="text-xs font-semibold text-[#B5121B] hover:text-[#8F0E15] cursor-pointer"
                  >
                    + Add Milestone
                  </button>
                </div>
                {formMilestones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={m.title}
                      onChange={(e) =>
                        setFormMilestones((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, title: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Milestone title"
                      className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs"
                    />
                    <input
                      type="date"
                      value={m.dueDate}
                      onChange={(e) =>
                        setFormMilestones((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, dueDate: e.target.value } : item
                          )
                        )
                      }
                      className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormMilestones((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove milestone"
                      className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm || !formCohortId}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {submittingForm ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showTeamModal && detail && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create Project Team</h3>
              <button
                type="button"
                onClick={() => setShowTeamModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Team Quantum"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Select Cohort Participants ({teamMemberIds.length} selected)
                </label>
                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {detail.allEligibleLearners.map((learner) => {
                    const checked = teamMemberIds.includes(learner.id);
                    return (
                      <label
                        key={learner.id}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setTeamMemberIds((prev) =>
                              checked ? prev.filter((id) => id !== learner.id) : [...prev, learner.id]
                            )
                          }
                          className="accent-[#B5121B]"
                        />
                        <span className="font-medium text-slate-900">{learner.fullName}</span>
                        <span className="font-mono text-slate-400 ml-auto">
                          {learner.participantCode}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm || teamMemberIds.length === 0}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {submittingForm ? 'Saving...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Deliverable Modal */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Submit Deliverable — {submitTarget.label}
              </h3>
              <button
                type="button"
                onClick={() => setSubmitTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitDeliverable} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deliverable Link (https://)
                </label>
                <input
                  type="url"
                  required
                  value={submissionUrl}
                  onChange={(e) => setSubmissionUrl(e.target.value)}
                  placeholder="https://github.com/team/stem-project"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Submission Status
                </label>
                <select
                  value={submissionStatus}
                  onChange={(e) =>
                    setSubmissionStatus(e.target.value as 'in_progress' | 'submitted')
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm"
                >
                  <option value="submitted">Submitted for Evaluation</option>
                  <option value="in_progress">Work in Progress</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSubmitTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {submittingForm ? 'Saving...' : 'Save Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Evaluate & Participant Feedback Modal */}
      {evalTarget && detail && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-xl my-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Evaluate & Give Feedback — {evalTarget.label}
              </h3>
              <button
                type="button"
                onClick={() => setEvalTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={handleEvaluateSubmit}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
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
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm"
                  >
                    <option value="evaluated">Evaluated (Finalised)</option>
                    <option value="revision_requested">Revision Requested</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quality Score (0 – {detail.project.maxScore})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={detail.project.maxScore}
                    required={evalStatus === 'evaluated'}
                    value={evalScore}
                    onChange={(e) => setEvalScore(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Structured Participant Feedback
                </label>
                <textarea
                  rows={3}
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  placeholder="Provide strengths, technical observations, and actionable recommendations..."
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              {evalTarget.type === 'team' && evalContribs.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-900">
                    Individual & Collaboration Contributions (0–100%)
                  </p>
                  {evalContribs.map((c, idx) => (
                    <div
                      key={c.participantId}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center py-2 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="sm:col-span-4 text-xs font-medium text-slate-800 truncate">
                        {c.fullName}
                      </span>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={c.individualScore}
                          onChange={(e) =>
                            setEvalContribs((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, individualScore: e.target.value } : item
                              )
                            )
                          }
                          aria-label={`Individual score for ${c.fullName}`}
                          placeholder="Ind %"
                          className="w-full h-9 px-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={c.collaborationScore}
                          onChange={(e) =>
                            setEvalContribs((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, collaborationScore: e.target.value } : item
                              )
                            )
                          }
                          aria-label={`Collaboration score for ${c.fullName}`}
                          placeholder="Collab %"
                          className="w-full h-9 px-2 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          value={c.notes}
                          onChange={(e) =>
                            setEvalContribs((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, notes: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Contribution note"
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEvalTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {submittingForm ? 'Saving...' : 'Save Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
