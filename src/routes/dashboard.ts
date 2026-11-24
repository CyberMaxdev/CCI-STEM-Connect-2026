import { Router } from 'express';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  assessmentResults,
  assessments,
  attendanceRecords,
  cohorts,
  learningOutcomes,
  outcomeEvidenceMappings,
  participants,
  programmeObjectives,
  programmes,
  projects,
  projectSubmissions,
  sessions,
  stemTracks,
  teamContributions,
  teamMembers,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth } from '../middleware/auth.ts';
import {
  aggregatePerformanceGroup,
  calculateAttendanceMetrics,
  createDefaultScoringModel,
  evaluateParticipantPerformance,
  round2,
  type AssessmentEvidence,
  type AttendanceEvidence,
  type ParticipantEvidenceInput,
  type ProjectEvidence,
  type ScoringModelConfig,
} from '../lib/performance-engine.ts';
import { getActiveScoringModel } from '../services/performance-service.ts';

const router = Router();

const filterSchema = z.object({
  programmeId: z.string().uuid().optional(),
  cohortId: z.string().uuid().optional(),
  trackId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function parseOptionalParam(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function isWithinDateRange(
  isoDateOrTimestamp: string | Date | null | undefined,
  startDate?: string,
  endDate?: string
): boolean {
  if (!startDate && !endDate) return true;
  if (!isoDateOrTimestamp) return false;
  const dateStr =
    isoDateOrTimestamp instanceof Date
      ? isoDateOrTimestamp.toISOString().slice(0, 10)
      : String(isoDateOrTimestamp).slice(0, 10);
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

router.get('/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.dbUser!;

    const parsed = filterSchema.safeParse({
      programmeId: parseOptionalParam(req.query.programmeId),
      cohortId: parseOptionalParam(req.query.cohortId),
      trackId: parseOptionalParam(req.query.trackId),
      sessionId: parseOptionalParam(req.query.sessionId),
      startDate: parseOptionalParam(req.query.startDate),
      endDate: parseOptionalParam(req.query.endDate),
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid dashboard filter parameters.' });
      return;
    }

    const { programmeId, cohortId, trackId, sessionId, startDate, endDate } = parsed.data;
    if (startDate && endDate && endDate < startDate) {
      res.status(400).json({ error: 'Reporting period end date must be on or after start date.' });
      return;
    }

    const [allProgrammes, allCohorts, allTracks, allSessionsMeta] = await Promise.all([
      db.select().from(programmes).orderBy(desc(programmes.createdAt)),
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(stemTracks).orderBy(asc(stemTracks.name)),
      db
        .select({
          id: sessions.id,
          programmeId: sessions.programmeId,
          cohortId: sessions.cohortId,
          trackId: sessions.trackId,
          facilitatorId: sessions.facilitatorId,
          title: sessions.title,
          sessionDate: sessions.sessionDate,
          startTime: sessions.startTime,
          endTime: sessions.endTime,
          status: sessions.status,
        })
        .from(sessions)
        .orderBy(desc(sessions.sessionDate)),
    ]);

    const selectedSessionMeta = sessionId
      ? (allSessionsMeta.find((s) => s.id === sessionId) ?? null)
      : null;

    const participantConditions = [];
    if (currentUser.role === 'participant') {
      participantConditions.push(eq(participants.userId, currentUser.id));
    } else if (currentUser.role === 'facilitator') {
      participantConditions.push(eq(participants.assignedFacilitatorId, currentUser.id));
    }

    const effectiveProgrammeId = programmeId ?? selectedSessionMeta?.programmeId;
    const effectiveCohortId = cohortId ?? selectedSessionMeta?.cohortId;
    const effectiveTrackId = trackId ?? (selectedSessionMeta?.trackId ?? undefined);

    if (currentUser.role !== 'participant') {
      if (effectiveProgrammeId) {
        participantConditions.push(eq(participants.programmeId, effectiveProgrammeId));
      }
      if (effectiveCohortId) {
        participantConditions.push(eq(participants.cohortId, effectiveCohortId));
      }
      if (effectiveTrackId) {
        participantConditions.push(eq(participants.trackId, effectiveTrackId));
      }
    }

    const participantRows =
      participantConditions.length > 0
        ? await db
            .select()
            .from(participants)
            .where(and(...participantConditions))
            .orderBy(asc(participants.fullName))
        : await db.select().from(participants).orderBy(asc(participants.fullName));

    const participantIds = participantRows.map((p) => p.id);
    const activeProgrammeIds = Array.from(new Set(participantRows.map((p) => p.programmeId)));

    const scopedSessions = allSessionsMeta.filter((s) => {
      if (currentUser.role === 'participant') {
        const myP = participantRows[0];
        if (!myP) return false;
        if (s.cohortId !== myP.cohortId) return false;
        if (s.trackId && myP.trackId && s.trackId !== myP.trackId) return false;
      } else {
        if (currentUser.role === 'facilitator' && s.facilitatorId !== currentUser.id) return false;
        if (effectiveProgrammeId && s.programmeId !== effectiveProgrammeId) return false;
        if (effectiveCohortId && s.cohortId !== effectiveCohortId) return false;
        if (effectiveTrackId && s.trackId && s.trackId !== effectiveTrackId) return false;
        if (sessionId && s.id !== sessionId) return false;
      }
      return isWithinDateRange(s.sessionDate, startDate, endDate);
    });

    const sessionDateMap = new Map(allSessionsMeta.map((s) => [s.id, s.sessionDate]));

    const [
      allAttendanceRows,
      allAssessmentRows,
      allResultRows,
      allProjectRows,
      allSubmissionRows,
      allTeamMemberRows,
      allContributionRows,
      objectiveRows,
      outcomeRows,
    ] = await Promise.all([
      participantIds.length > 0
        ? db
            .select()
            .from(attendanceRecords)
            .where(inArray(attendanceRecords.participantId, participantIds))
        : Promise.resolve([]),
      effectiveProgrammeId
        ? db.select().from(assessments).where(eq(assessments.programmeId, effectiveProgrammeId))
        : currentUser.role === 'participant' && participantRows[0]
          ? db
              .select()
              .from(assessments)
              .where(eq(assessments.programmeId, participantRows[0].programmeId))
          : db.select().from(assessments),
      participantIds.length > 0
        ? db
            .select()
            .from(assessmentResults)
            .where(inArray(assessmentResults.participantId, participantIds))
        : Promise.resolve([]),
      effectiveProgrammeId
        ? db.select().from(projects).where(eq(projects.programmeId, effectiveProgrammeId))
        : currentUser.role === 'participant' && participantRows[0]
          ? db.select().from(projects).where(eq(projects.programmeId, participantRows[0].programmeId))
          : db.select().from(projects),
      db.select().from(projectSubmissions),
      participantIds.length > 0
        ? db.select().from(teamMembers).where(inArray(teamMembers.participantId, participantIds))
        : Promise.resolve([]),
      participantIds.length > 0
        ? db
            .select()
            .from(teamContributions)
            .where(inArray(teamContributions.participantId, participantIds))
        : Promise.resolve([]),
      effectiveProgrammeId
        ? db
            .select()
            .from(programmeObjectives)
            .where(eq(programmeObjectives.programmeId, effectiveProgrammeId))
        : currentUser.role === 'participant' && participantRows[0]
          ? db
              .select()
              .from(programmeObjectives)
              .where(eq(programmeObjectives.programmeId, participantRows[0].programmeId))
          : db.select().from(programmeObjectives).limit(16),
      effectiveProgrammeId
        ? db
            .select()
            .from(learningOutcomes)
            .where(eq(learningOutcomes.programmeId, effectiveProgrammeId))
        : currentUser.role === 'participant' && participantRows[0]
          ? db
              .select()
              .from(learningOutcomes)
              .where(eq(learningOutcomes.programmeId, participantRows[0].programmeId))
          : db.select().from(learningOutcomes).limit(16),
    ]);

    const outcomeIds = outcomeRows.map((o) => o.id);
    const outcomeMappings =
      outcomeIds.length > 0
        ? await db
            .select()
            .from(outcomeEvidenceMappings)
            .where(inArray(outcomeEvidenceMappings.learningOutcomeId, outcomeIds))
        : [];

    const scopedAssessments = allAssessmentRows.filter((a) => {
      if (effectiveCohortId && a.cohortId && a.cohortId !== effectiveCohortId) return false;
      if (effectiveTrackId && a.trackId && a.trackId !== effectiveTrackId) return false;
      if (sessionId && a.sessionId && a.sessionId !== sessionId) return false;
      return true;
    });
    const assessmentMap = new Map(scopedAssessments.map((a) => [a.id, a]));

    const scopedAttendanceRows = allAttendanceRows.filter((r) => {
      if (sessionId && r.sessionId !== sessionId) return false;
      const sDate = sessionDateMap.get(r.sessionId) ?? r.recordedAt;
      return isWithinDateRange(sDate, startDate, endDate);
    });

    const scopedResultRows = allResultRows.filter((r) => {
      if (!assessmentMap.has(r.assessmentId)) return false;
      return isWithinDateRange(r.gradedAt, startDate, endDate);
    });

    const scopedProjects = allProjectRows.filter((p) => {
      if (effectiveCohortId && p.cohortId !== effectiveCohortId) return false;
      if (effectiveTrackId && p.trackId && p.trackId !== effectiveTrackId) return false;
      return isWithinDateRange(p.deadline, startDate, endDate);
    });
    const projectMap = new Map(scopedProjects.map((p) => [p.id, p]));

    const scoringModelsByProgramme = new Map<string, ScoringModelConfig>();
    const modelIdsToLoad = Array.from(
      new Set([...activeProgrammeIds, ...(effectiveProgrammeId ? [effectiveProgrammeId] : [])])
    );
    await Promise.all(
      modelIdsToLoad.map(async (pid) => {
        scoringModelsByProgramme.set(pid, await getActiveScoringModel(pid));
      })
    );
    const primaryScoringModel =
      (effectiveProgrammeId ? scoringModelsByProgramme.get(effectiveProgrammeId) : undefined) ??
      (activeProgrammeIds[0] ? scoringModelsByProgramme.get(activeProgrammeIds[0]) : undefined) ??
      createDefaultScoringModel();

    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const trackMap = new Map(allTracks.map((t) => [t.id, t]));

    const attendanceByParticipant = new Map<string, AttendanceEvidence[]>();
    for (const r of scopedAttendanceRows) {
      const list = attendanceByParticipant.get(r.participantId) ?? [];
      list.push({
        sessionId: r.sessionId,
        status: r.status,
        engagementScore: r.engagementScore !== null ? Number(r.engagementScore) : null,
      });
      attendanceByParticipant.set(r.participantId, list);
    }

    const assessmentsByParticipant = new Map<string, AssessmentEvidence[]>();
    for (const r of scopedResultRows) {
      const a = assessmentMap.get(r.assessmentId);
      if (!a) continue;
      const list = assessmentsByParticipant.get(r.participantId) ?? [];
      list.push({
        assessmentId: a.id,
        title: a.title,
        category: a.category,
        indicatorDomain: a.indicatorDomain,
        rawScore: Number(r.rawScore),
        maxScore: Number(a.maxScore),
        percentageScore: Number(r.percentageScore),
        pairedPreAssessmentId: a.pairedPreAssessmentId,
      });
      assessmentsByParticipant.set(r.participantId, list);
    }

    const teamsByParticipant = new Map<string, Set<string>>();
    for (const tm of allTeamMemberRows) {
      const set = teamsByParticipant.get(tm.participantId) ?? new Set<string>();
      set.add(tm.teamId);
      teamsByParticipant.set(tm.participantId, set);
    }

    const contribMap = new Map<
      string,
      { individualScore: number; collaborationScore: number | null }
    >();
    for (const c of allContributionRows) {
      contribMap.set(`${c.submissionId}:${c.participantId}`, {
        individualScore: Number(c.individualScore),
        collaborationScore: c.collaborationScore !== null ? Number(c.collaborationScore) : null,
      });
    }

    const scopedSubmissions = allSubmissionRows.filter((sub) => projectMap.has(sub.projectId));

    let expectedProjectCount = 0;
    let completedProjectCount = 0;

    const participantProjectStats = new Map<
      string,
      { expected: number; completed: number; evaluated: number }
    >();
    const participantProjectPctByProject = new Map<string, number>();

    const evaluatedParticipants = participantRows.map((p) => {
      const pTeams = teamsByParticipant.get(p.id) ?? new Set<string>();
      const eligibleProjects = scopedProjects.filter(
        (proj) =>
          proj.programmeId === p.programmeId &&
          proj.cohortId === p.cohortId &&
          (!proj.trackId || proj.trackId === p.trackId)
      );

      const pProjects: ProjectEvidence[] = [];
      let pCompleted = 0;
      let pEvaluated = 0;

      for (const proj of eligibleProjects) {
        expectedProjectCount += 1;
        const sub = scopedSubmissions.find(
          (s) =>
            s.projectId === proj.id &&
            (s.participantId === p.id || (s.teamId !== null && pTeams.has(s.teamId)))
        );
        if (sub) {
          if (sub.status === 'submitted' || sub.status === 'evaluated') {
            pCompleted += 1;
            completedProjectCount += 1;
          }
          const contrib = contribMap.get(`${sub.id}:${p.id}`);
          if (sub.status === 'evaluated') {
            pEvaluated += 1;
            const projMax = Number(proj.maxScore);
            const pct =
              contrib?.individualScore !== undefined
                ? contrib.individualScore
                : sub.qualityScore !== null && projMax > 0
                  ? round2((Number(sub.qualityScore) / projMax) * 100)
                  : null;
            if (pct !== null) {
              participantProjectPctByProject.set(`${p.id}:${proj.id}`, pct);
            }
          }
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
      }

      participantProjectStats.set(p.id, {
        expected: eligibleProjects.length,
        completed: pCompleted,
        evaluated: pEvaluated,
      });

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

      const model = scoringModelsByProgramme.get(p.programmeId) ?? primaryScoringModel;
      return evaluateParticipantPerformance(evidence, model);
    });

    // Unified aggregate straight from the evaluated participant records
    const groupAggregate = aggregatePerformanceGroup(evaluatedParticipants, primaryScoringModel);

    const totalParticipants = participantRows.length;
    const activeParticipants = participantRows.filter((p) => p.status === 'active').length;
    const completedParticipants = participantRows.filter((p) => p.status === 'completed').length;

    const programmeCompletionRate =
      totalParticipants > 0 ? round2((completedParticipants / totalParticipants) * 100) : null;

    const sessionWeightedAttendance = calculateAttendanceMetrics(
      scopedAttendanceRows.map((r) => ({
        sessionId: r.sessionId,
        status: r.status,
        engagementScore: r.engagementScore !== null ? Number(r.engagementScore) : null,
      }))
    );

    const averageAssessmentScore =
      scopedResultRows.length > 0
        ? round2(
            scopedResultRows.reduce((acc, r) => acc + Number(r.percentageScore), 0) /
              scopedResultRows.length
          )
        : null;

    const expectedAssessmentCount = scopedAssessments.reduce((sum, a) => {
      const eligible = participantRows.filter(
        (p) =>
          p.programmeId === a.programmeId &&
          (!a.cohortId || p.cohortId === a.cohortId) &&
          (!a.trackId || p.trackId === a.trackId)
      ).length;
      return sum + eligible;
    }, 0);

    const assessmentCompletionRate =
      expectedAssessmentCount > 0
        ? round2(Math.min(100, (scopedResultRows.length / expectedAssessmentCount) * 100))
        : null;

    const projectCompletionRate =
      expectedProjectCount > 0
        ? round2(Math.min(100, (completedProjectCount / expectedProjectCount) * 100))
        : null;

    // Session-level performance breakdown (chronological)
    const sessionTrend = [...scopedSessions]
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
      .map((s) => {
        const sRecords = scopedAttendanceRows.filter((r) => r.sessionId === s.id);
        const sMetrics = calculateAttendanceMetrics(
          sRecords.map((r) => ({
            sessionId: r.sessionId,
            status: r.status,
            engagementScore: r.engagementScore !== null ? Number(r.engagementScore) : null,
          }))
        );
        return {
          sessionId: s.id,
          title: s.title,
          shortTitle: s.title.length > 20 ? `${s.title.slice(0, 20)}...` : s.title,
          sessionDate: s.sessionDate,
          startTime: s.startTime,
          endTime: s.endTime,
          cohortName: cohortMap.get(s.cohortId)?.name ?? 'Cohort',
          trackName: s.trackId ? (trackMap.get(s.trackId)?.name ?? null) : null,
          status: s.status,
          recordedCount: sRecords.length,
          presentCount: sMetrics.presentCount,
          lateCount: sMetrics.lateCount,
          absentCount: sMetrics.absentCount,
          approvedAbsenceCount: sMetrics.approvedAbsenceCount,
          attendanceRate: sMetrics.rawAttendanceRate,
          engagementPct: sMetrics.averageEngagementPct,
        };
      });

    // Cohort rollup breakdown (reusing exact engine aggregates)
    const filteredCohorts = allCohorts.filter(
      (c) =>
        (!effectiveProgrammeId || c.programmeId === effectiveProgrammeId) &&
        (!effectiveCohortId || c.id === effectiveCohortId)
    );

    const cohortBreakdown = filteredCohorts.map((c) => {
      const cEvaluated = evaluatedParticipants.filter((ep) => ep.cohortId === c.id);
      const cAgg = aggregatePerformanceGroup(cEvaluated, primaryScoringModel);
      const cExpectedProj = cEvaluated.reduce(
        (sum, ep) => sum + (participantProjectStats.get(ep.participantId)?.expected ?? 0),
        0
      );
      const cCompletedProj = cEvaluated.reduce(
        (sum, ep) => sum + (participantProjectStats.get(ep.participantId)?.completed ?? 0),
        0
      );

      return {
        cohortId: c.id,
        name: c.name,
        status: c.status,
        participants: cAgg.totalParticipants,
        active: cEvaluated.filter((ep) => ep.participantStatus === 'active').length,
        scoredParticipants: cAgg.scoredParticipants,
        insufficientDataParticipants: cAgg.insufficientDataParticipants,
        attendanceRate: cAgg.averageAttendanceRate ?? 0,
        attendanceRateNullable: cAgg.averageAttendanceRate,
        averagePerformanceScore: cAgg.averageOverallScore,
        averageLearningGrowth: cAgg.averageLearningGrowthDelta,
        projectCompletionRate:
          cExpectedProj > 0 ? round2((cCompletedProj / cExpectedProj) * 100) : null,
      };
    });

    // Assessment outcomes breakdown (never show 0% for ungraded assessments)
    const assessmentBreakdown = scopedAssessments.slice(0, 10).map((a) => {
      const aResults = scopedResultRows.filter((r) => r.assessmentId === a.id);
      const avg =
        aResults.length > 0
          ? round2(
              aResults.reduce((acc, r) => acc + Number(r.percentageScore), 0) / aResults.length
            )
          : null;
      return {
        id: a.id,
        title: a.title.length > 22 ? `${a.title.slice(0, 22)}...` : a.title,
        fullTitle: a.title,
        category: a.category,
        indicatorDomain: a.indicatorDomain,
        averagePct: avg,
        gradedCount: aResults.length,
      };
    });

    const allPairs = evaluatedParticipants.flatMap((ep) => ep.learningGrowth.pairs);
    const learningGrowthSummary = {
      pairedRecordsCount: allPairs.length,
      averagePrePct:
        allPairs.length > 0
          ? round2(allPairs.reduce((s, p) => s + p.prePct, 0) / allPairs.length)
          : null,
      averagePostPct:
        allPairs.length > 0
          ? round2(allPairs.reduce((s, p) => s + p.postPct, 0) / allPairs.length)
          : null,
      averageDelta: groupAggregate.averageLearningGrowthDelta,
      averageNormalizedGainPct: groupAggregate.averageNormalizedGainPct,
    };

    // Learning outcome attainment from outcome_evidence_mappings
    const resultByParticipantAssessment = new Map<string, number>();
    for (const r of scopedResultRows) {
      resultByParticipantAssessment.set(`${r.participantId}:${r.assessmentId}`, Number(r.percentageScore));
    }

    const learningOutcomesWithAttainment = outcomeRows.map((lo) => {
      const targetPct = Number(lo.targetProficiencyPct);
      const mappings = outcomeMappings.filter((m) => m.learningOutcomeId === lo.id);
      if (mappings.length === 0 || participantIds.length === 0) {
        return {
          id: lo.id,
          code: lo.code,
          statement: lo.statement,
          targetProficiencyPct: lo.targetProficiencyPct,
          achievedAvgPct: null as number | null,
          evaluatedCount: 0,
          meetingTargetCount: 0,
        };
      }

      const learnerScores: number[] = [];
      for (const pId of participantIds) {
        let weightedSum = 0;
        let weightSum = 0;
        for (const m of mappings) {
          const w = Number(m.evidenceWeight) || 100;
          const score = m.assessmentId
            ? resultByParticipantAssessment.get(`${pId}:${m.assessmentId}`)
            : m.projectId
              ? participantProjectPctByProject.get(`${pId}:${m.projectId}`)
              : undefined;
          if (score !== undefined) {
            weightedSum += score * w;
            weightSum += w;
          }
        }
        if (weightSum > 0) {
          learnerScores.push(round2(weightedSum / weightSum));
        }
      }

      const achievedAvgPct =
        learnerScores.length > 0
          ? round2(learnerScores.reduce((s, v) => s + v, 0) / learnerScores.length)
          : null;
      const meetingTargetCount = learnerScores.filter((v) => v >= targetPct).length;

      return {
        id: lo.id,
        code: lo.code,
        statement: lo.statement,
        targetProficiencyPct: lo.targetProficiencyPct,
        achievedAvgPct,
        evaluatedCount: learnerScores.length,
        meetingTargetCount,
      };
    });

    const trackCounts = new Map<string, number>();
    for (const p of participantRows) {
      const name = p.trackId ? (trackMap.get(p.trackId)?.name ?? 'Unassigned') : 'Unassigned';
      trackCounts.set(name, (trackCounts.get(name) ?? 0) + 1);
    }

    // Underlying participant summary rows (with full calculation detail for click-to-audit drawer)
    const participantSummaryRows = evaluatedParticipants.map((ep) => {
      const projStat = participantProjectStats.get(ep.participantId) ?? {
        expected: 0,
        completed: 0,
        evaluated: 0,
      };
      const pResults = scopedResultRows.filter((r) => r.participantId === ep.participantId);
      const pAvgAssessment =
        pResults.length > 0
          ? round2(
              pResults.reduce((sum, r) => sum + Number(r.percentageScore), 0) / pResults.length
            )
          : null;

      return {
        participantId: ep.participantId,
        participantCode: ep.participantCode,
        fullName: ep.fullName,
        cohortName: ep.cohortName,
        trackName: ep.trackName,
        status: ep.participantStatus,
        attendanceRate: ep.attendance.rawAttendanceRate,
        averageAssessmentPct: pAvgAssessment,
        projectsCompleted: projStat.completed,
        projectsExpected: projStat.expected,
        learningGrowthDelta: ep.learningGrowth.averageAbsoluteDelta,
        dataCompletenessPct: ep.dataCompletenessPct,
        overallScore: ep.overallScore,
        observedPartialScore: ep.observedPartialScore,
        classification: ep.classification,
        classificationDisplay: ep.classificationDisplay,
        dataStatus: ep.dataStatus,
        dataQualityNotice: ep.dataQualityNotice,
        attendance: ep.attendance,
        learningGrowth: ep.learningGrowth,
        domains: ep.domains,
      };
    });

    const filterCohorts = allCohorts.filter((c) => !programmeId || c.programmeId === programmeId);
    const filterTracks = allTracks.filter((t) => !programmeId || t.programmeId === programmeId);
    const filterSessions = allSessionsMeta
      .filter((s) => {
        if (currentUser.role === 'facilitator' && s.facilitatorId !== currentUser.id) return false;
        if (programmeId && s.programmeId !== programmeId) return false;
        if (cohortId && s.cohortId !== cohortId) return false;
        if (trackId && s.trackId && s.trackId !== trackId) return false;
        return true;
      })
      .slice(0, 50)
      .map((s) => ({
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        programmeId: s.programmeId,
        cohortId: s.cohortId,
      }));

    const confirmedObjectivesCount = objectiveRows.filter((o) => o.isConfirmed).length;

    res.json({
      scope: currentUser.role,
      appliedFilters: {
        programmeId: programmeId ?? null,
        cohortId: cohortId ?? null,
        trackId: trackId ?? null,
        sessionId: sessionId ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      scoringModelName: primaryScoringModel.name,
      kpis: {
        totalParticipants,
        activeParticipants,
        completedParticipants,
        scoredParticipants: groupAggregate.scoredParticipants,
        insufficientDataParticipants: groupAggregate.insufficientDataParticipants,
        // Participant-mean attendance matches Performance Engine & Underlying Participant Records 1-to-1
        attendanceRate: groupAggregate.averageAttendanceRate,
        sessionWeightedAttendanceRate: sessionWeightedAttendance.rawAttendanceRate,
        programmeCompletionRate,
        assessmentCompletionRate,
        projectCompletionRate,
        completedProjectsCount: completedProjectCount,
        expectedProjectsCount: expectedProjectCount,
        averageAssessmentScore,
        averagePerformanceScore: groupAggregate.averageOverallScore,
        finalOnlyPerformanceScore: groupAggregate.finalOnlyAverageScore,
        averageLearningGrowth: groupAggregate.averageLearningGrowthDelta,
        averageNormalizedGainPct: groupAggregate.averageNormalizedGainPct,
        averageCompletenessPct: groupAggregate.averageCompletenessPct,
        confirmedObjectivesCount,
        totalObjectivesCount: objectiveRows.length,
        totalProgrammes: effectiveProgrammeId ? 1 : allProgrammes.length,
        totalSessions: scopedSessions.length,
      },
      performanceDistribution: groupAggregate.classificationDistribution,
      domainAverages: groupAggregate.domainAverages,
      learningGrowthSummary,
      sessionTrend,
      cohortBreakdown,
      assessmentBreakdown,
      trackBreakdown: Array.from(trackCounts.entries()).map(([name, count]) => ({ name, count })),
      objectives: objectiveRows,
      learningOutcomes: learningOutcomesWithAttainment,
      upcomingSessions: scopedSessions.slice(0, 8),
      participantRecords: participantSummaryRows,
      filterOptions:
        currentUser.role === 'participant'
          ? { programmes: [], cohorts: [], tracks: [], sessions: [] }
          : {
              programmes: allProgrammes.map((p) => ({
                id: p.id,
                title: p.title,
                code: p.code,
              })),
              cohorts: filterCohorts.map((c) => ({
                id: c.id,
                name: c.name,
                programmeId: c.programmeId,
              })),
              tracks: filterTracks.map((t) => ({
                id: t.id,
                name: t.name,
                programmeId: t.programmeId,
              })),
              sessions: filterSessions,
            },
    });
  } catch (error) {
    console.error('Error building Performance Intelligence Dashboard:', error);
    res.status(500).json({ error: 'Unable to load dashboard analytics.' });
  }
});

export default router;
