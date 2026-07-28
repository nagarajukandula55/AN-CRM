'use client'

import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { stockTransferToRenderData } from '@/core/documentTemplates/adapters'

export default function StockTransferPrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: transferRes, error: transferErrorObj } = useSWR(
    id ? `/api/stock/transfers/${id}` : null
  )
  const transfer = transferRes?.success ? transferRes.data : null

  const templateQs = transfer
    ? new URLSearchParams({ businessId: String(transfer.businessId), documentType: 'STOCK_TRANSFER' }).toString()
    : null
  const { data: templateRes, error: templateErrorObj, isLoading: loadingTemplate } = useSWR(
    templateQs ? `/api/document-templates/resolve?${templateQs}` : null
  )
  const template = templateRes?.success ? templateRes.template : null
  const renderData = templateRes?.success ? stockTransferToRenderData(transfer, templateRes.company) : null

  const error =
    (transferRes && !transferRes.success && (transferRes.error || 'Stock transfer not found')) ||
    (templateRes && !templateRes.success && (templateRes.error || 'Failed to load document template')) ||
    (transferErrorObj instanceof Error ? transferErrorObj.message : null) ||
    (templateErrorObj instanceof Error ? templateErrorObj.message : null) ||
    null

  const loading = !transferRes || (!!transfer && (loadingTemplate || !templateRes))

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
