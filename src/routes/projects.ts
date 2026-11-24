import { Router } from 'express';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  cohorts,
  participants,
  programmes,
  projects,
  projectSubmissions,
  stemTracks,
  teamContributions,
  teamMembers,
  teams,
  users,
} from '../db/schema.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();
const uuidSchema = z.string().uuid();

const safeHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((val) => val.startsWith('https://') || val.startsWith('http://'), {
    message: 'Submission link must begin with http:// or https://',
  });

const createProjectSchema = z.object({
  programmeId: z.string().uuid(),
  cohortId: z.string().uuid(),
  trackId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(200),
  objectives: z.string().trim().min(3).max(2000),
  expectedDeliverables: z.string().trim().min(3).max(2000),
  isTeamProject: z.boolean().default(false),
  maxScore: z.number().positive().max(1000).default(100),
  deadline: z.string().min(10),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(200),
        dueDate: z.string().optional(),
        completed: z.boolean().default(false),
      })
    )
    .default([]),
});

const updateMilestonesSchema = z.object({
  milestones: z.array(
    z.object({
      title: z.string().trim().min(2).max(200),
      dueDate: z.string().optional(),
      completed: z.boolean(),
    })
  ),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  participantIds: z.array(z.string().uuid()).min(1),
});

const submitProjectSchema = z.object({
  participantId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  submissionUrl: safeHttpUrlSchema.nullable().optional(),
  status: z.enum(['in_progress', 'submitted']).default('submitted'),
});

const evaluateSubmissionSchema = z.object({
  participantId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  status: z.enum(['evaluated', 'revision_requested']),
  qualityScore: z.number().min(0).max(1000).nullable().optional(),
  feedback: z.string().trim().max(3000).nullable().optional(),
  contributions: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        individualScore: z.number().min(0).max(100),
        collaborationScore: z.number().min(0).max(100).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
    )
    .optional(),
});

/**
 * GET /api/projects
 * Returns role-scoped STEM projects with submission stats and programme/cohort/track lookups.
 */
router.get('/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.dbUser!;

    const [allProgrammes, allCohorts, allTracks, allProjects, allSubmissions] = await Promise.all([
      db.select().from(programmes).orderBy(desc(programmes.createdAt)),
      db.select().from(cohorts).orderBy(desc(cohorts.startDate)),
      db.select().from(stemTracks).orderBy(asc(stemTracks.name)),
      db.select().from(projects).orderBy(desc(projects.deadline)),
      db.select().from(projectSubmissions),
    ]);

    const progMap = new Map(allProgrammes.map((p) => [p.id, p]));
    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const trackMap = new Map(allTracks.map((t) => [t.id, t]));

    let visibleProjects = allProjects;

    if (currentUser.role === 'participant') {
      const myRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, currentUser.id))
        .limit(1);
      const me = myRows[0];
      if (!me) {
        res.json({
          projects: [],
          lookups: { programmes: [], cohorts: [], tracks: [] },
        });
        return;
      }
      visibleProjects = allProjects.filter(
        (proj) =>
          proj.programmeId === me.programmeId &&
          proj.cohortId === me.cohortId &&
          (!proj.trackId || proj.trackId === me.trackId)
      );
    } else if (currentUser.role === 'facilitator') {
      const myLearners = await db
        .select({ cohortId: participants.cohortId })
        .from(participants)
        .where(eq(participants.assignedFacilitatorId, currentUser.id));
      const cohortIds = new Set(myLearners.map((l) => l.cohortId));
      visibleProjects = allProjects.filter(
        (proj) => proj.createdBy === currentUser.id || cohortIds.has(proj.cohortId)
      );
    }

    const formatted = visibleProjects.map((proj) => {
      const subs = allSubmissions.filter((s) => s.projectId === proj.id);
      const submittedCount = subs.filter(
        (s) => s.status === 'submitted' || s.status === 'evaluated'
      ).length;
      const evaluatedCount = subs.filter((s) => s.status === 'evaluated').length;
      return {
        id: proj.id,
        programmeId: proj.programmeId,
        programmeCode: progMap.get(proj.programmeId)?.code ?? '',
        programmeTitle: progMap.get(proj.programmeId)?.title ?? '',
        cohortId: proj.cohortId,
        cohortName: cohortMap.get(proj.cohortId)?.name ?? '',
        trackId: proj.trackId,
        trackName: proj.trackId ? (trackMap.get(proj.trackId)?.name ?? null) : null,
        title: proj.title,
        objectives: proj.objectives,
        expectedDeliverables: proj.expectedDeliverables,
        milestones: proj.milestones ?? [],
        isTeamProject: proj.isTeamProject,
        maxScore: Number(proj.maxScore),
        deadline: proj.deadline,
        submittedCount,
        evaluatedCount,
        totalSubmissions: subs.length,
      };
    });

    res.json({
      projects: formatted,
      lookups:
        currentUser.role === 'participant'
          ? { programmes: [], cohorts: [], tracks: [] }
          : {
              programmes: allProgrammes.map((p) => ({ id: p.id, code: p.code, title: p.title })),
              cohorts: allCohorts.map((c) => ({
                id: c.id,
                name: c.name,
                programmeId: c.programmeId,
              })),
              tracks: allTracks.map((t) => ({
                id: t.id,
                name: t.name,
                programmeId: t.programmeId,
              })),
            },
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Unable to load STEM projects.' });
  }
});

