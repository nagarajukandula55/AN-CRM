'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, AlertCircle, MapPin, Calendar, UserCheck } from 'lucide-react'

interface Appointment {
  _id: string
  callNumber: string
  customerName: string
  phone: string
  email?: string
  address?: string
  pincode?: string
  subject: string
  status: string
  deviceCategory?: string
  brandId?: { name?: string } | string
  deviceModelId?: { name?: string } | string
  appointmentDate?: string
  routedVendorId?: { _id: string; companyName?: string; phone?: string } | string
  tags: string[]
  createdAt: string
}

interface Vendor {
  _id: string
  companyName: string
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function AppointmentsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<'ALL' | 'NEEDS_ASSIGNMENT' | 'ROUTED'>('ALL')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData ? ((meData.user ?? meData).activeBusinessId ?? meData.businesses?.[0]?._id ?? null) : null
  const isSuperAdmin = meData ? Boolean((meData.user ?? meData).isSuperAdmin) : false

  const qs = new URLSearchParams({ source: 'Public Appointment Request', limit: '100' })
  if (businessId) qs.set('businessId', businessId)
  const {
    data: appointmentsRes,
    isLoading: loading,
    error: appointmentsSwrError,
    mutate: fetchAppointments,
  } = useSWR(`/api/crm/calls?${qs.toString()}`, { keepPreviousData: true })
  const appointments: Appointment[] = appointmentsRes?.success !== false ? (appointmentsRes?.calls || []) : []
  const error = appointmentsSwrError
    ? (appointmentsSwrError instanceof Error ? appointmentsSwrError.message : 'Could not load appointments. Please try again.')
    : appointmentsRes?.success === false ? (appointmentsRes.message || 'Failed to load appointments') : null

  const { data: vendorsRes } = useSWR(businessId ? `/api/vendors?businessId=${businessId}&limit=200` : null)
  const vendors: Vendor[] = vendorsRes?.vendors || vendorsRes?.data || []

  async function assignVendor(appointmentId: string) {
    const vendorId = assignChoice[appointmentId]
    if (!vendorId) return
    setSavingId(appointmentId)
    try {
      const res = await fetch(`/api/crm/calls/${appointmentId}/assign-vendor`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to assign vendor')
      setAssigningId(null)
      fetchAppointments()
    } catch (err: any) {
      alert(err.message || 'Failed to assign vendor')
    } finally {
      setSavingId(null)
    }
  }

  const needsAssignmentCount = appointments.filter(a => a.tags?.includes('needsAssignment')).length
  const routedCount = appointments.filter(a => a.routedVendorId).length

  const filtered = appointments.filter(a => {
    if (filter === 'NEEDS_ASSIGNMENT') return a.tags?.includes('needsAssignment')
    if (filter === 'ROUTED') return Boolean(a.routedVendorId)
    return true
  })

  if (loading && appointments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/admin/crm')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Appointment Requests</h1>
            <p className="text-sm text-gray-400">Public website bookings only — pincode-matched or manually routed to a vendor</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <span className="text-gray-500 text-sm">Total Requests</span>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{appointments.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <span className="text-gray-500 text-sm">Auto-Routed to Vendor</span>
            <p className="mt-3 text-2xl font-semibold text-emerald-600">{routedCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <span className="text-amber-700 text-sm">Needs Manual Assignment</span>
            <p className="mt-3 text-2xl font-semibold text-amber-700">{needsAssignmentCount}</p>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap mb-6">
          {(['ALL', 'NEEDS_ASSIGNMENT', 'ROUTED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'NEEDS_ASSIGNMENT' ? 'Needs Assignment' : 'Routed'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-400">
              No appointment requests found
            </div>
          ) : (
            filtered.map((a) => {
              const needsAssignment = a.tags?.includes('needsAssignment')
              const vendor = typeof a.routedVendorId === 'object' ? a.routedVendorId : null
              return (
                <div key={a._id} className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{a.callNumber}</span>
                        <span className="font-semibold text-gray-900">{a.customerName}</span>
                        <span className="text-xs text-gray-400">{a.phone}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{a.subject}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                        {a.pincode && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.pincode}</span>
                        )}
                        {a.appointmentDate && (
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(a.appointmentDate)}</span>
                        )}
                        <span>
                          {[a.deviceCategory, typeof a.brandId === 'object' ? a.brandId?.name : undefined, typeof a.deviceModelId === 'object' ? a.deviceModelId?.name : undefined].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {vendor ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1.5">
                          <UserCheck className="w-3.5 h-3.5" /> {vendor.companyName || 'Vendor assigned'}
                        </span>
                      ) : needsAssignment ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium px-3 py-1.5">
                          <AlertCircle className="w-3.5 h-3.5" /> Needs Assignment
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Unrouted</span>
                      )}
                      <p className="mt-1 text-xs text-gray-400">{fmtDate(a.createdAt)}</p>
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                      {assigningId === a._id ? (
                        <>
                          <select
                            value={assignChoice[a._id] || ''}
                            onChange={(e) => setAssignChoice((p) => ({ ...p, [a._id]: e.target.value }))}
                            title="Select vendor"
                            className="flex-1 max-w-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                          >
                            <option value="">Select vendor…</option>
                            {vendors.map((v) => (
                              <option key={v._id} value={v._id}>{v.companyName}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => assignVendor(a._id)}
                            disabled={!assignChoice[a._id] || savingId === a._id}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                          >
                            {savingId === a._id ? 'Assigning…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setAssigningId(null)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900 transition"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setAssigningId(a._id)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                        >
                          {vendor ? 'Reassign Vendor' : 'Assign Vendor'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
