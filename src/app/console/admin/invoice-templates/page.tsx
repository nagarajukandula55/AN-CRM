'use client'

import { useEffect, useState, Suspense } from 'react'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { FileText, Save, Star, Trash2, Eye } from 'lucide-react'

/**
 * Invoice Templates — src/app/console/invoice-templates.
 *
 * Built per explicit user request: "make multiple invoice templates that
 * we can edit," pointing at app/invoice/[invoiceNumber]/page.tsx (the
 * ecommerce order-invoice page) as the reference. Scope, per the user's
 * own choice: pick from a fixed set of pre-built LAYOUTS (see
 * core/invoiceTemplates/registry.ts — Classic GST / Minimal / Modern
 * Color-block) and customize branding (logo, accent color, tagline) and
 * text (footer note, declaration, terms, signature) on top — not a
 * freeform drag-and-drop layout editor.
 */

interface Layout { key: string; label: string; description: string }
interface Template {
  _id: string
  layoutKey: string
  name: string
  isDefault: boolean
  branding: { logoUrl?: string; accentColor?: string; tagline?: string }
  text: {
    footerNote?: string
    declaration?: string
    termsAndConditions?: string
    showSignature?: boolean
    signatureImageUrl?: string
    signatoryLabel?: string
  }
}

const emptyForm = {
  layoutKey: 'classic-gst',
  name: '',
  isDefault: false,
  logoUrl: '',
  accentColor: '#111827',
  tagline: '',
  footerNote: 'This is a computer generated GST invoice.',
  declaration: 'Certified that the particulars given above are true and correct. This invoice is generated electronically and does not require a physical signature.',
  termsAndConditions: '',
  showSignature: true,
  signatureImageUrl: '',
  signatoryLabel: 'Authorized Signatory',
}

export default function InvoiceTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <InvoiceTemplatesPageInner />
    </Suspense>
  )
}