/**
 * POST /api/projects
 * Creates a new individual or team STEM project with milestones.
 */
router.post(
  '/projects',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid project payload.',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const data = parsed.data;
      const cohortRows = await db
        .select()
        .from(cohorts)
        .where(and(eq(cohorts.id, data.cohortId), eq(cohorts.programmeId, data.programmeId)))
        .limit(1);

      if (cohortRows.length === 0) {
        res.status(400).json({ error: 'Selected cohort does not belong to the chosen programme.' });
        return;
      }

      if (data.trackId) {
        const trackRows = await db
          .select()
          .from(stemTracks)
          .where(and(eq(stemTracks.id, data.trackId), eq(stemTracks.programmeId, data.programmeId)))
          .limit(1);
        if (trackRows.length === 0) {
          res
            .status(400)
            .json({ error: 'Selected STEM track does not belong to the chosen programme.' });
          return;
        }
      }

      const deadlineDate = new Date(data.deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        res.status(400).json({ error: 'Invalid project deadline date.' });
        return;
      }

      const inserted = await db
        .insert(projects)
        .values({
          programmeId: data.programmeId,
          cohortId: data.cohortId,
          trackId: data.trackId ?? null,
          title: data.title,
          objectives: data.objectives,
          expectedDeliverables: data.expectedDeliverables,
          milestones: data.milestones,
          isTeamProject: data.isTeamProject,
          maxScore: data.maxScore.toFixed(2),
          deadline: deadlineDate,
          createdBy: req.dbUser!.id,
        })
        .returning();

      res.status(201).json({ project: inserted[0] });
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Unable to create project.' });
    }
  }
);

/**
 * PATCH /api/projects/:id/milestones
 * Updates project milestone completion status.
 */
router.patch(
  '/projects/:id/milestones',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        res.status(400).json({ error: 'Invalid project identifier.' });
        return;
      }
      const parsed = updateMilestonesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid milestones payload.' });
        return;
      }

      const updated = await db
        .update(projects)
        .set({ milestones: parsed.data.milestones })
        .where(eq(projects.id, parsedId.data))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      res.json({ project: updated[0] });
    } catch (error) {
      console.error('Error updating milestones:', error);
      res.status(500).json({ error: 'Unable to update milestones.' });
    }
  }
);

/**
 * GET /api/projects/:id
 * Returns full project details, teams, eligible learners, submissions, and facilitator feedback.
 */
