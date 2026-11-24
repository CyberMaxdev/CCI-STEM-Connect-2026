import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  cohorts,
  generatedReports,
  learningOutcomes,
  programmeObjectives,
  programmes,
  stemTracks,
  users,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { computeProgrammePerformanceReport } from '../services/performance-service.ts';

const router = Router();
const uuidSchema = z.string().uuid();

const logReportSchema = z.object({
  reportType: z.enum([
    'executive_programme_summary',
    'cohort_performance_report',
    'participant_scorecards_export',
    'impact_and_outcomes_report',
  ]),
  programmeId: z.string().uuid().nullable().optional(),
  filtersApplied: z.record(z.string(), z.unknown()).default({}),
  reportingPeriodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  reportingPeriodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  methodologySnapshot: z.record(z.string(), z.unknown()).default({}),
});

/**
 * GET /api/reports/preview
 * Generates a live evidence-based report payload from PostgreSQL using the unified Performance Engine.
 */
router.get(
  '/reports/preview',
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

      const trackId =
        typeof req.query.trackId === 'string' && req.query.trackId.length > 0
          ? req.query.trackId
          : undefined;

      const periodStart =
        typeof req.query.periodStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.periodStart)
          ? req.query.periodStart
          : undefined;

      const periodEnd =
        typeof req.query.periodEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.periodEnd)
          ? req.query.periodEnd
          : undefined;

      if (!programmeId) {
        res.json({
          report: null,
          objectives: [],
          learningOutcomes: [],
          history: [],
          filterOptions: { programmes: [], cohorts: [], tracks: [] },
        });
        return;
      }

      if (
        !uuidSchema.safeParse(programmeId).success ||
        (cohortId && !uuidSchema.safeParse(cohortId).success) ||
        (trackId && !uuidSchema.safeParse(trackId).success)
      ) {
        res.status(400).json({ error: 'Invalid report filter identifiers.' });
        return;
      }

      const [
        perfReport,
        progCohorts,
        progTracks,
        objectives,
        outcomes,
        historyRows,
        allUsers,
      ] = await Promise.all([
        computeProgrammePerformanceReport({
          programmeId,
          cohortId,
          trackId,
          periodStart,
          periodEnd,
        }),
        db
          .select()
          .from(cohorts)
          .where(eq(cohorts.programmeId, programmeId))
          .orderBy(desc(cohorts.startDate)),
        db.select().from(stemTracks).where(eq(stemTracks.programmeId, programmeId)),
        db
          .select()
          .from(programmeObjectives)
          .where(eq(programmeObjectives.programmeId, programmeId)),
        db.select().from(learningOutcomes).where(eq(learningOutcomes.programmeId, programmeId)),
        db
          .select()
          .from(generatedReports)
          .orderBy(desc(generatedReports.generatedAt))
          .limit(20),
        db.select({ id: users.id, fullName: users.fullName }).from(users),
      ]);

      const progMap = new Map(allProgrammes.map((p) => [p.id, p]));
      const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

      res.json({
        report: perfReport,
        objectives,
        learningOutcomes: outcomes,
        history: historyRows.map((h) => ({
          id: h.id,
          reportType: h.reportType,
          programmeId: h.programmeId,
          programmeTitle: h.programmeId ? (progMap.get(h.programmeId)?.title ?? null) : null,
          reportingPeriodStart: h.reportingPeriodStart,
          reportingPeriodEnd: h.reportingPeriodEnd,
          generatedByName: userMap.get(h.generatedBy) ?? 'Administrator',
          generatedAt: h.generatedAt,
          filtersApplied: h.filtersApplied,
        })),
        filterOptions: {
          programmes: allProgrammes.map((p) => ({ id: p.id, code: p.code, title: p.title })),
          cohorts: progCohorts.map((c) => ({ id: c.id, name: c.name })),
          tracks: progTracks.map((t) => ({ id: t.id, name: t.name })),
        },
      });
    } catch (error) {
      console.error('Error building programme report preview:', error);
      res.status(500).json({ error: 'Unable to generate programme report.' });
    }
  }
);

/**
 * POST /api/reports/log
 * Records a generated PDF or CSV report in generated_reports for institutional audit history.
 */
router.post(
  '/reports/log',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = logReportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid report log metadata.' });
        return;
      }

      const d = parsed.data;
      const inserted = await db
        .insert(generatedReports)
        .values({
          reportType: d.reportType,
          programmeId: d.programmeId ?? null,
          filtersApplied: d.filtersApplied,
          reportingPeriodStart: d.reportingPeriodStart ?? null,
          reportingPeriodEnd: d.reportingPeriodEnd ?? null,
          methodologySnapshot: d.methodologySnapshot,
          generatedBy: req.dbUser!.id,
        })
        .returning();

      res.status(201).json({ reportLog: inserted[0] });
    } catch (error) {
      console.error('Error logging generated report:', error);
      res.status(500).json({ error: 'Unable to save report history entry.' });
    }
  }
);

export default router;
