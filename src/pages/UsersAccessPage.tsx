import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Shield, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { type AppRole, ROLE_LABELS, type RoleMetadata, type UserProfile } from '../types';

export function UsersAccessPage() {
  const { user: currentUser, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<RoleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Pre-assign / invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('facilitator');
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, rolesRes] = await Promise.all([
        apiFetch<{ users: UserProfile[] }>('/api/users'),
        apiFetch<{ roles: RoleMetadata[] }>('/api/roles'),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
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
    setTimeout(() => setNotice(null), 4000);
  };

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

  const handlePreAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setInviting(true);
      setError(null);
      await apiFetch('/api/users/invite', {
        method: 'POST',
        body: {
          fullName: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        },
      });
      setShowInviteModal(false);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('facilitator');
      showToast(
        `Role "${ROLE_LABELS[inviteRole]}" pre-assigned. When they sign up or sign in with that email, permissions apply automatically.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pre-assign user role.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Users & Role-Based Access Control
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Assign platform roles, pre-authorize Gmail accounts before first sign-in, and enforce
            server-side permissions across all four roles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4 shrink-0" />
          <span>Pre-Assign Account</span>
        </button>
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
                  <th className="py-3 px-4">Role Assignment</th>
                  <th className="py-3 px-4">Last Sign-In</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isPending = u.uid.startsWith('pending:');
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
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600">
                        {isPending
                          ? 'Awaiting first sign-in'
                          : u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleDateString()
                            : 'Never'}
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

      {/* Pre-Assign Account Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Pre-Assign User Role</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handlePreAssignSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Assign a Gmail or email address to a role in advance. When the user signs up with
                Email & Password or signs in with Google, their account automatically binds to this
                role.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g., David Okafor"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#B5121B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Gmail / Email Address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="david.okafor@gmail.com"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#B5121B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppRole)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#B5121B]"
                >
                  <option value="programme_manager">Programme Manager</option>
                  <option value="facilitator">Facilitator / Mentor</option>
                  <option value="participant">Participant</option>
                  <option value="super_admin">Super Administrator</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 rounded-lg bg-[#B5121B] text-white text-sm font-semibold hover:bg-[#8F0E15] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {inviting ? 'Saving...' : 'Save Pre-Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
