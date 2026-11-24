import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { participants, userInvitations, users } from '../db/schema.ts';
import {
  findUserByEmailWithAuth,
  getAllRoles,
  getAllUsers,
  linkParticipantByEmailIfUnlinked,
  resolveUserRoleApproval,
  sanitizeUser,
  updateUserActiveStatus,
  updateUserRoleById,
} from '../db/users.ts';
import { generateInviteCode, hashPassword } from '../lib/auth-security.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const updateRoleSchema = z.object({
  role: z.enum(['super_admin', 'programme_manager', 'facilitator', 'participant']),
});

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

const approvalSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});

const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(255),
  role: z.enum(['programme_manager', 'facilitator', 'participant']),
  password: z.string().min(8, 'Temporary password must be at least 8 characters.').max(128),
});

const createInvitationSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(255),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(['programme_manager', 'facilitator', 'participant']),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

// Current authenticated user profile, role permissions, and linked participant record if any
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.dbUser!;
    const roleRows = await getAllRoles();
    const roleMeta = roleRows.find((r) => r.name === currentUser.role) ?? null;

    let linkedParticipant = null;
    if (currentUser.role === 'participant') {
      const pRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, currentUser.id))
        .limit(1);
      linkedParticipant = pRows[0] ?? null;
    }

    res.json({
      user: currentUser,
      roleMetadata: roleMeta,
      linkedParticipant,
    });
  } catch (error) {
    console.error('Error loading /api/me:', error);
    res.status(500).json({ error: 'Unable to load user profile.' });
  }
});

// Role definitions (readable by all authenticated users for transparency)
router.get('/roles', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const allRoles = await getAllRoles();
    res.json({ roles: allRoles });
  } catch (error) {
    console.error('Error loading roles:', error);
    res.status(500).json({ error: 'Unable to load role definitions.' });
  }
});

// Staff directory for facilitator/manager assignment dropdowns
router.get(
  '/staff',
  requireAuth,
  requireRole(['super_admin', 'programme_manager', 'facilitator']),
  async (_req: AuthRequest, res) => {
    try {
      const staff = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(inArray(users.role, ['super_admin', 'programme_manager', 'facilitator']));

      res.json({ staff: staff.filter((s) => s.isActive) });
    } catch (error) {
      console.error('Error loading staff:', error);
      res.status(500).json({ error: 'Unable to load staff directory.' });
    }
  }
);

// Super Admin: list all platform users
router.get('/users', requireAuth, requireRole(['super_admin']), async (_req: AuthRequest, res) => {
  try {
    const allUsers = await getAllUsers();
    res.json({ users: allUsers });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Unable to load user accounts.' });
  }
});

// Super Admin: directly create an active role account with email + password
router.post(
  '/users/create',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid account details.',
      });
      return;
    }

    const normalizedEmail = parsed.data.email.toLowerCase();

    try {
      const existing = await findUserByEmailWithAuth(normalizedEmail);
      if (existing) {
        res.status(409).json({
          error: 'An account with this email address already exists.',
        });
        return;
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const localUid = `local:${crypto.randomUUID()}`;

      const [inserted] = await db
        .insert(users)
        .values({
          uid: localUid,
          email: normalizedEmail,
          fullName: parsed.data.fullName,
          avatarUrl: null,
          passwordHash,
          authProvider: 'email',
          role: parsed.data.role,
          requestedRole: null,
          approvalStatus: 'approved',
          isActive: true,
        })
        .returning();

      if (parsed.data.role === 'participant') {
        await linkParticipantByEmailIfUnlinked(inserted.id, normalizedEmail);
      }

      res.status(201).json({ user: sanitizeUser(inserted) });
    } catch (error) {
      console.error('Error creating role account:', error);
      res.status(500).json({ error: 'Unable to create user account.' });
    }
  }
);

// Super Admin: list role invitations (never exposes code hashes)
router.get(
  '/users/invitations',
  requireAuth,
  requireRole(['super_admin']),
  async (_req: AuthRequest, res) => {
    try {
      const rows = await db
        .select({
          id: userInvitations.id,
          email: userInvitations.email,
          fullName: userInvitations.fullName,
          role: userInvitations.role,
          codePrefix: userInvitations.codePrefix,
          invitedBy: userInvitations.invitedBy,
          invitedByName: users.fullName,
          expiresAt: userInvitations.expiresAt,
          usedAt: userInvitations.usedAt,
          createdAt: userInvitations.createdAt,
        })
        .from(userInvitations)
        .leftJoin(users, eq(userInvitations.invitedBy, users.id))
        .orderBy(desc(userInvitations.createdAt));

      res.json({ invitations: rows });
    } catch (error) {
      console.error('Error listing invitations:', error);
      res.status(500).json({ error: 'Unable to load role invitations.' });
    }
  }
);

