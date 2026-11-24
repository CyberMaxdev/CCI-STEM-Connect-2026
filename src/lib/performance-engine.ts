export type IndicatorDomain =
  | 'attendance_engagement'
  | 'knowledge_acquisition'
  | 'practical_stem_skills'
  | 'project_task_completion'
  | 'collaboration_problem_solving';

export type AttendanceStatus = 'present' | 'late' | 'approved_absence' | 'absent';

export type AssessmentCategory =
  | 'pre_programme'
  | 'post_programme'
  | 'quiz'
  | 'practical_stem'
  | 'project_assessment'
  | 'skill_evaluation';

export type DataSufficiencyStatus = 'complete' | 'provisional' | 'insufficient_data';

export interface ScoringIndicatorConfig {
  domain: IndicatorDomain;
  label: string;
  weightPct: number; // 0 to 100; active indicators sum to 100
  isRequired: boolean;
}

export interface ScoringThresholdConfig {
  categoryName: string;
  minScore: number;
  maxScore: number;
  sortOrder: number;
}

export interface ScoringModelConfig {
  id?: string | null;
  name: string;
  isDefaultProposal: boolean;
  minWeightCoveragePct: number; // Default 50%: below this, overallScore is withheld (null)
  lateAttendanceCredit: number; // Default 0.75 (75% credit for late arrival)
  attendanceBlendWeight: number; // Default 0.70 (70% attendance + 30% engagement when engagement exists)
  indicators: ScoringIndicatorConfig[];
  thresholds: ScoringThresholdConfig[];
}

export interface AttendanceEvidence {
  sessionId: string;
  status: AttendanceStatus;
  engagementScore: number | null; // 0 - 10 scale
}

export interface AssessmentEvidence {
  assessmentId: string;
  title: string;
  category: AssessmentCategory;
  indicatorDomain: IndicatorDomain;
  rawScore: number;
  maxScore: number;
  percentageScore?: number | null;
  pairedPreAssessmentId?: string | null;
}

export interface ProjectEvidence {
  projectId: string;
  projectTitle: string;
  maxScore: number;
  status: 'pending' | 'in_progress' | 'submitted' | 'evaluated' | 'revision_requested';
  qualityScore: number | null;
  individualScore?: number | null; // 0 - 100 if team contribution evaluated
  collaborationScore?: number | null; // 0 - 100 if team contribution evaluated
}

export interface ParticipantEvidenceInput {
  participantId: string;
  participantCode: string;
  fullName: string;
  programmeId: string;
  cohortId: string;
  cohortName: string;
  trackId: string | null;
  trackName: string | null;
  status: string;
  attendance: AttendanceEvidence[];
  assessments: AssessmentEvidence[];
  projects: ProjectEvidence[];
}

export interface AttendanceMetrics {
  totalRecords: number;
  countableSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  approvedAbsenceCount: number;
  rawAttendanceRate: number | null; // (present + late) / countable * 100
  weightedAttendanceScore: number | null; // (present + late*credit) / countable * 100
  averageEngagementPct: number | null; // avg(0..10) * 10
  combinedDomainScore: number | null;
}

export interface LearningGrowthPair {
  postAssessmentId: string;
  postAssessmentTitle: string;
  preAssessmentId: string;
  preAssessmentTitle: string;
  prePct: number;
  postPct: number;
  absoluteDelta: number; // postPct - prePct (percentage points)
  normalizedGainPct: number; // Hake's normalized gain (%)
}

export interface LearningGrowthMetrics {
  pairedCount: number;
  averagePrePct: number | null;
  averagePostPct: number | null;
  averageAbsoluteDelta: number | null;
  averageNormalizedGainPct: number | null;
  pairs: LearningGrowthPair[];
}

export interface DomainEvaluation {
  domain: IndicatorDomain;
  label: string;
  configuredWeightPct: number;
  effectiveWeightPct: number; // Re-normalized weight used in overall score (0 if missing or insufficient)
  isRequired: boolean;
  score: number | null; // 0 - 100 or null when no evidence exists
  evidenceCount: number;
  weightedContribution: number | null; // score * (effectiveWeightPct / 100)
  status: 'available' | 'missing';
}

