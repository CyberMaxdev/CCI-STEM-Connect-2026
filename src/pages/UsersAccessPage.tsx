import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Shield } from 'lucide-react';
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Users & Role-Based Access Control
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Assign platform roles and enforce server-side access permissions across Super
          Administrators, Programme Managers, Facilitators, and Participants.
        </p>
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
    </div>
  );
}
