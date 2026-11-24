import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  cohorts,
  learningOutcomes,
  participants,
  programmeObjectives,
  programmes,
  sessions,
  stemTracks,
  users,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const programmeSchema = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft'),
});

const cohortSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacity: z.number().int().positive().max(10000).optional().nullable(),
  status: z.enum(['upcoming', 'active', 'completed']).default('upcoming'),
});

const trackSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(32).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

const objectiveSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  targetMetric: z.string().trim().max(200).optional().nullable(),
  isConfirmed: z.boolean().default(false),
});

const outcomeSchema = z.object({
  objectiveId: z.string().uuid().optional().nullable(),
  code: z.string().trim().min(2).max(32),
  statement: z.string().trim().min(5).max(1000),
  targetProficiencyPct: z.number().min(0).max(100).default(70),
});

const sessionSchema = z.object({
  cohortId: z.string().uuid(),
  trackId: z.string().uuid().optional().nullable(),
  facilitatorId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  deliverables: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
});

// List all programmes with nested summary counts
router.get(
  '/programmes',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (_req: AuthRequest, res) => {
    try {
      const [allProgrammes, allCohorts, allTracks, allObjectives, allOutcomes, allParticipants, allSessions] =
        await Promise.all([
          db.select().from(programmes).orderBy(desc(programmes.createdAt)),
          db.select().from(cohorts).orderBy(asc(cohorts.startDate)),
          db.select().from(stemTracks).orderBy(asc(stemTracks.name)),
          db.select().from(programmeObjectives).orderBy(asc(programmeObjectives.createdAt)),
          db.select().from(learningOutcomes).orderBy(asc(learningOutcomes.code)),
          db.select({ id: participants.id, programmeId: participants.programmeId, cohortId: participants.cohortId }).from(participants),
          db.select({ id: sessions.id, programmeId: sessions.programmeId, status: sessions.status }).from(sessions),
        ]);

      const enriched = allProgrammes.map((prog) => {
        const pCohorts = allCohorts.filter((c) => c.programmeId === prog.id);
        const pTracks = allTracks.filter((t) => t.programmeId === prog.id);
        const pObjectives = allObjectives.filter((o) => o.programmeId === prog.id);
        const pOutcomes = allOutcomes.filter((l) => l.programmeId === prog.id);
        const pParticipants = allParticipants.filter((p) => p.programmeId === prog.id);
        const pSessions = allSessions.filter((s) => s.programmeId === prog.id);

        return {
          ...prog,
          stats: {
            cohortsCount: pCohorts.length,
            tracksCount: pTracks.length,
            objectivesCount: pObjectives.length,
            confirmedObjectivesCount: pObjectives.filter((o) => o.isConfirmed).length,
            outcomesCount: pOutcomes.length,
            participantsCount: pParticipants.length,
            sessionsCount: pSessions.length,
            completedSessionsCount: pSessions.filter((s) => s.status === 'completed').length,
          },
        };
      });

      res.json({ programmes: enriched });
    } catch (error) {
      console.error('Error listing programmes:', error);
      res.status(500).json({ error: 'Unable to load programmes.' });
    }
  }
);

// Create a programme
router.post(
  '/programmes',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const parsed = programmeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid programme fields.', details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.endDate < parsed.data.startDate) {
      res.status(400).json({ error: 'End date must be on or after the start date.' });
      return;
    }

    try {
      const created = await db
        .insert(programmes)
        .values({
          code: parsed.data.code.toUpperCase(),
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          status: parsed.data.status,
          createdBy: req.dbUser!.id,
        })
        .returning();

      res.status(201).json({ programme: created[0] });
    } catch (error: unknown) {
      console.error('Error creating programme:', error);
      const pgErr = error as { code?: string };
      if (pgErr?.code === '23505') {
        res.status(409).json({ error: 'A programme with this code already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to create programme.' });
    }
  }
);