export interface ParticipantPerformanceResult {
  participantId: string;
  participantCode: string;
  fullName: string;
  programmeId: string;
  cohortId: string;
  cohortName: string;
  trackId: string | null;
  trackName: string | null;
  participantStatus: string;
  attendance: AttendanceMetrics;
  learningGrowth: LearningGrowthMetrics;
  domains: DomainEvaluation[];
  availableWeightPct: number;
  missingWeightPct: number;
  dataCompletenessPct: number;
  missingDomains: IndicatorDomain[];
  missingRequiredDomains: IndicatorDomain[];
  dataStatus: DataSufficiencyStatus;
  isProvisional: boolean;
  observedPartialScore: number | null; // Diagnostic weighted average even when < min coverage
  overallScore: number | null; // Strictly null when dataStatus === 'insufficient_data'
  classification: string; // Configured band name or 'Insufficient Data'
  classificationDisplay: string; // e.g., 'Proficient (Provisional)' or 'Insufficient Data'
  dataQualityNotice: string | null;
}

export interface ClassificationBucket {
  categoryName: string;
  count: number;
  percentage: number;
  minScore: number | null;
  maxScore: number | null;
}

export interface DomainAggregate {
  domain: IndicatorDomain;
  label: string;
  configuredWeightPct: number;
  averageScore: number | null;
  sampleSize: number;
  coveragePct: number;
}

export interface PerformanceGroupAggregate {
  totalParticipants: number;
  scoredParticipants: number;
  completeParticipants: number;
  provisionalParticipants: number;
  insufficientDataParticipants: number;
  averageOverallScore: number | null; // Mean across scored (complete + provisional)
  finalOnlyAverageScore: number | null; // Mean across complete-only participants
  medianOverallScore: number | null;
  averageAttendanceRate: number | null;
  averageLearningGrowthDelta: number | null;
  averageNormalizedGainPct: number | null;
  averageCompletenessPct: number | null;
  domainAverages: DomainAggregate[];
  classificationDistribution: ClassificationBucket[];
}

export const DEFAULT_MIN_WEIGHT_COVERAGE_PCT = 50;
export const DEFAULT_LATE_ATTENDANCE_CREDIT = 0.75;
export const DEFAULT_ATTENDANCE_BLEND_WEIGHT = 0.7;

export const DEFAULT_SCORING_INDICATORS: ScoringIndicatorConfig[] = [
  {
    domain: 'attendance_engagement',
    label: 'Attendance & Engagement',
    weightPct: 20,
    isRequired: true,
  },
  {
    domain: 'knowledge_acquisition',
    label: 'Knowledge Acquisition',
    weightPct: 25,
    isRequired: true,
  },
  {
    domain: 'practical_stem_skills',
    label: 'Practical STEM Skills',
    weightPct: 25,
    isRequired: true,
  },
  {
    domain: 'project_task_completion',
    label: 'Project & Task Completion',
    weightPct: 20,
    isRequired: true,
  },
  {
    domain: 'collaboration_problem_solving',
    label: 'Collaboration & Problem-Solving',
    weightPct: 10,
    isRequired: false,
  },
];

export const DEFAULT_SCORING_THRESHOLDS: ScoringThresholdConfig[] = [
  { categoryName: 'Distinction', minScore: 85, maxScore: 100, sortOrder: 1 },
  { categoryName: 'Proficient', minScore: 70, maxScore: 84.99, sortOrder: 2 },
  { categoryName: 'Developing', minScore: 55, maxScore: 69.99, sortOrder: 3 },
  { categoryName: 'Needs Support', minScore: 0, maxScore: 54.99, sortOrder: 4 },
];

