'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { useToast } from '@/components/shared/Toast';

interface Role {
  _id: string;
  name: string;
  code: string;
  permissions?: string[];
}

interface EmployeeProfile {
  employeeId: string;
  department?: string;
  designation?: string;
  employmentType?: string;
  joiningDate?: string;
  salary?: number;
  status?: string;
  reportingTo?: { name: string; email: string };
}

interface VendorProfile {
  _id?: string;
  businessId?: string;
  vendorId: string;
  companyName?: string;
  gstNumber?: string;
  panNumber?: string;
  paymentTerms?: string;
  rating?: number;
  contactPerson?: string;
  phone?: string;
  category?: string;
  isApproved?: boolean;
}

interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  createdAt: string;
  roles: Role[];
  employeeProfile?: EmployeeProfile;
  vendorProfile?: VendorProfile;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
  ADMIN: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
  MANAGER: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30' },
  EMPLOYEE: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30' },
  VENDOR: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
  CUSTOMER: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
};

const AVATAR_COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-red-500', 'bg-indigo-500'];

function getRoleColor(code: string) {
  return ROLE_COLORS[code] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value || '—'}</span>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? 'text-yellow-400' : 'text-gray-600'}>★</span>
      ))}
    </div>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'access' | 'activity'>('profile');
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  const { data: userData, isLoading: loading, mutate: refetchUser } = useSWR(
    `/api/admin/users/${id}`
  );
  const user: User | null = userData?.user ?? null;

  // Was fetching "/api/admin/roles" with NO scoping params at all --
  // every role in the entire system (every business, every vendor)
  // was offered in the assign-role picker below, regardless of who
  // this user actually is. Now scoped to this user's own business,
  // and (when the target is a vendor user) unioned with that
  // vendor's own structural roles -- /api/admin/roles itself no
  // longer supports a vendor-only exact-match mode, since that was
  // the cause of a separate bug: a custom role a Super Admin created
  // for the business could never be offered for a vendor user at all.
  const vp = user?.vendorProfile;
  const rolesBusinessId = vp?.businessId || (user as any)?.businessId;
  const rolesQs = (() => {
    const qs = new URLSearchParams();
    if (rolesBusinessId) qs.set('businessId', String(rolesBusinessId));
    if (vp?._id) qs.set('vendorId', String(vp._id));
    return qs.toString();
  })();
  const { data: rolesData } = useSWR(
    user ? `/api/admin/roles${rolesQs ? `?${rolesQs}` : ''}` : null
  );
  const availableRoles: Role[] = rolesData?.roles ?? [];

  async function assignRole() {
    if (!selectedRoleToAssign) return;
    setAssigning(true);
    try {
      const assignRes = await fetch(`/api/users/${id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRoleToAssign }),
      });
      const assignData = await assignRes.json().catch(() => ({}));
      if (!assignRes.ok) {
        toast.error(assignData.error || 'Failed to assign role');
        return;
      }
      refetchUser();
      setSelectedRoleToAssign('');
      toast.success('Role assigned');
    } catch (e) {
      console.error(e);
      toast.error('Failed to connect to server');
    } finally {
      setAssigning(false);
    }
  }

  async function generateTempPassword() {
    setResetting(true);
    setResetMsg('');
    setTempPassword('');
    try {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate' }),
      });
      const d = await res.json();
      if (d.success) {
        setTempPassword(d.temporaryPassword);
        setResetMsg('Temporary password generated. Share it securely — it will not be shown again.');
        toast.success('Temporary password generated');
      } else {
        const message = d.message || 'Failed to reset password';
        setResetMsg(message);
        toast.error(message);
      }
    } catch {
      setResetMsg('Network error');
      toast.error('Network error');
    } finally {
      setResetting(false);
    }
  }

  async function setManualPasswordForUser() {
    if (!manualPassword || manualPassword.length < 6) {
      setResetMsg('Password must be at least 6 characters');
      return;
    }
    setResetting(true);
    setResetMsg('');
    setTempPassword('');
    try {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'set', newPassword: manualPassword }),
      });
      const d = await res.json();
      if (d.success) {
        setResetMsg('Password set. The user must change it on their next login.');
        toast.success('Password updated');
        setManualPassword('');
      } else {
        const message = d.message || 'Failed to reset password';
        setResetMsg(message);
        toast.error(message);
      }
    } catch {
      setResetMsg('Network error');
      toast.error('Network error');
    } finally {
      setResetting(false);
    }
  }

  async function removeRole(roleId: string) {
    try {
      const delRes = await fetch(`/api/users/${id}/roles/${roleId}`, { method: 'DELETE' });
      const delData = await delRes.json().catch(() => ({}));
      if (!delRes.ok) {
        toast.error(delData.error || 'Failed to remove role');
        return;
      }
      refetchUser();
      toast.success('Role removed');
    } catch (e) {
      console.error(e);
      toast.error('Failed to connect to server');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">User not found</p>
          <a href="/console/admin/users" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">← Back to Users</a>
        </div>
      </div>
    );
  }

  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarColor = AVATAR_COLORS[user.name.charCodeAt(0) % AVATAR_COLORS.length];
  const primaryRole = user.roles[0];
  const roleColor = getRoleColor(primaryRole?.code || '');

  // A UserRole whose roleId points at a since-deleted Role document
  // populates as null (e.g. an old role removed/renamed during a Role
  // Sync) -- filter those out before touching .permissions on each entry.
  const allPermissions = user.roles.filter(Boolean).flatMap((r) => r.permissions || []);
  const uniquePermissions = [...new Set(allPermissions)];

  const permissionsByModule: Record<string, string[]> = {};
  uniquePermissions.forEach((perm) => {
    const [module] = perm.split('.');
    const mod = module.charAt(0).toUpperCase() + module.slice(1);
    if (!permissionsByModule[mod]) permissionsByModule[mod] = [];
    permissionsByModule[mod].push(perm);
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      {/* Back button */}
      <a href="/console/admin/users" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Users
      </a>

      {/* User header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-gray-900 text-xl font-bold flex-shrink-0 ${avatarColor}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              {primaryRole && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleColor.bg} ${roleColor.text} ${roleColor.border}`}>
                  {primaryRole.code}
                </span>
              )}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                {user.status}
              </span>
            </div>
            <p className="text-gray-500 mt-1">{user.email}</p>
            {user.employeeProfile?.employeeId && (
              <p className="text-xs text-gray-500 mt-1 font-mono">{user.employeeProfile.employeeId}</p>
            )}
            {user.vendorProfile?.vendorId && (
              <p className="text-xs text-gray-500 mt-1 font-mono">{user.vendorProfile.vendorId}</p>
            )}
          </div>
          <a
            href={`/console/users`}
            onClick={(e) => { e.preventDefault(); /* edit inline */ }}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {(['profile', 'access', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium capitalize transition-colors relative ${activeTab === tab ? 'text-blue-400' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {tab === 'access' ? 'Access & Roles' : tab === 'activity' ? 'Activity Log' : 'Profile'}
            {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Basic Information</h3>
            <div className="space-y-4">
              <InfoRow label="Full Name" value={user.name} />
              <InfoRow label="Email Address" value={user.email} />
              {user.phone && <InfoRow label="Phone" value={user.phone} />}
              <InfoRow label="Role" value={primaryRole?.code} />
              <InfoRow label="Status" value={user.status} />
              <InfoRow label="Member Since" value={new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
          </div>

          {user.employeeProfile && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Employee Details</h3>
              </div>
              <div className="space-y-4">
                <InfoRow label="Employee ID" value={user.employeeProfile.employeeId} />
                <InfoRow label="Department" value={user.employeeProfile.department} />
                <InfoRow label="Designation" value={user.employeeProfile.designation} />
                <InfoRow label="Employment Type" value={user.employeeProfile.employmentType?.replace('_', ' ')} />
                <InfoRow label="Reporting To" value={user.employeeProfile.reportingTo?.name} />
                <InfoRow label="Joining Date" value={user.employeeProfile.joiningDate ? new Date(user.employeeProfile.joiningDate).toLocaleDateString('en-IN') : undefined} />
                <InfoRow label="Employee Status" value={user.employeeProfile.status} />
              </div>
            </div>
          )}

          {user.vendorProfile && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Vendor Details</h3>
              </div>
              <div className="space-y-4">
                <InfoRow label="Vendor ID" value={user.vendorProfile.vendorId} />
                <InfoRow label="Company Name" value={user.vendorProfile.companyName} />
                <InfoRow label="GST Number" value={user.vendorProfile.gstNumber} />
                <InfoRow label="PAN Number" value={user.vendorProfile.panNumber} />
                <InfoRow label="Payment Terms" value={user.vendorProfile.paymentTerms} />
                <InfoRow label="Category" value={user.vendorProfile.category} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-500">Rating</span>
                  <StarRating rating={user.vendorProfile.rating || 0} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-500">Approval Status</span>
                  <span className={`text-sm font-medium ${user.vendorProfile.isApproved ? 'text-green-400' : 'text-yellow-400'}`}>
                    {user.vendorProfile.isApproved ? 'Approved' : 'Pending Approval'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Access & Roles Tab */}
      {activeTab === 'access' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Password Control</h3>
            <p className="text-xs text-gray-500 mb-4">
              The user's actual password can never be viewed — it's stored as a one-way hash. Reset it here instead;
              the user must change it on their next login.
            </p>
            {resetMsg && (
              <div className={`mb-4 rounded-lg px-3 py-2 text-xs ${tempPassword ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700' : 'bg-amber-500/10 border border-amber-500/20 text-amber-700'}`}>
                {resetMsg}
              </div>
            )}
            {tempPassword && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <code className="text-sm font-mono text-gray-900 flex-1">{tempPassword}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(tempPassword)}
                  className="text-xs text-blue-600 hover:underline"
                >Copy</button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={generateTempPassword}
                disabled={resetting}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
              >
                {resetting ? 'Working…' : 'Generate Temporary Password'}
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Set a specific password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={setManualPasswordForUser}
                  disabled={resetting || !manualPassword}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-gray-900 text-sm rounded-lg font-medium transition-colors"
                >
                  Set Password
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Current Roles</h3>
            {user.roles.filter(Boolean).length === 0 ? (
              <p className="text-gray-500 text-sm">No roles assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.roles.filter(Boolean).map((role) => {
                  const rc = getRoleColor(role.code);
                  return (
                    <div key={role._id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${rc.bg} ${rc.border}`}>
                      <span className={`text-xs font-medium ${rc.text}`}>{role.name || role.code}</span>
                      <button
                        onClick={() => removeRole(role._id)}
                        className={`${rc.text} opacity-60 hover:opacity-100 transition-opacity`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Assign Role</h3>
            <div className="flex gap-3">
              <select
                value={selectedRoleToAssign}
                onChange={(e) => setSelectedRoleToAssign(e.target.value)}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Select a role...</option>
                {availableRoles
                  .filter((r) => !user.roles.filter(Boolean).some((ur) => ur._id === r._id))
                  .map((role) => (
                    <option key={role._id} value={role._id}>{role.name || role.code}</option>
                  ))}
              </select>
              <button
                onClick={assignRole}
                disabled={!selectedRoleToAssign || assigning}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 text-sm rounded-lg font-medium transition-colors"
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>

          {uniquePermissions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">
                Permissions
                <span className="ml-2 text-xs font-normal text-gray-500 normal-case">({uniquePermissions.length} total)</span>
              </h3>
              <div className="space-y-4">
                {Object.entries(permissionsByModule).map(([module, perms]) => (
                  <div key={module}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{module}</p>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((perm) => (
                        <span key={perm} className="text-xs bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full font-mono">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center">
          <svg className="w-12 h-12 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 font-medium">No activity recorded yet</p>
          <p className="text-gray-600 text-sm mt-1">User actions and login history will appear here once activity logging is enabled.</p>
        </div>
      )}
    </div>
  );
}
