import { Router } from 'express';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  attendanceRecords,
  cohorts,
  participants,
  programmes,
  sessions,
  stemTracks,
  users,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const saveAttendanceSchema = z.object({
  records: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        status: z.enum(['present', 'late', 'approved_absence', 'absent']),
        engagementScore: z.number().min(0).max(10).optional().nullable(),
        observations: z.string().trim().max(1000).optional().nullable(),
      })
    )
    .min(1),
});

async function canFacilitatorAccessSession(
  userId: string,
  role: string,
  sessionRow: { facilitatorId: string | null; cohortId: string }
): Promise<boolean> {
  if (role === 'super_admin' || role === 'programme_manager') return true;
  if (role !== 'facilitator') return false;
  if (sessionRow.facilitatorId === userId) return true;

  // Also allow if facilitator is directly assigned to participants in this cohort
  const assignedInCohort = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.cohortId, sessionRow.cohortId),
        eq(participants.assignedFacilitatorId, userId)
      )
    )
    .limit(1);

  return assignedInCohort.length > 0;
}

// List sessions accessible for attendance marking
router.get(
  '/attendance/sessions',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const currentUser = req.dbUser!;

      const [allSessions, allProgrammes, allCohorts, allTracks, allUsers, allParticipants, allAttendance] =
        await Promise.all([
          db.select().from(sessions).orderBy(desc(sessions.sessionDate), asc(sessions.startTime)),
          db.select({ id: programmes.id, title: programmes.title, code: programmes.code }).from(programmes),
          db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts),
          db.select({ id: stemTracks.id, name: stemTracks.name }).from(stemTracks),
          db.select({ id: users.id, fullName: users.fullName }).from(users),
          db
            .select({
              id: participants.id,
              cohortId: participants.cohortId,
              trackId: participants.trackId,
              assignedFacilitatorId: participants.assignedFacilitatorId,
              status: participants.status,
            })
            .from(participants),
          db.select().from(attendanceRecords),
        ]);

      let visibleSessions = allSessions;
      if (currentUser.role === 'facilitator') {
        const assignedCohortIds = new Set(
          allParticipants
            .filter((p) => p.assignedFacilitatorId === currentUser.id)
            .map((p) => p.cohortId)
        );
        visibleSessions = allSessions.filter(
          (s) => s.facilitatorId === currentUser.id || assignedCohortIds.has(s.cohortId)
        );
      }

      const progMap = new Map(allProgrammes.map((p) => [p.id, p]));
      const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
      const trackMap = new Map(allTracks.map((t) => [t.id, t]));
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      const enriched = visibleSessions.map((s) => {
        const roster = allParticipants.filter(
          (p) =>
            p.cohortId === s.cohortId &&
            p.status !== 'withdrawn' &&
            (!s.trackId || p.trackId === s.trackId)
        );
        const sRecords = allAttendance.filter((r) => r.sessionId === s.id);
        const present = sRecords.filter((r) => r.status === 'present').length;
        const late = sRecords.filter((r) => r.status === 'late').length;
        const approvedAbsence = sRecords.filter((r) => r.status === 'approved_absence').length;
        const absent = sRecords.filter((r) => r.status === 'absent').length;
        const countable = sRecords.length - approvedAbsence;
        const attendanceRate =
          countable > 0 ? Number((((present + late) / countable) * 100).toFixed(1)) : null;

        return {
          ...s,
          programmeTitle: progMap.get(s.programmeId)?.title ?? 'Programme',
          programmeCode: progMap.get(s.programmeId)?.code ?? '',
          cohortName: cohortMap.get(s.cohortId)?.name ?? 'Cohort',
          trackName: s.trackId ? (trackMap.get(s.trackId)?.name ?? null) : null,
          facilitatorName: s.facilitatorId ? (userMap.get(s.facilitatorId)?.fullName ?? null) : null,
          rosterCount: roster.length,
          recordedCount: sRecords.length,
          summary: {
            present,
            late,
            approvedAbsence,
            absent,
            attendanceRate,
          },
        };
      });

      res.json({ sessions: enriched });
    } catch (error) {
      console.error('Error loading attendance sessions:', error);
      res.status(500).json({ error: 'Unable to load sessions for attendance.' });
    }
  }
);

