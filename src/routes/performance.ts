import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  cohorts,
  participants,
  performanceIndicators,
  programmes,
  scoringConfigurations,
  scoringThresholds,
  stemTracks,
} from '../db/schema.ts';
import {
  validateScoringModelConfig,
  type ScoringIndicatorConfig,
  type ScoringThresholdConfig,
} from '../lib/performance-engine.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  computeProgrammePerformanceReport,
  getActiveScoringModel,
} from '../services/performance-service.ts';

const router = Router();

const uuidSchema = z.string().uuid();

const indicatorDomainSchema = z.enum([
  'attendance_engagement',
  'knowledge_acquisition',
  'practical_stem_skills',
  'project_task_completion',
  'collaboration_problem_solving',
]);

const saveConfigSchema = z.object({
  name: z.string().trim().min(2).max(160),
  indicators: z
    .array(
      z.object({
        domain: indicatorDomainSchema,
        label: z.string().trim().min(2).max(120),
        weightPct: z.number().min(0).max(100),
        isRequired: z.boolean(),
      })
    )
    .min(1)
    .max(5),
  thresholds: z
    .array(
      z.object({
        categoryName: z.string().trim().min(2).max(80),
        minScore: z.number().min(0).max(100),
        maxScore: z.number().min(0).max(100),
        sortOrder: z.number().int().min(1).max(20),
      })
    )
    .min(2)
    .max(10),
});

/**
 * GET /api/performance/report
 * Returns reusable programme, cohort, and participant performance evaluations
 * using the programme's active scoring configuration.
 * Role-scoped on the backend:
 * - super_admin & programme_manager: full programme access
 * - facilitator: assigned participants only
 * - participant: own linked participant record only
 */
router.get('/performance/report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.dbUser!;

    const allProgrammes = await db
      .select({
        id: programmes.id,
        code: programmes.code,
        title: programmes.title,
        status: programmes.status,
      })
      .from(programmes)
      .orderBy(desc(programmes.createdAt));

    const allCohorts = await db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        programmeId: cohorts.programmeId,
      })
      .from(cohorts)
      .orderBy(desc(cohorts.startDate));

    const allTracks = await db
      .select({
        id: stemTracks.id,
        name: stemTracks.name,
        programmeId: stemTracks.programmeId,
      })
      .from(stemTracks);

    // Participant role: strictly scoped to their own linked record
    if (currentUser.role === 'participant') {
      const myRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, currentUser.id))
        .limit(1);

      const me = myRows[0];
      if (!me) {
        res.json({
          scope: 'participant',
          report: null,
          filterOptions: { programmes: [], cohorts: [], tracks: [] },
        });
        return;
      }

      const report = await computeProgrammePerformanceReport({
        programmeId: me.programmeId,
        participantId: me.id,
        participantUserId: currentUser.id,
      });

      res.json({
        scope: 'participant',
        report,
        filterOptions: {
          programmes: allProgrammes.filter((p) => p.id === me.programmeId),
          cohorts: allCohorts.filter((c) => c.id === me.cohortId),
          tracks: allTracks.filter((t) => t.programmeId === me.programmeId),
        },
      });
      return;
    }

    const requestedProgrammeId =
      typeof req.query.programmeId === 'string' && req.query.programmeId.length > 0
        ? req.query.programmeId
        : allProgrammes[0]?.id;

    const cohortId =
      typeof req.query.cohortId === 'string' && req.query.cohortId.length > 0
        ? req.query.cohortId
        : undefined;

    const trackId =
      typeof req.query.trackId === 'string' && req.query.trackId.length > 0
        ? req.query.trackId
        : undefined;

    if (!requestedProgrammeId) {
      res.json({
        scope: currentUser.role,
        report: null,
        filterOptions: { programmes: [], cohorts: [], tracks: [] },
      });
      return;
    }

    if (
      !uuidSchema.safeParse(requestedProgrammeId).success ||
      (cohortId && !uuidSchema.safeParse(cohortId).success) ||
      (trackId && !uuidSchema.safeParse(trackId).success)
    ) {
      res.status(400).json({ error: 'Invalid programme, cohort, or track identifier.' });
      return;
    }

    const report = await computeProgrammePerformanceReport({
      programmeId: requestedProgrammeId,
      cohortId,
      trackId,
      facilitatorUserId: currentUser.role === 'facilitator' ? currentUser.id : undefined,
    });

    if (!report) {
      res.status(404).json({ error: 'Programme not found.' });
      return;
    }

    res.json({
      scope: currentUser.role,
      report,
      filterOptions: {
        programmes: allProgrammes,
        cohorts: allCohorts.filter((c) => c.programmeId === requestedProgrammeId),
        tracks: allTracks.filter((t) => t.programmeId === requestedProgrammeId),
      },
    });
  } catch (error) {
    console.error('Error generating performance report:', error);
    res.status(500).json({ error: 'Unable to compute performance report.' });
  }
});

