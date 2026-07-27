'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, DollarSign, Download, Loader2, Search, ChevronDown, CheckCircle, Clock, XCircle } from 'lucide-react'

interface Payroll {
  _id: string
  employeeId: string
  employeeName: string
  designation: string
  month: string
  basicSalary: number
  allowances: number
  deductions: number
  netSalary: number
  status: 'PENDING' | 'PAID' | 'ON_HOLD'
}

const STATUS_CONFIG = {
  PAID:     { label: 'Paid',    color: 'bg-green-50 text-green-700',  icon: CheckCircle },
  PENDING:  { label: 'Pending', color: 'bg-yellow-50 text-yellow-700',icon: Clock },
  ON_HOLD:  { label: 'On Hold', color: 'bg-red-50 text-red-700',      icon: XCircle },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function PayrollPage() {
  const router = useRouter()
  const [search, setSearch]         = useState('')
  const [month, setMonth]           = useState(new Date().getMonth())
  const [year, setYear]             = useState(new Date().getFullYear())

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? null

  const { data: payrollData, isLoading: loading, mutate: fetchPayroll } = useSWR(
    businessId ? `/api/hr/payroll?businessId=${businessId}&month=${month + 1}&year=${year}` : null
  )
  const payrolls: Payroll[] = payrollData?.payrolls ?? payrollData?.data ?? []

  async function markPaid(id: string) {
    try {
      await fetch(`/api/hr/payroll/${id}/pay`, { method: 'PATCH' })
      fetchPayroll((current: any) => {
        if (!current) return current
        const list = current.payrolls ?? current.data ?? []
        const updated = list.map((x: Payroll) => x._id === id ? { ...x, status: 'PAID' } : x)
        return current.payrolls ? { ...current, payrolls: updated } : { ...current, data: updated }
      }, { revalidate: false })
    } catch { }
  }

  const filtered = payrolls.filter(p =>
    p.employeeName?.toLowerCase().includes(search.toLowerCase())
  )

  const totalNet  = filtered.reduce((s, p) => s + p.netSalary, 0)
  const totalPaid = filtered.filter(p => p.status === 'PAID').reduce((s, p) => s + p.netSalary, 0)
  const pending   = filtered.filter(p => p.status === 'PENDING').length

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/admin/hr')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <ArrowLeft size={15} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
            <p className="text-sm text-gray-500">Manage employee salaries and payments</p>
          </div>
          <button className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50 shadow-sm">
            <Download size={14} /> Export
          </button>
        </div>

        {/* Month / Year Selector */}
        <div className="flex gap-3 mb-6">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-200 bg-white rounded-xl px-4 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 bg-white rounded-xl px-4 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10">
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total Payroll</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">₹{totalNet.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-sm text-gray-500">Paid Out</p>
            <p className="text-2xl font-bold text-green-600 mt-1">₹{totalPaid.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{pending}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full border border-gray-200 bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No payroll records for this period</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Basic</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Allowances</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Deductions</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Net Pay</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => {
                  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.PENDING
                  const StatusIcon = cfg.icon
                  return (
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{p.employeeName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.designation}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-700">₹{p.basicSalary?.toLocaleString()}</td>
                      <td className="px-5 py-4 text-green-600">+₹{p.allowances?.toLocaleString()}</td>
                      <td className="px-5 py-4 text-red-500">-₹{p.deductions?.toLocaleString()}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900">₹{p.netSalary?.toLocaleString()}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                          <StatusIcon size={10} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {p.status === 'PENDING' && (
                          <button onClick={() => markPaid(p._id)}
                            className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                            Mark Paid
                          </button>
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
    </div>
  )
}