// Super Admin: generate a single-use role invitation code
router.post(
  '/users/invitations',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid invitation details.',
      });
      return;
    }

    const normalizedEmail = parsed.data.email.toLowerCase();

    try {
      const existing = await findUserByEmailWithAuth(normalizedEmail);
      if (existing) {
        res.status(409).json({
          error:
            'This email already has a registered account. Update their role directly in the directory below.',
        });
        return;
      }

      const { rawCode, codeHash, codePrefix } = generateInviteCode(parsed.data.role);
      const expiresAt = new Date(
        Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000
      );

      const [created] = await db
        .insert(userInvitations)
        .values({
          email: normalizedEmail,
          fullName: parsed.data.fullName?.trim() || null,
          role: parsed.data.role,
          codeHash,
          codePrefix,
          invitedBy: req.dbUser!.id,
          expiresAt,
        })
        .returning({
          id: userInvitations.id,
          email: userInvitations.email,
          fullName: userInvitations.fullName,
          role: userInvitations.role,
          codePrefix: userInvitations.codePrefix,
          invitedBy: userInvitations.invitedBy,
          expiresAt: userInvitations.expiresAt,
          usedAt: userInvitations.usedAt,
          createdAt: userInvitations.createdAt,
        });

      res.status(201).json({
        invitation: {
          ...created,
          invitedByName: req.dbUser!.fullName,
        },
        inviteCode: rawCode,
      });
    } catch (error) {
      console.error('Error creating role invitation:', error);
      res.status(500).json({ error: 'Unable to create role invitation.' });
    }
  }
);

// Super Admin: revoke an unused invitation
router.delete(
  '/users/invitations/:id',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const inviteId = req.params.id;
    if (!z.string().uuid().safeParse(inviteId).success) {
      res.status(400).json({ error: 'Invalid invitation identifier.' });
      return;
    }

    try {
      const deleted = await db
        .delete(userInvitations)
        .where(and(eq(userInvitations.id, inviteId), isNull(userInvitations.usedAt)))
        .returning({ id: userInvitations.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: 'Unused invitation not found.' });
        return;
      }

      res.json({ revokedId: inviteId });
    } catch (error) {
      console.error('Error revoking invitation:', error);
      res.status(500).json({ error: 'Unable to revoke invitation.' });
    }
  }
);

// Super Admin: approve or reject a pending role request
router.patch(
  '/users/:id/approval',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval decision.' });
      return;
    }

    const targetId = req.params.id;
    if (!z.string().uuid().safeParse(targetId).success) {
      res.status(400).json({ error: 'Invalid user identifier.' });
      return;
    }

    try {
      const updated = await resolveUserRoleApproval(targetId, parsed.data.decision);
      if (!updated) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      console.error('Error resolving role approval:', error);
      res.status(500).json({ error: 'Unable to process role request.' });
    }
  }
);

// Super Admin: change a user's role
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid role selection.' });
      return;
    }

    const targetId = req.params.id;
    if (!z.string().uuid().safeParse(targetId).success) {
      res.status(400).json({ error: 'Invalid user identifier.' });
      return;
    }

    if (targetId === req.dbUser!.id && parsed.data.role !== 'super_admin') {
      res
        .status(400)
        .json({ error: 'You cannot downgrade your own Super Administrator account.' });
      return;
    }

    try {
      const updated = await updateUserRoleById(targetId, parsed.data.role);
      if (!updated) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({ error: 'Unable to update user role.' });
    }
  }
);

// Super Admin: activate or deactivate a user account
router.patch(
  '/users/:id/status',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status payload.' });
      return;
    }

    const targetId = req.params.id;
    if (!z.string().uuid().safeParse(targetId).success) {
      res.status(400).json({ error: 'Invalid user identifier.' });
      return;
    }

    if (targetId === req.dbUser!.id && !parsed.data.isActive) {
      res.status(400).json({ error: 'You cannot deactivate your own account.' });
      return;
    }

    try {
      const updated = await updateUserActiveStatus(targetId, parsed.data.isActive);
      if (!updated) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ error: 'Unable to update account status.' });
    }
  }
);

export default router;
