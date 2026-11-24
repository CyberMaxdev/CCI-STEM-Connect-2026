import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  assessmentResults,
  assessments,
  attendanceRecords,
  cohorts,
  participants,
  performanceIndicators,
  programmes,
  projects,
  projectSubmissions,
  scoringConfigurations,
  scoringThresholds,
  stemTracks,
  teamContributions,
  teamMembers,
} from '../db/schema.ts';
import {
  aggregatePerformanceGroup,
  createDefaultScoringModel,
  DEFAULT_ATTENDANCE_BLEND_WEIGHT,
  DEFAULT_LATE_ATTENDANCE_CREDIT,
  DEFAULT_MIN_WEIGHT_COVERAGE_PCT,
  evaluateParticipantPerformance,
  type AssessmentEvidence,
  type AttendanceEvidence,
  type ParticipantEvidenceInput,
  type ParticipantPerformanceResult,
  type PerformanceGroupAggregate,
  type ProjectEvidence,
  type ScoringModelConfig,
} from '../lib/performance-engine.ts';

export async function getActiveScoringModel(programmeId: string): Promise<ScoringModelConfig> {
  const configs = await db
    .select()
    .from(scoringConfigurations)
    .where(
      and(
        eq(scoringConfigurations.programmeId, programmeId),
        eq(scoringConfigurations.isActive, true)
      )
    )
    .orderBy(desc(scoringConfigurations.createdAt))
    .limit(1);

  const active = configs[0];
  if (!active) {
    return createDefaultScoringModel();
  }

  const [indRows, threshRows] = await Promise.all([
    db
      .select()
      .from(performanceIndicators)
      .where(eq(performanceIndicators.scoringConfigId, active.id)),
    db
      .select()
      .from(scoringThresholds)
      .where(eq(scoringThresholds.scoringConfigId, active.id))
      .orderBy(asc(scoringThresholds.sortOrder)),
  ]);

  if (indRows.length === 0 || threshRows.length === 0) {
    return createDefaultScoringModel(active.name);
  }

  return {
    id: active.id,
    name: active.name,
    isDefaultProposal: active.isDefaultProposal,
    minWeightCoveragePct: DEFAULT_MIN_WEIGHT_COVERAGE_PCT,
    lateAttendanceCredit: DEFAULT_LATE_ATTENDANCE_CREDIT,
    attendanceBlendWeight: DEFAULT_ATTENDANCE_BLEND_WEIGHT,
    indicators: indRows.map((row) => ({
      domain: row.domain,
      label: row.label,
      weightPct: Number(row.weightPct),
      isRequired: row.isRequired,
    })),
    thresholds: threshRows.map((row) => ({
      categoryName: row.categoryName,
      minScore: Number(row.minScore),
      maxScore: Number(row.maxScore),
      sortOrder: row.sortOrder,
    })),
  };
}

export interface CohortPerformanceReport {
  cohortId: string;
  cohortName: string;
  status: string;
  summary: PerformanceGroupAggregate;
}

export interface ProgrammePerformanceReport {
  programme: {
    id: string;
    code: string;
    title: string;
    status: string;
  };
  scoringModel: ScoringModelConfig;
  programmeSummary: PerformanceGroupAggregate;
  cohortSummaries: CohortPerformanceReport[];
  participants: ParticipantPerformanceResult[];
}

export interface ComputePerformanceParams {
  programmeId: string;
  cohortId?: string;
  trackId?: string;
  participantId?: string;
  facilitatorUserId?: string;
  participantUserId?: string;
}

