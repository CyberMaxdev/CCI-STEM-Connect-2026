import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  FileDown,
  Plus,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { downloadCertificatePdf, downloadCsv } from '../lib/export-utils';

interface TemplateItem {
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

interface CertificatesResponse {
  scope: 'participant' | 'super_admin' | 'programme_manager';
  programme?: { id: string; code: string; title: string };
  templates: TemplateItem[];
  activeTemplateId?: string | null;
  eligibilityRows: EligibilityRow[];
  myCertificates?: Array<{
    template: TemplateItem;
    programmeTitle: string;
    programmeCode: string;
    evaluation: EligibilityRow | null;
  }>;
  filterOptions: {
    programmes: Array<{ id: string; code: string; title: string }>;
  };
}

export function CertificatesPage() {
  const [programmeId, setProgrammeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [data, setData] = useState<CertificatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  // Create Template Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tplTitle, setTplTitle] = useState('Certificate of STEM Excellence & Completion');
  const [tplMinAtt, setTplMinAtt] = useState('75');
  const [tplMinScore, setTplMinScore] = useState('55');
  const [tplReqAssessments, setTplReqAssessments] = useState(true);
  const [tplReqCompletion, setTplReqCompletion] = useState(true);
  const [tplSignatoryName, setTplSignatoryName] = useState('CCI STEM Connect Programme Director');
  const [tplSignatoryTitle, setTplSignatoryTitle] = useState('Celebration Church International');
  const [creatingTpl, setCreatingTpl] = useState(false);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4500);
  };

