'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { productionOrderToRenderData } from '@/core/documentTemplates/adapters'

export default function ProductionOrderPrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: orderData, error: orderError } = useSWR(id ? `/api/production/orders/${id}` : null)
  const order = orderData && orderData.success ? (orderData.data ?? orderData.order) : null
  const orderErrMsg = orderError ? orderError.message : (orderData && !orderData.success ? (orderData.error || 'Production order not found') : null)

  const templateKey = order
    ? `/api/document-templates/resolve?${new URLSearchParams({ businessId: String(order.businessId), documentType: 'PRODUCTION_ORDER' }).toString()}`
    : null
  const { data: templateResp, error: templateError, isLoading: templateLoading } = useSWR(templateKey)

  const error = orderErrMsg || (templateError ? templateError.message : (templateResp && !templateResp.success ? (templateResp.error || 'Failed to load document template') : null))
  const template = templateResp && templateResp.success ? templateResp.template : null
  const renderData = templateResp && templateResp.success ? productionOrderToRenderData(order, templateResp.company) : null
  const loading = !orderData || (!!order && templateLoading)

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
