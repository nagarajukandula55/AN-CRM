'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { DocumentRenderer, DocumentFooterText } from '@/core/documentTemplates/renderer'
import { salesDocumentToRenderData } from '@/core/documentTemplates/adapters'

export default function SalesDocumentPrintPage() {
  const { id } = useParams<{ id: string }>()

  const { data: docRes, error: docErr } = useSWR(`/api/sales-documents/${id}`)
  const doc = docRes?.success ? docRes.data : null

  const templateQs = doc
    ? new URLSearchParams({ businessId: String(doc.businessId), documentType: doc.docType }).toString()
    : null
  const { data: templateRes, error: templateErr } = useSWR(
    templateQs ? `/api/document-templates/resolve?${templateQs}` : null
  )
  const template = templateRes?.success ? templateRes.template : null
  const renderData = template && doc ? salesDocumentToRenderData(doc, templateRes.company) : null

  const error = docErr
    ? 'Document not found'
    : docRes && !docRes.success
    ? docRes.message || 'Document not found'
    : templateErr
    ? 'Failed to load document template'
    : templateRes && !templateRes.success
    ? templateRes.error || 'Failed to load document template'
    : null
  const loading = !docRes || (doc && !templateRes)

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