  const loadData = useCallback(async (progId: string, tplId: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (progId) params.set('programmeId', progId);
      if (tplId) params.set('templateId', tplId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch<CertificatesResponse>(`/api/certificates${query}`);
      setData(res);
      if (!progId && res.programme?.id) {
        setProgrammeId(res.programme.id);
      }
      if (res.activeTemplateId && res.activeTemplateId !== tplId) {
        setTemplateId(res.activeTemplateId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load certificate records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(programmeId, templateId);
  }, [programmeId, templateId, loadData]);

  const activeTemplate = data?.templates.find((t) => t.id === (templateId || data.activeTemplateId));

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programmeId) return;
    try {
      setCreatingTpl(true);
      setError(null);
      const res = await apiFetch<{ template: { id: string } }>('/api/certificates/templates', {
        method: 'POST',
        body: {
          programmeId,
          title: tplTitle.trim(),
          minAttendancePct: Number(tplMinAtt),
          minOverallScore: Number(tplMinScore),
          requireAllAssessments: tplReqAssessments,
          requireProgrammeCompletion: tplReqCompletion,
          signatoryName: tplSignatoryName.trim(),
          signatoryTitle: tplSignatoryTitle.trim(),
        },
      });
      setShowTemplateModal(false);
      setTemplateId(res.template.id);
      showToast('Certificate template configured and eligibility rules evaluated.');
      await loadData(programmeId, res.template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create certificate template.');
    } finally {
      setCreatingTpl(false);
    }
  };

  const handleIssue = async (participantIds: string[]) => {
    if (!activeTemplate || participantIds.length === 0) return;
    try {
      setIssuing(true);
      setError(null);
      const res = await apiFetch<{ issuedCount: number }>('/api/certificates/issue', {
        method: 'POST',
        body: {
          templateId: activeTemplate.id,
          participantIds,
        },
      });
      showToast(
        `Issued ${res.issuedCount} official certificate${res.issuedCount === 1 ? '' : 's'} with unique verification codes.`
      );
      await loadData(programmeId, activeTemplate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue certificates.');
    } finally {
      setIssuing(false);
    }
  };

  const triggerPdfDownload = (
    row: EligibilityRow,
    template: TemplateItem,
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

  const handleExportEligibilityCsv = () => {
    if (!data || !activeTemplate) return;
    downloadCsv(
      `CCI-Certificate-Eligibility-${data.programme?.code || 'Programme'}.csv`,
      [
        'Participant Code',
        'Full Name',
        'Cohort',
        'STEM Track',
        'Status',
        'Attendance %',
        'Weighted Score %',
        'Standing',
        'Assessments Graded',
        'Required Assessments',
        'Eligible',
        'Certificate Code',
        'Unmet Requirements',
      ],
      data.eligibilityRows.map((r) => [
        r.participantCode,
        r.fullName,
        r.cohortName,
        r.trackName ?? '',
        r.participantStatus,
        r.attendanceRate !== null ? r.attendanceRate : '',
        r.overallScore !== null ? r.overallScore : '',
        r.classification,
        r.gradedAssessments,
        r.requiredAssessments,
        r.eligible ? 'Yes' : 'No',
        r.issuedCertificate?.certificateCode ?? '',
        r.reasons.join('; '),
      ])
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 bg-slate-100 rounded animate-pulse" />
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  // PARTICIPANT VIEW
  if (data?.scope === 'participant') {
    const items = data.myCertificates ?? [];
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            My Certificates & Eligibility
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Track your certificate eligibility criteria and download official CCI STEM Connect PDF
            certificates once issued.
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

        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <Award className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              No certificates configured for your programme yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Your Programme Manager will configure completion criteria and issue official
              certificates at programme conclusion.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(({ template, programmeTitle, programmeCode, evaluation }) => (
              <section
                key={template.id}
                className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">
                      {programmeCode} — {programmeTitle}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{template.title}</h3>
                  </div>

                  {evaluation?.issuedCertificate ? (
                    <button
                      type="button"
                      onClick={() =>
                        triggerPdfDownload(evaluation, template, programmeTitle, programmeCode)
                      }
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>Download Official PDF Certificate</span>
                    </button>
                  ) : (
                    <span
                      className={`text-xs font-semibold ${
                        evaluation?.eligible ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {evaluation?.eligible
                        ? 'Eligible — Awaiting Issuance'
                        : 'Requirements In Progress'}
                    </span>
                  )}
                </div>

                {evaluation && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm font-mono tabular-nums">
                    <div>
                      <p className="text-xs font-sans text-slate-500">Attendance</p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {evaluation.attendanceRate !== null ? `${evaluation.attendanceRate}%` : '—'}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          / {template.minAttendancePct}% min
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-sans text-slate-500">Weighted Score</p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {evaluation.overallScore !== null ? `${evaluation.overallScore}%` : '—'}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          / {template.minOverallScore}% min
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-sans text-slate-500">Assessments</p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {evaluation.gradedAssessments}/{evaluation.requiredAssessments}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-sans text-slate-500">Verification Code</p>
                      <p className="mt-0.5 font-semibold text-[#8F0E15]">
                        {evaluation.issuedCertificate?.certificateCode ?? 'Pending'}
                      </p>
                    </div>
                  </div>
                )}

                {evaluation && evaluation.reasons.length > 0 && !evaluation.issuedCertificate && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">
                      Remaining Criteria
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
                      {evaluation.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  // STAFF VIEW (Super Admin & Programme Manager)
  const eligibleUnissued = (data?.eligibilityRows ?? []).filter(
    (r) => r.eligible && !r.issuedCertificate
  );
  const issuedCount = (data?.eligibilityRows ?? []).filter((r) => Boolean(r.issuedCertificate)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Certificates & Eligibility Governance
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure backend-enforced attendance, score, and assessment thresholds, issue
            verifiable certificates, and download branded PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!programmeId}
            onClick={() => setShowTemplateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Template</span>
          </button>

          {activeTemplate && (
            <button
              type="button"
              onClick={handleExportEligibilityCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>Export CSV</span>
            </button>
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

      {/* Programme & Template Selectors */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select Programme"
            value={programmeId}
            onChange={(e) => {
              setProgrammeId(e.target.value);
              setTemplateId('');
            }}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
          >
            {data?.filterOptions.programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </select>

          {data && data.templates.length > 0 && (
            <select
              aria-label="Select Certificate Template"
              value={templateId || data.activeTemplateId || ''}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900"
            >
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {activeTemplate && eligibleUnissued.length > 0 && (
          <button
            type="button"
            disabled={issuing}
            onClick={() => handleIssue(eligibleUnissued.map((r) => r.participantId))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Award className="w-4 h-4 shrink-0" />
            <span>
              {issuing ? 'Issuing...' : `Issue All Eligible (${eligibleUnissued.length})`}
            </span>
          </button>
        )}
      </div>

      {!activeTemplate ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Award className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-medium text-slate-800">
            No certificate template created for this programme yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Create a certificate template to define minimum attendance, weighted performance score,
            and completion rules.
          </p>
        </div>
      ) : (
        <>
          {/* Rules Summary Strip */}
          <div className="bg-white rounded-xl border border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span>
                Min Attendance:{' '}
                <strong className="font-mono text-slate-900">
                  {activeTemplate.minAttendancePct}%
                </strong>
              </span>
              <span>
                Min Weighted Score:{' '}
                <strong className="font-mono text-slate-900">
                  {activeTemplate.minOverallScore}%
                </strong>
              </span>
              <span>
                All Assessments Required:{' '}
                <strong className="text-slate-900">
                  {activeTemplate.requireAllAssessments ? 'Yes' : 'No'}
                </strong>
              </span>
              <span>
                Completed Status Required:{' '}
                <strong className="text-slate-900">
                  {activeTemplate.requireProgrammeCompletion ? 'Yes' : 'No'}
                </strong>
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-700">
              {issuedCount} issued · {eligibleUnissued.length} ready to issue
            </span>
          </div>

          {/* Eligibility Matrix Table */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Participant</th>
                    <th className="py-3 px-3">Cohort / Status</th>
                    <th className="py-3 px-3 text-right">Attendance</th>
                    <th className="py-3 px-3 text-right">Weighted Score</th>
                    <th className="py-3 px-3 text-right">Assessments</th>
                    <th className="py-3 px-4">Eligibility Check</th>
                    <th className="py-3 px-6 text-right">Certificate Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.eligibilityRows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                        No participants enrolled in this programme.
                      </td>
                    </tr>
                  ) : (
                    (data?.eligibilityRows ?? []).map((row) => (
                      <tr key={row.participantId} className="hover:bg-slate-50/60 align-top">
                        <td className="py-3.5 px-6">
                          <p className="font-medium text-slate-900">{row.fullName}</p>
                          <p className="text-xs font-mono text-slate-500">{row.participantCode}</p>
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-600">
                          <p>{row.cohortName}</p>
                          <p className="capitalize text-slate-400">{row.participantStatus}</p>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-800">
                          {row.attendanceRate !== null ? `${row.attendanceRate}%` : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                          {row.overallScore !== null ? `${row.overallScore}%` : 'Withheld'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.gradedAssessments}/{row.requiredAssessments}
                        </td>
                        <td className="py-3.5 px-4 text-xs max-w-xs">
                          {row.eligible ? (
                            <span className="font-medium text-teal-700">
                              All criteria satisfied
                            </span>
                          ) : (
                            <div className="space-y-0.5 text-rose-700">
                              {row.reasons.map((r, i) => (
                                <p key={i}>{r}</p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          {row.issuedCertificate ? (
                            <div className="inline-flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  triggerPdfDownload(
                                    row,
                                    activeTemplate,
                                    data?.programme?.title ?? '',
                                    data?.programme?.code ?? ''
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-[#B5121B]" />
                                <span>Download PDF</span>
                              </button>
                              <span className="text-[11px] font-mono text-slate-400">
                                {row.issuedCertificate.certificateCode}
                              </span>
                            </div>
                          ) : row.eligible ? (
                            <button
                              type="button"
                              disabled={issuing}
                              onClick={() => handleIssue([row.participantId])}
                              className="px-3 py-1.5 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                            >
                              Issue Certificate
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Not eligible</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* New Certificate Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Configure Certificate Template
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Min Attendance (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={tplMinAtt}
                    onChange={(e) => setTplMinAtt(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
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
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplReqAssessments}
                    onChange={(e) => setTplReqAssessments(e.target.checked)}
                    className="accent-[#B5121B]"
                  />
                  <span>Require all eligible cohort assessments to be graded</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplReqCompletion}
                    onChange={(e) => setTplReqCompletion(e.target.checked)}
                    className="accent-[#B5121B]"
                  />
                  <span>Require participant status to be marked &quot;Completed&quot;</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    value={tplSignatoryName}
                    onChange={(e) => setTplSignatoryName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Title
                  </label>
                  <input
                    type="text"
                    value={tplSignatoryTitle}
                    onChange={(e) => setTplSignatoryTitle(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTpl}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-50 cursor-pointer"
                >
                  {creatingTpl ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
