'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, FileText, Upload, Download, Trash2, Loader2, Search, FolderOpen } from 'lucide-react'

interface HRDocument {
  _id: string
  name: string
  type: string
  employeeName: string
  fileUrl?: string
  fileSize?: number
  uploadedAt: string
  expiresAt?: string
}

const DOC_TYPES = ['Offer Letter', 'Employment Contract', 'Salary Slip', 'Experience Letter', 'ID Proof', 'Address Proof', 'Educational Certificate', 'Appraisal Letter', 'Warning Letter', 'Termination Letter', 'Other']

const TYPE_COLORS: Record<string, string> = {
  'Offer Letter': 'bg-blue-50 text-blue-700',
  'Employment Contract': 'bg-purple-50 text-purple-700',
  'Salary Slip': 'bg-green-50 text-green-700',
  'Experience Letter': 'bg-orange-50 text-orange-700',
  'ID Proof': 'bg-gray-100 text-gray-700',
  'Address Proof': 'bg-gray-100 text-gray-700',
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function HRDocumentsPage() {
  const router = useRouter()
  const [showForm, setShowForm]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [search, setSearch]           = useState('')
  const [filterType, setFilterType]   = useState('All')
  const [form, setForm] = useState({
    name: '', type: 'Offer Letter', employeeName: '', expiresAt: '',
  })

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? null

  const { data: docsData, isLoading: loading, mutate: fetchDocs } = useSWR(
    businessId ? `/api/hr/documents?businessId=${businessId}` : null
  )
  const docs: HRDocument[] = docsData?.documents ?? docsData?.data ?? []

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await fetch('/api/hr/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessId }),
      })
      setShowForm(false)
      setForm({ name: '', type: 'Offer Letter', employeeName: '', expiresAt: '' })
      if (businessId) fetchDocs()
    } catch { } finally { setSubmitting(false) }
  }

  async function deleteDoc(id: string) {
    if (!confirm('Delete this document?')) return
    try {
      await fetch(`/api/hr/documents/${id}`, { method: 'DELETE' })
      fetchDocs((current: any) => {
        if (!current) return current
        const list = current.documents ?? current.data ?? []
        const filtered = list.filter((x: HRDocument) => x._id !== id)
        return current.documents ? { ...current, documents: filtered } : { ...current, data: filtered }
      }, { revalidate: false })
    } catch { }
  }

  const allTypes = ['All', ...Array.from(new Set(docs.map(d => d.type)))]
  const filtered = docs.filter(d => {
    const matchSearch = d.name?.toLowerCase().includes(search.toLowerCase()) ||
                        d.employeeName?.toLowerCase().includes(search.toLowerCase())
    const matchType   = filterType === 'All' || d.type === filterType
    return matchSearch && matchType
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/admin/hr')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <ArrowLeft size={15} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">HR Documents</h1>
            <p className="text-sm text-gray-500">Store and manage employee documents</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800">
            <Plus size={15} /> Add Document
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            ['Total Documents', docs.length],
            ['Employees', new Set(docs.map(d => d.employeeName)).size],
            ['Expiring Soon', docs.filter(d => d.expiresAt && new Date(d.expiresAt) < new Date(Date.now() + 30 * 86400000)).length],
          ].map(([l, v]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-sm text-gray-500">{l}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{v}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or employee..."
              className="w-full border border-gray-200 bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm">
            {allTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Document Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400">No documents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(doc => (
              <div key={doc._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 group hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                    <FileText size={16} className="text-gray-500" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} download
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                        <Download size={13} />
                      </a>
                    )}
                    <button onClick={() => deleteDoc(doc._id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate mb-0.5">{doc.name}</p>
                <p className="text-xs text-gray-500 mb-2">{doc.employeeName}</p>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[doc.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {doc.type}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(doc.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                {doc.fileSize && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmt(doc.fileSize)}</p>
                )}
                {doc.expiresAt && (
                  <p className={`text-[10px] mt-1 font-medium ${new Date(doc.expiresAt) < new Date() ? 'text-red-500' : 'text-yellow-600'}`}>
                    Expires: {new Date(doc.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Document Slide-over */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-white border border-gray-200 rounded-2xl flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Add Document</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <X size={15} className="text-gray-600" />
              </button>
            </div>
            <div className="flex-1 p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Document Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. John's Employment Contract 2026"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Document Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10">
                  {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Employee Name *</label>
                <input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))}
                  placeholder="Employee name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Upload File</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-gray-300 transition cursor-pointer">
                  <Upload size={20} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium">Click to upload or drag & drop</p>
                  <p className="text-[10px] text-gray-400 mt-1">PDF, DOC, JPG up to 10MB</p>
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Expiry Date (optional)</label>
                <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200">
              <button onClick={handleSubmit} disabled={submitting || !form.name || !form.employeeName}
                className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