// Get full programme detail including cohorts, tracks, objectives, outcomes, and sessions
router.get(
  '/programmes/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    try {
      const progRows = await db
        .select()
        .from(programmes)
        .where(eq(programmes.id, programmeId))
        .limit(1);

      if (progRows.length === 0) {
        res.status(404).json({ error: 'Programme not found.' });
        return;
      }

      const [
        progCohorts,
        progTracks,
        progObjectives,
        progOutcomes,
        progSessions,
        progParticipants,
        allUsers,
      ] = await Promise.all([
        db
          .select()
          .from(cohorts)
          .where(eq(cohorts.programmeId, programmeId))
          .orderBy(asc(cohorts.startDate)),
        db
          .select()
          .from(stemTracks)
          .where(eq(stemTracks.programmeId, programmeId))
          .orderBy(asc(stemTracks.name)),
        db
          .select()
          .from(programmeObjectives)
          .where(eq(programmeObjectives.programmeId, programmeId))
          .orderBy(asc(programmeObjectives.createdAt)),
        db
          .select()
          .from(learningOutcomes)
          .where(eq(learningOutcomes.programmeId, programmeId))
          .orderBy(asc(learningOutcomes.code)),
        db
          .select()
          .from(sessions)
          .where(eq(sessions.programmeId, programmeId))
          .orderBy(asc(sessions.sessionDate), asc(sessions.startTime)),
        db
          .select({ id: participants.id, cohortId: participants.cohortId, trackId: participants.trackId })
          .from(participants)
          .where(eq(participants.programmeId, programmeId)),
        db
          .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role })
          .from(users),
      ]);

      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const cohortMap = new Map(progCohorts.map((c) => [c.id, c.name]));
      const trackMap = new Map(progTracks.map((t) => [t.id, t.name]));

      res.json({
        programme: progRows[0],
        cohorts: progCohorts.map((c) => ({
          ...c,
          participantCount: progParticipants.filter((p) => p.cohortId === c.id).length,
        })),
        tracks: progTracks.map((t) => ({
          ...t,
          participantCount: progParticipants.filter((p) => p.trackId === t.id).length,
        })),
        objectives: progObjectives,
        outcomes: progOutcomes,
        sessions: progSessions.map((s) => ({
          ...s,
          cohortName: cohortMap.get(s.cohortId) ?? 'Unknown Cohort',
          trackName: s.trackId ? (trackMap.get(s.trackId) ?? null) : null,
          facilitatorName: s.facilitatorId ? (userMap.get(s.facilitatorId)?.fullName ?? null) : null,
        })),
      });
    } catch (error) {
      console.error('Error loading programme details:', error);
      res.status(500).json({ error: 'Unable to load programme details.' });
    }
  }
);

// Update programme status or metadata
router.patch(
  '/programmes/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = programmeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid programme update fields.' });
      return;
    }

    try {
      const existing = await db
        .select()
        .from(programmes)
        .where(eq(programmes.id, programmeId))
        .limit(1);

      if (existing.length === 0) {
        res.status(404).json({ error: 'Programme not found.' });
        return;
      }

      const nextStart = parsed.data.startDate ?? existing[0].startDate;
      const nextEnd = parsed.data.endDate ?? existing[0].endDate;
      if (nextEnd < nextStart) {
        res.status(400).json({ error: 'End date must be on or after start date.' });
        return;
      }

      const updated = await db
        .update(programmes)
        .set({
          ...parsed.data,
          ...(parsed.data.code ? { code: parsed.data.code.toUpperCase() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(programmes.id, programmeId))
        .returning();

      res.json({ programme: updated[0] });
    } catch (error: unknown) {
      console.error('Error updating programme:', error);
      const pgErr = error as { code?: string };
      if (pgErr?.code === '23505') {
        res.status(409).json({ error: 'A programme with this code already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to update programme.' });
    }
  }
);

// ---- COHORTS ----
router.post(
  '/programmes/:id/cohorts',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = cohortSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cohort details.' });
      return;
    }

    if (parsed.data.endDate < parsed.data.startDate) {
      res.status(400).json({ error: 'Cohort end date must be on or after start date.' });
      return;
    }

    try {
      const created = await db
        .insert(cohorts)
        .values({
          programmeId,
          name: parsed.data.name,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          capacity: parsed.data.capacity ?? null,
          status: parsed.data.status,
        })
        .returning();
      res.status(201).json({ cohort: created[0] });
    } catch (error) {
      console.error('Error creating cohort:', error);
      res.status(500).json({ error: 'Unable to create cohort.' });
    }
  }
);