function InvoiceTemplatesPageInner() {
  // ?businessId=... lets Admin > Business > [id]'s "Document Templates"
  // section deep-link straight into managing THAT business's invoice
  // templates, instead of always defaulting to the logged-in admin's own
  // active business.
  const searchParams = useSearchParams()
  const businessIdParam = searchParams.get('businessId')
  const [businessId, setBusinessId] = useState<string | null>(businessIdParam)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [previewHtml, setPreviewHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const { data: meRes } = useSWR(businessIdParam ? null : '/api/auth/me')
  useEffect(() => {
    if (businessIdParam || !meRes?.success) return
    const found = meRes.businesses?.find((b: any) => b._id === meRes.user?.activeBusinessId) || meRes.businesses?.[0]
    if (found) setBusinessId(found._id)
  }, [businessIdParam, meRes])

  const { data: templatesRes, mutate: load } = useSWR(
    businessId ? `/api/invoice-templates?businessId=${businessId}` : null
  )
  const layouts: Layout[] = templatesRes?.success ? templatesRes.layouts || [] : []
  const templates: Template[] = templatesRes?.success ? templatesRes.data || [] : []

  useEffect(() => { loadPreview() }, [form.layoutKey, form.accentColor, form.tagline, form.logoUrl, form.footerNote, form.declaration, form.termsAndConditions, form.showSignature, form.signatoryLabel])

  async function loadPreview() {
    try {
      const res = await fetch('/api/invoice-templates/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          layoutKey: form.layoutKey,
          branding: { logoUrl: form.logoUrl, accentColor: form.accentColor, tagline: form.tagline },
          text: {
            footerNote: form.footerNote,
            declaration: form.declaration,
            termsAndConditions: form.termsAndConditions,
            showSignature: form.showSignature,
            signatureImageUrl: form.signatureImageUrl,
            signatoryLabel: form.signatoryLabel,
          },
        }),
      })
      const html = await res.text()
      setPreviewHtml(html)
    } catch {}
  }

  function loadIntoForm(t: Template) {
    setEditingId(t._id)
    setForm({
      layoutKey: t.layoutKey,
      name: t.name,
      isDefault: t.isDefault,
      logoUrl: t.branding?.logoUrl || '',
      accentColor: t.branding?.accentColor || '#111827',
      tagline: t.branding?.tagline || '',
      footerNote: t.text?.footerNote || emptyForm.footerNote,
      declaration: t.text?.declaration || emptyForm.declaration,
      termsAndConditions: t.text?.termsAndConditions || '',
      showSignature: t.text?.showSignature !== false,
      signatureImageUrl: t.text?.signatureImageUrl || '',
      signatoryLabel: t.text?.signatoryLabel || 'Authorized Signatory',
    })
  }

  function newTemplate() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    if (!businessId || !form.name) { setMsg('Give this template a name.'); return }
    setSaving(true)
    setMsg('')
    const body = {
      businessId,
      layoutKey: form.layoutKey,
      name: form.name,
      isDefault: form.isDefault,
      branding: { logoUrl: form.logoUrl, accentColor: form.accentColor, tagline: form.tagline },
      text: {
        footerNote: form.footerNote,
        declaration: form.declaration,
        termsAndConditions: form.termsAndConditions,
        showSignature: form.showSignature,
        signatureImageUrl: form.signatureImageUrl,
        signatoryLabel: form.signatoryLabel,
      },
    }
    try {
      const res = await fetch(editingId ? `/api/invoice-templates/${editingId}` : '/api/invoice-templates', {
        method: editingId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      setMsg(d.success ? 'Saved.' : d.error || 'Failed to save')
      if (d.success) { load(); if (!editingId) setEditingId(d.data._id) }
    } catch {
      setMsg('Failed to save')
    }
    setSaving(false)
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/invoice-templates/${id}`, { method: 'DELETE', credentials: 'include' })
      load()
      if (editingId === id) newTemplate()
    } catch {}
  }

  return (
      <div className="space-y-8">
        <section className="rounded-[40px] border border-white/10 bg-surface/5 p-10">
          <p className="uppercase tracking-[0.35em] text-cyan-300 text-sm">DOCUMENTS</p>
          <h1 className="mt-5 text-6xl font-black flex items-center gap-4">
            <FileText className="h-12 w-12" /> Invoice Templates
          </h1>
          <p className="mt-4 max-w-2xl text-white/60">
            Pick a layout, brand it with your logo and colors, and customize the footer/declaration text. Set one as default — that's what customers see on new invoices.
          </p>
        </section>

        {msg && <div className="rounded-card border border-white/10 bg-surface/5 px-6 py-3 text-sm">{msg}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_1fr] gap-6">
          {/* Saved templates list */}
          <section className="rounded-[32px] border border-white/10 bg-surface/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Saved Templates</h2>
              <button onClick={newTemplate} className="text-sm text-cyan-300 hover:text-cyan-200">+ New</button>
            </div>
            <div className="space-y-2">
              {templates.map((t: Template) => (
                <div
                  key={t._id}
                  onClick={() => loadIntoForm(t)}
                  className={`cursor-pointer rounded-card border px-4 py-3 text-sm ${editingId === t._id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-black/20 hover:border-white/30'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.name}</span>
                    <div className="flex items-center gap-2">
                      {t.isDefault && <Star className="h-4 w-4 text-warning fill-amber-300" />}
                      <Trash2
                        className="h-4 w-4 text-white/30 hover:text-danger"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); remove(t._id) }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-white/40 mt-1">{layouts.find((l: Layout) => l.key === t.layoutKey)?.label || t.layoutKey}</div>
                </div>
              ))}
              {templates.length === 0 && <p className="text-sm text-white/40">No saved templates yet — create one.</p>}
            </div>
          </section>

          {/* Editor form */}
          <section className="rounded-[32px] border border-white/10 bg-surface/5 p-6 space-y-4">
            <h2 className="text-lg font-bold">Editor</h2>

            <div>
              <label className="text-sm text-white/60">Template Name</label>
              <input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" placeholder="e.g. Default, Festive Sale" />
            </div>

            <div>
              <label className="text-sm text-white/60">Layout</label>
              <select value={form.layoutKey} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, layoutKey: e.target.value })}
                className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5">
                {(layouts.length ? layouts : [
                  { key: 'classic-gst', label: 'Classic GST', description: '' },
                  { key: 'minimal', label: 'Minimal', description: '' },
                  { key: 'modern-colorblock', label: 'Modern Color-block', description: '' },
                ]).map((l: Layout) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-white/40 mt-1">{layouts.find((l: Layout) => l.key === form.layoutKey)?.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-white/60">Logo URL</label>
                <input value={form.logoUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, logoUrl: e.target.value })}
                  className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Accent Color</label>
                <input type="color" value={form.accentColor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, accentColor: e.target.value })}
                  className="mt-1 w-full h-[42px] rounded-card border border-white/10 bg-black/30 px-2" />
              </div>
            </div>

            <div>
              <label className="text-sm text-white/60">Tagline</label>
              <input value={form.tagline} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, tagline: e.target.value })}
                className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
            </div>

            <div>
              <label className="text-sm text-white/60">Footer Note</label>
              <input value={form.footerNote} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, footerNote: e.target.value })}
                className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
            </div>

            <div>
              <label className="text-sm text-white/60">Declaration</label>
              <textarea value={form.declaration} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, declaration: e.target.value })}
                rows={3} className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
            </div>

            <div>
              <label className="text-sm text-white/60">Terms &amp; Conditions (optional)</label>
              <textarea value={form.termsAndConditions} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, termsAndConditions: e.target.value })}
                rows={2} className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.showSignature} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, showSignature: e.target.checked })} />
              Show signature block
            </label>

            {form.showSignature && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/60">Signature Image URL</label>
                  <input value={form.signatureImageUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, signatureImageUrl: e.target.value })}
                    className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
                </div>
                <div>
                  <label className="text-sm text-white/60">Signatory Label</label>
                  <input value={form.signatoryLabel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, signatoryLabel: e.target.value })}
                    className="mt-1 w-full rounded-card border border-white/10 bg-black/30 px-4 py-2.5" />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, isDefault: e.target.checked })} />
              Set as default (used on all new invoices)
            </label>

            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 rounded-full bg-cyan-400 px-6 py-2.5 font-semibold text-black disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : editingId ? 'Update Template' : 'Save Template'}
            </button>
          </section>

          {/* Live preview */}
          <section className="rounded-[32px] border border-white/10 bg-surface/5 p-6 flex flex-col">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Eye className="h-5 w-5" /> Live Preview</h2>
            <div className="flex-1 rounded-card overflow-hidden bg-surface min-h-[600px]">
              <iframe srcDoc={previewHtml} className="w-full h-full min-h-[600px] border-0" title="Invoice preview" />
            </div>
          </section>
        </div>
      </div>
  )
}
