'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { validateGSTIN } from '@/lib/validation/gst'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

/**
 * Full-page invoice creation, not a modal -- per explicit direction to
 * match the reference billing app's dedicated "Create Sales Invoice"
 * screen (Bill To + Invoice Details side by side, full-width line items,
 * Notes/Terms + Totals at the bottom) instead of the old cramped indigo/
 * gray modal dialog still on /console/sales (kept there for now so
 * nothing regresses; its "New Invoice" button now routes here instead of
 * opening it). Same submit logic/customer-directory behavior as that
 * modal, just laid out full-page with the app's actual design tokens.
 */

interface Customer {
  name: string
  email?: string
  phone?: string
  address?: string
  gstin?: string
}

interface LineItem {
  description: string
  hsnCode: string
  qty: number
  unit: string
  price: number
  taxPct: number
}

type InvoiceType = 'GST' | 'NON_GST'

const todayStr = () => new Date().toISOString().split('T')[0]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

function calcItems(items: LineItem[], invoiceType: InvoiceType, supplyType: 'INTRASTATE' | 'INTERSTATE') {
  let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, taxTotal = 0
  for (const item of items) {
    const lineAmt = (item.qty || 1) * (item.price || 0)
    const taxAmt = lineAmt * ((item.taxPct || 0) / 100)
    subtotal += lineAmt
    if (invoiceType === 'GST' && supplyType === 'INTERSTATE') igstTotal += taxAmt
    else if (invoiceType === 'GST') { cgstTotal += taxAmt / 2; sgstTotal += taxAmt / 2 }
    else taxTotal += taxAmt
  }
  const tax = invoiceType === 'GST' ? cgstTotal + sgstTotal + igstTotal : taxTotal
  return { subtotal, cgstTotal, sgstTotal, igstTotal, taxTotal, grandTotal: subtotal + tax }
}

const inputCls = "w-full bg-surface border border-border rounded-control px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
const labelCls = "block text-xs font-medium text-ink-2 mb-1"

