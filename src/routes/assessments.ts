import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  assessmentCriteria,
  assessmentResults,
  assessments,
  cohorts,
  participants,
  programmes,
  sessions,
  stemTracks,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const createAssessmentSchema = z.object({
  programmeId: z.string().uuid(),
  cohortId: z.string().uuid().optional().nullable(),
  trackId: z.string().uuid().optional().nullable(),
  sessionId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3).max(160),
  category: z.enum([
    'pre_programme',
    'post_programme',
    'quiz',
    'practical_stem',
    'project_assessment',
    'skill_evaluation',
  ]),
  indicatorDomain: z.enum([
    'attendance_engagement',
    'knowledge_acquisition',
    'practical_stem_skills',
    'project_task_completion',
    'collaboration_problem_solving',
  ]),
  maxScore: z.number().positive().max(10000),
  pairedPreAssessmentId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  criteria: z
    .array(
      z.object({
        criterionName: z.string().trim().min(2).max(160),
        description: z.string().trim().max(600).optional().nullable(),
        maxPoints: z.number().positive().max(10000),
      })
    )
    .optional()
    .default([]),
});

const gradeSubmissionSchema = z.object({
  participantId: z.string().uuid(),
  rawScore: z.number().min(0).optional(),
  criteriaScores: z.record(z.string().uuid(), z.number().min(0)).optional(),
  feedback: z.string().trim().max(2000).optional().nullable(),
});

async function canFacilitatorAccessAssessment(
  userId: string,
  role: string,
  assessment: {
    programmeId: string;
    cohortId: string | null;
    sessionId: string | null;
    createdBy: string | null;
  }
): Promise<boolean> {
  if (role === 'super_admin' || role === 'programme_manager') return true;
  if (role !== 'facilitator') return false;
  if (assessment.createdBy === userId) return true;

  if (assessment.sessionId) {
    const sRow = await db
      .select({ facilitatorId: sessions.facilitatorId })
      .from(sessions)
      .where(eq(sessions.id, assessment.sessionId))
      .limit(1);
    if (sRow[0]?.facilitatorId === userId) return true;
  }

  // Check if facilitator leads any session or has assigned participants in the assessment's cohort/programme
  const sessionCond = assessment.cohortId
    ? and(eq(sessions.cohortId, assessment.cohortId), eq(sessions.facilitatorId, userId))
    : and(eq(sessions.programmeId, assessment.programmeId), eq(sessions.facilitatorId, userId));

  const ledSessions = await db.select({ id: sessions.id }).from(sessions).where(sessionCond).limit(1);
  if (ledSessions.length > 0) return true;

  const partCond = assessment.cohortId
    ? and(eq(participants.cohortId, assessment.cohortId), eq(participants.assignedFacilitatorId, userId))
    : and(eq(participants.programmeId, assessment.programmeId), eq(participants.assignedFacilitatorId, userId));

  const assignedParts = await db
    .select({ id: participants.id })
    .from(participants)
    .where(partCond)
    .limit(1);

  return assignedParts.length > 0;
}

