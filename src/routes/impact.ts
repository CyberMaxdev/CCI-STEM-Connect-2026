import { Router } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  assessmentResults,
  assessments,
  cohorts,
  learningOutcomes,
  outcomeEvidenceMappings,
  participants,
  programmeObjectives,
  programmes,
  projects,
  projectSubmissions,
  teamContributions,
  teamMembers,
} from '../db/schema.ts';
import { round2 } from '../lib/performance-engine.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { computeProgrammePerformanceReport } from '../services/performance-service.ts';

const router = Router();
const uuidSchema = z.string().uuid();

const createMappingSchema = z
  .object({
    learningOutcomeId: z.string().uuid(),
    assessmentId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    evidenceWeight: z.number().positive().max(100).default(100),
  })
  .refine((d) => Boolean(d.assessmentId) !== Boolean(d.projectId), {
    message: 'Select either an assessment or a STEM project (not both).',
  });

/**
 * GET /api/impact
 * Programme impact evaluation: objectives, learning outcome attainment via mapped evidence,
 * pre-to-post learning growth breakdown, and domain indicators.
 */
router.get(
  '/impact',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const allProgrammes = await db
        .select()
        .from(programmes)
        .orderBy(desc(programmes.createdAt));

      const programmeId =
        typeof req.query.programmeId === 'string' && req.query.programmeId.length > 0
          ? req.query.programmeId
          : allProgrammes[0]?.id;

      const cohortId =
        typeof req.query.cohortId === 'string' && req.query.cohortId.length > 0
          ? req.query.cohortId
          : undefined;

      if (!programmeId) {
        res.json({
          programme: null,
          objectives: [],
          outcomes: [],
          growthByPair: [],
          performanceSummary: null,
          availableAssessments: [],
          availableProjects: [],
          filterOptions: { programmes: [], cohorts: [] },
        });
        return;
      }

      if (
        !uuidSchema.safeParse(programmeId).success ||
        (cohortId && !uuidSchema.safeParse(cohortId).success)
      ) {
        res.status(400).json({ error: 'Invalid programme or cohort filter.' });
        return;
      }

      const [
        perfReport,
        progCohorts,
        objectiveRows,
        outcomeRows,
        progAssessments,
        progProjects,
      ] = await Promise.all([
        computeProgrammePerformanceReport({ programmeId, cohortId }),
        db
          .select()
          .from(cohorts)
          .where(eq(cohorts.programmeId, programmeId))
          .orderBy(desc(cohorts.startDate)),
        db
          .select()
          .from(programmeObjectives)
          .where(eq(programmeObjectives.programmeId, programmeId)),
        db.select().from(learningOutcomes).where(eq(learningOutcomes.programmeId, programmeId)),
        db.select().from(assessments).where(eq(assessments.programmeId, programmeId)),
        db.select().from(projects).where(eq(projects.programmeId, programmeId)),
      ]);

      if (!perfReport) {
        res.status(404).json({ error: 'Programme not found.' });
        return;
      }

      const participantIds = perfReport.participants.map((p) => p.participantId);
      const outcomeIds = outcomeRows.map((o) => o.id);

      const [mappings, results, submissions, memberRows, contribRows] = await Promise.all([
        outcomeIds.length > 0
          ? db
              .select()
              .from(outcomeEvidenceMappings)
              .where(inArray(outcomeEvidenceMappings.learningOutcomeId, outcomeIds))
          : Promise.resolve([]),
        participantIds.length > 0
          ? db
              .select()
              .from(assessmentResults)
              .where(inArray(assessmentResults.participantId, participantIds))
          : Promise.resolve([]),
        progProjects.length > 0
          ? db
              .select()
              .from(projectSubmissions)
              .where(
                inArray(
                  projectSubmissions.projectId,
                  progProjects.map((p) => p.id)
                )
              )
          : Promise.resolve([]),
        participantIds.length > 0
          ? db.select().from(teamMembers).where(inArray(teamMembers.participantId, participantIds))
          : Promise.resolve([]),
        participantIds.length > 0
          ? db
              .select()
              .from(teamContributions)
              .where(inArray(teamContributions.participantId, participantIds))
          : Promise.resolve([]),
      ]);

      const assessmentMap = new Map(progAssessments.map((a) => [a.id, a]));
      const projectMap = new Map(progProjects.map((p) => [p.id, p]));
      const objectiveMap = new Map(objectiveRows.map((o) => [o.id, o]));

      // Index participant scores for outcome evidence calculation
      const assScoreMap = new Map<string, number>();
      for (const r of results) {
        assScoreMap.set(`${r.participantId}:${r.assessmentId}`, Number(r.percentageScore));
      }

      const teamsByParticipant = new Map<string, Set<string>>();
      for (const m of memberRows) {
        const set = teamsByParticipant.get(m.participantId) ?? new Set<string>();
        set.add(m.teamId);
        teamsByParticipant.set(m.participantId, set);
      }

      const contribMap = new Map<string, number>();
      for (const c of contribRows) {
        contribMap.set(`${c.submissionId}:${c.participantId}`, Number(c.individualScore));
      }

      const projScoreMap = new Map<string, number>();
      for (const pid of participantIds) {
        const pTeams = teamsByParticipant.get(pid) ?? new Set<string>();
        for (const sub of submissions) {
          if (sub.status !== 'evaluated') continue;
          const match =
            sub.participantId === pid || (sub.teamId !== null && pTeams.has(sub.teamId));
          if (!match) continue;
          const proj = projectMap.get(sub.projectId);
          if (!proj) continue;
          const indScore = contribMap.get(`${sub.id}:${pid}`);
          const pct =
            indScore !== undefined
              ? indScore
              : sub.qualityScore !== null && Number(proj.maxScore) > 0
                ? round2((Number(sub.qualityScore) / Number(proj.maxScore)) * 100)
                : null;
          if (pct !== null) {
            projScoreMap.set(`${pid}:${proj.id}`, pct);
          }
        }
      }

      const outcomesWithEvidence = outcomeRows.map((lo) => {
        const targetPct = Number(lo.targetProficiencyPct);
        const loMappings = mappings.filter((m) => m.learningOutcomeId === lo.id);

        const learnerScores: number[] = [];
        for (const pid of participantIds) {
          let wSum = 0;
          let wTotal = 0;
          for (const m of loMappings) {
            const w = Number(m.evidenceWeight) || 100;
            const sc = m.assessmentId
              ? assScoreMap.get(`${pid}:${m.assessmentId}`)
              : m.projectId
                ? projScoreMap.get(`${pid}:${m.projectId}`)
                : undefined;
            if (sc !== undefined) {
              wSum += sc * w;
              wTotal += w;
            }
          }
          if (wTotal > 0) {
            learnerScores.push(round2(wSum / wTotal));
          }
        }

        const achievedAvgPct =
          learnerScores.length > 0
            ? round2(learnerScores.reduce((s, v) => s + v, 0) / learnerScores.length)
            : null;
        const meetingTargetCount = learnerScores.filter((v) => v >= targetPct).length;
        const attainmentRatePct =
          learnerScores.length > 0 ? round2((meetingTargetCount / learnerScores.length) * 100) : null;

        return {
          id: lo.id,
          code: lo.code,
          statement: lo.statement,
          objectiveId: lo.objectiveId,
          objectiveTitle: lo.objectiveId ? (objectiveMap.get(lo.objectiveId)?.title ?? null) : null,
          targetProficiencyPct: targetPct,
          achievedAvgPct,
          evaluatedCount: learnerScores.length,
          meetingTargetCount,
          attainmentRatePct,
          mappings: loMappings.map((m) => ({
            id: m.id,
            assessmentId: m.assessmentId,
            assessmentTitle: m.assessmentId ? (assessmentMap.get(m.assessmentId)?.title ?? null) : null,
            projectId: m.projectId,
            projectTitle: m.projectId ? (projectMap.get(m.projectId)?.title ?? null) : null,
            evidenceWeight: Number(m.evidenceWeight),
          })),
        };
      });

      // Paired Pre-to-Post growth breakdown per assessment pair
      const pairGroups = new Map<
        string,
        {
          postAssessmentId: string;
          postTitle: string;
          preTitle: string;
          preScores: number[];
          postScores: number[];
          deltas: number[];
          gains: number[];
        }
      >();

      for (const p of perfReport.participants) {
        for (const pair of p.learningGrowth.pairs) {
          const entry = pairGroups.get(pair.postAssessmentId) ?? {
            postAssessmentId: pair.postAssessmentId,
            postTitle: pair.postAssessmentTitle,
            preTitle: pair.preAssessmentTitle,
            preScores: [],
            postScores: [],
            deltas: [],
            gains: [],
          };
          entry.preScores.push(pair.prePct);
          entry.postScores.push(pair.postPct);
          entry.deltas.push(pair.absoluteDelta);
          entry.gains.push(pair.normalizedGainPct);
          pairGroups.set(pair.postAssessmentId, entry);
        }
      }

      const growthByPair = Array.from(pairGroups.values()).map((g) => ({
        postAssessmentId: g.postAssessmentId,
        postTitle: g.postTitle,
        preTitle: g.preTitle,
        pairedLearners: g.deltas.length,
        avgPrePct: round2(g.preScores.reduce((s, v) => s + v, 0) / g.preScores.length),
        avgPostPct: round2(g.postScores.reduce((s, v) => s + v, 0) / g.postScores.length),
        avgDelta: round2(g.deltas.reduce((s, v) => s + v, 0) / g.deltas.length),
        avgNormalizedGainPct: round2(g.gains.reduce((s, v) => s + v, 0) / g.gains.length),
        improvedPct: round2(
          (g.deltas.filter((d) => d > 0).length / g.deltas.length) * 100
        ),
      }));

      res.json({
        programme: perfReport.programme,
        objectives: objectiveRows,
        outcomes: outcomesWithEvidence,
        growthByPair,
        performanceSummary: perfReport.programmeSummary,
        cohortSummaries: perfReport.cohortSummaries,
        availableAssessments: progAssessments.map((a) => ({
          id: a.id,
          title: a.title,
          category: a.category,
        })),
        availableProjects: progProjects.map((p) => ({
          id: p.id,
          title: p.title,
        })),
        filterOptions: {
          programmes: allProgrammes.map((p) => ({ id: p.id, code: p.code, title: p.title })),
          cohorts: progCohorts.map((c) => ({ id: c.id, name: c.name })),
        },
      });
    } catch (error) {
      console.error('Error computing programme impact analytics:', error);
      res.status(500).json({ error: 'Unable to load programme impact analytics.' });
    }
  }
);