export function createDefaultScoringModel(name = 'CCI STEM Connect Standard Model (Proposed)'): ScoringModelConfig {
  return {
    id: null,
    name,
    isDefaultProposal: true,
    minWeightCoveragePct: DEFAULT_MIN_WEIGHT_COVERAGE_PCT,
    lateAttendanceCredit: DEFAULT_LATE_ATTENDANCE_CREDIT,
    attendanceBlendWeight: DEFAULT_ATTENDANCE_BLEND_WEIGHT,
    indicators: DEFAULT_SCORING_INDICATORS.map((item) => ({ ...item })),
    thresholds: DEFAULT_SCORING_THRESHOLDS.map((item) => ({ ...item })),
  };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function normalizeAssessmentPercentage(assessment: AssessmentEvidence): number | null {
  if (
    assessment.percentageScore !== undefined &&
    assessment.percentageScore !== null &&
    Number.isFinite(assessment.percentageScore)
  ) {
    return round2(clampPct(assessment.percentageScore));
  }
  if (!Number.isFinite(assessment.maxScore) || assessment.maxScore <= 0) {
    return null;
  }
  if (!Number.isFinite(assessment.rawScore)) {
    return null;
  }
  return round2(clampPct((assessment.rawScore / assessment.maxScore) * 100));
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateScoringModelConfig(
  indicators: ScoringIndicatorConfig[],
  thresholds: ScoringThresholdConfig[]
): ConfigValidationResult {
  const errors: string[] = [];

  if (indicators.length === 0) {
    errors.push('At least one performance indicator domain must be configured.');
  }

  const seenDomains = new Set<string>();
  let totalWeight = 0;

  for (const ind of indicators) {
    if (seenDomains.has(ind.domain)) {
      errors.push(`Duplicate indicator domain: ${ind.domain}.`);
    }
    seenDomains.add(ind.domain);

    if (!Number.isFinite(ind.weightPct) || ind.weightPct < 0 || ind.weightPct > 100) {
      errors.push(`Weight for "${ind.label}" must be between 0% and 100%.`);
    } else {
      totalWeight += ind.weightPct;
    }
  }

  if (Math.abs(round2(totalWeight) - 100) > 0.01) {
    errors.push(`Indicator weights must sum to exactly 100.00% (currently ${round2(totalWeight)}%).`);
  }

  if (thresholds.length < 2) {
    errors.push('At least two classification thresholds are required.');
  } else {
    const sorted = [...thresholds].sort((a, b) => a.minScore - b.minScore);
    if (sorted[0].minScore > 0) {
      errors.push('Lowest classification band must start at 0.');
    }
    if (sorted[sorted.length - 1].maxScore < 100) {
      errors.push('Highest classification band must cover up to 100.');
    }
    for (let i = 0; i < sorted.length; i += 1) {
      const band = sorted[i];
      if (!band.categoryName.trim()) {
        errors.push('Every classification band must have a non-empty name.');
      }
      if (band.minScore < 0 || band.maxScore > 100 || band.minScore > band.maxScore) {
        errors.push(`Invalid score bounds for "${band.categoryName}" (${band.minScore}–${band.maxScore}).`);
      }
      if (i > 0) {
        const prev = sorted[i - 1];
        if (band.minScore <= prev.maxScore) {
          errors.push(
            `Overlapping score bands between "${prev.categoryName}" (max ${prev.maxScore}) and "${band.categoryName}" (min ${band.minScore}).`
          );
        } else if (band.minScore - prev.maxScore > 0.05) {
          errors.push(
            `Score gap detected between "${prev.categoryName}" (max ${prev.maxScore}) and "${band.categoryName}" (min ${band.minScore}).`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function calculateAttendanceMetrics(
  records: AttendanceEvidence[],
  lateCredit = DEFAULT_LATE_ATTENDANCE_CREDIT,
  attendanceBlendWeight = DEFAULT_ATTENDANCE_BLEND_WEIGHT
): AttendanceMetrics {
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let approvedAbsenceCount = 0;
  const engagementValues: number[] = [];

  for (const r of records) {
    if (r.status === 'present') presentCount += 1;
    else if (r.status === 'late') lateCount += 1;
    else if (r.status === 'absent') absentCount += 1;
    else if (r.status === 'approved_absence') approvedAbsenceCount += 1;

    if (
      r.status !== 'approved_absence' &&
      r.engagementScore !== null &&
      r.engagementScore !== undefined &&
      Number.isFinite(r.engagementScore)
    ) {
      // Engagement is recorded on a 0..10 scale -> convert to 0..100
      engagementValues.push(clampPct(r.engagementScore * 10));
    }
  }

  const countableSessions = presentCount + lateCount + absentCount;

  const rawAttendanceRate =
    countableSessions > 0 ? round2(((presentCount + lateCount) / countableSessions) * 100) : null;

  const weightedAttendanceScore =
    countableSessions > 0
      ? round2(((presentCount + lateCount * lateCredit) / countableSessions) * 100)
      : null;

  const averageEngagementPct =
    engagementValues.length > 0
      ? round2(engagementValues.reduce((sum, v) => sum + v, 0) / engagementValues.length)
      : null;

  let combinedDomainScore: number | null = null;
  if (weightedAttendanceScore !== null && averageEngagementPct !== null) {
    const engagementWeight = 1 - attendanceBlendWeight;
    combinedDomainScore = round2(
      weightedAttendanceScore * attendanceBlendWeight + averageEngagementPct * engagementWeight
    );
  } else if (weightedAttendanceScore !== null) {
    combinedDomainScore = weightedAttendanceScore;
  }

  return {
    totalRecords: records.length,
    countableSessions,
    presentCount,
    lateCount,
    absentCount,
    approvedAbsenceCount,
    rawAttendanceRate,
    weightedAttendanceScore,
    averageEngagementPct,
    combinedDomainScore,
  };
}

export function calculateLearningGrowth(assessments: AssessmentEvidence[]): LearningGrowthMetrics {
  const byId = new Map<string, { evidence: AssessmentEvidence; pct: number }>();
  for (const a of assessments) {
    const pct = normalizeAssessmentPercentage(a);
    if (pct !== null) {
      byId.set(a.assessmentId, { evidence: a, pct });
    }
  }

  const pairs: LearningGrowthPair[] = [];

  for (const a of assessments) {
    if (!a.pairedPreAssessmentId) continue;
    const postEntry = byId.get(a.assessmentId);
    const preEntry = byId.get(a.pairedPreAssessmentId);
    if (!postEntry || !preEntry) continue;

    const prePct = preEntry.pct;
    const postPct = postEntry.pct;
    const absoluteDelta = round2(postPct - prePct);

    // Hake's Normalized Gain (positive) / Normalized Loss (negative)
    let normalizedGainPct = 0;
    if (postPct >= prePct) {
      normalizedGainPct = prePct < 100 ? round2(((postPct - prePct) / (100 - prePct)) * 100) : 0;
    } else {
      normalizedGainPct = prePct > 0 ? round2(((postPct - prePct) / prePct) * 100) : 0;
    }

    pairs.push({
      postAssessmentId: postEntry.evidence.assessmentId,
      postAssessmentTitle: postEntry.evidence.title,
      preAssessmentId: preEntry.evidence.assessmentId,
      preAssessmentTitle: preEntry.evidence.title,
      prePct,
      postPct,
      absoluteDelta,
      normalizedGainPct,
    });
  }

  if (pairs.length === 0) {
    return {
      pairedCount: 0,
      averagePrePct: null,
      averagePostPct: null,
      averageAbsoluteDelta: null,
      averageNormalizedGainPct: null,
      pairs: [],
    };
  }

  return {
    pairedCount: pairs.length,
    averagePrePct: round2(pairs.reduce((s, p) => s + p.prePct, 0) / pairs.length),
    averagePostPct: round2(pairs.reduce((s, p) => s + p.postPct, 0) / pairs.length),
    averageAbsoluteDelta: round2(pairs.reduce((s, p) => s + p.absoluteDelta, 0) / pairs.length),
    averageNormalizedGainPct: round2(
      pairs.reduce((s, p) => s + p.normalizedGainPct, 0) / pairs.length
    ),
    pairs,
  };
}

export function classifyScore(
  score: number | null,
  thresholds: ScoringThresholdConfig[]
): string {
  if (score === null || !Number.isFinite(score)) {
    return 'Insufficient Data';
  }
  const ordered = [...thresholds].sort((a, b) => b.minScore - a.minScore);
  for (const band of ordered) {
    if (score >= band.minScore && score <= band.maxScore) {
      return band.categoryName;
    }
  }
  // Fallback for floating boundary rounding (e.g., 84.996 -> 85.00)
  for (const band of ordered) {
    if (score >= band.minScore) {
      return band.categoryName;
    }
  }
  return ordered[ordered.length - 1]?.categoryName ?? 'Unclassified';
}

export function evaluateParticipantPerformance(
  input: ParticipantEvidenceInput,
  config: ScoringModelConfig = createDefaultScoringModel()
): ParticipantPerformanceResult {
  const attendance = calculateAttendanceMetrics(
    input.attendance,
    config.lateAttendanceCredit,
    config.attendanceBlendWeight
  );
  const learningGrowth = calculateLearningGrowth(input.assessments);

  // Identify pre-programme assessments whose paired post-programme assessment has been completed.
  // Once the learner completes the paired post-test, the baseline diagnostic pre-test measures growth
  // rather than penalizing final mastery in Knowledge Acquisition.
  const supersededPreAssessmentIds = new Set(learningGrowth.pairs.map((p) => p.preAssessmentId));

  // Collect evidence scores per domain
  const domainBuckets: Record<IndicatorDomain, number[]> = {
    attendance_engagement: [],
    knowledge_acquisition: [],
    practical_stem_skills: [],
    project_task_completion: [],
    collaboration_problem_solving: [],
  };

  if (attendance.combinedDomainScore !== null) {
    domainBuckets.attendance_engagement.push(attendance.combinedDomainScore);
  }

  for (const a of input.assessments) {
    if (a.category === 'pre_programme' && supersededPreAssessmentIds.has(a.assessmentId)) {
      continue;
    }
    const pct = normalizeAssessmentPercentage(a);
    if (pct !== null && domainBuckets[a.indicatorDomain]) {
      domainBuckets[a.indicatorDomain].push(pct);
    }
  }

  for (const proj of input.projects) {
    if (proj.status === 'evaluated') {
      if (
        proj.individualScore !== undefined &&
        proj.individualScore !== null &&
        Number.isFinite(proj.individualScore)
      ) {
        domainBuckets.project_task_completion.push(round2(clampPct(proj.individualScore)));
      } else if (
        proj.qualityScore !== null &&
        Number.isFinite(proj.qualityScore) &&
        Number.isFinite(proj.maxScore) &&
        proj.maxScore > 0
      ) {
        domainBuckets.project_task_completion.push(
          round2(clampPct((proj.qualityScore / proj.maxScore) * 100))
        );
      }

      if (
        proj.collaborationScore !== undefined &&
        proj.collaborationScore !== null &&
        Number.isFinite(proj.collaborationScore)
      ) {
        domainBuckets.collaboration_problem_solving.push(round2(clampPct(proj.collaborationScore)));
      }
    }
  }

  // Evaluate each configured indicator domain
  let availableWeightPct = 0;
  let missingWeightPct = 0;
  const missingDomains: IndicatorDomain[] = [];
  const missingRequiredDomains: IndicatorDomain[] = [];

  const preliminaryDomains = config.indicators.map((ind) => {
    const values = domainBuckets[ind.domain] ?? [];
    const score =
      values.length > 0 ? round2(values.reduce((s, v) => s + v, 0) / values.length) : null;
    const isAvailable = score !== null;

    if (ind.weightPct > 0) {
      if (isAvailable) {
        availableWeightPct += ind.weightPct;
      } else {
        missingWeightPct += ind.weightPct;
        missingDomains.push(ind.domain);
        if (ind.isRequired) {
          missingRequiredDomains.push(ind.domain);
        }
      }
    }

    return {
      ind,
      score,
      evidenceCount: ind.domain === 'attendance_engagement' ? attendance.countableSessions : values.length,
    };
  });

  availableWeightPct = round2(availableWeightPct);
  missingWeightPct = round2(missingWeightPct);
  const totalConfiguredWeight = round2(
    config.indicators.reduce((sum, i) => sum + i.weightPct, 0)
  );
  const dataCompletenessPct =
    totalConfiguredWeight > 0 ? round2((availableWeightPct / totalConfiguredWeight) * 100) : 0;

  // Diagnostic weighted score across available domains (proportional re-weighting; never zero-filled)
  let observedPartialScore: number | null = null;
  if (availableWeightPct > 0) {
    const weightedSum = preliminaryDomains.reduce((sum, item) => {
      if (item.score === null || item.ind.weightPct <= 0) return sum;
      return sum + item.score * item.ind.weightPct;
    }, 0);
    observedPartialScore = round2(weightedSum / availableWeightPct);
  }

  // Anti-misleading-score sufficiency gate
  let dataStatus: DataSufficiencyStatus;
  if (availableWeightPct < config.minWeightCoveragePct || observedPartialScore === null) {
    dataStatus = 'insufficient_data';
  } else if (missingDomains.length > 0 || missingRequiredDomains.length > 0) {
    dataStatus = 'provisional';
  } else {
    dataStatus = 'complete';
  }

  const overallScore = dataStatus === 'insufficient_data' ? null : observedPartialScore;
  const isProvisional = dataStatus === 'provisional';

  const domains: DomainEvaluation[] = preliminaryDomains.map(({ ind, score, evidenceCount }) => {
    const isAvailable = score !== null;
    const effectiveWeightPct =
      isAvailable && availableWeightPct > 0 && ind.weightPct > 0
        ? round2((ind.weightPct / availableWeightPct) * 100)
        : 0;
    const weightedContribution =
      isAvailable && overallScore !== null
        ? round2((score * effectiveWeightPct) / 100)
        : null;

    return {
      domain: ind.domain,
      label: ind.label,
      configuredWeightPct: ind.weightPct,
      effectiveWeightPct,
      isRequired: ind.isRequired,
      score,
      evidenceCount,
      weightedContribution,
      status: isAvailable ? 'available' : 'missing',
    };
  });

  const classification = classifyScore(overallScore, config.thresholds);
  const classificationDisplay =
    dataStatus === 'insufficient_data'
      ? 'Insufficient Data'
      : isProvisional
        ? `${classification} (Provisional)`
        : classification;

  let dataQualityNotice: string | null = null;
  if (dataStatus === 'insufficient_data') {
    dataQualityNotice =
      availableWeightPct === 0
        ? 'No attendance, assessment, or project evidence recorded yet.'
        : `Only ${dataCompletenessPct}% of weighted categories have evidence (minimum ${config.minWeightCoveragePct}% required before issuing an overall score).`;
  } else if (isProvisional) {
    const missingLabels = domains
      .filter((d) => d.status === 'missing' && d.configuredWeightPct > 0)
      .map((d) => d.label);
    dataQualityNotice =
      missingRequiredDomains.length > 0
        ? `Provisional score re-weighted across ${dataCompletenessPct}% available evidence; awaiting required domain(s): ${missingLabels.join(', ')}.`
        : `Provisional score re-weighted across ${dataCompletenessPct}% available evidence; optional domain(s) unrecorded: ${missingLabels.join(', ')}.`;
  }

  return {
    participantId: input.participantId,
    participantCode: input.participantCode,
    fullName: input.fullName,
    programmeId: input.programmeId,
    cohortId: input.cohortId,
    cohortName: input.cohortName,
    trackId: input.trackId,
    trackName: input.trackName,
    participantStatus: input.status,
    attendance,
    learningGrowth,
    domains,
    availableWeightPct,
    missingWeightPct,
    dataCompletenessPct,
    missingDomains,
    missingRequiredDomains,
    dataStatus,
    isProvisional,
    observedPartialScore,
    overallScore,
    classification,
    classificationDisplay,
    dataQualityNotice,
  };
}

export function aggregatePerformanceGroup(
  results: ParticipantPerformanceResult[],
  config: ScoringModelConfig = createDefaultScoringModel()
): PerformanceGroupAggregate {
  const totalParticipants = results.length;
  const scored = results.filter((r) => r.overallScore !== null);
  const complete = results.filter((r) => r.dataStatus === 'complete');
  const provisional = results.filter((r) => r.dataStatus === 'provisional');
  const insufficient = results.filter((r) => r.dataStatus === 'insufficient_data');

  const averageOverallScore =
    scored.length > 0
      ? round2(scored.reduce((sum, r) => sum + (r.overallScore ?? 0), 0) / scored.length)
      : null;

  const finalOnlyAverageScore =
    complete.length > 0
      ? round2(complete.reduce((sum, r) => sum + (r.overallScore ?? 0), 0) / complete.length)
      : null;

  let medianOverallScore: number | null = null;
  if (scored.length > 0) {
    const sortedScores = scored.map((r) => r.overallScore!).sort((a, b) => a - b);
    const mid = Math.floor(sortedScores.length / 2);
    medianOverallScore =
      sortedScores.length % 2 === 0
        ? round2((sortedScores[mid - 1] + sortedScores[mid]) / 2)
        : round2(sortedScores[mid]);
  }

  const withAttendance = results.filter((r) => r.attendance.rawAttendanceRate !== null);
  const averageAttendanceRate =
    withAttendance.length > 0
      ? round2(
          withAttendance.reduce((sum, r) => sum + (r.attendance.rawAttendanceRate ?? 0), 0) /
            withAttendance.length
        )
      : null;

  const withGrowth = results.filter((r) => r.learningGrowth.averageAbsoluteDelta !== null);
  const averageLearningGrowthDelta =
    withGrowth.length > 0
      ? round2(
          withGrowth.reduce((sum, r) => sum + (r.learningGrowth.averageAbsoluteDelta ?? 0), 0) /
            withGrowth.length
        )
      : null;

  const averageNormalizedGainPct =
    withGrowth.length > 0
      ? round2(
          withGrowth.reduce((sum, r) => sum + (r.learningGrowth.averageNormalizedGainPct ?? 0), 0) /
            withGrowth.length
        )
      : null;

  const averageCompletenessPct =
    totalParticipants > 0
      ? round2(results.reduce((sum, r) => sum + r.dataCompletenessPct, 0) / totalParticipants)
      : null;

  const domainAverages: DomainAggregate[] = config.indicators.map((ind) => {
    const validScores: number[] = [];
    for (const r of results) {
      const dom = r.domains.find((d) => d.domain === ind.domain);
      if (dom && dom.score !== null) {
        validScores.push(dom.score);
      }
    }
    return {
      domain: ind.domain,
      label: ind.label,
      configuredWeightPct: ind.weightPct,
      averageScore:
        validScores.length > 0
          ? round2(validScores.reduce((sum, v) => sum + v, 0) / validScores.length)
          : null,
      sampleSize: validScores.length,
      coveragePct:
        totalParticipants > 0 ? round2((validScores.length / totalParticipants) * 100) : 0,
    };
  });

  const sortedThresholds = [...config.thresholds].sort((a, b) => a.sortOrder - b.sortOrder);
  const classificationDistribution: ClassificationBucket[] = sortedThresholds.map((band) => {
    const count = results.filter(
      (r) => r.dataStatus !== 'insufficient_data' && r.classification === band.categoryName
    ).length;
    return {
      categoryName: band.categoryName,
      count,
      percentage: totalParticipants > 0 ? round2((count / totalParticipants) * 100) : 0,
      minScore: band.minScore,
      maxScore: band.maxScore,
    };
  });

  classificationDistribution.push({
    categoryName: 'Insufficient Data',
    count: insufficient.length,
    percentage: totalParticipants > 0 ? round2((insufficient.length / totalParticipants) * 100) : 0,
    minScore: null,
    maxScore: null,
  });

  return {
    totalParticipants,
    scoredParticipants: scored.length,
    completeParticipants: complete.length,
    provisionalParticipants: provisional.length,
    insufficientDataParticipants: insufficient.length,
    averageOverallScore,
    finalOnlyAverageScore,
    medianOverallScore,
    averageAttendanceRate,
    averageLearningGrowthDelta,
    averageNormalizedGainPct,
    averageCompletenessPct,
    domainAverages,
    classificationDistribution,
  };
}
