import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  CohortItem,
  LearningOutcomeItem,
  ObjectiveItem,
  ProgrammeSummary,
  SessionItem,
  StaffMember,
  StemTrackItem,
} from '../types';

interface ProgrammeDetail {
  programme: ProgrammeSummary;
  cohorts: CohortItem[];
  tracks: StemTrackItem[];
  objectives: ObjectiveItem[];
  outcomes: LearningOutcomeItem[];
  sessions: SessionItem[];
}

type DetailTab = 'cohorts' | 'tracks' | 'objectives' | 'sessions';

export function ProgrammesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'programme_manager';

  const [programmes, setProgrammes] = useState<ProgrammeSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('cohorts');

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadProgrammes = useCallback(async () => {
    try {
      setLoadingList(true);
      setError(null);
      const [progRes, staffRes] = await Promise.all([
        apiFetch<{ programmes: ProgrammeSummary[] }>('/api/programmes'),
        apiFetch<{ staff: StaffMember[] }>('/api/staff'),
      ]);
      setProgrammes(progRes.programmes);
      setStaff(staffRes.staff);
      setSelectedId((prev) => {
        if (prev && progRes.programmes.some((p) => p.id === prev)) return prev;
        return progRes.programmes[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load programmes.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await apiFetch<ProgrammeDetail>(`/api/programmes/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load programme details.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadProgrammes();
  }, [loadProgrammes]);

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

  const refreshAll = async (targetId?: string) => {
    await loadProgrammes();
    const idToLoad = targetId ?? selectedId;
    if (idToLoad) {
      setSelectedId(idToLoad);
      await loadDetail(idToLoad);
    }
  };

  const handleStatusChange = async (
    progId: string,
    status: 'draft' | 'active' | 'completed' | 'archived'
  ) => {
    try {
      setError(null);
      await apiFetch(`/api/programmes/${progId}`, { method: 'PATCH', body: { status } });
      showToast(`Programme status updated to ${status}.`);
      await refreshAll(progId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update programme status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Programme Lifecycle & Delivery
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure programmes, cohorts, STEM tracks, confirmed learning objectives, outcomes, and
            facilitated sessions.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="h-10 px-4 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Programme</span>
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

      {/* Main Split: Programme List + Selected Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Programmes</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {programmes.length} total
            </span>
          </div>

          {loadingList ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : programmes.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No programmes yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create a programme to begin organising cohorts, tracks, and participants.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {programmes.map((prog) => {
                const isSelected = prog.id === selectedId;
                return (
                  <li key={prog.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(prog.id)}
                      className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-medium text-[#B5121B]">
                          {prog.code}
                        </span>
                        <span className="text-xs capitalize text-slate-500">{prog.status}</span>
                      </div>
                      <p
                        className={`mt-1 text-sm font-semibold truncate ${
                          isSelected ? 'text-[#8F0E15]' : 'text-slate-800'
                        }`}
                      >
                        {prog.title}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                        {prog.stats.cohortsCount} cohorts · {prog.stats.tracksCount} tracks ·{' '}
                        {prog.stats.participantsCount} participants
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Detail Workspace */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {!selectedId || !detail ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                {loadingDetail ? 'Loading programme details...' : 'Select or create a programme'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Cohorts, STEM tracks, objectives, learning outcomes, and sessions are managed inside
                each programme.
              </p>
            </div>
          ) : (
            <div>
              {/* Detail Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-[#B5121B]">
                        {detail.programme.code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {detail.programme.startDate} to {detail.programme.endDate}
                      </span>
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      {detail.programme.title}
                    </h3>
                    {detail.programme.description && (
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                        {detail.programme.description}
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>
                      <select
                        aria-label="Programme status"
                        value={detail.programme.status}
                        onChange={(e) =>
                          handleStatusChange(
                            detail.programme.id,
                            e.target.value as 'draft' | 'active' | 'completed' | 'archived'
                          )
                        }
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 capitalize shrink-0"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Live Programme Delivery Progress Strip */}
                {(() => {
                  const totalEnrolled = detail.cohorts.reduce(
                    (sum, c) => sum + (c.participantCount ?? 0),
                    0
                  );
                  const totalCapacity = detail.cohorts.reduce(
                    (sum, c) => sum + (c.capacity ?? 0),
                    0
                  );
                  const completedSessions = detail.sessions.filter(
                    (s) => s.status === 'completed'
                  ).length;
                  const confirmedObjectives = detail.objectives.filter(
                    (o) => o.isConfirmed
                  ).length;

                  return (
                    <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Enrolled Participants</p>
                        <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                          {totalEnrolled}
                          {totalCapacity > 0 && (
                            <span className="text-xs font-normal text-slate-500">
                              {' '}
                              / {totalCapacity} cap
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Sessions Completed</p>
                        <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                          {completedSessions}
                          <span className="text-xs font-normal text-slate-500">
                            {' '}
                            / {detail.sessions.length}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Confirmed Objectives</p>
                        <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-teal-700">
                          {confirmedObjectives}
                          <span className="text-xs font-normal text-slate-500">
                            {' '}
                            / {detail.objectives.length}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Learning Outcomes</p>
                        <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                          {detail.outcomes.length}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Segmented Tabs */}
                <div className="mt-6 flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                  {(
                    [
                      { id: 'cohorts', label: `Cohorts (${detail.cohorts.length})` },
                      { id: 'tracks', label: `STEM Tracks (${detail.tracks.length})` },
                      {
                        id: 'objectives',
                        label: `Objectives & Outcomes (${detail.objectives.length})`,
                      },
                      { id: 'sessions', label: `Sessions (${detail.sessions.length})` },
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

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'cohorts' && (
                  <CohortsTab
                    programmeId={detail.programme.id}
                    cohorts={detail.cohorts}
                    canEdit={canEdit}
                    onSaved={async (msg) => {
                      showToast(msg);
                      await refreshAll(detail.programme.id);
                    }}
                    onError={setError}
                  />
                )}

                {activeTab === 'tracks' && (
                  <TracksTab
                    programmeId={detail.programme.id}
                    tracks={detail.tracks}
                    canEdit={canEdit}
                    onSaved={async (msg) => {
                      showToast(msg);
                      await refreshAll(detail.programme.id);
                    }}
                    onError={setError}
                  />
                )}

                {activeTab === 'objectives' && (
                  <ObjectivesTab
                    programmeId={detail.programme.id}
                    objectives={detail.objectives}
                    outcomes={detail.outcomes}
                    canEdit={canEdit}
                    onSaved={async (msg) => {
                      showToast(msg);
                      await refreshAll(detail.programme.id);
                    }}
                    onError={setError}
                  />
                )}

                {activeTab === 'sessions' && (
                  <SessionsTab
                    programmeId={detail.programme.id}
                    cohorts={detail.cohorts}
                    tracks={detail.tracks}
                    sessions={detail.sessions}
                    staff={staff}
                    canEdit={canEdit}
                    onSaved={async (msg) => {
                      showToast(msg);
                      await refreshAll(detail.programme.id);
                    }}
                    onError={setError}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Programme Modal */}
      {showCreateModal && (
        <CreateProgrammeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async (createdId) => {
            setShowCreateModal(false);
            showToast('Programme created successfully.');
            await refreshAll(createdId);
          }}
        />
      )}

      {/* Edit Programme Modal */}
      {showEditModal && detail && (
        <EditProgrammeModal
          programme={detail.programme}
          onClose={() => setShowEditModal(false)}
          onUpdated={async () => {
            setShowEditModal(false);
            showToast('Programme details updated.');
            await refreshAll(detail.programme.id);
          }}
        />
      )}
    </div>
  );
}

function CreateProgrammeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'draft' | 'active'>('active');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);
      const res = await apiFetch<{ programme: { id: string } }>('/api/programmes', {
        method: 'POST',
        body: { code, title, description: description || null, startDate, endDate, status },
      });
      onCreated(res.programme.id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to create programme.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Create New Programme</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Programme Code *
              </label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="STEM-2026"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Programme Title *
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="CCI STEM Connect 2026 Fellowship"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview of programme scope, delivery cadence, and target cohort."
              className="w-full p-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'active')}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
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
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Programme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProgrammeModal({
  programme,
  onClose,
  onUpdated,
}: {
  programme: ProgrammeSummary;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [code, setCode] = useState(programme.code);
  const [title, setTitle] = useState(programme.title);
  const [description, setDescription] = useState(programme.description ?? '');
  const [startDate, setStartDate] = useState(programme.startDate);
  const [endDate, setEndDate] = useState(programme.endDate);
  const [status, setStatus] = useState<'draft' | 'active' | 'completed' | 'archived'>(
    programme.status
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);
      await apiFetch(`/api/programmes/${programme.id}`, {
        method: 'PATCH',
        body: {
          code,
          title,
          description: description.trim() || null,
          startDate,
          endDate,
          status,
        },
      });
      await onUpdated();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to update programme.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Edit Programme Details</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Programme Code *
              </label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Programme Title *
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'draft' | 'active' | 'completed' | 'archived')
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
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
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CohortsTab({
  programmeId,
  cohorts,
  canEdit,
  onSaved,
  onError,
}: {
  programmeId: string;
  cohorts: CohortItem[];
  canEdit: boolean;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [status, setStatus] = useState<'upcoming' | 'active' | 'completed'>('active');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      onError(null);
      await apiFetch(`/api/programmes/${programmeId}/cohorts`, {
        method: 'POST',
        body: {
          name,
          startDate,
          endDate,
          capacity: capacity ? Number(capacity) : null,
          status,
        },
      });
      setName('');
      setStartDate('');
      setEndDate('');
      setCapacity('');
      await onSaved('Cohort added to programme.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to add cohort.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    cohortId: string,
    newStatus: 'upcoming' | 'active' | 'completed'
  ) => {
    try {
      onError(null);
      await apiFetch(`/api/cohorts/${cohortId}`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      await onSaved('Cohort status updated.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update cohort status.');
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-6 border-b border-slate-200 items-end"
        >
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Cohort Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cohort A — Spring 2026"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Start *</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">End *</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Capacity</label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Optional"
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Saving...' : 'Add Cohort'}
            </button>
          </div>
        </form>
      )}

      {cohorts.length === 0 ? (
        <p className="py-6 text-sm text-slate-500 text-center">
          No cohorts created for this programme yet. Add at least one cohort before registering
          participants.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="pb-3 pr-4">Cohort Name</th>
                <th className="pb-3 pr-4">Schedule</th>
                <th className="pb-3 pr-4 text-right">Enrolled</th>
                <th className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cohorts.map((cohort) => (
                <tr key={cohort.id} className="hover:bg-slate-50/60">
                  <td className="py-3 pr-4 font-medium text-slate-900">{cohort.name}</td>
                  <td className="py-3 pr-4 text-xs font-mono tabular-nums text-slate-600">
                    {cohort.startDate} → {cohort.endDate}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-800">
                    {cohort.participantCount ?? 0}
                    {cohort.capacity ? ` / ${cohort.capacity}` : ''}
                  </td>
                  <td className="py-3 text-right">
                    {canEdit ? (
                      <select
                        value={cohort.status}
                        onChange={(e) =>
                          handleStatusChange(
                            cohort.id,
                            e.target.value as 'upcoming' | 'active' | 'completed'
                          )
                        }
                        className="h-8 px-2 rounded border border-slate-200 bg-white text-xs capitalize text-slate-700"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                    ) : (
                      <span className="text-xs capitalize text-slate-600">{cohort.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TracksTab({
  programmeId,
  tracks,
  canEdit,
  onSaved,
  onError,
}: {
  programmeId: string;
  tracks: StemTrackItem[];
  canEdit: boolean;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      onError(null);
      await apiFetch(`/api/programmes/${programmeId}/tracks`, {
        method: 'POST',
        body: { name, code: code || null, description: description || null },
      });
      setName('');
      setCode('');
      setDescription('');
      await onSaved('STEM track created.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to create STEM track.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (trackId: string) => {
    try {
      onError(null);
      await apiFetch(`/api/tracks/${trackId}`, { method: 'DELETE' });
      await onSaved('STEM track removed.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to remove STEM track.');
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-6 border-b border-slate-200 items-end"
        >
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Track Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Robotics & Embedded Systems"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ROB"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Applied sensors, automation, and microcontroller labs"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Saving...' : 'Add Track'}
            </button>
          </div>
        </form>
      )}

      {tracks.length === 0 ? (
        <p className="py-6 text-sm text-slate-500 text-center">
          No STEM tracks configured for this programme yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tracks.map((track) => (
            <li key={track.id} className="py-3.5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{track.name}</span>
                  {track.code && (
                    <span className="text-xs font-mono text-teal-700">{track.code}</span>
                  )}
                </div>
                {track.description && (
                  <p className="mt-0.5 text-xs text-slate-600">{track.description}</p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {track.participantCount ?? 0} participants
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(track.id)}
                    aria-label={`Delete ${track.name}`}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ObjectivesTab({
  programmeId,
  objectives,
  outcomes,
  canEdit,
  onSaved,
  onError,
}: {
  programmeId: string;
  objectives: ObjectiveItem[];
  outcomes: LearningOutcomeItem[];
  canEdit: boolean;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [objTitle, setObjTitle] = useState('');
  const [objMetric, setObjMetric] = useState('');
  const [objConfirmed, setObjConfirmed] = useState(false);

  const [outCode, setOutCode] = useState('');
  const [outStatement, setOutStatement] = useState('');
  const [outObjectiveId, setOutObjectiveId] = useState('');
  const [outTarget, setOutTarget] = useState('70');

  const handleAddObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onError(null);
      await apiFetch(`/api/programmes/${programmeId}/objectives`, {
        method: 'POST',
        body: {
          title: objTitle,
          targetMetric: objMetric || null,
          isConfirmed: objConfirmed,
        },
      });
      setObjTitle('');
      setObjMetric('');
      setObjConfirmed(false);
      await onSaved('Programme objective saved.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save objective.');
    }
  };

  const toggleConfirm = async (obj: ObjectiveItem) => {
    try {
      onError(null);
      await apiFetch(`/api/objectives/${obj.id}`, {
        method: 'PATCH',
        body: { isConfirmed: !obj.isConfirmed },
      });
      await onSaved(
        !obj.isConfirmed ? 'Objective confirmed as official.' : 'Objective returned to draft.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update objective confirmation.');
    }
  };

  const handleDeleteObjective = async (objectiveId: string) => {
    try {
      onError(null);
      await apiFetch(`/api/objectives/${objectiveId}`, { method: 'DELETE' });
      await onSaved('Programme objective removed.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to remove objective.');
    }
  };

  const handleAddOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onError(null);
      await apiFetch(`/api/programmes/${programmeId}/outcomes`, {
        method: 'POST',
        body: {
          code: outCode,
          statement: outStatement,
          objectiveId: outObjectiveId || null,
          targetProficiencyPct: Number(outTarget) || 70,
        },
      });
      setOutCode('');
      setOutStatement('');
      setOutObjectiveId('');
      setOutTarget('70');
      await onSaved('Measurable learning outcome added.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save learning outcome.');
    }
  };

  const handleDeleteOutcome = async (outcomeId: string) => {
    try {
      onError(null);
      await apiFetch(`/api/outcomes/${outcomeId}`, { method: 'DELETE' });
      await onSaved('Learning outcome removed.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to remove learning outcome.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Programme Objectives */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Configurable Programme Objectives
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Objectives remain in draft until explicitly confirmed by an administrator or programme
            manager.
          </p>
        </div>

        {canEdit && (
          <form
            onSubmit={handleAddObjective}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-4 border-b border-slate-100 items-end"
          >
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Objective Title *
              </label>
              <input
                required
                value={objTitle}
                onChange={(e) => setObjTitle(e.target.value)}
                placeholder="Strengthen applied STEM problem-solving readiness"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Metric</label>
              <input
                value={objMetric}
                onChange={(e) => setObjMetric(e.target.value)}
                placeholder=">= 75% proficiency"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-2 flex items-center h-9">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={objConfirmed}
                  onChange={(e) => setObjConfirmed(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Confirmed</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap"
              >
                Add Objective
              </button>
            </div>
          </form>
        )}

        {objectives.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">No objectives defined yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {objectives.map((obj) => (
              <li key={obj.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{obj.title}</p>
                  {obj.targetMetric && (
                    <p className="text-xs text-slate-500 mt-0.5">Target: {obj.targetMetric}</p>
                  )}
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleConfirm(obj)}
                      className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        obj.isConfirmed
                          ? 'border-teal-200 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {obj.isConfirmed && <Check className="w-3.5 h-3.5" />}
                      <span>{obj.isConfirmed ? 'Confirmed' : 'Confirm Official'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteObjective(obj.id)}
                      aria-label={`Delete objective ${obj.title}`}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span
                    className={`text-xs font-medium ${
                      obj.isConfirmed ? 'text-teal-700' : 'text-amber-700'
                    }`}
                  >
                    {obj.isConfirmed ? 'Confirmed' : 'Pending confirmation'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Measurable Learning Outcomes */}
      <div className="pt-6 border-t border-slate-200 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Measurable Learning Outcomes</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Outcomes can be mapped to assessments and practical projects to measure achievement.
          </p>
        </div>

        {canEdit && (
          <form
            onSubmit={handleAddOutcome}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-4 border-b border-slate-100 items-end"
          >
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Code *</label>
              <input
                required
                value={outCode}
                onChange={(e) => setOutCode(e.target.value)}
                placeholder="LO-01"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Outcome Statement *
              </label>
              <input
                required
                value={outStatement}
                onChange={(e) => setOutStatement(e.target.value)}
                placeholder="Design and test a functioning prototype circuit"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Objective</label>
              <select
                value={outObjectiveId}
                onChange={(e) => setOutObjectiveId(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs"
              >
                <option value="">Unlinked</option>
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title.slice(0, 28)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Target %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={outTarget}
                onChange={(e) => setOutTarget(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap"
              >
                Add Outcome
              </button>
            </div>
          </form>
        )}

        {outcomes.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">No learning outcomes configured yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {outcomes.map((out) => (
              <li key={out.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-mono font-semibold text-teal-700 mr-2">
                    {out.code}
                  </span>
                  <span className="text-sm text-slate-800">{out.statement}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    Target {Number(out.targetProficiencyPct)}%
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOutcome(out.id)}
                      aria-label={`Delete outcome ${out.code}`}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SessionsTab({
  programmeId,
  cohorts,
  tracks,
  sessions,
  staff,
  canEdit,
  onSaved,
  onError,
}: {
  programmeId: string;
  cohorts: CohortItem[];
  tracks: StemTrackItem[];
  sessions: SessionItem[];
  staff: StaffMember[];
  canEdit: boolean;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? '');
  const [trackId, setTrackId] = useState('');
  const [facilitatorId, setFacilitatorId] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [deliverables, setDeliverables] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!cohortId && cohorts[0]) {
      setCohortId(cohorts[0].id);
    }
  }, [cohorts, cohortId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      onError(null);
      await apiFetch(`/api/programmes/${programmeId}/sessions`, {
        method: 'POST',
        body: {
          title,
          cohortId,
          trackId: trackId || null,
          facilitatorId: facilitatorId || null,
          sessionDate,
          startTime,
          endTime,
          deliverables: deliverables || null,
          status: 'scheduled',
        },
      });
      setTitle('');
      setSessionDate('');
      setDeliverables('');
      await onSaved('Session scheduled and linked to cohort.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to schedule session.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (
    sessionId: string,
    status: 'scheduled' | 'completed' | 'cancelled'
  ) => {
    try {
      onError(null);
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'PATCH', body: { status } });
      await onSaved('Session status updated.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update session.');
    }
  };

  const handleFacilitatorUpdate = async (sessionId: string, newFacilitatorId: string) => {
    try {
      onError(null);
      await apiFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: { facilitatorId: newFacilitatorId || null },
      });
      await onSaved('Session facilitator assignment updated.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to assign facilitator.');
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 pb-6 border-b border-slate-200"
        >
          {cohorts.length === 0 ? (
            <p className="text-xs text-amber-700">
              Create a cohort first before scheduling sessions.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Session Title *
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Week 1: Sensor Calibration Lab"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cohort *</label>
                  <select
                    required
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
                  >
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    STEM Track
                  </label>
                  <select
                    value={trackId}
                    onChange={(e) => setTrackId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
                  >
                    <option value="">All Tracks</option>
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Facilitator
                  </label>
                  <select
                    value={facilitatorId}
                    onChange={(e) => setFacilitatorId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Start *</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">End *</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-9 px-3 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    {submitting ? 'Saving...' : 'Schedule'}
                  </button>
                </div>
              </div>

              <div>
                <input
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                  placeholder="Optional activities or expected session deliverables..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
            </>
          )}
        </form>
      )}

      {sessions.length === 0 ? (
        <p className="py-6 text-sm text-slate-500 text-center">No sessions scheduled yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="pb-3 pr-4">Session</th>
                <th className="pb-3 pr-4">Cohort / Track</th>
                <th className="pb-3 pr-4">Facilitator</th>
                <th className="pb-3 pr-4">Schedule</th>
                <th className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">{s.title}</p>
                    {s.deliverables && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                        {s.deliverables}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-600">
                    <span>{s.cohortName}</span>
                    {s.trackName && <span className="text-slate-400"> · {s.trackName}</span>}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-700">
                    {canEdit ? (
                      <select
                        aria-label={`Assign facilitator for ${s.title}`}
                        value={s.facilitatorId ?? ''}
                        onChange={(e) => handleFacilitatorUpdate(s.id, e.target.value)}
                        className="h-8 max-w-[160px] px-2 rounded border border-slate-200 bg-white text-xs text-slate-700"
                      >
                        <option value="">Unassigned</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{s.facilitatorName ?? 'Unassigned'}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {s.sessionDate} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                  </td>
                  <td className="py-3 text-right">
                    {canEdit ? (
                      <select
                        value={s.status}
                        onChange={(e) =>
                          handleStatusUpdate(
                            s.id,
                            e.target.value as 'scheduled' | 'completed' | 'cancelled'
                          )
                        }
                        className="h-8 px-2 rounded border border-slate-200 bg-white text-xs capitalize text-slate-700"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className="text-xs capitalize text-slate-600">{s.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
