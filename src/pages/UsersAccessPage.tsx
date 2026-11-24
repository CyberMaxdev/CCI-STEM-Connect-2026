import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  type AppRole,
  ROLE_LABELS,
  type RoleMetadata,
  type UserInvitationItem,
  type UserProfile,
} from '../types';

type ProvisionRole = 'programme_manager' | 'facilitator' | 'participant';

const AUTH_METHOD_LABELS: Record<string, string> = {
  google: 'Google',
  email: 'Email & Password',
  both: 'Google + Email',
};

export function UsersAccessPage() {
  const { user: currentUser, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<RoleMetadata[]>([]);
  const [invitations, setInvitations] = useState<UserInvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Create Role Account modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<ProvisionRole>('programme_manager');
  const [createPassword, setCreatePassword] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Invite with Role Code modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<ProvisionRole>('programme_manager');
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{
    code: string;
    email: string;
    role: AppRole;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, rolesRes, invitesRes] = await Promise.all([
        apiFetch<{ users: UserProfile[] }>('/api/users'),
        apiFetch<{ roles: RoleMetadata[] }>('/api/roles'),
        apiFetch<{ invitations: UserInvitationItem[] }>('/api/users/invitations'),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
      setInvitations(invitesRes.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load user directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const pendingApprovals = users.filter(
    (u) => u.approvalStatus === 'pending_approval' && u.requestedRole
  );

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    try {
      setSavingId(userId);
      setError(null);
      await apiFetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      showToast(`Role updated to ${ROLE_LABELS[newRole]}.`);
      await loadData();
      if (userId === currentUser?.id) {
        await refreshProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user role.');
    } finally {
      setSavingId(null);
    }
  };

  const handleApproval = async (target: UserProfile, decision: 'approve' | 'reject') => {
    try {
      setSavingId(target.id);
      setError(null);
      await apiFetch(`/api/users/${target.id}/approval`, {
        method: 'PATCH',
        body: { decision },
      });
      showToast(
        decision === 'approve' && target.requestedRole
          ? `Approved ${target.fullName} as ${ROLE_LABELS[target.requestedRole]}.`
          : `Role request for ${target.fullName} was declined. Account remains Participant.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process role request.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (target: UserProfile) => {
    try {
      setSavingId(target.id);
      setError(null);
      await apiFetch(`/api/users/${target.id}/status`, {
        method: 'PATCH',
        body: { isActive: !target.isActive },
      });
      showToast(
        !target.isActive
          ? `${target.fullName}'s account has been reactivated.`
          : `${target.fullName}'s account has been deactivated.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update account status.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingCreate(true);
      setError(null);
      await apiFetch('/api/users/create', {
        method: 'POST',
        body: {
          fullName: createFullName.trim(),
          email: createEmail.trim(),
          role: createRole,
          password: createPassword,
        },
      });
      setShowCreateModal(false);
      setCreateFullName('');
      setCreateEmail('');
      setCreatePassword('');
      showToast(`Created active ${ROLE_LABELS[createRole]} account for ${createEmail.trim()}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create role account.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingInvite(true);
      setError(null);
      setCopiedCode(false);
      const res = await apiFetch<{
        invitation: UserInvitationItem;
        inviteCode: string;
      }>('/api/users/invitations', {
        method: 'POST',
        body: {
          email: inviteEmail.trim(),
          fullName: inviteFullName.trim() || undefined,
          role: inviteRole,
          expiresInDays: inviteExpiryDays,
        },
      });
      setGeneratedCode({
        code: res.inviteCode,
        email: res.invitation.email,
        role: res.invitation.role,
      });
      setInviteEmail('');
      setInviteFullName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate role invitation.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRevokeInvitation = async (inviteId: string) => {
    try {
      setSavingId(inviteId);
      setError(null);
      await apiFetch(`/api/users/invitations/${inviteId}`, { method: 'DELETE' });
      showToast('Invitation revoked.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke invitation.');
    } finally {
      setSavingId(null);
    }
  };

  const copyInviteCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback: user can manually select the code box
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Primary Provisioning Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Users &amp; Role-Based Access Control
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Create accounts, issue single-use role invite codes, and approve Programme Manager,
            Facilitator / Mentor, and Participant access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setGeneratedCode(null);
              setError(null);
              setShowInviteModal(true);
            }}
            className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="w-4 h-4 text-[#B5121B] shrink-0" />
            <span>Generate Role Invite</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowCreateModal(true);
            }}
            className="h-10 px-4 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Create Role Account</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-900 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700" />
          <span>{notice}</span>
        </div>
      )}

      {/* Pending Role Approval Queue */}
      {pendingApprovals.length > 0 && (
        <section className="bg-amber-50/70 rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <h3 className="text-base font-semibold text-amber-950">
                Pending Role Access Requests
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums text-amber-800">
              {pendingApprovals.length} awaiting review
            </span>
          </div>
          <div className="divide-y divide-amber-200/70">
            {pendingApprovals.map((reqUser) => (
              <div
                key={reqUser.id}
                className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/70"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {reqUser.fullName}{' '}
                    <span className="font-normal text-slate-500">({reqUser.email})</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Requested role:{' '}
                    <span className="font-semibold text-[#8F0E15]">
                      {reqUser.requestedRole ? ROLE_LABELS[reqUser.requestedRole] : 'Staff'}
                    </span>{' '}
                    · Currently signed in with Participant access
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={savingId === reqUser.id}
                    onClick={() => handleApproval(reqUser, 'approve')}
                    className="h-9 px-3.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Approve Role</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingId === reqUser.id}
                    onClick={() => handleApproval(reqUser, 'reject')}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* User Directory Table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Registered Platform Accounts</h3>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {users.length} accounts
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">User</th>
                  <th className="py-3 px-4">Sign-In Method</th>
                  <th className="py-3 px-4">Role Assignment</th>
                  <th className="py-3 px-4">Last Sign-In</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900">
                          {u.fullName}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-[#B5121B]">(You)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        {u.approvalStatus === 'pending_approval' && u.requestedRole && (
                          <p className="text-xs text-amber-700 font-medium mt-0.5">
                            Pending request: {ROLE_LABELS[u.requestedRole]}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {AUTH_METHOD_LABELS[u.authProvider ?? 'google'] ?? 'Google'}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Role for ${u.fullName}`}
                          value={u.role}
                          disabled={isSelf || savingId === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as AppRole)}
                          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="super_admin">Super Administrator</option>
                          <option value="programme_manager">Programme Manager</option>
                          <option value="facilitator">Facilitator / Mentor</option>
                          <option value="participant">Participant</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-medium ${
                            u.isActive ? 'text-teal-700' : 'text-rose-700'
                          }`}
                        >
                          {u.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          type="button"
                          disabled={isSelf || savingId === u.id}
                          onClick={() => handleToggleActive(u)}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                        >
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Role Invitations Table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Role Invitation Codes</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Single-use invite codes grant immediate Programme Manager or Facilitator activation
              upon Sign Up (or Google Sign-In with the matching email).
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
            {invitations.length} issued
          </span>
        </div>

        {invitations.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No role invitation codes issued yet. Use{' '}
            <span className="font-medium text-slate-700">Generate Role Invite</span> above to
            invite a Programme Manager, Facilitator / Mentor, or Participant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Invited Email</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Code Reference</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((inv) => {
                  const isExpired = !inv.usedAt && new Date(inv.expiresAt) <= new Date();
                  const statusLabel = inv.usedAt
                    ? 'Redeemed'
                    : isExpired
                      ? 'Expired'
                      : 'Active';
                  const statusColor = inv.usedAt
                    ? 'text-teal-700'
                    : isExpired
                      ? 'text-slate-400'
                      : 'text-[#8F0E15]';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-6">
                        <p className="font-medium text-slate-900">{inv.email}</p>
                        {inv.fullName && (
                          <p className="text-xs text-slate-500">{inv.fullName}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                        {ROLE_LABELS[inv.role]}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {inv.codePrefix}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                      </td>
                      <td className="py-3 px-6 text-right">
                        {!inv.usedAt ? (
                          <button
                            type="button"
                            disabled={savingId === inv.id}
                            onClick={() => handleRevokeInvitation(inv.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Role Permissions Reference */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Shield className="w-4 h-4 text-[#B5121B]" />
          <h3 className="text-base font-semibold text-slate-900">
            Enforced Role Permission Definitions
          </h3>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.map((role) => (
            <div key={role.id} className="pb-4 border-b border-slate-100 md:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-[#8F0E15]">{role.displayName}</h4>
                <span className="text-xs font-mono text-slate-400">{role.name}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">{role.description}</p>
              <p className="mt-2 text-xs font-mono text-slate-500">
                {role.permissions.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Create Role Account Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-account-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 id="create-account-title" className="text-base font-semibold text-slate-900">
                Create Active Role Account
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Provision a ready-to-use Email &amp; Password account with immediate access to the
                selected role.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as ProvisionRole)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                >
                  <option value="programme_manager">Programme Manager</option>
                  <option value="facilitator">Facilitator / Mentor</option>
                  <option value="participant">Participant</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="Dr. Grace Hopper"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="grace@organization.org"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Enter a strong initial password"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="h-9 px-4 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer"
                >
                  {submittingCreate ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Role Invite Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-role-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 id="invite-role-title" className="text-base font-semibold text-slate-900">
                Generate Single-Use Role Invite Code
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {generatedCode ? (
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-lg border border-teal-200 bg-teal-50/70 space-y-2">
                  <p className="text-xs font-semibold text-teal-900">
                    Invite Code Ready (Shown Once)
                  </p>
                  <p className="text-xs text-teal-800">
                    Share this code with <span className="font-semibold">{generatedCode.email}</span>{' '}
                    to activate <span className="font-semibold">{ROLE_LABELS[generatedCode.role]}</span>{' '}
                    access on the Sign Up screen.
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 bg-white border border-teal-200 rounded-md px-3 py-2.5">
                    <code className="text-sm font-mono font-bold tracking-wider text-slate-900 select-all">
                      {generatedCode.code}
                    </code>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      className="h-8 px-2.5 rounded-md bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="h-9 px-4 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvitation} className="p-6 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Issue a single-use code bound to an email address and role so the recipient can
                  self-register and immediately receive their assigned permissions.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as ProvisionRole)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    <option value="programme_manager">Programme Manager</option>
                    <option value="facilitator">Facilitator / Mentor</option>
                    <option value="participant">Participant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="manager@organization.org"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Recipient Name (optional)
                    </label>
                    <input
                      type="text"
                      value={inviteFullName}
                      onChange={(e) => setInviteFullName(e.target.value)}
                      placeholder="Full name"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expires In (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={inviteExpiryDays}
                      onChange={(e) => setInviteExpiryDays(Number(e.target.value) || 7)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-slate-900"
                    />
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="h-9 px-4 rounded-lg bg-[#B5121B] text-white text-xs font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer"
                  >
                    {submittingInvite ? 'Generating...' : 'Generate Invite Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