// List assessments with rubric count, completion rate, and average score
router.get(
  '/assessments',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const currentUser = req.dbUser!;

      const [
        allAssessments,
        allCriteria,
        allResults,
        allProgrammes,
        allCohorts,
        allTracks,
        allParticipants,
        allSessions,
      ] = await Promise.all([
        db.select().from(assessments).orderBy(desc(assessments.createdAt)),
        db.select().from(assessmentCriteria),
        db.select().from(assessmentResults),
        db.select({ id: programmes.id, title: programmes.title, code: programmes.code }).from(programmes),
        db.select({ id: cohorts.id, name: cohorts.name, programmeId: cohorts.programmeId }).from(cohorts),
        db.select({ id: stemTracks.id, name: stemTracks.name, programmeId: stemTracks.programmeId }).from(stemTracks),
        db.select().from(participants),
        db.select({ id: sessions.id, programmeId: sessions.programmeId, cohortId: sessions.cohortId, facilitatorId: sessions.facilitatorId, title: sessions.title }).from(sessions),
      ]);

      let visibleAssessments = allAssessments;
      if (currentUser.role === 'facilitator') {
        const mySessionIds = new Set(
          allSessions.filter((s) => s.facilitatorId === currentUser.id).map((s) => s.id)
        );
        const myCohortIds = new Set([
          ...allSessions.filter((s) => s.facilitatorId === currentUser.id).map((s) => s.cohortId),
          ...allParticipants
            .filter((p) => p.assignedFacilitatorId === currentUser.id)
            .map((p) => p.cohortId),
        ]);
        const myProgrammeIds = new Set([
          ...allSessions.filter((s) => s.facilitatorId === currentUser.id).map((s) => s.programmeId),
          ...allParticipants
            .filter((p) => p.assignedFacilitatorId === currentUser.id)
            .map((p) => p.programmeId),
        ]);

        visibleAssessments = allAssessments.filter(
          (a) =>
            a.createdBy === currentUser.id ||
            (a.sessionId && mySessionIds.has(a.sessionId)) ||
            (a.cohortId && myCohortIds.has(a.cohortId)) ||
            (!a.cohortId && myProgrammeIds.has(a.programmeId))
        );
      }

      const progMap = new Map(allProgrammes.map((p) => [p.id, p]));
      const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
      const trackMap = new Map(allTracks.map((t) => [t.id, t]));

      const enriched = visibleAssessments.map((a) => {
        const criteriaCount = allCriteria.filter((c) => c.assessmentId === a.id).length;
        const eligibleParticipants = allParticipants.filter(
          (p) =>
            p.programmeId === a.programmeId &&
            p.status !== 'withdrawn' &&
            (!a.cohortId || p.cohortId === a.cohortId) &&
            (!a.trackId || p.trackId === a.trackId)
        );
        const aResults = allResults.filter((r) => r.assessmentId === a.id);
        const avgPct =
          aResults.length > 0
            ? Number(
                (
                  aResults.reduce((sum, r) => sum + Number(r.percentageScore), 0) / aResults.length
                ).toFixed(1)
              )
            : null;
        const completionRate =
          eligibleParticipants.length > 0
            ? Number(
                Math.min(100, (aResults.length / eligibleParticipants.length) * 100).toFixed(1)
              )
            : null;

        return {
          ...a,
          maxScore: Number(a.maxScore),
          programmeTitle: progMap.get(a.programmeId)?.title ?? 'Programme',
          cohortName: a.cohortId ? (cohortMap.get(a.cohortId)?.name ?? 'Cohort') : 'All Cohorts',
          trackName: a.trackId ? (trackMap.get(a.trackId)?.name ?? null) : null,
          criteriaCount,
          gradedCount: aResults.length,
          eligibleCount: eligibleParticipants.length,
          completionRate,
          averagePct: avgPct,
        };
      });

      res.json({
        assessments: enriched,
        lookups: {
          programmes: allProgrammes,
          cohorts: allCohorts,
          tracks: allTracks,
          sessions: allSessions,
        },
      });
    } catch (error) {
      console.error('Error listing assessments:', error);
      res.status(500).json({ error: 'Unable to load assessments.' });
    }
  }
);

