import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  AGE_GROUP_LABELS,
  type ParticipantItem,
  type StaffMember,
} from '../types';

interface Lookups {
  programmes: Array<{ id: string; title: string; code: string }>;
  cohorts: Array<{ id: string; name: string; programmeId: string }>;
  tracks: Array<{ id: string; name: string; programmeId: string }>;
}

interface ParticipantProfileDetail {
  participant: ParticipantItem;
  attendanceHistory: Array<{
    id: string;
    sessionTitle: string;
    sessionDate: string | null;
    status: string;
    engagementScore: string | null;
    observations: string | null;
  }>;
  assessmentHistory: Array<{
    id: string;
    assessmentTitle: string;
    category: string | null;
    rawScore: string;
    maxScore: string | null;
    percentageScore: string;
    feedback: string | null;
    gradedAt: string;
  }>;
  projectHistory: Array<{
    id: string;
    projectTitle: string;
    status: string;
    qualityScore: string | null;
    feedback: string | null;
  }>;
}

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function parseCsvText(csvText: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  return rows.slice(1).map((cols) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cols[idx] ?? '';
    });
    return record;
  });
}

export function ParticipantsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'super_admin' || user?.role === 'programme_manager';

  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ programmes: [], cohorts: [], tracks: [] });
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterProgramme, setFilterProgramme] = useState('');
  const [filterCohort, setFilterCohort] = useState('');
  const [filterTrack, setFilterTrack] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'cohort' | 'track' | 'status'>('none');

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [partRes, staffRes] = await Promise.all([
        apiFetch<{ participants: ParticipantItem[]; lookups: Lookups }>('/api/participants'),
        apiFetch<{ staff: StaffMember[] }>('/api/staff'),
      ]);
      setParticipants(partRes.participants);
      setLookups(partRes.lookups);
      setStaff(staffRes.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load participant records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const filteredCohorts = useMemo(
    () => lookups.cohorts.filter((c) => !filterProgramme || c.programmeId === filterProgramme),
    [lookups.cohorts, filterProgramme]
  );

  const filteredTracks = useMemo(
    () => lookups.tracks.filter((t) => !filterProgramme || t.programmeId === filterProgramme),
    [lookups.tracks, filterProgramme]
  );

  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (filterProgramme && p.programmeId !== filterProgramme) return false;
      if (filterCohort && p.cohortId !== filterCohort) return false;
      if (filterTrack && p.trackId !== filterTrack) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (q) {
        const hay = `${p.fullName} ${p.participantCode} ${p.contactEmail ?? ''} ${p.cohortName} ${p.trackName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [participants, search, filterProgramme, filterCohort, filterTrack, filterStatus]);

  const groupedParticipants = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupTitle: null as string | null, items: filteredParticipants }];
    }
    const map = new Map<string, ParticipantItem[]>();
    for (const p of filteredParticipants) {
      let key = 'Unassigned';
      if (groupBy === 'cohort') key = `${p.programmeCode} · ${p.cohortName}`;
      else if (groupBy === 'track') key = p.trackName ?? 'No STEM Track Assigned';
      else if (groupBy === 'status') key = p.status.charAt(0).toUpperCase() + p.status.slice(1);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([groupTitle, items]) => ({ groupTitle, items }));
  }, [filteredParticipants, groupBy]);

  const handleExportCsv = () => {
    const headers = [
      'participant_code',
      'full_name',
      'contact_email',
      'age_group',
      'education_level',
      'programme_code',
      'programme_title',
      'cohort_name',
      'stem_track',
      'facilitator',
      'status',
      'registration_date',
      'attendance_rate_pct',
      'avg_assessment_pct',
    ];
    const lines = [
      headers.join(','),
      ...filteredParticipants.map((p) =>
        [
          p.participantCode,
          p.fullName,
          p.contactEmail ?? '',
          p.ageGroup ?? '',
          p.educationLevel ?? '',
          p.programmeCode,
          p.programmeTitle,
          p.cohortName,
          p.trackName ?? '',
          p.facilitatorName ?? '',
          p.status,
          p.registrationDate,
          p.attendanceRate !== null ? p.attendanceRate : '',
          p.avgAssessmentPct !== null && p.avgAssessmentPct !== undefined ? p.avgAssessmentPct : '',
        ]
          .map(sanitizeCsvCell)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cci-stem-participants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Participant Registry & Profiles
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Register participants into programmes, cohorts, and STEM tracks, import rosters via CSV,
            and inspect complete performance profiles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredParticipants.length === 0}
            className="h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-[#B5121B]" />
                <span>Import CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRegisterModal(true)}
                className="h-10 px-4 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Register Participant</span>
              </button>
            </>
          )}
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

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by participant ID, full name, or email..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#B5121B]"
          />
        </div>

        <select
          aria-label="Filter by programme"
          value={filterProgramme}
          onChange={(e) => {
            setFilterProgramme(e.target.value);
            setFilterCohort('');
            setFilterTrack('');
          }}
          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
        >
          <option value="">All Programmes</option>
          {lookups.programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.title}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by cohort"
          value={filterCohort}
          onChange={(e) => setFilterCohort(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
        >
          <option value="">All Cohorts</option>
          {filteredCohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by STEM track"
          value={filterTrack}
          onChange={(e) => setFilterTrack(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
        >
          <option value="">All STEM Tracks</option>
          {filteredTracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="deferred">Deferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select
          aria-label="Group participants"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as 'none' | 'cohort' | 'track' | 'status')}
          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
        >
          <option value="none">Group: Flat List</option>
          <option value="cohort">Group: By Cohort</option>
          <option value="track">Group: By STEM Track</option>
          <option value="status">Group: By Status</option>
        </select>
      </div>

      {/* Participants Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-slate-700">Participant Roster</span>
          <span className="font-mono tabular-nums">
            Showing {filteredParticipants.length} of {participants.length}
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredParticipants.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700">No participants match your criteria</p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Register individual participants or use CSV Import to enroll an entire cohort linked
              to your configured programmes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {groupedParticipants.map((group) => (
              <div key={group.groupTitle ?? 'all'}>
                {group.groupTitle && (
                  <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{group.groupTitle}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {group.items.length} participants
                    </span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                        <th className="py-3 px-6">Participant</th>
                        <th className="py-3 px-4">Programme / Cohort</th>
                        <th className="py-3 px-4">STEM Track</th>
                        <th className="py-3 px-4">Facilitator</th>
                        <th className="py-3 px-4 text-right">Attendance</th>
                        <th className="py-3 px-4 text-right">Avg Assessment</th>
                        <th className="py-3 px-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.items.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedParticipantId(p.id)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-6">
                            <p className="font-medium text-slate-900">{p.fullName}</p>
                            <p className="text-xs font-mono text-slate-500">
                              {p.participantCode}
                              {p.contactEmail ? ` · ${p.contactEmail}` : ''}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            <p className="font-medium text-slate-800">{p.cohortName}</p>
                            <p className="text-slate-500">{p.programmeTitle}</p>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            {p.trackName ?? 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            {p.facilitatorName ?? 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                            {p.attendanceRate !== null ? `${p.attendanceRate}%` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                            {p.avgAssessmentPct !== null && p.avgAssessmentPct !== undefined
                              ? `${p.avgAssessmentPct}%`
                              : '—'}
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <span
                              className={`text-xs font-medium capitalize ${
                                p.status === 'active'
                                  ? 'text-teal-700'
                                  : p.status === 'completed'
                                    ? 'text-[#8F0E15]'
                                    : p.status === 'withdrawn'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals & Profile Drawer */}
      {showRegisterModal && (
        <RegisterParticipantModal
          lookups={lookups}
          staff={staff}
          onClose={() => setShowRegisterModal(false)}
          onRegistered={async () => {
            setShowRegisterModal(false);
            showToast('Participant registered and linked to programme and cohort.');
            await loadData();
          }}
        />
      )}

      {showImportModal && (
        <CsvImportModal
          lookups={lookups}
          staff={staff}
          onClose={() => setShowImportModal(false)}
          onImported={async (msg) => {
            showToast(msg);
            await loadData();
          }}
        />
      )}

      {selectedParticipantId && (
        <ParticipantProfileDrawer
          participantId={selectedParticipantId}
          canManage={canManage}
          lookups={lookups}
          staff={staff}
          onClose={() => setSelectedParticipantId(null)}
          onUpdated={async (msg) => {
            showToast(msg);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function RegisterParticipantModal({
  lookups,
  staff,
  onClose,
  onRegistered,
}: {
  lookups: Lookups;
  staff: StaffMember[];
  onClose: () => void;
  onRegistered: () => Promise<void>;
}) {
  const [participantCode, setParticipantCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [programmeId, setProgrammeId] = useState(lookups.programmes[0]?.id ?? '');
  const [cohortId, setCohortId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [facilitatorId, setFacilitatorId] = useState('');
  const [registrationDate, setRegistrationDate] = useState(new Date().toISOString().slice(0, 10));
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

  useEffect(() => {
    if (!progCohorts.some((c) => c.id === cohortId)) {
      setCohortId(progCohorts[0]?.id ?? '');
    }
    if (trackId && !progTracks.some((t) => t.id === trackId)) {
      setTrackId('');
    }
  }, [progCohorts, progTracks, cohortId, trackId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);
      await apiFetch('/api/participants', {
        method: 'POST',
        body: {
          participantCode: participantCode.trim() || undefined,
          fullName,
          contactEmail: contactEmail.trim() || null,
          ageGroup: ageGroup || null,
          educationLevel: educationLevel.trim() || null,
          programmeId,
          cohortId,
          trackId: trackId || null,
          assignedFacilitatorId: facilitatorId || null,
          registrationDate,
          status: 'active',
        },
      });
      await onRegistered();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to register participant.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-base font-semibold text-slate-900">Register Participant</h3>
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

          {lookups.programmes.length === 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              Create a programme and at least one cohort under Programme Management before
              registering participants.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Unique ID (Optional)
              </label>
              <input
                value={participantCode}
                onChange={(e) => setParticipantCode(e.target.value)}
                placeholder="Auto-generated"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Amara Okafor"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Optional"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Age Group</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">Select age group</option>
                <option value="under_14">Under 14</option>
                <option value="14_17">14–17 years</option>
                <option value="18_24">18–24 years</option>
                <option value="25_plus">25+ years</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Education Level
              </label>
              <input
                value={educationLevel}
                onChange={(e) => setEducationLevel(e.target.value)}
                placeholder="Secondary / Undergraduate"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Programme *</label>
              <select
                required
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Cohort *</label>
              <select
                required
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={progCohorts.length === 0}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm disabled:bg-slate-100"
              >
                <option value="">
                  {progCohorts.length === 0 ? 'No cohorts in programme' : 'Select cohort'}
                </option>
                {progCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">STEM Track</label>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">Unassigned</option>
                {progTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Assigned Facilitator
              </label>
              <select
                value={facilitatorId}
                onChange={(e) => setFacilitatorId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Registration Date *
              </label>
              <input
                type="date"
                required
                value={registrationDate}
                onChange={(e) => setRegistrationDate(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
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
              disabled={submitting || !programmeId || !cohortId}
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Registering...' : 'Save Participant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CsvImportModal({
  lookups,
  staff,
  onClose,
  onImported,
}: {
  lookups: Lookups;
  staff: StaffMember[];
  onClose: () => void;
  onImported: (msg: string) => Promise<void>;
}) {
  const [programmeId, setProgrammeId] = useState(lookups.programmes[0]?.id ?? '');
  const [cohortId, setCohortId] = useState('');
  const [defaultTrackId, setDefaultTrackId] = useState('');
  const [defaultFacilitatorId, setDefaultFacilitatorId] = useState('');
  const [parsedRows, setParsedRows] = useState<
    Array<{
      participantCode?: string;
      fullName: string;
      contactEmail?: string;
      ageGroup?: string;
      educationLevel?: string;
      trackName?: string;
      status?: string;
      registrationDate?: string;
    }>
  >([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    importedCount: number;
    skippedCount: number;
    errors: Array<{ rowNumber: number; fullName: string; reason: string }>;
  } | null>(null);

  const progCohorts = useMemo(
    () => lookups.cohorts.filter((c) => c.programmeId === programmeId),
    [lookups.cohorts, programmeId]
  );
  const progTracks = useMemo(
    () => lookups.tracks.filter((t) => t.programmeId === programmeId),
    [lookups.tracks, programmeId]
  );

  useEffect(() => {
    if (!progCohorts.some((c) => c.id === cohortId)) {
      setCohortId(progCohorts[0]?.id ?? '');
    }
    if (defaultTrackId && !progTracks.some((t) => t.id === defaultTrackId)) {
      setDefaultTrackId('');
    }
  }, [progCohorts, progTracks, cohortId, defaultTrackId]);

  const downloadTemplate = () => {
    const csv = [
      'participant_code,full_name,contact_email,age_group,education_level,track_name,status,registration_date',
      'CCI-2026-1001,Zainab Mensah,zainab.mensah@example.org,18_24,Undergraduate,Robotics,active,2026-09-01',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cci-stem-participants-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const [rawCsvText, setRawCsvText] = useState('');

  const applyCsvText = (text: string, sourceLabel: string) => {
    setFileName(sourceLabel);
    setErr(null);
    setResult(null);

    const rawRecords = parseCsvText(text);
    const mapped = rawRecords
      .map((r) => ({
        participantCode: r.participant_code || r.id || undefined,
        fullName: r.full_name || r.name || '',
        contactEmail: r.contact_email || r.email || undefined,
        ageGroup: r.age_group || undefined,
        educationLevel: r.education_level || undefined,
        trackName: r.track_name || r.stem_track || undefined,
        status: r.status || undefined,
        registrationDate: r.registration_date || undefined,
      }))
      .filter((r) => r.fullName.trim().length > 0);

    if (mapped.length === 0) {
      setErr('No valid rows found. Ensure your CSV includes a "full_name" column header.');
    }
    setParsedRows(mapped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRawCsvText(text);
      applyCsvText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    try {
      setSubmitting(true);
      setErr(null);
      const res = await apiFetch<{
        importedCount: number;
        skippedCount: number;
        errors: Array<{ rowNumber: number; fullName: string; reason: string }>;
      }>('/api/participants/import', {
        method: 'POST',
        body: {
          programmeId,
          cohortId,
          defaultTrackId: defaultTrackId || null,
          defaultFacilitatorId: defaultFacilitatorId || null,
          rows: parsedRows,
        },
      });
      setResult(res);
      if (res.importedCount > 0) {
        await onImported(
          `Imported ${res.importedCount} participant${res.importedCount === 1 ? '' : 's'} into the selected cohort.`
        );
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to import CSV file.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-base font-semibold text-slate-900">Import Participants from CSV</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <p className="text-xs text-slate-600">
              All imported rows are validated and linked to the target Programme and Cohort in
              PostgreSQL.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] underline cursor-pointer whitespace-nowrap"
            >
              Download CSV Template
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Programme *
              </label>
              <select
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Cohort *
              </label>
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={progCohorts.length === 0}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm disabled:bg-slate-100"
              >
                <option value="">
                  {progCohorts.length === 0 ? 'No cohorts available' : 'Select cohort'}
                </option>
                {progCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default STEM Track (fallback)
              </label>
              <select
                value={defaultTrackId}
                onChange={(e) => setDefaultTrackId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">None</option>
                {progTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Facilitator (optional)
              </label>
              <select
                value={defaultFacilitatorId}
                onChange={(e) => setDefaultFacilitatorId(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg border border-slate-200 bg-white text-sm"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Upload CSV File
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  Or Paste CSV Rows Directly
                </label>
                <button
                  type="button"
                  onClick={() => applyCsvText(rawCsvText, 'Pasted CSV')}
                  disabled={!rawCsvText.trim()}
                  className="text-xs font-medium text-[#B5121B] hover:text-[#8F0E15] disabled:opacity-40 cursor-pointer"
                >
                  Parse Pasted CSV
                </button>
              </div>
              <textarea
                rows={4}
                value={rawCsvText}
                onChange={(e) => setRawCsvText(e.target.value)}
                placeholder={'full_name,contact_email,age_group,education_level,track_name\nChidi Nwosu,chidi@example.org,18_24,Undergraduate,Robotics'}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:border-[#B5121B]"
              />
            </div>

            {fileName && (
              <p className="text-xs text-slate-500">
                Loaded <span className="font-medium text-slate-800">{fileName}</span> ·{' '}
                <span className="font-mono tabular-nums">{parsedRows.length}</span> rows ready for
                validation
              </p>
            )}
          </div>

          {parsedRows.length > 0 && !result && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                Preview (first {Math.min(5, parsedRows.length)} rows)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Full Name</th>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Track</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {r.participantCode || 'Auto'}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">{r.fullName}</td>
                        <td className="py-2 px-3 text-slate-600">{r.contactEmail || '—'}</td>
                        <td className="py-2 px-3 text-slate-600">{r.trackName || 'Default'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-xs">
              <p className="font-semibold text-slate-900">
                Import Summary: {result.importedCount} imported · {result.skippedCount} skipped
              </p>
              {result.errors.length > 0 && (
                <ul className="space-y-1 text-rose-700 max-h-36 overflow-y-auto">
                  {result.errors.map((item, idx) => (
                    <li key={idx}>
                      Row {item.rowNumber} ({item.fullName}): {item.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={submitting || !programmeId || !cohortId || parsedRows.length === 0}
              className="h-10 px-5 rounded-lg bg-[#B5121B] text-white text-sm font-medium hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Importing...' : `Import ${parsedRows.length} Rows`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantProfileDrawer({
  participantId,
  canManage,
  lookups,
  staff,
  onClose,
  onUpdated,
}: {
  participantId: string;
  canManage: boolean;
  lookups: Lookups;
  staff: StaffMember[];
  onClose: () => void;
  onUpdated: (msg: string) => Promise<void>;
}) {
  const [profile, setProfile] = useState<ParticipantProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [status, setStatus] = useState<'active' | 'completed' | 'withdrawn' | 'deferred'>('active');
  const [trackId, setTrackId] = useState('');
  const [facilitatorId, setFacilitatorId] = useState('');
  const [notes, setNotes] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await apiFetch<ParticipantProfileDetail>(`/api/participants/${participantId}`);
      setProfile(res);
      setFullName(res.participant.fullName);
      setContactEmail(res.participant.contactEmail ?? '');
      setAgeGroup(res.participant.ageGroup ?? '');
      setEducationLevel(res.participant.educationLevel ?? '');
      setCohortId(res.participant.cohortId);
      setStatus(res.participant.status);
      setTrackId(res.participant.trackId ?? '');
      setFacilitatorId(res.participant.assignedFacilitatorId ?? '');
      setNotes(res.participant.notes ?? '');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to load participant profile.');
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      setSaving(true);
      setErr(null);
      await apiFetch(`/api/participants/${profile.participant.id}`, {
        method: 'PATCH',
        body: {
          fullName: fullName.trim(),
          contactEmail: contactEmail.trim() || null,
          ageGroup: ageGroup || null,
          educationLevel: educationLevel.trim() || null,
          cohortId,
          status,
          trackId: trackId || null,
          assignedFacilitatorId: facilitatorId || null,
          notes: notes.trim() || null,
        },
      });
      await loadProfile();
      await onUpdated('Participant profile updated.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to save participant changes.');
    } finally {
      setSaving(false);
    }
  };

  const progCohorts = profile
    ? lookups.cohorts.filter((c) => c.programmeId === profile.participant.programmeId)
    : [];
  const progTracks = profile
    ? lookups.tracks.filter((t) => t.programmeId === profile.participant.programmeId)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs font-mono text-[#B5121B]">
              {profile?.participant.participantCode ?? 'Participant Profile'}
            </p>
            <h3 className="text-lg font-bold text-slate-900">
              {profile?.participant.fullName ?? 'Loading...'}
            </h3>
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
          {err && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {err}
            </div>
          )}

          {loading || !profile ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs pb-5 border-b border-slate-200">
                <div>
                  <span className="text-slate-500">Programme</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {profile.participant.programmeTitle}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Cohort</span>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {profile.participant.cohortName}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Contact Email</span>
                  <p className="mt-0.5 text-slate-800">
                    {profile.participant.contactEmail ?? 'Not provided'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Age / Education</span>
                  <p className="mt-0.5 text-slate-800">
                    {profile.participant.ageGroup
                      ? AGE_GROUP_LABELS[profile.participant.ageGroup]
                      : '—'}{' '}
                    · {profile.participant.educationLevel ?? '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Registered</span>
                  <p className="mt-0.5 font-mono tabular-nums text-slate-800">
                    {profile.participant.registrationDate}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Attendance Rate</span>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-teal-700">
                    {profile.participant.attendanceRate !== null
                      ? `${profile.participant.attendanceRate}%`
                      : 'No sessions recorded'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Portal Access</span>
                  <p
                    className={`mt-0.5 font-medium ${
                      profile.participant.userId ? 'text-teal-700' : 'text-slate-500'
                    }`}
                  >
                    {profile.participant.userId
                      ? 'Linked to Google sign-in'
                      : 'Auto-links on participant sign-in'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Assessments Graded</span>
                  <p className="mt-0.5 font-mono tabular-nums text-slate-800">
                    {profile.assessmentHistory.length}
                  </p>
                </div>
              </div>

              {/* Editable Profile & Enrollment Controls */}
              {canManage && (
                <form onSubmit={handleSave} className="space-y-3 pb-5 border-b border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-700">
                    Profile, Cohort & Mentor Assignment
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Full Name *</label>
                      <input
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[#B5121B]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Contact Email</label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="Optional"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[#B5121B]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Age Group</label>
                      <select
                        value={ageGroup}
                        onChange={(e) => setAgeGroup(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        <option value="">Unspecified</option>
                        <option value="under_14">Under 14</option>
                        <option value="14_17">14–17 years</option>
                        <option value="18_24">18–24 years</option>
                        <option value="25_plus">25+ years</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Education Level</label>
                      <input
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                        placeholder="Secondary / Undergraduate"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Cohort *</label>
                      <select
                        required
                        value={cohortId}
                        onChange={(e) => setCohortId(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        {progCohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Status</label>
                      <select
                        value={status}
                        onChange={(e) =>
                          setStatus(
                            e.target.value as 'active' | 'completed' | 'withdrawn' | 'deferred'
                          )
                        }
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs capitalize"
                      >
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="deferred">Deferred</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">STEM Track</label>
                      <select
                        value={trackId}
                        onChange={(e) => setTrackId(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        <option value="">Unassigned</option>
                        {progTracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Facilitator</label>
                      <select
                        value={facilitatorId}
                        onChange={(e) => setFacilitatorId(e.target.value)}
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Programme Notes (non-sensitive academic context)
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional mentoring or learning support notes..."
                      className="w-full p-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[#B5121B]"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="h-9 px-4 rounded-lg bg-[#B5121B] text-white text-xs font-medium hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* Attendance History */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">
                  Attendance History ({profile.attendanceHistory.length})
                </h4>
                {profile.attendanceHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No attendance records yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {profile.attendanceHistory.map((a) => (
                      <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{a.sessionTitle}</p>
                          <p className="text-slate-500 font-mono tabular-nums">
                            {a.sessionDate ?? ''}
                            {a.engagementScore ? ` · Engagement ${a.engagementScore}/10` : ''}
                          </p>
                          {a.observations && (
                            <p className="mt-0.5 text-slate-600">{a.observations}</p>
                          )}
                        </div>
                        <span className="capitalize font-medium text-slate-700 shrink-0">
                          {a.status.replace('_', ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assessment History */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">
                  Assessment History ({profile.assessmentHistory.length})
                </h4>
                {profile.assessmentHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No graded assessments yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {profile.assessmentHistory.map((r) => (
                      <li key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{r.assessmentTitle}</p>
                          {r.feedback && <p className="mt-0.5 text-slate-600">{r.feedback}</p>}
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <p className="font-semibold text-teal-700">
                            {Number(r.percentageScore)}%
                          </p>
                          <p className="text-slate-500">
                            {Number(r.rawScore)} / {r.maxScore ? Number(r.maxScore) : '—'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Project History */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">
                  Project History ({profile.projectHistory.length})
                </h4>
                {profile.projectHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No STEM project submissions yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {profile.projectHistory.map((proj) => (
                      <li key={proj.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{proj.projectTitle}</p>
                          {proj.feedback && (
                            <p className="mt-0.5 text-slate-600">{proj.feedback}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="capitalize font-medium text-slate-700">
                            {proj.status.replace('_', ' ')}
                          </p>
                          {proj.qualityScore && (
                            <p className="font-mono tabular-nums text-teal-700">
                              Score {Number(proj.qualityScore)}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