router.get('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid project identifier.' });
      return;
    }

    const currentUser = req.dbUser!;
    const projRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, parsedId.data))
      .limit(1);

    const project = projRows[0];
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const [
      progRows,
      cohortRows,
      trackRows,
      cohortParticipants,
      projectTeams,
      submissions,
      staffUsers,
    ] = await Promise.all([
      db.select().from(programmes).where(eq(programmes.id, project.programmeId)).limit(1),
      db.select().from(cohorts).where(eq(cohorts.id, project.cohortId)).limit(1),
      project.trackId
        ? db.select().from(stemTracks).where(eq(stemTracks.id, project.trackId)).limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(participants)
        .where(eq(participants.cohortId, project.cohortId))
        .orderBy(asc(participants.fullName)),
      db.select().from(teams).where(eq(teams.projectId, project.id)).orderBy(asc(teams.name)),
      db.select().from(projectSubmissions).where(eq(projectSubmissions.projectId, project.id)),
      db.select({ id: users.id, fullName: users.fullName }).from(users),
    ]);

    const teamIds = projectTeams.map((t) => t.id);
    const submissionIds = submissions.map((s) => s.id);

    const [memberRows, contribRows] = await Promise.all([
      teamIds.length > 0
        ? db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds))
        : Promise.resolve([]),
      submissionIds.length > 0
        ? db
            .select()
            .from(teamContributions)
            .where(inArray(teamContributions.submissionId, submissionIds))
        : Promise.resolve([]),
    ]);

    const eligibleParticipants = cohortParticipants.filter(
      (p) => !project.trackId || p.trackId === project.trackId
    );
    const participantMap = new Map(cohortParticipants.map((p) => [p.id, p]));
    const staffMap = new Map(staffUsers.map((u) => [u.id, u.fullName]));

    let myParticipantId: string | null = null;
    if (currentUser.role === 'participant') {
      const me = eligibleParticipants.find((p) => p.userId === currentUser.id);
      if (!me) {
        res.status(403).json({ error: 'You are not enrolled in this project cohort.' });
        return;
      }
      myParticipantId = me.id;
    }

    const formattedTeams = projectTeams
      .map((t) => {
        const members = memberRows
          .filter((m) => m.teamId === t.id)
          .map((m) => {
            const p = participantMap.get(m.participantId);
            return {
              participantId: m.participantId,
              participantCode: p?.participantCode ?? '',
              fullName: p?.fullName ?? 'Participant',
            };
          });
        const sub = submissions.find((s) => s.teamId === t.id) ?? null;
        const contribs = sub
          ? contribRows
              .filter((c) => c.submissionId === sub.id)
              .map((c) => ({
                participantId: c.participantId,
                fullName: participantMap.get(c.participantId)?.fullName ?? 'Participant',
                individualScore: Number(c.individualScore),
                collaborationScore:
                  c.collaborationScore !== null ? Number(c.collaborationScore) : null,
                notes: c.notes,
              }))
          : [];

        return {
          id: t.id,
          name: t.name,
          members,
          submission: sub
            ? {
                id: sub.id,
                submissionUrl: sub.submissionUrl,
                status: sub.status,
                qualityScore: sub.qualityScore !== null ? Number(sub.qualityScore) : null,
                feedback: sub.feedback,
                evaluatedByName: sub.evaluatedBy ? (staffMap.get(sub.evaluatedBy) ?? null) : null,
                submittedAt: sub.submittedAt,
                evaluatedAt: sub.evaluatedAt,
                contributions: contribs,
              }
            : null,
        };
      })
      .filter((t) => !myParticipantId || t.members.some((m) => m.participantId === myParticipantId));

    const visibleParticipants = eligibleParticipants
      .filter((p) => {
        if (myParticipantId) return p.id === myParticipantId;
        if (currentUser.role === 'facilitator') {
          return project.createdBy === currentUser.id || p.assignedFacilitatorId === currentUser.id;
        }
        return true;
      })
      .map((p) => {
        const sub = submissions.find((s) => s.participantId === p.id) ?? null;
        return {
          participantId: p.id,
          participantCode: p.participantCode,
          fullName: p.fullName,
          status: p.status,
          submission: sub
            ? {
                id: sub.id,
                submissionUrl: sub.submissionUrl,
                status: sub.status,
                qualityScore: sub.qualityScore !== null ? Number(sub.qualityScore) : null,
                feedback: sub.feedback,
                evaluatedByName: sub.evaluatedBy ? (staffMap.get(sub.evaluatedBy) ?? null) : null,
                submittedAt: sub.submittedAt,
                evaluatedAt: sub.evaluatedAt,
              }
            : null,
        };
      });

    res.json({
      project: {
        id: project.id,
        programmeId: project.programmeId,
        programmeCode: progRows[0]?.code ?? '',
        programmeTitle: progRows[0]?.title ?? '',
        cohortId: project.cohortId,
        cohortName: cohortRows[0]?.name ?? '',
        trackId: project.trackId,
        trackName: trackRows[0]?.name ?? null,
        title: project.title,
        objectives: project.objectives,
        expectedDeliverables: project.expectedDeliverables,
        milestones: project.milestones ?? [],
        isTeamProject: project.isTeamProject,
        maxScore: Number(project.maxScore),
        deadline: project.deadline,
      },
      teams: formattedTeams,
      participants: visibleParticipants,
      allEligibleLearners:
        currentUser.role === 'participant'
          ? []
          : eligibleParticipants.map((p) => ({
              id: p.id,
              participantCode: p.participantCode,
              fullName: p.fullName,
            })),
    });
  } catch (error) {
    console.error('Error loading project details:', error);
    res.status(500).json({ error: 'Unable to load project details.' });
  }
});

/**
 * POST /api/projects/:id/teams
 * Creates a team for a team project and assigns cohort participants.
 */
