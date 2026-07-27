'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, Calendar, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'

interface LeaveRequest {
  _id: string
  employeeName: string
  leaveType: string
  fromDate: string
  toDate: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  days: number
  createdAt: string
}

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave']
const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: 'bg-yellow-50 text-yellow-700', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-50 text-green-700',   icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-50 text-red-700',       icon: XCircle },
}

export default function LeavePage() {
  const router = useRouter()
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab]   = useState('ALL')
  const [form, setForm] = useState({
    employeeName: '', leaveType: 'Annual Leave', fromDate: '', toDate: '', reason: '',
  })

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? null

  const { data: leavesData, isLoading: loading, mutate: fetchLeaves } = useSWR(
    businessId ? `/api/hr/leaves?businessId=${businessId}` : null
  )
  const leaves: LeaveRequest[] = leavesData?.leaves ?? leavesData?.data ?? []

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessId }),
      })
      setShowForm(false)
      setForm({ employeeName: '', leaveType: 'Annual Leave', fromDate: '', toDate: '', reason: '' })
      if (businessId) fetchLeaves()
    } catch { } finally { setSubmitting(false) }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await fetch(`/api/hr/leaves/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      fetchLeaves((current: any) => {
        if (!current) return current
        const list = current.leaves ?? current.data ?? []
        const updated = list.map((x: LeaveRequest) => x._id === id ? { ...x, status: status as any } : x)
        return current.leaves ? { ...current, leaves: updated } : { ...current, data: updated }
      }, { revalidate: false })
    } catch { }
  }

  const tabs    = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
  const filtered = activeTab === 'ALL' ? leaves : leaves.filter(l => l.status === activeTab)
  const stats = {
    total:    leaves.length,
    pending:  leaves.filter(l => l.status === 'PENDING').length,
    approved: leaves.filter(l => l.status === 'APPROVED').length,
    rejected: leaves.filter(l => l.status === 'REJECTED').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/admin/hr')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <ArrowLeft size={15} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">Leave Management</h1>
            <p className="text-sm text-gray-500">Manage employee leave requests and approvals</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800">
            <Plus size={15} /> Apply Leave
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[['Total', stats.total, ''], ['Pending', stats.pending, 'text-yellow-600'], ['Approved', stats.approved, 'text-green-600'], ['Rejected', stats.rejected, 'text-red-600']].map(([l, v, c]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-500">{l}</p>
              <p className={`text-2xl font-bold mt-1 ${c || 'text-gray-900'}`}>{v}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No leave requests found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Days</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(l => {
                  const cfg = STATUS_CONFIG[l.status] || STATUS_CONFIG.PENDING
                  const StatusIcon = cfg.icon
                  return (
                    <tr key={l._id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{l.employeeName}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{l.reason}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{l.leaveType}</td>
                      <td className="px-5 py-4 text-xs text-gray-500">
                        {new Date(l.fromDate).toLocaleDateString()} – {new Date(l.toDate).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-gray-700">{l.days ?? '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                          <StatusIcon size={10} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {l.status === 'PENDING' && (
                          <div className="flex gap-1.5">
                            <button onClick={() => updateStatus(l._id, 'APPROVED')}
                              className="text-xs font-medium text-green-700 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-50">
                              Approve
                            </button>
                            <button onClick={() => updateStatus(l._id, 'REJECTED')}
                              className="text-xs font-medium text-red-700 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Apply Leave Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-white border border-gray-200 rounded-2xl flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Apply for Leave</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <X size={15} className="text-gray-600" />
              </button>
            </div>
            <div className="flex-1 p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Employee Name *</label>
                <input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))}
                  placeholder="Employee name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Leave Type</label>
                <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10">
                  {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">From Date *</label>
                  <input type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">To Date *</label>
                  <input type="date" value={form.toDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Reason</label>
                <textarea rows={4} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Reason for leave..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200">
              <button onClick={handleSubmit} disabled={submitting || !form.employeeName || !form.fromDate || !form.toDate}
                className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
