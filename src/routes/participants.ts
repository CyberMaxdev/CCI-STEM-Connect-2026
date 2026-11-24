import { Router } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  assessmentResults,
  assessments,
  attendanceRecords,
  cohorts,
  participants,
  programmes,
  projectSubmissions,
  projects,
  sessions,
  stemTracks,
  users,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const participantCreateSchema = z.object({
  participantCode: z.string().trim().min(2).max(40).optional(),
  fullName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  ageGroup: z.enum(['under_14', '14_17', '18_24', '25_plus']).optional().nullable(),
  educationLevel: z.string().trim().max(120).optional().nullable(),
  programmeId: z.string().uuid(),
  cohortId: z.string().uuid(),
  trackId: z.string().uuid().optional().nullable(),
  assignedFacilitatorId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'completed', 'withdrawn', 'deferred']).default('active'),
  registrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const participantUpdateSchema = participantCreateSchema.partial();

const csvImportSchema = z.object({
  programmeId: z.string().uuid(),
  cohortId: z.string().uuid(),
  defaultTrackId: z.string().uuid().optional().nullable(),
  defaultFacilitatorId: z.string().uuid().optional().nullable(),
  rows: z
    .array(
      z.object({
        participantCode: z.string().trim().max(40).optional(),
        fullName: z.string().trim().min(2).max(160),
        contactEmail: z.string().trim().optional().nullable(),
        ageGroup: z.string().trim().optional().nullable(),
        educationLevel: z.string().trim().max(120).optional().nullable(),
        trackName: z.string().trim().optional().nullable(),
        status: z.string().trim().optional().nullable(),
        registrationDate: z.string().trim().optional().nullable(),
      })
    )
    .min(1)
    .max(500),
});

function generateParticipantCode(indexOffset = 0): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000 + indexOffset)
    .toString()
    .slice(-4);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `CCI-${year}-${suffix}${rand}`;
}

function normalizeAgeGroup(
  raw?: string | null
): 'under_14' | '14_17' | '18_24' | '25_plus' | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'under_14' || cleaned === '<14') return 'under_14';
  if (cleaned === '14_17' || cleaned === '14-17') return '14_17';
  if (cleaned === '18_24' || cleaned === '18-24') return '18_24';
  if (cleaned === '25_plus' || cleaned === '25+') return '25_plus';
  return null;
}

function normalizeParticipantStatus(
  raw?: string | null
): 'active' | 'completed' | 'withdrawn' | 'deferred' {
  if (!raw) return 'active';
  const cleaned = raw.trim().toLowerCase();
  if (
    cleaned === 'active' ||
    cleaned === 'completed' ||
    cleaned === 'withdrawn' ||
    cleaned === 'deferred'
  ) {
    return cleaned;
  }
  return 'active';
}

