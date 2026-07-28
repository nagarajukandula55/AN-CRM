'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { serviceRecordToRenderData } from '@/core/documentTemplates/adapters'
import type { DocumentRenderData } from '@/core/documentTemplates/renderData'

interface JobSheetRaw {
  businessId: string
  warehouseId?: string
  status: string
  assignedTo?: { name?: string }
  // Snapshots -- see CrmJobSheet.ts's field comments. Preferred over the
  // populated assignedTo?.name below since SC job sheets have no formal
  // assignedTo User ref at all (free-text engineer name only).
  assignedToName?: string
  ccoName?: string
  [key: string]: any
}

interface Vendor {
  companyName?: string
  serviceCenterInfo?: { hours?: string; hotline?: string }
}

export default function ServiceRecordPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [jobSheet, setJobSheet] = useState<JobSheetRaw | null>(null)
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [renderData, setRenderData] = useState<DocumentRenderData | null>(null)
  const [template, setTemplate] = useState<{ blocks: any[]; accentColor: string; logoUrl?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/crm/jobsheets/${id}/service-record`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message || 'Failed to load service record')
        setJobSheet(d.jobSheet)
        setVendor(d.vendor)
      })
      .catch((err) => setError(err.message || 'Failed to load service record'))
  }, [id])

  useEffect(() => {
    if (!jobSheet) return
    const qs = new URLSearchParams({
      businessId: String(jobSheet.businessId),
      documentType: 'SERVICE_RECORD',
      ...(jobSheet.warehouseId ? { warehouseId: String(jobSheet.warehouseId) } : {}),
    })
    fetch(`/api/document-templates/resolve?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error || 'Failed to load document template')
        setTemplate(d.template)
        setRenderData(
          serviceRecordToRenderData(jobSheet, d.company, {
            technicalConsultant: jobSheet.assignedToName || jobSheet.assignedTo?.name,
            ccoName: jobSheet.ccoName,
            hours: vendor?.serviceCenterInfo?.hours,
            hotline: vendor?.serviceCenterInfo?.hotline,
          })
        )
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSheet])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => router.push('/vendor/crm/jobsheets')} className="text-sm text-gray-500 underline">
          Back to Workorders
        </button>
      </div>
    )
  }

  if (loading || !renderData || !template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto mb-4 flex items-center gap-4 print:hidden">
        <button onClick={() => router.push('/vendor/crm/jobsheets')} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-semibold flex-1">Service Record</h1>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-sm print:shadow-none rounded-2xl print:rounded-none p-10">
        <DocumentRenderer
          blocks={template.blocks}
          accentColor={template.accentColor}
          logoUrl={template.logoUrl}
          data={renderData}
        />
        <DocumentFooterText text={renderData.footerText} />
      </div>
    </div>
  )
}
