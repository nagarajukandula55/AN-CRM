'use client'

import { useState, useEffect, type ChangeEvent } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  X,
  Users,
  UserCheck,
  UserMinus,
  Calendar,
  Search,
  Edit2,
  Eye,
  Trash2,
  Phone,
  Mail,
  Briefcase,
  IndianRupee,
  AlertCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input, Select } from '@/components/ui/Input'

// ─── Types ────────────────────────────────────────────────────────────────────
// Employee shape mirrors src/models/EmployeeProfile.ts (the single model now
// backing every /api/employees* route). userId is optional -- a record can
// exist with no linked login (a pure HR record) -- so name/email/phone are
// stored directly rather than requiring a populate() everywhere.
interface UserRef {
  _id: string
  name: string
  email: string
  phone?: string
}

interface RoleOption {
  code: string
  name: string
}

interface Employee {
  _id: string
  employeeId?: string
  userId?: { name: string; email: string } | string
  name?: string
  email?: string
  phone?: string
  department?: string
  designation?: string
  employmentType?: string
  status?: string
  joiningDate?: string
  salary?: number
  emergencyContact?: { name?: string; phone?: string; relation?: string }
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  INACTIVE: 'neutral',
  TERMINATED: 'danger',
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

// Employee name can come from a populated userId (legacy records created
// through the old /employees flow) or from the flat name/email fields that
// the current POST /api/employees route actually writes. Check both so
// rows never render "Unknown" for employees created via the new form.
function getEmpName(emp: Employee): string {
  if (emp.name) return emp.name
  if (!emp.userId) return 'Unknown'
  if (typeof emp.userId === 'string') return emp.userId
  return emp.userId.name ?? emp.userId.email ?? 'Unknown'
}

function getEmpEmail(emp: Employee): string {
  if (emp.email) return emp.email
  if (emp.userId && typeof emp.userId !== 'string') return emp.userId.email ?? ''
  return ''
}

export default function EmployeesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // View / edit / delete state — merged in from the orphaned root
  // src/app/employees/page.tsx, which had a fuller CRUD flow than this
  // page did. Kept as separate pieces of state (rather than one big modal
  // union) to match this page's existing flat-state style.
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    joiningDate: '',
    salary: '',
  })

  // User-search autocomplete, merged in from the root page. It calls
  // /api/users?search=&limit=10 (admin-only endpoint) to look up an
  // existing platform user so their name/email/phone can be prefilled
  // into the employee form, AND so their _id gets sent as `userId` in the
  // POST body -- linking this employee record to their real login so the
  // record shows up under their own account, not just as loose text fields.
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [userDropOpen, setUserDropOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRef | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserSearch(userSearch), 300)
    return () => clearTimeout(t)
  }, [userSearch])

  const { data: userSearchData } = useSWR(
    debouncedUserSearch && debouncedUserSearch.length >= 2 ? `/api/users?search=${encodeURIComponent(debouncedUserSearch)}&limit=10` : null
  )
  const userResults: UserRef[] = userSearchData?.success ? (userSearchData.users ?? []) : []

  function pickUser(u: UserRef) {
    setSelectedUser(u)
    setUserDropOpen(false)
    setUserSearch('')
    // Prefill the flat fields the API actually persists.
    setForm((p: typeof form) => ({ ...p, name: u.name ?? p.name, email: u.email ?? p.email, phone: u.phone ?? p.phone }))
  }

  function clearSelectedUser() {
    setSelectedUser(null)
    setUserSearch('')
  }

  // businessId resolution stays exactly as it was in this page — via
  // /api/auth/me — so we don't introduce a second, competing mechanism
  // (the root page used localStorage.getItem('businessId'), which is not
  // this page's pattern and was deliberately NOT carried over).
  const { data: meData, error: meSwrError } = useSWR('/api/auth/me')
  const businessId: string | null = meData ? ((meData.user ?? meData).activeBusinessId ?? meData.businesses?.[0]?._id ?? null) : null

  // Designation is a picker over this business's own roles (Admin > Access),
  // not free text, same pattern as the fuller /employees page -- so it can
  // never drift from what actually exists for this business.
  const { data: rolesData } = useSWR(businessId ? `/api/admin/roles?businessId=${businessId}` : null)
  const roles: RoleOption[] = rolesData?.roles || []

  const { data: employeesData, isLoading: loading, error: employeesSwrError, mutate: fetchEmployees } = useSWR(
    businessId ? `/api/employees?businessId=${businessId}` : null
  )
  const employees: Employee[] = employeesData ? (Array.isArray(employeesData) ? employeesData : (employeesData.employees ?? [])) : []

  const error: string | null = meSwrError
    ? 'Failed to load user info'
    : employeesSwrError
      ? 'Failed to connect'
      : null

  function resetForm() {
    setForm({
      name: '',
      email: '',
      phone: '',
      department: '',
      designation: '',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      joiningDate: '',
      salary: '',
    })
    clearSelectedUser()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          businessId,
          userId: selectedUser?._id,
          salary: parseFloat(form.salary) || 0,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.success === false) {
        throw new Error(d.message ?? d.error ?? 'Failed to add employee')
      }
      setShowForm(false)
      resetForm()
      if (businessId) fetchEmployees()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // Edit flow, merged in from the root page's fuller CRUD. PATCHes
  // /api/employees/[id] (EmployeeProfile -- the same model the list/create
  // route above now uses too).
  const [editForm, setEditForm] = useState({
    department: '',
    designation: '',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    joiningDate: '',
    salary: '',
  })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function openEdit(emp: Employee) {
    setEditForm({
      department: emp.department ?? '',
      designation: emp.designation ?? '',
      employmentType: emp.employmentType ?? 'FULL_TIME',
      status: emp.status ?? 'ACTIVE',
      joiningDate: emp.joiningDate ? emp.joiningDate.split('T')[0] : '',
      salary: emp.salary?.toString() ?? '',
    })
    setEditError(null)
    setEditEmployee(emp)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editEmployee) return
    setEditSubmitting(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/employees/${editEmployee._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: editForm.department || undefined,
          designation: editForm.designation || undefined,
          employmentType: editForm.employmentType,
          joiningDate: editForm.joiningDate || undefined,
          salary: editForm.salary || undefined,
          status: editForm.status,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.success === false) {
        throw new Error(d.error ?? 'Failed to save changes')
      }
      setEditEmployee(null)
      if (businessId) fetchEmployees()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this employee profile?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/employees/${id}`, { method: 'DELETE' })
      if (businessId) fetchEmployees()
    } finally {
      setDeletingId(null)
    }
  }

  const now = new Date()
  const total = employees.length
  const active = employees.filter((e: Employee) => e.status === 'ACTIVE').length
  const onLeave = employees.filter((e: Employee) => e.status === 'ON_LEAVE').length
  const newThisMonth = employees.filter((e: Employee) => {
    if (!e.joiningDate) return false
    const d = new Date(e.joiningDate)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const departments: string[] = ['ALL', ...Array.from(new Set<string>(employees.map((e: Employee) => e.department ?? '').filter(Boolean)))]

  const filtered = employees.filter((emp: Employee) => {
    const name = getEmpName(emp).toLowerCase()
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      emp.employeeId?.toLowerCase().includes(search.toLowerCase()) ||
      getEmpEmail(emp).toLowerCase().includes(search.toLowerCase())
    const matchDept = deptFilter === 'ALL' || emp.department === deptFilter
    const matchStatus = statusFilter === 'ALL' || emp.status === statusFilter
    return matchSearch && matchDept && matchStatus
  })

  if (loading && employees.length === 0) {
    return <LoadingPanel label="Loading employees…" />
  }

  if (!businessId) {
    return (
      <div className="min-h-screen bg-bg text-ink">
        <EmptyState
          kind="empty"
          title="No Business Selected"
          description="Select a business first to manage employees."
          action={<Button onClick={() => router.push('/admin')}>Go to Dashboard</Button>}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Employees"
          description="Workforce management"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button
                onClick={() => {
                  // Opening the form never cleared a PREVIOUS attempt's linked
                  // user -- only a successful submit did (see handleSubmit).
                  // Closing via X/backdrop/Cancel without submitting left
                  // selectedUser (and the rest of the form) in state, so the
                  // next, unrelated "Add Employee" silently resubmitted that
                  // stale linked user's _id as `userId` even though the
                  // visible Name/Email fields showed brand-new details --
                  // exactly the reported "already has an employee record"
                  // 409 on details that were never actually used.
                  resetForm()
                  setFormError(null)
                  setShowForm(true)
                }}
                icon={<Plus className="w-4 h-4" />}
              >
                Add Employee
              </Button>
            </>
          }
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users, label: 'Total', value: String(total), filterValue: 'ALL' as const },
            { icon: UserCheck, label: 'Active', value: String(active), filterValue: 'ACTIVE' as const },
            { icon: UserMinus, label: 'On Leave', value: String(onLeave), filterValue: 'ON_LEAVE' as const },
            { icon: Calendar, label: 'New This Month', value: String(newThisMonth), filterValue: null },
          ].map(({ icon: Icon, label, value, filterValue }) => {
            const isActive = filterValue !== null && statusFilter === filterValue;
            return (
              <Card key={label} className={`p-6 ${filterValue === null ? 'cursor-default' : 'cursor-pointer'} ${isActive ? 'border-accent ring-2 ring-accent-soft' : 'hover:border-border-strong'}`}>
                <button
                  type="button"
                  disabled={filterValue === null}
                  onClick={() => filterValue && setStatusFilter(statusFilter === filterValue ? 'ALL' : filterValue)}
                  className="text-left w-full"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-ink-3 text-sm">{label}</span>
                    <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                  </div>
                  <p className="tabular text-2xl font-semibold text-ink">{value}</p>
                </button>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <Input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={deptFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setDeptFilter(e.target.value)} title="Filter by department" className="w-auto">
            {departments.map((d: string) => (
              <option key={d} value={d}>
                {d === 'ALL' ? 'All Departments' : d}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)} title="Filter by status" className="w-auto">
            {['ALL', 'ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'].map((s: string) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All Statuses' : s}
              </option>
            ))}
          </Select>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">ID</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Department</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Designation</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Type</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState kind="empty" title="No employees found" /></td></tr>
                ) : (
                  filtered.map((emp: Employee) => (
                    <tr key={emp._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 text-ink-3 tabular text-xs">{emp.employeeId ?? emp._id.slice(-6)}</td>
                      <td className="px-6 py-3 font-medium text-ink">{getEmpName(emp)}</td>
                      <td className="px-6 py-3 text-ink-3">{emp.department ?? '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{emp.designation ?? '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{emp.employmentType ?? '—'}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={STATUS_TONE[emp.status ?? ''] ?? 'neutral'}>{emp.status ?? 'UNKNOWN'}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewEmployee(emp)}
                            className="p-1.5 text-ink-3 hover:text-ink rounded-control hover:bg-surface-2 transition"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 text-ink-3 hover:text-ink rounded-control hover:bg-surface-2 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp._id)}
                            disabled={deletingId === emp._id}
                            className="p-1.5 text-ink-3 hover:text-danger rounded-control hover:bg-danger-soft transition disabled:opacity-40"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Slide-over: Add Employee */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex-1 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="h-section">Add Employee</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-control bg-surface border border-border-strong flex items-center justify-center hover:bg-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {formError && (
                <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
                  {formError}
                </div>
              )}

              {/* User-search autocomplete: merged in from the orphaned root
                  src/app/employees/page.tsx. Purely a lookup/prefill helper
                  against /api/users — selecting a result fills name/email/
                  phone below rather than sending a separate user reference,
                  since the Employee model/POST route has no such field. */}
              <Field label="Link Existing User (optional)">
                {selectedUser ? (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-surface border border-border-strong rounded-control">
                    <div>
                      <p className="text-sm text-ink">{selectedUser.name}</p>
                      <p className="text-xs text-ink-3">{selectedUser.email}</p>
                    </div>
                    <button type="button" onClick={clearSelectedUser} className="text-ink-3 hover:text-ink">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      type="text"
                      value={userSearch}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setUserSearch(e.target.value)
                        setUserDropOpen(true)
                      }}
                      onFocus={() => setUserDropOpen(true)}
                      placeholder="Search by name or email…"
                    />
                    {userDropOpen && userResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-control overflow-hidden shadow-card-lg">
                        {userResults.map((u: UserRef) => (
                          <button
                            type="button"
                            key={u._id}
                            className="w-full px-4 py-2.5 text-left hover:bg-surface-2 transition"
                            onClick={() => pickUser(u)}
                          >
                            <p className="text-sm text-ink">{u.name}</p>
                            <p className="text-xs text-ink-3">{u.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Field>

              <Field label="Name" required>
                <Input
                  type="text"
                  required
                  placeholder="Employee full name"
                  value={form.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, name: e.target.value }))}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="employee@company.com"
                  value={form.email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, email: e.target.value }))}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="text"
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, phone: e.target.value }))}
                />
              </Field>
              <Field label="Department" required>
                <Input
                  type="text"
                  required
                  placeholder="Engineering"
                  value={form.department}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, department: e.target.value }))}
                />
              </Field>
              <Field label="Designation" required>
                <Select
                  required
                  value={form.designation}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm((p: typeof form) => ({ ...p, designation: e.target.value }))}
                  title="Select designation"
                >
                  <option value="">Select…</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.name}>{r.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Joining Date" required>
                <Input
                  type="date"
                  required
                  placeholder="Select joining date"
                  value={form.joiningDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, joiningDate: e.target.value }))}
                />
              </Field>
              <Field label="Salary (₹)">
                <Input
                  type="number"
                  placeholder="50000"
                  value={form.salary}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((p: typeof form) => ({ ...p, salary: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              <Field label="Employment Type">
                <Select
                  value={form.employmentType}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm((p: typeof form) => ({ ...p, employmentType: e.target.value }))}
                  title="Select employment type"
                >
                  {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm((p: typeof form) => ({ ...p, status: e.target.value }))}
                  title="Select employee status"
                >
                  {['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'].map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </form>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} loading={submitting} className="flex-1">
                Add Employee
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View detail modal — merged in from the root page's ViewModal */}
      {viewEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">Employee Details</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    openEdit(viewEmployee)
                    setViewEmployee(null)
                  }}
                  icon={<Edit2 className="w-3 h-3" />}
                >
                  Edit
                </Button>
                <button onClick={() => setViewEmployee(null)} className="text-ink-3 hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-control bg-accent-soft flex items-center justify-center text-xl font-bold text-accent">
                  {getEmpName(viewEmployee)?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-base font-semibold text-ink">{getEmpName(viewEmployee)}</p>
                  <p className="text-sm text-ink-3">{viewEmployee.designation || '—'}</p>
                  <div className="mt-1"><Badge tone={STATUS_TONE[viewEmployee.status ?? ''] ?? 'neutral'}>{viewEmployee.status ?? 'UNKNOWN'}</Badge></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Briefcase className="w-3.5 h-3.5" />, label: 'Employee ID', value: viewEmployee.employeeId ?? '—' },
                  { icon: <Users className="w-3.5 h-3.5" />, label: 'Department', value: viewEmployee.department || '—' },
                  { icon: <Mail className="w-3.5 h-3.5" />, label: 'Email', value: getEmpEmail(viewEmployee) || '—' },
                  { icon: <Phone className="w-3.5 h-3.5" />, label: 'Phone', value: viewEmployee.phone || '—' },
                  { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Joining Date', value: fmtDate(viewEmployee.joiningDate) },
                  { icon: <IndianRupee className="w-3.5 h-3.5" />, label: 'Salary / Month', value: viewEmployee.salary ? inr(viewEmployee.salary) : '—' },
                ].map((item, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex items-center gap-1.5 text-ink-3 mb-1">
                      {item.icon}
                      <span className="text-xs">{item.label}</span>
                    </div>
                    <p className="text-sm text-ink font-medium truncate">{item.value}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — merged in from the root page's fuller edit flow.
          PATCHes /api/employees/[id]. */}
      {editEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="h-section">Edit Employee</h2>
              <button onClick={() => setEditEmployee(null)} className="text-ink-3 hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs">
                  <AlertCircle className="w-3.5 h-3.5" /> {editError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Department">
                  <Input
                    value={editForm.department}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm((p: typeof editForm) => ({ ...p, department: e.target.value }))}
                    placeholder="Engineering"
                  />
                </Field>
                <Field label="Designation">
                  <Select
                    value={editForm.designation}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setEditForm((p: typeof editForm) => ({ ...p, designation: e.target.value }))}
                    title="Select designation"
                  >
                    <option value="">Select…</option>
                    {roles.map((r) => (
                      <option key={r.code} value={r.name}>{r.name}</option>
                    ))}
                    {editForm.designation && !roles.some((r) => r.name === editForm.designation) && (
                      <option value={editForm.designation}>{editForm.designation} (existing)</option>
                    )}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employment Type">
                  <Select
                    value={editForm.employmentType}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setEditForm((p: typeof editForm) => ({ ...p, employmentType: e.target.value }))}
                    title="Select employment type"
                  >
                    {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((t: string) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select
                    value={editForm.status}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setEditForm((p: typeof editForm) => ({ ...p, status: e.target.value }))}
                    title="Select employee status"
                  >
                    {['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'].map((s: string) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Joining Date">
                  <Input
                    type="date"
                    placeholder="Select joining date"
                    value={editForm.joiningDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm((p: typeof editForm) => ({ ...p, joiningDate: e.target.value }))}
                  />
                </Field>
                <Field label="Monthly Salary (₹)">
                  <Input
                    type="number"
                    placeholder="50000"
                    value={editForm.salary}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm((p: typeof editForm) => ({ ...p, salary: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                  />
                </Field>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setEditEmployee(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEditSubmit} disabled={editSubmitting} loading={editSubmitting}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