/**
 * POST /api/impact/mappings
 * Maps an assessment or STEM project as evidence for a measurable learning outcome.
 */
router.post(
  '/impact/mappings',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = createMappingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? 'Invalid outcome evidence mapping.',
        });
        return;
      }

      const { learningOutcomeId, assessmentId, projectId, evidenceWeight } = parsed.data;
      const loRows = await db
        .select()
        .from(learningOutcomes)
        .where(eq(learningOutcomes.id, learningOutcomeId))
        .limit(1);
      const lo = loRows[0];
      if (!lo) {
        res.status(404).json({ error: 'Learning outcome not found.' });
        return;
      }

      if (assessmentId) {
        const assRows = await db
          .select()
          .from(assessments)
          .where(and(eq(assessments.id, assessmentId), eq(assessments.programmeId, lo.programmeId)))
          .limit(1);
        if (assRows.length === 0) {
          res.status(400).json({ error: 'Assessment must belong to the same programme.' });
          return;
        }
      }

      if (projectId) {
        const projRows = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.programmeId, lo.programmeId)))
          .limit(1);
        if (projRows.length === 0) {
          res.status(400).json({ error: 'Project must belong to the same programme.' });
          return;
        }
      }

      const inserted = await db
        .insert(outcomeEvidenceMappings)
        .values({
          learningOutcomeId,
          assessmentId: assessmentId ?? null,
          projectId: projectId ?? null,
          evidenceWeight: evidenceWeight.toFixed(2),
        })
        .returning();

      res.status(201).json({ mapping: inserted[0] });
    } catch (error) {
      console.error('Error creating outcome mapping:', error);
      res.status(500).json({ error: 'Unable to link evidence to learning outcome.' });
    }
  }
);

/**
 * DELETE /api/impact/mappings/:id
 */
router.delete(
  '/impact/mappings/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        res.status(400).json({ error: 'Invalid mapping identifier.' });
        return;
      }

      const deleted = await db
        .delete(outcomeEvidenceMappings)
        .where(eq(outcomeEvidenceMappings.id, parsedId.data))
        .returning();

      if (deleted.length === 0) {
        res.status(404).json({ error: 'Evidence mapping not found.' });
        return;
      }

      res.json({ deletedId: parsedId.data });
    } catch (error) {
      console.error('Error removing outcome mapping:', error);
      res.status(500).json({ error: 'Unable to remove outcome evidence mapping.' });
    }
  }
);

export default router;
