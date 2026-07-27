'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'

interface JobSheet {
  jobSheetNumber: string
  customerName: string
  phone: string
  product?: string
  brandId?: { name?: string }
  faultCodeId?: { code?: string; description?: string }
  deviceModel?: string
  imeiOrSerialNumber?: string
  warrantyStatus?: 'IW' | 'OOW'
  deviceAppearance?: 'GOOD' | 'USED' | 'DENTS' | 'BROKEN'
  fileBackupDescription?: 'YES' | 'NO'
  createdBy?: { name?: string; email?: string }
  createdAt: string
}

interface Vendor {
  companyName?: string
  phone?: string
  address?: { street?: string; city?: string; state?: string; pincode?: string }
  serviceCenterInfo?: { hours?: string; hotline?: string }
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function IntakeReceiptPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [jobSheet, setJobSheet] = useState<JobSheet | null>(null)
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [specialNotice, setSpecialNotice] = useState('')
  const [customerLogoUrl, setCustomerLogoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/crm/jobsheets/${id}/intake-receipt`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message || 'Failed to load intake receipt')
        setJobSheet(d.jobSheet)
        setVendor(d.vendor)
        setSpecialNotice(d.specialNotice || '')
        setCustomerLogoUrl(d.customerLogoUrl || '')
      })
      .catch((err) => setError(err.message || 'Failed to load intake receipt'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  if (error || !jobSheet) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-600">{error || 'Workorder not found'}</p>
        <button onClick={() => router.push('/vendor/crm/jobsheets')} className="text-sm text-gray-500 underline">
          Back to Workorders
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-10 print:py-0 print:px-0">
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <button onClick={() => router.push('/vendor/crm/jobsheets')} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-semibold flex-1">Workorder</h1>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 print:border-0 print:rounded-none">
          <div className="flex items-start justify-between border-b border-gray-200 pb-4 mb-4">
            <div className="flex items-center gap-3">
              {customerLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customerLogoUrl} alt="" className="h-10 w-auto object-contain" />
              )}
              <div>
                <h2 className="text-lg font-semibold">Service Handover Report</h2>
                <p className="text-xs text-gray-500">RO No.: {jobSheet.jobSheetNumber}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">Receive Date: {fmtDate(jobSheet.createdAt)}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
            <div><span className="text-gray-500">Customer Name:</span> {jobSheet.customerName}</div>
            <div><span className="text-gray-500">Requester Name:</span> {jobSheet.customerName}</div>
            <div><span className="text-gray-500">Customer Phone:</span> {jobSheet.phone}</div>
            <div><span className="text-gray-500">Requester Phone:</span> {jobSheet.phone}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4 border-t border-gray-100 pt-4">
            <div>
              <span className="text-gray-500">Model:</span>{' '}
              {[jobSheet.product, jobSheet.brandId?.name, jobSheet.deviceModel].filter(Boolean).join(' · ') || '—'}
            </div>
            <div><span className="text-gray-500">Warranty Status:</span> {jobSheet.warrantyStatus || '—'}</div>
            <div><span className="text-gray-500">SN/IMEI:</span> {jobSheet.imeiOrSerialNumber || '—'}</div>
          </div>

          <div className="space-y-1.5 text-sm mb-4 border-t border-gray-100 pt-4">
            <p><span className="text-gray-500">Device Appearance:</span> {jobSheet.deviceAppearance ? jobSheet.deviceAppearance.charAt(0) + jobSheet.deviceAppearance.slice(1).toLowerCase() : '—'}</p>
            <p><span className="text-gray-500">File Backup Done:</span> {jobSheet.fileBackupDescription || '—'}</p>
            <p><span className="text-gray-500">Fault Code:</span> {jobSheet.faultCodeId ? `${jobSheet.faultCodeId.code} — ${jobSheet.faultCodeId.description}` : '—'}</p>
          </div>

          {specialNotice && (
            <div className="text-xs text-gray-500 border-t border-gray-100 pt-4 mb-4 whitespace-pre-wrap">
              <p className="font-medium text-gray-700 mb-1">Special Notice:</p>
              {specialNotice}
            </div>
          )}

          <p className="text-sm mb-6">Service Consultant Name: {jobSheet.createdBy?.name || '—'}</p>

          <div className="pt-4 border-t border-gray-200 text-sm mb-6">
            Signature constitutes agreement to the above terms. ______________________________
          </div>

          <div className="border-t border-gray-200 pt-4 text-xs text-gray-500 space-y-1">
            <p>Authorized Service Partner: {vendor?.companyName || '—'}</p>
            {vendor?.phone && <p>Service Center Phone: {vendor.phone}</p>}
            {vendor?.address && (
              <p>
                Service Center Address:{' '}
                {[vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(', ') || '—'}
              </p>
            )}
            {vendor?.serviceCenterInfo?.hours && <p>Service Hours: {vendor.serviceCenterInfo.hours}</p>}
            {vendor?.serviceCenterInfo?.hotline && <p>Official Hotline: {vendor.serviceCenterInfo.hotline}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
