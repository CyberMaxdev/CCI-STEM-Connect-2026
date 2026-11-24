import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { AttendanceStatus } from '../types';

interface AttendanceSessionSummary {
  id: string;
  title: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  programmeTitle: string;
  programmeCode: string;
  cohortName: string;
  trackName: string | null;
  facilitatorName: string | null;
  rosterCount: number;
  recordedCount: number;
  summary: {
    present: number;
    late: number;
    approvedAbsence: number;
    absent: number;
    attendanceRate: number | null;
  };
}

interface RosterEntry {
  participantId: string;
  participantCode: string;
  fullName: string;
  participantStatus: string;
  attendance: {
    id: string;
    status: AttendanceStatus;
    engagementScore: number | null;
    observations: string | null;
    recordedAt: string;
  } | null;
}

interface SessionAttendanceDetail {
  session: {
    id: string;
    title: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    programmeTitle: string;
    cohortName: string;
    trackName: string | null;
  };
  roster: RosterEntry[];
  metrics: {
    totalRoster: number;
    recordedCount: number;
    presentCount: number;
    lateCount: number;
    approvedAbsenceCount: number;
    absentCount: number;
    attendanceRate: number | null;
  };
}

interface DraftRow {
  status: AttendanceStatus | '';
  engagementScore: string;
  observations: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; activeClass: string }> = [
  { value: 'present', label: 'Present', activeClass: 'bg-teal-700 text-white' },
  { value: 'late', label: 'Late', activeClass: 'bg-amber-600 text-white' },
  { value: 'approved_absence', label: 'Approved', activeClass: 'bg-slate-700 text-white' },
  { value: 'absent', label: 'Absent', activeClass: 'bg-rose-700 text-white' },
];

export function AttendancePage() {
  const { user } = useAuth();

  if (user?.role === 'participant') {
    return <ParticipantAttendanceView />;
  }

  return <StaffAttendanceView />;
}