// Create assessment with optional rubric criteria
router.post(
  '/assessments',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const parsed = createAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid assessment fields.', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    try {
      // Validate cohort belongs to programme if specified
      if (data.cohortId) {
        const cohortCheck = await db
          .select({ id: cohorts.id })
          .from(cohorts)
          .where(and(eq(cohorts.id, data.cohortId), eq(cohorts.programmeId, data.programmeId)))
          .limit(1);
        if (cohortCheck.length === 0) {
          res.status(400).json({ error: 'Selected cohort does not belong to the selected programme.' });
          return;
        }
      }

      // If rubric criteria are provided, compute total criteria points and ensure maxScore matches
      const criteriaTotal = data.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
      const effectiveMaxScore = data.criteria.length > 0 ? criteriaTotal : data.maxScore;

      if (effectiveMaxScore <= 0) {
        res.status(400).json({ error: 'Assessment maximum score must be greater than zero.' });
        return;
      }

      if (data.pairedPreAssessmentId) {
        const preCheck = await db
          .select({ id: assessments.id })
          .from(assessments)
          .where(
            and(
              eq(assessments.id, data.pairedPreAssessmentId),
              eq(assessments.programmeId, data.programmeId)
            )
          )
          .limit(1);
        if (preCheck.length === 0) {
          res.status(400).json({
            error: 'Paired pre-assessment must belong to the same programme.',
          });
          return;
        }
      }

      const created = await db.transaction(async (tx) => {
        const [newAssessment] = await tx
          .insert(assessments)
          .values({
            programmeId: data.programmeId,
            cohortId: data.cohortId ?? null,
            trackId: data.trackId ?? null,
            sessionId: data.sessionId ?? null,
            title: data.title,
            category: data.category,
            indicatorDomain: data.indicatorDomain,
            maxScore: effectiveMaxScore.toFixed(2),
            pairedPreAssessmentId: data.pairedPreAssessmentId ?? null,
            dueDate: data.dueDate ?? null,
            createdBy: req.dbUser!.id,
          })
          .returning();

        let createdCriteria: Array<typeof assessmentCriteria.$inferSelect> = [];
        if (data.criteria.length > 0) {
          createdCriteria = await tx
            .insert(assessmentCriteria)
            .values(
              data.criteria.map((c) => ({
                assessmentId: newAssessment.id,
                criterionName: c.criterionName,
                description: c.description ?? null,
                maxPoints: c.maxPoints.toFixed(2),
              }))
            )
            .returning();
        }

        return { assessment: newAssessment, criteria: createdCriteria };
      });

      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating assessment:', error);
      res.status(500).json({ error: 'Unable to create assessment.' });
    }
  }
);

