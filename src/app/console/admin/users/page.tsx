'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { UserPlus, Search, UserCog, Loader2, Edit2, Eye, Trash2 } from 'lucide-react';

interface Role { _id: string; name: string; code: string }
interface EmployeeProfile { employeeId: string; department?: string; designation?: string; employmentType?: string; joiningDate?: string }
interface VendorProfile { vendorId: string; companyName?: string; gstNumber?: string }
interface User {
  _id: string; name: string; email: string; username?: string; isActive: boolean; createdAt: string;
  roles: Role[]; employeeProfile?: EmployeeProfile; vendorProfile?: VendorProfile;
}
interface Stats { total: number; active: number; employees: number; vendors: number; customers: number }
interface Vendor { _id: string; vendorId: string; companyName?: string }
interface StaffSlot {
  _id: string; designation: string; status: 'ACTIVE' | 'INACTIVE';
  userId?: { _id: string; name: string; email: string; username?: string } | null;
}

const DESIGNATION_LABELS: Record<string, string> = {
  MANAGER: 'Manager', CCO: 'CCO', ENGINEER: 'Engineer',
  WAREHOUSE_MANAGER: 'Warehouse Manager', TELECALLER: 'Telecaller',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 border border-purple-200',
  ADMIN:       'bg-red-100 text-red-700 border border-red-200',
  MANAGER:     'bg-orange-100 text-orange-700 border border-orange-200',
  EMPLOYEE:    'bg-blue-100 text-blue-700 border border-blue-200',
  VENDOR:      'bg-green-100 text-green-700 border border-green-200',
  CUSTOMER:    'bg-gray-100 text-gray-600 border border-gray-200',
};

const AVATAR_COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-red-500', 'bg-indigo-500'];
const getAvatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const getRoleColor   = (code: string) => ROLE_COLORS[code] || 'bg-gray-100 text-gray-600 border border-gray-200';

const TABS = ['All', 'Employees', 'Vendors', 'Customers', 'Admins'];
const TAB_ROLE_MAP: Record<string, string> = {
  Employees: 'EMPLOYEE', Vendors: 'VENDOR', Customers: 'CUSTOMER', Admins: 'ADMIN',
};

