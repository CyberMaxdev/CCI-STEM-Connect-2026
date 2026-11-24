import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ParticipantPerformanceResult,
  PerformanceGroupAggregate,
  ScoringModelConfig,
} from './performance-engine';

const BRAND_CRIMSON: [number, number, number] = [181, 18, 27]; // #B5121B
const BRAND_DARK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTED_SLATE: [number, number, number] = [100, 116, 139]; // slate-500

export function sanitizeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export interface CertificatePdfInput {
  certificateTitle: string;
  certificateCode: string;
  participantName: string;
  participantCode: string;
  programmeTitle: string;
  programmeCode: string;
  cohortName: string;
  trackName: string | null;
  classification: string;
  overallScore: number | null;
  attendanceRate: number | null;
  issuedAt: string;
  signatoryName: string;
  signatoryTitle: string;
}

export function downloadCertificatePdf(input: CertificatePdfInput): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Outer institutional crimson frame + inner fine hairline border
  doc.setDrawColor(...BRAND_CRIMSON);
  doc.setLineWidth(2.2);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

  // Top crimson accent bar
  doc.setFillColor(...BRAND_CRIMSON);
  doc.rect(14, 14, pageWidth - 28, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CCI STEM CONNECT · CELEBRATION CHURCH INTERNATIONAL', pageWidth / 2, 21.5, {
    align: 'center',
  });

  // Certificate Title
  doc.setTextColor(...BRAND_CRIMSON);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(input.certificateTitle.toUpperCase(), pageWidth / 2, 46, { align: 'center' });

  doc.setTextColor(...MUTED_SLATE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('THIS CERTIFICATE IS PROUDLY PRESENTED TO', pageWidth / 2, 60, { align: 'center' });

  // Recipient Name
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text(input.participantName, pageWidth / 2, 78, { align: 'center' });

  doc.setDrawColor(...BRAND_CRIMSON);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 65, 83, pageWidth / 2 + 65, 83);

  // Programme Citation
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(
    'for successfully meeting all academic, attendance, and practical STEM standards in',
    pageWidth / 2,
    95,
    { align: 'center' }
  );

  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`${input.programmeTitle} (${input.programmeCode})`, pageWidth / 2, 106, {
    align: 'center',
  });

  doc.setTextColor(...MUTED_SLATE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const trackClause = input.trackName ? `  ·  STEM Track: ${input.trackName}` : '';
  doc.text(`Cohort: ${input.cohortName}${trackClause}`, pageWidth / 2, 115, { align: 'center' });

  // Performance Standing Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(52, 124, pageWidth - 104, 18, 2, 2, 'FD');

  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const scorePart = input.overallScore !== null ? `${input.overallScore}%` : 'Verified';
  const attPart = input.attendanceRate !== null ? `${input.attendanceRate}%` : 'Verified';
  doc.text(
    `Standing: ${input.classification}   |   Weighted Score: ${scorePart}   |   Attendance: ${attPart}   |   ID: ${input.participantCode}`,
    pageWidth / 2,
    134.5,
    { align: 'center' }
  );

  // Signatory & Verification Footer
  const footerY = 166;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(36, footerY, 114, footerY);
  doc.line(pageWidth - 114, footerY, pageWidth - 36, footerY);

  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(input.signatoryName, 75, footerY + 6, { align: 'center' });
  doc.text(new Date(input.issuedAt).toLocaleDateString(), pageWidth - 75, footerY + 6, {
    align: 'center',
  });

  doc.setTextColor(...MUTED_SLATE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(input.signatoryTitle, 75, footerY + 11, { align: 'center' });
  doc.text(`Verification Code: ${input.certificateCode}`, pageWidth - 75, footerY + 11, {
    align: 'center',
  });

  const safeFileName = `CCI-Certificate-${input.participantCode}-${input.certificateCode}.pdf`.replace(
    /[^A-Za-z0-9._-]/g,
    '_'
  );
  doc.save(safeFileName);
}

export interface ProgrammeReportPdfInput {
  reportTitle: string;
  programmeCode: string;
  programmeTitle: string;
  cohortLabel: string;
  trackLabel: string;
  generatedAt: string;
  scoringModel: ScoringModelConfig;
  summary: PerformanceGroupAggregate;
  cohorts: Array<{
    cohortName: string;
    status: string;
    summary: PerformanceGroupAggregate;
  }>;
  objectives: Array<{
    title: string;
    targetMetric: string | null;
    isConfirmed: boolean;
  }>;
  participants: ParticipantPerformanceResult[];
}

export function downloadProgrammeReportPdf(input: ProgrammeReportPdfInput): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Brand Header Banner
  doc.setFillColor(...BRAND_CRIMSON);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CCI STEM Connect — Programme Intelligence Report', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${input.reportTitle}  |  Generated ${new Date(input.generatedAt).toLocaleString()}`,
    14,
    19
  );

  // Scope Metadata
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${input.programmeCode} — ${input.programmeTitle}`, 14, 35);

  doc.setTextColor(...MUTED_SLATE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Scope: ${input.cohortLabel}  ·  ${input.trackLabel}  ·  Scoring Model: ${input.scoringModel.name}`,
    14,
    41
  );

  // Executive KPIs Table
  const fmtPct = (v: number | null) => (v !== null ? `${v}%` : '—');
  const fmtGrowth = (v: number | null) => (v !== null ? `${v >= 0 ? '+' : ''}${v} pts` : '—');

  autoTable(doc, {
    startY: 46,
    head: [['Key Performance Indicator', 'Measured Value', 'Data Sufficiency / Note']],
    body: [
      [
        'Registered Participants',
        String(input.summary.totalParticipants),
        `${input.summary.scoredParticipants} scored · ${input.summary.insufficientDataParticipants} insufficient data`,
      ],
      [
        'Average Weighted Performance Score',
        fmtPct(input.summary.averageOverallScore),
        `Final-only average: ${fmtPct(input.summary.finalOnlyAverageScore)} · Median: ${fmtPct(input.summary.medianOverallScore)}`,
      ],
      [
        'Average Attendance Rate',
        fmtPct(input.summary.averageAttendanceRate),
        'Countable sessions excluding approved absences',
      ],
      [
        'Pre-to-Post Learning Growth',
        fmtGrowth(input.summary.averageLearningGrowthDelta),
        `Hake Normalized Gain: ${fmtPct(input.summary.averageNormalizedGainPct)}`,
      ],
      [
        'Average Evidence Completeness',
        fmtPct(input.summary.averageCompletenessPct),
        `${input.summary.completeParticipants} complete · ${input.summary.provisionalParticipants} provisional`,
      ],
    ],
    headStyles: { fillColor: BRAND_CRIMSON, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // Domain Impact Indicators
  const afterKpiY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Scoring Domains & Performance Distribution', 14, afterKpiY + 9);

  autoTable(doc, {
    startY: afterKpiY + 12,
    head: [['Indicator Domain', 'Configured Weight', 'Mean Score', 'Sample Coverage']],
    body: input.summary.domainAverages.map((d) => [
      d.label,
      `${d.configuredWeightPct}%`,
      fmtPct(d.averageScore),
      `${d.sampleSize}/${input.summary.totalParticipants} (${d.coveragePct}%)`,
    ]),
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });

  // Classification Distribution
  const afterDomY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;
  autoTable(doc, {
    startY: afterDomY + 5,
    head: [['Classification Band', 'Score Range', 'Participants', 'Share (%)']],
    body: input.summary.classificationDistribution.map((b) => [
      b.categoryName,
      b.minScore !== null && b.maxScore !== null ? `${b.minScore} – ${b.maxScore}` : '< 50% evidence gate',
      String(b.count),
      `${b.percentage}%`,
    ]),
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });

  // Cohort Comparison Table
  if (input.cohorts.length > 0) {
    const afterDistY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    autoTable(doc, {
      startY: afterDistY + 8,
      head: [['Cohort', 'Learners', 'Scored', 'Attendance', 'Growth (Δ)', 'Weighted Avg']],
      body: input.cohorts.map((c) => [
        c.cohortName,
        String(c.summary.totalParticipants),
        `${c.summary.scoredParticipants}/${c.summary.totalParticipants}`,
        fmtPct(c.summary.averageAttendanceRate),
        fmtGrowth(c.summary.averageLearningGrowthDelta),
        fmtPct(c.summary.averageOverallScore),
      ]),
      headStyles: { fillColor: BRAND_CRIMSON, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 },
    });
  }

  // Participant Scorecards Page
  if (input.participants.length > 0) {
    doc.addPage();
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Individual Participant Performance Records', 14, 16);

    autoTable(doc, {
      startY: 20,
      head: [['ID', 'Participant', 'Cohort', 'Attendance', 'Growth', 'Completeness', 'Score', 'Standing']],
      body: input.participants.map((p) => [
        p.participantCode,
        p.fullName,
        p.cohortName,
        fmtPct(p.attendance.rawAttendanceRate),
        fmtGrowth(p.learningGrowth.averageAbsoluteDelta),
        `${p.dataCompletenessPct}%`,
        p.overallScore !== null ? `${p.overallScore}%` : 'Withheld',
        p.classificationDisplay,
      ]),
      headStyles: { fillColor: BRAND_CRIMSON, textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
  }

  const safeName = `CCI-Report-${input.programmeCode}-${new Date().toISOString().slice(0, 10)}.pdf`.replace(
    /[^A-Za-z0-9._-]/g,
    '_'
  );
  doc.save(safeName);
}