export default function NewSalesInvoicePage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('GST')
  const [supplyType, setSupplyType] = useState<'INTRASTATE' | 'INTERSTATE'>('INTRASTATE')
  const [customer, setCustomer] = useState<Customer>({ name: '', email: '', phone: '', address: '', gstin: '' })
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Payment due within 30 days.')
  const [issueDate, setIssueDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState<LineItem[]>([
    { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: 18 },
  ])

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.activeBusinessId ?? meData?.user?.activeBusinessId ?? null

  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCustomerResults, setShowCustomerResults] = useState(false)
  const { data: customerSearchData } = useSWR(
    businessId && customerQuery.trim().length >= 3 ? `/api/customers?businessId=${businessId}&search=${encodeURIComponent(customerQuery.trim())}` : null
  )
  const customerResults: Array<{ _id: string; name: string; phone?: string; email?: string; address?: string }> =
    customerSearchData?.success !== false ? (customerSearchData?.customers ?? []) : []

  function selectCustomer(c: { _id: string; name: string; phone?: string; email?: string; address?: string }) {
    setCustomer(p => ({ ...p, name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || p.address }))
    setSelectedCustomerId(c._id)
    setShowCustomerResults(false)
  }

  function addItem() {
    setItems(p => [...p, { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: invoiceType === 'GST' ? 18 : 0 }])
  }
  function removeItem(i: number) {
    setItems(p => p.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const calc = calcItems(items, invoiceType, supplyType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer.name.trim()) { setFormError('Customer name is required'); return }
    if (customer.gstin?.trim()) {
      const result = validateGSTIN(customer.gstin)
      if (!result.valid) { setFormError(`Customer GSTIN: ${result.reason}`); return }
    }
    setSubmitting(true); setFormError(null)
    try {
      const payload: Record<string, unknown> = {
        businessId,
        customer,
        invoiceType,
        items: items.map(it => ({
          description: it.description, hsnCode: it.hsnCode, quantity: it.qty,
          unit: it.unit, unitPrice: it.price, taxRate: it.taxPct,
        })),
        discountAmount: discount,
        notes, terms,
        issueDate: issueDate || todayStr(),
        dueDate: dueDate || undefined,
        status: 'DRAFT',
        supplyType: invoiceType === 'GST' ? supplyType : 'INTERSTATE',
      }
      const res = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? d.message ?? 'Failed to create invoice')
      }
      if (!selectedCustomerId && customer.name.trim()) {
        fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, source: 'sales_invoice' }),
        }).catch(() => {})
      }
      router.push('/console/sales')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="New Invoice"
        description={invoiceType === 'GST' ? 'Compliant with Indian GST regulations' : 'Simple invoice without GST'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => router.push('/console/sales')} icon={<ArrowLeft className="w-4 h-4" />}>Cancel</Button>
            <Button type="submit" form="new-invoice-form" size="sm" disabled={submitting} icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Create Invoice</Button>
          </>
        }
      />

      <form id="new-invoice-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{formError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Invoice Type</h3>
            <div className="flex gap-2">
              {(['GST', 'NON_GST'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => {
                    setInvoiceType(t)
                    setItems(p => p.map(it => ({ ...it, taxPct: t === 'NON_GST' ? 0 : 18 })))
                  }}
                  className={`flex-1 py-2 rounded-control text-sm font-medium border transition ${
                    invoiceType === t ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-2 border-border hover:border-accent'
                  }`}>
                  {t === 'GST' ? 'GST Invoice' : 'Non-GST Invoice'}
                </button>
              ))}
            </div>
            {invoiceType === 'GST' && (
              <div className="flex gap-2">
                {(['INTRASTATE', 'INTERSTATE'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSupplyType(t)}
                    className={`flex-1 py-2 rounded-control text-sm font-medium border transition ${
                      supplyType === t ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-2 border-border hover:border-accent'
                    }`}>
                    {t === 'INTRASTATE' ? 'Intrastate (CGST + SGST)' : 'Interstate (IGST)'}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Issue Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Bill To</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative">
              <label className={labelCls}>Company / Customer Name *</label>
              <input required value={customer.name}
                onChange={e => { setCustomer(p => ({ ...p, name: e.target.value })); setCustomerQuery(e.target.value); setSelectedCustomerId(null); setShowCustomerResults(true) }}
                onFocus={() => setShowCustomerResults(true)}
                onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                className={inputCls} placeholder="Acme Pvt Ltd, or search by name/phone" />
              {showCustomerResults && customerResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-control shadow-card-lg max-h-56 overflow-y-auto">
                  {customerResults.map(c => (
                    <button type="button" key={c._id} onMouseDown={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 border-b border-border last:border-0">
                      <p className="text-ink font-medium">{c.name}</p>
                      <p className="text-ink-3 text-xs">{c.phone || '—'}{c.email ? ` · ${c.email}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomerId && <p className="text-[11px] text-success mt-1">Existing customer — details prefilled from directory.</p>}
            </div>
            {invoiceType === 'GST' && (
              <div>
                <label className={labelCls}>GSTIN</label>
                <input value={customer.gstin} onChange={e => setCustomer(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} className={`${inputCls} font-mono`} placeholder="22AAAAA0000A1Z5" />
              </div>
            )}
            <div>
              <label className={labelCls}>Phone</label>
              <input value={customer.phone}
                onChange={e => { setCustomer(p => ({ ...p, phone: e.target.value })); setCustomerQuery(e.target.value); setSelectedCustomerId(null); setShowCustomerResults(true) }}
                onFocus={() => setShowCustomerResults(true)}
                onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                className={inputCls} placeholder="+91 98765 43210 — search existing" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={customer.email} onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="billing@acme.com" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Billing Address</label>
              <input value={customer.address} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} className={inputCls} placeholder="Street, City, State - PIN" />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Line Items</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addItem} icon={<Plus className="w-4 h-4" />}>Add Item</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <th className="text-left px-5 py-2 text-xs text-ink-3 font-medium">Description</th>
                <th className="text-left px-2 py-2 text-xs text-ink-3 font-medium w-24">HSN</th>
                <th className="text-center px-2 py-2 text-xs text-ink-3 font-medium w-16">Qty</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-24">Rate</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-20">Tax %</th>
                <th className="text-right px-5 py-2 text-xs text-ink-3 font-medium w-28">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="px-5 py-1.5"><input required value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} className={`${inputCls} py-1.5`} placeholder="Item / service name" /></td>
                  <td className="px-2 py-1.5"><input value={item.hsnCode} onChange={e => updateItem(i, 'hsnCode', e.target.value)} className={`${inputCls} py-1.5`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className={`${inputCls} py-1.5 text-center`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} className={`${inputCls} py-1.5 text-right`} /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} value={item.taxPct} onChange={e => updateItem(i, 'taxPct', Number(e.target.value))} className={`${inputCls} py-1.5 text-right`} /></td>
                  <td className="px-5 py-1.5 text-right tabular text-ink font-medium text-xs">{fmt((item.qty || 0) * (item.price || 0) * (1 + (item.taxPct || 0) / 100))}</td>
                  <td className="px-2 py-1.5">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-ink-3 hover:text-danger"><Trash2 className="w-4 h-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} placeholder="Any notes for this invoice" />
            </div>
            <div>
              <label className={labelCls}>Terms &amp; Conditions</label>
              <textarea rows={3} value={terms} onChange={e => setTerms(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-3">Subtotal</span><span className="tabular text-ink">{fmt(calc.subtotal)}</span></div>
              {invoiceType === 'GST' && supplyType === 'INTRASTATE' && (
                <>
                  <div className="flex justify-between"><span className="text-ink-3">CGST</span><span className="tabular text-ink">{fmt(calc.cgstTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-3">SGST</span><span className="tabular text-ink">{fmt(calc.sgstTotal)}</span></div>
                </>
              )}
              {invoiceType === 'GST' && supplyType === 'INTERSTATE' && (
                <div className="flex justify-between"><span className="text-ink-3">IGST</span><span className="tabular text-ink">{fmt(calc.igstTotal)}</span></div>
              )}
              {invoiceType === 'NON_GST' && (
                <div className="flex justify-between"><span className="text-ink-3">Tax</span><span className="tabular text-ink">{fmt(calc.taxTotal)}</span></div>
              )}
              <div>
                <label className={labelCls}>Discount</label>
                <input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} className={inputCls} />
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
                <span className="text-ink">Grand Total</span>
                <span className="tabular text-ink">{fmt(calc.grandTotal - (discount || 0))}</span>
              </div>
            </div>
          </Card>
        </div>
      </form>
    </div>
  )
}
