import { Router } from 'express';
import { inArray, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { participants, users } from '../db/schema.ts';
import {
  getAllRoles,
  getAllUsers,
  preProvisionUserAccount,
  registerUserProfileWithRole,
  updateUserActiveStatus,
  updateUserRoleById,
} from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { type AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

const updateRoleSchema = z.object({
  role: z.enum(['super_admin', 'programme_manager', 'facilitator', 'participant']),
});

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

const registerProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  role: z.enum(['programme_manager', 'facilitator', 'participant']),
});

const preProvisionSchema = z.object({
  email: z.string().trim().email('Provide a valid email address.').max(180),
  fullName: z.string().trim().min(2, 'Full name is required.').max(120),
  role: z.enum(['super_admin', 'programme_manager', 'facilitator', 'participant']),
});

/**
 * POST /api/auth/register-profile
 * Synchronizes a newly created Email/Password Firebase account with their selected
 * non-admin role (programme_manager, facilitator, or participant).
 */
router.post('/auth/register-profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token is required.' });
    return;
  }

  const parsed = registerProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid registration details.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      res.status(403).json({ error: 'An account email address is required.' });
      return;
    }

    const dbUser = await registerUserProfileWithRole({
      uid: decoded.uid,
      email: decoded.email,
      fullName: parsed.data.fullName,
      requestedRole: parsed.data.role,
    });

    if (!dbUser.isActive) {
      res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
      return;
    }

    const roleRows = await getAllRoles();
    const roleMeta = roleRows.find((r) => r.name === dbUser.role) ?? null;

    let linkedParticipant = null;
    if (dbUser.role === 'participant') {
      const pRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, dbUser.id))
        .limit(1);
      linkedParticipant = pRows[0] ?? null;
    }

    res.status(201).json({
      user: dbUser,
      roleMetadata: roleMeta,
      linkedParticipant,
    });
  } catch (error) {
    console.error('Error registering user profile:', error);
    res.status(401).json({ error: 'Unable to verify registration session. Please try again.' });
  }
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

// Super Admin: pre-assign an email address to a specific role prior to first sign-up/sign-in
router.post(
  '/users/invite',
  requireAuth,
  requireRole(['super_admin']),
  async (req: AuthRequest, res) => {
    const parsed = preProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Provide a valid email, full name, and role.',
      });
      return;
    }

    try {
      const result = await preProvisionUserAccount(parsed.data);
      res.status(result.alreadyExisted ? 200 : 201).json(result);
    } catch (error) {
      console.error('Error pre-provisioning user account:', error);
      res.status(500).json({ error: 'Unable to save pre-assigned account.' });
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
