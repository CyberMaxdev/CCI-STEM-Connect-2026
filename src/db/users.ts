import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { participants, roles, users } from './schema.ts';

export type AppRole = 'super_admin' | 'programme_manager' | 'facilitator' | 'participant';
export type SelfRegisterableRole = 'programme_manager' | 'facilitator' | 'participant';

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

    // Check if Super Admin pre-provisioned this email before first sign-in
    const existingByEmail = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    if (existingByEmail.length > 0) {
      const updated = await db
        .update(users)
        .set({
          uid: params.uid,
          fullName: params.fullName?.trim() || existingByEmail[0].fullName || displayName,
          avatarUrl: params.avatarUrl ?? existingByEmail[0].avatarUrl,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail[0].id))
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

/**
 * Registers a newly created Email/Password user with their selected non-admin role.
 * Never allows self-assignment of super_admin and never permits existing established accounts
 * to escalate their own role via this endpoint.
 */
export async function registerUserProfileWithRole(params: {
  uid: string;
  email: string;
  fullName: string;
  requestedRole: SelfRegisterableRole;
}) {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const cleanName = params.fullName.trim() || normalizedEmail.split('@')[0] || 'Platform User';

    // Check existing record by UID
    const existingByUid = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid))
      .limit(1);

    if (existingByUid.length > 0) {
      const existing = existingByUid[0];
      // Prevent privilege escalation on established accounts; only allow setting initial role within 2 minutes of creation
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      const canSetInitialRole =
        ageMs <= 120_000 && existing.role === 'participant' && normalizedEmail !== INITIAL_SUPER_ADMIN_EMAIL;

      const updated = await db
        .update(users)
        .set({
          fullName: cleanName,
          role: canSetInitialRole ? params.requestedRole : existing.role,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      await linkParticipantByEmailIfUnlinked(updated[0].id, normalizedEmail);
      return updated[0];
    }

    // Check if pre-provisioned by Super Admin using this email (preserve Super Admin's assigned role!)
    const existingByEmail = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    if (existingByEmail.length > 0) {
      const preAssigned = existingByEmail[0];
      const updated = await db
        .update(users)
        .set({
          uid: params.uid,
          fullName: cleanName || preAssigned.fullName,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, preAssigned.id))
        .returning();
      await linkParticipantByEmailIfUnlinked(updated[0].id, normalizedEmail);
      return updated[0];
    }

    const finalRole: AppRole =
      normalizedEmail === INITIAL_SUPER_ADMIN_EMAIL ? 'super_admin' : params.requestedRole;

    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        fullName: cleanName,
        avatarUrl: null,
        role: finalRole,
        isActive: true,
        lastLoginAt: new Date(),
      })
      .returning();

    await linkParticipantByEmailIfUnlinked(inserted[0].id, normalizedEmail);
    return inserted[0];
  } catch (error) {
    console.error('Failed to register user profile:', error);
    throw new Error('Unable to complete account registration.', { cause: error });
  }
}

export async function preProvisionUserAccount(params: {
  email: string;
  fullName: string;
  role: AppRole;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(users)
      .set({
        fullName: params.fullName.trim() || existing[0].fullName,
        role: params.role,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return { user: updated[0], alreadyExisted: true };
  }

  const inserted = await db
    .insert(users)
    .values({
      uid: `pending:${normalizedEmail}`,
      email: normalizedEmail,
      fullName: params.fullName.trim(),
      avatarUrl: null,
      role: params.role,
      isActive: true,
      lastLoginAt: null,
    })
    .returning();

  return { user: inserted[0], alreadyExisted: false };
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