export async function computeProgrammePerformanceReport(
  params: ComputePerformanceParams
): Promise<ProgrammePerformanceReport | null> {
  const progRows = await db
    .select()
    .from(programmes)
    .where(eq(programmes.id, params.programmeId))
    .limit(1);

  const programme = progRows[0];
  if (!programme) return null;

  const [scoringModel, cohortRows, trackRows] = await Promise.all([
    getActiveScoringModel(programme.id),
    db
      .select()
      .from(cohorts)
      .where(eq(cohorts.programmeId, programme.id))
      .orderBy(desc(cohorts.startDate)),
    db.select().from(stemTracks).where(eq(stemTracks.programmeId, programme.id)),
  ]);

  const participantConditions = [eq(participants.programmeId, programme.id)];
  if (params.cohortId) participantConditions.push(eq(participants.cohortId, params.cohortId));
  if (params.trackId) participantConditions.push(eq(participants.trackId, params.trackId));
  if (params.participantId) participantConditions.push(eq(participants.id, params.participantId));
  if (params.facilitatorUserId) {
    participantConditions.push(eq(participants.assignedFacilitatorId, params.facilitatorUserId));
  }
  if (params.participantUserId) {
    participantConditions.push(eq(participants.userId, params.participantUserId));
  }

  const participantRows = await db
    .select()
    .from(participants)
    .where(and(...participantConditions))
    .orderBy(asc(participants.fullName));

  const participantIds = participantRows.map((p) => p.id);
  const cohortMap = new Map(cohortRows.map((c) => [c.id, c]));
  const trackMap = new Map(trackRows.map((t) => [t.id, t]));

  if (participantIds.length === 0) {
    const emptySummary = aggregatePerformanceGroup([], scoringModel);
    const filteredCohorts = cohortRows.filter((c) => !params.cohortId || c.id === params.cohortId);
    return {
      programme: {
        id: programme.id,
        code: programme.code,
        title: programme.title,
        status: programme.status,
      },
      scoringModel,
      programmeSummary: emptySummary,
      cohortSummaries: filteredCohorts.map((c) => ({
        cohortId: c.id,
        cohortName: c.name,
        status: c.status,
        summary: aggregatePerformanceGroup([], scoringModel),
      })),
      participants: [],
    };
  }

  const [
    attendanceRows,
    assessmentRows,
    resultRows,
    projectRows,
    submissionRows,
    teamMemberRows,
    contributionRows,
  ] = await Promise.all([
    db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.programmeId, programme.id),
          inArray(attendanceRecords.participantId, participantIds)
        )
      ),
    db.select().from(assessments).where(eq(assessments.programmeId, programme.id)),
    db
      .select()
      .from(assessmentResults)
      .where(inArray(assessmentResults.participantId, participantIds)),
    db.select().from(projects).where(eq(projects.programmeId, programme.id)),
    db.select().from(projectSubmissions),
    db
      .select()
      .from(teamMembers)
      .where(inArray(teamMembers.participantId, participantIds)),
    db
      .select()
      .from(teamContributions)
      .where(inArray(teamContributions.participantId, participantIds)),
  ]);

  const assessmentMap = new Map(assessmentRows.map((a) => [a.id, a]));
  const projectMap = new Map(projectRows.map((p) => [p.id, p]));

  // Map attendance by participant
  const attendanceByParticipant = new Map<string, AttendanceEvidence[]>();
  for (const r of attendanceRows) {
    const list = attendanceByParticipant.get(r.participantId) ?? [];
    list.push({
      sessionId: r.sessionId,
      status: r.status,
      engagementScore: r.engagementScore !== null ? Number(r.engagementScore) : null,
    });
    attendanceByParticipant.set(r.participantId, list);
  }

  // Map assessments by participant
  const assessmentsByParticipant = new Map<string, AssessmentEvidence[]>();
  for (const r of resultRows) {
    const ass = assessmentMap.get(r.assessmentId);
    if (!ass) continue;
    const list = assessmentsByParticipant.get(r.participantId) ?? [];
    list.push({
      assessmentId: ass.id,
      title: ass.title,
      category: ass.category,
      indicatorDomain: ass.indicatorDomain,
      rawScore: Number(r.rawScore),
      maxScore: Number(ass.maxScore),
      percentageScore: Number(r.percentageScore),
      pairedPreAssessmentId: ass.pairedPreAssessmentId,
    });
    assessmentsByParticipant.set(r.participantId, list);
  }

  // Map team memberships & team contributions
  const teamsByParticipant = new Map<string, Set<string>>();
  for (const tm of teamMemberRows) {
    const set = teamsByParticipant.get(tm.participantId) ?? new Set<string>();
    set.add(tm.teamId);
    teamsByParticipant.set(tm.participantId, set);
  }

  const contribBySubAndParticipant = new Map<
    string,
    { individualScore: number; collaborationScore: number | null }
  >();
  for (const c of contributionRows) {
    contribBySubAndParticipant.set(`${c.submissionId}:${c.participantId}`, {
      individualScore: Number(c.individualScore),
      collaborationScore: c.collaborationScore !== null ? Number(c.collaborationScore) : null,
    });
  }

  const programmeSubmissions = submissionRows.filter((s) => projectMap.has(s.projectId));

  // Evaluate each participant with the unified pure Performance Measurement Engine
  const evaluatedParticipants: ParticipantPerformanceResult[] = participantRows.map((p) => {
    const pTeams = teamsByParticipant.get(p.id) ?? new Set<string>();
    const pProjects: ProjectEvidence[] = [];

    for (const sub of programmeSubmissions) {
      const belongsDirectly = sub.participantId === p.id;
      const belongsViaTeam = sub.teamId !== null && pTeams.has(sub.teamId);
      if (!belongsDirectly && !belongsViaTeam) continue;

      const proj = projectMap.get(sub.projectId);
      if (!proj) continue;

      const contrib = contribBySubAndParticipant.get(`${sub.id}:${p.id}`);
      pProjects.push({
        projectId: proj.id,
        projectTitle: proj.title,
        maxScore: Number(proj.maxScore),
        status: sub.status,
        qualityScore: sub.qualityScore !== null ? Number(sub.qualityScore) : null,
        individualScore: contrib?.individualScore ?? null,
        collaborationScore: contrib?.collaborationScore ?? null,
      });
    }

    const evidence: ParticipantEvidenceInput = {
      participantId: p.id,
      participantCode: p.participantCode,
      fullName: p.fullName,
      programmeId: p.programmeId,
      cohortId: p.cohortId,
      cohortName: cohortMap.get(p.cohortId)?.name ?? 'Cohort',
      trackId: p.trackId,
      trackName: p.trackId ? (trackMap.get(p.trackId)?.name ?? null) : null,
      status: p.status,
      attendance: attendanceByParticipant.get(p.id) ?? [],
      assessments: assessmentsByParticipant.get(p.id) ?? [],
      projects: pProjects,
    };

    return evaluateParticipantPerformance(evidence, scoringModel);
  });

  const programmeSummary = aggregatePerformanceGroup(evaluatedParticipants, scoringModel);

  const filteredCohorts = cohortRows.filter((c) => !params.cohortId || c.id === params.cohortId);
  const cohortSummaries: CohortPerformanceReport[] = filteredCohorts.map((c) => {
    const cohortParticipants = evaluatedParticipants.filter((ep) => ep.cohortId === c.id);
    return {
      cohortId: c.id,
      cohortName: c.name,
      status: c.status,
      summary: aggregatePerformanceGroup(cohortParticipants, scoringModel),
    };
  });

  return {
    programme: {
      id: programme.id,
      code: programme.code,
      title: programme.title,
      status: programme.status,
    },
    scoringModel,
    programmeSummary,
    cohortSummaries,
    participants: evaluatedParticipants,
  };
}
