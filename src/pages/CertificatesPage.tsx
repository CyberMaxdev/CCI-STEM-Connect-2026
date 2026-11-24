import React, { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, Download, Plus, ShieldCheck, X, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { downloadCertificatePdf, downloadCsv } from '../lib/export-utils';

interface CertificateTemplateItem {
  id: string;
  programmeId?: string;
  title: string;
  minAttendancePct: number;
  minOverallScore: number;
  requireAllAssessments: boolean;
  requireProgrammeCompletion: boolean;
  templateConfig: {
    signatoryName?: string;
    signatoryTitle?: string;
  };
}

interface EligibilityRow {
  participantId: string;
  participantCode: string;
  fullName: string;
  cohortName: string;
  trackName: string | null;
  participantStatus: string;
  attendanceRate: number | null;
  overallScore: number | null;
  classification: string;
  dataStatus: string;
  gradedAssessments: number;
  requiredAssessments: number;
  eligible: boolean;
  reasons: string[];
  issuedCertificate: {
    id: string;
    certificateCode: string;
    issuedAt: string;
  } | null;
}

interface ParticipantCertBundle {
  template: CertificateTemplateItem;
  programmeTitle: string;
  programmeCode: string;
  evaluation: EligibilityRow | null;
}

interface CertificatesResponse {
  scope: string;
  programme?: { id: string; code: string; title: string };
  templates: CertificateTemplateItem[];
  activeTemplateId?: string | null;
  eligibilityRows: EligibilityRow[];
  myCertificates?: ParticipantCertBundle[];
  filterOptions: {
    programmes: Array<{ id: string; code: string; title: string }>;
  };
}

export function CertificatesPage() {
  const { user } = useAuth();
  const isParticipant = user?.role === 'participant';

  const [programmeId, setProgrammeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [data, setData] = useState<CertificatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuingIds, setIssuingIds] = useState<string[]>([]);

  // Template Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tplTitle, setTplTitle] = useState('Certificate of Completion & STEM Achievement');
  const [tplMinAttendance, setTplMinAttendance] = useState('75');
  const [tplMinScore, setTplMinScore] = useState('55');
  const [tplRequireAss, setTplRequireAss] = useState(true);
  const [tplRequireComp, setTplRequireComp] = useState(true);
  const [tplSignatoryName, setTplSignatoryName] = useState('CCI STEM Connect Programme Director');
  const [tplSignatoryTitle, setTplSignatoryTitle] = useState('Celebration Church International');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadCertificates = useCallback(
    async (progId: string, tplId: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (!isParticipant && progId) qs.set('programmeId', progId);
        if (!isParticipant && tplId) qs.set('templateId', tplId);
        const res = await apiFetch<CertificatesResponse>(
          `/api/certificates${qs.toString() ? `?${qs}` : ''}`
        );
        setData(res);
        if (!isParticipant) {
          if (!progId && res.programme?.id) setProgrammeId(res.programme.id);
          if (res.activeTemplateId && res.activeTemplateId !== tplId) {
            setTemplateId(res.activeTemplateId);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load certificates.');
      } finally {
        setLoading(false);
      }
    },
    [isParticipant]
  );

  useEffect(() => {
    loadCertificates(programmeId, templateId);
  }, [programmeId, templateId, loadCertificates]);

  const activeTemplate = data?.templates.find((t) => t.id === (templateId || data.activeTemplateId));

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programmeId) return;
    setSavingTemplate(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ template: { id: string } }>('/api/certificates/templates', {
        method: 'POST',
        body: {
          programmeId,
          title: tplTitle.trim(),
          minAttendancePct: Number(tplMinAttendance) || 0,
          minOverallScore: Number(tplMinScore) || 0,
          requireAllAssessments: tplRequireAss,
          requireProgrammeCompletion: tplRequireComp,
          signatoryName: tplSignatoryName.trim(),
          signatoryTitle: tplSignatoryTitle.trim(),
        },
      });
      setShowTemplateModal(false);
      setTemplateId(res.template.id);
      setNotice('Certificate template saved with live eligibility rules.');
      await loadCertificates(programmeId, res.template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create certificate template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleIssue = async (participantIds: string[]) => {
    if (!activeTemplate || participantIds.length === 0) return;
    setIssuingIds(participantIds);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{
        issuedCount: number;
        skipped: Array<{ fullName: string; reason: string }>;
      }>('/api/certificates/issue', {
        method: 'POST',
        body: {
          templateId: activeTemplate.id,
          participantIds,
        },
      });
      setNotice(
        `Issued ${res.issuedCount} verifiable certificate${res.issuedCount === 1 ? '' : 's'}.`
      );
      await loadCertificates(programmeId, activeTemplate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue certificates.');
    } finally {
      setIssuingIds([]);
    }
  };

  const handleDownloadPdf = (
    row: EligibilityRow,
    template: CertificateTemplateItem,
    progTitle: string,
    progCode: string
  ) => {
    if (!row.issuedCertificate) return;
    downloadCertificatePdf({
      certificateTitle: template.title,
      certificateCode: row.issuedCertificate.certificateCode,
      participantName: row.fullName,
      participantCode: row.participantCode,
      programmeTitle: progTitle,
      programmeCode: progCode,
      cohortName: row.cohortName,
      trackName: row.trackName,
      classification: row.classification,
      overallScore: row.overallScore,
      attendanceRate: row.attendanceRate,
      issuedAt: row.issuedCertificate.issuedAt,
      signatoryName: template.templateConfig?.signatoryName || 'CCI STEM Connect Programme Director',
      signatoryTitle: template.templateConfig?.signatoryTitle || 'Celebration Church International',
    });
  };

  const handleExportCsv = () => {
    if (!data?.programme || !activeTemplate) return;
    downloadCsv(
      `CCI-Certificates-${data.programme.code}.csv`,
      [
        'Participant ID',
        'Full Name',
        'Cohort',
        'Status',
        'Attendance (%)',
        'Weighted Score (%)',
        'Assessments',
        'Eligible',
        'Certificate Code',
        'Issued Date',
        'Unmet Criteria',
      ],
      data.eligibilityRows.map((r) => [
        r.participantCode,
        r.fullName,
        r.cohortName,
        r.participantStatus,
        r.attendanceRate ?? '',
        r.overallScore ?? '',
        `${r.gradedAssessments}/${r.requiredAssessments}`,
        r.eligible ? 'Yes' : 'No',
        r.issuedCertificate?.certificateCode ?? '',
        r.issuedCertificate ? new Date(r.issuedCertificate.issuedAt).toISOString().slice(0, 10) : '',
        r.reasons.join('; '),
      ])
    );
  };

  // Participant Self-Service View
  if (isParticipant) {
    const items = data?.myCertificates ?? [];
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">My Certificates & Eligibility</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Track your graduation criteria and download your official verifiable CCI STEM Connect PDF certificate once issued.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-[#8F0E15]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Award className="w-9 h-9 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-800">No certificates configured yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Once your Programme Manager publishes a certificate template for your programme, your live eligibility status will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const ev = item.evaluation;
              return (
                <div
                  key={item.template.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {item.programmeCode} · {item.programmeTitle}
                      </p>
                      <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                        {item.template.title}
                      </h3>
                    </div>

                    {ev?.issuedCertificate ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf(ev, item.template, item.programmeTitle, item.programmeCode)
                        }
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        Download Official PDF
                      </button>
                    ) : (
                      <span
                        className={`text-sm font-medium ${
                          ev?.eligible ? 'text-teal-700' : 'text-slate-600'
                        }`}
                      >
                        {ev?.eligible ? 'Eligible — Awaiting Issuance' : 'Criteria In Progress'}
                      </span>
                    )}
                  </div>

                  {ev && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 text-sm tabular-nums">
                      <div>
                        <p className="text-xs text-slate-500">Attendance</p>
                        <p className="font-semibold text-slate-900">
                          {ev.attendanceRate !== null ? `${ev.attendanceRate}%` : '—'}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            (min {item.template.minAttendancePct}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Weighted Score</p>
                        <p className="font-semibold text-slate-900">
                          {ev.overallScore !== null ? `${ev.overallScore}%` : 'Withheld'}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            (min {item.template.minOverallScore}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Assessments</p>
                        <p className="font-semibold text-slate-900">
                          {ev.gradedAssessments} / {ev.requiredAssessments}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Verification Code</p>
                        <p className="font-mono text-xs font-semibold text-slate-900 mt-0.5">
                          {ev.issuedCertificate?.certificateCode ?? 'Not issued yet'}
                        </p>
                      </div>
                    </div>
                  )}

                  {ev && ev.reasons.length > 0 && (
                    <div className="p-3.5 bg-slate-50 rounded-lg text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">Remaining Eligibility Requirements:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {ev.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Staff View (Super Admin / Programme Manager)
  const rows = data?.eligibilityRows ?? [];
  const eligiblePendingIds = rows
    .filter((r) => r.eligible && !r.issuedCertificate)
    .map((r) => r.participantId);
  const issuedCount = rows.filter((r) => r.issuedCertificate).length;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Certificates & Eligibility Verification
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Configure completion thresholds, verify backend performance criteria, issue unique certificate codes, and export official PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Select Programme"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value);
              setTemplateId('');
            }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
          >
            {(data?.filterOptions.programmes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          {data && data.templates.length > 0 && (
            <select
              aria-label="Select Template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B5121B]/25 focus:border-[#B5121B]"
            >
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}

          {activeTemplate && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}

          <button
            type="button"
            disabled={!programmeId}
            onClick={() => setShowTemplateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
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
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : !activeTemplate ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Award className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-800">
            No certificate template configured for this programme
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create a certificate template with minimum attendance, weighted performance score, assessment completion, and programme completion rules to evaluate participant eligibility.
          </p>
          <button
            type="button"
            disabled={!programmeId}
            onClick={() => setShowTemplateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create First Certificate Template
          </button>
        </div>
      ) : (
        <>
          {/* Active Template Rules Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-[#B5121B]" />
                <span>Active Eligibility Policy</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900">{activeTemplate.title}</h3>
              <p className="text-xs text-slate-600 tabular-nums">
                Min Attendance: <strong>{activeTemplate.minAttendancePct}%</strong> · Min Weighted
                Score: <strong>{activeTemplate.minOverallScore}%</strong> · All Assessments Required:{' '}
                <strong>{activeTemplate.requireAllAssessments ? 'Yes' : 'No'}</strong> · Completed
                Status Required:{' '}
                <strong>{activeTemplate.requireProgrammeCompletion ? 'Yes' : 'No'}</strong>
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right text-xs tabular-nums">
                <p className="text-slate-500">Issued / Eligible Pending</p>
                <p className="text-sm font-semibold text-slate-900">
                  {issuedCount} issued · {eligiblePendingIds.length} ready
                </p>
              </div>
              <button
                type="button"
                disabled={eligiblePendingIds.length === 0 || issuingIds.length > 0}
                onClick={() => handleIssue(eligiblePendingIds)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Award className="w-4 h-4" />
                Issue All Eligible ({eligiblePendingIds.length})
              </button>
            </div>
          </div>

          {/* Eligibility Verification Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-4 py-3">Cohort / Status</th>
                    <th className="px-4 py-3 text-right">Attendance</th>
                    <th className="px-4 py-3 text-right">Weighted Score</th>
                    <th className="px-4 py-3 text-right">Assessments</th>
                    <th className="px-4 py-3">Eligibility Verification</th>
                    <th className="px-5 py-3 text-right">Certificate Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                        No participants registered in this programme yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.participantId} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">{r.fullName}</p>
                          <p className="text-xs text-slate-500 font-mono">{r.participantCode}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">
                          <p className="font-medium text-slate-800">{r.cohortName}</p>
                          <p className="capitalize">{r.participantStatus}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-slate-900">
                          {r.attendanceRate !== null ? `${r.attendanceRate}%` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-medium text-slate-900">
                          {r.overallScore !== null ? `${r.overallScore}%` : 'Withheld'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">
                          {r.gradedAssessments} / {r.requiredAssessments}
                        </td>
                        <td className="px-4 py-3.5 max-w-[280px]">
                          {r.eligible ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              All rules satisfied
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B5121B]">
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                Not eligible
                              </span>
                              <p className="text-xs text-slate-500 line-clamp-2">
                                {r.reasons.join(' ')}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {r.issuedCertificate ? (
                            <div className="inline-flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-600">
                                {r.issuedCertificate.certificateCode}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadPdf(
                                    r,
                                    activeTemplate,
                                    data?.programme?.title ?? '',
                                    data?.programme?.code ?? ''
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                                PDF
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!r.eligible || issuingIds.includes(r.participantId)}
                              onClick={() => handleIssue([r.participantId])}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-[#B5121B] rounded-md hover:bg-[#8F0E15] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {issuingIds.includes(r.participantId) ? 'Issuing...' : 'Issue'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* New Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Create Certificate Template
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Certificate Title
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Min Attendance (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={tplMinAttendance}
                    onChange={(e) => setTplMinAttendance(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Min Weighted Score (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={tplMinScore}
                    onChange={(e) => setTplMinScore(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplRequireAss}
                    onChange={(e) => setTplRequireAss(e.target.checked)}
                    className="rounded border-slate-300 text-[#B5121B]"
                  />
                  <span>Require all cohort/track assessments to be graded</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplRequireComp}
                    onChange={(e) => setTplRequireComp(e.target.checked)}
                    className="rounded border-slate-300 text-[#B5121B]"
                  />
                  <span>Require participant status to be marked &ldquo;Completed&rdquo;</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    value={tplSignatoryName}
                    onChange={(e) => setTplSignatoryName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Organization / Title
                  </label>
                  <input
                    type="text"
                    value={tplSignatoryTitle}
                    onChange={(e) => setTplSignatoryTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#B5121B] rounded-lg hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {savingTemplate ? 'Saving...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