// Get session roster and attendance records
router.get(
  '/attendance/session/:sessionId',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const sessionId = req.params.sessionId;
    if (!z.string().uuid().safeParse(sessionId).success) {
      res.status(400).json({ error: 'Invalid session identifier.' });
      return;
    }

    try {
      const sRows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (sRows.length === 0) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }

      const session = sRows[0];
      const allowed = await canFacilitatorAccessSession(
        req.dbUser!.id,
        req.dbUser!.role,
        session
      );
      if (!allowed) {
        res.status(403).json({ error: 'You are not authorized to manage attendance for this session.' });
        return;
      }

      const participantConditions = [eq(participants.cohortId, session.cohortId)];
      if (session.trackId) {
        participantConditions.push(eq(participants.trackId, session.trackId));
      }

      const [rosterRows, existingRecords, progRow, cohortRow, trackRow] = await Promise.all([
        db
          .select()
          .from(participants)
          .where(and(...participantConditions))
          .orderBy(asc(participants.fullName)),
        db
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, session.id)),
        db.select({ id: programmes.id, title: programmes.title }).from(programmes).where(eq(programmes.id, session.programmeId)).limit(1),
        db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).where(eq(cohorts.id, session.cohortId)).limit(1),
        session.trackId
          ? db.select({ id: stemTracks.id, name: stemTracks.name }).from(stemTracks).where(eq(stemTracks.id, session.trackId)).limit(1)
          : Promise.resolve([]),
      ]);

      const recordByParticipant = new Map(existingRecords.map((r) => [r.participantId, r]));

      const roster = rosterRows
        .filter((p) => p.status !== 'withdrawn' || recordByParticipant.has(p.id))
        .map((p) => {
          const rec = recordByParticipant.get(p.id);
          return {
            participantId: p.id,
            participantCode: p.participantCode,
            fullName: p.fullName,
            participantStatus: p.status,
            attendance: rec
              ? {
                  id: rec.id,
                  status: rec.status,
                  engagementScore: rec.engagementScore !== null ? Number(rec.engagementScore) : null,
                  observations: rec.observations,
                  recordedAt: rec.recordedAt,
                }
              : null,
          };
        });

      const countable = existingRecords.filter((r) => r.status !== 'approved_absence');
      const attended = countable.filter((r) => r.status === 'present' || r.status === 'late').length;
      const attendanceRate =
        countable.length > 0 ? Number(((attended / countable.length) * 100).toFixed(1)) : null;

      res.json({
        session: {
          ...session,
          programmeTitle: progRow[0]?.title ?? 'Programme',
          cohortName: cohortRow[0]?.name ?? 'Cohort',
          trackName: trackRow[0]?.name ?? null,
        },
        roster,
        metrics: {
          totalRoster: roster.length,
          recordedCount: existingRecords.length,
          presentCount: existingRecords.filter((r) => r.status === 'present').length,
          lateCount: existingRecords.filter((r) => r.status === 'late').length,
          approvedAbsenceCount: existingRecords.filter((r) => r.status === 'approved_absence').length,
          absentCount: existingRecords.filter((r) => r.status === 'absent').length,
          attendanceRate,
        },
      });
    } catch (error) {
      console.error('Error loading session attendance:', error);
      res.status(500).json({ error: 'Unable to load session attendance register.' });
    }
  }
);

// Save / upsert attendance records for a session
router.post(
  '/attendance/session/:sessionId',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    const sessionId = req.params.sessionId;
    if (!z.string().uuid().safeParse(sessionId).success) {
      res.status(400).json({ error: 'Invalid session identifier.' });
      return;
    }

    const parsed = saveAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid attendance entries.', details: parsed.error.flatten() });
      return;
    }

    try {
      const sRows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (sRows.length === 0) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }

      const session = sRows[0];
      const allowed = await canFacilitatorAccessSession(
        req.dbUser!.id,
        req.dbUser!.role,
        session
      );
      if (!allowed) {
        res.status(403).json({ error: 'You are not authorized to record attendance for this session.' });
        return;
      }

      // Verify all submitted participants belong to the session's programme & cohort
      const submittedIds = Array.from(new Set(parsed.data.records.map((r) => r.participantId)));
      const validParticipants = await db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            inArray(participants.id, submittedIds),
            eq(participants.cohortId, session.cohortId),
            eq(participants.programmeId, session.programmeId)
          )
        );

      const validIdSet = new Set(validParticipants.map((p) => p.id));
      const invalidIds = submittedIds.filter((id) => !validIdSet.has(id));
      if (invalidIds.length > 0) {
        res.status(400).json({
          error: 'One or more participants do not belong to this session cohort.',
        });
        return;
      }

      const recorderId = req.dbUser!.id;
      const now = new Date();

      await db.transaction(async (tx) => {
        for (const rec of parsed.data.records) {
          const engagementVal =
            rec.engagementScore !== undefined && rec.engagementScore !== null
              ? rec.engagementScore.toFixed(2)
              : null;

          await tx
            .insert(attendanceRecords)
            .values({
              sessionId: session.id,
              participantId: rec.participantId,
              cohortId: session.cohortId,
              programmeId: session.programmeId,
              status: rec.status,
              engagementScore: engagementVal,
              observations: rec.observations?.trim() || null,
              recordedBy: recorderId,
              recordedAt: now,
            })
            .onConflictDoUpdate({
              target: [attendanceRecords.sessionId, attendanceRecords.participantId],
              set: {
                status: rec.status,
                engagementScore: engagementVal,
                observations: rec.observations?.trim() || null,
                recordedBy: recorderId,
                recordedAt: now,
              },
            });
        }
      });

      res.json({
        savedCount: parsed.data.records.length,
        sessionId: session.id,
      });
    } catch (error) {
      console.error('Error saving attendance records:', error);
      res.status(500).json({ error: 'Unable to save attendance records.' });
    }
  }
);

// Participant self-service attendance history
router.get('/attendance/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const pRows = await db
      .select()
      .from(participants)
      .where(eq(participants.userId, req.dbUser!.id))
      .limit(1);

    if (pRows.length === 0) {
      res.json({ records: [], attendanceRate: null });
      return;
    }

    const participant = pRows[0];
    const [records, cohortSessions] = await Promise.all([
      db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.participantId, participant.id))
        .orderBy(desc(attendanceRecords.recordedAt)),
      db.select().from(sessions).where(eq(sessions.cohortId, participant.cohortId)),
    ]);

    const sessionMap = new Map(cohortSessions.map((s) => [s.id, s]));
    const countable = records.filter((r) => r.status !== 'approved_absence');
    const attended = countable.filter((r) => r.status === 'present' || r.status === 'late').length;
    const attendanceRate =
      countable.length > 0 ? Number(((attended / countable.length) * 100).toFixed(1)) : null;

    res.json({
      attendanceRate,
      records: records.map((r) => ({
        ...r,
        sessionTitle: sessionMap.get(r.sessionId)?.title ?? 'Session',
        sessionDate: sessionMap.get(r.sessionId)?.sessionDate ?? null,
      })),
    });
  } catch (error) {
    console.error('Error loading participant attendance:', error);
    res.status(500).json({ error: 'Unable to load your attendance history.' });
  }
});

export default router;
