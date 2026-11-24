import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { participants, roles, userInvitations, users } from './schema.ts';

export type AppRole = 'super_admin' | 'programme_manager' | 'facilitator' | 'participant';

export interface PublicUser {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: AppRole;
  authProvider: string;
  requestedRole: AppRole | null;
  approvalStatus: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const INITIAL_SUPER_ADMIN_EMAIL = 'maxdevconsult@gmail.com';

const PUBLIC_USER_SELECT = {
  id: users.id,
  uid: users.uid,
  email: users.email,
  fullName: users.fullName,
  avatarUrl: users.avatarUrl,
  role: users.role,
  authProvider: users.authProvider,
  requestedRole: users.requestedRole,
  approvalStatus: users.approvalStatus,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export function sanitizeUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    role: row.role,
    authProvider: row.authProvider,
    requestedRole: row.requestedRole,
    approvalStatus: row.approvalStatus,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function linkParticipantByEmailIfUnlinked(userId: string, normalizedEmail: string) {
  const alreadyLinked = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.userId, userId))
    .limit(1);

  if (alreadyLinked.length > 0) return;

  const matchingUnlinked = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        isNull(participants.userId),
        sql`LOWER(${participants.contactEmail}) = ${normalizedEmail}`
      )
    )
    .limit(1);

  if (matchingUnlinked.length > 0) {
    await db
      .update(participants)
      .set({ userId, updatedAt: new Date() })
      .where(eq(participants.id, matchingUnlinked[0].id));
  }
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  const rows = await db
    .select(PUBLIC_USER_SELECT)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmailWithAuth(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function syncAuthenticatedUser(params: {
  uid: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}): Promise<PublicUser> {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const displayName =
      params.fullName?.trim() || normalizedEmail.split('@')[0] || 'Platform User';

    // 1. Check existing account by Firebase UID
    const existingByUid = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid))
      .limit(1);

    if (existingByUid.length > 0) {
      const updated = await db
        .update(users)
        .set({
          email: normalizedEmail,
          fullName: existingByUid[0].fullName || displayName,
          avatarUrl: params.avatarUrl ?? existingByUid[0].avatarUrl,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.uid, params.uid))
        .returning();
      await linkParticipantByEmailIfUnlinked(updated[0].id, normalizedEmail);
      return sanitizeUser(updated[0]);
    }

    // 2. Check existing account by email (e.g. created via email/password or Super Admin)
    const existingByEmail = await findUserByEmailWithAuth(normalizedEmail);
    if (existingByEmail) {
      const nextProvider = existingByEmail.passwordHash ? 'both' : 'google';
      const updated = await db
        .update(users)
        .set({
          uid: params.uid,
          authProvider: nextProvider,
          avatarUrl: params.avatarUrl ?? existingByEmail.avatarUrl,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();
      await linkParticipantByEmailIfUnlinked(updated[0].id, normalizedEmail);
      return sanitizeUser(updated[0]);
    }

    // 3. Determine initial role for brand new Google account
    const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users);
    const shouldBeSuperAdmin =
      normalizedEmail === INITIAL_SUPER_ADMIN_EMAIL || Number(totalUsers) === 0;

    let initialRole: AppRole = shouldBeSuperAdmin ? 'super_admin' : 'participant';
    let matchedInvitationId: string | null = null;

    if (!shouldBeSuperAdmin) {
      const now = new Date();
      const [invite] = await db
        .select()
        .from(userInvitations)
        .where(
          and(
            sql`LOWER(${userInvitations.email}) = ${normalizedEmail}`,
            isNull(userInvitations.usedAt),
            gt(userInvitations.expiresAt, now)
          )
        )
        .orderBy(desc(userInvitations.createdAt))
        .limit(1);

      if (invite) {
        initialRole = invite.role;
        matchedInvitationId = invite.id;
      }
    }

    // Concurrent-safe upsert by uid
    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        fullName: displayName,
        avatarUrl: params.avatarUrl ?? null,
        role: initialRole,
        authProvider: 'google',
        approvalStatus: 'approved',
        isActive: true,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (matchedInvitationId) {
      await db
        .update(userInvitations)
        .set({ usedAt: new Date(), usedBy: inserted[0].id })
        .where(and(eq(userInvitations.id, matchedInvitationId), isNull(userInvitations.usedAt)));
    }

    await linkParticipantByEmailIfUnlinked(inserted[0].id, normalizedEmail);
    return sanitizeUser(inserted[0]);
  } catch (error) {
    console.error('Failed to sync authenticated user:', error);
    throw new Error('Unable to synchronize user account. Please try again.', { cause: error });
  }
}

export async function getAllUsers(): Promise<PublicUser[]> {
  try {
    return await db
      .select(PUBLIC_USER_SELECT)
      .from(users)
      .orderBy(asc(users.fullName));
  } catch (error) {
    console.error('Failed to list users:', error);
    throw new Error('Unable to load user directory.', { cause: error });
  }
}

export async function getAllRoles() {
  try {
    return await db.select().from(roles).orderBy(asc(roles.createdAt));
  } catch (error) {
    console.error('Failed to list roles:', error);
    throw new Error('Unable to load role definitions.', { cause: error });
  }
}

export async function updateUserRoleById(userId: string, newRole: AppRole): Promise<PublicUser | null> {
  try {
    const updated = await db
      .update(users)
      .set({
        role: newRole,
        requestedRole: null,
        approvalStatus: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ? sanitizeUser(updated[0]) : null;
  } catch (error) {
    console.error('Failed to update user role:', error);
    throw new Error('Unable to update user role.', { cause: error });
  }
}

export async function resolveUserRoleApproval(
  userId: string,
  decision: 'approve' | 'reject'
): Promise<PublicUser | null> {
  try {
    const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) return null;

    if (decision === 'approve') {
      const targetRole = existing.requestedRole ?? existing.role;
      const updated = await db
        .update(users)
        .set({
          role: targetRole,
          requestedRole: null,
          approvalStatus: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      return updated[0] ? sanitizeUser(updated[0]) : null;
    }

    const updated = await db
      .update(users)
      .set({
        approvalStatus: 'rejected',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ? sanitizeUser(updated[0]) : null;
  } catch (error) {
    console.error('Failed to resolve role approval:', error);
    throw new Error('Unable to update role approval status.', { cause: error });
  }
}

export async function updateUserActiveStatus(
  userId: string,
  isActive: boolean
): Promise<PublicUser | null> {
  try {
    const updated = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ? sanitizeUser(updated[0]) : null;
  } catch (error) {
    console.error('Failed to update user active status:', error);
    throw new Error('Unable to update user account status.', { cause: error });
  }
}