// List participants (RBAC scoped)
router.get(
  '/participants',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const currentUser = req.dbUser!;
      const programmeId =
        typeof req.query.programmeId === 'string' && req.query.programmeId.length > 0
          ? req.query.programmeId
          : undefined;
      const cohortId =
        typeof req.query.cohortId === 'string' && req.query.cohortId.length > 0
          ? req.query.cohortId
          : undefined;

      const conditions = [];
      if (programmeId && z.string().uuid().safeParse(programmeId).success) {
        conditions.push(eq(participants.programmeId, programmeId));
      }
      if (cohortId && z.string().uuid().safeParse(cohortId).success) {
        conditions.push(eq(participants.cohortId, cohortId));
      }

      // Facilitators see participants assigned to them OR enrolled in cohorts where they facilitate sessions
      let facilitatorAllowedCohortIds: string[] | null = null;
      if (currentUser.role === 'facilitator') {
        const mySessions = await db
          .select({ cohortId: sessions.cohortId })
          .from(sessions)
          .where(eq(sessions.facilitatorId, currentUser.id));
        facilitatorAllowedCohortIds = Array.from(new Set(mySessions.map((s) => s.cohortId)));
      }

      const [allRows, allProgrammes, allCohorts, allTracks, allUsers, allAttendance, allResults] =
        await Promise.all([
          conditions.length > 0
            ? db
                .select()
                .from(participants)
                .where(and(...conditions))
                .orderBy(desc(participants.createdAt))
            : db.select().from(participants).orderBy(desc(participants.createdAt)),
          db.select({ id: programmes.id, title: programmes.title, code: programmes.code }).from(programmes),
          db.select({ id: cohorts.id, name: cohorts.name, programmeId: cohorts.programmeId }).from(cohorts),
          db.select({ id: stemTracks.id, name: stemTracks.name, programmeId: stemTracks.programmeId }).from(stemTracks),
          db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users),
          db.select({ participantId: attendanceRecords.participantId, status: attendanceRecords.status }).from(attendanceRecords),
          db.select({ participantId: assessmentResults.participantId, percentageScore: assessmentResults.percentageScore }).from(assessmentResults),
        ]);

      const scopedRows =
        currentUser.role === 'facilitator'
          ? allRows.filter(
              (p) =>
                p.assignedFacilitatorId === currentUser.id ||
                (facilitatorAllowedCohortIds?.includes(p.cohortId) ?? false)
            )
          : allRows;

      const progMap = new Map(allProgrammes.map((p) => [p.id, p]));
      const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
      const trackMap = new Map(allTracks.map((t) => [t.id, t]));
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      const enriched = scopedRows.map((p) => {
        const pAtt = allAttendance.filter(
          (a) => a.participantId === p.id && a.status !== 'approved_absence'
        );
        const attended = pAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
        const attendanceRate =
          pAtt.length > 0 ? Number(((attended / pAtt.length) * 100).toFixed(1)) : null;

        const pRes = allResults.filter((r) => r.participantId === p.id);
        const avgAssessmentPct =
          pRes.length > 0
            ? Number(
                (
                  pRes.reduce((sum, r) => sum + Number(r.percentageScore), 0) / pRes.length
                ).toFixed(1)
              )
            : null;

        return {
          ...p,
          programmeTitle: progMap.get(p.programmeId)?.title ?? 'Unknown Programme',
          programmeCode: progMap.get(p.programmeId)?.code ?? '',
          cohortName: cohortMap.get(p.cohortId)?.name ?? 'Unknown Cohort',
          trackName: p.trackId ? (trackMap.get(p.trackId)?.name ?? null) : null,
          facilitatorName: p.assignedFacilitatorId
            ? (userMap.get(p.assignedFacilitatorId)?.fullName ?? null)
            : null,
          attendanceRate,
          assessmentsGraded: pRes.length,
          avgAssessmentPct,
        };
      });

      res.json({
        participants: enriched,
        lookups: {
          programmes: allProgrammes,
          cohorts: allCohorts,
          tracks: allTracks,
        },
      });
    } catch (error) {
      console.error('Error listing participants:', error);
      res.status(500).json({ error: 'Unable to load participants.' });
    }
  }
);

// Register single participant
router.post(
  '/participants',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const parsed = participantCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid participant data.', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    try {
      // Validate cohort belongs to selected programme
      const cohortRow = await db
        .select({ id: cohorts.id, programmeId: cohorts.programmeId })
        .from(cohorts)
        .where(and(eq(cohorts.id, data.cohortId), eq(cohorts.programmeId, data.programmeId)))
        .limit(1);

      if (cohortRow.length === 0) {
        res
          .status(400)
          .json({ error: 'The selected cohort does not belong to the selected programme.' });
        return;
      }

      if (data.trackId) {
        const trackRow = await db
          .select({ id: stemTracks.id })
          .from(stemTracks)
          .where(and(eq(stemTracks.id, data.trackId), eq(stemTracks.programmeId, data.programmeId)))
          .limit(1);
        if (trackRow.length === 0) {
          res
            .status(400)
            .json({ error: 'The selected STEM track does not belong to the selected programme.' });
          return;
        }
      }

      // Optionally link to an existing platform user account by email
      let linkedUserId: string | null = null;
      const cleanEmail = data.contactEmail?.trim().toLowerCase() || null;
      if (cleanEmail) {
        const matchedUser = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, cleanEmail))
          .limit(1);
        if (matchedUser.length > 0) {
          const alreadyLinked = await db
            .select({ id: participants.id })
            .from(participants)
            .where(eq(participants.userId, matchedUser[0].id))
            .limit(1);
          if (alreadyLinked.length === 0) {
            linkedUserId = matchedUser[0].id;
          }
        }
      }

      const code = (data.participantCode?.trim() || generateParticipantCode()).toUpperCase();
      const todayIso = new Date().toISOString().slice(0, 10);

      const created = await db
        .insert(participants)
        .values({
          userId: linkedUserId,
          participantCode: code,
          fullName: data.fullName,
          contactEmail: cleanEmail,
          ageGroup: data.ageGroup ?? null,
          educationLevel: data.educationLevel ?? null,
          programmeId: data.programmeId,
          cohortId: data.cohortId,
          trackId: data.trackId ?? null,
          assignedFacilitatorId: data.assignedFacilitatorId ?? null,
          status: data.status,
          registrationDate: data.registrationDate || todayIso,
          notes: data.notes ?? null,
        })
        .returning();

      res.status(201).json({ participant: created[0] });
    } catch (error: unknown) {
      console.error('Error registering participant:', error);
      const pgErr = error as { code?: string };
      if (pgErr?.code === '23505') {
        res.status(409).json({ error: 'A participant with this unique ID already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to register participant.' });
    }
  }
);