router.post(
  '/projects/:id/teams',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        res.status(400).json({ error: 'Invalid project identifier.' });
        return;
      }

      const parsed = createTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide a team name and at least one cohort participant.' });
        return;
      }

      const projRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, parsedId.data))
        .limit(1);
      const project = projRows[0];
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      if (!project.isTeamProject) {
        res.status(400).json({ error: 'Teams can only be created for team-based projects.' });
        return;
      }

      const validMembers = await db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.cohortId, project.cohortId),
            inArray(participants.id, parsed.data.participantIds)
          )
        );

      if (validMembers.length !== parsed.data.participantIds.length) {
        res
          .status(400)
          .json({ error: 'All team members must belong to the project cohort.' });
        return;
      }

      const createdTeam = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(teams)
          .values({
            projectId: project.id,
            name: parsed.data.name,
          })
          .returning();

        const team = inserted[0];
        await tx.insert(teamMembers).values(
          parsed.data.participantIds.map((pid) => ({
            teamId: team.id,
            participantId: pid,
          }))
        );
        return team;
      });

      res.status(201).json({ team: createdTeam });
    } catch (error) {
      console.error('Error creating project team:', error);
      res.status(500).json({ error: 'Unable to create project team.' });
    }
  }
);

/**
 * POST /api/projects/:id/submit
 * Submits or updates deliverable URL for an individual learner or team.
 */
router.post('/projects/:id/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid project identifier.' });
      return;
    }

    const parsed = submitProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid submission details.',
      });
      return;
    }

    const currentUser = req.dbUser!;
    const projRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, parsedId.data))
      .limit(1);
    const project = projRows[0];
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    let targetParticipantId = parsed.data.participantId ?? null;
    let targetTeamId = parsed.data.teamId ?? null;

    if (currentUser.role === 'participant') {
      const myRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, currentUser.id))
        .limit(1);
      const me = myRows[0];
      if (!me || me.cohortId !== project.cohortId) {
        res.status(403).json({ error: 'You are not enrolled in this project cohort.' });
        return;
      }

      if (project.isTeamProject) {
        if (!targetTeamId) {
          res.status(400).json({ error: 'Team ID is required for team project submissions.' });
          return;
        }
        const membership = await db
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, targetTeamId), eq(teamMembers.participantId, me.id)))
          .limit(1);
        if (membership.length === 0) {
          res.status(403).json({ error: 'You can only submit deliverables for your own team.' });
          return;
        }
        targetParticipantId = null;
      } else {
        targetParticipantId = me.id;
        targetTeamId = null;
      }
    } else {
      if (project.isTeamProject) {
        if (!targetTeamId) {
          res.status(400).json({ error: 'Select a team for this team project.' });
          return;
        }
        const teamCheck = await db
          .select({ id: teams.id })
          .from(teams)
          .where(and(eq(teams.id, targetTeamId), eq(teams.projectId, project.id)))
          .limit(1);
        if (teamCheck.length === 0) {
          res.status(400).json({ error: 'Selected team does not belong to this project.' });
          return;
        }
        targetParticipantId = null;
      } else {
        if (!targetParticipantId) {
          res.status(400).json({ error: 'Select a participant for this individual project.' });
          return;
        }
        const learnerCheck = await db
          .select({ id: participants.id })
          .from(participants)
          .where(
            and(
              eq(participants.id, targetParticipantId),
              eq(participants.cohortId, project.cohortId)
            )
          )
          .limit(1);
        if (learnerCheck.length === 0) {
          res.status(400).json({ error: 'Selected participant does not belong to this project cohort.' });
          return;
        }
        targetTeamId = null;
      }
    }

    const existing = await db
      .select()
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.projectId, project.id),
          targetTeamId
            ? eq(projectSubmissions.teamId, targetTeamId)
            : eq(projectSubmissions.participantId, targetParticipantId!)
        )
      )
      .limit(1);

    if (existing[0]) {
      const updated = await db
        .update(projectSubmissions)
        .set({
          submissionUrl: parsed.data.submissionUrl ?? existing[0].submissionUrl,
          status: parsed.data.status,
          submittedAt: parsed.data.status === 'submitted' ? new Date() : existing[0].submittedAt,
        })
        .where(eq(projectSubmissions.id, existing[0].id))
        .returning();
      res.json({ submission: updated[0] });
    } else {
      const inserted = await db
        .insert(projectSubmissions)
        .values({
          projectId: project.id,
          participantId: targetParticipantId,
          teamId: targetTeamId,
          submissionUrl: parsed.data.submissionUrl ?? null,
          status: parsed.data.status,
          submittedAt: parsed.data.status === 'submitted' ? new Date() : null,
        })
        .returning();
      res.status(201).json({ submission: inserted[0] });
    }
  } catch (error) {
    console.error('Error submitting project deliverable:', error);
    res.status(500).json({ error: 'Unable to record project submission.' });
  }
});