function StaffAttendanceView() {
  const [sessions, setSessions] = useState<AttendanceSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionAttendanceDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoadingSessions(true);
      setError(null);
      const res = await apiFetch<{ sessions: AttendanceSessionSummary[] }>(
        '/api/attendance/sessions'
      );
      setSessions(res.sessions);
      setSelectedSessionId((prev) => {
        if (prev && res.sessions.some((s) => s.id === prev)) return prev;
        return res.sessions[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sessions.');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    try {
      setLoadingRoster(true);
      setError(null);
      const res = await apiFetch<SessionAttendanceDetail>(`/api/attendance/session/${sessionId}`);
      setDetail(res);

      const initialDrafts: Record<string, DraftRow> = {};
      for (const row of res.roster) {
        initialDrafts[row.participantId] = {
          status: row.attendance?.status ?? '',
          engagementScore:
            row.attendance?.engagementScore !== null &&
            row.attendance?.engagementScore !== undefined
              ? String(row.attendance.engagementScore)
              : '',
          observations: row.attendance?.observations ?? '',
        };
      }
      setDrafts(initialDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load session register.');
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetail(selectedSessionId);
    } else {
      setDetail(null);
    }
  }, [selectedSessionId, loadSessionDetail]);

  const updateRow = (participantId: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] ?? { status: '', engagementScore: '', observations: '' }),
        ...patch,
      },
    }));
  };

  const markUnmarkedPresent = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!next[key].status) {
          next[key] = { ...next[key], status: 'present' };
        }
      }
      return next;
    });
  };

  const handleSaveAttendance = async () => {
    if (!selectedSessionId || !detail) return;

    const payloadRecords: Array<{
      participantId: string;
      status: AttendanceStatus;
      engagementScore: number | null;
      observations: string | null;
    }> = [];

    for (const row of detail.roster) {
      const draft = drafts[row.participantId];
      if (!draft || !draft.status) continue;

      let engScore: number | null = null;
      if (draft.engagementScore.trim() !== '') {
        const parsedNum = Number(draft.engagementScore);
        if (Number.isNaN(parsedNum) || parsedNum < 0 || parsedNum > 10) {
          setError(
            `Engagement score for ${row.fullName} must be a number between 0 and 10.`
          );
          return;
        }
        engScore = parsedNum;
      }

      payloadRecords.push({
        participantId: row.participantId,
        status: draft.status,
        engagementScore: engScore,
        observations: draft.observations.trim() || null,
      });
    }

    if (payloadRecords.length === 0) {
      setError('Mark at least one participant status before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await apiFetch<{ savedCount: number }>(
        `/api/attendance/session/${selectedSessionId}`,
        {
          method: 'POST',
          body: { records: payloadRecords },
        }
      );
      setNotice(
        `Saved ${res.savedCount} attendance record${res.savedCount === 1 ? '' : 's'} to database.`
      );
      setTimeout(() => setNotice(null), 4000);
      await Promise.all([loadSessionDetail(selectedSessionId), loadSessions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Compute live draft attendance rate preview
  const draftValues = Object.values(drafts).filter((d) => d.status !== '');
  const draftCountable = draftValues.filter((d) => d.status !== 'approved_absence');
  const draftAttended = draftCountable.filter(
    (d) => d.status === 'present' || d.status === 'late'
  ).length;
  const liveRate =
    draftCountable.length > 0
      ? Number(((draftAttended / draftCountable.length) * 100).toFixed(1))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Attendance & Engagement Register
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Select a scheduled session to record attendance, lateness, approved absences, engagement
          scores (0–10), and facilitator observations.
        </p>
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
        {/* Session Selector */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Accessible Sessions</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {sessions.length}
            </span>
          </div>

          {loadingSessions ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No sessions available</p>
              <p className="mt-1 text-xs text-slate-500">
                Sessions must be scheduled under Programme Management and assigned to your scope.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {sessions.map((s) => {
                const isSelected = s.id === selectedSessionId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono tabular-nums text-[#B5121B]">
                          {s.sessionDate}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {s.recordedCount}/{s.rosterCount} marked
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-sm font-semibold truncate ${
                          isSelected ? 'text-[#8F0E15]' : 'text-slate-800'
                        }`}
                      >
                        {s.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {s.cohortName}
                        {s.trackName ? ` · ${s.trackName}` : ''}
                        {s.summary.attendanceRate !== null
                          ? ` · ${s.summary.attendanceRate}% rate`
                          : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Attendance Marking Register */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {!selectedSessionId || !detail ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                {loadingRoster ? 'Loading session roster...' : 'Select a session to mark attendance'}
              </p>
            </div>
          ) : (
            <div>
              {/* Header & Live Metrics */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {detail.session.programmeTitle} · {detail.session.cohortName}
                      {detail.session.trackName ? ` · ${detail.session.trackName}` : ''}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      {detail.session.title}
                    </h3>
                    <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-500">
                      {detail.session.sessionDate} · {detail.session.startTime.slice(0, 5)}–
                      {detail.session.endTime.slice(0, 5)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={markUnmarkedPresent}
                      disabled={detail.roster.length === 0}
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      Mark Unmarked Present
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAttendance}
                      disabled={saving || detail.roster.length === 0}
                      className="h-9 px-4 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Saving...' : 'Save Attendance'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Summary Figures */}
                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Roster</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                      {detail.roster.length}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Marked</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900">
                      {draftValues.length}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Present / Late</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-teal-700">
                      {draftValues.filter((d) => d.status === 'present').length} /{' '}
                      {draftValues.filter((d) => d.status === 'late').length}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Approved / Absent</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-700">
                      {draftValues.filter((d) => d.status === 'approved_absence').length} /{' '}
                      {draftValues.filter((d) => d.status === 'absent').length}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Attendance Rate</span>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-teal-700">
                      {liveRate !== null ? `${liveRate}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Roster Rows */}
              {detail.roster.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    No participants enrolled in this session's cohort
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Register participants into {detail.session.cohortName} under Participant
                    Management first.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {detail.roster.map((row) => {
                    const draft = drafts[row.participantId] ?? {
                      status: '',
                      engagementScore: '',
                      observations: '',
                    };

                    return (
                      <div key={row.participantId} className="p-5 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {row.fullName}
                            </p>
                            <p className="text-xs font-mono text-slate-500">
                              {row.participantCode}
                            </p>
                          </div>

                          {/* 4-State Segmented Attendance Control */}
                          <div
                            className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
                            role="group"
                            aria-label={`Attendance status for ${row.fullName}`}
                          >
                            {STATUS_OPTIONS.map((opt) => {
                              const active = draft.status === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    updateRow(row.participantId, { status: opt.value })
                                  }
                                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                                    active
                                      ? opt.activeClass
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Engagement Score & Observation */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-3">
                            <label className="block text-xs text-slate-500 mb-1">
                              Engagement (0–10)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step="0.5"
                              value={draft.engagementScore}
                              onChange={(e) =>
                                updateRow(row.participantId, {
                                  engagementScore: e.target.value,
                                })
                              }
                              placeholder="Optional"
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div className="sm:col-span-9">
                            <label className="block text-xs text-slate-500 mb-1">
                              Engagement Observations
                            </label>
                            <input
                              value={draft.observations}
                              onChange={(e) =>
                                updateRow(row.participantId, { observations: e.target.value })
                              }
                              placeholder="Notes on participation, lateness reason, or support needed..."
                              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantAttendanceView() {
  const [records, setRecords] = useState<
    Array<{
      id: string;
      sessionTitle: string;
      sessionDate: string | null;
      status: string;
      engagementScore: string | null;
      observations: string | null;
    }>
  >([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{
      attendanceRate: number | null;
      records: Array<{
        id: string;
        sessionTitle: string;
        sessionDate: string | null;
        status: string;
        engagementScore: string | null;
        observations: string | null;
      }>;
    }>('/api/attendance/my')
      .then((res) => {
        setRecords(res.records);
        setRate(res.attendanceRate);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">My Attendance History</h2>
          <p className="mt-1 text-sm text-slate-600">
            Session attendance and facilitator engagement notes linked to your participant profile.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Overall Rate</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-teal-700">
            {rate !== null ? `${rate}%` : 'No records'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading attendance history...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No attendance records have been logged for your profile yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Session</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Engagement</th>
                <th className="py-3 px-6">Observations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="py-3.5 px-6 font-medium text-slate-900">{r.sessionTitle}</td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600">
                    {r.sessionDate ?? '—'}
                  </td>
                  <td className="py-3.5 px-4 capitalize text-xs font-medium text-slate-800">
                    {r.status.replace('_', ' ')}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                    {r.engagementScore ? `${Number(r.engagementScore)}/10` : '—'}
                  </td>
                  <td className="py-3.5 px-6 text-xs text-slate-600">{r.observations ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