// Get assessment grading roster, rubric criteria, results, and pre/post learning growth
router.get(
  '/assessments/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const assessmentId = req.params.id;
    if (!z.string().uuid().safeParse(assessmentId).success) {
      res.status(400).json({ error: 'Invalid assessment identifier.' });
      return;
    }

    try {
      const aRows = await db
        .select()
        .from(assessments)
        .where(eq(assessments.id, assessmentId))
        .limit(1);

      if (aRows.length === 0) {
        res.status(404).json({ error: 'Assessment not found.' });
        return;
      }

      const assessment = aRows[0];
      const allowed = await canFacilitatorAccessAssessment(
        req.dbUser!.id,
        req.dbUser!.role,
        assessment
      );
      if (!allowed) {
        res.status(403).json({ error: 'You are not authorized to access this assessment.' });
        return;
      }

      const participantConditions = [eq(participants.programmeId, assessment.programmeId)];
      if (assessment.cohortId) {
        participantConditions.push(eq(participants.cohortId, assessment.cohortId));
      }
      if (assessment.trackId) {
        participantConditions.push(eq(participants.trackId, assessment.trackId));
      }

      const [criteriaRows, resultsRows, preResultsRows, rosterRows, progRow, cohortRow] =
        await Promise.all([
          db
            .select()
            .from(assessmentCriteria)
            .where(eq(assessmentCriteria.assessmentId, assessment.id)),
          db
            .select()
            .from(assessmentResults)
            .where(eq(assessmentResults.assessmentId, assessment.id)),
          assessment.pairedPreAssessmentId
            ? db
                .select()
                .from(assessmentResults)
                .where(eq(assessmentResults.assessmentId, assessment.pairedPreAssessmentId))
            : Promise.resolve([]),
          db
            .select()
            .from(participants)
            .where(and(...participantConditions))
            .orderBy(asc(participants.fullName)),
          db
            .select({ id: programmes.id, title: programmes.title })
            .from(programmes)
            .where(eq(programmes.id, assessment.programmeId))
            .limit(1),
          assessment.cohortId
            ? db
                .select({ id: cohorts.id, name: cohorts.name })
                .from(cohorts)
                .where(eq(cohorts.id, assessment.cohortId))
                .limit(1)
            : Promise.resolve([]),
        ]);

      const resultByParticipant = new Map(resultsRows.map((r) => [r.participantId, r]));
      const preByParticipant = new Map(
        preResultsRows.map((r) => [r.participantId, Number(r.percentageScore)])
      );

      const roster = rosterRows
        .filter((p) => p.status !== 'withdrawn' || resultByParticipant.has(p.id))
        .map((p) => {
          const result = resultByParticipant.get(p.id);
          const prePct = preByParticipant.get(p.id) ?? null;
          const postPct = result ? Number(result.percentageScore) : null;

          let learningGrowth: {
            prePct: number | null;
            absoluteDelta: number | null;
            relativePct: number | null;
            trend: 'improved' | 'declined' | 'unchanged' | 'incomplete';
          } | null = null;

          if (assessment.pairedPreAssessmentId) {
            if (prePct !== null && postPct !== null) {
              const delta = Number((postPct - prePct).toFixed(2));
              const rel = prePct > 0 ? Number(((delta / prePct) * 100).toFixed(1)) : null;
              learningGrowth = {
                prePct,
                absoluteDelta: delta,
                relativePct: rel,
                trend: delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'unchanged',
              };
            } else {
              learningGrowth = {
                prePct,
                absoluteDelta: null,
                relativePct: null,
                trend: 'incomplete',
              };
            }
          }

          return {
            participantId: p.id,
            participantCode: p.participantCode,
            fullName: p.fullName,
            participantStatus: p.status,
            result: result
              ? {
                  id: result.id,
                  rawScore: Number(result.rawScore),
                  percentageScore: Number(result.percentageScore),
                  feedback: result.feedback,
                  gradedAt: result.gradedAt,
                }
              : null,
            learningGrowth,
          };
        });

      const gradedValues = resultsRows.map((r) => Number(r.percentageScore));
      const averagePct =
        gradedValues.length > 0
          ? Number(
              (gradedValues.reduce((sum, v) => sum + v, 0) / gradedValues.length).toFixed(1)
            )
          : null;
      const completionRate =
        roster.length > 0
          ? Number(Math.min(100, (resultsRows.length / roster.length) * 100).toFixed(1))
          : null;

      res.json({
        assessment: {
          ...assessment,
          maxScore: Number(assessment.maxScore),
          programmeTitle: progRow[0]?.title ?? 'Programme',
          cohortName: cohortRow[0]?.name ?? 'All Cohorts',
        },
        criteria: criteriaRows.map((c) => ({
          ...c,
          maxPoints: Number(c.maxPoints),
        })),
        roster,
        metrics: {
          totalRoster: roster.length,
          gradedCount: resultsRows.length,
          completionRate,
          averagePct,
        },
      });
    } catch (error) {
      console.error('Error loading assessment detail:', error);
      res.status(500).json({ error: 'Unable to load assessment grading view.' });
    }
  }
);

