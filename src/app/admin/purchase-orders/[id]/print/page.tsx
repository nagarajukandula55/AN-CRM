'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { purchaseOrderToRenderData } from '@/core/documentTemplates/adapters'

export default function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: poRes, error: poErr } = useSWR(`/api/purchase-orders/${id}`)
  const po = poRes?.success ? poRes.data : null

  const templateQs = po
    ? new URLSearchParams({
        businessId: String(po.businessId?._id || po.businessId),
        documentType: 'PURCHASE_ORDER',
        ...(po.warehouseId?._id ? { warehouseId: String(po.warehouseId._id) } : {}),
      }).toString()
    : null
  const { data: templateRes, error: templateErr } = useSWR(
    templateQs ? `/api/document-templates/resolve?${templateQs}` : null
  )
  const template = templateRes?.success ? templateRes.template : null
  const renderData = template && po ? purchaseOrderToRenderData(po, po.items || [], templateRes.company) : null

  const error = poErr
    ? 'Purchase order not found'
    : poRes && !poRes.success
    ? poRes.message || 'Purchase order not found'
    : templateErr
    ? 'Failed to load document template'
    : templateRes && !templateRes.success
    ? templateRes.error || 'Failed to load document template'
    : null
  const loading = !poRes || (po && !templateRes)

  if (error) return <div className="p-10 text-center text-red-500">{error}</div>
  if (loading || !renderData || !template) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="max-w-[1800px] mx-auto mb-4 flex justify-end print:hidden">
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