router.patch(
  '/cohorts/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const cohortId = req.params.id;
    if (!z.string().uuid().safeParse(cohortId).success) {
      res.status(400).json({ error: 'Invalid cohort identifier.' });
      return;
    }

    const parsed = cohortSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cohort update.' });
      return;
    }

    try {
      const updated = await db
        .update(cohorts)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(cohorts.id, cohortId))
        .returning();
      if (updated.length === 0) {
        res.status(404).json({ error: 'Cohort not found.' });
        return;
      }
      res.json({ cohort: updated[0] });
    } catch (error) {
      console.error('Error updating cohort:', error);
      res.status(500).json({ error: 'Unable to update cohort.' });
    }
  }
);

// ---- STEM TRACKS ----
router.post(
  '/programmes/:id/tracks',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid STEM track details.' });
      return;
    }

    try {
      const created = await db
        .insert(stemTracks)
        .values({
          programmeId,
          name: parsed.data.name,
          code: parsed.data.code ? parsed.data.code.toUpperCase() : null,
          description: parsed.data.description ?? null,
        })
        .returning();
      res.status(201).json({ track: created[0] });
    } catch (error) {
      console.error('Error creating STEM track:', error);
      res.status(500).json({ error: 'Unable to create STEM track.' });
    }
  }
);

router.delete(
  '/tracks/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const trackId = req.params.id;
    if (!z.string().uuid().safeParse(trackId).success) {
      res.status(400).json({ error: 'Invalid STEM track identifier.' });
      return;
    }
    try {
      await db.delete(stemTracks).where(eq(stemTracks.id, trackId));
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting STEM track:', error);
      res.status(500).json({ error: 'Unable to delete STEM track.' });
    }
  }
);

// ---- OBJECTIVES & LEARNING OUTCOMES ----
router.post(
  '/programmes/:id/objectives',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = objectiveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid objective fields.' });
      return;
    }

    try {
      const created = await db
        .insert(programmeObjectives)
        .values({
          programmeId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          targetMetric: parsed.data.targetMetric ?? null,
          isConfirmed: parsed.data.isConfirmed,
        })
        .returning();
      res.status(201).json({ objective: created[0] });
    } catch (error) {
      console.error('Error creating objective:', error);
      res.status(500).json({ error: 'Unable to create objective.' });
    }
  }
);

router.patch(
  '/objectives/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const objectiveId = req.params.id;
    if (!z.string().uuid().safeParse(objectiveId).success) {
      res.status(400).json({ error: 'Invalid objective identifier.' });
      return;
    }

    const parsed = objectiveSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid objective update.' });
      return;
    }

    try {
      const updated = await db
        .update(programmeObjectives)
        .set(parsed.data)
        .where(eq(programmeObjectives.id, objectiveId))
        .returning();
      if (updated.length === 0) {
        res.status(404).json({ error: 'Objective not found.' });
        return;
      }
      res.json({ objective: updated[0] });
    } catch (error) {
      console.error('Error updating objective:', error);
      res.status(500).json({ error: 'Unable to update objective.' });
    }
  }
);