// Get full participant profile (with attendance, assessments, projects history)
router.get('/participants/:id', requireAuth, async (req: AuthRequest, res) => {
  const participantId = req.params.id;
  if (!z.string().uuid().safeParse(participantId).success) {
    res.status(400).json({ error: 'Invalid participant identifier.' });
    return;
  }

  try {
    const pRows = await db
      .select()
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);

    if (pRows.length === 0) {
      res.status(404).json({ error: 'Participant not found.' });
      return;
    }

    const participant = pRows[0];
    const currentUser = req.dbUser!;

    // RBAC check
    if (currentUser.role === 'participant' && participant.userId !== currentUser.id) {
      res.status(403).json({ error: 'You can only view your own participant profile.' });
      return;
    }

    if (currentUser.role === 'facilitator' && participant.assignedFacilitatorId !== currentUser.id) {
      const facilitatorCohort = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(eq(sessions.cohortId, participant.cohortId), eq(sessions.facilitatorId, currentUser.id))
        )
        .limit(1);
      if (facilitatorCohort.length === 0) {
        res.status(403).json({ error: 'You do not have access to this participant record.' });
        return;
      }
    }

    const [
      progRows,
      cohortRows,
      trackRows,
      facilitatorRows,
      attRows,
      cohortSessions,
      resRows,
      progAssessments,
      subRows,
      cohortProjects,
    ] = await Promise.all([
      db.select().from(programmes).where(eq(programmes.id, participant.programmeId)).limit(1),
      db.select().from(cohorts).where(eq(cohorts.id, participant.cohortId)).limit(1),
      participant.trackId
        ? db.select().from(stemTracks).where(eq(stemTracks.id, participant.trackId)).limit(1)
        : Promise.resolve([]),
      participant.assignedFacilitatorId
        ? db
            .select({ id: users.id, fullName: users.fullName, email: users.email })
            .from(users)
            .where(eq(users.id, participant.assignedFacilitatorId))
            .limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.participantId, participant.id))
        .orderBy(desc(attendanceRecords.recordedAt)),
      db.select().from(sessions).where(eq(sessions.cohortId, participant.cohortId)),
      db
        .select()
        .from(assessmentResults)
        .where(eq(assessmentResults.participantId, participant.id))
        .orderBy(desc(assessmentResults.gradedAt)),
      db.select().from(assessments).where(eq(assessments.programmeId, participant.programmeId)),
      db
        .select()
        .from(projectSubmissions)
        .where(eq(projectSubmissions.participantId, participant.id)),
      db.select().from(projects).where(eq(projects.cohortId, participant.cohortId)),
    ]);

    const sessionMap = new Map(cohortSessions.map((s) => [s.id, s]));
    const assessmentMap = new Map(progAssessments.map((a) => [a.id, a]));
    const projectMap = new Map(cohortProjects.map((p) => [p.id, p]));

    const countableAttendance = attRows.filter((a) => a.status !== 'approved_absence');
    const attendedCount = countableAttendance.filter(
      (a) => a.status === 'present' || a.status === 'late'
    ).length;
    const attendanceRate =
      countableAttendance.length > 0
        ? Number(((attendedCount / countableAttendance.length) * 100).toFixed(1))
        : null;

    res.json({
      participant: {
        ...participant,
        programmeTitle: progRows[0]?.title ?? 'Unknown Programme',
        programmeCode: progRows[0]?.code ?? '',
        cohortName: cohortRows[0]?.name ?? 'Unknown Cohort',
        trackName: trackRows[0]?.name ?? null,
        facilitatorName: facilitatorRows[0]?.fullName ?? null,
        attendanceRate,
      },
      attendanceHistory: attRows.map((a) => ({
        ...a,
        sessionTitle: sessionMap.get(a.sessionId)?.title ?? 'Session',
        sessionDate: sessionMap.get(a.sessionId)?.sessionDate ?? null,
      })),
      assessmentHistory: resRows.map((r) => {
        const ass = assessmentMap.get(r.assessmentId);
        return {
          ...r,
          assessmentTitle: ass?.title ?? 'Assessment',
          category: ass?.category ?? null,
          indicatorDomain: ass?.indicatorDomain ?? null,
          maxScore: ass?.maxScore ?? null,
        };
      }),
      projectHistory: subRows.map((s) => ({
        ...s,
        projectTitle: projectMap.get(s.projectId)?.title ?? 'STEM Project',
        deadline: projectMap.get(s.projectId)?.deadline ?? null,
      })),
    });
  } catch (error) {
    console.error('Error loading participant profile:', error);
    res.status(500).json({ error: 'Unable to load participant profile.' });
  }
});

