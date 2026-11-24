import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { participants, userInvitations, users } from '../db/schema.ts';
import {
  type AppRole,
  findUserByEmailWithAuth,
  getAllRoles,
  linkParticipantByEmailIfUnlinked,
  sanitizeUser,
} from '../db/users.ts';
import {
  hashInviteCode,
  hashPassword,
  signSessionToken,
  verifyPassword,
} from '../lib/auth-security.ts';

const router = Router();

const ROLE_DISPLAY: Record<AppRole, string> = {
  super_admin: 'Super Administrator',
  programme_manager: 'Programme Manager',
  facilitator: 'Facilitator / Mentor',
  participant: 'Participant',
};

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Please enter a valid email address.').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128, 'Password is too long.'),
  selectedRole: z.enum(['programme_manager', 'facilitator', 'participant']),
  inviteCode: z.string().trim().max(64).optional(),
});

const signinSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(255),
  password: z.string().min(1, 'Please enter your password.').max(128),
});

router.post('/auth/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid sign-up details.',
    });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const fullName = parsed.data.fullName;
  const selectedRole = parsed.data.selectedRole;
  const rawInviteCode = parsed.data.inviteCode?.trim() || '';

  try {
    const existing = await findUserByEmailWithAuth(normalizedEmail);
    if (existing) {
      res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.',
      });
      return;
    }

    const now = new Date();
    let matchedInvite: typeof userInvitations.$inferSelect | null = null;

    if (rawInviteCode) {
      const codeHash = hashInviteCode(rawInviteCode);
      const [invite] = await db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.codeHash, codeHash))
        .limit(1);

      if (!invite || invite.usedAt !== null || invite.expiresAt <= now) {
        res.status(400).json({
          error:
            'This invite code is invalid, already used, or expired. Ask your Super Administrator for a new code.',
        });
        return;
      }

      if (invite.email.toLowerCase() !== normalizedEmail) {
        res.status(400).json({
          error: 'This invite code was issued for a different email address.',
        });
        return;
      }

      if (invite.role !== selectedRole) {
        res.status(400).json({
          error: `This invite code is assigned to the ${ROLE_DISPLAY[invite.role]} role. Please select that role to continue.`,
        });
        return;
      }

      matchedInvite = invite;
    } else if (selectedRole !== 'participant') {
      // Check whether the Super Admin already pre-authorized this exact email and role
      const [preApproved] = await db
        .select()
        .from(userInvitations)
        .where(
          and(
            sql`LOWER(${userInvitations.email}) = ${normalizedEmail}`,
            eq(userInvitations.role, selectedRole),
            isNull(userInvitations.usedAt),
            gt(userInvitations.expiresAt, now)
          )
        )
        .orderBy(desc(userInvitations.createdAt))
        .limit(1);

      if (preApproved) {
        matchedInvite = preApproved;
      }
    }

    // Security invariant: never grant elevated roles on self-signup without a verified Super Admin invitation
    let assignedRole: AppRole = 'participant';
    let requestedRole: AppRole | null = null;
    let approvalStatus = 'approved';

    if (matchedInvite) {
      assignedRole = matchedInvite.role;
      requestedRole = null;
      approvalStatus = 'approved';
    } else if (selectedRole === 'participant') {
      assignedRole = 'participant';
      requestedRole = null;
      approvalStatus = 'approved';
    } else {
      assignedRole = 'participant';
      requestedRole = selectedRole;
      approvalStatus = 'pending_approval';
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const localUid = `local:${crypto.randomUUID()}`;

    const createdRow = await db.transaction(async (tx) => {
      if (matchedInvite) {
        const consumed = await tx
          .update(userInvitations)
          .set({ usedAt: new Date() })
          .where(
            and(eq(userInvitations.id, matchedInvite.id), isNull(userInvitations.usedAt))
          )
          .returning({ id: userInvitations.id });

        if (consumed.length === 0) {
          throw new Error('INVITE_CONFLICT');
        }
      }

      const [inserted] = await tx
        .insert(users)
        .values({
          uid: localUid,
          email: normalizedEmail,
          fullName,
          avatarUrl: null,
          passwordHash,
          authProvider: 'email',
          role: assignedRole,
          requestedRole,
          approvalStatus,
          isActive: true,
          lastLoginAt: new Date(),
        })
        .returning();

      if (matchedInvite) {
        await tx
          .update(userInvitations)
          .set({ usedBy: inserted.id })
          .where(eq(userInvitations.id, matchedInvite.id));
      }

      return inserted;
    });

    await linkParticipantByEmailIfUnlinked(createdRow.id, normalizedEmail);

    const publicUser = sanitizeUser(createdRow);
    const token = signSessionToken({
      sub: publicUser.id,
      uid: publicUser.uid,
      email: publicUser.email,
    });

    const roleRows = await getAllRoles();
    const roleMetadata = roleRows.find((r) => r.name === publicUser.role) ?? null;

    let linkedParticipant = null;
    if (publicUser.role === 'participant') {
      const pRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, publicUser.id))
        .limit(1);
      linkedParticipant = pRows[0] ?? null;
    }

    res.status(201).json({
      token,
      user: publicUser,
      roleMetadata,
      linkedParticipant,
      pendingRoleApproval: publicUser.approvalStatus === 'pending_approval',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_CONFLICT') {
      res.status(409).json({
        error: 'This invite code has already been used. Please request a fresh code.',
      });
      return;
    }
    const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === '23505') {
      res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.',
      });
      return;
    }
    console.error('Error during email sign-up:', error);
    res.status(500).json({ error: 'Unable to create account. Please try again.' });
  }
});

router.post('/auth/signin', async (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Please enter your email and password.',
    });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const genericAuthError =
    'Invalid email or password. If your account uses Google Sign-In, select Continue with Google.';

  try {
    const userRow = await findUserByEmailWithAuth(normalizedEmail);
    if (!userRow || !userRow.passwordHash) {
      res.status(401).json({ error: genericAuthError });
      return;
    }

    const valid = await verifyPassword(parsed.data.password, userRow.passwordHash);
    if (!valid) {
      res.status(401).json({ error: genericAuthError });
      return;
    }

    if (!userRow.isActive) {
      res.status(403).json({
        error: 'Your account has been deactivated by an administrator.',
      });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userRow.id))
      .returning();

    await linkParticipantByEmailIfUnlinked(updated.id, normalizedEmail);

    const publicUser = sanitizeUser(updated);
    const token = signSessionToken({
      sub: publicUser.id,
      uid: publicUser.uid,
      email: publicUser.email,
    });

    const roleRows = await getAllRoles();
    const roleMetadata = roleRows.find((r) => r.name === publicUser.role) ?? null;

    let linkedParticipant = null;
    if (publicUser.role === 'participant') {
      const pRows = await db
        .select()
        .from(participants)
        .where(eq(participants.userId, publicUser.id))
        .limit(1);
      linkedParticipant = pRows[0] ?? null;
    }

    res.json({
      token,
      user: publicUser,
      roleMetadata,
      linkedParticipant,
    });
  } catch (error) {
    console.error('Error during email sign-in:', error);
    res.status(500).json({ error: 'Unable to sign in right now. Please try again.' });
  }
});

export default router;
