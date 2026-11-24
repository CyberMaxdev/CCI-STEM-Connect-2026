import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { participants, roles, users } from './schema.ts';

export type AppRole = 'super_admin' | 'programme_manager' | 'facilitator' | 'participant';

const INITIAL_SUPER_ADMIN_EMAIL = 'maxdevconsult@gmail.com';

async function linkParticipantByEmailIfUnlinked(userId: string, normalizedEmail: string) {
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

export async function syncAuthenticatedUser(params: {
  uid: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}) {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const displayName =
      params.fullName?.trim() || normalizedEmail.split('@')[0] || 'Platform User';

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
      return updated[0];
    }

    // Determine initial role: platform owner email or very first user becomes super_admin
    const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users);
    const shouldBeSuperAdmin =
      normalizedEmail === INITIAL_SUPER_ADMIN_EMAIL || Number(totalUsers) === 0;

    const initialRole: AppRole = shouldBeSuperAdmin ? 'super_admin' : 'participant';

    // Concurrent-safe upsert by uid
    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        fullName: displayName,
        avatarUrl: params.avatarUrl ?? null,
        role: initialRole,
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

    await linkParticipantByEmailIfUnlinked(inserted[0].id, normalizedEmail);
    return inserted[0];
  } catch (error) {
    console.error('Failed to sync authenticated user:', error);
    throw new Error('Unable to synchronize user account. Please try again.', { cause: error });
  }
}

export async function getAllUsers() {
  try {
    return await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
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

export async function updateUserRoleById(userId: string, newRole: AppRole) {
  try {
    const updated = await db
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    console.error('Failed to update user role:', error);
    throw new Error('Unable to update user role.', { cause: error });
  }
}

export async function updateUserActiveStatus(userId: string, isActive: boolean) {
  try {
    const updated = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    console.error('Failed to update user active status:', error);
    throw new Error('Unable to update user account status.', { cause: error });
  }
}
