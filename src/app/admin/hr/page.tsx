'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, DollarSign, Calendar, FolderOpen, ArrowRight } from 'lucide-react'

interface ModuleCard { icon: React.ElementType; label: string; description: string; href: string }

const modules: ModuleCard[] = [
  { icon: Users,      label: 'Employees',        description: 'Manage employee profiles, designations, and employment details.', href: '/admin/employees' },
  { icon: DollarSign, label: 'Payroll',           description: 'Process monthly salaries, deductions, and payslips.',            href: '/admin/hr/payroll' },
  { icon: Calendar,   label: 'Leave Management',  description: 'Track leave applications, approvals, and balances.',             href: '/admin/hr/leave' },
  { icon: FolderOpen, label: 'Documents',         description: 'Store and manage employee documents and contracts.',              href: '/admin/hr/documents' },
]

export default function HRPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <ArrowLeft size={15} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">HR Management</h1>
            <p className="text-sm text-gray-500">Human resources and workforce management</p>
          </div>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {modules.map(mod => {
            const Icon = mod.icon
            return (
              <Link key={mod.label} href={mod.href}>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4 hover:shadow-md hover:border-gray-300 transition group cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-900 transition">
                      <Icon className="w-5 h-5 text-gray-500 group-hover:text-white transition" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{mod.label}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Links</h2>
          <div className="flex flex-wrap gap-2">
            {modules.map(mod => (
              <Link key={mod.label} href={mod.href}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100 transition">
                <mod.icon className="w-3.5 h-3.5" /> {mod.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