export default function UsersPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab]   = useState('All');
  const [showPanel, setShowPanel]   = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '', email: '', role: 'EMPLOYEE',
    department: '', designation: '', employmentType: 'FULL_TIME', joiningDate: '',
    companyName: '', gstNumber: '', contactPerson: '', phone: '', businessId: '',
  });

  // Assign panel -- every user must already exist (created themselves via
  // customer registration); this searches for that existing account by
  // name/email/User ID and only then lets an admin tag a designation +
  // business/vendor onto it. Minting a brand-new identity from the admin
  // panel is deliberately no longer possible here.
  const [assignSearch, setAssignSearch] = useState('');
  const [assignResults, setAssignResults] = useState<User[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);

  // Vendor-staff tagging -- once a business is chosen, list its vendors;
  // once a vendor is chosen, list that vendor's 5 designation slots
  // (auto-provisioned at vendor finalization -- see vendors/[id]/finalize)
  // so the admin can tag the selected user into an open (INACTIVE) one.
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [tagSuccess, setTagSuccess] = useState('');
  const [tagging, setTagging] = useState<string | null>(null);
  const [tagError, setTagError] = useState('');
  // Super Admin can now also grant the real role directly (extends the
  // vendor Owner's own grant flow rather than replacing it) -- scoped to
  // this vendor's own generated role set only, same as /api/vendor/staff.
  const [selectedRoleCode, setSelectedRoleCode] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { data: meData } = useSWR('/api/auth/me');
  const isSuperAdmin = !!meData?.user?.isSuperAdmin;

  const { data: businessesRes } = useSWR('/api/businesses/list');
  const businesses: { _id: string; name: string }[] = businessesRes?.businesses || businessesRes?.data || [];

  const usersParams = (() => {
    const params = new URLSearchParams({ limit: '100' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (activeTab !== 'All' && TAB_ROLE_MAP[activeTab]) params.set('role', TAB_ROLE_MAP[activeTab]);
    return params.toString();
  })();
  const { data: usersRes, isLoading: loading, mutate: fetchUsers } = useSWR(
    `/api/admin/users?${usersParams}`,
    { keepPreviousData: true }
  );
  const users: User[] = usersRes?.users || [];

  // Stats from full list
  const { data: allUsersRes } = useSWR('/api/admin/users?limit=500');
  const stats: Stats = (() => {
    const all: User[] = allUsersRes?.users || [];
    return {
      total: allUsersRes?.total || all.length,
      active: all.filter(u => u.isActive === true).length,   // ← use isActive not status
      employees: all.filter(u => u.roles.some(r => r.code === 'EMPLOYEE')).length,
      vendors: all.filter(u => u.roles.some(r => r.code === 'VENDOR')).length,
      customers: all.filter(u => u.roles.some(r => r.code === 'CUSTOMER')).length,
    };
  })();

  // "Add User" no longer mints a new identity -- it opens the same panel
  // pre-selected on the search step, since every real user already exists
  // via self-registration (see admin/users/page.tsx's old handleSubmit,
  // which used to POST a brand-new User + password straight from this
  // panel). Assigning starts from picking an existing account.
  function openAdd() {
    setEditingUser(null);
    setFormError('');
    setAssignSearch('');
    setAssignResults([]);
    setFormData({ name: '', email: '', role: 'EMPLOYEE', department: '', designation: '', employmentType: 'FULL_TIME', joiningDate: '', companyName: '', gstNumber: '', contactPerson: '', phone: '', businessId: '' });
    setSelectedVendorId(''); setTagError('');
    setShowPanel(true);
  }

  function selectAssignTarget(user: User) {
    openEdit(user);
    setAssignResults([]);
    setAssignSearch('');
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setFormError('');
    setFormData({
      name: user.name, email: user.email, role: user.roles[0]?.code || 'EMPLOYEE',
      department: user.employeeProfile?.department || '', designation: user.employeeProfile?.designation || '',
      employmentType: user.employeeProfile?.employmentType || 'FULL_TIME',
      joiningDate: user.employeeProfile?.joiningDate?.slice(0, 10) || '',
      companyName: user.vendorProfile?.companyName || '', gstNumber: user.vendorProfile?.gstNumber || '',
      contactPerson: '', phone: '', businessId: '',
    });
    setSelectedVendorId(''); setTagError('');
    setShowPanel(true);
  }

  // Business picked -> load that business's vendors so one can be tagged.
  useEffect(() => {
    setSelectedVendorId(''); setTagError('');
  }, [formData.businessId]);
  const { data: vendorsRes } = useSWR(
    formData.businessId ? `/api/vendors?businessId=${formData.businessId}&limit=200` : null
  );
  const vendors: Vendor[] = formData.businessId ? (vendorsRes?.vendors || vendorsRes?.data || []) : [];

  useEffect(() => {
    setTagError(''); setTagSuccess(''); setSelectedRoleCode('');
  }, [selectedVendorId, formData.businessId]);
  const { data: vendorRolesRes } = useSWR(
    selectedVendorId && formData.businessId
      ? `/api/admin/roles?businessId=${formData.businessId}&vendorId=${selectedVendorId}`
      : null
  );
  const vendorRoles: Role[] = selectedVendorId && formData.businessId ? (vendorRolesRes?.roles || []) : [];

  // Super Admin attaches the user to the vendor's team (POST .../promote,
  // track: VENDOR_TEAM) and can now also directly grant one of that
  // vendor's own roles in the same step — the vendor's Owner/Manager can
  // still grant roles themselves from Vendor Portal > Staff too; this is
  // additive, not a replacement for that flow. A role is required here so
  // an attached user is never left with vendor-team membership but zero
  // real access.
  async function attachToVendorTeam() {
    if (!editingUser || !selectedVendorId || !formData.businessId) return;
    setTagging(selectedVendorId);
    setTagError('');
    setTagSuccess('');
    try {
      const res = await fetch(`/api/admin/users/${editingUser._id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: 'VENDOR_TEAM',
          businessId: formData.businessId,
          vendorId: selectedVendorId,
          roleCode: selectedRoleCode || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || d.success === false) {
        setTagError(d.error || d.message || 'Failed to attach user to this vendor');
      } else {
        setTagSuccess(d.message || 'Attached to vendor team.');
        fetchUsers();
      }
    } catch (e) { console.error(e); setTagError('Network error'); }
    finally { setTagging(null); }
  }

  async function searchAssignTargets(q: string) {
    setAssignSearch(q);
    if (!q.trim()) { setAssignResults([]); return; }
    setAssignSearching(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q.trim())}&limit=10`);
      const data = await res.json();
      setAssignResults(data.users || []);
    } catch (e) { console.error(e); }
    finally { setAssignSearching(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return; // must have picked an existing user first
    setSubmitting(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = { name: formData.name, email: formData.email, role: formData.role };
      if (formData.businessId) body.businessId = formData.businessId;
      if (formData.role === 'EMPLOYEE') {
        body.employeeData = { department: formData.department, designation: formData.designation, employmentType: formData.employmentType, joiningDate: formData.joiningDate || undefined };
      }
      if (formData.role === 'VENDOR') {
        body.vendorData = { companyName: formData.companyName, gstNumber: formData.gstNumber, contactPerson: formData.contactPerson, phone: formData.phone };
      }
      const res  = await fetch(`/api/admin/users/${editingUser._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShowPanel(false);
        fetchUsers();
      } else {
        setFormError(data?.error || 'Failed to save user');
      }
    } catch (e) { console.error(e); setFormError('Failed to connect to server'); }
    finally { setSubmitting(false); }
  }

  async function toggleStatus(user: User) {
    // Send isActive (boolean) — User schema uses isActive, not status string
    await fetch(`/api/admin/users/${user._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    fetchUsers();
  }

  // DELETE /api/admin/users/[id] already existed and already worked for
  // super admin (soft delete) -- this page just never rendered a button
  // for it. `isSuperAdmin` was fetched and stored but referenced nowhere
  // else in this file until now.
  async function deleteUser(user: User) {
    if (!confirm(`Delete ${user.name || user.email}? This can't be undone from this screen.`)) return;
    const res = await fetch(`/api/admin/users/${user._id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || data.message || 'Failed to delete user');
      return;
    }
    fetchUsers();
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 placeholder-gray-400';
  const selectCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1.5';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, roles, and access across your organization</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
          <UserPlus size={15} /> Assign User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Users', value: stats.total, color: 'text-gray-900' },
          { label: 'Active',      value: stats.active,    color: 'text-green-600' },
          { label: 'Employees',   value: stats.employees, color: 'text-blue-600' },
          { label: 'Vendors',     value: stats.vendors,   color: 'text-green-600' },
          { label: 'Customers',   value: stats.customers, color: 'text-gray-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm w-fit">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === tab ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or email..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border border-gray-200 bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm w-72" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <UserCog className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-sm text-gray-400">No users found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['User', 'ID', 'Role', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => {
                const initials    = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                const primaryRole = user.roles[0];
                const profileId   = user.employeeProfile?.employeeId || user.vendorProfile?.vendorId;
                const isActive    = user.isActive !== false;   // default true if undefined
                return (
                  <tr key={user._id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${getAvatarColor(user.name)}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {profileId
                        ? <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">{profileId}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {primaryRole
                        ? <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getRoleColor(primaryRole.code)}`}>{primaryRole.code}</span>
                        : <span className="text-xs text-gray-300">No role</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(user)} title="Edit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => router.push(`/console/users/${user._id}`)} title="View"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => toggleStatus(user)}
                          title={isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded-lg transition text-xs font-medium px-2.5 py-1 rounded-full border ${isActive ? 'text-red-600 hover:bg-red-50 border-transparent' : 'text-green-600 hover:bg-green-50 border-transparent'}`}>
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => deleteUser(user)} title="Delete"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-over panel */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowPanel(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-white border border-gray-200 rounded-2xl flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editingUser ? `Assign — ${editingUser.name}` : 'Assign User'}</h2>
              <button onClick={() => setShowPanel(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <span className="text-gray-600 text-lg leading-none">&times;</span>
              </button>
            </div>

            {!editingUser ? (
              // Step 1: find the existing account. Every user already exists —
              // they registered as a customer themselves — so this is a search,
              // never a create form. See openAdd()'s comment.
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <p className="text-xs text-gray-500">
                  Search for the existing user by name, email, or User ID, then tag them with a designation and business/vendor.
                </p>
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={assignSearch} onChange={e => searchAssignTargets(e.target.value)}
                    placeholder="Search by name, email, or User ID..." autoFocus
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                </div>
                {assignSearching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin mx-auto" />}
                <div className="space-y-1">
                  {assignResults.map(u => (
                    <button key={u._id} onClick={() => selectAssignTarget(u)} type="button"
                      className="w-full flex items-center gap-3 text-left p-2.5 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${getAvatarColor(u.name)}`}>
                        {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                      {u.roles[0] && <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${getRoleColor(u.roles[0].code)}`}>{u.roles[0].code}</span>}
                    </button>
                  ))}
                  {assignSearch.trim() && !assignSearching && assignResults.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No existing user matches — they need to register first.</p>
                  )}
                </div>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  {formError}
                </div>
              )}
              <div>
                <label className={labelCls}>Full Name</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={inputCls} placeholder="John Doe" />
              </div>
              <div>
                <label className={labelCls}>Email Address</label>
                <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className={inputCls} placeholder="john@example.com" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['EMPLOYEE', 'VENDOR'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: r })}
                      className={`py-2.5 rounded-xl border text-sm font-medium transition ${
                        formData.role === r
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {r === 'EMPLOYEE' ? 'Employee' : 'Vendor'}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">
                  Admin/Manager/Super Admin access is granted separately from a user's own detail page (Access &amp; Roles tab).
                </p>
              </div>

              {formData.role === 'EMPLOYEE' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div>
                    <label className={labelCls}>Business</label>
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-500 bg-gray-50">
                      AN Group
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">Employees belong to AN Group itself, not a specific tenant business.</p>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Employee Details</p>
                  <div>
                    <label className={labelCls}>Department</label>
                    <input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}
                      className={inputCls} placeholder="Engineering" />
                  </div>
                  <div>
                    <label className={labelCls}>Designation</label>
                    <input type="text" value={formData.designation} onChange={e => setFormData({ ...formData, designation: e.target.value })}
                      className={inputCls} placeholder="Software Engineer" />
                  </div>
                  <div>
                    <label className={labelCls}>Employment Type</label>
                    <select value={formData.employmentType} onChange={e => setFormData({ ...formData, employmentType: e.target.value })} className={selectCls}>
                      {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map(t => (
                        <option key={t} value={t}>{t.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Joining Date</label>
                    <input type="date" value={formData.joiningDate} onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                      className={inputCls} />
                  </div>
                </div>
              )}

              {formData.role === 'VENDOR' && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div>
                    <label className={labelCls}>Business</label>
                    <select value={formData.businessId} onChange={e => setFormData({ ...formData, businessId: e.target.value })} className={selectCls}>
                      <option value="">Select a business…</option>
                      {businesses.map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {formData.businessId && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Attach to a Vendor</p>
                      <p className="text-xs text-gray-400">
                        Attach the user to the vendor's team and grant a role from that vendor's own role set.
                        The vendor's Owner/Manager can also grant roles themselves from Vendor Portal &gt; Staff.
                      </p>
                      {vendors.length === 0 ? (
                        <p className="text-xs text-gray-400">No vendors under this business.</p>
                      ) : (
                        <>
                          <select value={selectedVendorId} onChange={e => setSelectedVendorId(e.target.value)} className={selectCls}>
                            <option value="">Select a vendor…</option>
                            {vendors.map(v => (
                              <option key={v._id} value={v._id}>{v.companyName || v.vendorId}</option>
                            ))}
                          </select>

                          {selectedVendorId && (
                            <select value={selectedRoleCode} onChange={e => setSelectedRoleCode(e.target.value)} className={selectCls}>
                              <option value="">No role (vendor manages access) — optional</option>
                              {vendorRoles.map(r => (
                                <option key={r._id} value={r.code}>{r.name}</option>
                              ))}
                            </select>
                          )}

                          {tagError && (
                            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{tagError}</div>
                          )}
                          {tagSuccess && (
                            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">{tagSuccess}</div>
                          )}

                          {selectedVendorId && (
                            <button
                              type="button"
                              onClick={attachToVendorTeam}
                              disabled={tagging === selectedVendorId}
                              title={!selectedRoleCode ? 'Attaches this user to the vendor team with no access yet — the vendor manages what they can do from their own Team/Profile page' : undefined}
                              className="w-full text-sm font-medium px-3 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition"
                            >
                              {tagging === selectedVendorId ? 'Attaching…' : selectedRoleCode ? 'Attach & Grant Role' : 'Attach to Vendor Team'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold pt-2">Vendor Details</p>
                  <div>
                    <label className={labelCls}>Company Name *</label>
                    <input type="text" required value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      className={inputCls} placeholder="Acme Corp Pvt Ltd" />
                  </div>
                  <div>
                    <label className={labelCls}>GST Number</label>
                    <input type="text" value={formData.gstNumber} onChange={e => setFormData({ ...formData, gstNumber: e.target.value })}
                      className={inputCls} placeholder="22AAAAA0000A1Z5" />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Person</label>
                    <input type="text" value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                      className={inputCls} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className={inputCls} placeholder="+91 98765 43210" />
                  </div>
                </div>
              )}

              <div className="pb-2">
                <button type="submit" disabled={submitting}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Assignment'}
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