router.post(
  '/programmes/:id/outcomes',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = outcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid learning outcome details.' });
      return;
    }

    try {
      const created = await db
        .insert(learningOutcomes)
        .values({
          programmeId,
          objectiveId: parsed.data.objectiveId ?? null,
          code: parsed.data.code.toUpperCase(),
          statement: parsed.data.statement,
          targetProficiencyPct: parsed.data.targetProficiencyPct.toFixed(2),
        })
        .returning();
      res.status(201).json({ outcome: created[0] });
    } catch (error) {
      console.error('Error creating learning outcome:', error);
      res.status(500).json({ error: 'Unable to create learning outcome.' });
    }
  }
);

router.delete(
  '/objectives/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const objectiveId = req.params.id;
    if (!z.string().uuid().safeParse(objectiveId).success) {
      res.status(400).json({ error: 'Invalid objective identifier.' });
      return;
    }
    try {
      await db.delete(programmeObjectives).where(eq(programmeObjectives.id, objectiveId));
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting objective:', error);
      res.status(500).json({ error: 'Unable to delete objective.' });
    }
  }
);

router.delete(
  '/outcomes/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const outcomeId = req.params.id;
    if (!z.string().uuid().safeParse(outcomeId).success) {
      res.status(400).json({ error: 'Invalid learning outcome identifier.' });
      return;
    }
    try {
      await db.delete(learningOutcomes).where(eq(learningOutcomes.id, outcomeId));
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting learning outcome:', error);
      res.status(500).json({ error: 'Unable to delete learning outcome.' });
    }
  }
);

// ---- SESSIONS ----
router.post(
  '/programmes/:id/sessions',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const programmeId = req.params.id;
    if (!z.string().uuid().safeParse(programmeId).success) {
      res.status(400).json({ error: 'Invalid programme identifier.' });
      return;
    }

    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session fields.' });
      return;
    }

    try {
      // Verify cohort belongs to this programme
      const cohortCheck = await db
        .select({ id: cohorts.id })
        .from(cohorts)
        .where(and(eq(cohorts.id, parsed.data.cohortId), eq(cohorts.programmeId, programmeId)))
        .limit(1);

      if (cohortCheck.length === 0) {
        res.status(400).json({ error: 'Selected cohort does not belong to this programme.' });
        return;
      }

      if (parsed.data.trackId) {
        const trackCheck = await db
          .select({ id: stemTracks.id })
          .from(stemTracks)
          .where(and(eq(stemTracks.id, parsed.data.trackId), eq(stemTracks.programmeId, programmeId)))
          .limit(1);
        if (trackCheck.length === 0) {
          res.status(400).json({ error: 'Selected STEM track does not belong to this programme.' });
          return;
        }
      }

      const created = await db
        .insert(sessions)
        .values({
          programmeId,
          cohortId: parsed.data.cohortId,
          trackId: parsed.data.trackId ?? null,
          facilitatorId: parsed.data.facilitatorId ?? null,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          sessionDate: parsed.data.sessionDate,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          deliverables: parsed.data.deliverables ?? null,
          status: parsed.data.status,
        })
        .returning();

      res.status(201).json({ session: created[0] });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({ error: 'Unable to schedule session.' });
    }
  }
);

router.patch(
  '/sessions/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const sessionId = req.params.id;
    if (!z.string().uuid().safeParse(sessionId).success) {
      res.status(400).json({ error: 'Invalid session identifier.' });
      return;
    }

    const parsed = sessionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session update.' });
      return;
    }

    try {
      const existing = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }

      // Facilitators can only update status/deliverables of their own assigned sessions
      if (
        req.dbUser!.role === 'facilitator' &&
        existing[0].facilitatorId !== req.dbUser!.id
      ) {
        res.status(403).json({ error: 'You can only update sessions assigned to you.' });
        return;
      }

      const updated = await db
        .update(sessions)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId))
        .returning();

      res.json({ session: updated[0] });
    } catch (error) {
      console.error('Error updating session:', error);
      res.status(500).json({ error: 'Unable to update session.' });
    }
  }
);

export default router;
