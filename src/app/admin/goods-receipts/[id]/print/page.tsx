'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { goodsReceiptToRenderData } from '@/core/documentTemplates/adapters'
import type { DocumentRenderData } from '@/core/documentTemplates/renderData'

export default function GoodsReceiptPrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: receiptRes, error: receiptError } = useSWR(id ? `/api/goods-receipts/${id}` : null)
  const receipt = receiptRes?.success ? receiptRes.data : null

  const qs = receipt
    ? new URLSearchParams({
        businessId: String(receipt.businessId),
        documentType: 'GRN',
        ...(receipt.warehouseId?._id ? { warehouseId: String(receipt.warehouseId._id) } : {}),
      }).toString()
    : null
  const { data: templateRes, error: templateError, isLoading: loadingTemplate } = useSWR(
    receipt ? `/api/document-templates/resolve?${qs}` : null
  )

  const error =
    (receiptRes && !receiptRes.success && (receiptRes.message || 'Goods receipt not found')) ||
    (templateRes && !templateRes.success && (templateRes.error || 'Failed to load document template')) ||
    (receiptError && receiptError.message) ||
    (templateError && templateError.message) ||
    null

  const template = templateRes?.success ? templateRes.template : null
  const renderData: DocumentRenderData | null =
    template && receipt ? goodsReceiptToRenderData(receipt, templateRes.company) : null

  const loading = !receiptRes || (!!receipt && loadingTemplate)

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