/**
 * POST /api/projects/:id/evaluate
 * Evaluates a submission with quality score, structured participant feedback, and optional team contributions.
 */
router.post(
  '/projects/:id/evaluate',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (req: AuthRequest, res) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        res.status(400).json({ error: 'Invalid project identifier.' });
        return;
      }

      const parsed = evaluateSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid evaluation details.',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const projRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, parsedId.data))
        .limit(1);
      const project = projRows[0];
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const maxScore = Number(project.maxScore);
      const { participantId, teamId, status, qualityScore, feedback, contributions } = parsed.data;

      if (qualityScore !== undefined && qualityScore !== null && qualityScore > maxScore) {
        res.status(400).json({
          error: `Quality score (${qualityScore}) cannot exceed project maximum (${maxScore}).`,
        });
        return;
      }

      if (project.isTeamProject) {
        if (!teamId) {
          res.status(400).json({ error: 'Team identifier is required for team project evaluation.' });
          return;
        }
        const teamCheck = await db
          .select({ id: teams.id })
          .from(teams)
          .where(and(eq(teams.id, teamId), eq(teams.projectId, project.id)))
          .limit(1);
        if (teamCheck.length === 0) {
          res.status(400).json({ error: 'Selected team does not belong to this project.' });
          return;
        }
      } else {
        if (!participantId) {
          res
            .status(400)
            .json({ error: 'Participant identifier is required for individual project evaluation.' });
          return;
        }
        const learnerCheck = await db
          .select({ id: participants.id })
          .from(participants)
          .where(
            and(
              eq(participants.id, participantId),
              eq(participants.cohortId, project.cohortId)
            )
          )
          .limit(1);
        if (learnerCheck.length === 0) {
          res.status(400).json({ error: 'Selected participant does not belong to this project cohort.' });
          return;
        }
      }

      const evaluatedBy = req.dbUser!.id;

      const saved = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(projectSubmissions)
          .where(
            and(
              eq(projectSubmissions.projectId, project.id),
              project.isTeamProject
                ? eq(projectSubmissions.teamId, teamId!)
                : eq(projectSubmissions.participantId, participantId!)
            )
          )
          .limit(1);

        let submissionId: string;
        if (existing[0]) {
          const updated = await tx
            .update(projectSubmissions)
            .set({
              status,
              qualityScore:
                qualityScore !== undefined && qualityScore !== null
                  ? qualityScore.toFixed(2)
                  : existing[0].qualityScore,
              feedback: feedback ?? null,
              evaluatedBy,
              evaluatedAt: new Date(),
              submittedAt: existing[0].submittedAt ?? new Date(),
            })
            .where(eq(projectSubmissions.id, existing[0].id))
            .returning();
          submissionId = updated[0].id;
        } else {
          const inserted = await tx
            .insert(projectSubmissions)
            .values({
              projectId: project.id,
              participantId: project.isTeamProject ? null : participantId!,
              teamId: project.isTeamProject ? teamId! : null,
              status,
              qualityScore:
                qualityScore !== undefined && qualityScore !== null
                  ? qualityScore.toFixed(2)
                  : null,
              feedback: feedback ?? null,
              evaluatedBy,
              submittedAt: new Date(),
              evaluatedAt: new Date(),
            })
            .returning();
          submissionId = inserted[0].id;
        }

        if (project.isTeamProject && contributions && contributions.length > 0) {
          for (const contrib of contributions) {
            await tx
              .insert(teamContributions)
              .values({
                submissionId,
                participantId: contrib.participantId,
                individualScore: contrib.individualScore.toFixed(2),
                collaborationScore:
                  contrib.collaborationScore !== undefined && contrib.collaborationScore !== null
                    ? contrib.collaborationScore.toFixed(2)
                    : null,
                notes: contrib.notes ?? null,
              })
              .onConflictDoUpdate({
                target: [teamContributions.submissionId, teamContributions.participantId],
                set: {
                  individualScore: contrib.individualScore.toFixed(2),
                  collaborationScore:
                    contrib.collaborationScore !== undefined && contrib.collaborationScore !== null
                      ? contrib.collaborationScore.toFixed(2)
                      : null,
                  notes: contrib.notes ?? null,
                },
              });
          }
        }

        return submissionId;
      });

      res.json({ submissionId: saved });
    } catch (error) {
      console.error('Error evaluating project submission:', error);
      res.status(500).json({ error: 'Unable to save project evaluation.' });
    }
  }
);

export default router;