// Grade a participant (with rubric criteria validation & maxScore enforcement)
router.post(
  '/assessments/:id/results',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const assessmentId = req.params.id;
    if (!z.string().uuid().safeParse(assessmentId).success) {
      res.status(400).json({ error: 'Invalid assessment identifier.' });
      return;
    }

    const parsed = gradeSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid grade submission.', details: parsed.error.flatten() });
      return;
    }

    try {
      const aRows = await db
        .select()
        .from(assessments)
        .where(eq(assessments.id, assessmentId))
        .limit(1);

      if (aRows.length === 0) {
        res.status(404).json({ error: 'Assessment not found.' });
        return;
      }

      const assessment = aRows[0];
      const allowed = await canFacilitatorAccessAssessment(
        req.dbUser!.id,
        req.dbUser!.role,
        assessment
      );
      if (!allowed) {
        res.status(403).json({ error: 'You are not authorized to grade this assessment.' });
        return;
      }

      // Verify participant belongs to the assessment's programme (and cohort if scoped)
      const pConditions = [
        eq(participants.id, parsed.data.participantId),
        eq(participants.programmeId, assessment.programmeId),
      ];
      if (assessment.cohortId) {
        pConditions.push(eq(participants.cohortId, assessment.cohortId));
      }

      const validParticipant = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(...pConditions))
        .limit(1);

      if (validParticipant.length === 0) {
        res.status(400).json({
          error: 'Participant is not enrolled in the programme or cohort for this assessment.',
        });
        return;
      }

      const criteriaRows = await db
        .select()
        .from(assessmentCriteria)
        .where(eq(assessmentCriteria.assessmentId, assessment.id));

      const maxScore = Number(assessment.maxScore);
      let computedRawScore: number;

      if (criteriaRows.length > 0 && parsed.data.criteriaScores) {
        let sum = 0;
        for (const criterion of criteriaRows) {
          const cScore = parsed.data.criteriaScores[criterion.id];
          if (cScore === undefined || Number.isNaN(cScore)) {
            res.status(400).json({
              error: `Score required for rubric criterion "${criterion.criterionName}".`,
            });
            return;
          }
          const cMax = Number(criterion.maxPoints);
          if (cScore < 0 || cScore > cMax) {
            res.status(400).json({
              error: `Score for "${criterion.criterionName}" must be between 0 and ${cMax}.`,
            });
            return;
          }
          sum += cScore;
        }
        computedRawScore = Number(sum.toFixed(2));
      } else {
        if (parsed.data.rawScore === undefined || Number.isNaN(parsed.data.rawScore)) {
          res.status(400).json({ error: 'A numeric raw score is required.' });
          return;
        }
        computedRawScore = Number(parsed.data.rawScore.toFixed(2));
      }

      if (computedRawScore < 0 || computedRawScore > maxScore) {
        res.status(400).json({
          error: `Raw score (${computedRawScore}) cannot exceed assessment maximum score (${maxScore}).`,
        });
        return;
      }

      const percentageScore = Number(((computedRawScore / maxScore) * 100).toFixed(2));

      const saved = await db
        .insert(assessmentResults)
        .values({
          assessmentId: assessment.id,
          participantId: parsed.data.participantId,
          rawScore: computedRawScore.toFixed(2),
          percentageScore: percentageScore.toFixed(2),
          feedback: parsed.data.feedback?.trim() || null,
          gradedBy: req.dbUser!.id,
          gradedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [assessmentResults.assessmentId, assessmentResults.participantId],
          set: {
            rawScore: computedRawScore.toFixed(2),
            percentageScore: percentageScore.toFixed(2),
            feedback: parsed.data.feedback?.trim() || null,
            gradedBy: req.dbUser!.id,
            gradedAt: new Date(),
          },
        })
        .returning();

      res.json({
        result: {
          ...saved[0],
          rawScore: Number(saved[0].rawScore),
          percentageScore: Number(saved[0].percentageScore),
        },
      });
    } catch (error) {
      console.error('Error saving assessment grade:', error);
      res.status(500).json({ error: 'Unable to save assessment result.' });
    }
  }
);

// Participant self-service assessment results
router.get('/assessments/my/results', requireAuth, async (req: AuthRequest, res) => {
  try {
    const pRows = await db
      .select()
      .from(participants)
      .where(eq(participants.userId, req.dbUser!.id))
      .limit(1);

    if (pRows.length === 0) {
      res.json({ results: [] });
      return;
    }

    const participant = pRows[0];
    const [results, progAssessments] = await Promise.all([
      db
        .select()
        .from(assessmentResults)
        .where(eq(assessmentResults.participantId, participant.id))
        .orderBy(desc(assessmentResults.gradedAt)),
      db.select().from(assessments).where(eq(assessments.programmeId, participant.programmeId)),
    ]);

    const assMap = new Map(progAssessments.map((a) => [a.id, a]));

    res.json({
      results: results.map((r) => {
        const ass = assMap.get(r.assessmentId);
        return {
          ...r,
          rawScore: Number(r.rawScore),
          percentageScore: Number(r.percentageScore),
          assessmentTitle: ass?.title ?? 'Assessment',
          category: ass?.category ?? null,
          indicatorDomain: ass?.indicatorDomain ?? null,
          maxScore: ass ? Number(ass.maxScore) : null,
        };
      }),
    });
  } catch (error) {
    console.error('Error loading participant results:', error);
    res.status(500).json({ error: 'Unable to load your assessment results.' });
  }
});

export default router;