/**
 * GET /api/performance/participant/:participantId
 * Returns the detailed single-participant scorecard using the programme's scoring model.
 */
router.get('/performance/participant/:participantId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.participantId);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid participant identifier.' });
      return;
    }

    const currentUser = req.dbUser!;
    const pRows = await db
      .select()
      .from(participants)
      .where(eq(participants.id, parsedId.data))
      .limit(1);

    const participant = pRows[0];
    if (!participant) {
      res.status(404).json({ error: 'Participant not found.' });
      return;
    }

    if (currentUser.role === 'participant' && participant.userId !== currentUser.id) {
      res.status(403).json({ error: 'You may only inspect your own performance scorecard.' });
      return;
    }
    if (
      currentUser.role === 'facilitator' &&
      participant.assignedFacilitatorId !== currentUser.id
    ) {
      res.status(403).json({ error: 'You may only inspect participants assigned to you.' });
      return;
    }

    const report = await computeProgrammePerformanceReport({
      programmeId: participant.programmeId,
      participantId: participant.id,
    });

    res.json({
      programme: report?.programme ?? null,
      scoringModel: report?.scoringModel ?? null,
      evaluation: report?.participants[0] ?? null,
    });
  } catch (error) {
    console.error('Error computing participant scorecard:', error);
    res.status(500).json({ error: 'Unable to compute participant scorecard.' });
  }
});

/**
 * GET /api/performance/config/:programmeId
 * Returns the active scoring configuration and history for a programme.
 */
router.get('/performance/config/:programmeId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.programmeId);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const activeModel = await getActiveScoringModel(parsedId.data);
    const history = await db
      .select({
        id: scoringConfigurations.id,
        name: scoringConfigurations.name,
        isActive: scoringConfigurations.isActive,
        isDefaultProposal: scoringConfigurations.isDefaultProposal,
        createdAt: scoringConfigurations.createdAt,
      })
      .from(scoringConfigurations)
      .where(eq(scoringConfigurations.programmeId, parsedId.data))
      .orderBy(desc(scoringConfigurations.createdAt))
      .limit(10);

    res.json({ scoringModel: activeModel, history });
  } catch (error) {
    console.error('Error loading scoring configuration:', error);
    res.status(500).json({ error: 'Unable to load scoring configuration.' });
  }
});

/**
 * POST /api/performance/config/:programmeId
 * Saves and activates a new configurable scoring model (weights & thresholds) for a programme.
 * Restricted to super_admin and programme_manager.
 */
router.post(
  '/performance/config/:programmeId',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.programmeId);
      if (!parsedId.success) {
        res.status(400).json({ error: 'Invalid programme identifier.' });
        return;
      }

      const parsedBody = saveConfigSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          error: 'Invalid scoring configuration.',
          details: parsedBody.error.flatten().fieldErrors,
        });
        return;
      }

      const { name, indicators, thresholds } = parsedBody.data;
      const validation = validateScoringModelConfig(
        indicators as ScoringIndicatorConfig[],
        thresholds as ScoringThresholdConfig[]
      );

      if (!validation.valid) {
        res.status(400).json({
          error: validation.errors[0] ?? 'Scoring configuration failed mathematical validation.',
          validationErrors: validation.errors,
        });
        return;
      }

      const progRows = await db
        .select({ id: programmes.id })
        .from(programmes)
        .where(eq(programmes.id, parsedId.data))
        .limit(1);

      if (progRows.length === 0) {
        res.status(404).json({ error: 'Programme not found.' });
        return;
      }

      const currentUser = req.dbUser!;

      await db.transaction(async (tx) => {
        // Deactivate any previous active configurations for this programme
        await tx
          .update(scoringConfigurations)
          .set({ isActive: false })
          .where(eq(scoringConfigurations.programmeId, parsedId.data));

        const insertedConfigs = await tx
          .insert(scoringConfigurations)
          .values({
            programmeId: parsedId.data,
            name,
            isActive: true,
            isDefaultProposal: false,
            createdBy: currentUser.id,
          })
          .returning();

        const newConfig = insertedConfigs[0];

        await tx.insert(performanceIndicators).values(
          indicators.map((ind) => ({
            scoringConfigId: newConfig.id,
            domain: ind.domain,
            label: ind.label,
            weightPct: ind.weightPct.toFixed(2),
            isRequired: ind.isRequired,
          }))
        );

        await tx.insert(scoringThresholds).values(
          thresholds.map((t) => ({
            scoringConfigId: newConfig.id,
            categoryName: t.categoryName,
            minScore: t.minScore.toFixed(2),
            maxScore: t.maxScore.toFixed(2),
            sortOrder: t.sortOrder,
          }))
        );
      });

      const activeModel = await getActiveScoringModel(parsedId.data);
      res.status(201).json({ scoringModel: activeModel });
    } catch (error) {
      console.error('Error saving scoring configuration:', error);
      res.status(500).json({ error: 'Unable to save scoring configuration.' });
    }
  }
);

export default router;