// Update participant
router.patch(
  '/participants/:id',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const participantId = req.params.id;
    if (!z.string().uuid().safeParse(participantId).success) {
      res.status(400).json({ error: 'Invalid participant identifier.' });
      return;
    }

    const parsed = participantUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid participant update fields.' });
      return;
    }

    try {
      const existing = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);

      if (existing.length === 0) {
        res.status(404).json({ error: 'Participant not found.' });
        return;
      }

      const targetProgrammeId = parsed.data.programmeId ?? existing[0].programmeId;
      const targetCohortId = parsed.data.cohortId ?? existing[0].cohortId;
      const targetTrackId =
        parsed.data.trackId !== undefined ? parsed.data.trackId : existing[0].trackId;

      const cohortCheck = await db
        .select({ id: cohorts.id })
        .from(cohorts)
        .where(and(eq(cohorts.id, targetCohortId), eq(cohorts.programmeId, targetProgrammeId)))
        .limit(1);

      if (cohortCheck.length === 0) {
        res
          .status(400)
          .json({ error: 'Selected cohort does not belong to the selected programme.' });
        return;
      }

      if (targetTrackId) {
        const trackCheck = await db
          .select({ id: stemTracks.id })
          .from(stemTracks)
          .where(and(eq(stemTracks.id, targetTrackId), eq(stemTracks.programmeId, targetProgrammeId)))
          .limit(1);
        if (trackCheck.length === 0) {
          res
            .status(400)
            .json({ error: 'Selected STEM track does not belong to the selected programme.' });
          return;
        }
      }

      const normalizedEmail =
        parsed.data.contactEmail === ''
          ? null
          : parsed.data.contactEmail?.trim().toLowerCase();

      const updated = await db
        .update(participants)
        .set({
          ...parsed.data,
          ...(parsed.data.contactEmail !== undefined ? { contactEmail: normalizedEmail } : {}),
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participantId))
        .returning();

      res.json({ participant: updated[0] });
    } catch (error) {
      console.error('Error updating participant:', error);
      res.status(500).json({ error: 'Unable to update participant record.' });
    }
  }
);

// Bulk CSV Import into a verified Programme & Cohort
router.post(
  '/participants/import',
  requireAuth,
  requireRole(['super_admin', 'programme_manager']),
  async (req: AuthRequest, res) => {
    const parsed = csvImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid CSV import payload.', details: parsed.error.flatten() });
      return;
    }

    const { programmeId, cohortId, defaultTrackId, defaultFacilitatorId, rows } = parsed.data;

    try {
      // Verify cohort belongs to programme
      const cohortCheck = await db
        .select({ id: cohorts.id })
        .from(cohorts)
        .where(and(eq(cohorts.id, cohortId), eq(cohorts.programmeId, programmeId)))
        .limit(1);

      if (cohortCheck.length === 0) {
        res.status(400).json({ error: 'Selected cohort does not belong to the selected programme.' });
        return;
      }

      const programmeTracks = await db
        .select()
        .from(stemTracks)
        .where(eq(stemTracks.programmeId, programmeId));

      const trackByName = new Map(
        programmeTracks.map((t) => [t.name.trim().toLowerCase(), t.id])
      );

      if (defaultTrackId && !programmeTracks.some((t) => t.id === defaultTrackId)) {
        res.status(400).json({ error: 'Default STEM track does not belong to this programme.' });
        return;
      }

      const candidateCodes = rows
        .map((r) => r.participantCode?.trim().toUpperCase())
        .filter((c): c is string => Boolean(c));

      const existingCodesSet = new Set<string>();
      if (candidateCodes.length > 0) {
        const existingRows = await db
          .select({ participantCode: participants.participantCode })
          .from(participants)
          .where(inArray(participants.participantCode, candidateCodes));
        for (const r of existingRows) {
          existingCodesSet.add(r.participantCode.toUpperCase());
        }
      }

      const [allUsers, linkedParticipants] = await Promise.all([
        db.select({ id: users.id, email: users.email }).from(users),
        db.select({ userId: participants.userId }).from(participants),
      ]);
      const alreadyLinkedUserIds = new Set(
        linkedParticipants.map((p) => p.userId).filter((u): u is string => Boolean(u))
      );
      const userIdByEmail = new Map(
        allUsers
          .filter((u) => !alreadyLinkedUserIds.has(u.id))
          .map((u) => [u.email.trim().toLowerCase(), u.id])
      );

      const todayIso = new Date().toISOString().slice(0, 10);
      const validValues: Array<typeof participants.$inferInsert> = [];
      const rowErrors: Array<{ rowNumber: number; fullName: string; reason: string }> = [];
      const batchSeenCodes = new Set<string>();
      const batchLinkedUsers = new Set<string>();

      rows.forEach((row, index) => {
        const rowNumber = index + 2; // Header is row 1
        const code = (row.participantCode?.trim() || generateParticipantCode(index)).toUpperCase();

        if (existingCodesSet.has(code) || batchSeenCodes.has(code)) {
          rowErrors.push({
            rowNumber,
            fullName: row.fullName,
            reason: `Duplicate participant ID "${code}".`,
          });
          return;
        }

        const cleanEmail = row.contactEmail?.trim().toLowerCase() || null;
        if (cleanEmail && !z.string().email().safeParse(cleanEmail).success) {
          rowErrors.push({
            rowNumber,
            fullName: row.fullName,
            reason: `Invalid email address "${cleanEmail}".`,
          });
          return;
        }

        let resolvedTrackId = defaultTrackId ?? null;
        if (row.trackName && row.trackName.trim().length > 0) {
          const matched = trackByName.get(row.trackName.trim().toLowerCase());
          if (matched) {
            resolvedTrackId = matched;
          }
        }

        let matchedUserId: string | null = null;
        if (cleanEmail) {
          const candidate = userIdByEmail.get(cleanEmail);
          if (candidate && !batchLinkedUsers.has(candidate)) {
            matchedUserId = candidate;
            batchLinkedUsers.add(candidate);
          }
        }

        const regDate =
          row.registrationDate && /^\d{4}-\d{2}-\d{2}$/.test(row.registrationDate.trim())
            ? row.registrationDate.trim()
            : todayIso;

        batchSeenCodes.add(code);
        validValues.push({
          userId: matchedUserId,
          participantCode: code,
          fullName: row.fullName.trim(),
          contactEmail: cleanEmail,
          ageGroup: normalizeAgeGroup(row.ageGroup),
          educationLevel: row.educationLevel?.trim() || null,
          programmeId,
          cohortId,
          trackId: resolvedTrackId,
          assignedFacilitatorId: defaultFacilitatorId ?? null,
          status: normalizeParticipantStatus(row.status),
          registrationDate: regDate,
        });
      });

      let insertedCount = 0;
      if (validValues.length > 0) {
        const inserted = await db.transaction(async (tx) => {
          return await tx.insert(participants).values(validValues).returning({ id: participants.id });
        });
        insertedCount = inserted.length;
      }

      res.status(201).json({
        importedCount: insertedCount,
        skippedCount: rowErrors.length,
        errors: rowErrors,
      });
    } catch (error) {
      console.error('Error importing participants CSV:', error);
      res.status(500).json({ error: 'Unable to complete CSV participant import.' });
    }
  }
);

export default router;
